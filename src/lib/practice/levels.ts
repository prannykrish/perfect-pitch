/**
 * The ladder: levels made of drills with exact settings and mastery gates, plus the lessons to read.
 * You stay on a level until every gate holds; the app says when it thinks you are ready and you
 * press Advance. Pure data.
 *
 * Gate rules (see gates.ts): a rolling window of the most recent reps done from the drill, an
 * accuracy floor over that window, at least `minDays` distinct practice days inside it, and where
 * it matters a spread rule (every octave / interval / quality / scale in the window at its own floor).
 */
import type { TrainerSettings } from "@/lib/trainer/settings";
import type { TranscribeSettings } from "@/lib/transcribe/settings";
import type { MistakesSettings } from "@/lib/mistakes/settings";
import type { ComposeSettings } from "@/lib/compose/settings";
import type { PlanMode } from "./plan";

export type GateMetric = "correct" | "score";
export type SpreadBy = "octave" | "interval" | "quality" | "scale";

export interface Gate {
  /** Number of most recent reps the gate looks at. */
  window: number;
  /** Accuracy (share correct) or average credit the window must reach. */
  accuracy: number;
  metric: GateMetric;
  /** Distinct practice days that must appear inside the window. */
  minDays: number;
  spread?: {
    by: SpreadBy;
    /** Every key seen at least `minPerKey` times must reach `min`. */
    min: number;
    minPerKey: number;
    /** At least this many distinct keys must have `minPerKey` reps. */
    minKeys: number;
  };
}

interface DrillBase {
  id: string;
  label: string;
  mode: PlanMode;
  /** The settings in words, shown on the card. */
  summary: string;
  gate: Gate;
  /** Suggested reps per day while the gate is open. */
  daily: number;
}

export type DrillDef = DrillBase &
  (
    | { store: "trainer"; trainerMode: "single" | "sequence" | "intervals" | "chords" | "scales" | "cents"; patch: Partial<TrainerSettings> }
    | { store: "transcribe"; tab: "phrases" | "shadow"; patch: Partial<TranscribeSettings> }
    | { store: "mistakes"; patch: Partial<MistakesSettings> }
    | { store: "compose"; tab: "theory" | "prompt" | "hum"; patch: Partial<ComposeSettings> }
  );

export interface ReviewRef {
  /** Drill id from an earlier level. */
  drillId: string;
  /** Maintenance reps per day. */
  daily: number;
}

export interface LevelDef {
  id: string;
  n: number;
  title: string;
  focus: string;
  /** What "done" means, in one sentence. */
  mastery: string;
  drills: DrillDef[];
  /** Earlier drills kept sharp; their gate must still hold (over a shorter window) for the level to close. */
  review: ReviewRef[];
  lessons: string[];
}

const PIANO = "gm:acoustic_grand_piano";
const ALL_PCS = Array(12).fill(true) as boolean[];

/** Reps at the level's settings only; hard defaults everywhere the drill does not say otherwise. */
const TRAINER_BASE: Partial<TrainerSettings> = { pitchClasses: ALL_PCS, useRealisticRange: true, rangeLow: 21, rangeHigh: 108, answerMode: "pitch-octave", chordQualities: [], adaptive: true, replayLimit: "unlimited", noteDurationMs: 1500, questionCount: 0, autoProceed: true };

const hearing = (window: number, accuracy: number, spread?: Gate["spread"]): Gate => ({ window, accuracy, metric: "correct", minDays: 3, spread });
const credit = (window: number, accuracy: number): Gate => ({ window, accuracy, metric: "score", minDays: 3 });
const octaves = (minKeys: number, minPerKey = 6): Gate["spread"] => ({ by: "octave", min: 0.9, minPerKey, minKeys });

export const LEVELS: LevelDef[] = [
  {
    id: "L0",
    n: 0,
    title: "Octaves",
    focus: "The note is never the problem. Which octave it sits in is. Nothing else until this is automatic.",
    mastery: "The last 200 notes at 95 % across three practice days, every octave that comes up often enough at 90 % on its own, and at least seven octaves covered. The range starts at G1: below that the app's piano samples carry no fundamental and small speakers cannot play one anyway, so those ten keys get their own drill at level 2.",
    drills: [
      {
        id: "octaves",
        label: "Single note, piano, pitch + octave",
        mode: "single-note",
        store: "trainer",
        trainerMode: "single",
        summary: "Piano only, G1–C8, answer pitch and octave (piano, buttons or keys).",
        patch: { ...TRAINER_BASE, rangeLow: 31, instrumentMode: "fixed", instrumentId: PIANO, poolMode: "all", tiers: ["clean", "hard"] },
        // 200 reps over 78 keys is about 2.6 per key; octave 8 is a single key and octave 1 five keys,
        // so seven covered octaves (1–7) is the fair requirement.
        gate: hearing(200, 0.95, { by: "octave", min: 0.9, minPerKey: 6, minKeys: 7 }),
        daily: 120,
      },
    ],
    review: [],
    lessons: ["notes-and-pitch", "registers-and-octaves", "how-the-ladder-works"],
  },
  {
    id: "L1",
    n: 1,
    title: "Foundation",
    focus: "Octaves on other clean sounds, the twelve simple intervals, the four triads by name, major and minor by ear.",
    mastery: "Every drill at its gate and octaves still holding from level 0.",
    drills: [
      {
        id: "single-clean",
        label: "Single note, a new clean instrument every question",
        mode: "single-note",
        store: "trainer",
        trainerMode: "single",
        summary: "Random instrument each question from the clean tier, G1 and up, pitch + octave.",
        patch: { ...TRAINER_BASE, rangeLow: 31, instrumentMode: "random-question", poolMode: "all", families: [], tiers: ["clean"] },
        gate: hearing(200, 0.95, octaves(6)),
        daily: 80,
      },
      {
        id: "intervals-melodic",
        label: "Intervals, melodic pairs",
        mode: "intervals",
        store: "trainer",
        trainerMode: "intervals",
        summary: "Two notes one after the other, up or down, all twelve simple intervals, piano.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, intervalVariant: "pair", intervalPlayback: "melodic", intervalDirection: "both", intervalCompound: false, intervalSet: [], intervalGapMs: 600 },
        gate: hearing(150, 0.95, { by: "interval", min: 0.85, minPerKey: 5, minKeys: 12 }),
        daily: 60,
      },
      {
        id: "theory-1",
        label: "Theory drills, level 1",
        mode: "theory",
        store: "compose",
        tab: "theory",
        summary: "Triads in root position and major / minor scales, played on the piano, strict grading.",
        patch: { theoryLevel: 1, theoryMixLower: false, theoryKinds: [], theoryStrictness: "strict", theoryPlayReference: false, theoryAutoProceed: true },
        gate: hearing(60, 0.9),
        daily: 20,
      },
      {
        id: "scales-basic",
        label: "Scales & modes, major and natural minor runs",
        mode: "scales",
        store: "trainer",
        trainerMode: "scales",
        summary: "Runs only, major and natural minor, name the scale and the tonic.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, scaleVariant: "run", scaleDirection: "random", scaleSet: ["major", "natural-minor"], scaleAskTonic: true, scaleRunNoteMs: 280 },
        gate: hearing(60, 0.95),
        daily: 20,
      },
    ],
    review: [{ drillId: "octaves", daily: 30 }],
    lessons: ["intervals", "scales-and-modes", "chords"],
  },
  {
    id: "L2",
    n: 2,
    title: "Timbre and memory",
    focus: "Harder sounds, three notes in a row, the first cents, harmonic intervals, the modes as runs.",
    mastery: "Every drill at its gate; clean-instrument notes and melodic intervals still holding.",
    drills: [
      {
        id: "single-hard",
        label: "Single note, clean and hard sounds",
        mode: "single-note",
        store: "trainer",
        trainerMode: "single",
        summary: "Random instrument each question from the clean and hard tiers, G1 and up, pitch + octave.",
        patch: { ...TRAINER_BASE, rangeLow: 31, instrumentMode: "random-question", poolMode: "all", families: [], tiers: ["clean", "hard"] },
        gate: hearing(250, 0.93, octaves(6)),
        daily: 80,
      },
      {
        id: "extreme-bass",
        label: "The ten lowest piano keys, A0–G♭1",
        mode: "single-note",
        store: "trainer",
        trainerMode: "single",
        summary: "Piano only, A0–G♭1, pitch + octave. Use headphones or speakers that reach 30 Hz; laptop speakers only give you the overtones, and hearing the note from those is the skill here.",
        patch: { ...TRAINER_BASE, rangeLow: 21, rangeHigh: 30, instrumentMode: "fixed", instrumentId: PIANO, poolMode: "all", tiers: ["clean", "hard"], noteDurationMs: 2200 },
        gate: hearing(60, 0.85),
        daily: 20,
      },
      {
        id: "sequence-3",
        label: "Sequence of 3",
        mode: "sequence",
        store: "trainer",
        trainerMode: "sequence",
        summary: "Three notes on the piano, answer all three in order.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, seqLength: 3, seqGapMs: 600, seqMaxLeap: 12 },
        gate: hearing(120, 0.92),
        daily: 40,
      },
      {
        id: "cents-20-50",
        label: "Cents, 20 to 50",
        mode: "cents",
        store: "trainer",
        trainerMode: "cents",
        summary: "One note, in tune or 20–50 cents off; say which way and how much.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, centsVariant: "single", centsMin: 20, centsMax: 50, centsInTuneChance: 0.15 },
        gate: hearing(120, 0.92),
        daily: 40,
      },
      {
        id: "intervals-harmonic",
        label: "Intervals, harmonic pairs",
        mode: "intervals",
        store: "trainer",
        trainerMode: "intervals",
        summary: "Two notes together, all twelve simple intervals, piano.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, intervalVariant: "pair", intervalPlayback: "harmonic", intervalCompound: false, intervalSet: [] },
        gate: hearing(150, 0.93, { by: "interval", min: 0.85, minPerKey: 5, minKeys: 12 }),
        daily: 50,
      },
      {
        id: "scales-modes-runs",
        label: "Scales & modes, all seven-note scales as runs",
        mode: "scales",
        store: "trainer",
        trainerMode: "scales",
        summary: "Runs only: major, the three minors and the five modes; scale and tonic.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, scaleVariant: "run", scaleDirection: "random", scaleSet: ["major", "natural-minor", "harmonic-minor", "melodic-minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian"], scaleAskTonic: true },
        gate: hearing(120, 0.9, { by: "scale", min: 0.8, minPerKey: 5, minKeys: 9 }),
        daily: 40,
      },
      {
        id: "theory-2",
        label: "Theory drills, levels 1–2",
        mode: "theory",
        store: "compose",
        tab: "theory",
        summary: "Triad inversions, sevenths in root position, modes; strict.",
        patch: { theoryLevel: 2, theoryMixLower: true, theoryKinds: [], theoryStrictness: "strict", theoryPlayReference: false },
        gate: hearing(60, 0.9),
        daily: 20,
      },
    ],
    review: [
      { drillId: "single-clean", daily: 30 },
      { drillId: "intervals-melodic", daily: 20 },
    ],
    lessons: ["timbre-and-harmonics", "tuning-and-cents", "ear-training-for-absolute-pitch"],
  },
  {
    id: "L3",
    n: 3,
    title: "Chords and phrases",
    focus: "Triads by root and quality, four notes in a row, the first phrases played back, the first planted mistakes, scales from melodies.",
    mastery: "Every drill at its gate; hard-sound notes, cents and harmonic intervals still holding.",
    drills: [
      {
        id: "chords-triads",
        label: "Chords, triads by root and quality",
        mode: "chords",
        store: "trainer",
        trainerMode: "chords",
        summary: "Major, minor, diminished, augmented in closed root position; answer root + quality.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, chordKind: "chords", chordAnswer: "root-quality", chordCategories: ["triads"], chordInversions: false, chordAskInversion: false, chordVoicings: ["closed"], chordPlayback: "blocked" },
        gate: hearing(150, 0.95, { by: "quality", min: 0.9, minPerKey: 8, minKeys: 4 }),
        daily: 50,
      },
      {
        id: "sequence-4",
        label: "Sequence of 4",
        mode: "sequence",
        store: "trainer",
        trainerMode: "sequence",
        summary: "Four notes on the piano, in order.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, seqLength: 4, seqGapMs: 600, seqMaxLeap: 12 },
        gate: hearing(120, 0.9),
        daily: 40,
      },
      {
        id: "transcribe-echo-1",
        label: "Hear It, Play It: one-bar phrases",
        mode: "transcribe",
        store: "transcribe",
        tab: "phrases",
        summary: "Generated one-bar melodies, pitch and order graded, play them back on the piano.",
        patch: { source: "generated", drill: "echo", genBars: 1, genVoices: 1, genScale: "major", genKey: -1, rhythm: false, octaveInsensitive: false, passThreshold: 0.9, oneListen: false },
        gate: credit(40, 0.9),
        daily: 10,
      },
      {
        id: "mistakes-melody",
        label: "Find the Mistake: detuned or wrong note in a melody",
        mode: "mistakes",
        store: "mistakes",
        summary: "Generated melodies; one note 20–50 cents off or a wrong note; say where and what.",
        patch: { types: { detune: true, "wrong-note": true, "chord-quality": false, inversion: false, rhythm: false, drift: false, "voice-leading": false, ab: false }, source: "melody", centsMin: 20, centsMax: 50, referenceFirst: false, askFix: true, askAmount: true, instrumentMode: "fixed", instrumentId: PIANO },
        gate: hearing(100, 0.85),
        daily: 30,
      },
      {
        id: "scales-melodies-basic",
        label: "Scales & modes, melodies in major and the minors",
        mode: "scales",
        store: "trainer",
        trainerMode: "scales",
        summary: "Short melodies; name the scale and its home note.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, scaleVariant: "melody", scaleSet: ["major", "natural-minor", "harmonic-minor", "melodic-minor"], scaleAskTonic: true, scaleMelodyNotes: 8, scaleMelodyBpm: 100 },
        gate: hearing(100, 0.9),
        daily: 30,
      },
    ],
    review: [
      { drillId: "single-hard", daily: 30 },
      { drillId: "cents-20-50", daily: 20 },
      { drillId: "intervals-harmonic", daily: 20 },
    ],
    lessons: ["reading-and-writing-what-you-hear", "rhythm-and-meter"],
  },
  {
    id: "L4",
    n: 4,
    title: "Sevenths and inversions",
    focus: "Seventh chords, which note is in the bass, interval chains, finer cents, mistakes in chords and rhythm, two-bar phrases.",
    mastery: "Every drill at its gate; triads, sequences of 4 and scale runs still holding.",
    drills: [
      {
        id: "chords-sevenths",
        label: "Chords, sevenths by root and quality",
        mode: "chords",
        store: "trainer",
        trainerMode: "chords",
        summary: "All eight seventh-chord qualities, closed root position.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, chordKind: "chords", chordAnswer: "root-quality", chordCategories: ["sevenths"], chordInversions: false, chordAskInversion: false, chordVoicings: ["closed"], chordPlayback: "blocked" },
        gate: hearing(180, 0.93, { by: "quality", min: 0.85, minPerKey: 6, minKeys: 8 }),
        daily: 50,
      },
      {
        id: "chords-inversions",
        label: "Chords, triads with the inversion asked",
        mode: "chords",
        store: "trainer",
        trainerMode: "chords",
        summary: "Triads in any inversion; answer root, quality and inversion.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, chordKind: "chords", chordAnswer: "root-quality", chordCategories: ["triads"], chordInversions: true, chordAskInversion: true, chordVoicings: ["closed"], chordPlayback: "blocked" },
        gate: hearing(120, 0.9),
        daily: 40,
      },
      {
        id: "intervals-chain-4",
        label: "Intervals, chains of 4",
        mode: "intervals",
        store: "trainer",
        trainerMode: "intervals",
        summary: "Four notes, name every interval between them in order.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, intervalVariant: "chain", intervalChainLength: 4, intervalDirection: "both", intervalCompound: false, intervalSet: [] },
        gate: hearing(100, 0.9),
        daily: 30,
      },
      {
        id: "cents-10-30",
        label: "Cents, 10 to 30",
        mode: "cents",
        store: "trainer",
        trainerMode: "cents",
        summary: "One note, in tune or 10–30 cents off.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, centsVariant: "single", centsMin: 10, centsMax: 30, centsInTuneChance: 0.15 },
        gate: hearing(120, 0.9),
        daily: 40,
      },
      {
        id: "mistakes-progression",
        label: "Find the Mistake: melodies and progressions",
        mode: "mistakes",
        store: "mistakes",
        summary: "Detuned note, wrong note, wrong chord quality, rhythm slip; generated melodies and progressions.",
        patch: { types: { detune: true, "wrong-note": true, "chord-quality": true, inversion: false, rhythm: true, drift: false, "voice-leading": false, ab: false }, source: "auto", autoSources: ["melody", "progression"], centsMin: 15, centsMax: 40, referenceFirst: false, askFix: true, instrumentMode: "fixed", instrumentId: PIANO },
        gate: hearing(120, 0.8),
        daily: 30,
      },
      {
        id: "transcribe-ladder-2",
        label: "Hear It, Play It: ladder to two bars",
        mode: "transcribe",
        store: "transcribe",
        tab: "phrases",
        summary: "Generated phrases; the length grows as you pass, up to two bars.",
        patch: { source: "generated", drill: "ladder", genVoices: 1, genScale: "major", genKey: -1, rhythm: false, octaveInsensitive: false, passThreshold: 0.9, oneListen: false },
        gate: credit(40, 0.85),
        daily: 10,
      },
      {
        id: "theory-3",
        label: "Theory drills, levels 1–3",
        mode: "theory",
        store: "compose",
        tab: "theory",
        summary: "Seventh inversions, open voicings, scales both ways; strict.",
        patch: { theoryLevel: 3, theoryMixLower: true, theoryKinds: [], theoryStrictness: "strict" },
        gate: hearing(60, 0.9),
        daily: 20,
      },
    ],
    review: [
      { drillId: "chords-triads", daily: 20 },
      { drillId: "sequence-4", daily: 15 },
      { drillId: "scales-modes-runs", daily: 15 },
    ],
    lessons: ["voicings", "harmony-and-progressions"],
  },
  {
    id: "L5",
    n: 5,
    title: "Textures",
    focus: "Clusters with no theory to lean on, a Bach soprano line, every scale from melodies, every sound there is, the first prompt takes.",
    mastery: "Every drill at its gate; sevenths, inversions and 10–30 cents still holding.",
    drills: [
      {
        id: "clusters-3",
        label: "Clusters of 2–3 notes",
        mode: "chords",
        store: "trainer",
        trainerMode: "chords",
        summary: "Random simultaneous notes within two octaves; name every note in any order.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, chordKind: "clusters", clusterMin: 2, clusterMax: 3, clusterSpan: 24, chordNotesOrder: "any", chordPlayback: "blocked" },
        gate: hearing(120, 0.85),
        daily: 40,
      },
      {
        id: "bach-soprano",
        label: "Hear It, Play It: Bach soprano, chunk mode",
        mode: "transcribe",
        store: "transcribe",
        tab: "phrases",
        summary: "A chorale's top line, two bars at a time, walked through in order.",
        patch: { source: "bach", drill: "chunk", voices: [0], phraseBars: 2, tempoScale: 1, rhythm: false, octaveInsensitive: false, passThreshold: 0.9, oneListen: false },
        gate: credit(40, 0.9),
        daily: 10,
      },
      {
        id: "scales-all",
        label: "Scales & modes, everything, runs and melodies",
        mode: "scales",
        store: "trainer",
        trainerMode: "scales",
        summary: "All fifteen scales, runs and melodies, scale and tonic.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, scaleVariant: "both", scaleDirection: "random", scaleSet: [], scaleAskTonic: true },
        gate: hearing(150, 0.9, { by: "scale", min: 0.8, minPerKey: 5, minKeys: 12 }),
        daily: 40,
      },
      {
        id: "single-everything",
        label: "Single note, every sound there is",
        mode: "single-note",
        store: "trainer",
        trainerMode: "single",
        summary: "A new instrument or synth every question, including the chaos tier.",
        patch: { ...TRAINER_BASE, instrumentMode: "random-question", poolMode: "everything", tiers: ["clean", "hard", "chaos"] },
        gate: hearing(200, 0.9, octaves(6)),
        daily: 60,
      },
      {
        id: "theory-4",
        label: "Theory drills, levels 1–4",
        mode: "theory",
        store: "compose",
        tab: "theory",
        summary: "Extensions, altered chords, drop-2; strict.",
        patch: { theoryLevel: 4, theoryMixLower: true, theoryKinds: [], theoryStrictness: "strict" },
        gate: hearing(60, 0.85),
        daily: 20,
      },
      {
        id: "prompt-first",
        label: "Prompt drill",
        mode: "prompt",
        store: "compose",
        tab: "prompt",
        summary: "Four bars from a key, tempo, progression and mood; click and backing on; rate yourself.",
        patch: { promptBars: 4, promptCountdownSec: 8, promptClick: true, promptBacking: true, promptSeed: false, promptMood: true },
        gate: { window: 15, accuracy: 0.7, metric: "score", minDays: 3 },
        daily: 3,
      },
    ],
    review: [
      { drillId: "chords-sevenths", daily: 20 },
      { drillId: "chords-inversions", daily: 15 },
      { drillId: "cents-10-30", daily: 15 },
    ],
    lessons: ["voice-leading"],
  },
  {
    id: "L6",
    n: 6,
    title: "Two voices",
    focus: "Six notes in a row on changing sounds, which note of a pair or triad is off, drift and voice leading in chorales, two voices played back, interval stacks, progressions on the keys.",
    mastery: "Every drill at its gate; clusters, all scales and every-sound notes still holding.",
    drills: [
      {
        id: "sequence-6",
        label: "Sequence of 6, a new sound every note",
        mode: "sequence",
        store: "trainer",
        trainerMode: "sequence",
        summary: "Six notes, each on a different instrument, in order.",
        patch: { ...TRAINER_BASE, instrumentMode: "random-note", poolMode: "all", tiers: ["clean", "hard"], seqLength: 6, seqGapMs: 600, seqMaxLeap: 12 },
        gate: hearing(100, 0.85),
        daily: 30,
      },
      {
        id: "cents-pair",
        label: "Cents, which of two is off",
        mode: "cents",
        store: "trainer",
        trainerMode: "cents",
        summary: "The same note twice, one of them 10–30 cents off; which one and which way.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, centsVariant: "pair", centsMin: 10, centsMax: 30 },
        gate: hearing(100, 0.9),
        daily: 25,
      },
      {
        id: "cents-triad",
        label: "Cents, which chord note is off",
        mode: "cents",
        store: "trainer",
        trainerMode: "cents",
        summary: "A triad with one member 10–30 cents off; which note and which way.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, centsVariant: "chord", centsMin: 10, centsMax: 30 },
        gate: hearing(100, 0.9),
        daily: 25,
      },
      {
        id: "mistakes-chorale",
        label: "Find the Mistake: drift and voice leading in chorales",
        mode: "mistakes",
        store: "mistakes",
        summary: "Bach chorales; one voice drifts, or a voice is altered to make parallels; which beat and voice.",
        patch: { types: { detune: false, "wrong-note": false, "chord-quality": false, inversion: false, rhythm: false, drift: true, "voice-leading": true, ab: false }, source: "bach", bachRandom: true, bachBars: 2, centsMin: 10, centsMax: 30, askFix: true, instrumentMode: "fixed", instrumentId: PIANO },
        gate: hearing(100, 0.8),
        daily: 25,
      },
      {
        id: "bach-two-voices",
        label: "Hear It, Play It: Bach soprano and bass",
        mode: "transcribe",
        store: "transcribe",
        tab: "phrases",
        summary: "Outer voices of a chorale, one bar at a time.",
        patch: { source: "bach", drill: "chunk", voices: [0, 3], phraseBars: 1, tempoScale: 1, rhythm: false, octaveInsensitive: false, passThreshold: 0.85 },
        gate: credit(40, 0.85),
        daily: 10,
      },
      {
        id: "intervals-stack-3",
        label: "Intervals, stacks of 3",
        mode: "intervals",
        store: "trainer",
        trainerMode: "intervals",
        summary: "Three notes together; name every interval from the bottom note.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, intervalVariant: "stack", intervalStackSize: 3, intervalCompound: false, intervalSet: [] },
        gate: hearing(100, 0.9),
        daily: 30,
      },
      {
        id: "theory-5",
        label: "Theory drills, levels 1–5",
        mode: "theory",
        store: "compose",
        tab: "theory",
        summary: "Progressions in any key with voicing constraints; strict.",
        patch: { theoryLevel: 5, theoryMixLower: true, theoryKinds: [], theoryStrictness: "strict" },
        gate: hearing(50, 0.85),
        daily: 15,
      },
    ],
    review: [
      { drillId: "clusters-3", daily: 20 },
      { drillId: "scales-all", daily: 20 },
      { drillId: "single-everything", daily: 30 },
    ],
    lessons: [],
  },
  {
    id: "L7",
    n: 7,
    title: "Four voices",
    focus: "Whole chorale textures played back and played along, chords note by note, four-note clusters, harmonising, every mistake type, the voice to the hands.",
    mastery: "Every drill at its gate; long sequences, cents pairs and chorale mistakes still holding.",
    drills: [
      {
        id: "bach-all-voices",
        label: "Hear It, Play It: Bach, all four voices",
        mode: "transcribe",
        store: "transcribe",
        tab: "phrases",
        summary: "A full chorale bar at a time, every voice.",
        patch: { source: "bach", drill: "chunk", voices: [], phraseBars: 1, tempoScale: 1, rhythm: false, octaveInsensitive: false, passThreshold: 0.8 },
        gate: credit(40, 0.8),
        daily: 8,
      },
      {
        id: "shadow",
        label: "Shadow mode on a chorale",
        mode: "shadow",
        store: "transcribe",
        tab: "shadow",
        summary: "Play along live, one beat behind.",
        patch: { source: "bach", voices: [], tempoScale: 1, shadowLagBeats: 1, shadowWindowMs: 350 },
        gate: credit(20, 0.8),
        daily: 4,
      },
      {
        id: "chords-every-note",
        label: "Chords, sevenths answered as every note",
        mode: "chords",
        store: "trainer",
        trainerMode: "chords",
        summary: "Seventh chords in any inversion; name every note bottom to top.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, chordKind: "chords", chordAnswer: "notes", chordNotesOrder: "bottom-up", chordCategories: ["sevenths"], chordInversions: true, chordVoicings: ["closed"], chordPlayback: "blocked" },
        gate: hearing(100, 0.85),
        daily: 30,
      },
      {
        id: "clusters-4",
        label: "Clusters of 4",
        mode: "chords",
        store: "trainer",
        trainerMode: "chords",
        summary: "Four random simultaneous notes; every note, any order.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, chordKind: "clusters", clusterMin: 4, clusterMax: 4, clusterSpan: 24, chordNotesOrder: "any", chordPlayback: "blocked" },
        gate: hearing(100, 0.8),
        daily: 30,
      },
      {
        id: "theory-6",
        label: "Theory drills, level 6: harmonise",
        mode: "theory",
        store: "compose",
        tab: "theory",
        summary: "A diatonic triad under each melody note.",
        patch: { theoryLevel: 6, theoryMixLower: false, theoryKinds: [], theoryStrictness: "strict" },
        gate: hearing(40, 0.85),
        daily: 12,
      },
      {
        id: "mistakes-auto",
        label: "Find the Mistake: every type, every source",
        mode: "mistakes",
        store: "mistakes",
        summary: "All eight problem types on melodies, progressions, textures and chorales, including A/B.",
        patch: { types: { detune: true, "wrong-note": true, "chord-quality": true, inversion: true, rhythm: true, drift: true, "voice-leading": true, ab: true }, source: "auto", autoSources: ["melody", "progression", "voices", "bach"], centsMin: 10, centsMax: 30, askFix: true, instrumentMode: "fixed", instrumentId: PIANO },
        gate: hearing(150, 0.75),
        daily: 30,
      },
      {
        id: "hum",
        label: "Hum then play",
        mode: "hum",
        store: "compose",
        tab: "hum",
        summary: "Hum a line, play it back; any octave accepted.",
        patch: { humOctaveInsensitive: true },
        gate: credit(20, 0.8),
        daily: 5,
      },
    ],
    review: [
      { drillId: "sequence-6", daily: 15 },
      { drillId: "cents-pair", daily: 15 },
      { drillId: "mistakes-chorale", daily: 15 },
    ],
    lessons: [],
  },
  {
    id: "L8",
    n: 8,
    title: "Extensions and speed",
    focus: "Ninths, elevenths, thirteenths and altered chords by ear, eight notes on changing sounds, five-cent tuning, compound intervals, four-bar phrases, the whole theory ladder mixed.",
    mastery: "Every drill at its gate; full chorales, every-note chords and all mistake types still holding.",
    drills: [
      {
        id: "chords-extended",
        label: "Chords, extensions and altered",
        mode: "chords",
        store: "trainer",
        trainerMode: "chords",
        summary: "9ths, 11ths, 13ths, sus/add and altered dominants; root + quality.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, chordKind: "chords", chordAnswer: "root-quality", chordCategories: ["extended", "sus-add", "altered"], chordInversions: false, chordAskInversion: false, chordVoicings: ["closed"], chordPlayback: "blocked" },
        gate: hearing(200, 0.85, { by: "quality", min: 0.75, minPerKey: 5, minKeys: 15 }),
        daily: 50,
      },
      {
        id: "sequence-8",
        label: "Sequence of 8, a new sound every note",
        mode: "sequence",
        store: "trainer",
        trainerMode: "sequence",
        summary: "Eight notes, each on a different instrument.",
        patch: { ...TRAINER_BASE, instrumentMode: "random-note", poolMode: "all", tiers: ["clean", "hard"], seqLength: 8, seqGapMs: 550, seqMaxLeap: 12 },
        gate: hearing(100, 0.8),
        daily: 30,
      },
      {
        id: "cents-5-15",
        label: "Cents, 5 to 15",
        mode: "cents",
        store: "trainer",
        trainerMode: "cents",
        summary: "One note, in tune or 5–15 cents off.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, centsVariant: "single", centsMin: 5, centsMax: 15, centsInTuneChance: 0.15 },
        gate: hearing(150, 0.85),
        daily: 40,
      },
      {
        id: "intervals-compound",
        label: "Intervals, compound",
        mode: "intervals",
        store: "trainer",
        trainerMode: "intervals",
        summary: "Pairs up to two octaves apart, melodic and harmonic.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, intervalVariant: "pair", intervalPlayback: "melodic", intervalDirection: "both", intervalCompound: true, intervalSet: [] },
        gate: hearing(150, 0.9),
        daily: 40,
      },
      {
        id: "transcribe-ladder-4",
        label: "Hear It, Play It: ladder to four bars, two voices",
        mode: "transcribe",
        store: "transcribe",
        tab: "phrases",
        summary: "Generated two-voice phrases; length grows as you pass.",
        patch: { source: "generated", drill: "ladder", genVoices: 2, genScale: "major", genKey: -1, rhythm: false, octaveInsensitive: false, passThreshold: 0.85 },
        gate: credit(40, 0.85),
        daily: 10,
      },
      {
        id: "theory-mixed",
        label: "Theory drills, everything mixed",
        mode: "theory",
        store: "compose",
        tab: "theory",
        summary: "All six levels drawn at random; strict.",
        patch: { theoryLevel: 6, theoryMixLower: true, theoryKinds: [], theoryStrictness: "strict" },
        gate: hearing(80, 0.9),
        daily: 20,
      },
    ],
    review: [
      { drillId: "bach-all-voices", daily: 6 },
      { drillId: "chords-every-note", daily: 15 },
      { drillId: "mistakes-auto", daily: 15 },
    ],
    lessons: [],
  },
  {
    id: "mastery",
    n: 9,
    title: "Mastery",
    focus: "Everything mixed, adaptive weighting doing the choosing, volumes up. The Progress tab is the guide from here.",
    mastery: "There is no gate here; the numbers on the Progress tab are the goal now.",
    drills: [
      {
        id: "mastery-notes",
        label: "Single note, everything, adaptive",
        mode: "single-note",
        store: "trainer",
        trainerMode: "single",
        summary: "Every sound; the adaptive picker chases what you miss.",
        patch: { ...TRAINER_BASE, instrumentMode: "random-question", poolMode: "everything", tiers: ["clean", "hard", "chaos"], adaptive: true },
        gate: hearing(300, 0.95, octaves(7)),
        daily: 60,
      },
      {
        id: "mastery-chords",
        label: "Chords, every quality, inversions asked",
        mode: "chords",
        store: "trainer",
        trainerMode: "chords",
        summary: "All 33 qualities, any inversion, closed and drop-2 voicings.",
        patch: { ...TRAINER_BASE, instrumentMode: "fixed", instrumentId: PIANO, chordKind: "chords", chordAnswer: "root-quality", chordCategories: [], chordInversions: true, chordAskInversion: true, chordVoicings: ["closed", "drop2"], chordPlayback: "blocked" },
        gate: hearing(300, 0.9),
        daily: 50,
      },
      {
        id: "mastery-mistakes",
        label: "Find the Mistake, everything, 5–20 cents",
        mode: "mistakes",
        store: "mistakes",
        summary: "All types, all sources, fine detunes.",
        patch: { types: { detune: true, "wrong-note": true, "chord-quality": true, inversion: true, rhythm: true, drift: true, "voice-leading": true, ab: true }, source: "auto", autoSources: ["melody", "progression", "voices", "bach"], centsMin: 5, centsMax: 20, askFix: true },
        gate: hearing(200, 0.85),
        daily: 30,
      },
      {
        id: "mastery-transcribe",
        label: "Hear It, Play It: ladder, four voices",
        mode: "transcribe",
        store: "transcribe",
        tab: "phrases",
        summary: "Generated four-voice phrases, length grows as you pass.",
        patch: { source: "generated", drill: "ladder", genVoices: 4, genKey: -1, rhythm: true, rhythmTolerance: 0.25, passThreshold: 0.9 },
        gate: credit(40, 0.9),
        daily: 10,
      },
    ],
    review: [],
    lessons: [],
  },
];

export const LEVEL_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));
export const DRILL_BY_ID = new Map(LEVELS.flatMap((l) => l.drills.map((d) => [d.id, d] as const)));

export function levelOfDrill(drillId: string): LevelDef | undefined {
  return LEVELS.find((l) => l.drills.some((d) => d.id === drillId));
}

export function nextLevel(id: string): LevelDef | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}

export function previousLevel(id: string): LevelDef | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i > 0 ? LEVELS[i - 1] : undefined;
}

/** Where a drill opens. */
export function drillHref(d: DrillDef): string {
  switch (d.store) {
    case "trainer":
      return `/trainer?mode=${d.trainerMode}`;
    case "transcribe":
      return `/transcribe?tab=${d.tab}`;
    case "mistakes":
      return "/mistakes";
    case "compose":
      return `/compose?tab=${d.tab}`;
  }
}

/** A short gate description for the card. */
export function gateText(g: Gate): string {
  const what = g.metric === "score" ? "average credit" : "right";
  const parts = [`last ${g.window} at ${Math.round(g.accuracy * 100)} % ${what}`, `over ${g.minDays}+ days`];
  if (g.spread) {
    const by = g.spread.by === "octave" ? "every octave" : g.spread.by === "interval" ? "every interval" : g.spread.by === "quality" ? "every quality" : "every scale";
    parts.push(`${by} at ${Math.round(g.spread.min * 100)} %`);
  }
  return parts.join(" · ");
}
