"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, XIcon, Volume2Icon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { instrumentLabel } from "@/lib/audio/instruments";
import { useMidiStore } from "@/lib/midi/midi";
import { noteName, octaveOf, pitchClassOf, PITCH_CLASS_SHORT, midiFrom } from "@/lib/music/notes";
import { generateSequence, type SequenceQuestion } from "@/lib/trainer/generators";
import { recordNoteResult } from "@/lib/trainer/quiz-core";
import { useLatest } from "@/lib/hooks/use-latest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { KeyHighlight } from "@/components/piano-keyboard";
import { NoteEntry, useEntryShortcuts } from "@/components/trainer/note-entry";
import { useQuiz, type QuizModeAdapter, type NoteInputVia } from "@/components/trainer/use-quiz";
import { QuizShell, FeedbackBanner } from "@/components/trainer/quiz-shell";
import { SessionSummary, rowsFrom } from "@/components/trainer/session-summary";
import { cn } from "@/lib/utils";

type Q = SequenceQuestion;
interface A {
  /** MIDI numbers (pitch-octave) or pitch classes (pitch-class), in order. */
  notes: number[];
  via: NoteInputVia;
}

const adapter: QuizModeAdapter<Q, A> = {
  mode: "sequence",
  generate: ({ settings, chooseInstrument, stats }) => generateSequence(settings, chooseInstrument, stats),
  async play(q, settings) {
    await getEngine().playNotes(
      q.notes.map((n, i) => ({ instrumentId: n.instrumentId, midi: n.midi, at: (i * settings.seqGapMs) / 1000, duration: settings.noteDurationMs / 1000 }))
    );
  },
  score(q, a, settings) {
    let matches = 0;
    q.notes.forEach((n, i) => {
      const v = a.notes[i];
      if (v === undefined) return;
      if (settings.answerMode === "pitch-octave" ? v === n.midi : v === pitchClassOf(n.midi)) matches++;
    });
    return { correct: matches === q.notes.length, score: matches / q.notes.length };
  },
  log(q, a, settings) {
    return {
      instrumentId: q.notes[0].instrumentId,
      target: { notes: q.notes.map((n) => n.midi), instruments: q.notes.map((n) => n.instrumentId) },
      answer: { notes: a.notes, via: a.via, answerMode: settings.answerMode },
    };
  },
  record(stats, q, a) {
    q.notes.forEach((n, i) => {
      const v = a.notes[i];
      const ok = v !== undefined && (v === n.midi || v === pitchClassOf(n.midi));
      recordNoteResult(stats, n.midi, n.instrumentId, ok);
    });
  },
};

export function SequenceQuiz() {
  // Entries are keyed on the question object, so a new question implicitly starts with none.
  const [entryState, setEntryState] = useState<{ q: Q | null; entries: number[] }>({ q: null, entries: [] });
  const entryStateRef = useLatest(entryState);
  const quizRef = useRef<ReturnType<typeof useQuiz<Q, A>> | null>(null);
  const entriesFor = useCallback((q: Q | null) => (entryStateRef.current.q === q ? entryStateRef.current.entries : []), [entryStateRef]);
  const setEntries = useCallback((next: number[]) => setEntryState({ q: quizRef.current?.question ?? null, entries: next }), []);

  const add = useCallback(
    (midi: number, via: NoteInputVia) => {
      const quiz = quizRef.current;
      if (!quiz || quiz.phase !== "question" || !quiz.question) return;
      const value = quiz.settings.answerMode === "pitch-octave" ? midi : pitchClassOf(midi);
      const next = [...entriesFor(quiz.question), value];
      setEntries(next);
      if (next.length >= quiz.question.notes.length) quiz.submit({ notes: next, via });
    },
    [entriesFor, setEntries]
  );

  const quiz = useQuiz<Q, A>(adapter, { onNoteInput: add });
  useEffect(() => {
    quizRef.current = quiz;
  });
  const { settings, phase, question, answer, scored, history, octave, setOctave } = quiz;
  const midiHeld = useMidiStore((s) => s.held);
  const entries = entryState.q === question ? entryState.entries : [];

  const undo = useCallback(() => setEntries(entriesFor(quizRef.current?.question ?? null).slice(0, -1)), [entriesFor, setEntries]);
  const clear = useCallback(() => setEntries([]), [setEntries]);
  const submitNow = useCallback(() => {
    const quiz = quizRef.current;
    const e = entriesFor(quiz?.question ?? null);
    if (quiz && e.length) quiz.submit({ notes: e, via: "click" });
  }, [entriesFor]);
  useEntryShortcuts(phase === "question", undo, submitNow);

  const hearAnswer = () => {
    if (!question || !answer) return;
    getEngine().playNotes(
      answer.notes.map((v, i) => {
        const target = question.notes[Math.min(i, question.notes.length - 1)];
        const midi = settings.answerMode === "pitch-octave" ? v : midiFrom(v, octaveOf(target.midi));
        return { instrumentId: target.instrumentId, midi, at: (i * settings.seqGapMs) / 1000, duration: settings.noteDurationMs / 1000 };
      })
    );
  };

  const entryStates = useMemo(() => {
    if (phase !== "answered" || !question || !answer) return undefined;
    return question.notes.map((n, i) => {
      const v = answer.notes[i];
      return v !== undefined && (settings.answerMode === "pitch-octave" ? v === n.midi : v === pitchClassOf(n.midi)) ? ("correct" as const) : ("wrong" as const);
    });
  }, [phase, question, answer, settings.answerMode]);

  const highlights = useMemo(() => {
    const h: Partial<Record<number, KeyHighlight>> = {};
    for (const m of midiHeld) h[m] = "pressed";
    if (phase === "answered" && question) for (const n of question.notes) h[n.midi] = "target";
    return h;
  }, [midiHeld, phase, question]);

  const fmt = (v: number) => (settings.answerMode === "pitch-octave" ? noteName(v) : PITCH_CLASS_SHORT[pitchClassOf(v)]);

  const summary = (
    <SessionSummary
      total={history.length}
      correct={history.filter((h) => h.correct).length}
      avgScore={history.length ? history.reduce((a, h) => a + h.score, 0) / history.length : undefined}
      avgMs={history.length ? Math.round(history.reduce((a, h) => a + h.responseMs, 0) / history.length) : 0}
      breakdowns={[
        {
          title: "By position",
          rows: rowsFrom(
            history.flatMap((h) => h.q.notes.map((n, i) => ({ i, ok: h.a.notes[i] !== undefined && (h.a.notes[i] === n.midi || h.a.notes[i] === pitchClassOf(n.midi)) }))),
            (x) => `Note ${x.i + 1}`,
            (x) => x.ok,
            "label"
          ),
        },
        {
          title: "By note",
          rows: rowsFrom(
            history.flatMap((h) => h.q.notes.map((n, i) => ({ n, ok: h.a.notes[i] !== undefined && (h.a.notes[i] === n.midi || h.a.notes[i] === pitchClassOf(n.midi)) }))),
            (x) => PITCH_CLASS_SHORT[pitchClassOf(x.n.midi)],
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
          target: h.q.notes.map((n) => noteName(n.midi)).join(" "),
          answer: h.a.notes.map(fmt).join(" "),
          instrumentId: h.q.notes[0].instrumentId,
          responseMs: h.responseMs,
        }))}
    />
  );

  return (
    <QuizShell
      quiz={quiz}
      tallFeedback
      title="Sequence"
      idleText={`${settings.seqLength} notes in a row. Answer them in order.`}
      questionText={`Enter the ${question?.notes.length ?? settings.seqLength} notes in order.`}
      feedback={
        question &&
        answer && (
          <FeedbackBanner correct={!!scored?.correct} partial={!!scored && scored.score > 0}>
            {scored?.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-16 text-xs text-muted-foreground">Played</span>
                {question.notes.map((n, i) => (
                  <Badge key={i} variant="secondary" className={cn("tabular-nums", entryStates?.[i] === "correct" && "bg-green-500/20")}>
                    {settings.answerMode === "pitch-octave" ? noteName(n.midi) : PITCH_CLASS_SHORT[pitchClassOf(n.midi)]}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-16 text-xs text-muted-foreground">You</span>
                {question.notes.map((_, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className={cn("tabular-nums", entryStates?.[i] === "correct" ? "border-green-500 text-green-600 dark:text-green-400" : "border-red-500 text-red-600 dark:text-red-400")}
                  >
                    {answer.notes[i] !== undefined ? fmt(answer.notes[i]) : "–"}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              {Math.round((scored?.score ?? 0) * 100)}% · {[...new Set(question.notes.map((n) => instrumentLabel(n.instrumentId)))].join(", ")} · {Math.round(quiz.lastResponseMs)} ms
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
      <NoteEntry
        answerMode={settings.answerMode}
        entries={entries}
        count={question?.notes.length ?? settings.seqLength}
        onAdd={(m) => add(m, "click")}
        onUndo={undo}
        onClear={clear}
        onSubmit={submitNow}
        disabled={phase !== "question"}
        pianoRange={[settings.rangeLow, settings.rangeHigh]}
        highlights={highlights}
        octave={octave}
        setOctave={setOctave}
        showKeys={settings.keyboardShortcuts}
        entryStates={entryStates}
        hint="in order"
      />
    </QuizShell>
  );
}
