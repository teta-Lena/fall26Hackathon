// Seeds majors and demo accounts (there is no signup page).
// Run after db.sql, pathways.sql, majors.sql, dashboard.sql and forms.sql: `npm run seed`.
// Safe to run again.
//
// Uses the secret key (bypasses RLS). It's the only way to set a user's
// role or major, because users can't change those themselves (see db.sql).
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { supabaseAdmin } from "./superbaseclient.js";

const admin = supabaseAdmin();

// Explains the most common failure: a table or column from the SQL files is missing.
function fail(step, error) {
  const hint = /schema cache|does not exist|column/i.test(error.message)
    ? "\n  → Run db.sql, pathways.sql, majors.sql, dashboard.sql, then forms.sql in the Supabase SQL editor first."
    : "";
  console.error(`✗ ${step}: ${error.message}${hint}`);
  process.exit(1);
}

// 1. Majors (from majors.json, next to this file)
const majors = JSON.parse(
  await readFile(new URL("./majors.json", import.meta.url), "utf8"),
);
const { error: majorsError } = await admin.from("majors").upsert(majors);
if (majorsError) fail("majors", majorsError);
console.log(`✓ majors: ${majors.map((m) => m.name).join(", ")}`);

// 2. Users. Emails and passwords come from .env so they stay out of git.
const users = [
  { env: "ADVISOR", full_name: "Alex Advisor", role: "advisor", major_slug: null, cwid: "20000001" },
  { env: "CS_STUDENT", full_name: "Casey Coder", role: "student", major_slug: "computer-science", cwid: "20012345" },
  { env: "FINANCE_STUDENT", full_name: "Finley Banks", role: "student", major_slug: "finance", cwid: "20012346" },
];

const missing = users
  .flatMap((u) => [`${u.env}_EMAIL`, `${u.env}_PASSWORD`])
  .filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`✗ Add these to .env: ${missing.join(", ")}`);
  process.exit(1);
}

// Look up existing accounts in Auth, not profiles: an account created
// before db.sql ran has no profile row.
const { data: list, error: listError } = await admin.auth.admin.listUsers({
  perPage: 1000,
});
if (listError) fail("list users", listError);
const existingByEmail = new Map(
  list.users.map((u) => [u.email.toLowerCase(), u.id]),
);

for (const user of users) {
  const email = process.env[`${user.env}_EMAIL`].trim().toLowerCase();
  const password = process.env[`${user.env}_PASSWORD`];

  let id = existingByEmail.get(email);
  if (id) {
    // Keep the password in sync with .env.
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) fail(`update ${email}`, error);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
    });
    if (error) fail(`create ${email}`, error);
    id = data.user.id;
  }

  // The signup trigger made a 'student' profile (if it ran). Upsert sets the
  // real role and major, and creates the row if it's missing.
  const { error: profileError } = await admin.from("profiles").upsert({
    id,
    email,
    full_name: user.full_name,
    role: user.role,
    major_slug: user.major_slug,
    cwid: user.cwid,
  });
  if (profileError) fail(`profile for ${email}`, profileError);

  user.id = id;
  console.log(
    `✓ ${user.role}: ${email}${user.major_slug ? ` (${user.major_slug})` : ""}`,
  );
}

// The demo advisor is every demo student's primary advisor (signs their forms).
const advisorId = users.find((u) => u.role === "advisor").id;
const { error: advisorError } = await admin
  .from("profiles")
  .update({ advisor_id: advisorId })
  .in("id", users.filter((u) => u.role === "student").map((u) => u.id));
if (advisorError) fail("assign advisor", advisorError);
console.log("✓ students assigned to Alex Advisor");

// 3. Demo notices (needs dashboard.sql). Seeded notices are replaced each run;
// notices advisors send from the app are kept.
const advisor = users.find((u) => u.env === "ADVISOR");
const csStudent = users.find((u) => u.env === "CS_STUDENT");

const { error: clearError } = await admin
  .from("notices")
  .delete()
  .like("title", "[demo]%");
if (clearError) fail("clear demo notices", clearError);

const notices = [
  {
    source: "registrar",
    title: "[demo] Spring 2027 registration opens soon",
    body: "Check your registration time in your student account and meet with your advisor beforehand.",
  },
  {
    source: "registrar",
    title: "[demo] Add/drop deadline",
    body: "The last day to add or drop a class without a W is the end of the first week of the semester.",
  },
  {
    source: "registrar",
    title: "[demo] Changing your major or minor?",
    body: "Submit the major/minor change form before registration so your new requirements show up in time.",
  },
  {
    source: "advisor",
    title: "[demo] Let's plan your spring schedule",
    body: "Hi Casey, book a 20-minute meeting with me before registration opens.",
    student_id: csStudent.id,
    author_id: advisor.id,
  },
];

const { error: noticesError } = await admin.from("notices").insert(notices);
if (noticesError) fail("notices", noticesError);
console.log(`✓ notices: ${notices.length} demo notices`);
