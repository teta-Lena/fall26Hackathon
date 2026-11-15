// Signs in as a user and shows what their role lets them see.
// Run: node client.js advisor | cs_student | finance_student
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.user;
}

export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

// Row-level security decides the result: advisors get every student,
// students get only themselves.
export async function listStudents() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "student");
  if (error) throw error;
  return data;
}

const who = (process.argv[2] ?? "cs_student").toUpperCase();
const user = await signIn(
  process.env[`${who}_EMAIL`],
  process.env[`${who}_PASSWORD`],
);
const profile = await getMyProfile(user.id);
console.log(`Signed in as ${profile.full_name} (${profile.role})`);

if (profile.role === "advisor") {
  console.log("Students:", await listStudents());
} else {
  console.log("Visible student rows:", await listStudents());
}

await supabase.auth.signOut();
