// Turns a student's plan + major into dashboard suggestions.
// Pure functions: no database access, easy to test and tweak.

// Credits per semester for each pace on the profile setup page (used for the
// graduation estimate), and the range a suggested semester should land in.
export const PACE_CREDITS = { easy: 12, medium: 15, hard: 18 };
export const PACE_RANGE = {
  easy: { min: 12, max: 14 },
  medium: { min: 14, max: 16 },
  hard: { min: 17, max: 18 },
};

// At most this many suggested courses from one subject (CMPT, MATH, ...).
const MAX_PER_SUBJECT = 2;

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
  const n = /\d+/.exec(code);
  return n ? Number(n[0]) : 999;
}

const subjectOf = (code) => code.split(" ")[0];

// Credits of a core area: "3" -> 3, "0-3" -> 0 (may already be covered), "" -> 0.
function areaCredits(credits) {
  const m = /^(\d+)/.exec(String(credits ?? ""));
  return m ? Number(m[1]) : 0;
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

// Core areas without a course code ("Fine Arts", 3 credits) and Pathway
// course slots become checkable units. Their id goes in completed_courses.
function areaUnitsFor(section) {
  if (section.pathway) {
    const count = Math.round(areaCredits(section.credits) / 3) || 4;
    return Array.from({ length: count }, (_, i) => ({
      kind: "area",
      id: `area:Pathway course ${i + 1}`,
      title: `Pathway course ${i + 1}`,
      credits: 3,
      pathway: true,
    }));
  }
  return section.items
    .filter((item) => item.text && areaCredits(item.credits) > 0)
    .map((item) => {
      const label = item.text.split(" (")[0];
      return {
        kind: "area",
        id: `area:${label}`,
        title: `${label} course`,
        credits: areaCredits(item.credits),
      };
    });
}

// Breaks a major's requirements into trackable units: a single course, a
// "choose N of these" group, or a core area / pathway slot.
// Only the chosen concentration is included.
function requirementUnits(requirements, concentration) {
  const units = [];
  requirements.sections.forEach((section, sectionIndex) => {
    if (isConcentration(section.title) && section.title !== concentration) return;
    const base = { section: section.title, sectionIndex };
    for (const item of section.items) {
      if (item.code) {
        units.push({ kind: "course", ...base, ...item });
      } else if (item.options) {
        units.push({
          kind: "choice",
          ...base,
          label: item.choose,
          count: chooseCount(item.choose),
          options: item.options,
        });
      }
    }
    for (const area of areaUnitsFor(section)) units.push({ ...base, ...area });
  });
  return units;
}

// What the profile setup page shows as "already completed" checkboxes:
// every course (including "choose" options), core area and pathway slot.
export function buildChecklist(requirements) {
  const seen = new Set();
  return requirements.sections
    .map((section) => ({
      title: section.title,
      items: [
        ...section.items
          .flatMap((item) => (item.code ? [item] : (item.options ?? [])))
          .map((c) => ({ id: c.code, code: c.code, title: c.title })),
        ...areaUnitsFor(section).map((a) => ({ id: a.id, code: null, title: a.title })),
      ].filter((i) => !seen.has(i.id) && seen.add(i.id)),
    }))
    .filter((s) => s.items.length);
}

// Degree progress per section, based on what the student marked done.
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
    } else if (unit.kind === "area") {
      required = unit.credits;
      completed = done.has(unit.id) ? unit.credits : 0;
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
  // Only what's tracked here counts; other credits live in DegreeWorks.
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
    sections: [...sections.values()].filter((s) => s.required > 0),
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

// Without prerequisite data, a course waits if another unfinished course in
// the same subject comes before it: a lower level band (CMPT 120L before any
// 200-level CMPT), or a direct sequel in the same band (CMPT 220L -> 221L).
function isBlocked(course, remaining) {
  const subject = subjectOf(course.code);
  return remaining.some(
    (other) =>
      other !== course &&
      other.code &&
      subjectOf(other.code) === subject &&
      other.level < course.level &&
      (Math.floor(other.level / 100) < Math.floor(course.level / 100) ||
        course.level - other.level < 10),
  );
}

// Next semester's suggested classes, landing in the pace's credit range.
// Order: section priority, then section, then course level. Up to two
// courses per subject, never a course whose predecessor is unfinished.
// Core areas and one Pathway course fill the rest of the semester.
export function suggestClasses(requirements, completedCourses, pace, keywords, options = {}) {
  const done = new Set(completedCourses);
  const range = PACE_RANGE[pace] ?? PACE_RANGE.medium;
  const concentration = pickConcentration(requirements, done, keywords);

  const titleScore = (title) =>
    words(title).filter((w) => keywords.some((k) => matches(k, w))).length;

  const candidates = [];
  for (const unit of requirementUnits(requirements, concentration)) {
    const base = { section: unit.section, sectionIndex: unit.sectionIndex };

    if (unit.kind === "course") {
      if (!done.has(unit.code)) {
        candidates.push({
          ...base,
          code: unit.code,
          title: unit.title,
          credits: unit.credits,
          level: courseLevel(unit.code),
        });
      }
    } else if (unit.kind === "area") {
      if (!done.has(unit.id)) {
        candidates.push({
          ...base,
          id: unit.id,
          code: null,
          title: unit.pathway && options.pathwayName
            ? `${options.pathwayName} pathway course`
            : unit.title,
          credits: unit.credits,
          pathway: !!unit.pathway,
          level: 999,
        });
      }
    } else {
      const taken = unit.options.filter((o) => done.has(o.code)).length;
      if (taken >= unit.count) continue;

      const open = unit.options
        .filter((o) => !done.has(o.code))
        .map((o) => ({ ...o, interestMatch: titleScore(o.title) > 0 }))
        .sort((a, b) => b.interestMatch - a.interestMatch || courseLevel(a.code) - courseLevel(b.code));
      const best = open[0];

      candidates.push({
        ...base,
        code: best.code,
        title: best.title,
        credits: best.credits,
        choice: unit.label,
        alternatives: open.slice(1, 4).map(({ code, title }) => ({ code, title })),
        reason: best.interestMatch ? "Matches your interests" : null,
        level: courseLevel(best.code),
      });
    }
  }

  // A course can appear in more than one group (e.g. an elective list).
  const seen = new Set();
  const unique = candidates.filter((c) => {
    const key = c.code ?? c.id;
    return !seen.has(key) && seen.add(key);
  });
  unique.sort(
    (a, b) =>
      sectionPriority(a.section) - sectionPriority(b.section) ||
      a.sectionIndex - b.sectionIndex ||
      a.level - b.level,
  );

  const picked = [];
  const perSubject = new Map();
  let pathwayPicked = false;
  let credits = 0;

  for (const c of unique) {
    if (credits >= range.min) break;
    if (credits + c.credits > range.max) continue;

    if (c.code) {
      const subject = subjectOf(c.code);
      if ((perSubject.get(subject) ?? 0) >= MAX_PER_SUBJECT) continue;
      if (isBlocked(c, unique)) continue;
      perSubject.set(subject, (perSubject.get(subject) ?? 0) + 1);
    } else if (c.pathway) {
      // One pathway course a semester spreads the pathway across years.
      if (pathwayPicked) continue;
      pathwayPicked = true;
    }

    picked.push(c);
    credits += c.credits;
  }

  return {
    credits,
    min: range.min,
    max: range.max,
    classes: picked.map(({ level, sectionIndex, ...c }) => c),
  };
}
