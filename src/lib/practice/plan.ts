/**
 * Practice plans: what a day's practice consists of, the modes it can point at, and the starter
 * programme that ramps from "name single notes" to "harmonise a chorale". Pure.
 */

export type PlanMode = "single-note" | "sequence" | "intervals" | "chords" | "cents" | "transcribe" | "shadow" | "mistakes" | "theory" | "prompt" | "hum";

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

export function item(mode: PlanMode, target: number, hint?: string, minutes?: number): PlanItem {
  return { id: newItemId(), mode, target, hint, minutes };
}

// ---------------------------------------------------------------------------
// Starter programme: eight weeks that ease in. Days 1–6 use the week's set; day 7 is a light day.
// ---------------------------------------------------------------------------

export interface ProgramWeek {
  week: number;
  title: string;
  focus: string;
  /** The daily set for days 1–6. */
  daily: PlanItem[];
  /** What to read in Learn before or during the week. */
  lessons: string[];
}

export const STARTER_PROGRAM: ProgramWeek[] = [
  {
    week: 1,
    title: "Find your feet",
    focus: "Pitch and octave on the piano sound, the smallest intervals, the four triads by name.",
    daily: [item("single-note", 60, "Pitch + octave, piano only, chromatic, full range"), item("intervals", 30, "Pair, melodic, simple intervals"), item("theory", 15, "Level 1, mix in lower off")],
    lessons: ["notes-and-pitch", "intervals", "chords"],
  },
  {
    week: 2,
    title: "Add memory and tuning",
    focus: "Hold three notes in a row; start hearing cents; a new instrument every question.",
    daily: [item("single-note", 60, "Random instrument each question, clean + hard tiers"), item("sequence", 30, "Length 3, same instrument"), item("cents", 20, "Single note, 20–50 cents"), item("intervals", 30, "Pair, melodic and harmonic"), item("theory", 15, "Level 2, mix in lower on")],
    lessons: ["tuning-and-cents", "scales-and-modes"],
  },
  {
    week: 3,
    title: "Chords and phrases",
    focus: "Root and quality of triads; play back short generated phrases; the first planted mistakes.",
    daily: [item("chords", 30, "Real chords, triads, root + quality"), item("transcribe", 8, "Ladder, generated phrases, pitch only"), item("mistakes", 15, "Detuned note + wrong note, generated melody"), item("theory", 15, "Level 2"), item("single-note", 40, "Everything, new sound every question")],
    lessons: ["chords", "reading-and-writing-what-you-hear"],
  },
  {
    week: 4,
    title: "Inversions and rhythm",
    focus: "Which note is in the bass; interval chains; rhythm slips and wrong chord qualities.",
    daily: [item("chords", 30, "Triads + sevenths with inversions, ask the inversion"), item("intervals", 30, "Chain of 4"), item("mistakes", 15, "Add wrong chord quality and rhythm slip"), item("theory", 15, "Level 3"), item("sequence", 30, "Length 4"), item("cents", 20, "10–30 cents")],
    lessons: ["voicings", "rhythm-and-meter"],
  },
  {
    week: 5,
    title: "Textures",
    focus: "Clusters with no theory to lean on; a Bach soprano line; the first prompt takes.",
    daily: [item("chords", 30, "Clusters 2–4, any order"), item("transcribe", 8, "Bach chorale, soprano only, chunk mode"), item("theory", 15, "Level 4"), item("prompt", 3, "Default settings, click and backing on"), item("mistakes", 15, "Generated progression: chord quality + inversion"), item("single-note", 40, "Hard tier only")],
    lessons: ["harmony-and-progressions", "timbre-and-harmonics"],
  },
  {
    week: 6,
    title: "Two voices",
    focus: "Longer sequences; which note is off in a pair or triad; drift and voice leading in chorales.",
    daily: [item("sequence", 30, "Length 6, random instrument per note"), item("cents", 20, "Pair and triad variants"), item("mistakes", 15, "Bach chorale: drift + voice leading"), item("theory", 15, "Level 5 progressions"), item("transcribe", 8, "Bach, soprano + bass, 1 bar"), item("intervals", 30, "Stack of 3")],
    lessons: ["voice-leading"],
  },
  {
    week: 7,
    title: "Full texture",
    focus: "All four voices; play along live; harmonise; hum then play.",
    daily: [item("transcribe", 8, "Bach, all voices, 1 bar"), item("shadow", 5, "Bach chorale, lag 1 beat"), item("theory", 15, "Level 6 harmonise"), item("hum", 5, "Any octave on"), item("mistakes", 15, "Auto source, all types"), item("chords", 30, "Sevenths, answer every note")],
    lessons: ["ear-training-for-absolute-pitch"],
  },
  {
    week: 8,
    title: "Everything, harder",
    focus: "Mixed sessions at higher volume; the numbers on the Progress tab are now the guide.",
    daily: [item("single-note", 50, "Everything pool"), item("sequence", 30, "Length 8"), item("chords", 30, "All categories, voicings on"), item("intervals", 30, "Compound intervals"), item("cents", 20, "5–15 cents"), item("transcribe", 10, "Ladder from 1 bar"), item("mistakes", 20, "Auto, all types, 5–20 cents"), item("theory", 20, "Level 6, mix in lower on"), item("prompt", 3, "Seed motif on"), item("hum", 5)],
    lessons: [],
  },
];

/** The plan items for day `dayIndex` (0–6) of a programme week: full set, or half targets on day 7. */
export function programDay(week: ProgramWeek, dayIndex: number): PlanItem[] {
  const light = dayIndex === 6;
  return week.daily.map((it) => ({ ...it, id: newItemId(), target: light ? Math.max(1, Math.round(it.target / 2)) : it.target, hint: light ? `${it.hint ? it.hint + " · " : ""}light day` : it.hint }));
}

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
