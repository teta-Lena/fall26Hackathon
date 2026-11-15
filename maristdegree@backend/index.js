import e from "express";
import cors from "cors";
import "dotenv/config";
import { createContextClient } from "@supabase/server/core";
import {
  supabaseAnon,
  requireUser,
  requireAdvisor,
} from "./superbaseclient.js";
import {
  studentKeywords,
  rankPathways,
  suggestClasses,
  buildTracker,
} from "./recommend.js";

const app = e();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(e.json());

app.get("/", (req, res) => {
  res.json({ message: "Server up and running" });
});

// Login only. Accounts already exist (created by the school, or by seed.js).
// Returns the session tokens plus the user's profile, which includes their role.
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const supabase = supabaseAnon();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error)
    return res.status(401).json({ error: "Invalid email or password" });

  // Read the profile as the newly signed-in user, so RLS applies.
  const userClient = createContextClient({
    auth: { token: data.session.access_token },
  });
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", data.user.id)
    .single();
  if (profileError)
    return res.status(500).json({ error: profileError.message });

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    profile,
  });
});

// The signed-in user's own profile.
app.get("/me", requireUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("id", req.user.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Update your own name. The database only lets users change full_name.
app.patch("/me", requireUser, async (req, res) => {
  const { full_name } = req.body ?? {};
  if (typeof full_name !== "string" || !full_name.trim()) {
    return res.status(400).json({ error: "full_name is required" });
  }
  const { data, error } = await req.supabase
    .from("profiles")
    .update({ full_name: full_name.trim() })
    .eq("id", req.user.id)
    .select("id, email, full_name, role")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Advisor portal: list all students. RLS also enforces this, because only
// advisors can read profiles other than their own.
app.get("/advisor/students", requireUser, requireAdvisor, async (req, res) => {
  const { data, error } = await req.supabase
    .from("profiles")
    .select("id, email, full_name, created_at")
    .eq("role", "student")
    .order("full_name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---------- Student: plan, dashboard, pathway ----------

const PACES = ["easy", "medium", "hard"];
const GOALS = [
  "Job",
  "Grad School",
  "Research",
  "Entrepreneur",
  "Not sure yet",
];

// The caller's profile, saved plan (null before setup) and major requirements.
async function loadStudent(supabase, userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, major_slug, pathway_id")
    .eq("id", userId)
    .single();
  if (error) throw error;

  const [{ data: plan, error: planError }, { data: major, error: majorError }] =
    await Promise.all([
      supabase
        .from("student_plans")
        .select("*")
        .eq("student_id", userId)
        .maybeSingle(),
      profile.major_slug
        ? supabase
            .from("majors")
            .select("slug, name, requirements")
            .eq("slug", profile.major_slug)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (planError) throw planError;
  if (majorError) throw majorError;
  return { profile, plan, major };
}

// Everything the profile setup page needs to pre-fill itself.
app.get("/student/plan", requireUser, async (req, res) => {
  try {
    res.json(await loadStudent(req.supabase, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save the profile setup page.
app.put("/student/plan", requireUser, async (req, res) => {
  const {
    interests = "",
    career = "",
    goals = [],
    pace,
    completed_courses = [],
  } = req.body ?? {};
  if (!PACES.includes(pace)) {
    return res.status(400).json({ error: "Pick a pace: easy, medium or hard" });
  }
  if (
    !Array.isArray(goals) ||
    !goals.length ||
    goals.some((g) => !GOALS.includes(g))
  ) {
    return res
      .status(400)
      .json({ error: "Pick at least one plan after graduation" });
  }
  if (
    !Array.isArray(completed_courses) ||
    completed_courses.some((c) => typeof c !== "string")
  ) {
    return res
      .status(400)
      .json({ error: "completed_courses must be a list of course codes" });
  }

  const { data, error } = await req.supabase
    .from("student_plans")
    .upsert({
      student_id: req.user.id,
      interests: String(interests).slice(0, 500),
      career: String(career).slice(0, 200),
      goals,
      pace,
      completed_courses,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Dashboard: suggested pathway, suggested classes, tracker and notices.
app.get("/student/dashboard", requireUser, async (req, res) => {
  try {
    const { profile, plan, major } = await loadStudent(
      req.supabase,
      req.user.id,
    );
    if (!plan) return res.json({ profile, needsSetup: true });

    const [{ data: pathways, error: pErr }, { data: notices, error: nErr }] =
      await Promise.all([
        req.supabase
          .from("pathways")
          .select("id, slug, name, description, tags"),
        req.supabase
          .from("notices")
          .select("id, source, title, body, created_at, student_id")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
    if (pErr) throw pErr;
    if (nErr) throw nErr;

    const keywords = studentKeywords(plan, profile.major_slug);
    const ranked = rankPathways(pathways, keywords);

    res.json({
      profile,
      plan,
      major: major && { slug: major.slug, name: major.name },
      declaredPathway:
        pathways.find((p) => p.id === profile.pathway_id) ?? null,
      suggestedPathways: ranked.slice(0, 3),
      suggestedClasses: major
        ? suggestClasses(
            major.requirements,
            plan.completed_courses,
            plan.pace,
            keywords,
          )
        : null,
      tracker: major
        ? buildTracker(
            major.requirements,
            plan.completed_courses,
            plan.pace,
            keywords,
          )
        : null,
      notices,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Declare a pathway. Students can change only pathway_id on their profile.
app.post("/student/pathway", requireUser, async (req, res) => {
  const pathwayId = Number(req.body?.pathway_id);
  if (!Number.isInteger(pathwayId)) {
    return res.status(400).json({ error: "pathway_id is required" });
  }
  const { data, error } = await req.supabase
    .from("profiles")
    .update({ pathway_id: pathwayId })
    .eq("id", req.user.id)
    .select("id, pathway_id")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---------- Advisor: notices ----------

// Send a notice to one student, or to every student when student_id is empty.
app.post("/advisor/notices", requireUser, requireAdvisor, async (req, res) => {
  const { title, body = "", student_id = null } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  const { data, error } = await req.supabase
    .from("notices")
    .insert({
      source: "advisor",
      title: title.trim().slice(0, 200),
      body: String(body).slice(0, 2000),
      student_id: student_id || null,
      author_id: req.user.id,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.listen(PORT, () => {
  console.log(`Server running at localhost:${PORT}`);
});
