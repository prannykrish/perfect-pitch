/** A metronome click as engine note events (GM woodblock: high on the downbeat, low elsewhere). */
export const CLICK_INSTRUMENT = "gm:woodblock";

export interface ClickOptions {
  bpm: number;
  beats: number;
  beatsPerBar?: number;
  /** Seconds before the first click. */
  offsetSec?: number;
  /** Quieter clicks (e.g. under a take). */
  soft?: boolean;
}

export function clickEvents(o: ClickOptions): { instrumentId: string; midi: number; at: number; duration: number; velocity: number }[] {
  const bpb = o.beatsPerBar ?? 4;
  const beatSec = 60 / o.bpm;
  const out = [];
  for (let b = 0; b < o.beats; b++) {
    const down = b % bpb === 0;
    out.push({ instrumentId: CLICK_INSTRUMENT, midi: down ? 76 : 72, at: (o.offsetSec ?? 0) + b * beatSec, duration: 0.08, velocity: (down ? 80 : 55) * (o.soft ? 0.7 : 1) });
  }
  return out;
}
