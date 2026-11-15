import { useEffect, useState } from "react";
import { getPlan, savePlan } from "./api";

const GOALS = ["Job", "Grad School", "Research", "Entrepreneur", "Not sure yet"];

const PACES = [
  { value: "easy", label: "Relaxed", detail: "12–14 credits a semester" },
  { value: "medium", label: "Standard", detail: "14–16 credits a semester" },
  { value: "hard", label: "Accelerated", detail: "17–18 credits a semester" },
];

// Shown right after a student's first login, and from "Edit plan".
// onDone runs after saving; onCancel is only passed when editing.
export default function ProfileSetup({ onDone, onCancel }) {
  const [major, setMajor] = useState(null);
  const [interests, setInterests] = useState("");
  const [career, setCareer] = useState("");
  const [goals, setGoals] = useState([]);
  const [pace, setPace] = useState("medium");
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill from a saved plan, and load the major's courses.
  useEffect(() => {
    getPlan()
      .then(({ plan, major }) => {
        setMajor(major);
        if (plan) {
          setInterests(plan.interests);
          setCareer(plan.career);
          setGoals(plan.goals);
          setPace(plan.pace);
          setCompleted(plan.completed_courses);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!goals.length) {
      setError("Pick at least one plan after graduation.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await savePlan({ interests, career, goals, pace, completed_courses: completed });
      onDone();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-700 font-bold">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl text-red-700 font-bold">Set up your plan</h1>
        <p>
          Tell us your <span className="text-red-700 font-bold">goals</span> and
          we'll suggest a <span className="text-red-700 font-bold">pathway</span>{" "}
          and classes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full max-w-3xl">
        <div className="flex flex-col gap-1">
          <label htmlFor="interests" className="font-bold">
            Interests
          </label>
          <input
            id="interests"
            type="text"
            placeholder="e.g. video games, AI, investing, the environment"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            className="border rounded-sm p-1 w-full"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="career" className="font-bold">
            Career you're aiming for
          </label>
          <input
            id="career"
            type="text"
            placeholder="e.g. game developer, financial analyst"
            value={career}
            onChange={(e) => setCareer(e.target.value)}
            className="border rounded-sm p-1 w-full"
          />
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="font-bold mb-1">Plan after graduation</legend>
          {GOALS.map((goal) => (
            <label key={goal} className="flex items-center gap-2">
              <input
                type="checkbox"
                value={goal}
                checked={goals.includes(goal)}
                onChange={() => toggle(goals, setGoals, goal)}
                className="accent-red-700"
              />
              {goal}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-1">
          <legend className="font-bold mb-1">How fast do you want to graduate?</legend>
          {PACES.map((p) => (
            <label key={p.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="pace"
                value={p.value}
                checked={pace === p.value}
                onChange={() => setPace(p.value)}
                className="accent-red-700"
              />
              <span className="font-bold">{p.label}</span>
              <span className="text-sm">({p.detail})</span>
            </label>
          ))}
        </fieldset>
        {/* in next version they can insert their availability for a new semester to allow more flexibility in class selection */}

        {major ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="font-bold mb-1">
              Courses you've already completed in{" "}
              <span className="text-red-700">{major.name}</span>
            </legend>
            {major.checklist.map((section) => (
              <details key={section.title} className="border rounded-sm p-2">
                <summary className="cursor-pointer font-bold">
                  {section.title}{" "}
                  <span className="text-sm font-normal">
                    ({section.items.filter((c) => completed.includes(c.id)).length}/
                    {section.items.length})
                  </span>
                </summary>
                <div className="flex flex-col gap-1 mt-2">
                  {section.items.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={completed.includes(c.id)}
                        onChange={() => toggle(completed, setCompleted, c.id)}
                        className="accent-red-700"
                      />
                      {c.code && <span className="font-bold">{c.code}</span>} {c.title}
                    </label>
                  ))}
                </div>
              </details>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm">
            No major on file yet. Ask your advisor to add it so we can suggest classes.
          </p>
        )}

        {error && (
          <p role="alert" className="text-red-700 text-sm">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="border border-red-700 text-red-700 font-bold rounded-sm p-2 w-full cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-bold rounded-sm p-2 w-full cursor-pointer"
          >
            {saving ? "Saving..." : "See my plan"}
          </button>
        </div>
      </form>
    </div>
  );
}
