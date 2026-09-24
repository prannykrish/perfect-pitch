import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_INSTRUMENT_ID, type InstrumentTier } from "@/lib/audio/instruments";
import type { Voicing } from "@/lib/music/chords";
import type { PhraseRhythm, PhraseStyle, ScaleName } from "@/lib/trainer/phrase-gen";
import type { MaterialKind, ProblemType } from "./types";

export type MistakesSource = "auto" | MaterialKind;
export type MistakesInstrumentMode = "fixed" | "random" | "per-voice";

export interface MistakesSettings {
  /** Which problem types may be planted. */
  types: Record<ProblemType, boolean>;
  source: MistakesSource;
  /** Sources "auto" draws from (uploads only when a piece is chosen). */
  autoSources: MaterialKind[];

  // generated material (melody, voices, progression)
  key: number; // -1 random
  scale: ScaleName;
  bars: number;
  bpm: number;
  melodyStyle: PhraseStyle;
  melodyRhythm: PhraseRhythm;
  melodyLow: number;
  melodyHigh: number;
  voiceCount: 2 | 3 | 4;
  progChords: number;
  progBeatsPerChord: number;
  progSevenths: boolean;
  progInversions: boolean;
  progVoicings: Voicing[];

  // pieces
  bachIndex: number;
  bachRandom: boolean;
  bachBars: number;
  bachTempoScale: number;
  uploadId: number | null;
  uploadBars: number;

  // planting
  centsMin: number;
  centsMax: number;
  slipBeats: number;
  referenceFirst: boolean;
  askFix: boolean;
  askAmount: boolean;

  // instruments
  instrumentMode: MistakesInstrumentMode;
  instrumentId: string;
  tiers: InstrumentTier[];

  // flow
  questionCount: number;
  /** Move on by itself after a right answer; a wrong answer always waits for Space / Enter / click. */
  autoProceed: boolean;
  correctPauseMs: number;
  oneListen: boolean;
  clickTrack: boolean;
  showRollWhileAnswering: boolean;
  midiInput: boolean;
}

export const DEFAULT_MISTAKES_SETTINGS: MistakesSettings = {
  types: { detune: true, "wrong-note": true, "chord-quality": true, inversion: true, rhythm: true, drift: true, "voice-leading": true, ab: true },
  source: "auto",
  autoSources: ["melody", "progression", "voices", "bach"],

  key: -1,
  scale: "major",
  bars: 2,
  bpm: 92,
  melodyStyle: "mixed",
  melodyRhythm: "mixed",
  melodyLow: 55,
  melodyHigh: 84,
  voiceCount: 4,
  progChords: 4,
  progBeatsPerChord: 4,
  progSevenths: true,
  progInversions: false,
  progVoicings: ["closed"],

  bachIndex: 0,
  bachRandom: true,
  bachBars: 2,
  bachTempoScale: 1,
  uploadId: null,
  uploadBars: 2,

  centsMin: 5,
  centsMax: 50,
  slipBeats: 0.25,
  referenceFirst: false,
  askFix: true,
  askAmount: true,

  instrumentMode: "fixed",
  instrumentId: DEFAULT_INSTRUMENT_ID,
  tiers: ["clean", "hard"],

  questionCount: 0,
  autoProceed: true,
  correctPauseMs: 900,
  oneListen: false,
  clickTrack: false,
  showRollWhileAnswering: false,
  midiInput: true,
};

interface Store {
  settings: MistakesSettings;
  update: (patch: Partial<MistakesSettings>) => void;
  setType: (type: ProblemType, on: boolean) => void;
  reset: () => void;
}

export const useMistakesSettings = create<Store>()(
  persist(
    (set) => ({
      settings: DEFAULT_MISTAKES_SETTINGS,
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setType: (type, on) => set((s) => ({ settings: { ...s.settings, types: { ...s.settings.types, [type]: on } } })),
      reset: () => set({ settings: DEFAULT_MISTAKES_SETTINGS }),
    }),
    {
      name: "pp-mistakes-settings-v1",
      merge: (persisted, current) => {
        const p: Partial<MistakesSettings> = (persisted as Partial<Store>)?.settings ?? {};
        return {
          ...current,
          settings: { ...current.settings, ...p, types: { ...current.settings.types, ...(p.types ?? {}) } },
        };
      },
    }
  )
);
