"use client";

/**
 * Scales & modes: hear a scale run or a short melody, name the scale (and the tonic). The tonic can
 * be answered by pressing the note on the USB piano or the computer keyboard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, XIcon, Volume2Icon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { instrumentLabel } from "@/lib/audio/instruments";
import { noteName, PITCH_CLASS_SHORT, pitchClassOf } from "@/lib/music/notes";
import { SCALE_CATEGORY_LABELS, scaleDef, scaleLabel, scalePitchClasses, scaleRun, scalesByCategory, samePitchClassSet } from "@/lib/music/scales";
import { generateScale, type ScaleQuestion } from "@/lib/trainer/generators";
import { recordInstrumentResult, recordKeyResult } from "@/lib/trainer/quiz-core";
import { useLatest } from "@/lib/hooks/use-latest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useEntryShortcuts } from "@/components/trainer/note-entry";
import { useQuiz, type QuizModeAdapter, type NoteInputVia } from "@/components/trainer/use-quiz";
import { QuizShell, FeedbackBanner } from "@/components/trainer/quiz-shell";
import { SessionSummary, rowsFrom } from "@/components/trainer/session-summary";
import { cn } from "@/lib/utils";

type Q = ScaleQuestion;
interface A {
  scaleId: string;
  tonic: number | null;
  via: NoteInputVia;
}

type Entry = { q: Q | null; scaleId: string | null; tonic: number | null };

const adapter: QuizModeAdapter<Q, A> = {
  mode: "scales",
  generate: ({ settings, chooseInstrument, stats }) => generateScale(settings, chooseInstrument, stats),
  async play(q) {
    await getEngine().playNotes(q.notes.map((n) => ({ instrumentId: q.instrumentId, midi: n.midi, at: n.at, duration: n.duration, velocity: 92 })));
  },
  score(q, a, settings) {
    const typeOk = a.scaleId === q.scaleId;
    if (!settings.scaleAskTonic) return { correct: typeOk, score: typeOk ? 1 : 0 };
    const tonicOk = a.tonic === q.tonic;
    let score = (typeOk ? 0.5 : 0) + (tonicOk ? 0.5 : 0);
    // same notes, different home (relative key or a mode of the same collection): a little credit
    if (score === 0 && a.tonic !== null && samePitchClassSet(scalePitchClasses(a.tonic, a.scaleId), scalePitchClasses(q.tonic, q.scaleId))) score = 0.25;
    return { correct: typeOk && tonicOk, score };
  },
  log(q, a, settings) {
    return {
      instrumentId: q.instrumentId,
      target: { variant: q.variant, scaleId: q.scaleId, tonic: q.tonic, direction: q.direction ?? null, notes: q.notes.map((n) => n.midi), askTonic: settings.scaleAskTonic },
      answer: a,
    };
  },
  record(stats, q, _a, scored) {
    recordKeyResult(stats, `scale:${q.scaleId}`, scored.correct);
    recordInstrumentResult(stats, q.instrumentId, scored.correct);
  },
};

export function ScalesQuiz() {
  const [entry, setEntry] = useState<Entry>({ q: null, scaleId: null, tonic: null });
  const entryRef = useLatest(entry);
  const quizRef = useRef<ReturnType<typeof useQuiz<Q, A>> | null>(null);
  const stateFor = useCallback((q: Q | null): Entry => (entryRef.current.q === q ? entryRef.current : { q, scaleId: null, tonic: null }), [entryRef]);

  const trySubmit = useCallback((next: Entry, via: NoteInputVia) => {
    const quiz = quizRef.current;
    if (!quiz || !next.scaleId) return;
    if (quiz.settings.scaleAskTonic && next.tonic === null) return;
    quiz.submit({ scaleId: next.scaleId, tonic: next.tonic, via });
  }, []);

  const onNote = useCallback(
    (midi: number, via: NoteInputVia) => {
      const quiz = quizRef.current;
      if (!quiz || quiz.phase !== "question" || !quiz.question || !quiz.settings.scaleAskTonic) return;
      const next = { ...stateFor(quiz.question), q: quiz.question, tonic: pitchClassOf(midi) };
      setEntry(next);
      trySubmit(next, via);
    },
    [stateFor, trySubmit]
  );

  const quiz = useQuiz<Q, A>(adapter, { onNoteInput: onNote });
  useEffect(() => {
    quizRef.current = quiz;
  });
  const { settings, phase, question, answer, scored, history } = quiz;
  const cur = entry.q === question ? entry : { q: question, scaleId: null, tonic: null };

  const pickScale = (id: string) => {
    if (!question) return;
    const next = { ...stateFor(question), q: question, scaleId: id };
    setEntry(next);
    trySubmit(next, "click");
  };
  const pickTonic = (pc: number) => {
    if (!question) return;
    const next = { ...stateFor(question), q: question, tonic: pc };
    setEntry(next);
    trySubmit(next, "click");
  };
  const undo = useCallback(() => {
    const q = quizRef.current?.question ?? null;
    const c = stateFor(q);
    setEntry(c.tonic !== null ? { ...c, q, tonic: null } : { q, scaleId: null, tonic: null });
  }, [stateFor]);
  useEntryShortcuts(phase === "question", undo);

  const groups = useMemo(() => scalesByCategory(settings.scaleSet), [settings.scaleSet]);

  const hearAnswer = () => {
    if (!question || !answer) return;
    const tonic = answer.tonic ?? question.tonic;
    // the answered scale, started near where the question sat
    const first = question.notes[0].midi;
    const start = first - ((pitchClassOf(first) - tonic + 12) % 12);
    const midis = scaleRun(answer.scaleId, start, question.variant === "run" ? (question.direction ?? "asc") : "asc");
    const step = settings.scaleRunNoteMs / 1000;
    getEngine().playNotes(midis.map((m, i) => ({ instrumentId: question.instrumentId, midi: m, at: i * step, duration: step * 0.95 })));
  };

  const label = (q: Q) => scaleLabel(q.tonic, q.scaleId);
  const answerLabel = (a: A) => (a.tonic !== null ? scaleLabel(a.tonic, a.scaleId) : (scaleDef(a.scaleId)?.name ?? a.scaleId));

  const summary = (
    <SessionSummary
      total={history.length}
      correct={history.filter((h) => h.correct).length}
      avgScore={history.length ? history.reduce((a, h) => a + h.score, 0) / history.length : undefined}
      avgMs={history.length ? Math.round(history.reduce((a, h) => a + h.responseMs, 0) / history.length) : 0}
      breakdowns={[
        { title: "By scale", rows: rowsFrom(history, (h) => scaleDef(h.q.scaleId)?.name ?? h.q.scaleId, (h) => h.correct) },
        { title: "By kind", rows: rowsFrom(history, (h) => (h.q.variant === "run" ? "Scale run" : "Melody"), (h) => h.correct, "label") },
        { title: "By tonic", rows: rowsFrom(history, (h) => PITCH_CLASS_SHORT[h.q.tonic], (h) => h.correct, "label") },
        { title: "By instrument", rows: rowsFrom(history, (h) => instrumentLabel(h.q.instrumentId), (h) => h.correct) },
      ]}
      misses={history
        .filter((h) => !h.correct)
        .slice(-10)
        .reverse()
        .map((h) => ({ target: `${label(h.q)} (${h.q.variant})`, answer: answerLabel(h.a), instrumentId: h.q.instrumentId, responseMs: h.responseMs }))}
    />
  );

  return (
    <QuizShell
      quiz={quiz}
      tallFeedback
      title="Scales & modes"
      idleText={
        settings.scaleVariant === "run"
          ? "A scale runs up, down or both. Name it: which scale, and from which note."
          : settings.scaleVariant === "melody"
            ? "A short melody in a key or mode. Name the scale it lives in, and its home note."
            : "A scale run or a short melody. Name the scale and its home note."
      }
      questionText={question?.variant === "run" ? `Which scale is that?${settings.scaleAskTonic ? " Scale and tonic." : ""}` : `Which scale is the melody in?${settings.scaleAskTonic ? " Scale and tonic." : ""}`}
      feedback={
        question &&
        answer && (
          <FeedbackBanner correct={!!scored?.correct} partial={!!scored && scored.score > 0}>
            {scored?.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
            <div className="flex flex-col gap-1">
              <div className="text-xl font-semibold">
                {label(question)} <span className="text-base font-normal text-muted-foreground">{question.notes.map((n) => noteName(n.midi)).join(" ")}</span>
              </div>
              <div className="text-sm text-muted-foreground">{scaleDef(question.scaleId)?.tell}</div>
              {!scored?.correct && (
                <div className="text-muted-foreground">
                  you said <span className="font-semibold text-foreground">{answerLabel(answer)}</span>
                  {scored && scored.score === 0.25 && " · same notes, different home"}
                </div>
              )}
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              {Math.round((scored?.score ?? 0) * 100)}% · {instrumentLabel(question.instrumentId)} · {Math.round(quiz.lastResponseMs)} ms
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
          <Badge variant="secondary" className="h-8 min-w-32 justify-center text-sm">
            {settings.scaleAskTonic ? (cur.tonic !== null ? PITCH_CLASS_SHORT[cur.tonic] : "tonic") : ""}
            {settings.scaleAskTonic ? " " : ""}
            {cur.scaleId ? scaleDef(cur.scaleId)?.name : "…"}
          </Badge>
          {question && phase === "question" && <span className="text-xs text-muted-foreground">{question.variant === "run" ? `${question.notes.length}-note run` : `${question.notes.length}-note melody`}</span>}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={undo} disabled={phase !== "question"}>
            Undo
          </Button>
        </div>
        {settings.scaleAskTonic && (
          <>
            <Label className="text-xs text-muted-foreground">
              Tonic<span className="touch:hidden"> (or press the note on the piano)</span>
            </Label>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
              {PITCH_CLASS_SHORT.map((name, pc) => (
                <Button key={pc} variant={cur.tonic === pc ? "default" : "outline"} disabled={phase !== "question"} onClick={() => pickTonic(pc)} className={cn("h-10 font-semibold max-sm:h-12", phase === "answered" && question?.tonic === pc && "border-green-500")}>
                  {name}
                </Button>
              ))}
            </div>
          </>
        )}
        {groups.map((g) => (
          <div key={g.category} className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{SCALE_CATEGORY_LABELS[g.category]}</Label>
            <div className="flex flex-wrap gap-2">
              {g.items.map((s) => (
                <Button
                  key={s.id}
                  variant={cur.scaleId === s.id ? "default" : "outline"}
                  size="sm"
                  disabled={phase !== "question"}
                  onClick={() => pickScale(s.id)}
                  className={cn(phase === "answered" && question?.scaleId === s.id && "border-green-500")}
                  title={s.tell}
                >
                  {s.short}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </QuizShell>
  );
}
