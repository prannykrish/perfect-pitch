/**
 * Scale and mode vocabulary for "hear it, name it": each scale's steps from the tonic, the notes that
 * give it away, and generators for a run (up / down / both) and a short melody that must contain
 * those give-away notes and end on the tonic. Pure; MIDI numbers throughout.
 */
import { PITCH_CLASS_SHORT, pick, pitchClassOf, randomInt } from "./notes";

export type ScaleCategory = "major-minor" | "modes" | "pentatonic" | "symmetric";

export const SCALE_CATEGORY_LABELS: Record<ScaleCategory, string> = {
  "major-minor": "Major and minor",
  modes: "Modes",
  pentatonic: "Pentatonic and blues",
  symmetric: "Symmetric",
};

export interface ScaleDef {
  id: string;
  name: string;
  /** Short label for buttons. */
  short: string;
  category: ScaleCategory;
  /** Semitones above the tonic, ascending, starting at 0, all below 12. */
  intervals: number[];
  /** Offsets that must be heard for the scale to be identifiable (its characteristic notes). */
  characteristic: number[];
  /** One line on what to listen for. */
  tell: string;
}

// prettier-ignore
export const SCALE_DEFS: ScaleDef[] = [
  { id: "major", name: "Major (Ionian)", short: "major", category: "major-minor", intervals: [0, 2, 4, 5, 7, 9, 11], characteristic: [4, 11], tell: "Major 3rd and a leading tone a half step under the tonic." },
  { id: "natural-minor", name: "Natural minor (Aeolian)", short: "nat. minor", category: "major-minor", intervals: [0, 2, 3, 5, 7, 8, 10], characteristic: [3, 8, 10], tell: "Minor 3rd, flat 6th and a flat 7th with no leading tone." },
  { id: "harmonic-minor", name: "Harmonic minor", short: "harm. minor", category: "major-minor", intervals: [0, 2, 3, 5, 7, 8, 11], characteristic: [8, 11], tell: "Minor with a leading tone: the augmented 2nd between ♭6 and 7." },
  { id: "melodic-minor", name: "Melodic minor (ascending)", short: "mel. minor", category: "major-minor", intervals: [0, 2, 3, 5, 7, 9, 11], characteristic: [3, 9, 11], tell: "Minor 3rd but major 6th and 7th: major with a flat 3rd." },
  { id: "dorian", name: "Dorian", short: "dorian", category: "modes", intervals: [0, 2, 3, 5, 7, 9, 10], characteristic: [3, 9, 10], tell: "Minor with a raised 6th." },
  { id: "phrygian", name: "Phrygian", short: "phrygian", category: "modes", intervals: [0, 1, 3, 5, 7, 8, 10], characteristic: [1, 3], tell: "Minor with a flat 2nd right above the tonic." },
  { id: "lydian", name: "Lydian", short: "lydian", category: "modes", intervals: [0, 2, 4, 6, 7, 9, 11], characteristic: [4, 6], tell: "Major with a raised 4th." },
  { id: "mixolydian", name: "Mixolydian", short: "mixolydian", category: "modes", intervals: [0, 2, 4, 5, 7, 9, 10], characteristic: [4, 10], tell: "Major with a flat 7th." },
  { id: "locrian", name: "Locrian", short: "locrian", category: "modes", intervals: [0, 1, 3, 5, 6, 8, 10], characteristic: [1, 6], tell: "Flat 2nd and a flat 5th: no perfect fifth above the tonic." },
  { id: "major-pentatonic", name: "Major pentatonic", short: "maj. pent.", category: "pentatonic", intervals: [0, 2, 4, 7, 9], characteristic: [4, 9], tell: "Five notes, major 3rd, no 4th or 7th." },
  { id: "minor-pentatonic", name: "Minor pentatonic", short: "min. pent.", category: "pentatonic", intervals: [0, 3, 5, 7, 10], characteristic: [3, 10], tell: "Five notes, minor 3rd and flat 7th, no 2nd or 6th." },
  { id: "blues", name: "Blues", short: "blues", category: "pentatonic", intervals: [0, 3, 5, 6, 7, 10], characteristic: [3, 6], tell: "Minor pentatonic plus the flat 5th." },
  { id: "whole-tone", name: "Whole tone", short: "whole tone", category: "symmetric", intervals: [0, 2, 4, 6, 8, 10], characteristic: [6, 8], tell: "Only whole steps; no fifth, no home." },
  { id: "diminished", name: "Diminished (half–whole)", short: "diminished", category: "symmetric", intervals: [0, 1, 3, 4, 6, 7, 9, 10], characteristic: [1, 4, 6], tell: "Half and whole steps alternating; eight notes." },
  { id: "chromatic", name: "Chromatic", short: "chromatic", category: "symmetric", intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], characteristic: [], tell: "Every semitone." },
];

const BY_ID = new Map(SCALE_DEFS.map((s) => [s.id, s]));

export function scaleDef(id: string): ScaleDef | undefined {
  return BY_ID.get(id);
}

export function scaleLabel(tonic: number, id: string): string {
  const def = scaleDef(id);
  return `${PITCH_CLASS_SHORT[tonic]} ${def?.name.toLowerCase() ?? id}`;
}

export function scalePitchClasses(tonic: number, id: string): Set<number> {
  const def = scaleDef(id);
  return new Set((def?.intervals ?? []).map((i) => (tonic + i) % 12));
}

export function samePitchClassSet(a: Set<number>, b: Set<number>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

export type RunDirection = "asc" | "desc" | "both";

/** One octave of the scale as MIDI notes: up from `startMidi`, down from an octave above it, or up and back. */
export function scaleRun(id: string, startMidi: number, direction: RunDirection): number[] {
  const def = scaleDef(id);
  if (!def) return [];
  const up = [...def.intervals.map((i) => startMidi + i), startMidi + 12];
  if (direction === "asc") return up;
  if (direction === "desc") return [...up].reverse();
  return [...up, ...[...up].reverse().slice(1)];
}

export interface MelodyNote {
  midi: number;
  /** Start in beats. */
  beat: number;
  /** Length in beats. */
  duration: number;
}

/**
 * A short melody in the scale: starts on the tonic, mostly steps with a few leaps, contains every
 * characteristic note at least once, and ends on the tonic held for two beats.
 */
export function scaleMelody(id: string, tonic: number, opts: { notes: number; low: number; high: number }): MelodyNote[] {
  const def = scaleDef(id);
  if (!def) return [];
  const count = Math.max(4, opts.notes);
  const pcs = scalePitchClasses(tonic, id);
  const pool: number[] = [];
  for (let m = opts.low; m <= opts.high; m++) if (pcs.has(pitchClassOf(m))) pool.push(m);
  if (pool.length < 4) return [];
  const tonics = pool.filter((m) => pitchClassOf(m) === tonic);
  const mid = (opts.low + opts.high) / 2;
  const start = tonics.length ? tonics.reduce((b, m) => (Math.abs(m - mid) < Math.abs(b - mid) ? m : b), tonics[0]) : pool[Math.floor(pool.length / 2)];
  const midis: number[] = [start];
  let idx = pool.indexOf(start);
  for (let i = 1; i < count - 1; i++) {
    const r = Math.random();
    const step = r < 0.6 ? pick([-1, 1]) : r < 0.85 ? pick([-2, 2]) : pick([-3, 3, -4, 4]);
    idx = Math.max(0, Math.min(pool.length - 1, idx + step));
    // keep the walk inside an octave and a half of the start
    if (Math.abs(pool[idx] - start) > 17) idx = pool.indexOf(start) + (pool[idx] > start ? 2 : -2);
    idx = Math.max(0, Math.min(pool.length - 1, idx));
    midis.push(pool[idx]);
  }
  // end on the tonic nearest the last note
  const last = midis[midis.length - 1];
  const endTonic = tonics.length ? tonics.reduce((b, m) => (Math.abs(m - last) < Math.abs(b - last) ? m : b), tonics[0]) : start;
  midis.push(endTonic);
  // make sure every characteristic note is present: replace inner non-tonic notes with the nearest such
  // note, never touching the only occurrence of another characteristic note
  const charPcs = new Set(def.characteristic.map((c) => (tonic + c) % 12));
  const counts = new Map<number, number>();
  for (const m of midis) counts.set(pitchClassOf(m), (counts.get(pitchClassOf(m)) ?? 0) + 1);
  const need = [...charPcs].filter((pc) => !counts.get(pc));
  for (const pc of need) {
    const slots = midis.map((m, i) => i).filter((i) => {
      if (i === 0 || i === midis.length - 1) return false;
      const cur = pitchClassOf(midis[i]);
      return cur !== tonic && (!charPcs.has(cur) || (counts.get(cur) ?? 0) > 1);
    });
    if (!slots.length) break;
    const i = slots[randomInt(0, slots.length - 1)];
    const cands = pool.filter((m) => pitchClassOf(m) === pc);
    if (!cands.length) continue;
    const old = pitchClassOf(midis[i]);
    midis[i] = cands.reduce((b, m) => (Math.abs(m - midis[i]) < Math.abs(b - midis[i]) ? m : b), cands[0]);
    counts.set(old, (counts.get(old) ?? 1) - 1);
    counts.set(pc, (counts.get(pc) ?? 0) + 1);
  }
  // last resort: whatever is still missing goes into the first inner slots that are not carrying another give-away note
  let cursor = 1;
  for (const pc of [...charPcs].filter((p) => !midis.some((m) => pitchClassOf(m) === p))) {
    const cands = pool.filter((m) => pitchClassOf(m) === pc);
    if (!cands.length) continue;
    while (cursor < midis.length - 1 && charPcs.has(pitchClassOf(midis[cursor])) && (counts.get(pitchClassOf(midis[cursor])) ?? 0) <= 1) cursor++;
    if (cursor >= midis.length - 1) cursor = 1;
    const old = pitchClassOf(midis[cursor]);
    midis[cursor] = cands.reduce((b, m) => (Math.abs(m - midis[cursor]) < Math.abs(b - midis[cursor]) ? m : b), cands[0]);
    counts.set(old, (counts.get(old) ?? 1) - 1);
    counts.set(pc, (counts.get(pc) ?? 0) + 1);
    cursor++;
  }
  // rhythm: mostly quarters, some eighth pairs; the last note is long
  const out: MelodyNote[] = [];
  let beat = 0;
  for (let i = 0; i < midis.length; i++) {
    const isLast = i === midis.length - 1;
    const dur = isLast ? 2 : Math.random() < 0.3 && i < midis.length - 2 ? 0.5 : 1;
    out.push({ midi: midis[i], beat, duration: dur });
    beat += dur;
  }
  return out;
}

/** Scales in the given id set (empty = all), grouped by category in vocabulary order. */
export function scalesByCategory(ids: string[]): { category: ScaleCategory; items: ScaleDef[] }[] {
  const allowed = ids.length ? new Set(ids) : null;
  return (Object.keys(SCALE_CATEGORY_LABELS) as ScaleCategory[])
    .map((c) => ({ category: c, items: SCALE_DEFS.filter((s) => s.category === c && (!allowed || allowed.has(s.id))) }))
    .filter((g) => g.items.length);
}
