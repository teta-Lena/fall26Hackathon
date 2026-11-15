// Fills the registrar's real PDF forms (in ./forms) with a student's data.
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const PATHWAY_TEMPLATE = new URL("./forms/pathway-declaration.pdf", import.meta.url);

// 11/15/2026
export function formDate(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// Picks a dropdown option, ignoring spacing differences ("French " vs "French").
// If the value isn't in the list (e.g. a major the form doesn't include yet),
// it is typed in instead.
function selectOption(dropdown, value) {
  const clean = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const match = dropdown.getOptions().find((o) => clean(o) === clean(value));
  if (match) {
    dropdown.select(match);
  } else {
    dropdown.enableEditing();
    dropdown.select(value);
  }
}

// data: { student_name, cwid, major, date, declaration: "initial" | "change",
//         pathway, student_signature, student_signed_date,
//         advisor_signature?, advisor_signed_date? }
// The fields stay editable so the registrar can fill in "Processed by".
export async function fillPathwayDeclaration(data) {
  const pdf = await PDFDocument.load(await readFile(PATHWAY_TEMPLATE));
  const form = pdf.getForm();

  form.getTextField("Student Name").setText(data.student_name);
  form.getTextField("CWID").setText(data.cwid ?? "");
  selectOption(form.getDropdown("Major"), data.major);
  form.getTextField("Date11_af_date").setText(data.date);

  // Choice1 = Initial Declaration, Choice2 = Change of Declaration.
  form.getRadioGroup("Declaration").select(data.declaration === "change" ? "Choice2" : "Choice1");
  selectOption(form.getDropdown("Pathway"), data.pathway);

  form.getTextField("Student Sign").setText(data.student_signature);
  form.getTextField("Date12_af_date").setText(data.student_signed_date);
  form.getTextField("Advx Sign").setText(data.advisor_signature ?? "");
  form.getTextField("Date13_af_date").setText(data.advisor_signed_date ?? "");

  // Auto-sized text renders very large in these boxes; match the date fields.
  for (const name of ["Student Name", "CWID", "Student Sign", "Advx Sign"]) {
    form.getTextField(name).setFontSize(12);
  }

  return pdf.save();
}
