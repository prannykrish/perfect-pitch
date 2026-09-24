import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_INSTRUMENT_ID } from "@/lib/audio/instruments";
import type { PhraseRhythm, PhraseStyle, ScaleName } from "@/lib/trainer/phrase-gen";

export type SourceKind = "generated" | "bach" | "upload";
export type DrillKind = "echo" | "ladder" | "chunk";

export interface TranscribeSettings {
  source: SourceKind;
  drill: DrillKind;

  // generated phrases
  genKey: number; // -1 random
  genScale: ScaleName;
  genBars: number;
  genBpm: number;
  genLow: number;
  genHigh: number;
  genMaxLeap: number;
  genChromaticism: number;
  genStyle: PhraseStyle;
  genRhythm: PhraseRhythm;
  genVoices: 1 | 2 | 3 | 4;
  genRests: number;

  // pieces (bach / upload)
  bachIndex: number; // 0-based
  uploadId: number | null;
  phraseBars: number;
  /** Track indexes to include; empty = all. */
  voices: number[];
  /** Playback tempo multiplier for pieces. */
  tempoScale: number;

  // grading
  rhythm: boolean;
  rhythmTolerance: number; // beats
  octaveInsensitive: boolean;
  passThreshold: number; // 0..1, for ladder and chunk completion

  // flow
  oneListen: boolean;
  autoSubmitSilenceMs: number;
  autoProceed: boolean;
  instrumentId: string;
  /** Shadow mode: play this many beats behind the reference. */
  shadowLagBeats: number;
  shadowWindowMs: number;
}

export const DEFAULT_TRANSCRIBE_SETTINGS: TranscribeSettings = {
  source: "generated",
  drill: "ladder",

  genKey: -1,
  genScale: "major",
  genBars: 1,
  genBpm: 96,
  genLow: 55,
  genHigh: 84,
  genMaxLeap: 7,
  genChromaticism: 0.05,
  genStyle: "mixed",
  genRhythm: "mixed",
  genVoices: 1,
  genRests: 0.05,

  bachIndex: 0,
  uploadId: null,
  phraseBars: 2,
  voices: [0],
  tempoScale: 1,

  rhythm: false,
  rhythmTolerance: 0.25,
  octaveInsensitive: false,
  passThreshold: 0.9,

  oneListen: false,
  autoSubmitSilenceMs: 1500,
  autoProceed: false,
  instrumentId: DEFAULT_INSTRUMENT_ID,
  shadowLagBeats: 1,
  shadowWindowMs: 350,
};

interface Store {
  settings: TranscribeSettings;
  update: (patch: Partial<TranscribeSettings>) => void;
  reset: () => void;
}

export const useTranscribeSettings = create<Store>()(
  persist(
    (set) => ({
      settings: DEFAULT_TRANSCRIBE_SETTINGS,
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      reset: () => set({ settings: DEFAULT_TRANSCRIBE_SETTINGS }),
    }),
    {
      name: "pp-transcribe-settings-v1",
      merge: (persisted, current) => ({
        ...current,
        settings: { ...current.settings, ...((persisted as Partial<Store>)?.settings ?? {}) },
      }),
    }
  )
);
