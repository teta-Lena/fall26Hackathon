import { useEffect, useState } from "react";
import {
  getAdvisorStudents,
  sendNotice,
  getAdvisorForms,
  signForm,
  openFormPdf,
} from "./api";

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
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-1">
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
    <div className="min-h-screen px-4 py-8">
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl text-red-700 font-bold">Advisor Portal</h1>
            <p>
              Welcome,{" "}
              <span className="text-red-700 font-bold">
                {profile.full_name || profile.email}
              </span>
            </p>
          </div>
          <button
            onClick={onLogout}
            className="bg-red-700 hover:bg-red-800 text-white font-bold rounded-sm px-3 py-2 cursor-pointer"
          >
            Log out
          </button>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <FormsPanel />

          <div className="flex flex-col gap-6">
            <section className="border rounded-sm p-4 flex flex-col gap-2">
              <h2 className="text-lg text-red-700 font-bold">Your students</h2>
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
            </section>

            <section className="border rounded-sm p-4">
              <SendNotice students={students ?? []} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// Registrar forms students filled in through the app. The advisor signs here,
// which emails the signed PDF to the Registrar.
function FormsPanel() {
  const [forms, setForms] = useState(null);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(null);
  const [message, setMessage] = useState(null);

  function fetchForms() {
    return getAdvisorForms()
      .then(setForms)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    fetchForms();
  }, []);

  async function sign(form) {
    const ok = window.confirm(
      `Sign ${form.data.student_name}'s Pathway Declaration (${form.data.pathway_name ?? form.data.pathway}) and email it to the Registrar?`,
    );
    if (!ok) return;
    setSigning(form.id);
    setMessage(null);
    try {
      const result = await signForm(form.id);
      setMessage({ ok: true, text: "Signed and sent to the Registrar.", previewUrl: result.previewUrl });
      await fetchForms();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSigning(null);
    }
  }

  async function view(id) {
    try {
      await openFormPdf(id);
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  }

  const pending = forms?.filter((f) => f.status === "pending_advisor") ?? [];
  const sent = forms?.filter((f) => f.status === "sent_to_registrar") ?? [];

  return (
    <section className="border rounded-sm p-4 flex flex-col gap-3">
      <h2 className="text-lg text-red-700 font-bold">Forms to sign</h2>
      {error && <p className="text-red-700 text-sm">{error}</p>}
      {!forms && !error && <p className="text-sm">Loading...</p>}
      {forms && pending.length === 0 && (
        <p className="text-sm">Nothing waiting for your signature.</p>
      )}

      <ul className="flex flex-col gap-2">
        {pending.map((f) => (
          <li key={f.id} className="border rounded-sm p-3 flex flex-col gap-1">
            <p className="font-bold">{f.data.student_name}</p>
            <p className="text-sm">
              Pathway Declaration ·{" "}
              <span className="font-bold text-red-700">{f.data.pathway_name ?? f.data.pathway}</span>
            </p>
            <p className="text-xs">
              {f.data.major} · CWID {f.data.cwid || "—"} ·{" "}
              {f.data.declaration === "change" ? "Change of Declaration" : "Initial Declaration"} ·
              filled in {f.data.date}
            </p>
            {f.email_error && (
              <p className="text-xs text-red-700">Last send failed: {f.email_error}</p>
            )}
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => view(f.id)}
                className="border border-red-700 text-red-700 font-bold rounded-sm px-3 py-1 text-sm cursor-pointer"
              >
                View PDF
              </button>
              <button
                onClick={() => sign(f)}
                disabled={signing !== null}
                className="bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-bold rounded-sm px-3 py-1 text-sm cursor-pointer"
              >
                {signing === f.id ? "Sending..." : "Sign & send to Registrar"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {message && (
        <p className={`text-sm ${message.ok ? "" : "text-red-700"}`}>
          {message.text}{" "}
          {message.previewUrl && (
            <a href={message.previewUrl} target="_blank" rel="noreferrer" className="text-red-700 font-bold underline">
              View test email
            </a>
          )}
        </p>
      )}

      {sent.length > 0 && (
        <>
          <h3 className="font-bold mt-2">Sent to the Registrar</h3>
          <ul className="flex flex-col gap-1">
            {sent.map((f) => (
              <li key={f.id} className="flex justify-between gap-2 text-sm border-b py-1">
                <span>
                  {f.data.student_name} · {f.data.pathway_name ?? f.data.pathway}
                </span>
                <button
                  onClick={() => view(f.id)}
                  className="text-red-700 font-bold hover:underline cursor-pointer whitespace-nowrap"
                >
                  {new Date(f.sent_at).toLocaleDateString()} · PDF
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
