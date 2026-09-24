/**
 * Turns a stream of pitch-detector frames (from humming into the mic) into discrete notes. Pure.
 *
 * A frame is kept when the detector is confident and the signal is loud enough. Consecutive kept
 * frames within half a semitone of the running note form one note; a note must last a minimum time
 * to count. The note's pitch is the median of its frames, rounded to the nearest semitone.
 */

export interface PitchFrame {
  tMs: number;
  /** Fractional MIDI number, or null when nothing was detected. */
  midi: number | null;
  /** 0..1 from the detector. */
  clarity: number;
  /** RMS level 0..1. */
  level: number;
}

export interface HummedNote {
  midi: number;
  /** Median fractional pitch, for the contour drawing. */
  exactMidi: number;
  startMs: number;
  endMs: number;
  /** Cents off the nearest semitone (median). */
  cents: number;
}

export interface SegmentOptions {
  minClarity: number;
  minLevel: number;
  minNoteMs: number;
  /** A frame further than this (semitones) from the current note starts a new note. */
  tolerance: number;
  /** A gap of silence longer than this closes the current note. */
  maxGapMs: number;
}

export const DEFAULT_SEGMENT: SegmentOptions = { minClarity: 0.9, minLevel: 0.01, minNoteMs: 90, tolerance: 0.6, maxGapMs: 120 };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function segmentHum(frames: PitchFrame[], opts: SegmentOptions = DEFAULT_SEGMENT): HummedNote[] {
  const notes: HummedNote[] = [];
  let cur: { pitches: number[]; startMs: number; lastMs: number } | null = null;
  const close = () => {
    if (!cur) return;
    if (cur.lastMs - cur.startMs >= opts.minNoteMs) {
      const exact = median(cur.pitches);
      const midi = Math.round(exact);
      notes.push({ midi, exactMidi: exact, startMs: cur.startMs, endMs: cur.lastMs, cents: Math.round((exact - midi) * 100) });
    }
    cur = null;
  };
  for (const f of frames) {
    const good = f.midi !== null && f.clarity >= opts.minClarity && f.level >= opts.minLevel;
    if (!good) {
      if (cur && f.tMs - cur.lastMs > opts.maxGapMs) close();
      continue;
    }
    const m = f.midi!;
    if (cur) {
      const ref = median(cur.pitches.slice(-8));
      if (Math.abs(m - ref) <= opts.tolerance && f.tMs - cur.lastMs <= opts.maxGapMs) {
        cur.pitches.push(m);
        cur.lastMs = f.tMs;
        continue;
      }
      close();
    }
    cur = { pitches: [m], startMs: f.tMs, lastMs: f.tMs };
  }
  close();
  return notes;
}
