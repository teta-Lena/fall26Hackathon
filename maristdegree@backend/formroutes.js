// Registrar forms: the Pathway Declaration Request Form.
//
// Flow:
// 1. Student declares a pathway -> the form is filled in right away with
//    their info and e-signature, status 'pending_advisor'.
// 2. Their advisor signs it in the advisor portal -> the signed PDF is emailed
//    to the registrar (REGISTRAR_EMAIL), status 'sent_to_registrar', and the
//    student gets a notice.
//
// Forms are written with the admin client after the caller is checked, so
// nobody can create or sign a form with made-up data via the public API.
import { requireUser, requireAdvisor, supabaseAdmin } from "./superbaseclient.js";
import { fillPathwayDeclaration, formDate } from "./pdfforms.js";
import { sendMail } from "./mailer.js";

const FORM_COLUMNS =
  "id, form_type, status, data, created_at, advisor_signed_at, sent_at, email_error";

const signature = (name) => `/s/ ${name}`;

// Latest active pathway form for a student, read through RLS.
export async function latestPathwayForm(supabase, studentId) {
  const { data, error } = await supabase
    .from("form_submissions")
    .select(FORM_COLUMNS)
    .eq("student_id", studentId)
    .eq("form_type", "pathway_declaration")
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Fills in a new Pathway Declaration for this student. An unsigned earlier
// form is withdrawn, so the advisor only ever sees the latest choice.
async function createPathwayForm(student, pathway) {
  const admin = supabaseAdmin();

  // "Change of Declaration" only if a declaration already reached the registrar.
  const { count, error: countError } = await admin
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student.id)
    .eq("form_type", "pathway_declaration")
    .eq("status", "sent_to_registrar");
  if (countError) throw countError;

  const { data: major, error: majorError } = student.major_slug
    ? await admin.from("majors").select("name").eq("slug", student.major_slug).maybeSingle()
    : { data: null, error: null };
  if (majorError) throw majorError;

  const { error: withdrawError } = await admin
    .from("form_submissions")
    .update({ status: "withdrawn" })
    .eq("student_id", student.id)
    .eq("form_type", "pathway_declaration")
    .eq("status", "pending_advisor");
  if (withdrawError) throw withdrawError;

  const today = formDate();
  const name = student.full_name || student.email;
  const { data, error } = await admin
    .from("form_submissions")
    .insert({
      form_type: "pathway_declaration",
      student_id: student.id,
      advisor_id: student.advisor_id,
      data: {
        student_name: name,
        cwid: student.cwid ?? "",
        major: major?.name ?? "Undecided",
        date: today,
        declaration: count > 0 ? "change" : "initial",
        pathway: pathway.form_value ?? pathway.name,
        pathway_name: pathway.name,
        student_signature: signature(name),
        student_signed_date: today,
      },
    })
    .select(FORM_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

function pdfFilename(form) {
  const who = (form.data.student_name || "student").replace(/[^a-z0-9]+/gi, "_");
  return `Pathway_Declaration_${who}.pdf`;
}

export function registerFormRoutes(app) {
  // Declare a pathway: saves it on the profile and fills in the form.
  app.post("/student/pathway", requireUser, async (req, res) => {
    const pathwayId = Number(req.body?.pathway_id);
    if (!Number.isInteger(pathwayId)) {
      return res.status(400).json({ error: "pathway_id is required" });
    }
    try {
      const { data: student, error } = await req.supabase
        .from("profiles")
        .select("id, email, full_name, role, cwid, major_slug, pathway_id, advisor_id")
        .eq("id", req.user.id)
        .single();
      if (error) throw error;
      if (student.role !== "student") {
        return res.status(403).json({ error: "Only students declare a pathway" });
      }

      const { data: pathway, error: pathwayError } = await req.supabase
        .from("pathways")
        .select("id, name, form_value")
        .eq("id", pathwayId)
        .maybeSingle();
      if (pathwayError) throw pathwayError;
      if (!pathway) return res.status(400).json({ error: "Unknown pathway" });

      // Same pathway again: keep the existing form instead of a duplicate.
      const existing = await latestPathwayForm(req.supabase, student.id);
      if (student.pathway_id === pathwayId && existing) {
        return res.json({ pathway_id: pathwayId, form: existing });
      }

      // RLS + column grants: students may only change their own pathway_id.
      const { error: updateError } = await req.supabase
        .from("profiles")
        .update({ pathway_id: pathwayId })
        .eq("id", student.id);
      if (updateError) throw updateError;

      const form = await createPathwayForm(student, pathway);
      res.json({ pathway_id: pathwayId, form });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Forms for the advisor portal: ones assigned to this advisor, or to no one.
  app.get("/advisor/forms", requireUser, requireAdvisor, async (req, res) => {
    const { data, error } = await req.supabase
      .from("form_submissions")
      .select(`${FORM_COLUMNS}, advisor_id, student:profiles!student_id(id, full_name, email)`)
      .neq("status", "withdrawn")
      .or(`advisor_id.is.null,advisor_id.eq.${req.user.id}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // Advisor signs the form; the signed PDF is emailed to the registrar.
  app.post("/advisor/forms/:id/sign", requireUser, requireAdvisor, async (req, res) => {
    const admin = supabaseAdmin();
    const registrar = process.env.REGISTRAR_EMAIL;
    if (!registrar) {
      return res.status(500).json({ error: "REGISTRAR_EMAIL is not set in the backend .env" });
    }

    const { data: form, error } = await admin
      .from("form_submissions")
      .select(`${FORM_COLUMNS}, advisor_id, student_id`)
      .eq("id", Number(req.params.id))
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!form) return res.status(404).json({ error: "Form not found" });
    if (form.advisor_id && form.advisor_id !== req.user.id) {
      return res.status(403).json({ error: "This student has a different primary advisor" });
    }
    if (form.status !== "pending_advisor") {
      return res.status(409).json({ error: `Form is already ${form.status.replaceAll("_", " ")}` });
    }

    const [{ data: advisor }, { data: student }] = await Promise.all([
      admin.from("profiles").select("full_name, email").eq("id", req.user.id).single(),
      admin.from("profiles").select("full_name, email").eq("id", form.student_id).single(),
    ]);

    const signedAt = new Date();
    const data = {
      ...form.data,
      advisor_signature: signature(advisor.full_name || advisor.email),
      advisor_signed_date: formDate(signedAt),
    };

    let mail;
    try {
      const pdf = await fillPathwayDeclaration(data);
      // The form asks to cc the student. Off by default so demo accounts with
      // made-up addresses never receive real mail.
      const cc =
        process.env.MAIL_CC_PARTICIPANTS === "true"
          ? [student?.email, advisor.email].filter(Boolean)
          : undefined;
      mail = await sendMail({
        to: registrar,
        cc,
        subject: `Pathway Declaration Request: ${data.student_name}${data.cwid ? ` (CWID ${data.cwid})` : ""}`,
        text: [
          "Office of the Registrar,",
          "",
          `Please find attached the Pathway Declaration Request Form for ${data.student_name}.`,
          "",
          `Student: ${data.student_name}`,
          `CWID: ${data.cwid || "(not on file)"}`,
          `Major: ${data.major}`,
          `Declaration: ${data.declaration === "change" ? "Change of Declaration" : "Initial Declaration"}`,
          `Pathway: ${data.pathway_name ?? data.pathway}`,
          `Student signed: ${data.student_signed_date}`,
          `Primary advisor: ${advisor.full_name || advisor.email} (signed ${data.advisor_signed_date})`,
          "",
          "Sent from Marist SmartDegree.",
        ].join("\n"),
        attachments: [{ filename: pdfFilename(form), content: Buffer.from(pdf) }],
      });
    } catch (err) {
      await admin.from("form_submissions").update({ email_error: err.message }).eq("id", form.id);
      return res.status(502).json({ error: `Couldn't email the registrar: ${err.message}` });
    }

    const { data: updated, error: updateError } = await admin
      .from("form_submissions")
      .update({
        data,
        status: "sent_to_registrar",
        advisor_id: req.user.id,
        advisor_signed_at: signedAt.toISOString(),
        sent_at: new Date().toISOString(),
        email_error: null,
      })
      .eq("id", form.id)
      .select(FORM_COLUMNS)
      .single();
    if (updateError) return res.status(500).json({ error: updateError.message });

    await admin.from("notices").insert({
      source: "advisor",
      title: "Your pathway declaration was sent to the registrar",
      body: `${advisor.full_name || "Your advisor"} signed your ${data.pathway_name ?? data.pathway} Pathway Declaration and sent it to the Office of the Registrar.`,
      student_id: form.student_id,
      author_id: req.user.id,
    });

    res.json({ form: updated, previewUrl: mail.previewUrl });
  });

  // The filled-in PDF. RLS decides who can read the form (owner or advisor).
  app.get("/forms/:id/pdf", requireUser, async (req, res) => {
    const { data: form, error } = await req.supabase
      .from("form_submissions")
      .select(FORM_COLUMNS)
      .eq("id", Number(req.params.id))
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!form) return res.status(404).json({ error: "Form not found" });

    const pdf = await fillPathwayDeclaration(form.data);
    res
      .type("application/pdf")
      .set("Content-Disposition", `inline; filename="${pdfFilename(form)}"`)
      .send(Buffer.from(pdf));
  });
}
