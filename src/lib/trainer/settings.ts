import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InstrumentFamily, InstrumentTier } from "@/lib/audio/instruments";
import { DEFAULT_INSTRUMENT_ID } from "@/lib/audio/instruments";
import type { ChordCategory, Voicing } from "@/lib/music/chords";
import { MIDI_MAX, MIDI_MIN } from "@/lib/music/notes";

export type AnswerMode = "pitch-class" | "pitch-octave";
export type InstrumentMode = "fixed" | "random-question" | "random-note";
export type ReplayLimit = "unlimited" | "one" | "none";
/**
 * Which instruments the random modes draw from: all (respecting tiers, may repeat), everything with a
 * guaranteed new sound every question (timbre roulette), a random handful of families, or a hand-picked set.
 */
export type PoolMode = "all" | "everything" | "random" | "custom";

export type IntervalVariant = "pair" | "chain" | "stack";
export type IntervalPlayback = "melodic" | "harmonic";
export type IntervalDirection = "asc" | "desc" | "both";
export type ChordKind = "chords" | "clusters" | "mixed";
export type ChordAnswer = "root-quality" | "notes";
export type ChordPlayback = "blocked" | "arp-then-blocked" | "arp";
export type NotesOrder = "any" | "bottom-up";
export type CentsVariant = "single" | "pair" | "chord";

export interface TrainerSettings {
  /** Which of the 12 pitch classes may appear. Index 0 = C. */
  pitchClasses: boolean[];
  /** Inclusive MIDI range for targets. Clamped to the instrument's realistic range when useRealisticRange is on. */
  rangeLow: number;
  rangeHigh: number;
  useRealisticRange: boolean;
  answerMode: AnswerMode;
  instrumentMode: InstrumentMode;
  instrumentId: string;
  /** Filters used by the random instrument modes. Empty = all. */
  poolMode: PoolMode;
  families: InstrumentFamily[];
  tiers: InstrumentTier[];
  /** 0 = never-ending. */
  questionCount: number;
  autoProceed: boolean;
  /** Pause before the next question after a correct answer (just a flash). */
  correctPauseMs: number;
  /** Pause after a wrong answer so the correction can be read. */
  wrongPauseMs: number;
  replayLimit: ReplayLimit;
  noteDurationMs: number;
  keyboardShortcuts: boolean;
  midiInput: boolean;
  adaptive: boolean;

  // ----- sequence -----
  seqLength: number;
  seqGapMs: number;
  /** Max jump between consecutive notes in semitones. 0 = unlimited. */
  seqMaxLeap: number;

  // ----- intervals -----
  intervalVariant: IntervalVariant;
  intervalPlayback: IntervalPlayback;
  intervalDirection: IntervalDirection;
  intervalCompound: boolean;
  /** Allowed simple intervals in semitones (1–12). Empty = all. */
  intervalSet: number[];
  intervalChainLength: number;
  intervalStackSize: number;
  intervalGapMs: number;

  // ----- chords & clusters -----
  chordKind: ChordKind;
  chordAnswer: ChordAnswer;
  chordCategories: ChordCategory[];
  chordInversions: boolean;
  chordAskInversion: boolean;
  chordVoicings: Voicing[];
  chordPlayback: ChordPlayback;
  chordNotesOrder: NotesOrder;
  clusterMin: number;
  clusterMax: number;
  clusterSpan: number;

  // ----- cents -----
  centsVariant: CentsVariant;
  centsMin: number;
  centsMax: number;
  /** Probability that a "single" cents question is perfectly in tune. */
  centsInTuneChance: number;
}

export const DEFAULT_TRAINER_SETTINGS: TrainerSettings = {
  pitchClasses: Array(12).fill(true),
  rangeLow: MIDI_MIN,
  rangeHigh: MIDI_MAX,
  useRealisticRange: true,
  answerMode: "pitch-octave",
  instrumentMode: "fixed",
  instrumentId: DEFAULT_INSTRUMENT_ID,
  poolMode: "all",
  families: [],
  tiers: ["clean", "hard"],
  questionCount: 0,
  autoProceed: true,
  correctPauseMs: 250,
  wrongPauseMs: 1800,
  replayLimit: "unlimited",
  noteDurationMs: 1500,
  keyboardShortcuts: true,
  midiInput: true,
  adaptive: true,

  seqLength: 4,
  seqGapMs: 600,
  seqMaxLeap: 12,

  intervalVariant: "pair",
  intervalPlayback: "melodic",
  intervalDirection: "both",
  intervalCompound: false,
  intervalSet: [],
  intervalChainLength: 4,
  intervalStackSize: 3,
  intervalGapMs: 600,

  chordKind: "chords",
  chordAnswer: "root-quality",
  chordCategories: ["triads", "sevenths"],
  chordInversions: true,
  chordAskInversion: false,
  chordVoicings: ["closed"],
  chordPlayback: "blocked",
  chordNotesOrder: "any",
  clusterMin: 2,
  clusterMax: 4,
  clusterSpan: 24,

  centsVariant: "single",
  centsMin: 5,
  centsMax: 50,
  centsInTuneChance: 0.15,
};

interface TrainerSettingsStore {
  settings: TrainerSettings;
  update: (patch: Partial<TrainerSettings>) => void;
  reset: () => void;
}

export const useTrainerSettings = create<TrainerSettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_TRAINER_SETTINGS,
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      reset: () => set({ settings: DEFAULT_TRAINER_SETTINGS }),
    }),
    {
      name: "pp-trainer-settings-v1",
      merge: (persisted, current) => ({
        ...current,
        settings: { ...current.settings, ...((persisted as Partial<TrainerSettingsStore>)?.settings ?? {}) },
      }),
    }
  )
);
