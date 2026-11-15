import { useEffect, useState } from "react";
import { getDashboard, declarePathway, openFormPdf } from "./api";
import ProfileSetup from "./profilesetup";

function Card({ title, children, className = "" }) {
  return (
    <section className={`border rounded-sm p-4 flex flex-col gap-3 ${className}`}>
      <h2 className="text-lg text-red-700 font-bold">{title}</h2>
      {children}
    </section>
  );
}

function ProgressBar({ value, max }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-2 w-full bg-gray-200 rounded-sm overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-red-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

const FORM_STATUS = {
  pending_advisor: "Waiting for your advisor's signature",
  sent_to_registrar: "Signed and sent to the Registrar",
};

// Status of the auto-filled Pathway Declaration Request Form.
function PathwayFormStatus({ form }) {
  const [error, setError] = useState("");
  if (!form) return null;
  const sent = form.status === "sent_to_registrar";

  async function view() {
    setError("");
    try {
      await openFormPdf(form.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="border rounded-sm p-3 flex flex-col gap-1 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">Pathway Declaration form</p>
        <button
          onClick={view}
          className="text-red-700 font-bold hover:underline cursor-pointer"
        >
          View PDF
        </button>
      </div>
      <p>
        <span
          className={`text-xs font-bold rounded-sm px-1 py-0.5 ${
            sent ? "bg-red-700 text-white" : "border border-red-700 text-red-700"
          }`}
        >
          {sent ? "Sent" : "Pending"}
        </span>{" "}
        {FORM_STATUS[form.status]}
        {sent && form.sent_at && <> on {new Date(form.sent_at).toLocaleDateString()}</>}
      </p>
      <p className="text-xs">
        {form.data.declaration === "change" ? "Change of Declaration" : "Initial Declaration"} ·
        filled in {form.data.date}
      </p>
      {error && <p className="text-red-700 text-xs">{error}</p>}
    </div>
  );
}

function SuggestedPathway({ data, onDeclared }) {
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");
  const declared = data.declaredPathway;

  async function declare(id) {
    const name = data.suggestedPathways.find((p) => p.id === id)?.name;
    const ok = window.confirm(
      `Declare ${name}?\n\nWe'll fill in your Pathway Declaration Request Form and send it to your advisor to sign. Once signed, it goes to the Registrar.`,
    );
    if (!ok) return;
    setSaving(id);
    setError("");
    try {
      await declarePathway(id);
      onDeclared();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card title="Suggested pathway">
      {declared && (
        <p className="text-sm">
          Declared: <span className="font-bold text-red-700">{declared.name}</span>
        </p>
      )}
      <PathwayFormStatus form={data.pathwayForm} />
      <ul className="flex flex-col gap-2">
        {data.suggestedPathways.map((p, i) => (
          <li key={p.id} className="border rounded-sm p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold">
                {p.name}
                {i === 0 && (
                  <span className="ml-2 text-xs bg-red-700 text-white rounded-sm px-1 py-0.5">
                    Best match
                  </span>
                )}
              </p>
              {declared?.id !== p.id && (
                <button
                  onClick={() => declare(p.id)}
                  disabled={saving !== null}
                  className="text-sm text-red-700 font-bold hover:underline cursor-pointer disabled:opacity-60"
                >
                  {saving === p.id ? "Declaring..." : "Declare"}
                </button>
              )}
            </div>
            <p className="text-sm">{p.description}</p>
            {p.matched.length > 0 && (
              <p className="text-xs">
                Matches your: <span className="font-bold">{p.matched.join(", ")}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-red-700 text-sm">{error}</p>}
    </Card>
  );
}

function SuggestedClasses({ suggestion }) {
  if (!suggestion) {
    return (
      <Card title="Suggested classes">
        <p className="text-sm">Ask your advisor to add your major to see suggestions.</p>
      </Card>
    );
  }
  return (
    <Card title="Suggested classes for next semester">
      <p className="text-sm">
        <span className="font-bold">{suggestion.credits} credits</span> · your
        pace aims for {suggestion.min}–{suggestion.max}
      </p>
      {suggestion.classes.length === 0 ? (
        <p className="text-sm">You've completed every tracked course. 🎓</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {suggestion.classes.map((c) => (
            <li key={c.code ?? c.id} className="border rounded-sm p-3">
              <div className="flex justify-between gap-2">
                <p>
                  {c.code ? (
                    <span className="font-bold text-red-700">{c.code}</span>
                  ) : (
                    <span className="text-xs font-bold border border-red-700 text-red-700 rounded-sm px-1 py-0.5">
                      {c.pathway ? "Pathway" : "Core"}
                    </span>
                  )}{" "}
                  {c.title}
                </p>
                <span className="text-sm whitespace-nowrap">{c.credits} cr</span>
              </div>
              <p className="text-xs">{c.section}</p>
              {c.reason && <p className="text-xs font-bold text-red-700">{c.reason}</p>}
              {c.alternatives?.length > 0 && (
                <p className="text-xs">
                  Or: {c.alternatives.map((a) => a.code).join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Tracker({ tracker, majorName }) {
  if (!tracker) return null;
  return (
    <Card title="Degree tracker">
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-sm">
          <span className="font-bold">{majorName}</span>
          <span>
            {tracker.completedCredits}/{tracker.requiredCredits} credits ({tracker.percent}%)
          </span>
        </div>
        <ProgressBar value={tracker.completedCredits} max={tracker.requiredCredits} />
      </div>
      <p className="text-sm">
        About <span className="font-bold text-red-700">{tracker.semestersLeft}</span>{" "}
        semesters left at {tracker.creditsPerSemester} credits a semester
        {tracker.concentration && (
          <>
            {" "}· Concentration: <span className="font-bold">{tracker.concentration}</span>
          </>
        )}
      </p>
      <ul className="flex flex-col gap-2">
        {tracker.sections.map((s) => (
          <li key={s.title} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span>{s.title.replace(/^Concentration option:\s*/, "Concentration: ")}</span>
              <span>
                {s.completed}/{s.required}
              </span>
            </div>
            <ProgressBar value={s.completed} max={s.required} />
          </li>
        ))}
      </ul>
      <p className="text-xs">
        Estimate based on the courses you marked complete. DegreeWorks is the official record.
      </p>
    </Card>
  );
}

function Notices({ notices }) {
  return (
    <Card title="Notices">
      {notices.length === 0 ? (
        <p className="text-sm">No notices right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notices.map((n) => (
            <li key={n.id} className="border rounded-sm p-3 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold rounded-sm px-1 py-0.5 ${
                    n.source === "registrar"
                      ? "bg-red-700 text-white"
                      : "border border-red-700 text-red-700"
                  }`}
                >
                  {n.source === "registrar" ? "Registrar" : "Advisor"}
                </span>
                <span className="text-xs">
                  {new Date(n.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="font-bold">{n.title.replace(/^\[demo\]\s*/, "")}</p>
              {n.body && <p className="text-sm">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function StudentDashboard({ profile, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  function fetchDashboard() {
    return getDashboard()
      .then((d) => {
        setError("");
        setData(d);
      })
      .catch((err) => setError(err.message));
  }

  // Reload after an action (declaring a pathway, saving the plan, retry).
  function load() {
    setError("");
    fetchDashboard();
  }

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-700">{error}</p>
        <button
          onClick={load}
          className="bg-red-700 hover:bg-red-800 text-white font-bold rounded-sm p-2 w-xs cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-700 font-bold">
        Loading...
      </div>
    );
  }

  // First login (no plan yet) or "Edit plan": show the profile setup page.
  if (data.needsSetup || editing) {
    return (
      <ProfileSetup
        onDone={() => {
          setEditing(false);
          setData(null);
          load();
        }}
        onCancel={data.needsSetup ? undefined : () => setEditing(false)}
      />
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl text-red-700 font-bold">Marist SmartDegree</h1>
            <p>
              Welcome,{" "}
              <span className="text-red-700 font-bold">
                {profile.full_name || profile.email}
              </span>
              {data.major && <> · {data.major.name}</>}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="border border-red-700 text-red-700 font-bold rounded-sm px-3 py-2 cursor-pointer"
            >
              Edit plan
            </button>
            <button
              onClick={onLogout}
              className="bg-red-700 hover:bg-red-800 text-white font-bold rounded-sm px-3 py-2 cursor-pointer"
            >
              Log out
            </button>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <SuggestedPathway data={data} onDeclared={load} />
          <Notices notices={data.notices} />
          <SuggestedClasses suggestion={data.suggestedClasses} />
          <Tracker tracker={data.tracker} majorName={data.major?.name} />
        </div>
      </div>
    </div>
  );
}
