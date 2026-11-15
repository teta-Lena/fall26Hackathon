// The browser talks to Supabase directly. Row-level security in the database
// decides what each signed-in user can read or change, so no custom server is needed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

// Small helper: build an element with text (textContent, so data is never run as HTML).
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// ---------- data access ----------

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, pathway_id, major:majors(name, requirements)")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

async function getPathways() {
  const { data, error } = await supabase
    .from("pathways")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data;
}

async function getPathwayDetail(pathwayId) {
  const [courses, rules] = await Promise.all([
    supabase
      .from("pathway_courses")
      .select("category, note, course:courses(code, title)")
      .eq("pathway_id", pathwayId)
      .order("category")
      .order("course_code"),
    supabase
      .from("pathway_rules")
      .select("category, max_courses, description")
      .eq("pathway_id", pathwayId),
  ]);
  if (courses.error) throw courses.error;
  if (rules.error) throw rules.error;
  return { courses: courses.data, rules: rules.data };
}

async function savePathway(userId, pathwayId) {
  const { error } = await supabase
    .from("profiles")
    .update({ pathway_id: pathwayId })
    .eq("id", userId);
  if (error) throw error;
}

async function getStudents() {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, email, major:majors(name), pathway:pathways(name)")
    .eq("role", "student")
    .order("full_name");
  if (error) throw error;
  return data;
}

// ---------- rendering ----------

function courseItem(c) {
  const li = el("li");
  li.append(el("span", c.code, "code"), ` ${c.title}`);
  if (c.credits != null) li.append(el("span", ` (${c.credits} cr)`, "credits"));
  if (c.note) li.append(el("span", ` · ${c.note}`, "note"));
  return li;
}

function renderMajor(major) {
  $("major-title").textContent = major
    ? `${major.name} requirements`
    : "No major assigned";
  const box = $("major-sections");
  box.replaceChildren();
  if (!major) return;

  const req = major.requirements;
  $("major-totals").textContent = [
    req.total_major_credits && `Major: ${req.total_major_credits} credits`,
    req.graduation_credits && `Graduation: ${req.graduation_credits} credits`,
  ]
    .filter(Boolean)
    .join(" · ");

  for (const section of req.sections) {
    const h = el("h3", section.title);
    if (section.credits) h.append(" ", el("small", `${section.credits} cr`));
    box.append(h);
    if (section.note) box.append(el("p", section.note, "muted"));

    const list = el("ul");
    for (const item of section.items) {
      if (item.code) {
        list.append(courseItem(item));
      } else if (item.choose) {
        const li = el("li");
        li.append(el("div", item.choose, "choose"));
        const options = el("ul");
        item.options.forEach((o) => options.append(courseItem(o)));
        li.append(options);
        list.append(li);
      } else {
        const li = el("li", item.text);
        if (item.credits)
          li.append(el("span", ` (${item.credits} cr)`, "credits"));
        list.append(li);
      }
    }
    if (list.children.length) box.append(list);
  }
}

async function renderPathway(pathwayId) {
  const box = $("pathway-courses");
  box.replaceChildren();
  if (!pathwayId) return;

  const { courses, rules } = await getPathwayDetail(pathwayId);

  // Group courses by category, and collect that category's rules.
  const categories = new Map();
  for (const row of courses) {
    if (!categories.has(row.category)) categories.set(row.category, []);
    categories.get(row.category).push({ ...row.course, note: row.note });
  }
  for (const rule of rules) {
    if (!categories.has(rule.category)) categories.set(rule.category, []);
  }

  for (const [category, list] of categories) {
    const catRules = rules.filter((r) => r.category === category);
    const cap = catRules.find((r) => r.max_courses);
    const h = el("h3", category);
    if (cap) h.append(" ", el("small", `maximum ${cap.max_courses}`));
    box.append(h);

    const ul = el("ul");
    list.forEach((c) => ul.append(courseItem(c)));
    catRules
      .filter((r) => !r.max_courses)
      .forEach((r) => ul.append(el("li", r.description)));
    box.append(ul);
  }
}

async function showStudent(profile) {
  renderMajor(profile.major);

  const select = $("pathway-select");
  select.replaceChildren(new Option("Select a pathway…", ""));
  for (const p of await getPathways()) select.add(new Option(p.name, p.id));
  select.value = profile.pathway_id ?? "";
  await renderPathway(profile.pathway_id);

  select.onchange = async () => {
    const pathwayId = select.value ? Number(select.value) : null;
    $("pathway-status").textContent = "Saving…";
    try {
      await savePathway(profile.id, pathwayId);
      await renderPathway(pathwayId);
      $("pathway-status").textContent = pathwayId
        ? "Pathway saved."
        : "Pathway cleared.";
    } catch (err) {
      $("pathway-status").textContent = `Could not save: ${err.message}`;
    }
  };

  $("student").hidden = false;
}

async function showAdvisor() {
  const body = $("students");
  body.replaceChildren();
  for (const s of await getStudents()) {
    const tr = el("tr");
    tr.append(
      el("td", s.full_name),
      el("td", s.email),
      el("td", s.major?.name ?? "—"),
      el("td", s.pathway?.name ?? "Not chosen yet"),
    );
    body.append(tr);
  }
  $("advisor").hidden = false;
}

// ---------- session ----------

async function render() {
  ["login", "student", "advisor", "who"].forEach((id) => {
    $(id).hidden = true;
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    $("login").hidden = false;
    return;
  }

  try {
    const profile = await getProfile(session.user.id);
    $("who-name").textContent = `${profile.full_name} (${profile.role})`;
    $("who").hidden = false;
    if (profile.role === "advisor") await showAdvisor();
    else await showStudent(profile);
  } catch (err) {
    $("login").hidden = false;
    $("login-error").textContent =
      `Could not load your profile: ${err.message}`;
  }
}

$("login").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("login-error").textContent = "";
  const { error } = await supabase.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value,
  });
  if (error) $("login-error").textContent = error.message;
  else {
    $("password").value = "";
    await render();
  }
});

$("logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  await render();
});

render();
