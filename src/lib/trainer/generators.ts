/**
 * Question generators for the Phase 2 modes. Pure functions apart from `chooseInstrument`,
 * which may need to load an instrument.
 */
import { bassPitchClass, buildChord, chordSpan, randomChordSpec, randomCluster, type ChordSpec } from "@/lib/music/chords";
import { intervalPool } from "@/lib/music/intervals";
import { pick, randomInt, shuffle } from "@/lib/music/notes";
import { candidateNotes, noteRange, pickNote, type MissStats } from "./quiz-core";
import type { TrainerSettings } from "./settings";

export type ChooseInstrument = (avoid?: string) => Promise<string>;

// ---------------- sequence ----------------
export interface SequenceQuestion {
  notes: { midi: number; instrumentId: string }[];
}

export async function generateSequence(settings: TrainerSettings, chooseInstrument: ChooseInstrument, stats?: MissStats): Promise<SequenceQuestion> {
  const notes: SequenceQuestion["notes"] = [];
  let instrumentId = await chooseInstrument();
  let prev: number | undefined;
  for (let i = 0; i < settings.seqLength; i++) {
    const within: [number, number] | undefined =
      prev !== undefined && settings.seqMaxLeap > 0 ? [prev - settings.seqMaxLeap, prev + settings.seqMaxLeap] : undefined;
    if (i > 0 && settings.instrumentMode === "random-note") {
      // prefer an instrument whose range actually reaches the allowed jump window
      let next = await chooseInstrument(instrumentId);
      for (let tries = 0; within && tries < 4; tries++) {
        const [lo, hi] = noteRange(settings, next);
        if (hi >= within[0] && lo <= within[1]) break;
        next = await chooseInstrument(next);
      }
      instrumentId = next;
    }
    const midi = pickNote(settings, instrumentId, { avoid: prev, stats, within });
    notes.push({ midi, instrumentId });
    prev = midi;
  }
  return { notes };
}

// ---------------- intervals ----------------
export interface IntervalQuestion {
  variant: "pair" | "chain" | "stack";
  notes: { midi: number; instrumentId: string }[];
  /** Unsigned semitone distances the user must name. pair: 1; chain: n-1 consecutive; stack: from the bottom note to each upper note. */
  intervals: number[];
  /** For melodic pairs/chains: +1 up, -1 down per step. */
  directions: number[];
  playback: "melodic" | "harmonic";
}

export async function generateInterval(settings: TrainerSettings, chooseInstrument: ChooseInstrument, stats?: MissStats): Promise<IntervalQuestion> {
  const pool = intervalPool({ compound: settings.intervalCompound, allowed: settings.intervalSet });
  const weighted = (): number => {
    if (!settings.adaptive || !stats) return pick(pool);
    const weights = pool.map((s) => {
      const e = stats.byKey[`interval:${s}`];
      return 1 + 3 * (e?.seen ? e.missed / e.seen : 0.3);
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  };
  const dirFor = (): number => (settings.intervalDirection === "asc" ? 1 : settings.intervalDirection === "desc" ? -1 : pick([1, -1]));

  let instrumentId = await chooseInstrument();
  const [lo, hi] = noteRange(settings, instrumentId);

  if (settings.intervalVariant === "pair") {
    const semis = weighted();
    const playback = settings.intervalPlayback;
    const dir = playback === "harmonic" ? 1 : dirFor();
    // first note such that the second stays in range
    const firstLo = dir > 0 ? lo : Math.min(hi, lo + semis);
    const firstHi = dir > 0 ? Math.max(lo, hi - semis) : hi;
    const first = pickNote(settings, instrumentId, { stats, within: [firstLo, firstHi] });
    const second = first + dir * semis;
    const secondInst = settings.instrumentMode === "random-note" ? await chooseInstrument(instrumentId) : instrumentId;
    return {
      variant: "pair",
      notes: [
        { midi: first, instrumentId },
        { midi: second, instrumentId: secondInst },
      ],
      intervals: [semis],
      directions: [dir],
      playback,
    };
  }

  if (settings.intervalVariant === "chain") {
    const n = Math.max(2, settings.intervalChainLength);
    const notes: IntervalQuestion["notes"] = [];
    const intervals: number[] = [];
    const directions: number[] = [];
    let cur = pickNote(settings, instrumentId, { stats, within: [lo + 12, hi - 12] });
    if (cur < lo || cur > hi) cur = pickNote(settings, instrumentId, { stats });
    notes.push({ midi: cur, instrumentId });
    for (let i = 1; i < n; i++) {
      if (settings.instrumentMode === "random-note") instrumentId = await chooseInstrument(instrumentId);
      let semis = weighted();
      let dir = dirFor();
      if (cur + dir * semis > hi) dir = -1;
      if (cur + dir * semis < lo) dir = 1;
      if (cur + dir * semis > hi || cur + dir * semis < lo) {
        // interval too large for the remaining range: pick the largest that fits
        const fits = pool.filter((s) => cur + s <= hi || cur - s >= lo);
        semis = fits.length ? pick(fits) : 1;
        dir = cur + semis <= hi ? 1 : -1;
      }
      cur = cur + dir * semis;
      notes.push({ midi: cur, instrumentId });
      intervals.push(semis);
      directions.push(dir);
    }
    return { variant: "chain", notes, intervals, directions, playback: "melodic" };
  }

  // stack
  const size = Math.max(2, settings.intervalStackSize);
  const maxSpan = settings.intervalCompound ? 24 : 12;
  const bottom = pickNote(settings, instrumentId, { stats, within: [lo, Math.max(lo, hi - maxSpan)] });
  const notes: IntervalQuestion["notes"] = [{ midi: bottom, instrumentId }];
  const offsets = new Set<number>();
  let guard = 0;
  while (offsets.size < size - 1 && guard++ < 100) {
    const s = weighted();
    if (s <= maxSpan && bottom + s <= hi) offsets.add(s);
  }
  const sorted = [...offsets].sort((a, b) => a - b);
  for (const s of sorted) notes.push({ midi: bottom + s, instrumentId });
  return { variant: "stack", notes, intervals: sorted, directions: sorted.map(() => 1), playback: "harmonic" };
}

// ---------------- chords & clusters ----------------
export interface ChordQuestion {
  kind: "chord" | "cluster";
  notes: { midi: number; instrumentId: string }[];
  spec?: ChordSpec;
}

export async function generateChord(settings: TrainerSettings, chooseInstrument: ChooseInstrument, stats?: MissStats): Promise<ChordQuestion> {
  const instrumentId = await chooseInstrument();
  const [lo, hi] = noteRange(settings, instrumentId);
  const kind: "chord" | "cluster" =
    settings.chordKind === "chords" ? "chord" : settings.chordKind === "clusters" ? "cluster" : pick(["chord", "cluster"] as const);

  const withInstruments = async (midis: number[]) => {
    const out: ChordQuestion["notes"] = [];
    let inst = instrumentId;
    for (let i = 0; i < midis.length; i++) {
      if (i > 0 && settings.instrumentMode === "random-note") inst = await chooseInstrument(inst);
      out.push({ midi: midis[i], instrumentId: inst });
    }
    return out;
  };

  if (kind === "cluster") {
    const count = randomInt(Math.min(settings.clusterMin, settings.clusterMax), Math.max(settings.clusterMin, settings.clusterMax));
    const midis = randomCluster(count, settings.clusterSpan, lo, hi);
    return { kind, notes: await withInstruments(midis) };
  }

  // chord: pick a spec, weighted toward qualities that get missed
  let spec = randomChordSpec({ categories: settings.chordCategories, inversions: settings.chordInversions, voicings: settings.chordVoicings });
  if (settings.adaptive && stats) {
    // re-roll up to 3 times preferring weak qualities
    for (let i = 0; i < 3; i++) {
      const e = stats.byKey[`chord:${spec.qualityId}`];
      const rate = e?.seen ? e.missed / e.seen : 0.3;
      if (Math.random() < 0.4 + rate) break;
      spec = randomChordSpec({ categories: settings.chordCategories, inversions: settings.chordInversions, voicings: settings.chordVoicings });
    }
  }
  const span = chordSpan(spec);
  // choose a bass note so the whole chord fits in range; its pitch class must be the chord tone
  // this voicing puts in the bass (the root in root position, the third in first inversion, ...).
  const bassLo = lo;
  const bassHi = Math.max(lo, hi - span);
  const targetBassPc = bassPitchClass(spec);
  const bassCandidates: number[] = [];
  for (let m = bassLo; m <= bassHi; m++) if (m % 12 === targetBassPc) bassCandidates.push(m);
  let bass: number;
  if (bassCandidates.length) bass = pick(bassCandidates);
  else {
    // range too narrow for this voicing: fall back to root position closed and the nearest fitting bass
    spec = { ...spec, inversion: 0, voicing: "closed" };
    const pc = bassPitchClass(spec);
    const cands: number[] = [];
    for (let m = lo; m <= Math.max(lo, hi - chordSpan(spec)); m++) if (m % 12 === pc) cands.push(m);
    bass = cands.length ? pick(cands) : lo + ((pc - (lo % 12) + 12) % 12);
  }
  const midis = buildChord(spec, bass);
  return { kind, notes: await withInstruments(midis), spec };
}

// ---------------- cents ----------------
export const CENTS_BUCKETS = [5, 10, 15, 20, 30, 50];

export interface CentsQuestion {
  variant: "single" | "pair" | "chord";
  instrumentId: string;
  /** All notes played, in order; for chord: bottom to top. */
  notes: number[];
  /** Index (into notes) of the detuned note, or -1 when everything is in tune. */
  detunedIndex: number;
  /** Signed cents of the detuned note (0 when in tune). */
  cents: number;
}

export function centsBuckets(settings: TrainerSettings): number[] {
  const b = CENTS_BUCKETS.filter((c) => c >= settings.centsMin && c <= settings.centsMax);
  return b.length ? b : [settings.centsMax];
}

export async function generateCents(settings: TrainerSettings, chooseInstrument: ChooseInstrument, stats?: MissStats): Promise<CentsQuestion> {
  const instrumentId = await chooseInstrument();
  const buckets = centsBuckets(settings);
  const pickAmount = (): number => {
    if (!settings.adaptive || !stats) return pick(buckets);
    // weight toward buckets that are missed; the smallest buckets naturally get missed most
    const weights = buckets.map((b) => {
      const e = stats.byKey[`cents:${b}`];
      return 1 + 3 * (e?.seen ? e.missed / e.seen : 0.3);
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < buckets.length; i++) {
      r -= weights[i];
      if (r <= 0) return buckets[i];
    }
    return buckets[buckets.length - 1];
  };
  const sign = pick([1, -1]);

  if (settings.centsVariant === "single") {
    const midi = pickNote(settings, instrumentId, { stats });
    const inTune = Math.random() < settings.centsInTuneChance;
    return { variant: "single", instrumentId, notes: [midi], detunedIndex: inTune ? -1 : 0, cents: inTune ? 0 : sign * pickAmount() };
  }

  if (settings.centsVariant === "pair") {
    const midi = pickNote(settings, instrumentId, { stats });
    const which = randomInt(0, 1);
    return { variant: "pair", instrumentId, notes: [midi, midi], detunedIndex: which, cents: sign * pickAmount() };
  }

  // chord: a major or minor triad in close position, one member detuned
  const [lo, hi] = noteRange(settings, instrumentId);
  const root = pickNote(settings, instrumentId, { stats, within: [lo, Math.max(lo, hi - 7)] });
  const third = pick([3, 4]);
  const notes = [root, root + third, root + 7];
  const which = randomInt(0, 2);
  return { variant: "chord", instrumentId, notes, detunedIndex: which, cents: sign * pickAmount() };
}

/** Convenience for tests / summaries. */
export function shuffleCopy<T>(a: T[]): T[] {
  return shuffle(a);
}

export { candidateNotes };
