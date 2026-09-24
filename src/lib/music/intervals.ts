/** Interval vocabulary, in semitones. */

export interface IntervalDef {
  semitones: number;
  short: string;
  name: string;
}

export const INTERVALS: IntervalDef[] = [
  { semitones: 1, short: "m2", name: "minor 2nd" },
  { semitones: 2, short: "M2", name: "major 2nd" },
  { semitones: 3, short: "m3", name: "minor 3rd" },
  { semitones: 4, short: "M3", name: "major 3rd" },
  { semitones: 5, short: "P4", name: "perfect 4th" },
  { semitones: 6, short: "TT", name: "tritone" },
  { semitones: 7, short: "P5", name: "perfect 5th" },
  { semitones: 8, short: "m6", name: "minor 6th" },
  { semitones: 9, short: "M6", name: "major 6th" },
  { semitones: 10, short: "m7", name: "minor 7th" },
  { semitones: 11, short: "M7", name: "major 7th" },
  { semitones: 12, short: "P8", name: "octave" },
  { semitones: 13, short: "m9", name: "minor 9th" },
  { semitones: 14, short: "M9", name: "major 9th" },
  { semitones: 15, short: "m10", name: "minor 10th" },
  { semitones: 16, short: "M10", name: "major 10th" },
  { semitones: 17, short: "P11", name: "perfect 11th" },
  { semitones: 18, short: "A11", name: "augmented 11th" },
  { semitones: 19, short: "P12", name: "perfect 12th" },
  { semitones: 20, short: "m13", name: "minor 13th" },
  { semitones: 21, short: "M13", name: "major 13th" },
  { semitones: 22, short: "m14", name: "minor 14th" },
  { semitones: 23, short: "M14", name: "major 14th" },
  { semitones: 24, short: "P15", name: "two octaves" },
];

const BY_SEMITONES = new Map(INTERVALS.map((i) => [i.semitones, i]));

export function intervalDef(semitones: number): IntervalDef {
  const s = Math.abs(semitones);
  return BY_SEMITONES.get(s) ?? { semitones: s, short: `${s}st`, name: `${s} semitones` };
}

export function intervalShort(semitones: number): string {
  return intervalDef(semitones).short;
}

export function intervalName(semitones: number): string {
  return intervalDef(semitones).name;
}

/** Simple intervals are 1–12 semitones; compound adds 13–24. */
export function intervalPool(opts: { compound: boolean; allowed: number[] }): number[] {
  const simple = opts.allowed.length ? opts.allowed.filter((s) => s >= 1 && s <= 12) : INTERVALS.filter((i) => i.semitones <= 12).map((i) => i.semitones);
  if (!opts.compound) return simple;
  // compound: the same interval classes an octave up (m2 → m9, etc.), plus the double octave
  const compound = simple.map((s) => s + 12).filter((s) => s <= 24);
  return [...new Set([...simple, ...compound])].sort((a, b) => a - b);
}
