"use client";

/**
 * Loads the current level, its tagged reps and today's counts, evaluates the gates, and exposes the
 * actions (start a drill, tick a lesson, advance, go back). One instance feeds both the level card
 * and the calendar, so they always show the same plan.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getDrillRepsOnDay, getDrillRows, getLevelState, saveLevelState, type DrillRow, type LevelState } from "@/lib/db/actions";
import { dailyTarget, evaluateLevel, reviewGate, type DrillStatus, type LevelStatus } from "@/lib/practice/gates";
import { DRILL_BY_ID, drillHref, LEVEL_BY_ID, LEVELS, nextLevel, previousLevel, type DrillDef, type LevelDef } from "@/lib/practice/levels";
import { useLevelRun } from "@/lib/practice/level-run";
import { useCountPrefs } from "@/lib/practice/count-prefs";
import { todayKey } from "@/lib/practice/plan";

const DEFAULT_STATE: LevelState = { currentLevelId: "L0", completed: {}, lessonsRead: [] };

/** One row of the day's plan as the level defines it. */
export interface LevelPlanRow {
  drill: DrillDef;
  status: DrillStatus;
  /** Reps wanted today (the daily dose, a quarter once the gate has passed). */
  target: number;
  review: boolean;
}

export interface LevelData {
  loading: boolean;
  state: LevelState | null;
  level: LevelDef;
  status: LevelStatus | null;
  /** Tagged reps per drill today. */
  today: Map<string, number>;
  /** The day's plan rows: drills then reviews, with today's targets. */
  plan: LevelPlanRow[];
  reload: () => void;
  start: (drill: DrillDef) => void;
  toggleLesson: (id: string, read: boolean) => void;
  advance: () => void;
  back: () => void;
}

export function useLevelData(): LevelData {
  const router = useRouter();
  const [state, setState] = useState<LevelState | null>(null);
  const [rows, setRows] = useState<DrillRow[]>([]);
  const [today, setToday] = useState<Map<string, number>>(new Map());
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const startRun = useLevelRun((s) => s.start);

  const level: LevelDef = LEVEL_BY_ID.get(state?.currentLevelId ?? "L0") ?? LEVELS[0];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = (await getLevelState()) ?? DEFAULT_STATE;
        const lvl = LEVEL_BY_ID.get(st.currentLevelId) ?? LEVELS[0];
        const wanted = [
          ...lvl.drills.map((d) => ({ drillId: d.id, limit: d.gate.window })),
          ...lvl.review.map((r) => {
            const d = DRILL_BY_ID.get(r.drillId);
            return { drillId: r.drillId, limit: d ? reviewGate(d.gate).window : 50 };
          }),
        ];
        const [rs, td] = await Promise.all([getDrillRows(wanted), getDrillRepsOnDay(todayKey())]);
        if (cancelled) return;
        useCountPrefs.getState().setLevelId(lvl.id);
        setState(st);
        setRows(rs);
        setToday(new Map(td.map((t) => [t.drillId, t.total])));
        setLoading(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const status: LevelStatus | null = useMemo(() => {
    if (!state) return null;
    const byDrill = new Map<string, DrillRow[]>();
    for (const r of rows) {
      const list = byDrill.get(r.drillId) ?? [];
      list.push(r);
      byDrill.set(r.drillId, list);
    }
    return evaluateLevel(level, byDrill, new Set(state.lessonsRead));
  }, [state, rows, level]);

  const plan: LevelPlanRow[] = useMemo(() => {
    if (!status) return [];
    const own = status.drills.map((s) => ({ drill: s.drill, status: s, target: dailyTarget(s, level.drills.find((d) => d.id === s.drill.id)?.daily ?? s.drill.daily), review: false }));
    const rev = status.reviews.map((s) => ({ drill: s.drill, status: s, target: dailyTarget(s, level.review.find((r) => r.drillId === s.drill.id)?.daily ?? s.drill.daily), review: true }));
    return [...own, ...rev];
  }, [status, level]);

  const persist = useCallback(async (next: LevelState) => {
    setState(next);
    useCountPrefs.getState().setLevelId(next.currentLevelId);
    try {
      await saveLevelState(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const start = useCallback(
    (d: DrillDef) => {
      startRun(d, level.id);
      router.push(drillHref(d));
    },
    [startRun, level.id, router]
  );

  const toggleLesson = useCallback(
    (id: string, read: boolean) => {
      if (!state) return;
      const set = new Set(state.lessonsRead);
      if (read) set.add(id);
      else set.delete(id);
      persist({ ...state, lessonsRead: [...set] });
    },
    [state, persist]
  );

  const advance = useCallback(() => {
    if (!state) return;
    const nxt = nextLevel(level.id);
    if (!nxt) return;
    persist({ ...state, currentLevelId: nxt.id, completed: { ...state.completed, [level.id]: todayKey() } });
    toast.success(`Level ${nxt.n}: ${nxt.title}`);
    reload();
  }, [state, level.id, persist, reload]);

  const back = useCallback(() => {
    if (!state) return;
    const prev = previousLevel(level.id);
    if (!prev) return;
    persist({ ...state, currentLevelId: prev.id });
    reload();
  }, [state, level.id, persist, reload]);

  return { loading, state, level, status, today, plan, reload, start, toggleLesson, advance, back };
}
