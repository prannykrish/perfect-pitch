/**
 * Shared pieces for every trainer mode: adaptive miss stats, instrument pools, scoring types.
 */
import { filterInstruments, getInstrument, INSTRUMENTS, type InstrumentDef } from "@/lib/audio/instruments";
import { octaveOf, pick, pickWeighted, pitchClassOf } from "@/lib/music/notes";
import type { TrainerSettings } from "./settings";

export type QuizPhase = "idle" | "loading" | "question" | "answered" | "ended";

export interface Scored {
  correct: boolean;
  /** 0..1 partial credit. */
  score: number;
}

/** Rolling miss counters used for adaptive weighting. */
export interface MissStats {
  byPitchClass: number[]; // misses
  seenByPitchClass: number[];
  byOctave: Record<number, { seen: number; missed: number }>;
  byInstrument: Record<string, { seen: number; missed: number }>;
  /** Free-form buckets (interval semitones, chord quality ids, cents buckets…). */
  byKey: Record<string, { seen: number; missed: number }>;
}

export function emptyMissStats(): MissStats {
  return {
    byPitchClass: Array(12).fill(0),
    seenByPitchClass: Array(12).fill(0),
    byOctave: {},
    byInstrument: {},
    byKey: {},
  };
}

export function recordNoteResult(stats: MissStats, midi: number, instrumentId: string, correct: boolean) {
  const pc = pitchClassOf(midi);
  const oct = octaveOf(midi);
  stats.seenByPitchClass[pc]++;
  if (!correct) stats.byPitchClass[pc]++;
  const o = (stats.byOctave[oct] ??= { seen: 0, missed: 0 });
  o.seen++;
  if (!correct) o.missed++;
  recordInstrumentResult(stats, instrumentId, correct);
}

export function recordInstrumentResult(stats: MissStats, instrumentId: string, correct: boolean) {
  const i = (stats.byInstrument[instrumentId] ??= { seen: 0, missed: 0 });
  i.seen++;
  if (!correct) i.missed++;
}

export function recordKeyResult(stats: MissStats, key: string, correct: boolean) {
  const k = (stats.byKey[key] ??= { seen: 0, missed: 0 });
  k.seen++;
  if (!correct) k.missed++;
}

/** Weight helper: 1 + boost * missRate; unseen items get a mild boost so everything gets covered. */
export function missWeight(entry: { seen: number; missed: number } | undefined, boost = 3): number {
  const rate = entry?.seen ? entry.missed / entry.seen : 0.3;
  return 1 + boost * rate;
}

/** True for instruments that stream samples from smplr's CDN rather than local soundfonts / synths. */
export function isStreamed(def: InstrumentDef): boolean {
  return def.source.kind !== "soundfont" && def.source.kind !== "synth";
}

export function candidateInstruments(
  settings: TrainerSettings,
  opts: { isAvailable?: (def: InstrumentDef) => boolean; everything?: boolean } = {}
): InstrumentDef[] {
  const avail = (list: InstrumentDef[]) => (opts.isAvailable ? list.filter(opts.isAvailable) : list);
  const list = avail(
    filterInstruments({
      families: opts.everything || settings.poolMode === "all" || settings.poolMode === "everything" ? [] : settings.families,
      tiers: settings.tiers,
      pitchedOnly: true,
    })
  );
  return list.length ? list : avail(filterInstruments({ pitchedOnly: true }));
}

/** All MIDI numbers that satisfy the settings for a given instrument. */
export function candidateNotes(settings: TrainerSettings, instrumentId: string): number[] {
  const def = getInstrument(instrumentId);
  let lo = settings.rangeLow;
  let hi = settings.rangeHigh;
  if (settings.useRealisticRange && def) {
    lo = Math.max(lo, def.range[0]);
    hi = Math.min(hi, def.range[1]);
  }
  if (lo > hi) {
    lo = def?.range[0] ?? settings.rangeLow;
    hi = def?.range[1] ?? settings.rangeHigh;
  }
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (settings.pitchClasses[pitchClassOf(m)]) out.push(m);
  if (!out.length) for (let m = lo; m <= hi; m++) out.push(m);
  return out;
}

/** Effective [lo, hi] for an instrument, ignoring the pitch-class filter. */
export function noteRange(settings: TrainerSettings, instrumentId: string): [number, number] {
  const notes = candidateNotes(settings, instrumentId);
  return [notes[0], notes[notes.length - 1]];
}

/** Pick a target note with adaptive weighting. */
export function pickNote(settings: TrainerSettings, instrumentId: string, opts: { avoid?: number; stats?: MissStats; within?: [number, number] } = {}): number {
  let notes = candidateNotes(settings, instrumentId);
  if (opts.within) {
    const [wl, wh] = opts.within;
    const inside = notes.filter((m) => m >= wl && m <= wh);
    if (inside.length) notes = inside;
    else {
      // The window misses this instrument's range entirely: take the closest notes to the window.
      const center = (wl + wh) / 2;
      const dist = (m: number) => (m < wl ? wl - m : m > wh ? m - wh : 0);
      const best = Math.min(...notes.map(dist));
      notes = notes.filter((m) => dist(m) === best).sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
    }
  }
  if (!notes.length) notes = candidateNotes(settings, instrumentId);
  const pool = notes.length > 1 && opts.avoid !== undefined ? notes.filter((n) => n !== opts.avoid) : notes;
  if (!settings.adaptive || !opts.stats) return pick(pool);
  const s = opts.stats;
  const weights = pool.map((m) => {
    const pc = pitchClassOf(m);
    const pcRate = s.seenByPitchClass[pc] ? s.byPitchClass[pc] / s.seenByPitchClass[pc] : 0.3;
    const o = s.byOctave[octaveOf(m)];
    const octRate = o?.seen ? o.missed / o.seen : 0.3;
    return 1 + 3 * pcRate + 2 * octRate;
  });
  return pickWeighted(pool, weights);
}

export function pickInstrumentId(candidates: InstrumentDef[], stats?: MissStats, avoid?: string): string {
  const pool = candidates.length > 1 && avoid ? candidates.filter((d) => d.id !== avoid) : candidates;
  if (!pool.length) return INSTRUMENTS[0].id;
  if (!stats) return pick(pool).id;
  return pickWeighted(
    pool,
    pool.map((d) => missWeight(stats.byInstrument[d.id]))
  ).id;
}

/** Seed session stats from lifetime numbers, capped so a session can still move them. */
export function seedMissStats(
  stats: MissStats,
  seed: {
    byPitchClass: { pitchClass: number; total: number; correct: number }[];
    byOctave: { octave: number; total: number; correct: number }[];
    byInstrument: { instrumentId: string; total: number; correct: number }[];
  },
  cap = 20
) {
  for (const r of seed.byPitchClass) {
    const seen = Math.min(cap, r.total);
    const missed = Math.round(seen * (1 - r.correct / Math.max(1, r.total)));
    stats.seenByPitchClass[r.pitchClass] += seen;
    stats.byPitchClass[r.pitchClass] += missed;
  }
  for (const r of seed.byOctave) {
    const seen = Math.min(cap, r.total);
    const missed = Math.round(seen * (1 - r.correct / Math.max(1, r.total)));
    const o = (stats.byOctave[r.octave] ??= { seen: 0, missed: 0 });
    o.seen += seen;
    o.missed += missed;
  }
  for (const r of seed.byInstrument) {
    const seen = Math.min(cap, r.total);
    const missed = Math.round(seen * (1 - r.correct / Math.max(1, r.total)));
    const i = (stats.byInstrument[r.instrumentId] ??= { seen: 0, missed: 0 });
    i.seen += seen;
    i.missed += missed;
  }
}
