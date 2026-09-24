"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { CheckIcon, XIcon, Volume2Icon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { instrumentLabel } from "@/lib/audio/instruments";
import { useMidiStore } from "@/lib/midi/midi";
import { midiFrom, noteName, octaveOf, pitchClassOf, PITCH_CLASS_SHORT } from "@/lib/music/notes";
import { candidateNotes, pickNote, recordNoteResult } from "@/lib/trainer/quiz-core";
import type { TrainerSettings } from "@/lib/trainer/settings";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PianoKeyboard, type KeyHighlight } from "@/components/piano-keyboard";
import { PitchClassGrid } from "@/components/trainer/pitch-class-grid";
import { useQuiz, type QuizModeAdapter, type NoteInputVia } from "@/components/trainer/use-quiz";
import { QuizShell, FeedbackBanner } from "@/components/trainer/quiz-shell";
import { SessionSummary, rowsFrom } from "@/components/trainer/session-summary";

interface Q {
  midi: number;
  instrumentId: string;
}
interface A {
  midi?: number;
  pitchClass: number;
  via: NoteInputVia;
}

function isCorrect(q: Q, a: A, mode: TrainerSettings["answerMode"]) {
  if (mode === "pitch-octave") return a.midi !== undefined && a.midi === q.midi;
  return a.pitchClass === pitchClassOf(q.midi);
}

function makeAdapter(): QuizModeAdapter<Q, A> {
  return {
    mode: "single-note",
    async generate({ settings, chooseInstrument, prev, stats }) {
      const p = prev as Q | null;
      const instrumentId = await chooseInstrument(p?.instrumentId);
      return { midi: pickNote(settings, instrumentId, { avoid: p?.midi, stats }), instrumentId };
    },
    async play(q, settings) {
      await getEngine().playNote(q.instrumentId, q.midi, { duration: settings.noteDurationMs / 1000 });
    },
    score(q, a, settings) {
      const ok = isCorrect(q, a, settings.answerMode);
      return { correct: ok, score: ok ? 1 : 0 };
    },
    log(q, a, settings) {
      return {
        instrumentId: q.instrumentId,
        target: { midi: q.midi },
        answer: { midi: a.midi ?? null, pitchClass: a.pitchClass, via: a.via, answerMode: settings.answerMode },
        targetPitchClass: pitchClassOf(q.midi),
        targetOctave: octaveOf(q.midi),
        answerPitchClass: a.pitchClass,
        answerOctave: a.midi !== undefined ? octaveOf(a.midi) : null,
      };
    },
    record(stats, q, _a, scored) {
      recordNoteResult(stats, q.midi, q.instrumentId, scored.correct);
    },
  };
}

export function SingleNoteQuiz() {
  const adapter = useMemo(() => makeAdapter(), []);
  const quizRef = useRef<ReturnType<typeof useQuiz<Q, A>> | null>(null);
  const onNoteInput = useCallback((midi: number, via: NoteInputVia) => {
    const quiz = quizRef.current;
    if (!quiz) return;
    if (quiz.settings.answerMode === "pitch-octave") quiz.submit({ midi, pitchClass: pitchClassOf(midi), via });
    else quiz.submit({ pitchClass: pitchClassOf(midi), via });
  }, []);
  const quiz = useQuiz<Q, A>(adapter, { onNoteInput });
  useEffect(() => {
    quizRef.current = quiz;
  });

  const { settings, phase, question, answer, scored, history, octave, setOctave } = quiz;
  const midiHeld = useMidiStore((s) => s.held);

  const answerPitchClass = (pc: number) => onNoteInput(midiFrom(pc, octave), "click");

  const hearAnswer = () => {
    if (!question || !answer) return;
    const midi = answer.midi ?? midiFrom(answer.pitchClass, octaveOf(question.midi));
    getEngine().playNote(question.instrumentId, midi, { duration: settings.noteDurationMs / 1000 });
  };

  const pianoRange = useMemo<[number, number]>(() => {
    if (settings.instrumentMode === "fixed" && settings.useRealisticRange && settings.poolMode !== "everything") {
      const notes = candidateNotes(settings, settings.instrumentId);
      return [notes[0], notes[notes.length - 1]];
    }
    return [settings.rangeLow, settings.rangeHigh];
  }, [settings]);

  const highlights = useMemo(() => {
    const h: Partial<Record<number, KeyHighlight>> = {};
    for (const m of midiHeld) h[m] = "pressed";
    if (phase === "answered" && question) {
      if (answer?.midi !== undefined && answer.midi !== question.midi) h[answer.midi] = "wrong";
      h[question.midi] = scored?.correct ? "correct" : "target";
    }
    return h;
  }, [midiHeld, phase, question, answer, scored]);

  const gridStates = useMemo(() => {
    const s: Partial<Record<number, "correct" | "wrong">> = {};
    if (phase === "answered" && question && answer) {
      if (!scored?.correct) s[answer.pitchClass] = "wrong";
      s[pitchClassOf(question.midi)] = "correct";
    }
    return s;
  }, [phase, question, answer, scored]);

  const summary = (
    <SessionSummary
      total={history.length}
      correct={history.filter((h) => h.correct).length}
      avgMs={history.length ? Math.round(history.reduce((a, h) => a + h.responseMs, 0) / history.length) : 0}
      breakdowns={[
        { title: "By note", rows: rowsFrom(history, (h) => PITCH_CLASS_SHORT[pitchClassOf(h.q.midi)], (h) => h.correct, "label") },
        ...(settings.answerMode === "pitch-octave"
          ? [{ title: "By octave", rows: rowsFrom(history, (h) => String(octaveOf(h.q.midi)), (h) => h.correct, "label") }]
          : []),
        { title: "By instrument", rows: rowsFrom(history, (h) => instrumentLabel(h.q.instrumentId), (h) => h.correct) },
      ]}
      misses={history
        .filter((h) => !h.correct)
        .slice(-12)
        .reverse()
        .map((h) => ({
          target: noteName(h.q.midi),
          answer: h.a.midi !== undefined ? noteName(h.a.midi) : PITCH_CLASS_SHORT[h.a.pitchClass],
          instrumentId: h.q.instrumentId,
          responseMs: h.responseMs,
        }))}
    />
  );

  return (
    <QuizShell
      quiz={quiz}
      title="Single note"
      idleText={
        settings.poolMode === "everything"
          ? "A different sound every question, from every instrument and synth. Name the note."
          : "Hear a note, name it. Press Space or click Start."
      }
      questionText="What note is this?"
      feedback={
        question &&
        answer && (
          <FeedbackBanner correct={!!scored?.correct}>
            {scored?.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
            <div className="text-2xl font-semibold tabular-nums">
              {settings.answerMode === "pitch-octave" ? noteName(question.midi) : PITCH_CLASS_SHORT[pitchClassOf(question.midi)]}
            </div>
            {!scored?.correct && (
              <div className="text-muted-foreground">
                you said <span className="font-semibold text-foreground">{answer.midi !== undefined ? noteName(answer.midi) : PITCH_CLASS_SHORT[answer.pitchClass]}</span>
              </div>
            )}
            <div className="ml-auto text-sm text-muted-foreground">
              {instrumentLabel(question.instrumentId)} · {Math.round(quiz.lastResponseMs)} ms{answer.via === "midi" && " · piano"}
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
      {settings.answerMode === "pitch-octave" ? (
        <div className="flex flex-col gap-3">
          <PianoKeyboard low={pianoRange[0]} high={pianoRange[1]} onKey={(m) => onNoteInput(m, "click")} highlights={highlights} disabled={phase !== "question"} />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Octave for buttons / keys <Kbd>Z</Kbd> <Kbd>X</Kbd> <Kbd>0-8</Kbd>
            </span>
            <ToggleGroup variant="outline" size="sm" value={[String(octave)]} onValueChange={(v) => v[0] !== undefined && setOctave(Number(v[0]))}>
              {Array.from({ length: 9 }, (_, o) => (
                <ToggleGroupItem key={o} value={String(o)} className="w-8">
                  {o}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <PitchClassGrid onSelect={answerPitchClass} disabled={phase !== "question"} states={gridStates} showKeys={settings.keyboardShortcuts} />
        </div>
      ) : (
        <PitchClassGrid onSelect={answerPitchClass} disabled={phase !== "question"} states={gridStates} showKeys={settings.keyboardShortcuts} />
      )}
    </QuizShell>
  );
}
