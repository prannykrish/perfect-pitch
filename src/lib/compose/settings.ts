import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_INSTRUMENT_ID } from "@/lib/audio/instruments";
import type { QuantizeGrid } from "@/lib/midi/take-tools";
import type { Strictness, TheoryKind } from "./theory";

export interface ComposeSettings {
  instrumentId: string;

  // recorder
  recBpm: number;
  quantizeGrid: QuantizeGrid;

  // theory drills
  theoryLevel: number;
  theoryMixLower: boolean;
  theoryKinds: TheoryKind[];
  theoryStrictness: Strictness;
  theoryAutoSubmitMs: number;
  theoryAutoProceed: boolean;
  theoryPlayReference: boolean;

  // prompt drills
  promptKey: number; // -1 random
  promptBpmMin: number;
  promptBpmMax: number;
  promptBars: number;
  promptCountdownSec: number;
  promptSevenths: boolean;
  promptMood: boolean;
  promptSeed: boolean;
  promptClick: boolean;
  promptBacking: boolean;

  // hum then play
  humOctaveInsensitive: boolean;
  humMinClarity: number;
  humMinLevel: number;
  humMinNoteMs: number;
  humSilenceMs: number;
  humPlaySilenceMs: number;
}

export const DEFAULT_COMPOSE_SETTINGS: ComposeSettings = {
  instrumentId: DEFAULT_INSTRUMENT_ID,

  recBpm: 100,
  quantizeGrid: 16,

  theoryLevel: 1,
  theoryMixLower: true,
  theoryKinds: ["chord", "scale", "progression", "harmonise"],
  theoryStrictness: "strict",
  theoryAutoSubmitMs: 1200,
  theoryAutoProceed: true,
  theoryPlayReference: false,

  promptKey: -1,
  promptBpmMin: 70,
  promptBpmMax: 120,
  promptBars: 4,
  promptCountdownSec: 8,
  promptSevenths: true,
  promptMood: true,
  promptSeed: false,
  promptClick: true,
  promptBacking: true,

  humOctaveInsensitive: true,
  humMinClarity: 0.9,
  humMinLevel: 0.01,
  humMinNoteMs: 90,
  humSilenceMs: 1800,
  humPlaySilenceMs: 1500,
};

interface Store {
  settings: ComposeSettings;
  update: (patch: Partial<ComposeSettings>) => void;
  reset: () => void;
}

export const useComposeSettings = create<Store>()(
  persist(
    (set) => ({
      settings: DEFAULT_COMPOSE_SETTINGS,
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      reset: () => set({ settings: DEFAULT_COMPOSE_SETTINGS }),
    }),
    {
      name: "pp-compose-settings-v1",
      merge: (persisted, current) => ({
        ...current,
        settings: { ...current.settings, ...((persisted as Partial<Store>)?.settings ?? {}) },
      }),
    }
  )
);
