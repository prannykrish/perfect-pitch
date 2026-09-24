import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TrainerModeId = "single" | "sequence" | "intervals" | "chords" | "cents";
export type ComposeTabId = "monitor" | "theory" | "prompt" | "hum";

interface UiStore {
  trainerSettingsOpen: boolean;
  setTrainerSettingsOpen: (open: boolean) => void;
  trainerMode: TrainerModeId;
  setTrainerMode: (mode: TrainerModeId) => void;
  transcribeSettingsOpen: boolean;
  setTranscribeSettingsOpen: (open: boolean) => void;
  mistakesSettingsOpen: boolean;
  setMistakesSettingsOpen: (open: boolean) => void;
  composeSettingsOpen: boolean;
  setComposeSettingsOpen: (open: boolean) => void;
  composeTab: ComposeTabId;
  setComposeTab: (tab: ComposeTabId) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      trainerSettingsOpen: true,
      setTrainerSettingsOpen: (open) => set({ trainerSettingsOpen: open }),
      trainerMode: "single",
      setTrainerMode: (mode) => set({ trainerMode: mode }),
      transcribeSettingsOpen: true,
      setTranscribeSettingsOpen: (open) => set({ transcribeSettingsOpen: open }),
      mistakesSettingsOpen: true,
      setMistakesSettingsOpen: (open) => set({ mistakesSettingsOpen: open }),
      composeSettingsOpen: true,
      setComposeSettingsOpen: (open) => set({ composeSettingsOpen: open }),
      composeTab: "monitor",
      setComposeTab: (tab) => set({ composeTab: tab }),
    }),
    { name: "pp-ui-v1" }
  )
);
