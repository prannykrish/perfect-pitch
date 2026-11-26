"use server";

import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { getDb, schema, type Db } from "./client";
import { appTimeZone, dayKeyIn, daySql, shiftDayKey, startOfDayIn, zoneSegments } from "./time";
import type { RecordedNote } from "@/lib/midi/recorder";
import type { Piece } from "@/lib/music/score";

const { sessions, attempts, recordings, pieces, pieceProgress, practicePlans, settings: kv } = schema;

// The database may be across the network (Turso), so every action opens with `await getDb()` and
// anything that needs several queries sends them as one `db.batch([...])`: one round trip, not twenty.

/**
 * The local calendar day (YYYY-MM-DD) of an epoch-milliseconds column, in the app's timezone.
 * A hosted database runs in UTC, so 'localtime' is not an option; see time.ts.
 */
function dayOf(column: AnySQLiteColumn): SQL<string> {
  const COLUMN = "\u0000";
  const pieces = daySql(COLUMN, zoneSegments(appTimeZone())).split(COLUMN);
  return sql.join(pieces.map((p) => sql.raw(p)), column) as SQL<string>;
}

/** Hands a list of queries to `db.batch`, which wants to see at least one. */
function nonEmpty<T>(items: T[]): [T, ...T[]] {
  return items as [T, ...T[]];
}

export async function startSession(input: { mode: string; settings: unknown }): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(sessions)
    .values({ mode: input.mode, startedAt: Date.now(), settings: input.settings })
    .returning({ id: sessions.id });
  return row.id;
}

export async function endSession(id: number): Promise<void> {
  const db = await getDb();
  await db.update(sessions).set({ endedAt: Date.now() }).where(eq(sessions.id, id));
}

export interface LogAttemptInput {
  sessionId: number | null;
  mode: string;
  instrumentId: string;
  target: unknown;
  answer: unknown;
  correct: boolean;
  score?: number;
  responseMs: number;
  replays?: number;
  targetPitchClass?: number | null;
  targetOctave?: number | null;
  answerPitchClass?: number | null;
  answerOctave?: number | null;
  /** Level / drill the rep counts for (only when done from a level with that drill's settings). */
  levelId?: string | null;
  drillId?: string | null;
}

export async function logAttempt(input: LogAttemptInput): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(attempts)
    .values({
      sessionId: input.sessionId,
      mode: input.mode,
      createdAt: Date.now(),
      instrumentId: input.instrumentId,
      target: input.target,
      answer: input.answer,
      correct: input.correct,
      score: input.score ?? (input.correct ? 1 : 0),
      responseMs: Math.max(0, Math.round(input.responseMs)),
      replays: input.replays ?? 0,
      targetPitchClass: input.targetPitchClass ?? null,
      targetOctave: input.targetOctave ?? null,
      answerPitchClass: input.answerPitchClass ?? null,
      answerOctave: input.answerOctave ?? null,
      levelId: input.levelId ?? null,
      drillId: input.drillId ?? null,
    })
    .returning({ id: attempts.id });
  return row.id;
}

/** "I was right": a slip of the hand, not the ear. The rep counts as correct everywhere (stats, gates, confusions). */
export async function markAttemptCorrect(id: number): Promise<void> {
  const db = await getDb();
  await db
    .update(attempts)
    .set({
      correct: true,
      score: 1,
      answerPitchClass: sql`${attempts.targetPitchClass}`,
      answerOctave: sql`${attempts.targetOctave}`,
      answer: sql`json_set(${attempts.answer}, '$.overridden', json('true'))`,
    })
    .where(eq(attempts.id, id));
}

// ---------------------------------------------------------------------------
// Levels: state in the key/value table, tagged reps per drill for the gates
// ---------------------------------------------------------------------------

export interface LevelState {
  currentLevelId: string;
  /** Level id → ISO date it was advanced from. */
  completed: Record<string, string>;
  lessonsRead: string[];
}

const LEVEL_KEY = "levels";

export async function getLevelState(): Promise<LevelState | null> {
  const db = await getDb();
  const [row] = await db.select().from(kv).where(eq(kv.key, LEVEL_KEY));
  return row ? (row.value as LevelState) : null;
}

export async function saveLevelState(state: LevelState): Promise<void> {
  const db = await getDb();
  const updatedAt = Date.now();
  await db.insert(kv).values({ key: LEVEL_KEY, value: state, updatedAt }).onConflictDoUpdate({ target: kv.key, set: { value: state, updatedAt } });
}

export interface DrillRow {
  drillId: string;
  day: string;
  createdAt: number;
  correct: boolean;
  score: number;
  targetOctave: number | null;
  /** The target JSON as stored, for spread keys (interval, chord quality, scale). */
  target: unknown;
}

/** The most recent tagged reps per drill (newest first), enough for each gate's window. */
export async function getDrillRows(drills: { drillId: string; limit: number }[]): Promise<DrillRow[]> {
  if (!drills.length) return [];
  const db = await getDb();
  const DAY = dayOf(attempts.createdAt);
  const queries = drills.map((d) =>
    db
      .select({ drillId: attempts.drillId, day: sql<string>`${DAY}`, createdAt: attempts.createdAt, correct: attempts.correct, score: attempts.score, targetOctave: attempts.targetOctave, target: attempts.target })
      .from(attempts)
      .where(eq(attempts.drillId, d.drillId))
      .orderBy(desc(attempts.createdAt))
      .limit(Math.max(1, d.limit))
  );
  const results = await db.batch(nonEmpty(queries));
  const out: DrillRow[] = [];
  for (const rows of results) {
    for (const r of rows) out.push({ drillId: r.drillId!, day: r.day, createdAt: r.createdAt, correct: !!r.correct, score: num(r.score), targetOctave: r.targetOctave, target: r.target });
  }
  return out;
}

/** Tagged reps per drill on one day (for the day's level plan). */
export async function getDrillRepsOnDay(day: string): Promise<{ drillId: string; total: number; correct: number }[]> {
  const db = await getDb();
  const DAY = dayOf(attempts.createdAt);
  const rows = (await db.all(sql`
    select ${attempts.drillId} as drillId, count(*) as total, sum(case when ${attempts.correct} then 1 else 0 end) as correct
    from ${attempts} where ${attempts.drillId} is not null and ${DAY} = ${day}
    group by 1`)) as { drillId: string; total: number; correct: number }[];
  return rows.map((r) => ({ drillId: r.drillId, total: num(r.total), correct: num(r.correct) }));
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface CountRow {
  label: string;
  total: number;
  correct: number;
}

export interface StatsData {
  /** Days included, or null for all time. */
  rangeDays: number | null;
  totals: { total: number; correct: number; avgMs: number; avgScore: number };
  today: { total: number; correct: number };
  streak: { current: number; longest: number; activeDays: number };
  byDay: { day: string; total: number; correct: number; avgMs: number }[];
  byMode: { mode: string; total: number; correct: number; avgScore: number }[];
  byPitchClass: { pitchClass: number; total: number; correct: number }[];
  byOctave: { octave: number; total: number; correct: number }[];
  byInstrument: { instrumentId: string; total: number; correct: number }[];
  /** Single-note answers: what was answered when each pitch class was played. */
  confusion: { target: number; answer: number; n: number }[];
  intervals: { semitones: number; total: number; correct: number }[];
  chords: { qualityId: string | null; kind: string; total: number; correct: number; avgScore: number }[];
  cents: { amount: number; total: number; correct: number; dirCorrect: number }[];
  /** Smallest deviation reliably heard (≥80% direction accuracy on ≥4 reps) per day; null when not enough data. */
  centsJndByDay: { day: string; jnd: number | null }[];
  sequence: { length: number; total: number; correct: number; avgScore: number }[];
  /** Scales & modes: per scale and question kind (run / melody). */
  scales: { scaleId: string; variant: string; total: number; correct: number }[];
  /** Find the Mistake breakdowns (mode "mistakes"). */
  mistakes: {
    byType: { type: string; total: number; correct: number; avgScore: number; locCorrect: number; diagCorrect: number; fixAsked: number; fixCorrect: number }[];
    /** Detuned note / drifted voice in context: how many cents, and whether the direction was heard. */
    byCents: { amount: number; total: number; correct: number; dirCorrect: number }[];
    bySource: { source: string; total: number; correct: number; avgScore: number }[];
  };
  /** Hear It, Play It breakdowns (mode "transcribe"). */
  transcribe: {
    longestCorrectBars: number | null;
    /** Longest phrase with at least 90% credit. */
    longestPassedBars: number | null;
    byVoices: { voices: number; total: number; correct: number; avgScore: number }[];
    byBars: { bars: number; total: number; correct: number; avgScore: number }[];
  };
  /** Shadow mode: live accuracy per day. */
  shadowByDay: { day: string; total: number; avgScore: number }[];
  /** Head to Keys: theory drills by kind and level, prompt-drill self-rating and first-note latency per day, hum-then-play per day. */
  theory: {
    byKind: { kind: string; total: number; correct: number; avgScore: number }[];
    byLevel: { level: number; total: number; correct: number; avgScore: number }[];
  };
  promptByDay: { day: string; total: number; avgRating: number; avgLatencyMs: number | null }[];
  humByDay: { day: string; total: number; avgScore: number }[];
}

const CORRECT = sql<number>`sum(case when ${attempts.correct} then 1 else 0 end)`;
const num = (v: unknown) => Number(v ?? 0);

/** `today` is the current day in the app's timezone (the server's own clock may be in UTC). */
function computeStreak(days: string[], today: string): { current: number; longest: number } {
  if (!days.length) return { current: 0, longest: 0 };
  const set = new Set(days);
  // current: count back from today (or yesterday if today has nothing yet)
  let key = set.has(today) ? today : shiftDayKey(today, -1);
  let current = 0;
  while (set.has(key)) {
    current++;
    key = shiftDayKey(key, -1);
  }
  // longest: walk the sorted list
  const sorted = [...set].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = shiftDayKey(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

export async function getStats(rangeDays: number | null): Promise<StatsData> {
  const db = await getDb();
  const zone = appTimeZone();
  const now = Date.now();
  const since = rangeDays ? now - rangeDays * 86400e3 : 0;
  const inRange = gte(attempts.createdAt, since);
  const startOfToday = startOfDayIn(zone, now);
  const DAY = dayOf(attempts.createdAt);
  const dirExpr = sql`case when json_extract(${attempts.target}, '$.cents') > 0 then 'sharp' when json_extract(${attempts.target}, '$.cents') < 0 then 'flat' else 'in-tune' end`;

  // Everything the page shows, sent as one batch: a single round trip to the database.
  const [
    totalsRows,
    todayRows,
    allDays,
    byDay,
    byMode,
    byPitchClass,
    byOctave,
    byInstrument,
    confusion,
    intervals,
    chords,
    cents,
    centsDaily,
    sequence,
    scales,
    mistakesByType,
    mistakesByCents,
    mistakesBySource,
    transcribeByVoices,
    transcribeByBars,
    longestRows,
    shadowByDay,
    theoryByKind,
    theoryByLevel,
    promptByDay,
    humByDay,
  ] = await db.batch([
    db
      .select({ total: sql<number>`count(*)`, correct: CORRECT, avgMs: sql<number>`coalesce(avg(${attempts.responseMs}), 0)`, avgScore: sql<number>`coalesce(avg(${attempts.score}), 0)` })
      .from(attempts)
      .where(inRange),

    db.select({ total: sql<number>`count(*)`, correct: CORRECT }).from(attempts).where(gte(attempts.createdAt, startOfToday)),

    db.select({ day: sql<string>`${DAY}` }).from(attempts).groupBy(DAY).orderBy(sql`1`),

    db
      .select({ day: sql<string>`${DAY}`, total: sql<number>`count(*)`, correct: CORRECT, avgMs: sql<number>`avg(${attempts.responseMs})` })
      .from(attempts)
      .where(inRange)
      .groupBy(DAY)
      .orderBy(sql`1`),

    db
      .select({ mode: attempts.mode, total: sql<number>`count(*)`, correct: CORRECT, avgScore: sql<number>`avg(${attempts.score})` })
      .from(attempts)
      .where(inRange)
      .groupBy(attempts.mode)
      .orderBy(desc(sql`count(*)`)),

    db
      .select({ pitchClass: attempts.targetPitchClass, total: sql<number>`count(*)`, correct: CORRECT })
      .from(attempts)
      .where(and(inRange, sql`${attempts.targetPitchClass} is not null`))
      .groupBy(attempts.targetPitchClass),

    db
      .select({ octave: attempts.targetOctave, total: sql<number>`count(*)`, correct: CORRECT })
      .from(attempts)
      .where(and(inRange, sql`${attempts.targetOctave} is not null`))
      .groupBy(attempts.targetOctave),

    db
      .select({ instrumentId: attempts.instrumentId, total: sql<number>`count(*)`, correct: CORRECT })
      .from(attempts)
      .where(inRange)
      .groupBy(attempts.instrumentId)
      .orderBy(desc(sql`count(*)`)),

    db
      .select({ target: attempts.targetPitchClass, answer: attempts.answerPitchClass, n: sql<number>`count(*)` })
      .from(attempts)
      .where(and(inRange, sql`${attempts.targetPitchClass} is not null and ${attempts.answerPitchClass} is not null`))
      .groupBy(attempts.targetPitchClass, attempts.answerPitchClass),

    db.all<{ semitones: number; total: number; correct: number }>(sql`
    select t.value as semitones, count(*) as total, sum(case when a.value = t.value then 1 else 0 end) as correct
    from ${attempts}, json_each(json_extract(${attempts.target}, '$.intervals')) as t
    left join json_each(json_extract(${attempts.answer}, '$.intervals')) as a on a.key = t.key
    where ${attempts.mode} = 'intervals' and ${attempts.createdAt} >= ${since}
    group by t.value order by t.value`),

    db.all<{ qualityId: string | null; kind: string; total: number; correct: number; avgScore: number }>(sql`
    select json_extract(${attempts.target}, '$.spec.qualityId') as qualityId, json_extract(${attempts.target}, '$.kind') as kind,
           count(*) as total, sum(case when ${attempts.correct} then 1 else 0 end) as correct, avg(${attempts.score}) as avgScore
    from ${attempts} where ${attempts.mode} = 'chords' and ${attempts.createdAt} >= ${since}
    group by 1, 2 order by total desc`),

    db.all<{ amount: number; total: number; correct: number; dirCorrect: number }>(sql`
    select abs(json_extract(${attempts.target}, '$.cents')) as amount, count(*) as total,
           sum(case when ${attempts.correct} then 1 else 0 end) as correct,
           sum(case when json_extract(${attempts.answer}, '$.direction') = ${dirExpr} then 1 else 0 end) as dirCorrect
    from ${attempts} where ${attempts.mode} = 'cents' and ${attempts.createdAt} >= ${since}
    group by 1 order by 1`),

    db.all<{ day: string; amount: number; total: number; dirCorrect: number }>(sql`
    select ${DAY} as day, abs(json_extract(${attempts.target}, '$.cents')) as amount, count(*) as total,
           sum(case when json_extract(${attempts.answer}, '$.direction') = ${dirExpr} then 1 else 0 end) as dirCorrect
    from ${attempts} where ${attempts.mode} = 'cents' and ${attempts.createdAt} >= ${since} and json_extract(${attempts.target}, '$.cents') != 0
    group by 1, 2 order by 1, 2`),

    // Not `as length`: a libSQL row is array-like, and its own length (the column count) would win.
    db.all<{ noteCount: number; total: number; correct: number; avgScore: number }>(sql`
    select json_array_length(json_extract(${attempts.target}, '$.notes')) as noteCount, count(*) as total,
           sum(case when ${attempts.correct} then 1 else 0 end) as correct, avg(${attempts.score}) as avgScore
    from ${attempts} where ${attempts.mode} = 'sequence' and ${attempts.createdAt} >= ${since}
    group by 1 order by 1`),

    db.all<{ scaleId: string; variant: string; total: number; correct: number }>(sql`
    select json_extract(${attempts.target}, '$.scaleId') as scaleId, json_extract(${attempts.target}, '$.variant') as variant,
           count(*) as total, sum(case when ${attempts.correct} then 1 else 0 end) as correct
    from ${attempts} where ${attempts.mode} = 'scales' and ${attempts.createdAt} >= ${since}
    group by 1, 2 order by 1, 2`),

    db.all<{ type: string; total: number; correct: number; avgScore: number; locCorrect: number; diagCorrect: number; fixAsked: number; fixCorrect: number }>(sql`
    select json_extract(${attempts.target}, '$.type') as type, count(*) as total,
           sum(case when ${attempts.correct} then 1 else 0 end) as correct, avg(${attempts.score}) as avgScore,
           sum(case when json_extract(${attempts.answer}, '$.locationOk') then 1 else 0 end) as locCorrect,
           sum(case when json_extract(${attempts.answer}, '$.diagnosisOk') then 1 else 0 end) as diagCorrect,
           sum(case when json_extract(${attempts.answer}, '$.fixOk') is not null then 1 else 0 end) as fixAsked,
           sum(case when json_extract(${attempts.answer}, '$.fixOk') then 1 else 0 end) as fixCorrect
    from ${attempts} where ${attempts.mode} = 'mistakes' and ${attempts.createdAt} >= ${since}
    group by 1 order by total desc`),

    db.all<{ amount: number; total: number; correct: number; dirCorrect: number }>(sql`
    select abs(json_extract(${attempts.target}, '$.cents')) as amount, count(*) as total,
           sum(case when ${attempts.correct} then 1 else 0 end) as correct,
           sum(case when json_extract(${attempts.answer}, '$.diagnosisOk') then 1 else 0 end) as dirCorrect
    from ${attempts} where ${attempts.mode} = 'mistakes' and ${attempts.createdAt} >= ${since}
      and json_extract(${attempts.target}, '$.cents') is not null and json_extract(${attempts.target}, '$.type') != 'ab'
    group by 1 order by 1`),

    db.all<{ source: string; total: number; correct: number; avgScore: number }>(sql`
    select json_extract(${attempts.target}, '$.source') as source, count(*) as total,
           sum(case when ${attempts.correct} then 1 else 0 end) as correct, avg(${attempts.score}) as avgScore
    from ${attempts} where ${attempts.mode} = 'mistakes' and ${attempts.createdAt} >= ${since}
    group by 1 order by total desc`),

    db.all<{ voices: number; total: number; correct: number; avgScore: number }>(sql`
    select json_extract(${attempts.target}, '$.voices') as voices, count(*) as total,
           sum(case when ${attempts.correct} then 1 else 0 end) as correct, avg(${attempts.score}) as avgScore
    from ${attempts} where ${attempts.mode} = 'transcribe' and ${attempts.createdAt} >= ${since}
    group by 1 order by 1`),

    db.all<{ bars: number; total: number; correct: number; avgScore: number }>(sql`
    select json_extract(${attempts.target}, '$.bars') as bars, count(*) as total,
           sum(case when ${attempts.correct} then 1 else 0 end) as correct, avg(${attempts.score}) as avgScore
    from ${attempts} where ${attempts.mode} = 'transcribe' and ${attempts.createdAt} >= ${since}
    group by 1 order by 1`),

    db.all<{ correctBars: number | null; passedBars: number | null }>(sql`
    select max(case when ${attempts.correct} then json_extract(${attempts.target}, '$.bars') end) as correctBars,
           max(case when ${attempts.score} >= 0.9 then json_extract(${attempts.target}, '$.bars') end) as passedBars
    from ${attempts} where ${attempts.mode} = 'transcribe' and ${attempts.createdAt} >= ${since}`),

    db.all<{ day: string; total: number; avgScore: number }>(sql`
    select ${DAY} as day, count(*) as total, avg(${attempts.score}) as avgScore
    from ${attempts} where ${attempts.mode} = 'shadow' and ${attempts.createdAt} >= ${since}
    group by 1 order by 1`),

    db.all<{ kind: string; total: number; correct: number; avgScore: number }>(sql`
    select json_extract(${attempts.target}, '$.kind') as kind, count(*) as total,
           sum(case when ${attempts.correct} then 1 else 0 end) as correct, avg(${attempts.score}) as avgScore
    from ${attempts} where ${attempts.mode} = 'theory' and ${attempts.createdAt} >= ${since}
    group by 1 order by total desc`),

    db.all<{ level: number; total: number; correct: number; avgScore: number }>(sql`
    select json_extract(${attempts.target}, '$.level') as level, count(*) as total,
           sum(case when ${attempts.correct} then 1 else 0 end) as correct, avg(${attempts.score}) as avgScore
    from ${attempts} where ${attempts.mode} = 'theory' and ${attempts.createdAt} >= ${since}
    group by 1 order by 1`),

    db.all<{ day: string; total: number; avgRating: number; avgLatencyMs: number | null }>(sql`
    select ${DAY} as day, count(*) as total, avg(json_extract(${attempts.answer}, '$.rating')) as avgRating,
           avg(json_extract(${attempts.answer}, '$.latencyMs')) as avgLatencyMs
    from ${attempts} where ${attempts.mode} = 'prompt' and ${attempts.createdAt} >= ${since}
    group by 1 order by 1`),

    db.all<{ day: string; total: number; avgScore: number }>(sql`
    select ${DAY} as day, count(*) as total, avg(${attempts.score}) as avgScore
    from ${attempts} where ${attempts.mode} = 'hum' and ${attempts.createdAt} >= ${since}
    group by 1 order by 1`),
  ]);

  const totals = totalsRows[0];
  const today = todayRows[0];
  const longest = longestRows[0];
  const streak = computeStreak(
    allDays.map((r) => r.day),
    dayKeyIn(zone, now)
  );

  const jndMap = new Map<string, number | null>();
  for (const r of centsDaily) {
    if (!jndMap.has(r.day)) jndMap.set(r.day, null);
    if (num(r.total) >= 4 && num(r.dirCorrect) / num(r.total) >= 0.8) {
      const cur = jndMap.get(r.day);
      if (cur === null || cur === undefined || num(r.amount) < cur) jndMap.set(r.day, num(r.amount));
    }
  }

  return {
    rangeDays,
    totals: { total: num(totals?.total), correct: num(totals?.correct), avgMs: Math.round(num(totals?.avgMs)), avgScore: num(totals?.avgScore) },
    today: { total: num(today?.total), correct: num(today?.correct) },
    streak: { ...streak, activeDays: allDays.length },
    byDay: byDay.map((r) => ({ day: r.day, total: num(r.total), correct: num(r.correct), avgMs: Math.round(num(r.avgMs)) })),
    byMode: byMode.map((r) => ({ mode: r.mode, total: num(r.total), correct: num(r.correct), avgScore: num(r.avgScore) })),
    byPitchClass: byPitchClass.map((r) => ({ pitchClass: r.pitchClass!, total: num(r.total), correct: num(r.correct) })),
    byOctave: byOctave.map((r) => ({ octave: r.octave!, total: num(r.total), correct: num(r.correct) })),
    byInstrument: byInstrument.map((r) => ({ instrumentId: r.instrumentId, total: num(r.total), correct: num(r.correct) })),
    confusion: confusion.map((r) => ({ target: r.target!, answer: r.answer!, n: num(r.n) })),
    intervals: intervals.map((r) => ({ semitones: num(r.semitones), total: num(r.total), correct: num(r.correct) })),
    chords: chords.map((r) => ({ qualityId: r.qualityId, kind: r.kind, total: num(r.total), correct: num(r.correct), avgScore: num(r.avgScore) })),
    cents: cents.map((r) => ({ amount: num(r.amount), total: num(r.total), correct: num(r.correct), dirCorrect: num(r.dirCorrect) })),
    centsJndByDay: [...jndMap.entries()].map(([day, jnd]) => ({ day, jnd })),
    sequence: sequence.map((r) => ({ length: num(r.noteCount), total: num(r.total), correct: num(r.correct), avgScore: num(r.avgScore) })),
    scales: scales.map((r) => ({ scaleId: String(r.scaleId ?? "?"), variant: String(r.variant ?? "?"), total: num(r.total), correct: num(r.correct) })),
    mistakes: {
      byType: mistakesByType.map((r) => ({
        type: String(r.type ?? "?"),
        total: num(r.total),
        correct: num(r.correct),
        avgScore: num(r.avgScore),
        locCorrect: num(r.locCorrect),
        diagCorrect: num(r.diagCorrect),
        fixAsked: num(r.fixAsked),
        fixCorrect: num(r.fixCorrect),
      })),
      byCents: mistakesByCents.map((r) => ({ amount: num(r.amount), total: num(r.total), correct: num(r.correct), dirCorrect: num(r.dirCorrect) })),
      bySource: mistakesBySource.map((r) => ({ source: String(r.source ?? "?"), total: num(r.total), correct: num(r.correct), avgScore: num(r.avgScore) })),
    },
    transcribe: {
      longestCorrectBars: longest?.correctBars == null ? null : num(longest.correctBars),
      longestPassedBars: longest?.passedBars == null ? null : num(longest.passedBars),
      byVoices: transcribeByVoices.map((r) => ({ voices: num(r.voices), total: num(r.total), correct: num(r.correct), avgScore: num(r.avgScore) })),
      byBars: transcribeByBars.map((r) => ({ bars: num(r.bars), total: num(r.total), correct: num(r.correct), avgScore: num(r.avgScore) })),
    },
    shadowByDay: shadowByDay.map((r) => ({ day: r.day, total: num(r.total), avgScore: num(r.avgScore) })),
    theory: {
      byKind: theoryByKind.map((r) => ({ kind: String(r.kind ?? "?"), total: num(r.total), correct: num(r.correct), avgScore: num(r.avgScore) })),
      byLevel: theoryByLevel.map((r) => ({ level: num(r.level), total: num(r.total), correct: num(r.correct), avgScore: num(r.avgScore) })),
    },
    promptByDay: promptByDay.map((r) => ({ day: r.day, total: num(r.total), avgRating: num(r.avgRating), avgLatencyMs: r.avgLatencyMs == null ? null : Math.round(num(r.avgLatencyMs)) })),
    humByDay: humByDay.map((r) => ({ day: r.day, total: num(r.total), avgScore: num(r.avgScore) })),
  };
}

export interface MissWeights {
  byPitchClass: { pitchClass: number; total: number; correct: number }[];
  byOctave: { octave: number; total: number; correct: number }[];
  byInstrument: { instrumentId: string; total: number; correct: number }[];
}

/** Recent lifetime accuracy per pitch class / octave / instrument, used to seed adaptive weighting. */
export async function getMissWeights(limit = 3000): Promise<MissWeights> {
  const db = await getDb();
  const recent = db
    .select({ id: attempts.id })
    .from(attempts)
    .orderBy(desc(attempts.createdAt))
    .limit(limit)
    .as("recent");
  const correctSum = sql<number>`sum(case when ${attempts.correct} then 1 else 0 end)`;
  const base = () => db.select({ pitchClass: attempts.targetPitchClass, octave: attempts.targetOctave, instrumentId: attempts.instrumentId, total: sql<number>`count(*)`, correct: correctSum }).from(attempts).innerJoin(recent, eq(recent.id, attempts.id));

  const [byPitchClass, byOctave, byInstrument] = await db.batch([
    base()
      .where(sql`${attempts.targetPitchClass} is not null`)
      .groupBy(attempts.targetPitchClass),
    base()
      .where(sql`${attempts.targetOctave} is not null`)
      .groupBy(attempts.targetOctave),
    base().groupBy(attempts.instrumentId),
  ]);

  return {
    byPitchClass: byPitchClass.map((r) => ({ pitchClass: r.pitchClass!, total: Number(r.total), correct: Number(r.correct ?? 0) })),
    byOctave: byOctave.map((r) => ({ octave: r.octave!, total: Number(r.total), correct: Number(r.correct ?? 0) })),
    byInstrument: byInstrument.map((r) => ({ instrumentId: r.instrumentId, total: Number(r.total), correct: Number(r.correct ?? 0) })),
  };
}

// ---------------------------------------------------------------------------
// Pieces (uploaded MIDI) and chunk-mode progress
// ---------------------------------------------------------------------------

export interface PieceSummary {
  id: number;
  createdAt: number;
  name: string;
  source: string;
  bpm: number;
  beatsPerBar: number;
  totalBeats: number;
  trackCount: number;
  noteCount: number;
}

export async function savePiece(piece: Piece): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(pieces)
    .values({ createdAt: Date.now(), name: piece.name, source: piece.source, bpm: piece.bpm, beatsPerBar: piece.beatsPerBar, totalBeats: piece.totalBeats, data: piece })
    .returning({ id: pieces.id });
  return row.id;
}

export async function listPieces(): Promise<PieceSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(pieces).orderBy(desc(pieces.createdAt)).limit(200);
  return rows.map((r) => {
    const p = r.data as Piece;
    return {
      id: r.id,
      createdAt: r.createdAt,
      name: r.name,
      source: r.source,
      bpm: r.bpm,
      beatsPerBar: r.beatsPerBar,
      totalBeats: r.totalBeats,
      trackCount: p.tracks?.length ?? 0,
      noteCount: p.tracks?.reduce((n, t) => n + t.notes.length, 0) ?? 0,
    };
  });
}

export async function getPiece(id: number): Promise<Piece | null> {
  const db = await getDb();
  const [r] = await db.select().from(pieces).where(eq(pieces.id, id));
  if (!r) return null;
  return { ...(r.data as Piece), id: `upload:${r.id}`, name: r.name };
}

export async function deletePiece(id: number): Promise<void> {
  const db = await getDb();
  await db.batch([db.delete(pieces).where(eq(pieces.id, id)), db.delete(pieceProgress).where(eq(pieceProgress.pieceKey, `upload:${id}`))]);
}

export async function getPieceProgress(pieceKey: string): Promise<{ phraseIndex: number; bestScore: number; attempts: number }[]> {
  const db = await getDb();
  const rows = await db.select().from(pieceProgress).where(eq(pieceProgress.pieceKey, pieceKey));
  return rows.map((r) => ({ phraseIndex: r.phraseIndex, bestScore: r.bestScore, attempts: r.attempts }));
}

export async function recordPhraseResult(pieceKey: string, phraseIndex: number, score: number): Promise<void> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(pieceProgress)
    .where(and(eq(pieceProgress.pieceKey, pieceKey), eq(pieceProgress.phraseIndex, phraseIndex)));
  if (existing) {
    await db
      .update(pieceProgress)
      .set({ bestScore: Math.max(existing.bestScore, score), attempts: existing.attempts + 1, updatedAt: Date.now() })
      .where(and(eq(pieceProgress.pieceKey, pieceKey), eq(pieceProgress.phraseIndex, phraseIndex)));
  } else {
    await db.insert(pieceProgress).values({ pieceKey, phraseIndex, bestScore: score, attempts: 1, updatedAt: Date.now() });
  }
}

// ---------------------------------------------------------------------------
// Practice calendar
// ---------------------------------------------------------------------------

export interface PlanRow {
  date: string;
  items: unknown[];
  notes: string;
}

export interface ModeDayRow {
  day: string;
  mode: string;
  total: number;
  correct: number;
}

export interface PracticeRange {
  plans: PlanRow[];
  /** Reps per day per attempt mode. */
  reps: ModeDayRow[];
  /** Minutes per day per session mode (sessions that were ended). */
  minutes: { day: string; mode: string; minutes: number }[];
  /** Reps per day that were done from a level drill (tagged). */
  levelDays: { day: string; total: number; correct: number }[];
}

export async function getPracticeRange(from: string, to: string): Promise<PracticeRange> {
  const db = await getDb();
  const DAY = dayOf(attempts.createdAt);
  const SESSION_DAY = dayOf(sessions.startedAt);
  const [plans, reps, minutes, levelDays] = await db.batch([
    db.select().from(practicePlans).where(and(gte(practicePlans.date, from), sql`${practicePlans.date} <= ${to}`)),
    db.all<ModeDayRow>(sql`
    select ${DAY} as day, ${attempts.mode} as mode, count(*) as total, sum(case when ${attempts.correct} then 1 else 0 end) as correct
    from ${attempts} where ${DAY} >= ${from} and ${DAY} <= ${to}
    group by 1, 2 order by 1`),
    db.all<{ day: string; mode: string; minutes: number }>(sql`
    select ${SESSION_DAY} as day, ${sessions.mode} as mode, sum(${sessions.endedAt} - ${sessions.startedAt}) / 60000.0 as minutes
    from ${sessions} where ${sessions.endedAt} is not null and ${SESSION_DAY} >= ${from} and ${SESSION_DAY} <= ${to}
    group by 1, 2`),
    db.all<{ day: string; total: number; correct: number }>(sql`
    select ${DAY} as day, count(*) as total, sum(case when ${attempts.correct} then 1 else 0 end) as correct
    from ${attempts} where ${attempts.drillId} is not null and ${DAY} >= ${from} and ${DAY} <= ${to}
    group by 1 order by 1`),
  ]);
  return {
    plans: plans.map((p) => ({ date: p.date, items: Array.isArray(p.items) ? (p.items as unknown[]) : [], notes: p.notes })),
    reps: reps.map((r) => ({ day: r.day, mode: r.mode, total: num(r.total), correct: num(r.correct) })),
    minutes: minutes.map((m) => ({ day: m.day, mode: m.mode, minutes: Math.round(num(m.minutes) * 10) / 10 })),
    levelDays: levelDays.map((r) => ({ day: r.day, total: num(r.total), correct: num(r.correct) })),
  };
}

/** Insert the day's plan, or replace it when the day already has one (the date is unique). */
function planUpsert(db: Db, date: string, items: unknown[], notes: string) {
  const updatedAt = Date.now();
  return db.insert(practicePlans).values({ date, items, notes, updatedAt }).onConflictDoUpdate({ target: practicePlans.date, set: { items, notes, updatedAt } });
}

export async function savePlan(date: string, items: unknown[], notes: string): Promise<void> {
  const db = await getDb();
  await planUpsert(db, date, items, notes);
}

export async function savePlans(rows: { date: string; items: unknown[]; notes?: string }[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDb();
  await db.batch(nonEmpty(rows.map((r) => planUpsert(db, r.date, r.items, r.notes ?? ""))));
}

export async function deletePlan(date: string): Promise<void> {
  const db = await getDb();
  await db.delete(practicePlans).where(eq(practicePlans.date, date));
}

/** Reps per day for the heatmap and streaks. */
export async function getRepsByDay(days: number): Promise<{ day: string; total: number; correct: number }[]> {
  const db = await getDb();
  const DAY = dayOf(attempts.createdAt);
  const since = Date.now() - days * 86400e3;
  const rows = await db
    .select({ day: sql<string>`${DAY}`, total: sql<number>`count(*)`, correct: CORRECT })
    .from(attempts)
    .where(gte(attempts.createdAt, since))
    .groupBy(DAY)
    .orderBy(sql`1`);
  return rows.map((r) => ({ day: r.day, total: num(r.total), correct: num(r.correct) }));
}

/** Everything the Progress tab needs: lifetime stats plus reps per mode per day for trends. */
export async function getProgressData(): Promise<{ all: StatsData; modeDays: ModeDayRow[] }> {
  const db = await getDb();
  const DAY = dayOf(attempts.createdAt);
  const since = Date.now() - 60 * 86400e3;
  const [all, modeDays] = await Promise.all([
    getStats(null),
    db.all<ModeDayRow>(sql`
    select ${DAY} as day, ${attempts.mode} as mode, count(*) as total, sum(case when ${attempts.correct} then 1 else 0 end) as correct
    from ${attempts} where ${attempts.createdAt} >= ${since}
    group by 1, 2 order by 1`),
  ]);
  return { all, modeDays: modeDays.map((r) => ({ day: r.day, mode: r.mode, total: num(r.total), correct: num(r.correct) })) };
}

export interface RecordingSummary {
  id: number;
  createdAt: number;
  name: string;
  instrumentId: string;
  bpm: number | null;
  durationMs: number;
  noteCount: number;
}

export async function saveRecording(input: {
  name: string;
  instrumentId: string;
  bpm?: number | null;
  durationMs: number;
  events: RecordedNote[];
  sourceRef?: string | null;
}): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(recordings)
    .values({
      createdAt: Date.now(),
      name: input.name,
      instrumentId: input.instrumentId,
      bpm: input.bpm ?? null,
      durationMs: input.durationMs,
      events: input.events,
      sourceRef: input.sourceRef ?? null,
    })
    .returning({ id: recordings.id });
  return row.id;
}

export async function listRecordings(): Promise<RecordingSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(recordings).orderBy(desc(recordings.createdAt)).limit(100);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    name: r.name,
    instrumentId: r.instrumentId,
    bpm: r.bpm,
    durationMs: r.durationMs,
    noteCount: Array.isArray(r.events) ? (r.events as unknown[]).length : 0,
  }));
}

export async function getRecording(id: number): Promise<{ id: number; name: string; instrumentId: string; events: RecordedNote[]; durationMs: number } | null> {
  const db = await getDb();
  const [r] = await db.select().from(recordings).where(eq(recordings.id, id));
  if (!r) return null;
  return { id: r.id, name: r.name, instrumentId: r.instrumentId, events: r.events as RecordedNote[], durationMs: r.durationMs };
}

export async function deleteRecording(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(recordings).where(eq(recordings.id, id));
}
