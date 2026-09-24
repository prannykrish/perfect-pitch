"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, XIcon, Volume2Icon, Undo2Icon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { instrumentLabel } from "@/lib/audio/instruments";
import { INTERVALS, intervalName, intervalPool, intervalShort } from "@/lib/music/intervals";
import { noteName } from "@/lib/music/notes";
import { generateInterval, type IntervalQuestion } from "@/lib/trainer/generators";
import { recordInstrumentResult, recordKeyResult } from "@/lib/trainer/quiz-core";
import { useLatest } from "@/lib/hooks/use-latest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { useEntryShortcuts } from "@/components/trainer/note-entry";
import { useQuiz, type QuizModeAdapter, type NoteInputVia } from "@/components/trainer/use-quiz";
import { QuizShell, FeedbackBanner } from "@/components/trainer/quiz-shell";
import { SessionSummary, rowsFrom } from "@/components/trainer/session-summary";
import { cn } from "@/lib/utils";

type Q = IntervalQuestion;
interface A {
  intervals: number[];
  via: NoteInputVia;
  /** Notes actually played on the piano, if answered that way. */
  playedNotes?: number[];
}

const adapter: QuizModeAdapter<Q, A> = {
  mode: "intervals",
  generate: ({ settings, chooseInstrument, stats }) => generateInterval(settings, chooseInstrument, stats),
  async play(q, settings) {
    const dur = settings.noteDurationMs / 1000;
    if (q.playback === "harmonic") {
      await getEngine().playNotes(q.notes.map((n) => ({ instrumentId: n.instrumentId, midi: n.midi, at: 0, duration: dur * 1.3 })));
    } else {
      await getEngine().playNotes(q.notes.map((n, i) => ({ instrumentId: n.instrumentId, midi: n.midi, at: (i * settings.intervalGapMs) / 1000, duration: dur })));
    }
  },
  score(q, a) {
    let matches = 0;
    q.intervals.forEach((s, i) => {
      if (a.intervals[i] === s) matches++;
    });
    return { correct: matches === q.intervals.length, score: matches / q.intervals.length };
  },
  log(q, a) {
    return {
      instrumentId: q.notes[0].instrumentId,
      target: { variant: q.variant, notes: q.notes.map((n) => n.midi), intervals: q.intervals, directions: q.directions, playback: q.playback },
      answer: { intervals: a.intervals, via: a.via, playedNotes: a.playedNotes ?? null },
    };
  },
  record(stats, q, a, scored) {
    q.intervals.forEach((s, i) => recordKeyResult(stats, `interval:${s}`, a.intervals[i] === s));
    recordInstrumentResult(stats, q.notes[0].instrumentId, scored.correct);
  },
};

function intervalsFromNotes(variant: Q["variant"], notes: number[]): number[] {
  if (variant === "pair") return [Math.abs(notes[1] - notes[0])];
  if (variant === "chain") return notes.slice(1).map((n, i) => Math.abs(n - notes[i]));
  const sorted = [...notes].sort((a, b) => a - b);
  return sorted.slice(1).map((n) => n - sorted[0]);
}

export function IntervalQuiz() {
  // Entry state is keyed on the question object, so a new question implicitly starts empty.
  type Entry = { q: Q | null; entries: number[]; played: number[] };
  const [entryState, setEntryState] = useState<Entry>({ q: null, entries: [], played: [] });
  const entryStateRef = useLatest(entryState);
  const quizRef = useRef<ReturnType<typeof useQuiz<Q, A>> | null>(null);
  const stateFor = useCallback(
    (q: Q | null): Entry => (entryStateRef.current.q === q ? entryStateRef.current : { q, entries: [], played: [] }),
    [entryStateRef]
  );

  // Notes from the piano: once enough notes are in, derive the intervals and submit.
  const onNote = useCallback(
    (midi: number, via: NoteInputVia) => {
      const quiz = quizRef.current;
      if (!quiz || quiz.phase !== "question" || !quiz.question) return;
      const q = quiz.question;
      const cur = stateFor(q);
      const next = [...cur.played, midi];
      setEntryState({ ...cur, q, played: next });
      if (next.length >= q.notes.length) {
        quiz.submit({ intervals: intervalsFromNotes(q.variant, next), via, playedNotes: next });
      }
    },
    [stateFor]
  );

  const quiz = useQuiz<Q, A>(adapter, { onNoteInput: onNote });
  useEffect(() => {
    quizRef.current = quiz;
  });
  const { settings, phase, question, answer, scored, history } = quiz;
  const { entries, played } = entryState.q === question ? entryState : { entries: [], played: [] };

  const addInterval = (s: number) => {
    const quiz = quizRef.current;
    if (!quiz || quiz.phase !== "question" || !quiz.question) return;
    const cur = stateFor(quiz.question);
    const next = [...cur.entries, s];
    setEntryState({ ...cur, q: quiz.question, entries: next });
    if (next.length >= quiz.question.intervals.length) quiz.submit({ intervals: next, via: "click" });
  };
  const undo = useCallback(() => {
    const q = quizRef.current?.question ?? null;
    const cur = stateFor(q);
    setEntryState({ q, entries: cur.entries.slice(0, -1), played: cur.played.slice(0, -1) });
  }, [stateFor]);
  useEntryShortcuts(phase === "question", undo);

  const pool = useMemo(() => intervalPool({ compound: settings.intervalCompound, allowed: settings.intervalSet }), [settings.intervalCompound, settings.intervalSet]);
  const buttons = useMemo(() => INTERVALS.filter((i) => (settings.intervalCompound ? i.semitones <= 24 : i.semitones <= 12)), [settings.intervalCompound]);

  const hearAnswer = () => {
    if (!question || !answer) return;
    const dur = settings.noteDurationMs / 1000;
    const first = question.notes[0];
    let notes: number[];
    if (answer.playedNotes) notes = answer.playedNotes;
    else if (question.variant === "stack") notes = [first.midi, ...answer.intervals.map((s) => first.midi + s)];
    else {
      notes = [first.midi];
      answer.intervals.forEach((s, i) => notes.push(notes[i] + (question.directions[i] ?? 1) * s));
    }
    if (question.playback === "harmonic") getEngine().playNotes(notes.map((m) => ({ instrumentId: first.instrumentId, midi: m, at: 0, duration: dur * 1.3 })));
    else getEngine().playNotes(notes.map((m, i) => ({ instrumentId: first.instrumentId, midi: m, at: (i * settings.intervalGapMs) / 1000, duration: dur })));
  };

  const count = question?.intervals.length ?? (settings.intervalVariant === "pair" ? 1 : settings.intervalVariant === "chain" ? settings.intervalChainLength - 1 : settings.intervalStackSize - 1);
  const entryStates = phase === "answered" && question && answer ? question.intervals.map((s, i) => (answer.intervals[i] === s ? "correct" : "wrong")) : undefined;

  const questionText =
    question?.variant === "pair"
      ? `Name the interval${question.playback === "melodic" ? (question.directions[0] > 0 ? " (going up)" : " (going down)") : " (played together)"}.`
      : question?.variant === "chain"
        ? `Name the ${question.intervals.length} intervals between consecutive notes, in order.`
        : `Name the ${question?.intervals.length ?? ""} intervals from the bottom note up.`;

  const summary = (
    <SessionSummary
      total={history.length}
      correct={history.filter((h) => h.correct).length}
      avgScore={history.length ? history.reduce((a, h) => a + h.score, 0) / history.length : undefined}
      avgMs={history.length ? Math.round(history.reduce((a, h) => a + h.responseMs, 0) / history.length) : 0}
      breakdowns={[
        {
          title: "By interval",
          rows: rowsFrom(
            history.flatMap((h) => h.q.intervals.map((s, i) => ({ s, ok: h.a.intervals[i] === s }))),
            (x) => `${intervalShort(x.s)} ${intervalName(x.s)}`,
            (x) => x.ok,
            "label"
          ),
        },
        {
          title: "By direction",
          rows: rowsFrom(
            history.flatMap((h) => h.q.intervals.map((s, i) => ({ d: h.q.playback === "harmonic" ? "together" : h.q.directions[i] > 0 ? "up" : "down", ok: h.a.intervals[i] === s }))),
            (x) => x.d,
            (x) => x.ok,
            "label"
          ),
        },
        { title: "By instrument", rows: rowsFrom(history, (h) => instrumentLabel(h.q.notes[0].instrumentId), (h) => h.correct) },
      ]}
      misses={history
        .filter((h) => !h.correct)
        .slice(-10)
        .reverse()
        .map((h) => ({
          target: `${h.q.notes.map((n) => noteName(n.midi)).join(" ")} → ${h.q.intervals.map(intervalShort).join(" ")}`,
          answer: h.a.intervals.map(intervalShort).join(" "),
          instrumentId: h.q.notes[0].instrumentId,
          responseMs: h.responseMs,
        }))}
    />
  );

  return (
    <QuizShell
      quiz={quiz}
      title="Intervals"
      idleText={
        settings.intervalVariant === "pair"
          ? "Two notes. Name the distance between them."
          : settings.intervalVariant === "chain"
            ? `${settings.intervalChainLength} notes. Name every interval between consecutive notes.`
            : `${settings.intervalStackSize} notes together. Name each interval from the bottom note up.`
      }
      questionText={questionText}
      feedback={
        question &&
        answer && (
          <FeedbackBanner correct={!!scored?.correct} partial={!!scored && scored.score > 0}>
            {scored?.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-16 text-xs text-muted-foreground">Played</span>
                {question.notes.map((n, i) => (
                  <Badge key={i} variant="secondary" className="tabular-nums">
                    {noteName(n.midi)}
                  </Badge>
                ))}
                <span className="mx-1 text-muted-foreground">→</span>
                {question.intervals.map((s, i) => (
                  <Badge key={i} variant="secondary" className={cn(entryStates?.[i] === "correct" && "bg-green-500/20")}>
                    {intervalShort(s)} <span className="ml-1 font-normal text-muted-foreground">{intervalName(s)}</span>
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-16 text-xs text-muted-foreground">You</span>
                {question.intervals.map((_, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className={entryStates?.[i] === "correct" ? "border-green-500 text-green-600 dark:text-green-400" : "border-red-500 text-red-600 dark:text-red-400"}
                  >
                    {answer.intervals[i] !== undefined ? `${intervalShort(answer.intervals[i])} ${intervalName(answer.intervals[i])}` : "–"}
                  </Badge>
                ))}
                {answer.playedNotes && <span className="text-xs text-muted-foreground">(played {answer.playedNotes.map((m) => noteName(m)).join(" ")})</span>}
              </div>
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              {instrumentLabel(question.notes[0].instrumentId)} · {Math.round(quiz.lastResponseMs)} ms
            </div>
          </FeedbackBanner>
        )
      }
      extraButtons={
        !scored?.correct && (
          <Button size="lg" variant="outline" onClick={hearAnswer}>
            <Volume2Icon /> Hear my answer
          </Button>
        )
      }
      summary={history.length > 0 ? summary : null}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: count }, (_, i) => {
            const v = entries[i];
            const st = entryStates?.[i];
            return (
              <Badge
                key={i}
                variant={v === undefined ? "outline" : "secondary"}
                className={cn(
                  "h-8 min-w-12 justify-center",
                  st === "correct" && "border-green-500 bg-green-500/15 text-green-600 dark:text-green-400",
                  st === "wrong" && "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400"
                )}
              >
                {v === undefined ? "·" : intervalShort(v)}
              </Badge>
            );
          })}
          {played.length > 0 && phase === "question" && (
            <span className="text-xs text-muted-foreground">
              piano: {played.map((m) => noteName(m)).join(" ")} ({played.length}/{question?.notes.length})
            </span>
          )}
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="sm" onClick={undo} disabled={phase !== "question" || (entries.length === 0 && played.length === 0)}>
              <Undo2Icon /> Undo <Kbd>⌫</Kbd>
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
          {buttons.map((iv) => {
            const inPool = pool.includes(iv.semitones);
            return (
              <Button
                key={iv.semitones}
                variant="outline"
                disabled={phase !== "question"}
                onClick={() => addInterval(iv.semitones)}
                className={cn("h-14 flex-col gap-0.5 px-1", !inPool && "opacity-50")}
                title={iv.name}
              >
                <span className="text-sm font-semibold leading-none">{iv.short}</span>
                <span className="text-[10px] leading-none text-muted-foreground">{iv.name}</span>
              </Button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Or play the notes on the USB piano: {settings.intervalVariant === "pair" ? "two notes" : settings.intervalVariant === "chain" ? "the whole sequence" : "the whole stack, bottom to top"} and the app grades the
          distances, not the notes.
        </p>
      </div>
    </QuizShell>
  );
}
