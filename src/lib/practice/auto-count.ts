/**
 * "Always count": with the switch on in Settings, a rep counts toward the level without pressing
 * Start whenever the live settings run the same test as one of the level's drills (or reviews).
 * Comfort settings (question count, auto-proceed, note length, replays, adaptive weighting, input
 * toggles) never stop a rep counting; anything that changes what is heard or asked does. Pure.
 */
import type { DrillDef, LevelDef } from "./levels";
import { DRILL_BY_ID } from "./levels";

/** Settings that change how comfortable a rep is, not what it tests. */
export const COMFORT_KEYS = new Set([
  "questionCount",
  "autoProceed",
  "correctPauseMs",
  "replayLimit",
  "noteDurationMs",
  "keyboardShortcuts",
  "midiInput",
  "adaptive",
  "theoryAutoProceed",
  "theoryAutoSubmitMs",
]);

/** Trainer keys that only matter in one trainer mode. */
const TRAINER_MODE_PREFIXES: Record<string, string[]> = {
  single: [],
  sequence: ["seq"],
  intervals: ["interval"],
  chords: ["chord", "cluster"],
  scales: ["scale"],
  cents: ["cents"],
};
const ALL_MODE_PREFIXES = Object.values(TRAINER_MODE_PREFIXES).flat();

const RANDOM_POOL_KEYS = new Set(["poolMode", "families", "tiers"]);

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** The patch keys that define the drill's test (what must match for a rep to count). */
export function testKeys(drill: DrillDef): string[] {
  const patch = drill.patch as Record<string, unknown>;
  const fixed = patch.instrumentMode === "fixed";
  const own = drill.store === "trainer" ? TRAINER_MODE_PREFIXES[drill.trainerMode] : [];
  return Object.keys(patch).filter((k) => {
    if (COMFORT_KEYS.has(k)) return false;
    // a fixed instrument makes the random pool irrelevant; a random one makes the fixed id irrelevant
    if (fixed && RANDOM_POOL_KEYS.has(k)) return false;
    if (!fixed && "instrumentMode" in patch && k === "instrumentId") return false;
    // another trainer mode's settings (e.g. chord qualities while drilling single notes)
    if (drill.store === "trainer" && ALL_MODE_PREFIXES.some((p) => k.startsWith(p)) && !own.some((p) => k.startsWith(p))) return false;
    return true;
  });
}

/** True when the live settings run the drill's test. `mode` is the trainer mode or the tab the rep came from. */
export function drillMatches(drill: DrillDef, store: DrillDef["store"], mode: string | null, settings: Record<string, unknown>): boolean {
  if (drill.store !== store) return false;
  if (drill.store === "trainer" && drill.trainerMode !== mode) return false;
  if ((drill.store === "transcribe" || drill.store === "compose") && drill.tab !== mode) return false;
  const patch = drill.patch as Record<string, unknown>;
  return testKeys(drill).every((k) => sameValue(patch[k], settings[k]));
}

/** The level's own drills first, then its reviews. */
export function countableDrills(level: LevelDef): DrillDef[] {
  const reviews = level.review.map((r) => DRILL_BY_ID.get(r.drillId)).filter((d): d is DrillDef => !!d);
  return [...level.drills, ...reviews];
}

/** The first drill on the level (or its reviews) whose test the live settings run, if any. */
export function matchDrill(level: LevelDef, store: DrillDef["store"], mode: string | null, settings: Record<string, unknown>): DrillDef | undefined {
  return countableDrills(level).find((d) => drillMatches(d, store, mode, settings));
}
