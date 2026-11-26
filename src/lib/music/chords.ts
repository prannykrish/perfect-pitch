/** Chord vocabulary, voicings, inversions and clusters. All notes are MIDI numbers. */
import { PITCH_CLASS_SHORT, pitchClassOf, randomInt, shuffle } from "./notes";

export type ChordCategory = "triads" | "sevenths" | "extended" | "sus-add" | "altered";

export const CHORD_CATEGORY_LABELS: Record<ChordCategory, string> = {
  triads: "Triads",
  sevenths: "Sevenths",
  extended: "9ths, 11ths, 13ths",
  "sus-add": "Sus & add",
  altered: "Altered",
};

export interface ChordQuality {
  id: string;
  /** Suffix after the root, e.g. "m7" → "Cm7". */
  suffix: string;
  name: string;
  /** Semitones above the root, root first. Extensions may exceed 12. */
  intervals: number[];
  category: ChordCategory;
}

// prettier-ignore
export const CHORD_QUALITIES: ChordQuality[] = [
  { id: "maj", suffix: "", name: "major", intervals: [0, 4, 7], category: "triads" },
  { id: "min", suffix: "m", name: "minor", intervals: [0, 3, 7], category: "triads" },
  { id: "dim", suffix: "dim", name: "diminished", intervals: [0, 3, 6], category: "triads" },
  { id: "aug", suffix: "aug", name: "augmented", intervals: [0, 4, 8], category: "triads" },
  { id: "sus2", suffix: "sus2", name: "suspended 2nd", intervals: [0, 2, 7], category: "sus-add" },
  { id: "sus4", suffix: "sus4", name: "suspended 4th", intervals: [0, 5, 7], category: "sus-add" },
  { id: "6", suffix: "6", name: "major 6th", intervals: [0, 4, 7, 9], category: "sevenths" },
  { id: "m6", suffix: "m6", name: "minor 6th", intervals: [0, 3, 7, 9], category: "sevenths" },
  { id: "7", suffix: "7", name: "dominant 7th", intervals: [0, 4, 7, 10], category: "sevenths" },
  { id: "maj7", suffix: "maj7", name: "major 7th", intervals: [0, 4, 7, 11], category: "sevenths" },
  { id: "m7", suffix: "m7", name: "minor 7th", intervals: [0, 3, 7, 10], category: "sevenths" },
  { id: "m7b5", suffix: "m7♭5", name: "half-diminished", intervals: [0, 3, 6, 10], category: "sevenths" },
  { id: "dim7", suffix: "dim7", name: "diminished 7th", intervals: [0, 3, 6, 9], category: "sevenths" },
  { id: "mMaj7", suffix: "mMaj7", name: "minor-major 7th", intervals: [0, 3, 7, 11], category: "sevenths" },
  { id: "aug7", suffix: "aug7", name: "augmented 7th", intervals: [0, 4, 8, 10], category: "altered" },
  { id: "augMaj7", suffix: "augMaj7", name: "augmented major 7th", intervals: [0, 4, 8, 11], category: "altered" },
  { id: "7sus4", suffix: "7sus4", name: "dominant 7th sus4", intervals: [0, 5, 7, 10], category: "sus-add" },
  { id: "add9", suffix: "add9", name: "add 9", intervals: [0, 4, 7, 14], category: "sus-add" },
  { id: "madd9", suffix: "m(add9)", name: "minor add 9", intervals: [0, 3, 7, 14], category: "sus-add" },
  { id: "69", suffix: "6/9", name: "six-nine", intervals: [0, 4, 7, 9, 14], category: "extended" },
  { id: "9", suffix: "9", name: "dominant 9th", intervals: [0, 4, 7, 10, 14], category: "extended" },
  { id: "maj9", suffix: "maj9", name: "major 9th", intervals: [0, 4, 7, 11, 14], category: "extended" },
  { id: "m9", suffix: "m9", name: "minor 9th", intervals: [0, 3, 7, 10, 14], category: "extended" },
  { id: "7b9", suffix: "7♭9", name: "dominant 7th flat 9", intervals: [0, 4, 7, 10, 13], category: "altered" },
  { id: "7#9", suffix: "7♯9", name: "dominant 7th sharp 9", intervals: [0, 4, 7, 10, 15], category: "altered" },
  { id: "7#11", suffix: "7♯11", name: "dominant 7th sharp 11", intervals: [0, 4, 7, 10, 18], category: "altered" },
  { id: "7b13", suffix: "7♭13", name: "dominant 7th flat 13", intervals: [0, 4, 7, 10, 20], category: "altered" },
  { id: "maj7#11", suffix: "maj7♯11", name: "major 7th sharp 11", intervals: [0, 4, 7, 11, 18], category: "extended" },
  { id: "m11", suffix: "m11", name: "minor 11th", intervals: [0, 3, 7, 10, 14, 17], category: "extended" },
  { id: "11", suffix: "11", name: "dominant 11th", intervals: [0, 7, 10, 14, 17], category: "extended" },
  { id: "13", suffix: "13", name: "dominant 13th", intervals: [0, 4, 7, 10, 14, 21], category: "extended" },
  { id: "maj13", suffix: "maj13", name: "major 13th", intervals: [0, 4, 7, 11, 14, 21], category: "extended" },
  { id: "m13", suffix: "m13", name: "minor 13th", intervals: [0, 3, 7, 10, 14, 21], category: "extended" },
];

const QUALITY_BY_ID = new Map(CHORD_QUALITIES.map((q) => [q.id, q]));

export function chordQuality(id: string): ChordQuality | undefined {
  return QUALITY_BY_ID.get(id);
}

export type Voicing = "closed" | "open" | "drop2";

export const VOICING_LABELS: Record<Voicing, string> = {
  closed: "Closed",
  open: "Open (spread)",
  drop2: "Drop 2",
};

export interface ChordSpec {
  rootPc: number;
  qualityId: string;
  /** 0 = root position, 1 = first inversion (third in the bass), etc. */
  inversion: number;
  voicing: Voicing;
}

export const INVERSION_LABELS = ["Root position", "1st inversion", "2nd inversion", "3rd inversion", "4th inversion", "5th inversion"];

export function chordLabel(spec: Pick<ChordSpec, "rootPc" | "qualityId"> & { inversion?: number }, withInversion = false): string {
  const q = chordQuality(spec.qualityId);
  const base = `${PITCH_CLASS_SHORT[spec.rootPc]}${q?.suffix ?? spec.qualityId}`;
  if (withInversion && spec.inversion) return `${base} (${INVERSION_LABELS[spec.inversion] ?? `inv ${spec.inversion}`})`;
  return base;
}

/**
 * Voicing of a chord as semitone offsets from the ROOT (root position closed voicing = the quality's
 * intervals). Inversion moves the lowest k chord tones up an octave; open / drop-2 are applied after.
 * Sorted ascending; the lowest value tells which chord tone is in the bass.
 */
export function chordOffsets(spec: ChordSpec): number[] {
  const q = chordQuality(spec.qualityId);
  if (!q) throw new Error(`Unknown chord quality ${spec.qualityId}`);
  let rel = [...q.intervals].sort((a, b) => a - b);
  const n = rel.length;
  const inv = ((spec.inversion % n) + n) % n;
  for (let i = 0; i < inv; i++) {
    const lowest = rel.shift()!;
    rel.push(lowest + 12 * Math.ceil((rel[rel.length - 1] - lowest + 1) / 12));
    rel = rel.sort((a, b) => a - b);
  }
  if (spec.voicing === "open" && rel.length >= 3) {
    rel = rel.map((r, i) => (i % 2 === 1 ? r + 12 : r)).sort((a, b) => a - b);
  } else if (spec.voicing === "drop2" && rel.length >= 4) {
    rel[rel.length - 2] -= 12;
    rel = rel.sort((a, b) => a - b);
  }
  return rel;
}

/** Pitch class of the lowest note of this voicing. */
export function bassPitchClass(spec: ChordSpec): number {
  const offsets = chordOffsets(spec);
  return (((spec.rootPc + offsets[0]) % 12) + 12) % 12;
}

/**
 * Build the MIDI notes of a chord. `bassMidi` is the lowest note of the resulting voicing and must
 * have the pitch class `bassPitchClass(spec)` for the chord to be what the spec says (the generator
 * guarantees that). The result is sorted ascending.
 */
export function buildChord(spec: ChordSpec, bassMidi: number): number[] {
  const offsets = chordOffsets(spec);
  const lowest = offsets[0];
  return offsets.map((r) => bassMidi + (r - lowest));
}

export function chordSpan(spec: ChordSpec): number {
  const offsets = chordOffsets(spec);
  return offsets[offsets.length - 1] - offsets[0];
}

/** Pitch-class set of a chord quality on a root. */
export function chordPitchClasses(rootPc: number, qualityId: string): Set<number> {
  const q = chordQuality(qualityId);
  if (!q) return new Set();
  return new Set(q.intervals.map((i) => (rootPc + i) % 12));
}

export function samePitchClasses(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** The qualities a question may use: the enabled categories, narrowed to `qualities` when any of those ids are in them. */
export function chordQualityPool(categories: ChordCategory[], qualities: string[] = []): ChordQuality[] {
  const pool = CHORD_QUALITIES.filter((q) => categories.length === 0 || categories.includes(q.category));
  if (!qualities.length) return pool;
  const narrowed = pool.filter((q) => qualities.includes(q.id));
  return narrowed.length ? narrowed : pool;
}

/** Pick a random chord spec from the enabled categories (optionally narrowed to quality ids) and voicings. */
export function randomChordSpec(opts: { categories: ChordCategory[]; inversions: boolean; voicings: Voicing[]; qualities?: string[] }): ChordSpec {
  const pool = chordQualityPool(opts.categories, opts.qualities);
  const q = pool.length ? pool[randomInt(0, pool.length - 1)] : CHORD_QUALITIES[0];
  const n = q.intervals.length;
  const inversion = opts.inversions ? randomInt(0, Math.min(n - 1, 3)) : 0;
  const voicings = opts.voicings.length ? opts.voicings : (["closed"] as Voicing[]);
  const voicing = voicings[randomInt(0, voicings.length - 1)];
  return { rootPc: randomInt(0, 11), qualityId: q.id, inversion, voicing };
}

/**
 * Random cluster: `count` distinct notes within `span` semitones, inside [lo, hi].
 */
export function randomCluster(count: number, span: number, lo: number, hi: number): number[] {
  const width = Math.max(count, Math.min(span, hi - lo));
  const start = randomInt(lo, Math.max(lo, hi - width));
  const candidates: number[] = [];
  for (let m = start; m <= Math.min(hi, start + width); m++) candidates.push(m);
  return shuffle(candidates)
    .slice(0, count)
    .sort((a, b) => a - b);
}

/**
 * Identify the chord in a set of notes if it matches a known quality exactly (any inversion).
 * When several roots fit (symmetric chords such as dim7 / aug, or sus2 vs sus4), the root that
 * equals the lowest note wins, then the lowest root.
 */
export function identifyChord(notes: number[]): { rootPc: number; qualityId: string } | null {
  if (!notes.length) return null;
  const pcs = [...new Set(notes.map(pitchClassOf))].sort((a, b) => a - b);
  const bassPc = pitchClassOf(Math.min(...notes));
  const matches: { rootPc: number; qualityId: string }[] = [];
  for (const q of CHORD_QUALITIES) {
    const qpcs = [...new Set(q.intervals.map((i) => i % 12))];
    if (qpcs.length !== pcs.length) continue;
    for (let root = 0; root < 12; root++) {
      const set = new Set(qpcs.map((i) => (i + root) % 12));
      if (pcs.every((p) => set.has(p))) matches.push({ rootPc: root, qualityId: q.id });
    }
  }
  if (!matches.length) return null;
  return matches.find((m) => m.rootPc === bassPc) ?? matches[0];
}
