import { useEffect, useState } from "react";
import { getAdvisorStudents, sendNotice } from "./api";

// Notices show up on the student dashboard under "Notices".
function SendNotice({ students }) {
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setStatus("");
    try {
      await sendNotice({ title, body, student_id: studentId || null });
      setTitle("");
      setBody("");
      setStatus("Notice sent.");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-xs flex flex-col gap-1">
      <h2 className="font-bold mb-1">Send a notice</h2>
      <label htmlFor="notice-to" className="text-sm">
        To
      </label>
      <select
        id="notice-to"
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        className="border rounded-sm p-1 w-full"
      >
        <option value="">All students</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name || s.email}
          </option>
        ))}
      </select>
      <label htmlFor="notice-title" className="text-sm mt-2">
        Title
      </label>
      <input
        id="notice-title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="border rounded-sm p-1 w-full"
      />
      <label htmlFor="notice-body" className="text-sm mt-2">
        Message
      </label>
      <textarea
        id="notice-body"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="border rounded-sm p-1 w-full"
      />
      {status && <p className="text-sm text-red-700">{status}</p>}
      <button
        type="submit"
        disabled={sending}
        className="mt-2 bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-bold rounded-sm p-2 w-full cursor-pointer"
      >
        {sending ? "Sending..." : "Send notice"}
      </button>
    </form>
  );
}

export default function AdvisorPage({ profile, onLogout }) {
  const [students, setStudents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdvisorStudents()
      .then(setStudents)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-2xl text-red-700 font-bold">Advisor Portal</h1>
      <p>
        Welcome,{" "}
        <span className="text-red-700 font-bold">
          {profile.full_name || profile.email}
        </span>
      </p>

      <div className="w-xs">
        <h2 className="font-bold mb-2">Your students</h2>
        {error && <p className="text-red-700 text-sm">{error}</p>}
        {!students && !error && <p className="text-sm">Loading...</p>}
        {students?.length === 0 && <p className="text-sm">No students yet.</p>}
        <ul className="flex flex-col gap-2">
          {students?.map((s) => (
            <li key={s.id} className="border rounded-sm p-2">
              <p className="font-bold">{s.full_name || "Unnamed student"}</p>
              <p className="text-sm">{s.email}</p>
            </li>
          ))}
        </ul>
      </div>

      <SendNotice students={students ?? []} />

      <button
        onClick={onLogout}
        className="bg-red-700 hover:bg-red-800 text-white font-bold rounded-sm p-2 w-xs cursor-pointer"
      >
        Log out
      </button>
    </div>
  );
}
