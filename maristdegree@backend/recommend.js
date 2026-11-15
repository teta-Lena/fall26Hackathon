// Turns a student's plan + major into dashboard suggestions.
// Pure functions: no database access, easy to test and tweak.

// Credits per semester for each pace on the profile setup page.
export const PACE_CREDITS = { easy: 12, medium: 15, hard: 18 };

// Extra keywords implied by each post-graduation goal.
const GOAL_KEYWORDS = {
  Job: ["business", "management", "technology"],
  "Grad School": ["research", "science", "ethics"],
  Research: ["research", "science", "data"],
  Entrepreneur: ["business", "leadership", "management"],
  "Not sure yet": [],
};

// Light hint from the major so every student gets some match.
const MAJOR_KEYWORDS = {
  "computer-science": ["technology", "software", "data", "ai"],
  finance: ["business", "management"],
};

const STOP_WORDS = new Set(["and", "the", "for", "with", "want", "like", "into"]);
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function words(text = "") {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

// Keywords from free text (interests, career), goals and major.
export function studentKeywords(plan, majorSlug) {
  const set = new Set([
    ...words(plan.interests),
    ...words(plan.career),
    ...(plan.goals ?? []).flatMap((g) => GOAL_KEYWORDS[g] ?? []),
    ...(MAJOR_KEYWORDS[majorSlug] ?? []),
  ]);
  return [...set];
}

// "ai" matches "ai"; longer words also match by prefix ("tech" ~ "technology").
function matches(keyword, tag) {
  if (keyword === tag) return true;
  if (keyword.length < 4 || tag.length < 4) return false;
  return tag.startsWith(keyword) || keyword.startsWith(tag);
}

// Ranks pathways by how many of their tags match the student's keywords.
export function rankPathways(pathways, keywords) {
  return pathways
    .map((p) => {
      const matched = p.tags.filter((tag) => keywords.some((k) => matches(k, tag)));
      return { ...p, score: matched.length, matched };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// "Choose four" -> 4, anything else -> 1.
function chooseCount(label = "") {
  const m = /choose (\w+)/.exec(label.toLowerCase());
  return (m && (NUMBER_WORDS[m[1]] ?? Number(m[1]))) || 1;
}

// 120 in "CMPT 120L"; used to suggest lower-level courses first.
function courseLevel(code) {
  const n = code.match(/\d+/);
  return n ? Number(n[0]) : 999;
}

const isConcentration = (title) => /^concentration/i.test(title);

// Course codes inside a section, including "choose" options.
const sectionCodes = (section) =>
  section.items.flatMap((i) => (i.code ? [i.code] : (i.options ?? []).map((o) => o.code)));

// Students complete one concentration. Pick the one with the most completed
// courses; on a tie, the one whose course titles best match their interests.
function pickConcentration(requirements, done, keywords = []) {
  const options = requirements.sections.filter((s) => isConcentration(s.title));
  if (!options.length) return null;
  const score = (s) => {
    const completed = sectionCodes(s).filter((c) => done.has(c)).length;
    const titles = s.items.flatMap((i) => (i.title ? [i.title] : (i.options ?? []).map((o) => o.title)));
    const interest = titles
      .flatMap(words)
      .filter((w) => keywords.some((k) => matches(k, w))).length;
    return completed * 100 + interest;
  };
  return options.reduce((best, s) => (score(s) > score(best) ? s : best)).title;
}

// Breaks a major's requirements into trackable units: a single course, or a
// "choose N of these" group. Only the chosen concentration is included.
function requirementUnits(requirements, concentration) {
  const units = [];
  requirements.sections.forEach((section, sectionIndex) => {
    if (isConcentration(section.title) && section.title !== concentration) return;
    for (const item of section.items) {
      if (item.code) {
        units.push({ kind: "course", section: section.title, sectionIndex, ...item });
      } else if (item.options) {
        units.push({
          kind: "choice",
          section: section.title,
          sectionIndex,
          label: item.choose,
          count: chooseCount(item.choose),
          options: item.options,
        });
      }
      // Plain-text items (gen-ed areas) have no course code to track.
    }
  });
  return units;
}

// Degree progress per section, based on the courses the student marked done.
export function buildTracker(requirements, completedCourses, pace, keywords) {
  const done = new Set(completedCourses);
  const concentration = pickConcentration(requirements, done, keywords);
  const sections = new Map();
  let requiredCredits = 0;
  let completedCredits = 0;

  for (const unit of requirementUnits(requirements, concentration)) {
    let required;
    let completed;
    if (unit.kind === "course") {
      required = unit.credits;
      completed = done.has(unit.code) ? unit.credits : 0;
    } else {
      const byCredits = [...unit.options].sort((a, b) => a.credits - b.credits);
      required = byCredits.slice(0, unit.count).reduce((s, o) => s + o.credits, 0);
      completed = unit.options
        .filter((o) => done.has(o.code))
        .slice(0, unit.count)
        .reduce((s, o) => s + o.credits, 0);
      completed = Math.min(completed, required);
    }

    const s = sections.get(unit.section) ?? { title: unit.section, required: 0, completed: 0 };
    s.required += required;
    s.completed += completed;
    sections.set(unit.section, s);
    requiredCredits += required;
    completedCredits += completed;
  }

  const graduationCredits = requirements.graduation_credits ?? 120;
  // Only courses tracked here count; other credits live in DegreeWorks.
  const remaining = Math.max(graduationCredits - completedCredits, 0);
  const perSemester = PACE_CREDITS[pace] ?? PACE_CREDITS.medium;

  return {
    requiredCredits,
    completedCredits,
    percent: requiredCredits ? Math.round((completedCredits / requiredCredits) * 100) : 0,
    concentration: concentration?.replace(/^concentration option:\s*/i, "") ?? null,
    graduationCredits,
    creditsPerSemester: perSemester,
    semestersLeft: Math.ceil(remaining / perSemester),
    sections: [...sections.values()],
  };
}

// Which group a section belongs to when ordering suggestions:
// first-year foundation, then the major itself, then the concentration,
// then the rest of the core.
function sectionPriority(title) {
  if (/^core: foundation/i.test(title)) return 0;
  if (/^core/i.test(title)) return 3;
  if (isConcentration(title)) return 2;
  return 1;
}

// Next semester's suggested classes, filling the pace's credit budget.
// Order: section priority, then course level. At most one course per subject
// (CMPT, MATH, ...) per semester, so sequences like CMPT 220L -> 221L are
// taken in order without needing prerequisite data. For "choose" groups,
// options that match the student's interests come first.
export function suggestClasses(requirements, completedCourses, pace, keywords) {
  const done = new Set(completedCourses);
  const budget = PACE_CREDITS[pace] ?? PACE_CREDITS.medium;
  const concentration = pickConcentration(requirements, done, keywords);

  const titleScore = (title) =>
    words(title).filter((w) => keywords.some((k) => matches(k, w))).length;

  const candidates = [];
  for (const unit of requirementUnits(requirements, concentration)) {
    if (unit.kind === "course") {
      if (!done.has(unit.code)) {
        candidates.push({
          code: unit.code,
          title: unit.title,
          credits: unit.credits,
          section: unit.section,
          level: courseLevel(unit.code),
          sectionIndex: unit.sectionIndex,
        });
      }
      continue;
    }

    const taken = unit.options.filter((o) => done.has(o.code)).length;
    if (taken >= unit.count) continue;

    const options = unit.options
      .filter((o) => !done.has(o.code))
      .map((o) => ({ ...o, interestMatch: titleScore(o.title) > 0 }))
      .sort((a, b) => b.interestMatch - a.interestMatch || courseLevel(a.code) - courseLevel(b.code));
    const best = options[0];

    candidates.push({
      code: best.code,
      title: best.title,
      credits: best.credits,
      section: unit.section,
      choice: unit.label,
      alternatives: options.slice(1, 4).map(({ code, title }) => ({ code, title })),
      reason: best.interestMatch ? "Matches your interests" : null,
      level: courseLevel(best.code),
      sectionIndex: unit.sectionIndex,
    });
  }

  // A course can appear in more than one group (e.g. an elective list).
  const seen = new Set();
  const unique = candidates.filter((c) => !seen.has(c.code) && seen.add(c.code));
  unique.sort(
    (a, b) =>
      sectionPriority(a.section) - sectionPriority(b.section) ||
      a.sectionIndex - b.sectionIndex ||
      a.level - b.level,
  );

  const picked = [];
  const subjects = new Set();
  let credits = 0;
  for (const c of unique) {
    const subject = c.code.split(" ")[0];
    if (subjects.has(subject)) continue;
    // Claim the subject even if this course doesn't fit, so a later course in
    // the same sequence (e.g. CS Project II) can't jump ahead of it.
    subjects.add(subject);
    if (credits + c.credits > budget) continue;
    picked.push(c);
    credits += c.credits;
  }

  return {
    credits,
    budget,
    classes: picked.map(({ level, sectionIndex, ...c }) => c),
  };
}
