/**
 * Practice plans: what a day's practice consists of, the modes it can point at, and the starter
 * programme that ramps from "name single notes" to "harmonise a chorale". Pure.
 */

export type PlanMode = "single-note" | "sequence" | "intervals" | "chords" | "scales" | "cents" | "transcribe" | "shadow" | "mistakes" | "theory" | "prompt" | "hum";

export interface PlanItem {
  id: string;
  mode: PlanMode;
  /** Reps (attempts) to log that day. */
  target: number;
  /** Optional minutes goal. */
  minutes?: number;
  /** Which settings to use, in words. */
  hint?: string;
  /** Ticked by hand (for items the app cannot count, or to close it early). */
  done?: boolean;
}

export interface ModeInfo {
  label: string;
  href: string;
  unit: string;
  description: string;
  /** Attempt `mode` values that count towards this plan item. */
  attemptModes: string[];
}

export const MODE_INFO: Record<PlanMode, ModeInfo> = {
  "single-note": { label: "Single note", href: "/trainer?mode=single", unit: "notes", description: "Hear a note, name it (pitch + octave).", attemptModes: ["single-note", "roulette"] },
  sequence: { label: "Sequence", href: "/trainer?mode=sequence", unit: "sequences", description: "Several notes in a row, answered in order.", attemptModes: ["sequence"] },
  intervals: { label: "Intervals", href: "/trainer?mode=intervals", unit: "intervals", description: "Name the distance between notes.", attemptModes: ["intervals"] },
  chords: { label: "Chords & clusters", href: "/trainer?mode=chords", unit: "chords", description: "Root and quality, or every note.", attemptModes: ["chords"] },
  scales: { label: "Scales & modes", href: "/trainer?mode=scales", unit: "scales", description: "Hear a run or a melody, name the scale and its tonic.", attemptModes: ["scales"] },
  cents: { label: "Cents", href: "/trainer?mode=cents", unit: "notes", description: "How far out of tune, and which way.", attemptModes: ["cents"] },
  transcribe: { label: "Hear It, Play It", href: "/transcribe", unit: "phrases", description: "Play back a phrase on the piano.", attemptModes: ["transcribe"] },
  shadow: { label: "Shadow mode", href: "/transcribe?tab=shadow", unit: "runs", description: "Play along live with a piece.", attemptModes: ["shadow"] },
  mistakes: { label: "Find the Mistake", href: "/mistakes", unit: "questions", description: "Where is the planted problem, and what is it?", attemptModes: ["mistakes"] },
  theory: { label: "Theory drills", href: "/compose?tab=theory", unit: "tasks", description: "Play the named chord, scale or progression.", attemptModes: ["theory"] },
  prompt: { label: "Prompt drill", href: "/compose?tab=prompt", unit: "takes", description: "Imagine four bars, play them in one take.", attemptModes: ["prompt"] },
  hum: { label: "Hum then play", href: "/compose?tab=hum", unit: "lines", description: "Hum a line, then play it.", attemptModes: ["hum"] },
};

export const PLAN_MODES = Object.keys(MODE_INFO) as PlanMode[];

/** Which plan mode an attempt's `mode` counts for. */
export function planModeForAttempt(mode: string): PlanMode | null {
  for (const [k, v] of Object.entries(MODE_INFO)) if (v.attemptModes.includes(mode)) return k as PlanMode;
  return null;
}

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// The day-by-day plan comes from the ladder (levels.ts); manual items on top of it live in practice_plans.

// ---------------------------------------------------------------------------
// Dates (local calendar days as YYYY-MM-DD)
// ---------------------------------------------------------------------------

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(key: string, n: number): string {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** Completion of a plan item from the reps logged that day. */
export function itemProgress(it: PlanItem, repsByMode: Partial<Record<PlanMode, number>>): { done: number; ratio: number; complete: boolean } {
  const done = repsByMode[it.mode] ?? 0;
  const ratio = it.target > 0 ? Math.min(1, done / it.target) : it.done ? 1 : 0;
  return { done, ratio, complete: it.done === true || (it.target > 0 && done >= it.target) };
}

/** Streaks over a set of active day keys, counting back from today (or yesterday when today is still empty). */
export function computeStreak(activeDays: Set<string>): { current: number; longest: number } {
  if (!activeDays.size) return { current: 0, longest: 0 };
  let t = todayKey();
  if (!activeDays.has(t)) t = addDays(t, -1);
  let current = 0;
  while (activeDays.has(t)) {
    current++;
    t = addDays(t, -1);
  }
  const sorted = [...activeDays].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = addDays(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}
