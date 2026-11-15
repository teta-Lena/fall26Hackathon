import "dotenv/config";
import {
  verifyCredentials,
  createContextClient,
  createAdminClient,
} from "@supabase/server/core";

// Admin client: uses SUPABASE_SECRET_KEY and bypasses RLS.
// Only for trusted server code such as seed.js. Never use it for a user's request.
export const supabaseAdmin = () => createAdminClient();

// Anonymous client: uses SUPABASE_PUBLISHABLE_KEY. Used to sign users in.
export const supabaseAnon = () => createContextClient();

// Express middleware: requires "Authorization: Bearer <access_token>".
// On success it sets req.user (JWT claims) and req.supabase, a client that acts
// as that user, so the RLS policies in db.sql apply to every query.
export async function requireUser(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  const { data: auth, error } = await verifyCredentials(
    { token, apikey: null },
    { auth: "user" },
  );
  if (error) {
    return res
      .status(error.status)
      .json({ error: error.message, code: error.code });
  }

  req.user = auth.userClaims;
  req.supabase = createContextClient({
    auth: { token: auth.token, keyName: auth.keyName },
  });
  next();
}

// Use after requireUser. Reads the caller's own profile (RLS allows this)
// and lets the request through only if their role is 'advisor'.
export async function requireAdvisor(req, res, next) {
  const { data: profile, error } = await req.supabase
    .from("profiles")
    .select("role")
    .eq("id", req.user.id)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (profile.role !== "advisor") {
    return res.status(403).json({ error: "Advisors only" });
  }
  next();
}
