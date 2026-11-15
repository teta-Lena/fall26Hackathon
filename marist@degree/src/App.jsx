import { useEffect, useState } from "react";

import "./App.css";
import Login from "./login";
import StudentDashboard from "./studentdashboard";
import AdvisorPage from "./advisorpage";
import { getSession, clearSession, getMe } from "./api";

function App() {
  // undefined = still checking a saved session, null = logged out.
  const [profile, setProfile] = useState(() =>
    getSession() ? undefined : null,
  );

  // If a session was saved from a previous visit, confirm it's still valid.
  useEffect(() => {
    if (profile !== undefined) return;
    getMe()
      .then(setProfile)
      .catch(() => {
        clearSession();
        setProfile(null);
      });
  }, [profile]);

  function logout() {
    clearSession();
    setProfile(null);
  }

  if (profile === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-700 font-bold">
        Loading...
      </div>
    );
  }

  if (!profile) return <Login onLogin={setProfile} />;

  return profile.role === "advisor" ? (
    <AdvisorPage profile={profile} onLogout={logout} />
  ) : (
    <StudentDashboard profile={profile} onLogout={logout} />
  );
}

export default App;
