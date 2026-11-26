/**
 * Difficulty dial checks: every preset writes real settings, levels differ, and a level that was
 * applied is detected again (from the defaults and from any other level).
 *   npx tsx scripts/selftest-difficulty.mts
 */
import { DIALS, detectDialLevel, dialLevelPatch, getDial, type DialId } from "../src/lib/practice/difficulty";
import { DEFAULT_TRAINER_SETTINGS } from "../src/lib/trainer/settings";
import { DEFAULT_TRANSCRIBE_SETTINGS } from "../src/lib/transcribe/settings";
import { DEFAULT_MISTAKES_SETTINGS } from "../src/lib/mistakes/settings";
import { DEFAULT_COMPOSE_SETTINGS } from "../src/lib/compose/settings";
import { chordQualityPool, randomChordSpec } from "../src/lib/music/chords";
import { generateChord } from "../src/lib/trainer/generators";
import { getInstrument } from "../src/lib/audio/instruments";
import { SCALE_DEFS } from "../src/lib/music/scales";
import { PROBLEM_TYPES } from "../src/lib/mistakes/types";
import { MAX_LEVEL } from "../src/lib/compose/theory";

let failures = 0;
const check = (c: boolean, msg: string) => {
  if (!c) {
    failures++;
    console.error("  ✗", msg);
  }
};

const defaults: Record<string, Record<string, unknown>> = {
  trainer: DEFAULT_TRAINER_SETTINGS as unknown as Record<string, unknown>,
  transcribe: DEFAULT_TRANSCRIBE_SETTINGS as unknown as Record<string, unknown>,
  mistakes: DEFAULT_MISTAKES_SETTINGS as unknown as Record<string, unknown>,
  compose: DEFAULT_COMPOSE_SETTINGS as unknown as Record<string, unknown>,
};

const ALL_IDS: DialId[] = ["single", "sequence", "intervals", "chords", "scales", "cents", "transcribe", "mistakes", "theory", "prompt", "hum"];
check(DIALS.length === ALL_IDS.length && ALL_IDS.every((id) => DIALS.some((d) => d.id === id)), "one dial per activity");

let levelCount = 0;
for (const dial of DIALS) {
  const base = defaults[dial.store];
  const want = dial.id === "hum" ? 4 : 8;
  check(dial.levels.length === want, `${dial.id}: ${dial.levels.length} levels, expected ${want}`);
  check(dial.label.length > 2, `${dial.id}: label`);
  const patches = dial.levels.map((l) => l.patch as Record<string, unknown>);

  dial.levels.forEach((l, i) => {
    levelCount++;
    check(l.n === i + 1, `${dial.id}: level numbered ${l.n} at position ${i}`);
    check(l.title.length > 2 && l.summary.length > 8, `${dial.id} ${l.n}: title and summary`);
    const patch = patches[i];
    for (const k of Object.keys(patch)) {
      check(k in base, `${dial.id} ${l.n}: patch key "${k}" is not a ${dial.store} setting`);
      // same shape as the default: a string stays a string, a list a list
      if (k in base) check(typeof patch[k] === typeof base[k] && Array.isArray(patch[k]) === Array.isArray(base[k]), `${dial.id} ${l.n}: "${k}" has the wrong type`);
    }
    check(dialLevelPatch(dial, l.n) === l.patch, `${dial.id} ${l.n}: dialLevelPatch`);
    if (i > 0) {
      const prev = patches[i - 1];
      // cumulative: nothing set earlier is dropped
      check(Object.keys(prev).every((k) => k in patch), `${dial.id} ${l.n}: keeps every key of level ${l.n - 1}`);
      check(JSON.stringify(prev) !== JSON.stringify(patch), `${dial.id} ${l.n}: differs from level ${l.n - 1}`);
    }
    // apply to the defaults, detect it again
    const applied = { ...base, ...patch };
    check(detectDialLevel(dial, applied) === l.n, `${dial.id} ${l.n}: applied to the defaults, detected as ${detectDialLevel(dial, applied)}`);
    // apply after any other level (going down must not leave a higher level detected)
    for (let j = 0; j < patches.length; j++) {
      const via = { ...base, ...patches[j], ...patch };
      const got = detectDialLevel(dial, via);
      check(got === l.n, `${dial.id}: level ${j + 1} then level ${l.n} detected as ${got}`);
    }
    // a hand edit of any patched key is custom or another level, never this one
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      const edited = typeof v === "boolean" ? !v : typeof v === "number" ? v + 1 : typeof v === "string" ? `${v}-edited` : Array.isArray(v) ? [...v, typeof v[0] === "boolean" ? false : typeof v[0] === "number" ? 999 : "edited"] : { ...(v as object), edited: true };
      check(detectDialLevel(dial, { ...applied, [k]: edited }) !== l.n, `${dial.id} ${l.n}: editing "${k}" should leave the level`);
    }
  });
  check(dialLevelPatch(dial, 99) === undefined, `${dial.id}: level 99 does not exist`);

  // the defaults are a level or custom, never an error
  try {
    const d = detectDialLevel(dial, base);
    check(d === null || (d >= 1 && d <= dial.levels.length), `${dial.id}: defaults detect as ${d}`);
    check(detectDialLevel(dial, {}) === null, `${dial.id}: empty settings are custom`);
  } catch (e) {
    check(false, `${dial.id}: detect threw on the defaults: ${String(e)}`);
  }
}
check(getDial("theory").levels.length === 8 && getDial("hum").levels.length === 4, "Theory has 8 levels, Hum 4");

// order inside set-like lists does not matter; it does for pitch classes
const single = getDial("single");
const s5 = { ...defaults.trainer, ...(single.levels[4].patch as object), tiers: ["chaos", "clean", "hard"] };
check(detectDialLevel(single, s5) === 5, "tiers in another order are still level 5");
const pcs = Array(12).fill(true);
pcs[3] = false;
check(detectDialLevel(single, { ...s5, pitchClasses: pcs }) === null, "a narrowed note pool is custom");
const mistakes = getDial("mistakes");
const m8 = mistakes.levels[7].patch as { types: Record<string, boolean> };
check(detectDialLevel(mistakes, { ...defaults.mistakes, ...m8, types: Object.fromEntries(Object.entries(m8.types).reverse()) }) === 8, "problem types in another key order are still level 8");

// ---- the values point at real things ----
for (const dial of DIALS) {
  for (const l of dial.levels) {
    const p = l.patch as Record<string, unknown>;
    if (typeof p.instrumentId === "string") check(!!getInstrument(p.instrumentId), `${dial.id} ${l.n}: instrument ${p.instrumentId}`);
    if (Array.isArray(p.scaleSet)) for (const id of p.scaleSet as string[]) check(SCALE_DEFS.some((d) => d.id === id), `${dial.id} ${l.n}: scale ${id}`);
    if (p.types) check(PROBLEM_TYPES.every((t) => typeof (p.types as Record<string, unknown>)[t] === "boolean") && Object.values(p.types as object).some(Boolean), `${dial.id} ${l.n}: full problem-type record with something on`);
    if (typeof p.theoryLevel === "number") check(p.theoryLevel >= 1 && p.theoryLevel <= MAX_LEVEL, `${dial.id} ${l.n}: theory level ${p.theoryLevel}`);
    if (typeof p.centsMin === "number" && typeof p.centsMax === "number") check(p.centsMin >= 5 && p.centsMin < p.centsMax && p.centsMax <= 50, `${dial.id} ${l.n}: cents ${p.centsMin}–${p.centsMax}`);
    if (typeof p.rangeLow === "number") check(p.rangeLow >= 21 && p.rangeLow < (p.rangeHigh as number), `${dial.id} ${l.n}: range`);
  }
}
const scales = getDial("scales");
check((scales.levels[4].patch as { scaleSet: string[] }).scaleSet.length === 9 && (scales.levels[5].patch as { scaleSet: string[] }).scaleSet.length === 12, "scales: nine seven-note scales at level 5, twelve at level 6");
const theory = getDial("theory");
check(theory.levels.slice(0, 6).every((l, i) => (l.patch as { theoryLevel: number; theoryMixLower: boolean }).theoryLevel === i + 1 && !(l.patch as { theoryMixLower: boolean }).theoryMixLower), "theory 1–6 are the theory levels on their own");

// ---- chord qualities filter ----
const chords = getDial("chords");
const c1 = chords.levels[0].patch as { chordQualities: string[]; chordCategories: ("triads" | "sevenths" | "extended" | "sus-add" | "altered")[] };
check(JSON.stringify(c1.chordQualities) === JSON.stringify(["maj", "min"]), "chords level 1 narrows to major and minor");
for (let i = 0; i < 300; i++) {
  const spec = randomChordSpec({ categories: c1.chordCategories, qualities: c1.chordQualities, inversions: false, voicings: ["closed"] });
  check(spec.qualityId === "maj" || spec.qualityId === "min", `level 1 chord spec was ${spec.qualityId}`);
  check(spec.inversion === 0, "level 1 chords are in root position");
}
check(chordQualityPool(["triads"], []).length === 4, "no qualities named = every triad");
check(chordQualityPool(["triads"]).length === 4, "qualities are optional");
check(chordQualityPool(["sevenths"], ["maj", "min"]).length === chordQualityPool(["sevenths"]).length, "qualities outside the categories fall back to the whole pool");
check(chordQualityPool([], ["maj7"]).length === 1, "qualities narrow the full list when no category is chosen");
const seenQualities = new Set<string>();
for (let i = 0; i < 300; i++) seenQualities.add(randomChordSpec({ categories: ["triads"], qualities: [], inversions: false, voicings: ["closed"] }).qualityId);
check(seenQualities.size === 4, `level 2 reaches all four triads (saw ${[...seenQualities].join(", ")})`);

// through the real generator, with the level 1 bundle on top of the defaults
const piano = getInstrument("gm:acoustic_grand_piano")!;
const l1 = { ...DEFAULT_TRAINER_SETTINGS, ...(chords.levels[0].patch as object), adaptive: false };
for (let i = 0; i < 200; i++) {
  const q = await generateChord(l1, async () => piano.id);
  check(q.kind === "chord" && (q.spec?.qualityId === "maj" || q.spec?.qualityId === "min") && q.notes.length === 3, `generated level 1 chord: ${q.kind} ${q.spec?.qualityId}`);
}

console.log(failures ? `${failures} difficulty dial checks failed` : `all difficulty dial checks passed (${DIALS.length} dials, ${levelCount} levels)`);
process.exit(failures ? 1 : 0);
