/**
 * Small, dependency-free note helpers. MIDI numbers are the canonical representation
 * everywhere in the app (60 = C4, 69 = A4 = 440 Hz).
 */

export const PITCH_CLASS_NAMES_SHARP = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

export const PITCH_CLASS_NAMES_FLAT = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
] as const;

/** Display label mixing sharps and flats the way most musicians read them. */
export const PITCH_CLASS_LABELS = [
  "C", "C♯/D♭", "D", "D♯/E♭", "E", "F", "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B",
] as const;

export const PITCH_CLASS_SHORT = [
  "C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B",
] as const;

export const MIDI_MIN = 21; // A0
export const MIDI_MAX = 108; // C8

export function pitchClassOf(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** Scientific pitch octave: C4 = 60. */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function midiFrom(pitchClass: number, octave: number): number {
  return (octave + 1) * 12 + pitchClass;
}

export function isBlackKey(midi: number): boolean {
  const pc = pitchClassOf(midi);
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

export function noteName(midi: number, style: "sharp" | "flat" | "short" = "short"): string {
  const pc = pitchClassOf(midi);
  const name =
    style === "sharp"
      ? PITCH_CLASS_NAMES_SHARP[pc]
      : style === "flat"
        ? PITCH_CLASS_NAMES_FLAT[pc]
        : PITCH_CLASS_SHORT[pc];
  return `${name}${octaveOf(midi)}`;
}

/** Name in the ASCII form smplr and MIDI.js soundfonts understand, e.g. "C#4". */
export function noteNameAscii(midi: number): string {
  return `${PITCH_CLASS_NAMES_SHARP[pitchClassOf(midi)]}${octaveOf(midi)}`;
}

export function midiToFrequency(midi: number, cents = 0): number {
  return 440 * Math.pow(2, (midi - 69 + cents / 100) / 12);
}

export function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function clampMidi(midi: number, lo = MIDI_MIN, hi = MIDI_MAX): number {
  return Math.min(hi, Math.max(lo, midi));
}

export function randomInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Weighted random pick. Weights must be >= 0; zero-weight items are never picked. */
export function pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(items);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
