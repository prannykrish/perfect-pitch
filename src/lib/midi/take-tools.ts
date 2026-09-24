/**
 * Pure helpers for recorded takes: quantize onsets to a grid, change tempo, and convert to the
 * shape @tonejs/midi needs. Times are ms relative to the take start.
 */
import type { RecordedNote } from "./recorder";

export type QuantizeGrid = 4 | 8 | 12 | 16;
export const GRID_LABELS: Record<QuantizeGrid, string> = { 4: "Quarter notes", 8: "Eighth notes", 12: "Eighth-note triplets", 16: "Sixteenth notes" };

/** Snap every onset to the nearest grid line (grid = subdivisions per whole note); lengths are kept. */
export function quantize(notes: RecordedNote[], bpm: number, grid: QuantizeGrid): RecordedNote[] {
  const stepMs = (60000 / bpm) * (4 / grid);
  return notes.map((n) => {
    const start = Math.round(n.startMs / stepMs) * stepMs;
    const len = n.endMs === null ? null : Math.max(20, n.endMs - n.startMs);
    return { ...n, startMs: start, endMs: len === null ? null : start + len };
  });
}

/** Stretch or squeeze the take: factor 1.25 plays it 25% faster. */
export function scaleTempo(notes: RecordedNote[], factor: number): RecordedNote[] {
  const f = Math.max(0.1, factor);
  return notes.map((n) => ({ ...n, startMs: n.startMs / f, endMs: n.endMs === null ? null : n.endMs / f }));
}

/** Notes as @tonejs/midi wants them: seconds and 0..1 velocity. */
export function toMidiNotes(notes: RecordedNote[]): { midi: number; time: number; duration: number; velocity: number }[] {
  return notes.map((n) => ({
    midi: n.midi,
    time: n.startMs / 1000,
    duration: Math.max(0.03, ((n.endMs ?? n.startMs + 300) - n.startMs) / 1000),
    velocity: Math.max(0.05, Math.min(1, n.velocity / 127)),
  }));
}

/** First onset, so a take can start at zero. */
export function normalizeStart(notes: RecordedNote[]): RecordedNote[] {
  if (!notes.length) return notes;
  const t0 = Math.min(...notes.map((n) => n.startMs));
  return notes.map((n) => ({ ...n, startMs: n.startMs - t0, endMs: n.endMs === null ? null : n.endMs - t0 }));
}
