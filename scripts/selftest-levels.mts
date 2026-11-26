/**
 * Ladder checks: level definitions (ids, settings keys, gates, lessons, reviews) and the gate
 * evaluator on synthetic reps.
 *   npx tsx scripts/selftest-levels.mts
 */
import { DRILL_BY_ID, drillHref, gateText, LEVELS, nextLevel, previousLevel, type DrillDef } from "../src/lib/practice/levels";
import { COMFORT_KEYS, drillMatches, matchDrill, testKeys } from "../src/lib/practice/auto-count";
import { dailyTarget, evaluateDrill, evaluateLevel, reviewGate, type RepRow } from "../src/lib/practice/gates";
import { LESSON_BY_ID } from "../src/lib/learn/content";
import { DEFAULT_TRAINER_SETTINGS } from "../src/lib/trainer/settings";
import { DEFAULT_TRANSCRIBE_SETTINGS } from "../src/lib/transcribe/settings";
import { DEFAULT_MISTAKES_SETTINGS } from "../src/lib/mistakes/settings";
import { DEFAULT_COMPOSE_SETTINGS } from "../src/lib/compose/settings";
import { MODE_INFO } from "../src/lib/practice/plan";

let failures = 0;
const check = (c: boolean, msg: string) => {
  if (!c) {
    failures++;
    console.error("  ✗", msg);
  }
};

// ---- definitions ----
const defaults = { trainer: DEFAULT_TRAINER_SETTINGS, transcribe: DEFAULT_TRANSCRIBE_SETTINGS, mistakes: DEFAULT_MISTAKES_SETTINGS, compose: DEFAULT_COMPOSE_SETTINGS } as const;
const seen = new Set<string>();
LEVELS.forEach((l, i) => {
  check(l.n === i, `level ${l.id} numbered ${l.n} at position ${i}`);
  check(l.drills.length >= 1 && l.focus.length > 20 && l.mastery.length > 20, `level ${l.id} content`);
  for (const d of l.drills) {
    check(!seen.has(d.id), `duplicate drill id ${d.id}`);
    seen.add(d.id);
    const base = defaults[d.store] as unknown as Record<string, unknown>;
    for (const k of Object.keys(d.patch)) check(k in base, `${d.id}: patch key "${k}" is not a ${d.store} setting`);
    check(MODE_INFO[d.mode] !== undefined, `${d.id}: mode ${d.mode}`);
    check(drillHref(d).startsWith("/"), `${d.id}: href`);
    check(d.gate.window >= 15 && d.gate.accuracy > 0.5 && d.gate.accuracy <= 1 && d.gate.minDays >= 1, `${d.id}: gate ${gateText(d.gate)}`);
    check(d.daily > 0 && d.daily <= d.gate.window, `${d.id}: daily dose ${d.daily} vs window ${d.gate.window}`);
    if (d.gate.spread) check(d.gate.spread.minKeys >= 1 && d.gate.spread.minPerKey >= 1 && d.gate.spread.min > 0, `${d.id}: spread`);
    // the mode a drill opens must match the plan mode it counts for
    if (d.store === "trainer") {
      const expect: Record<string, string> = { single: "single-note", sequence: "sequence", intervals: "intervals", chords: "chords", scales: "scales", cents: "cents" };
      check(expect[d.trainerMode] === d.mode, `${d.id}: trainer mode ${d.trainerMode} vs plan mode ${d.mode}`);
    }
  }
  for (const r of l.review) {
    const owner = LEVELS.findIndex((x) => x.drills.some((d) => d.id === r.drillId));
    check(owner >= 0 && owner < i, `${l.id}: review ${r.drillId} must come from an earlier level`);
    check(r.daily > 0, `${l.id}: review dose`);
  }
  for (const id of l.lessons) check(LESSON_BY_ID.has(id), `${l.id}: lesson ${id} exists`);
});
check(LEVELS[0].id === "L0" && LEVELS[0].drills.length === 1 && LEVELS[0].drills[0].gate.spread?.by === "octave", "level 0 is octaves only");
check((LEVELS[0].drills[0].patch as { rangeLow?: number }).rangeLow === 31, "level 0 starts at G1 (the keys below have no usable fundamental on small speakers)");
const extreme = DRILL_BY_ID.get("extreme-bass");
check(!!extreme && (extreme.patch as { rangeLow?: number; rangeHigh?: number }).rangeLow === 21 && (extreme.patch as { rangeHigh?: number }).rangeHigh === 30 && LEVELS[2].drills.includes(extreme), "the ten lowest keys are their own drill at level 2");
check(nextLevel("L0")?.id === "L1" && previousLevel("L1")?.id === "L0" && nextLevel("mastery") === undefined, "level navigation");
check(DRILL_BY_ID.size === seen.size, "drill index");

// ---- evaluator ----
const octDrill = LEVELS[0].drills[0];
const mk = (n: number, correctRate: number, days: number, octaves: number[]): RepRow[] =>
  Array.from({ length: n }, (_, i) => ({ drillId: octDrill.id, day: `2026-09-${String(1 + (i % days)).padStart(2, "0")}`, correct: i % 100 < correctRate * 100, score: i % 100 < correctRate * 100 ? 1 : 0, targetOctave: octaves[i % octaves.length], target: {} }));

let s = evaluateDrill(octDrill, octDrill.gate, mk(200, 0.97, 4, [0, 1, 2, 3, 4, 5, 6, 7, 8]));
check(s.passed && s.n === 200 && s.days === 4 && s.keysCovered === 9 && s.open.length === 0, `octaves pass: ${JSON.stringify(s.open)} keys=${s.keysCovered}`);
s = evaluateDrill(octDrill, octDrill.gate, mk(120, 0.99, 4, [0, 1, 2, 3, 4, 5, 6, 7, 8]));
check(!s.passed && s.open.some((o) => o.includes("80 more reps")), `window not full: ${s.open.join(" | ")}`);
s = evaluateDrill(octDrill, octDrill.gate, mk(200, 0.9, 4, [0, 1, 2, 3, 4, 5, 6, 7, 8]));
check(!s.passed && s.open.some((o) => o.includes("95 % needed")), `accuracy floor: ${s.open.join(" | ")}`);
s = evaluateDrill(octDrill, octDrill.gate, mk(200, 0.97, 1, [0, 1, 2, 3, 4, 5, 6, 7, 8]));
check(!s.passed && s.open.some((o) => o.includes("3 days")), `min days: ${s.open.join(" | ")}`);
s = evaluateDrill(octDrill, octDrill.gate, mk(200, 0.97, 4, [3, 4, 5]));
check(!s.passed && s.open.some((o) => o.includes("more octave")), `octave coverage: ${s.open.join(" | ")}`);
// one weak octave hidden behind a strong average
const weak: RepRow[] = mk(200, 1, 4, [0, 1, 2, 3, 4, 5, 6, 7, 8]).map((r, i) => (r.targetOctave === 7 && Math.floor(i / 9) % 3 === 0 ? { ...r, correct: false, score: 0 } : r));
s = evaluateDrill(octDrill, octDrill.gate, weak);
check(!s.passed && s.value >= 0.95 && s.open.some((o) => o.includes("octave 7")), `weak octave caught: ${s.open.join(" | ")} value=${s.value}`);
// the window is the newest reps only: old misses stop counting
const oldMisses: RepRow[] = [...mk(200, 1, 4, [0, 1, 2, 3, 4, 5, 6, 7, 8]), ...mk(100, 0, 2, [4])];
s = evaluateDrill(octDrill, octDrill.gate, oldMisses);
check(s.passed, `old misses outside the window ignored: ${s.open.join(" | ")}`);
// score metric
const credit = LEVELS[3].drills.find((d) => d.id === "transcribe-echo-1")!;
const scored: RepRow[] = Array.from({ length: 40 }, (_, i) => ({ drillId: credit.id, day: `2026-09-0${1 + (i % 4)}`, correct: i % 5 !== 0, score: i % 5 === 0 ? 0.6 : 1, targetOctave: null, target: {} }));
s = evaluateDrill(credit, credit.gate, scored);
check(s.passed && Math.abs(s.value - 0.92) < 0.001, `credit gate: value ${s.value} ${s.open.join(" | ")}`);
// review gate is half the window
const rg = reviewGate(octDrill.gate);
check(rg.window === 100 && rg.minDays === 2 && rg.spread?.minKeys === 4, `review gate ${JSON.stringify(rg)}`);
check(dailyTarget(s, 40) === 10 && dailyTarget({ ...s, passed: false }, 40) === 40, "daily target quarters once passed");
// interval spread key from target JSON
const iv = LEVELS[1].drills.find((d) => d.id === "intervals-melodic")!;
const ivRows: RepRow[] = Array.from({ length: 150 }, (_, i) => ({ drillId: iv.id, day: `2026-09-0${1 + (i % 3)}`, correct: true, score: 1, targetOctave: null, target: { intervals: [1 + (i % 12)] } }));
s = evaluateDrill(iv, iv.gate, ivRows);
check(s.passed && s.keysCovered === 12 && s.spread[0].label === "m2", `interval spread: ${s.open.join(" | ")} keys=${s.keysCovered} first=${s.spread[0]?.label}`);

// ---- whole level ----
const rowsByDrill = new Map<string, RepRow[]>([[octDrill.id, mk(200, 0.97, 4, [0, 1, 2, 3, 4, 5, 6, 7, 8])]]);
let lv = evaluateLevel(LEVELS[0], rowsByDrill, new Set());
check(!lv.ready && lv.passedCount === 1 && lv.totalCount === 1 + LEVELS[0].lessons.length, `level 0 needs the lessons: ${lv.passedCount}/${lv.totalCount}`);
lv = evaluateLevel(LEVELS[0], rowsByDrill, new Set(LEVELS[0].lessons));
check(lv.ready, "level 0 ready once lessons are read");
lv = evaluateLevel(LEVELS[LEVELS.length - 1], new Map(), new Set());
check(!lv.ready && lv.level.id === "mastery", "mastery never says ready");

// ---- always count: which drill a rep counts toward without Start ----
const modeOf = (d: DrillDef) => (d.store === "trainer" ? d.trainerMode : d.store === "mistakes" ? null : d.tab);
const applied = (d: DrillDef, extra: Record<string, unknown> = {}) => ({ ...(defaults[d.store] as unknown as Record<string, unknown>), ...(d.patch as Record<string, unknown>), ...extra });
for (const l of LEVELS) {
  for (const d of l.drills) {
    check(drillMatches(d, d.store, modeOf(d), applied(d)), `auto-count: ${d.id} matches its own settings`);
    check(matchDrill(l, d.store, modeOf(d), applied(d))?.id === d.id, `auto-count: ${d.id} is the drill its settings count toward on ${l.id} (got ${matchDrill(l, d.store, modeOf(d), applied(d))?.id})`);
  }
}
const oct = DRILL_BY_ID.get("octaves")!;
const L = (id: string) => LEVELS.find((l) => l.id === id)!;
const octWith = (extra: Record<string, unknown>, mode = "single", level = "L0") => matchDrill(L(level), "trainer", mode, applied(oct, extra))?.id;
check(octWith({ questionCount: 20, autoProceed: false, noteDurationMs: 800, replayLimit: "none", adaptive: false, midiInput: false }) === "octaves", "auto-count: comfort settings never stop a rep counting");
check(octWith({ chordQualities: ["maj"], seqLength: 7, centsMin: 40 }) === "octaves", "auto-count: other modes' settings are ignored");
check(octWith({ tiers: ["chaos"], poolMode: "everything" }) === "octaves", "auto-count: the random pool is irrelevant with a fixed instrument");
check(octWith({ answerMode: "pitch-class" }) === undefined, "auto-count: pitch-class answers don't count toward octaves");
check(octWith({ rangeLow: 21 }) === undefined, "auto-count: a different range doesn't count");
check(octWith({ instrumentId: "gm:violin" }) === undefined, "auto-count: a different instrument doesn't count");
check(octWith({}, "intervals") === undefined, "auto-count: another trainer mode doesn't count");
check(octWith({}, "single", "L1") === "octaves", "auto-count: a review drill counts on a later level");
check(octWith({}, "single", "L2") === undefined, "auto-count: a drill that is neither on the level nor reviewed doesn't count");
const clean = DRILL_BY_ID.get("single-clean")!;
check(matchDrill(L("L1"), "trainer", "single", applied(clean, { instrumentId: "gm:violin" }))?.id === "single-clean", "auto-count: the fixed instrument id is irrelevant in random mode");
check(matchDrill(L("L1"), "trainer", "single", applied(clean, { tiers: ["clean", "hard"] })) === undefined, "auto-count: the random pool matters in random mode");
check(matchDrill(L("L2"), "trainer", "single", applied(DRILL_BY_ID.get("extreme-bass")!))?.id === "extreme-bass", "auto-count: the lowest keys go to their own drill");
check(testKeys(oct).every((k) => !COMFORT_KEYS.has(k)), "auto-count: test keys exclude comfort keys");

console.log(failures ? `${failures} ladder checks failed` : `all ladder checks passed (${LEVELS.length} levels, ${seen.size} drills)`);
process.exit(failures ? 1 : 0);
