// Talks to the Express backend through the Vite proxy (/api -> localhost:3000).
const API = "/api";
const SESSION_KEY = "smartdegree.session";

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked (e.g. private window): the session lasts until refresh.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

// Sends a request with the saved access token. Throws an Error carrying the
// HTTP status so callers can log out on 401.
export async function apiFetch(path, options = {}) {
  const session = getSession();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session && { Authorization: `Bearer ${session.access_token}` }),
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function login(email, password) {
  const session = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveSession(session);
  return session;
}

export const getMe = () => apiFetch("/me");
export const getAdvisorStudents = () => apiFetch("/advisor/students");

// Student
export const getPlan = () => apiFetch("/student/plan");
export const savePlan = (plan) =>
  apiFetch("/student/plan", { method: "PUT", body: JSON.stringify(plan) });
export const getDashboard = () => apiFetch("/student/dashboard");
export const declarePathway = (pathway_id) =>
  apiFetch("/student/pathway", {
    method: "POST",
    body: JSON.stringify({ pathway_id }),
  });

// Advisor
export const sendNotice = (notice) =>
  apiFetch("/advisor/notices", {
    method: "POST",
    body: JSON.stringify(notice),
  });
