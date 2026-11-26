"use client";

/**
 * The active "level run": which drill's settings are in force. Starting a drill from the level card
 * writes its settings into the right store and records a snapshot of the keys it set. Every rep
 * logged while the snapshot still matches the live settings is tagged with the level and drill;
 * change one of those settings by hand and the tags stop (and the bar in the tab says so).
 * With "always count" on (Settings), reps are also tagged without a run whenever the settings run
 * the test of a drill on the current level (auto-count.ts).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useTrainerSettings } from "@/lib/trainer/settings";
import { useTranscribeSettings } from "@/lib/transcribe/settings";
import { useMistakesSettings } from "@/lib/mistakes/settings";
import { useComposeSettings } from "@/lib/compose/settings";
import { useUiStore } from "@/lib/ui-store";
import { DRILL_BY_ID, LEVEL_BY_ID, LEVELS, levelOfDrill, type DrillDef } from "./levels";
import { matchDrill } from "./auto-count";
import { useCountPrefs } from "./count-prefs";

export interface LevelRun {
  levelId: string;
  drillId: string;
  store: DrillDef["store"];
  keys: string[];
  snapshot: string;
  startedAt: number;
}

interface Store {
  run: LevelRun | null;
  start: (drill: DrillDef, levelId: string) => void;
  end: () => void;
}

function currentSettings(store: DrillDef["store"]): Record<string, unknown> {
  switch (store) {
    case "trainer":
      return useTrainerSettings.getState().settings as unknown as Record<string, unknown>;
    case "transcribe":
      return useTranscribeSettings.getState().settings as unknown as Record<string, unknown>;
    case "mistakes":
      return useMistakesSettings.getState().settings as unknown as Record<string, unknown>;
    case "compose":
      return useComposeSettings.getState().settings as unknown as Record<string, unknown>;
  }
}

function snapshotOf(store: DrillDef["store"], keys: string[]): string {
  const s = currentSettings(store);
  return JSON.stringify(keys.map((k) => [k, s[k]]));
}

/** Write the drill's settings into its store and remember them. */
export function applyDrill(drill: DrillDef) {
  const patch = drill.patch as Record<string, unknown>;
  switch (drill.store) {
    case "trainer":
      useTrainerSettings.getState().update(drill.patch);
      useUiStore.getState().setTrainerMode(drill.trainerMode);
      break;
    case "transcribe":
      useTranscribeSettings.getState().update(drill.patch);
      useUiStore.getState().setTranscribeTab(drill.tab);
      break;
    case "mistakes":
      useMistakesSettings.getState().update(drill.patch);
      break;
    case "compose":
      useComposeSettings.getState().update(drill.patch);
      useUiStore.getState().setComposeTab(drill.tab);
      break;
  }
  return Object.keys(patch);
}

export const useLevelRun = create<Store>()(
  persist(
    (set) => ({
      run: null,
      start: (drill, levelId) => {
        const keys = applyDrill(drill);
        set({ run: { levelId, drillId: drill.id, store: drill.store, keys, snapshot: snapshotOf(drill.store, keys), startedAt: Date.now() } });
      },
      end: () => set({ run: null }),
    }),
    { name: "pp-level-run-v1" }
  )
);

/** True while the live settings still match what the drill set. */
export function runIntact(run: LevelRun | null): boolean {
  if (!run) return false;
  return snapshotOf(run.store, run.keys) === run.snapshot;
}

/** Re-apply the run's drill settings (after a hand edit) and refresh the snapshot. */
export function reapplyRun() {
  const run = useLevelRun.getState().run;
  if (!run) return;
  const drill = DRILL_BY_ID.get(run.drillId);
  if (!drill) return;
  useLevelRun.getState().start(drill, run.levelId);
}

/** The trainer mode or tab currently open for a store (only the active mode is mounted, so this is where a rep comes from). */
export function activeModeOf(store: DrillDef["store"]): string | null {
  const ui = useUiStore.getState();
  switch (store) {
    case "trainer":
      return ui.trainerMode;
    case "transcribe":
      return ui.transcribeTab;
    case "compose":
      return ui.composeTab;
    case "mistakes":
      return null;
  }
}

/** With "always count" on: the drill on the current level whose test the live settings run, if any. */
export function autoCountDrill(store: DrillDef["store"]): DrillDef | undefined {
  const prefs = useCountPrefs.getState();
  if (!prefs.alwaysCount) return undefined;
  const level = LEVEL_BY_ID.get(prefs.levelId) ?? LEVELS[0];
  return matchDrill(level, store, activeModeOf(store), currentSettings(store));
}

/**
 * Fields to spread into logAttempt: the level and drill when a run is active and intact for this
 * store, or, with "always count" on, when the settings match a drill on the current level.
 */
export function levelTags(store: DrillDef["store"]): { levelId?: string; drillId?: string } {
  const run = useLevelRun.getState().run;
  if (run && run.store === store && runIntact(run)) {
    const level = levelOfDrill(run.drillId);
    return { levelId: level?.id ?? run.levelId, drillId: run.drillId };
  }
  const auto = autoCountDrill(store);
  if (auto) return { levelId: levelOfDrill(auto.id)?.id, drillId: auto.id };
  return {};
}
