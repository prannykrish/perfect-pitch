/**
 * Evaluates a drill's mastery gate over its most recent tagged reps, and a whole level over its
 * drills, reviews and lessons. Pure.
 */
import { intervalShort } from "@/lib/music/intervals";
import { chordQuality } from "@/lib/music/chords";
import { scaleDef } from "@/lib/music/scales";
import { DRILL_BY_ID, type DrillDef, type Gate, type LevelDef, type SpreadBy } from "./levels";

/** The shape of a tagged rep the evaluator needs (see getDrillRows in the actions). */
export interface RepRow {
  drillId: string;
  day: string;
  correct: boolean;
  score: number;
  targetOctave: number | null;
  target: unknown;
}

export interface SpreadCell {
  key: string;
  label: string;
  n: number;
  value: number;
  ok: boolean;
}

export interface DrillStatus {
  drill: DrillDef;
  gate: Gate;
  /** Reps considered (at most the window). */
  n: number;
  /** Accuracy or average credit over those reps. */
  value: number;
  days: number;
  spread: SpreadCell[];
  /** Distinct keys with enough reps. */
  keysCovered: number;
  passed: boolean;
  /** Plain reasons it is not passed yet (empty when passed). */
  open: string[];
  /** 0..1 for the bar: reps towards the window, scaled by how close the accuracy is. */
  progress: number;
}

function spreadKey(by: SpreadBy, row: RepRow): string | null {
  const t = (row.target ?? {}) as Record<string, unknown>;
  switch (by) {
    case "octave":
      return row.targetOctave === null ? null : String(row.targetOctave);
    case "interval": {
      const iv = t.intervals;
      return Array.isArray(iv) && iv.length ? String(iv[0]) : null;
    }
    case "quality": {
      const spec = t.spec as { qualityId?: string } | null | undefined;
      return spec?.qualityId ?? null;
    }
    case "scale":
      return typeof t.scaleId === "string" ? t.scaleId : null;
  }
}

function spreadLabel(by: SpreadBy, key: string): string {
  switch (by) {
    case "octave":
      return `octave ${key}`;
    case "interval":
      return intervalShort(Number(key));
    case "quality":
      return chordQuality(key)?.name ?? key;
    case "scale":
      return scaleDef(key)?.name ?? key;
  }
}

export function evaluateDrill(drill: DrillDef, gate: Gate, rowsNewestFirst: RepRow[]): DrillStatus {
  const rows = rowsNewestFirst.slice(0, gate.window);
  const n = rows.length;
  const value = n ? (gate.metric === "score" ? rows.reduce((a, r) => a + r.score, 0) / n : rows.filter((r) => r.correct).length / n) : 0;
  const days = new Set(rows.map((r) => r.day)).size;
  const open: string[] = [];
  if (n < gate.window) open.push(`${gate.window - n} more reps to fill the window`);
  if (n && value < gate.accuracy) open.push(`${Math.round(value * 100)} % so far, ${Math.round(gate.accuracy * 100)} % needed`);
  if (n >= gate.window && days < gate.minDays) open.push(`spread over ${gate.minDays} days (${days} so far)`);

  const spread: SpreadCell[] = [];
  let keysCovered = 0;
  if (gate.spread) {
    const byKey = new Map<string, { n: number; sum: number }>();
    for (const r of rows) {
      const k = spreadKey(gate.spread.by, r);
      if (k === null) continue;
      const e = byKey.get(k) ?? { n: 0, sum: 0 };
      e.n++;
      e.sum += gate.metric === "score" ? r.score : r.correct ? 1 : 0;
      byKey.set(k, e);
    }
    const sortKey = (k: string) => (gate.spread!.by === "octave" || gate.spread!.by === "interval" ? Number(k) : k);
    for (const [k, e] of [...byKey.entries()].sort((a, b) => (sortKey(a[0]) < sortKey(b[0]) ? -1 : 1))) {
      const v = e.sum / e.n;
      const enough = e.n >= gate.spread.minPerKey;
      if (enough) keysCovered++;
      spread.push({ key: k, label: spreadLabel(gate.spread.by, k), n: e.n, value: v, ok: !enough || v >= gate.spread.min });
    }
    const weak = spread.filter((c) => c.n >= gate.spread!.minPerKey && c.value < gate.spread!.min);
    if (n >= gate.window && keysCovered < gate.spread.minKeys) open.push(`${gate.spread.minKeys - keysCovered} more ${gate.spread.by}${gate.spread.minKeys - keysCovered === 1 ? "" : "s"} need ${gate.spread.minPerKey}+ reps`);
    if (weak.length) open.push(`below ${Math.round(gate.spread.min * 100)} %: ${weak.map((c) => c.label).join(", ")}`);
  }

  const passed = open.length === 0 && n >= gate.window;
  const fill = Math.min(1, n / gate.window);
  const acc = n ? Math.min(1, value / gate.accuracy) : 0;
  return { drill, gate, n, value, days, spread, keysCovered, passed, open, progress: passed ? 1 : fill * 0.7 + acc * 0.3 * fill };
}

/** A review keeps the original gate but only needs half the window. */
export function reviewGate(g: Gate): Gate {
  return { ...g, window: Math.max(20, Math.round(g.window / 2)), minDays: Math.min(g.minDays, 2), spread: g.spread ? { ...g.spread, minKeys: Math.max(1, Math.round(g.spread.minKeys / 2)), minPerKey: Math.max(3, Math.round(g.spread.minPerKey / 2)) } : undefined };
}

export interface LevelStatus {
  level: LevelDef;
  drills: DrillStatus[];
  reviews: DrillStatus[];
  lessons: { id: string; read: boolean }[];
  /** Everything holds: the app thinks you are ready to advance. */
  ready: boolean;
  passedCount: number;
  totalCount: number;
}

export function evaluateLevel(level: LevelDef, rowsByDrill: Map<string, RepRow[]>, lessonsRead: Set<string>): LevelStatus {
  const drills = level.drills.map((d) => evaluateDrill(d, d.gate, rowsByDrill.get(d.id) ?? []));
  const reviews = level.review
    .map((r) => {
      const d = DRILL_BY_ID.get(r.drillId);
      return d ? evaluateDrill(d, reviewGate(d.gate), rowsByDrill.get(d.id) ?? []) : null;
    })
    .filter((x): x is DrillStatus => !!x);
  const lessons = level.lessons.map((id) => ({ id, read: lessonsRead.has(id) }));
  const passedCount = drills.filter((d) => d.passed).length + reviews.filter((d) => d.passed).length + lessons.filter((l) => l.read).length;
  const totalCount = drills.length + reviews.length + lessons.length;
  const ready = level.id !== "mastery" && passedCount === totalCount;
  return { level, drills, reviews, lessons, ready, passedCount, totalCount };
}

/** How many reps a drill wants today: its daily dose while open, a quarter of it once passed. */
export function dailyTarget(status: DrillStatus, daily: number): number {
  return status.passed ? Math.max(5, Math.round(daily / 4)) : daily;
}
