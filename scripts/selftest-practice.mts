/**
 * Practice & Learn checks: plan helpers, the starter programme, streaks, and the lesson data.
 *   npx tsx scripts/selftest-practice.mts
 */
import { addDays, computeStreak, dayKey, itemProgress, MODE_INFO, parseDayKey, PLAN_MODES, planModeForAttempt, programDay, STARTER_PROGRAM } from "../src/lib/practice/plan";
import { glossary, LESSON_BY_ID, LESSONS } from "../src/lib/learn/content";
import { computeSkills } from "../src/lib/practice/skills";
import type { StatsData } from "../src/lib/db/actions";

let failures = 0;
const check = (c: boolean, msg: string) => {
  if (!c) {
    failures++;
    console.error("  ✗", msg);
  }
};

// ---- dates ----
check(dayKey(parseDayKey("2026-03-01")) === "2026-03-01", "dayKey round trip");
check(addDays("2026-02-28", 1) === "2026-03-01" && addDays("2026-01-01", -1) === "2025-12-31", "addDays across month / year");

// ---- streaks ----
const today = dayKey(new Date());
check(computeStreak(new Set()).current === 0, "empty streak");
const s1 = computeStreak(new Set([today, addDays(today, -1), addDays(today, -2), addDays(today, -5), addDays(today, -6)]));
check(s1.current === 3 && s1.longest === 3, `streak ${JSON.stringify(s1)}`);
const s2 = computeStreak(new Set([addDays(today, -1), addDays(today, -2)]));
check(s2.current === 2, "streak counts from yesterday when today is empty");
const s3 = computeStreak(new Set([addDays(today, -3), addDays(today, -4), addDays(today, -5), addDays(today, -6)]));
check(s3.current === 0 && s3.longest === 4, `broken streak ${JSON.stringify(s3)}`);

// ---- modes ----
for (const m of PLAN_MODES) {
  check(MODE_INFO[m].href.startsWith("/") && MODE_INFO[m].attemptModes.length > 0, `mode info ${m}`);
  for (const a of MODE_INFO[m].attemptModes) check(planModeForAttempt(a) === m, `attempt mode ${a} → ${m}`);
}
check(planModeForAttempt("roulette") === "single-note" && planModeForAttempt("nope") === null, "legacy / unknown attempt modes");

// ---- programme ----
check(STARTER_PROGRAM.length === 8 && STARTER_PROGRAM.every((w, i) => w.week === i + 1 && w.daily.length >= 3), "eight programme weeks");
for (const w of STARTER_PROGRAM) {
  for (const id of w.lessons) check(LESSON_BY_ID.has(id), `week ${w.week} lesson ${id} exists`);
  const full = programDay(w, 0);
  const light = programDay(w, 6);
  check(full.length === w.daily.length && light.length === w.daily.length, "programme day lengths");
  check(full.every((it, i) => it.target === w.daily[i].target && it.id !== w.daily[i].id), "full day copies targets with fresh ids");
  check(light.every((it, i) => it.target === Math.max(1, Math.round(w.daily[i].target / 2)) && (it.hint ?? "").includes("light day")), "light day halves targets");
}

// ---- item progress ----
const it = { id: "x", mode: "chords" as const, target: 30 };
check(itemProgress(it, { chords: 12 }).ratio === 0.4 && !itemProgress(it, { chords: 12 }).complete, "partial progress");
check(itemProgress(it, { chords: 45 }).ratio === 1 && itemProgress(it, { chords: 45 }).complete, "complete by reps");
check(itemProgress({ ...it, done: true }, {}).complete, "complete by hand");

// ---- lessons ----
const ids = new Set<string>();
for (const l of LESSONS) {
  check(!ids.has(l.id), `duplicate lesson id ${l.id}`);
  ids.add(l.id);
  check(l.sections.length >= 2 && l.drills.length >= 1, `${l.id}: sections / drills`);
  for (const s of l.sections) {
    check(s.body.length > 0 && s.body.every((p) => p.length > 40), `${l.id} / ${s.heading}: body`);
    for (const ex of s.examples ?? []) {
      check(ex.steps.length > 0 && ex.steps.every((st) => st.midis.every((m) => m >= 21 && m <= 108)), `${l.id}: example "${ex.label}" midi range`);
      check(ex.steps.every((st) => Math.abs(st.detune ?? 0) <= 100), `${l.id}: example "${ex.label}" detune`);
    }
  }
  for (const d of l.drills) check(d.href.startsWith("/"), `${l.id}: drill href ${d.href}`);
}
const g = glossary();
check(g.length >= 50, `glossary has ${g.length} terms`);
check(g.every((e, i) => i === 0 || g[i - 1].term.localeCompare(e.term) <= 0), "glossary sorted");

// ---- skills on empty stats ----
const empty: StatsData = {
  rangeDays: null,
  totals: { total: 0, correct: 0, avgMs: 0, avgScore: 0 },
  today: { total: 0, correct: 0 },
  streak: { current: 0, longest: 0, activeDays: 0 },
  byDay: [],
  byMode: [],
  byPitchClass: [],
  byOctave: [],
  byInstrument: [],
  confusion: [],
  intervals: [],
  chords: [],
  cents: [],
  centsJndByDay: [],
  sequence: [],
  mistakes: { byType: [], byCents: [], bySource: [] },
  transcribe: { longestCorrectBars: null, longestPassedBars: null, byVoices: [], byBars: [] },
  shadowByDay: [],
  theory: { byKind: [], byLevel: [] },
  promptByDay: [],
  humByDay: [],
};
const skills = computeSkills(empty, []);
check(skills.length === 13 && skills.every((s) => s.stage === 0 && s.value === "–"), `empty skills ${skills.map((s) => `${s.id}:${s.stage}`).join(",")}`);
for (const s of skills) check(LESSON_BY_ID.has(s.lesson), `skill ${s.id} lesson ${s.lesson} exists`);
// a strong pitch skill
const strong = { ...empty, byPitchClass: Array.from({ length: 12 }, (_, pc) => ({ pitchClass: pc, total: 50, correct: 49 })) };
const pitch = computeSkills(strong, [])[0];
check(pitch.id === "pitch" && pitch.stage === 3 && pitch.value === "98 %", `strong pitch ${pitch.stage} ${pitch.value}`);

console.log(failures ? `${failures} practice checks failed` : "all practice checks passed");
process.exit(failures ? 1 : 0);
