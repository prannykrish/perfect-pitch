import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Practice preferences that outlive a page load. `alwaysCount`: reps count toward the current level
 * whenever the settings run one of its drills' tests, Start or not (see auto-count.ts).
 * `levelId` mirrors the current level from the database (settings table, key "levels") so tagging a
 * rep stays synchronous; it is refreshed whenever the level card or a level-run bar loads.
 */
interface CountPrefs {
  alwaysCount: boolean;
  setAlwaysCount: (on: boolean) => void;
  levelId: string;
  setLevelId: (id: string) => void;
}

export const useCountPrefs = create<CountPrefs>()(
  persist(
    (set) => ({
      alwaysCount: true,
      setAlwaysCount: (on) => set({ alwaysCount: on }),
      levelId: "L0",
      setLevelId: (id) => set({ levelId: id }),
    }),
    { name: "pp-count-prefs-v1" }
  )
);
