"use client";

import { useMemo } from "react";
import { CheckIcon, XIcon, Volume2Icon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { instrumentLabel } from "@/lib/audio/instruments";
import { noteName } from "@/lib/music/notes";
import { centsBuckets, generateCents, type CentsQuestion } from "@/lib/trainer/generators";
import { recordInstrumentResult, recordKeyResult } from "@/lib/trainer/quiz-core";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useQuiz, type QuizModeAdapter } from "@/components/trainer/use-quiz";
import { QuizShell, FeedbackBanner } from "@/components/trainer/quiz-shell";
import { SessionSummary, rowsFrom, pct } from "@/components/trainer/session-summary";
import { cn } from "@/lib/utils";

type Q = CentsQuestion;
type Direction = "flat" | "sharp" | "in-tune";
interface A {
  /** Which note is out of tune (pair / chord). */
  which?: number;
  direction: Direction;
  /** Absolute cents guess (single variant). */
  amount?: number;
}

const BUCKETS_ALL = [5, 10, 15, 20, 30, 50];

function describe(cents: number) {
  if (cents === 0) return "in tune";
  return `${Math.abs(cents)} cents ${cents > 0 ? "sharp" : "flat"}`;
}

const adapter: QuizModeAdapter<Q, A> = {
  mode: "cents",
  generate: ({ settings, chooseInstrument, stats }) => generateCents(settings, chooseInstrument, stats),
  async play(q, settings) {
    const dur = settings.noteDurationMs / 1000;
    const engine = getEngine();
    if (q.variant === "single") {
      await engine.playNote(q.instrumentId, q.notes[0], { duration: dur, detune: q.cents });
    } else if (q.variant === "pair") {
      await engine.playNotes(q.notes.map((m, i) => ({ instrumentId: q.instrumentId, midi: m, at: i * (dur + 0.25), duration: dur, detune: i === q.detunedIndex ? q.cents : 0 })));
    } else {
      await engine.playNotes(q.notes.map((m, i) => ({ instrumentId: q.instrumentId, midi: m, at: 0, duration: dur * 1.4, detune: i === q.detunedIndex ? q.cents : 0 })));
    }
  },
  score(q, a) {
    const targetDir: Direction = q.cents === 0 ? "in-tune" : q.cents > 0 ? "sharp" : "flat";
    if (q.variant === "single") {
      if (targetDir === "in-tune") return { correct: a.direction === "in-tune", score: a.direction === "in-tune" ? 1 : 0 };
      const dirOk = a.direction === targetDir;
      if (!dirOk) return { correct: false, score: 0 };
      const want = Math.abs(q.cents);
      const wi = BUCKETS_ALL.indexOf(want);
      const ai = a.amount !== undefined ? BUCKETS_ALL.indexOf(a.amount) : -1;
      const dist = ai < 0 ? 99 : Math.abs(wi - ai);
      const score = dist === 0 ? 1 : dist === 1 ? 0.75 : 0.5;
      return { correct: dist <= 1, score };
    }
    const whichOk = a.which === q.detunedIndex;
    const dirOk = a.direction === targetDir;
    return { correct: whichOk && dirOk, score: (whichOk ? 0.5 : 0) + (dirOk ? 0.5 : 0) };
  },
  log(q, a) {
    return {
      instrumentId: q.instrumentId,
      target: { variant: q.variant, notes: q.notes, detunedIndex: q.detunedIndex, cents: q.cents },
      answer: a,
    };
  },
  record(stats, q, a, scored) {
    if (q.cents !== 0) {
      recordKeyResult(stats, `cents:${Math.abs(q.cents)}`, scored.correct);
      const targetDir = q.cents > 0 ? "sharp" : "flat";
      recordKeyResult(stats, `centsdir:${targetDir}`, a.direction === targetDir);
    }
    recordInstrumentResult(stats, q.instrumentId, scored.correct);
  },
};

export function CentsQuiz() {
  const quiz = useQuiz<Q, A>(adapter);
  const { settings, phase, question, answer, scored, history } = quiz;
  const buckets = useMemo(() => centsBuckets(settings), [settings]);

  const hearInTune = () => {
    if (!question) return;
    const dur = settings.noteDurationMs / 1000;
    if (question.variant === "single") getEngine().playNote(question.instrumentId, question.notes[0], { duration: dur });
    else if (question.variant === "pair") getEngine().playNotes(question.notes.map((m, i) => ({ instrumentId: question.instrumentId, midi: m, at: i * (dur + 0.25), duration: dur })));
    else getEngine().playNotes(question.notes.map((m) => ({ instrumentId: question.instrumentId, midi: m, at: 0, duration: dur * 1.4 })));
  };

  const answered = phase === "answered";
  const targetDir: Direction | null = question ? (question.cents === 0 ? "in-tune" : question.cents > 0 ? "sharp" : "flat") : null;

  // JND: smallest bucket answered with >= 80% over at least 4 reps
  const jnd = useMemo(() => {
    const byAmt = new Map<number, { t: number; c: number }>();
    for (const h of history) {
      if (h.q.cents === 0) continue;
      const k = Math.abs(h.q.cents);
      const e = byAmt.get(k) ?? { t: 0, c: 0 };
      e.t++;
      if (h.a.direction === (h.q.cents > 0 ? "sharp" : "flat")) e.c++;
      byAmt.set(k, e);
    }
    const ok = [...byAmt.entries()].filter(([, e]) => e.t >= 4 && e.c / e.t >= 0.8).map(([k]) => k);
    return ok.length ? Math.min(...ok) : null;
  }, [history]);

  const summary = (
    <SessionSummary
      total={history.length}
      correct={history.filter((h) => h.correct).length}
      avgScore={history.length ? history.reduce((a, h) => a + h.score, 0) / history.length : undefined}
      avgMs={history.length ? Math.round(history.reduce((a, h) => a + h.responseMs, 0) / history.length) : 0}
      breakdowns={[
        {
          title: "By amount",
          rows: rowsFrom(history, (h) => (h.q.cents === 0 ? "in tune" : `${Math.abs(h.q.cents)} cents`), (h) => h.correct, "label").map((r) => ({
            ...r,
            extra: pct(
              history.filter((h) => (h.q.cents === 0 ? "in tune" : `${Math.abs(h.q.cents)} cents`) === r.label && h.a.direction === (h.q.cents === 0 ? "in-tune" : h.q.cents > 0 ? "sharp" : "flat")).length,
              r.total
            ),
          })),
          extraHeader: "Direction right",
        },
        { title: "By direction", rows: rowsFrom(history, (h) => describe(h.q.cents).replace(/^\d+ cents /, ""), (h) => h.correct, "label") },
        { title: "By instrument", rows: rowsFrom(history, (h) => instrumentLabel(h.q.instrumentId), (h) => h.correct) },
        {
          title: "Smallest deviation you reliably hear",
          rows: jnd !== null ? [{ label: `${jnd} cents (≥80% direction accuracy)`, total: history.filter((h) => Math.abs(h.q.cents) === jnd).length, correct: history.filter((h) => Math.abs(h.q.cents) === jnd && h.correct).length }] : [],
        },
      ]}
      misses={history
        .filter((h) => !h.correct)
        .slice(-10)
        .reverse()
        .map((h) => ({
          target: `${h.q.notes.map((m) => noteName(m)).join(" ")}: ${h.q.variant === "single" ? describe(h.q.cents) : `note ${h.q.detunedIndex + 1} ${describe(h.q.cents)}`}`,
          answer: h.a.direction === "in-tune" ? "in tune" : `${h.a.which !== undefined ? `note ${h.a.which + 1} ` : ""}${h.a.amount ?? ""} ${h.a.direction}`,
          instrumentId: h.q.instrumentId,
          responseMs: h.responseMs,
        }))}
    />
  );

  const btn = (label: string, a: A, hit: boolean, miss: boolean, extraClass = "") => (
    <Button
      key={label}
      variant="outline"
      disabled={phase !== "question"}
      onClick={() => quiz.submit(a)}
      className={cn(
        "h-12",
        extraClass,
        answered && hit && "border-green-500 bg-green-500/15 text-green-600 dark:text-green-400",
        answered && miss && "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400"
      )}
    >
      {label}
    </Button>
  );

  const isAns = (pred: (a: A) => boolean) => !!answer && pred(answer);

  return (
    <QuizShell
      quiz={quiz}
      title="Cents"
      idleText={
        settings.centsVariant === "single"
          ? `One note, possibly out of tune by ${settings.centsMin}–${settings.centsMax} cents. Say flat, sharp or in tune, and how much.`
          : settings.centsVariant === "pair"
            ? "The same note twice. One of them is out of tune. Which one, and which way?"
            : "A triad with one member out of tune. Which note, and which way?"
      }
      questionText={question?.variant === "single" ? "Flat, sharp or in tune? How much?" : question?.variant === "pair" ? "Which one is off, and which way?" : "Which chord note is off, and which way?"}
      feedback={
        question &&
        answer && (
          <FeedbackBanner correct={!!scored?.correct} partial={!!scored && scored.score > 0}>
            {scored?.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
            <div className="text-xl font-semibold">
              {question.variant === "single" ? describe(question.cents) : `${["bottom", "middle", "top"][question.detunedIndex] ?? `note ${question.detunedIndex + 1}`} note ${describe(question.cents)}`}
              <span className="ml-2 text-base font-normal text-muted-foreground">{question.notes.map((m) => noteName(m)).join(" ")}</span>
            </div>
            {!scored?.correct && (
              <div className="text-muted-foreground">
                you said{" "}
                <span className="font-semibold text-foreground">
                  {answer.which !== undefined && `${question.variant === "chord" ? ["bottom", "middle", "top"][answer.which] : `note ${answer.which + 1}`} `}
                  {answer.direction === "in-tune" ? "in tune" : `${answer.amount ?? ""} ${answer.direction}`}
                </span>
              </div>
            )}
            <div className="ml-auto text-sm text-muted-foreground">
              {instrumentLabel(question.instrumentId)} · {Math.round(quiz.lastResponseMs)} ms
            </div>
          </FeedbackBanner>
        )
      }
      extraButtons={
        <Button size="lg" variant="outline" onClick={hearInTune}>
          <Volume2Icon /> Hear it in tune
        </Button>
      }
      summary={history.length > 0 ? summary : null}
    >
      {(question?.variant ?? settings.centsVariant) === "single" ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Flat (too low)</Label>
              <div className="flex flex-wrap gap-2">
                {[...buckets].reverse().map((b) =>
                  btn(`${b}`, { direction: "flat", amount: b }, !!question && question.cents === -b, isAns((a) => a.direction === "flat" && a.amount === b) && !scored?.correct)
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">&nbsp;</Label>
              {btn("In tune", { direction: "in-tune" }, !!question && question.cents === 0, isAns((a) => a.direction === "in-tune") && !scored?.correct, "px-4")}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Sharp (too high)</Label>
              <div className="flex flex-wrap gap-2">
                {buckets.map((b) =>
                  btn(`${b}`, { direction: "sharp", amount: b }, !!question && question.cents === b, isAns((a) => a.direction === "sharp" && a.amount === b) && !scored?.correct)
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Numbers are cents. 100 cents = one semitone, 50 = halfway to the next note.</p>
        </div>
      ) : (question?.variant ?? settings.centsVariant) === "pair" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([0, 1] as const).flatMap((which) =>
            (["flat", "sharp"] as const).map((dir) =>
              btn(
                `${which === 0 ? "1st" : "2nd"} is ${dir}`,
                { which, direction: dir },
                !!question && question.detunedIndex === which && targetDir === dir,
                isAns((a) => a.which === which && a.direction === dir) && !scored?.correct
              )
            )
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(["bottom", "middle", "top"] as const).flatMap((name, which) =>
            (["flat", "sharp"] as const).map((dir) =>
              btn(
                `${name} is ${dir}`,
                { which, direction: dir },
                !!question && question.detunedIndex === which && targetDir === dir,
                isAns((a) => a.which === which && a.direction === dir) && !scored?.correct
              )
            )
          )}
        </div>
      )}
    </QuizShell>
  );
}
