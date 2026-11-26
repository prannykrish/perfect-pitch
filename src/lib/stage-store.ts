import { create } from "zustand";

/**
 * The phone's quiz screen ("the stage", phone-stage.tsx) is one fixed screen with a side panel for
 * everything that is not the question. This is the little state it shares with the rest of the
 * shell: the tab bar steps aside while a quiz is running, and messages keep clear of the buttons.
 */
interface StageStore {
  /** A stage is on screen (the page itself does not scroll). */
  mounted: boolean;
  /** A quiz is in progress: the tab bar is hidden so a stray thumb cannot leave the quiz. */
  focus: boolean;
  /** The side panel (level, modes, settings, pages) is open. */
  panelOpen: boolean;
  setMounted: (on: boolean) => void;
  setFocus: (on: boolean) => void;
  setPanelOpen: (open: boolean) => void;
}

export const useStage = create<StageStore>((set) => ({
  mounted: false,
  focus: false,
  panelOpen: false,
  setMounted: (on) => set(on ? { mounted: true } : { mounted: false, focus: false, panelOpen: false }),
  setFocus: (on) => set({ focus: on }),
  setPanelOpen: (open) => set({ panelOpen: open }),
}));
