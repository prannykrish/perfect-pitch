import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TrainerModeId = "single" | "sequence" | "intervals" | "chords" | "cents";

interface UiStore {
  trainerSettingsOpen: boolean;
  setTrainerSettingsOpen: (open: boolean) => void;
  trainerMode: TrainerModeId;
  setTrainerMode: (mode: TrainerModeId) => void;
  transcribeSettingsOpen: boolean;
  setTranscribeSettingsOpen: (open: boolean) => void;
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
    }),
    { name: "pp-ui-v1" }
  )
);
