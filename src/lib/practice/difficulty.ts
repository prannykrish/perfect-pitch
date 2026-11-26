/**
 * Difficulty dials: one numbered dial per activity. Picking a number writes a coherent bundle of
 * settings into that activity's store, so free practice at "chords level 3" is one click instead of
 * a dozen switches. Pure data.
 *
 * Every step below is written as the change on top of the previous level ("set"); the steps are
 * folded into full patches, so applying level n writes the complete bundle. Tuning a step is one line.
 *
 * The dials are a playground beside the ladder: reps from a dial are free practice and never count
 * toward a gate. Using a dial during a ladder run is a hand edit like any other.
 */
import type { TrainerSettings } from "@/lib/trainer/settings";
import type { TranscribeSettings } from "@/lib/transcribe/settings";
import type { MistakesSettings } from "@/lib/mistakes/settings";
import type { ComposeSettings } from "@/lib/compose/settings";
import { PROBLEM_TYPES, type ProblemType } from "@/lib/mistakes/types";

export type DialId = "single" | "sequence" | "intervals" | "chords" | "scales" | "cents" | "transcribe" | "mistakes" | "theory" | "prompt" | "hum";
export type DialStore = "trainer" | "transcribe" | "mistakes" | "compose";

export interface DialLevel<S> {
  n: number;
  /** Two or three words: what this step adds. */
  title: string;
  /** One line shown under the dial. */
  summary: string;
  /** The full bundle (every earlier step folded in). */
  patch: Partial<S>;
}

interface DialOf<Store extends DialStore, S> {
  id: DialId;
  label: string;
  store: Store;
  levels: DialLevel<S>[];
}

export type Dial = DialOf<"trainer", TrainerSettings> | DialOf<"transcribe", TranscribeSettings> | DialOf<"mistakes", MistakesSettings> | DialOf<"compose", ComposeSettings>;

interface Step<S> {
  title: string;
  summary: string;
  /** What changes on top of the previous level. */
  set: Partial<S>;
}

/** Fold cumulative steps into full patches. */
function fold<S>(base: Partial<S>, steps: Step<S>[]): DialLevel<S>[] {
  let acc: Partial<S> = { ...base };
  return steps.map((st, i) => {
    acc = { ...acc, ...st.set };
    return { n: i + 1, title: st.title, summary: st.summary, patch: { ...acc } };
  });
}

const PIANO = "gm:acoustic_grand_piano";

/** Every trainer dial pins these, so a narrowed note pool or answer mode never hides inside a level. */
const TRAINER_BASE: Partial<TrainerSettings> = { answerMode: "pitch-octave", useRealisticRange: true, pitchClasses: Array(12).fill(true) as boolean[], rangeHigh: 108 };

const MAJOR_MINOR = ["major", "natural-minor", "harmonic-minor", "melodic-minor"];
const SEVEN_NOTE = [...MAJOR_MINOR, "dorian", "phrygian", "lydian", "mixolydian", "locrian"];

/** The full problem-type record with only the listed types switched on. */
function types(...on: ProblemType[]): Record<ProblemType, boolean> {
  return Object.fromEntries(PROBLEM_TYPES.map((t) => [t, on.includes(t)])) as Record<ProblemType, boolean>;
}

const THEORY_TITLES = ["Triads, major and minor scales", "Inversions, sevenths, modes", "Seventh inversions, open voicings", "Extensions, altered, drop-2", "Progressions in a key", "Harmonise a melody"];

export const DIALS: Dial[] = [
  {
    id: "single",
    label: "Single note",
    store: "trainer",
    levels: fold<TrainerSettings>(TRAINER_BASE, [
      { title: "Piano", summary: "Piano only, G1 to C8, 1.5 s notes, unlimited replays.", set: { instrumentMode: "fixed", instrumentId: PIANO, poolMode: "all", tiers: ["clean", "hard"], rangeLow: 31, noteDurationMs: 1500, replayLimit: "unlimited" } },
      { title: "Clean instruments", summary: "A random clean-tier instrument every question.", set: { instrumentMode: "random-question", poolMode: "all", families: [], tiers: ["clean"] } },
      { title: "Hard instruments", summary: "Adds the hard tier: short, noisy and wobbly sounds.", set: { tiers: ["clean", "hard"] } },
      { title: "Full keyboard", summary: "The range opens down to A0 (the lowest keys need headphones or real speakers).", set: { rangeLow: 21 } },
      { title: "Timbre roulette", summary: "A new sound every question, chaos tier and synths included.", set: { poolMode: "everything", tiers: ["clean", "hard", "chaos"] } },
      { title: "Short notes", summary: "Notes last 0.8 s.", set: { noteDurationMs: 800 } },
      { title: "One replay", summary: "One replay per question.", set: { replayLimit: "one" } },
      { title: "One shot", summary: "No replays, and notes last 0.5 s.", set: { replayLimit: "none", noteDurationMs: 500 } },
    ]),
  },
  {
    id: "sequence",
    label: "Sequence",
    store: "trainer",
    levels: fold<TrainerSettings>(TRAINER_BASE, [
      { title: "Two notes", summary: "Two piano notes, slow, no jump bigger than a fifth, G1 and up.", set: { seqLength: 2, seqGapMs: 800, seqMaxLeap: 7, instrumentMode: "fixed", instrumentId: PIANO, rangeLow: 31, replayLimit: "unlimited" } },
      { title: "Three notes", summary: "Three notes.", set: { seqLength: 3 } },
      { title: "Four notes, octave jumps", summary: "Four notes, with jumps up to an octave.", set: { seqLength: 4, seqMaxLeap: 12 } },
      { title: "Five notes, any instrument", summary: "Five notes on a random instrument each question, full keyboard.", set: { seqLength: 5, instrumentMode: "random-question", poolMode: "all", tiers: ["clean", "hard"], rangeLow: 21 } },
      { title: "Six notes, instrument per note", summary: "Six notes, every note on a different instrument.", set: { seqLength: 6, instrumentMode: "random-note" } },
      { title: "Eight notes, fast", summary: "Eight notes with a 0.4 s gap.", set: { seqLength: 8, seqGapMs: 400 } },
      { title: "Ten notes, wide jumps", summary: "Ten notes, with jumps up to two octaves.", set: { seqLength: 10, seqMaxLeap: 24 } },
      { title: "Twelve notes, one shot", summary: "Twelve notes and no replays.", set: { seqLength: 12, replayLimit: "none" } },
    ]),
  },
  {
    id: "intervals",
    label: "Intervals",
    store: "trainer",
    levels: fold<TrainerSettings>(TRAINER_BASE, [
      { title: "Rising pairs", summary: "Two piano notes, one after the other, going up. Every interval up to an octave.", set: { intervalVariant: "pair", intervalPlayback: "melodic", intervalDirection: "asc", intervalCompound: false, intervalSet: [], intervalGapMs: 600, instrumentMode: "fixed", instrumentId: PIANO } },
      { title: "Up and down", summary: "Pairs go up or down.", set: { intervalDirection: "both" } },
      { title: "Harmonic", summary: "Both notes sound together.", set: { intervalPlayback: "harmonic" } },
      { title: "Compound", summary: "Melodic pairs again, now with 9ths and up, to two octaves.", set: { intervalPlayback: "melodic", intervalCompound: true } },
      { title: "Chain of three", summary: "Three notes in a row: name both intervals. Simple intervals only.", set: { intervalVariant: "chain", intervalChainLength: 3, intervalCompound: false } },
      { title: "Chain of five, instrument per note", summary: "Five notes, four intervals, every note on a different instrument.", set: { intervalChainLength: 5, instrumentMode: "random-note", poolMode: "all", tiers: ["clean", "hard"] } },
      { title: "Stack of three", summary: "Three piano notes together: name each interval from the bottom note.", set: { intervalVariant: "stack", intervalStackSize: 3, instrumentMode: "fixed", instrumentId: PIANO } },
      { title: "Stack of four, compound", summary: "Four notes together, compound intervals included.", set: { intervalStackSize: 4, intervalCompound: true } },
    ]),
  },
  {
    id: "chords",
    label: "Chords & clusters",
    store: "trainer",
    levels: fold<TrainerSettings>(TRAINER_BASE, [
      {
        title: "Major and minor",
        summary: "Major and minor triads only, root position, closed, on piano. Answer root and quality.",
        set: { chordKind: "chords", chordAnswer: "root-quality", chordCategories: ["triads"], chordQualities: ["maj", "min"], chordInversions: false, chordAskInversion: false, chordVoicings: ["closed"], chordPlayback: "blocked", instrumentMode: "fixed", instrumentId: PIANO },
      },
      { title: "All four triads", summary: "Adds diminished and augmented.", set: { chordQualities: [] } },
      { title: "Sus and add, inversions", summary: "Adds sus and add chords; inversions are played, not asked.", set: { chordCategories: ["triads", "sus-add"], chordInversions: true } },
      { title: "Sevenths", summary: "Adds 6ths and every seventh chord.", set: { chordCategories: ["triads", "sus-add", "sevenths"] } },
      { title: "Name the inversion", summary: "The inversion is part of the answer.", set: { chordAskInversion: true } },
      { title: "Extensions", summary: "Adds 9ths, 11ths and 13ths.", set: { chordCategories: ["triads", "sus-add", "sevenths", "extended"] } },
      { title: "Altered, open and drop-2", summary: "Adds altered chords, in closed, open and drop-2 voicings.", set: { chordCategories: ["triads", "sus-add", "sevenths", "extended", "altered"], chordVoicings: ["closed", "open", "drop2"] } },
      {
        title: "Every note, any sound",
        summary: "Chords and random clusters of 3 to 5 notes on any instrument: answer every note, bottom to top.",
        set: { chordKind: "mixed", chordAnswer: "notes", chordNotesOrder: "bottom-up", clusterMin: 3, clusterMax: 5, clusterSpan: 24, instrumentMode: "random-question", poolMode: "all", tiers: ["clean", "hard"] },
      },
    ]),
  },
  {
    id: "scales",
    label: "Scales & modes",
    store: "trainer",
    levels: fold<TrainerSettings>(TRAINER_BASE, [
      {
        title: "Major or minor",
        summary: "Piano runs: major or natural minor, plus the tonic.",
        set: { scaleVariant: "run", scaleDirection: "random", scaleSet: ["major", "natural-minor"], scaleAskTonic: true, scaleRunNoteMs: 280, scaleMelodyNotes: 8, scaleMelodyBpm: 100, instrumentMode: "fixed", instrumentId: PIANO },
      },
      { title: "Three minors", summary: "Adds harmonic and melodic minor.", set: { scaleSet: MAJOR_MINOR } },
      { title: "The modes", summary: "Adds dorian, phrygian, lydian, mixolydian and locrian.", set: { scaleSet: SEVEN_NOTE } },
      { title: "Melodies", summary: "Short melodies instead of runs; back to major and the three minors.", set: { scaleVariant: "melody", scaleSet: MAJOR_MINOR } },
      { title: "Modal melodies", summary: "Melodies in all nine seven-note scales.", set: { scaleSet: SEVEN_NOTE } },
      { title: "Pentatonics and blues", summary: "Runs and melodies; adds both pentatonics and the blues scale.", set: { scaleVariant: "both", scaleSet: [...SEVEN_NOTE, "major-pentatonic", "minor-pentatonic", "blues"] } },
      { title: "Every scale", summary: "All fifteen scales, with ten-note melodies.", set: { scaleSet: [], scaleMelodyNotes: 10 } },
      { title: "Fast melodies, any sound", summary: "Melodies only: twelve notes at 120 bpm on a random instrument.", set: { scaleVariant: "melody", scaleMelodyNotes: 12, scaleMelodyBpm: 120, instrumentMode: "random-question", poolMode: "all", tiers: ["clean", "hard"] } },
    ]),
  },
  {
    id: "cents",
    label: "Cents",
    store: "trainer",
    levels: fold<TrainerSettings>(TRAINER_BASE, [
      { title: "30 to 50 cents", summary: "One piano note: flat, sharp or in tune, 30 to 50 cents off.", set: { centsVariant: "single", centsMin: 30, centsMax: 50, centsInTuneChance: 0.15, instrumentMode: "fixed", instrumentId: PIANO } },
      { title: "20 to 50 cents", summary: "Down to 20 cents.", set: { centsMin: 20 } },
      { title: "15 to 40 cents", summary: "15 to 40 cents.", set: { centsMin: 15, centsMax: 40 } },
      { title: "10 to 30 cents", summary: "10 to 30 cents.", set: { centsMin: 10, centsMax: 30 } },
      { title: "Which of two", summary: "Two notes, one of them off by 15 to 40 cents: which one?", set: { centsVariant: "pair", centsMin: 15, centsMax: 40 } },
      { title: "Two notes, 10 to 30", summary: "Two notes, 10 to 30 cents.", set: { centsMin: 10, centsMax: 30 } },
      { title: "Inside a triad", summary: "A triad with one member off by 10 to 30 cents: which one?", set: { centsVariant: "chord" } },
      { title: "5 to 20 cents, any sound", summary: "Triads on a random instrument, 5 to 20 cents.", set: { centsMin: 5, centsMax: 20, instrumentMode: "random-question", poolMode: "all", tiers: ["clean", "hard"] } },
    ]),
  },
  {
    id: "transcribe",
    label: "Hear It, Play It",
    store: "transcribe",
    levels: fold<TranscribeSettings>({}, [
      {
        title: "One bar",
        summary: "One-bar stepwise melodies in quarter notes, random key. Pitch and order graded; replay freely.",
        set: { source: "generated", drill: "echo", genBars: 1, genVoices: 1, genStyle: "stepwise", genRhythm: "quarters", genKey: -1, rhythm: false, oneListen: false, octaveInsensitive: false, passThreshold: 0.9 },
      },
      { title: "Two bars, real melodies", summary: "Two bars, mixed motion and mixed rhythm.", set: { genBars: 2, genStyle: "mixed", genRhythm: "mixed" } },
      { title: "Ladder", summary: "The phrase grows each time you pass and shrinks when you miss.", set: { drill: "ladder" } },
      { title: "Bach soprano", summary: "Walk a Bach chorale bar by bar: the soprano line alone.", set: { source: "bach", drill: "chunk", voices: [0], phraseBars: 1, tempoScale: 1 } },
      { title: "Soprano and bass", summary: "The two outer voices together.", set: { voices: [0, 3] } },
      { title: "All four voices", summary: "The whole chorale texture.", set: { voices: [] } },
      { title: "Two bars with rhythm", summary: "Two-bar chunks, and the rhythm is graded (within a quarter beat).", set: { phraseBars: 2, rhythm: true, rhythmTolerance: 0.25 } },
      { title: "One listen", summary: "Each chunk is heard once.", set: { oneListen: true } },
    ]),
  },
  {
    id: "mistakes",
    label: "Find the Mistake",
    store: "mistakes",
    levels: fold<MistakesSettings>({}, [
      {
        title: "Detuned note",
        summary: "A piano melody with one note 30 to 50 cents off. The clean version plays first.",
        set: { types: types("detune"), source: "melody", centsMin: 30, centsMax: 50, referenceFirst: true, askFix: true, askAmount: true, instrumentMode: "fixed", instrumentId: PIANO, oneListen: false },
      },
      { title: "Wrong notes, no reference", summary: "Adds wrong notes; detunes from 20 cents; no clean version first.", set: { types: types("detune", "wrong-note"), centsMin: 20, referenceFirst: false } },
      { title: "Chords and rhythm", summary: "Adds wrong chord qualities and rhythm slips, in melodies and progressions.", set: { types: types("detune", "wrong-note", "chord-quality", "rhythm"), source: "auto", autoSources: ["melody", "progression"] } },
      { title: "Inversions", summary: "Adds wrong inversions and voicings; detunes 15 to 40 cents.", set: { types: types("detune", "wrong-note", "chord-quality", "rhythm", "inversion"), centsMin: 15, centsMax: 40 } },
      { title: "Chorales", summary: "Bach chorales only: a drifting voice or parallel fifths and octaves; 10 to 30 cents.", set: { types: types("drift", "voice-leading"), source: "bach", bachRandom: true, bachBars: 2, centsMin: 10, centsMax: 30 } },
      { title: "Everything mixed", summary: "Every problem type except A/B, in every kind of material.", set: { types: types("detune", "wrong-note", "chord-quality", "inversion", "rhythm", "drift", "voice-leading"), source: "auto", autoSources: ["melody", "progression", "voices", "bach"], centsMin: 10, centsMax: 30 } },
      { title: "5 to 20 cents, mixed band", summary: "5 to 20 cents, with a different instrument on each voice.", set: { centsMin: 5, centsMax: 20, instrumentMode: "per-voice" } },
      { title: "One listen, with A/B", summary: "Adds A/B questions; everything is heard once; 5 to 15 cents.", set: { types: types(...PROBLEM_TYPES), oneListen: true, centsMin: 5, centsMax: 15 } },
    ]),
  },
  {
    id: "theory",
    label: "Theory drills",
    store: "compose",
    levels: fold<ComposeSettings>({ theoryMixLower: false, theoryKinds: [], theoryStrictness: "strict", theoryAutoSubmitMs: 1200 }, [
      ...THEORY_TITLES.map((title, i): Step<ComposeSettings> => ({ title, summary: `Theory level ${i + 1} on its own, exact voicing, answer taken after 1.2 s of silence.`, set: { theoryLevel: i + 1 } })),
      { title: "Everything mixed", summary: "Level 6 with every lower level mixed in.", set: { theoryLevel: 6, theoryMixLower: true } },
      { title: "No time to think", summary: "Everything mixed; the answer is taken after 0.7 s of silence.", set: { theoryAutoSubmitMs: 700 } },
    ]),
  },
  {
    id: "prompt",
    label: "Prompt drill",
    store: "compose",
    levels: fold<ComposeSettings>({}, [
      { title: "Two bars", summary: "Two bars over triads, 12 s to imagine, click and backing chords on.", set: { promptBars: 2, promptCountdownSec: 12, promptClick: true, promptBacking: true, promptSevenths: false, promptMood: false, promptSeed: false } },
      { title: "Four bars", summary: "Four bars, 10 s to imagine.", set: { promptBars: 4, promptCountdownSec: 10 } },
      { title: "Sevenths and a mood", summary: "Seventh chords and a mood word, 8 s to imagine.", set: { promptCountdownSec: 8, promptSevenths: true, promptMood: true } },
      { title: "From a seed", summary: "A one-bar motif to start from, 6 s to imagine.", set: { promptCountdownSec: 6, promptSeed: true } },
      { title: "Eight bars", summary: "Eight bars, 8 s to imagine.", set: { promptBars: 8, promptCountdownSec: 8 } },
      { title: "No backing", summary: "The chords are no longer played underneath; 6 s to imagine.", set: { promptBacking: false, promptCountdownSec: 6 } },
      { title: "Four seconds", summary: "4 s to imagine.", set: { promptCountdownSec: 4 } },
      { title: "No click", summary: "3 s to imagine and no click: you keep the time.", set: { promptCountdownSec: 3, promptClick: false } },
    ]),
  },
  {
    id: "hum",
    label: "Hum then play",
    store: "compose",
    levels: fold<ComposeSettings>({}, [
      { title: "Forgiving", summary: "Any octave counts; a forgiving mic gate and long pauses before it stops listening.", set: { humOctaveInsensitive: true, humMinClarity: 0.85, humMinLevel: 0.008, humMinNoteMs: 90, humSilenceMs: 2500, humPlaySilenceMs: 2000 } },
      { title: "Standard", summary: "A stricter mic gate and shorter pauses.", set: { humMinClarity: 0.9, humMinLevel: 0.01, humSilenceMs: 1800, humPlaySilenceMs: 1500 } },
      { title: "Exact octave", summary: "You have to play it in the octave you hummed.", set: { humOctaveInsensitive: false } },
      { title: "Quick", summary: "Short pauses, and notes as short as 70 ms count.", set: { humSilenceMs: 1200, humPlaySilenceMs: 1000, humMinNoteMs: 70 } },
    ]),
  },
];

export const DIAL_BY_ID = new Map<DialId, Dial>(DIALS.map((d) => [d.id, d]));

export function getDial(id: DialId): Dial {
  const dial = DIAL_BY_ID.get(id);
  if (!dial) throw new Error(`unknown dial ${id}`);
  return dial;
}

/**
 * A value in a comparable form: lists of names or numbers ignore order (they are sets: tiers,
 * categories, voices), records ignore key order. Lists of booleans (pitch classes) keep theirs.
 */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) {
    const items = v.map(canon);
    if (items.every((x) => typeof x === "string" || typeof x === "number")) return [...items].sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
    return items;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, canon(o[k])])
    );
  }
  return v;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** The full bundle for level n, or undefined when the dial has no such level. */
export function dialLevelPatch(dial: Dial, n: number): Dial["levels"][number]["patch"] | undefined {
  return dial.levels.find((l) => l.n === n)?.patch;
}

/**
 * Which level the live settings are at: the highest level whose full bundle matches on every key.
 * Null means custom (a setting was changed by hand, or no level was ever picked).
 */
export function detectDialLevel(dial: Dial, settings: object): number | null {
  const live = settings as Record<string, unknown>;
  for (let i = dial.levels.length - 1; i >= 0; i--) {
    const patch = dial.levels[i].patch as Record<string, unknown>;
    if (Object.keys(patch).every((k) => same(patch[k], live[k]))) return dial.levels[i].n;
  }
  return null;
}
