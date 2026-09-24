import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TrainerModeId = "single" | "sequence" | "intervals" | "chords" | "cents";
export type ComposeTabId = "monitor" | "theory" | "prompt" | "hum";
export type PracticeTabId = "calendar" | "progress" | "learn";
export type TranscribeTabId = "phrases" | "shadow";

interface UiStore {
  trainerSettingsOpen: boolean;
  setTrainerSettingsOpen: (open: boolean) => void;
  trainerMode: TrainerModeId;
  setTrainerMode: (mode: TrainerModeId) => void;
  transcribeSettingsOpen: boolean;
  setTranscribeSettingsOpen: (open: boolean) => void;
  transcribeTab: TranscribeTabId;
  setTranscribeTab: (tab: TranscribeTabId) => void;
  mistakesSettingsOpen: boolean;
  setMistakesSettingsOpen: (open: boolean) => void;
  composeSettingsOpen: boolean;
  setComposeSettingsOpen: (open: boolean) => void;
  composeTab: ComposeTabId;
  setComposeTab: (tab: ComposeTabId) => void;
  practiceTab: PracticeTabId;
  setPracticeTab: (tab: PracticeTabId) => void;
  /** Lesson id open in Learn, "glossary", or null for the index. */
  learnLesson: string | null;
  setLearnLesson: (id: string | null) => void;
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
      transcribeTab: "phrases",
      setTranscribeTab: (tab) => set({ transcribeTab: tab }),
      mistakesSettingsOpen: true,
      setMistakesSettingsOpen: (open) => set({ mistakesSettingsOpen: open }),
      composeSettingsOpen: true,
      setComposeSettingsOpen: (open) => set({ composeSettingsOpen: open }),
      composeTab: "monitor",
      setComposeTab: (tab) => set({ composeTab: tab }),
      practiceTab: "calendar",
      setPracticeTab: (tab) => set({ practiceTab: tab }),
      learnLesson: null,
      setLearnLesson: (id) => set({ learnLesson: id }),
    }),
    { name: "pp-ui-v1" }
  )
);
