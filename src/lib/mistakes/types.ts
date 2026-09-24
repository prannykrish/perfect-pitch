/**
 * Find the Mistake: shared types. Pure (no client-only imports) so the stats page and the
 * self-test can use the labels and the planting code.
 */
import type { ChordSpec } from "@/lib/music/chords";
import type { ScoreNote } from "@/lib/music/score";
import type { ScaleName } from "@/lib/trainer/phrase-gen";

export type ProblemType = "detune" | "wrong-note" | "chord-quality" | "inversion" | "rhythm" | "drift" | "voice-leading" | "ab";
/** Everything except A/B, which wraps one of these. */
export type PlantType = Exclude<ProblemType, "ab">;

export const PROBLEM_TYPES: ProblemType[] = ["detune", "wrong-note", "chord-quality", "inversion", "rhythm", "drift", "voice-leading", "ab"];
export const PLANT_TYPES: PlantType[] = ["detune", "wrong-note", "chord-quality", "inversion", "rhythm", "drift", "voice-leading"];

export const PROBLEM_LABELS: Record<ProblemType, string> = {
  detune: "Detuned note",
  "wrong-note": "Wrong note",
  "chord-quality": "Wrong chord quality",
  inversion: "Wrong inversion / voicing",
  rhythm: "Rhythm slip",
  drift: "Drifted voice",
  "voice-leading": "Voice-leading fault",
  ab: "A/B (which one is clean?)",
};

export const PROBLEM_HELP: Record<ProblemType, string> = {
  detune: "One note is played a few cents flat or sharp.",
  "wrong-note": "One note is a chromatic neighbour or the wrong scale degree.",
  "chord-quality": "One chord in a progression has the wrong quality (major ↔ minor, dom7 ↔ maj7…).",
  inversion: "One chord is in a different inversion or voicing. You always hear the clean version first.",
  rhythm: "One note (or chord) comes in early or late by a fraction of a beat.",
  drift: "In a texture of 2–4 voices, one voice is out of tune for a stretch.",
  "voice-leading": "In a chorale, one voice is altered to make parallel fifths or octaves.",
  ab: "Two renditions, one clean and one with any of the problems above. Which is clean?",
};

export type Diagnosis = "flat" | "sharp" | "wrong-note" | "wrong-chord" | "wrong-inversion" | "early" | "late" | "drift-flat" | "drift-sharp" | "voice-leading";

export const DIAGNOSIS_LABELS: Record<Diagnosis, string> = {
  flat: "Flat",
  sharp: "Sharp",
  "wrong-note": "Wrong note",
  "wrong-chord": "Wrong chord",
  "wrong-inversion": "Wrong inversion / voicing",
  early: "Early",
  late: "Late",
  "drift-flat": "Voice drifts flat",
  "drift-sharp": "Voice drifts sharp",
  "voice-leading": "Bad voice leading",
};

/** Keyboard shortcut per diagnosis (letter; ⇧ = shift held). */
export const DIAGNOSIS_KEYS: Record<Diagnosis, string> = {
  flat: "F",
  sharp: "S",
  "wrong-note": "W",
  "wrong-chord": "C",
  "wrong-inversion": "I",
  early: "E",
  late: "L",
  "drift-flat": "⇧F",
  "drift-sharp": "⇧S",
  "voice-leading": "P",
};

export const DIAGNOSES_BY_TYPE: Record<PlantType, Diagnosis[]> = {
  detune: ["flat", "sharp"],
  "wrong-note": ["wrong-note"],
  "chord-quality": ["wrong-chord"],
  inversion: ["wrong-inversion"],
  rhythm: ["early", "late"],
  drift: ["drift-flat", "drift-sharp"],
  "voice-leading": ["voice-leading"],
};

export type MaterialKind = "melody" | "progression" | "voices" | "bach" | "upload";

export const MATERIAL_LABELS: Record<MaterialKind, string> = {
  melody: "Generated melody",
  progression: "Generated chord progression",
  voices: "Generated 2–4 voice texture",
  bach: "Bach chorale",
  upload: "My MIDI files",
};

/** A note as played: a ScoreNote plus an optional detune in cents. */
export interface MistakeNote extends ScoreNote {
  detune?: number;
}

export interface ProgressionChord {
  spec: ChordSpec;
  /** MIDI number of the root in the octave the voicing is built from (may be below the lowest sounding note). */
  rootMidi: number;
  start: number;
  duration: number;
  /** Indexes into Material.notes, bottom to top. */
  noteIndexes: number[];
}

export interface Material {
  kind: MaterialKind;
  /** The clean reference, sorted by start then pitch. */
  notes: ScoreNote[];
  bpm: number;
  beatsPerBar: number;
  totalBeats: number;
  /** Voice indexes that have notes, ascending. */
  voices: number[];
  voiceNames: Record<number, string>;
  key?: { tonic: number; scale: ScaleName };
  chords?: ProgressionChord[];
  label: string;
  /** "bach:012#3", "upload:5#0" */
  sourceRef?: string;
}

export type SlotKind = "note" | "chord" | "beat";

export interface Slot {
  kind: SlotKind;
  label: string;
  sub: string;
  /** Beats, relative to the material start. */
  start: number;
  end: number;
}

export type Fix = { kind: "note"; pc: number } | { kind: "chord"; qualityId: string } | { kind: "inversion"; value: string };
export type FixKind = Fix["kind"];

/** What the location answer consists of. */
export type LocationBy = "slot" | "slot+voice" | "voice";

export interface Planted {
  type: PlantType;
  material: Material;
  /** The played version, index-aligned with material.notes. */
  altered: MistakeNote[];
  slots: Slot[];
  slotKind: SlotKind;
  locationBy: LocationBy;
  /** The slot the problem is in (for "voice" location it is where the drift starts). */
  index: number;
  /** Slot indexes accepted as the location (a rhythm slip may straddle two beats). */
  acceptIndexes: number[];
  /** Voice that must be named (slot+voice / voice). */
  voice?: number;
  diagnosis: Diagnosis;
  /** Signed cents for detune / drift. */
  cents?: number;
  /** Signed beats for rhythm (negative = early). */
  shiftBeats?: number;
  fix?: Fix;
  /** Human labels for what was intended and what was played. */
  original: string;
  wrong: string;
  /** Plain sentence, e.g. "Bar 2, beat 3: E♭4 should be E4." */
  description: string;
  /** Indexes (into altered) of the notes that changed. */
  changedIndexes: number[];
  /** Play the clean reference before the altered rendition. */
  referenceFirst: boolean;
}

export interface ABQuestion {
  type: "ab";
  inner: Planted;
  cleanIs: "A" | "B";
}

export type MistakeQuestion = Planted | ABQuestion;

export interface Answer {
  index: number | null;
  voice: number | null;
  diagnosis: Diagnosis | null;
  fix: Fix | null;
  /** Cents bucket guess for a detuned note. */
  amount: number | null;
  choice: "A" | "B" | null;
}

export const EMPTY_ANSWER: Answer = { index: null, voice: null, diagnosis: null, fix: null, amount: null, choice: null };

export interface ScoredAnswer {
  correct: boolean;
  /** 0..1: location 0.5 + diagnosis 0.5 (A/B: the choice alone). */
  score: number;
  locationOk: boolean;
  /** Half credit when the beat is right but the voice is not. */
  locationPartial: boolean;
  diagnosisOk: boolean;
  /** null = not asked / not attempted. */
  fixOk: boolean | null;
  amountOk: boolean | null;
}

export function fixKindFor(d: Diagnosis | null): FixKind | null {
  switch (d) {
    case "wrong-note":
    case "voice-leading":
      return "note";
    case "wrong-chord":
      return "chord";
    case "wrong-inversion":
      return "inversion";
    default:
      return null;
  }
}

export function asksAmount(d: Diagnosis | null): boolean {
  return d === "flat" || d === "sharp";
}

export function isDrift(d: Diagnosis | null): boolean {
  return d === "drift-flat" || d === "drift-sharp";
}

/** Voice names for generated textures, by voice count, top to bottom. */
export function voiceNamesFor(count: number): string[] {
  switch (count) {
    case 1:
      return ["Melody"];
    case 2:
      return ["Top", "Bass"];
    case 3:
      return ["Top", "Middle", "Bass"];
    default:
      return ["Soprano", "Alto", "Tenor", "Bass"];
  }
}
