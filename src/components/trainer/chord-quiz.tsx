"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, XIcon, Volume2Icon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { instrumentLabel } from "@/lib/audio/instruments";
import {
  buildChord,
  CHORD_CATEGORY_LABELS,
  CHORD_QUALITIES,
  chordLabel,
  chordPitchClasses,
  chordQuality,
  identifyChord,
  INVERSION_LABELS,
  samePitchClasses,
  type ChordCategory,
} from "@/lib/music/chords";
import { midiFrom, noteName, octaveOf, PITCH_CLASS_SHORT, pitchClassOf } from "@/lib/music/notes";
import { generateChord, type ChordQuestion } from "@/lib/trainer/generators";
import { recordInstrumentResult, recordKeyResult, recordNoteResult } from "@/lib/trainer/quiz-core";
import type { TrainerSettings } from "@/lib/trainer/settings";
import { useLatest } from "@/lib/hooks/use-latest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { KeyHighlight } from "@/components/piano-keyboard";
import { NoteEntry, useEntryShortcuts } from "@/components/trainer/note-entry";
import { useQuiz, type QuizModeAdapter, type NoteInputVia } from "@/components/trainer/use-quiz";
import { QuizShell, FeedbackBanner } from "@/components/trainer/quiz-shell";
import { SessionSummary, rowsFrom } from "@/components/trainer/session-summary";
import { useMidiStore } from "@/lib/midi/midi";
import { cn } from "@/lib/utils";

type Q = ChordQuestion;
type A =
  | { kind: "root-quality"; rootPc: number; qualityId: string; inversion?: number; via: NoteInputVia }
  | { kind: "notes"; notes: number[]; via: NoteInputVia };

type Entry = { q: Q | null; entries: number[]; played: number[]; rootPc: number | null; qualityId: string | null; inversion: number | null };
const EMPTY: Omit<Entry, "q"> = { entries: [], played: [], rootPc: null, qualityId: null, inversion: null };

function answersWithNotes(q: Q, settings: TrainerSettings) {
  return q.kind === "cluster" || settings.chordAnswer === "notes";
}

/** Which inversion is a set of sorted notes in, relative to the chord's root position order. */
function inversionOf(notes: number[], rootPc: number, qualityId: string): number {
  const q = chordQuality(qualityId);
  if (!q) return 0;
  const tones = q.intervals.map((i) => (rootPc + i) % 12);
  const bassPc = pitchClassOf(Math.min(...notes));
  const idx = tones.indexOf(bassPc);
  return idx < 0 ? 0 : idx;
}

const adapter: QuizModeAdapter<Q, A> = {
  mode: "chords",
  generate: ({ settings, chooseInstrument, stats }) => generateChord(settings, chooseInstrument, stats),
  async play(q, settings) {
    const dur = settings.noteDurationMs / 1000;
    const engine = getEngine();
    const blocked = q.notes.map((n) => ({ instrumentId: n.instrumentId, midi: n.midi, at: 0, duration: dur * 1.4 }));
    const arp = q.notes.map((n, i) => ({ instrumentId: n.instrumentId, midi: n.midi, at: i * 0.18, duration: 0.5 }));
    if (settings.chordPlayback === "blocked") await engine.playNotes(blocked);
    else if (settings.chordPlayback === "arp") await engine.playNotes(arp);
    else {
      const offset = q.notes.length * 0.18 + 0.5;
      await engine.playNotes([...arp, ...blocked.map((b) => ({ ...b, at: offset }))]);
    }
  },
  score(q, a, settings) {
    const n = q.notes.length;
    if (a.kind === "notes") {
      const targets = q.notes.map((x) => x.midi);
      const toCmp = (v: number) => (settings.answerMode === "pitch-octave" ? v : pitchClassOf(v));
      if (settings.chordNotesOrder === "bottom-up") {
        let m = 0;
        targets.forEach((t, i) => {
          if (a.notes[i] !== undefined && toCmp(a.notes[i]) === toCmp(t)) m++;
        });
        return { correct: m === n, score: m / n };
      }
      const remaining = targets.map(toCmp);
      let m = 0;
      for (const v of a.notes) {
        const idx = remaining.indexOf(toCmp(v));
        if (idx >= 0) {
          remaining.splice(idx, 1);
          m++;
        }
      }
      return { correct: m === n && a.notes.length === n, score: m / n };
    }
    if (!q.spec) return { correct: false, score: 0 };
    const qualOk = a.qualityId === q.spec.qualityId;
    // Symmetric chords (dim7, aug) have several valid roots: accept any root that yields the same notes.
    const rootOk = a.rootPc === q.spec.rootPc || (qualOk && samePitchClasses(chordPitchClasses(a.rootPc, a.qualityId), chordPitchClasses(q.spec.rootPc, q.spec.qualityId)));
    if (settings.chordAskInversion) {
      const invOk = (a.inversion ?? 0) === q.spec.inversion;
      const score = (rootOk ? 0.4 : 0) + (qualOk ? 0.4 : 0) + (invOk ? 0.2 : 0);
      return { correct: rootOk && qualOk && invOk, score };
    }
    return { correct: rootOk && qualOk, score: (rootOk ? 0.5 : 0) + (qualOk ? 0.5 : 0) };
  },
  log(q, a, settings) {
    return {
      instrumentId: q.notes[0].instrumentId,
      target: { kind: q.kind, notes: q.notes.map((n) => n.midi), spec: q.spec ?? null },
      answer: { ...a, answerMode: settings.answerMode, order: settings.chordNotesOrder },
    };
  },
  record(stats, q, a, scored) {
    if (q.kind === "chord" && q.spec) recordKeyResult(stats, `chord:${q.spec.qualityId}`, scored.correct);
    if (q.kind === "cluster") recordKeyResult(stats, `cluster:${q.notes.length}`, scored.correct);
    if (a.kind === "notes") {
      const set = new Set(a.notes.map((v) => pitchClassOf(v)));
      for (const n of q.notes) recordNoteResult(stats, n.midi, n.instrumentId, set.has(pitchClassOf(n.midi)));
    } else recordInstrumentResult(stats, q.notes[0].instrumentId, scored.correct);
  },
};

export function ChordQuiz() {
  // All per-question input state is keyed on the question object, so a new question starts clean.
  const [entryState, setEntryState] = useState<Entry>({ q: null, ...EMPTY });
  const entryStateRef = useLatest(entryState);
  const quizRef = useRef<ReturnType<typeof useQuiz<Q, A>> | null>(null);
  const stateFor = useCallback((q: Q | null): Entry => (entryStateRef.current.q === q ? entryStateRef.current : { q, ...EMPTY }), [entryStateRef]);
  const patch = useCallback(
    (p: Partial<Omit<Entry, "q">>) => {
      const q = quizRef.current?.question ?? null;
      setEntryState({ ...stateFor(q), q, ...p });
    },
    [stateFor]
  );

  const onNote = useCallback(
    (midi: number, via: NoteInputVia) => {
      const quiz = quizRef.current;
      if (!quiz || quiz.phase !== "question" || !quiz.question) return;
      const q = quiz.question;
      const s = quiz.settings;
      const cur = stateFor(q);
      if (answersWithNotes(q, s)) {
        const value = s.answerMode === "pitch-octave" ? midi : pitchClassOf(midi);
        const next = [...cur.entries, value];
        patch({ entries: next });
        if (next.length >= q.notes.length) quiz.submit({ kind: "notes", notes: next, via });
        return;
      }
      // root + quality answered by playing the chord on the piano
      if (via === "keyboard") return;
      const next = [...cur.played, midi];
      patch({ played: next });
      if (next.length >= q.notes.length) {
        const id = identifyChord(next);
        if (id) quiz.submit({ kind: "root-quality", rootPc: id.rootPc, qualityId: id.qualityId, inversion: inversionOf(next, id.rootPc, id.qualityId), via });
        else quiz.submit({ kind: "root-quality", rootPc: pitchClassOf(Math.min(...next)), qualityId: "unknown", inversion: 0, via });
      }
    },
    [stateFor, patch]
  );

  const quiz = useQuiz<Q, A>(adapter, { onNoteInput: onNote });
  useEffect(() => {
    quizRef.current = quiz;
  });
  const { settings, phase, question, answer, scored, history, octave, setOctave } = quiz;
  const midiHeld = useMidiStore((s) => s.held);
  const { entries, played, rootPc, qualityId, inversion } = entryState.q === question ? entryState : EMPTY;

  const notesMode = question ? answersWithNotes(question, settings) : settings.chordKind === "clusters" || settings.chordAnswer === "notes";

  const undo = useCallback(() => {
    const cur = stateFor(quizRef.current?.question ?? null);
    if (cur.inversion !== null) patch({ inversion: null });
    else if (cur.qualityId !== null) patch({ qualityId: null });
    else patch({ rootPc: null, entries: cur.entries.slice(0, -1), played: cur.played.slice(0, -1) });
  }, [stateFor, patch]);
  const clear = useCallback(() => patch({ ...EMPTY }), [patch]);
  const submitNotes = useCallback(() => {
    const quiz = quizRef.current;
    const e = stateFor(quiz?.question ?? null).entries;
    if (quiz && e.length) quiz.submit({ kind: "notes", notes: e, via: "click" });
  }, [stateFor]);
  useEntryShortcuts(phase === "question", undo, notesMode ? submitNotes : undefined);

  // root + quality flow: auto-submit when everything required is chosen
  const trySubmitRQ = (r: number | null, qid: string | null, inv: number | null) => {
    if (r === null || qid === null) return;
    if (settings.chordAskInversion && inv === null) return;
    quizRef.current?.submit({ kind: "root-quality", rootPc: r, qualityId: qid, inversion: inv ?? 0, via: "click" });
  };
  const setRootPc = (v: number | null) => patch({ rootPc: v });
  const setQualityId = (v: string | null) => patch({ qualityId: v });
  const setInversion = (v: number | null) => patch({ inversion: v });

  const qualities = useMemo(() => {
    const cats = settings.chordCategories.length ? settings.chordCategories : (Object.keys(CHORD_CATEGORY_LABELS) as ChordCategory[]);
    return cats.map((c) => ({ category: c, items: CHORD_QUALITIES.filter((q) => q.category === c) })).filter((g) => g.items.length);
  }, [settings.chordCategories]);

  const hearAnswer = () => {
    if (!question || !answer) return;
    const dur = settings.noteDurationMs / 1000;
    const inst = question.notes[0].instrumentId;
    let notes: number[];
    if (answer.kind === "notes") {
      notes = answer.notes.map((v, i) => (settings.answerMode === "pitch-octave" ? v : midiFrom(v, octaveOf(question.notes[Math.min(i, question.notes.length - 1)].midi))));
    } else {
      if (!chordQuality(answer.qualityId)) return;
      const bass = question.notes[0].midi;
      notes = buildChord({ rootPc: answer.rootPc, qualityId: answer.qualityId, inversion: answer.inversion ?? 0, voicing: question.spec?.voicing ?? "closed" }, bass);
      // shift so the bass pitch class matches the answered chord's bass
      const want = buildChord({ rootPc: answer.rootPc, qualityId: answer.qualityId, inversion: answer.inversion ?? 0, voicing: "closed" }, 60)[0] % 12;
      const delta = ((want - pitchClassOf(bass)) % 12 + 12) % 12;
      notes = notes.map((n) => n + (delta > 6 ? delta - 12 : delta));
    }
    getEngine().playNotes(notes.map((m) => ({ instrumentId: inst, midi: m, at: 0, duration: dur * 1.4 })));
  };

  const highlights = useMemo(() => {
    const h: Partial<Record<number, KeyHighlight>> = {};
    for (const m of midiHeld) h[m] = "pressed";
    if (phase === "answered" && question) for (const n of question.notes) h[n.midi] = "target";
    return h;
  }, [midiHeld, phase, question]);

  const targetLabel = (q: Q) =>
    q.kind === "chord" && q.spec ? chordLabel(q.spec, true) + (q.spec.voicing !== "closed" ? ` · ${q.spec.voicing}` : "") : `cluster of ${q.notes.length}`;
  const answerLabel = (a: A) =>
    a.kind === "notes"
      ? a.notes.map((v) => (settings.answerMode === "pitch-octave" ? noteName(v) : PITCH_CLASS_SHORT[pitchClassOf(v)])).join(" ")
      : a.qualityId === "unknown"
        ? "not a known chord"
        : chordLabel({ rootPc: a.rootPc, qualityId: a.qualityId, inversion: a.inversion }, settings.chordAskInversion);

  const entryStates = useMemo(() => {
    if (phase !== "answered" || !question || !answer || answer.kind !== "notes") return undefined;
    const toCmp = (v: number) => (settings.answerMode === "pitch-octave" ? v : pitchClassOf(v));
    if (settings.chordNotesOrder === "bottom-up") return question.notes.map((n, i) => (answer.notes[i] !== undefined && toCmp(answer.notes[i]) === toCmp(n.midi) ? "correct" : "wrong"));
    const remaining = question.notes.map((n) => toCmp(n.midi));
    return answer.notes.map((v) => {
      const idx = remaining.indexOf(toCmp(v));
      if (idx >= 0) {
        remaining.splice(idx, 1);
        return "correct" as const;
      }
      return "wrong" as const;
    });
  }, [phase, question, answer, settings.answerMode, settings.chordNotesOrder]);

  const summary = (
    <SessionSummary
      total={history.length}
      correct={history.filter((h) => h.correct).length}
      avgScore={history.length ? history.reduce((a, h) => a + h.score, 0) / history.length : undefined}
      avgMs={history.length ? Math.round(history.reduce((a, h) => a + h.responseMs, 0) / history.length) : 0}
      breakdowns={[
        {
          title: "By chord type",
          rows: rowsFrom(history, (h) => (h.q.kind === "chord" && h.q.spec ? (chordQuality(h.q.spec.qualityId)?.name ?? h.q.spec.qualityId) : `cluster of ${h.q.notes.length}`), (h) => h.correct),
        },
        { title: "By root", rows: rowsFrom(history.filter((h) => h.q.spec), (h) => PITCH_CLASS_SHORT[h.q.spec!.rootPc], (h) => h.correct, "label") },
        { title: "By instrument", rows: rowsFrom(history, (h) => instrumentLabel(h.q.notes[0].instrumentId), (h) => h.correct) },
      ]}
      misses={history
        .filter((h) => !h.correct)
        .slice(-10)
        .reverse()
        .map((h) => ({
          target: `${targetLabel(h.q)} (${h.q.notes.map((n) => noteName(n.midi)).join(" ")})`,
          answer: answerLabel(h.a),
          instrumentId: h.q.notes[0].instrumentId,
          responseMs: h.responseMs,
        }))}
    />
  );

  return (
    <QuizShell
      quiz={quiz}
      title="Chords & clusters"
      idleText={
        settings.chordKind === "clusters"
          ? "Random simultaneous notes. Name every note."
          : settings.chordAnswer === "notes"
            ? "Real chords. Name every note."
            : "Real chords. Name the root and quality."
      }
      questionText={
        notesMode
          ? `Name all ${question?.notes.length ?? ""} notes${settings.chordNotesOrder === "bottom-up" ? ", bottom to top" : ""}.`
          : `Which chord is this?${settings.chordAskInversion ? " Root, quality and inversion." : ""}`
      }
      feedback={
        question &&
        answer && (
          <FeedbackBanner correct={!!scored?.correct} partial={!!scored && scored.score > 0}>
            {scored?.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
            <div className="flex flex-col gap-1">
              <div className="text-xl font-semibold">
                {targetLabel(question)} <span className="text-base font-normal text-muted-foreground">{question.notes.map((n) => noteName(n.midi)).join(" ")}</span>
              </div>
              {!scored?.correct && (
                <div className="text-muted-foreground">
                  you said <span className="font-semibold text-foreground">{answerLabel(answer)}</span>
                </div>
              )}
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              {Math.round((scored?.score ?? 0) * 100)}% · {instrumentLabel(question.notes[0].instrumentId)} · {Math.round(quiz.lastResponseMs)} ms
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
      {notesMode ? (
        <NoteEntry
          answerMode={settings.answerMode}
          entries={entries}
          count={question?.notes.length}
          onAdd={(m) => onNote(m, "click")}
          onUndo={undo}
          onClear={clear}
          onSubmit={submitNotes}
          disabled={phase !== "question"}
          pianoRange={[settings.rangeLow, settings.rangeHigh]}
          highlights={highlights}
          octave={octave}
          setOctave={setOctave}
          showKeys={settings.keyboardShortcuts}
          entryStates={entryStates}
          hint={settings.chordNotesOrder === "bottom-up" ? "bottom to top" : "any order"}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="h-8 min-w-24 justify-center text-sm">
              {rootPc !== null ? PITCH_CLASS_SHORT[rootPc] : "root"}
              {qualityId !== null ? chordQuality(qualityId)?.suffix || " maj" : " …"}
              {settings.chordAskInversion && inversion !== null ? ` · ${INVERSION_LABELS[inversion]}` : ""}
            </Badge>
            {played.length > 0 && phase === "question" && (
              <span className="text-xs text-muted-foreground">
                piano: {played.map((m) => noteName(m)).join(" ")} ({played.length}/{question?.notes.length})
              </span>
            )}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={undo} disabled={phase !== "question"}>
              Undo
            </Button>
          </div>
          <Label className="text-xs text-muted-foreground">Root</Label>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
            {PITCH_CLASS_SHORT.map((name, pc) => (
              <Button
                key={pc}
                variant={rootPc === pc ? "default" : "outline"}
                disabled={phase !== "question"}
                onClick={() => {
                  setRootPc(pc);
                  trySubmitRQ(pc, qualityId, inversion);
                }}
                className={cn("h-10 font-semibold", phase === "answered" && question?.spec?.rootPc === pc && "border-green-500")}
              >
                {name}
              </Button>
            ))}
          </div>
          {qualities.map((g) => (
            <div key={g.category} className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{CHORD_CATEGORY_LABELS[g.category]}</Label>
              <div className="flex flex-wrap gap-2">
                {g.items.map((q) => (
                  <Button
                    key={q.id}
                    variant={qualityId === q.id ? "default" : "outline"}
                    size="sm"
                    disabled={phase !== "question"}
                    onClick={() => {
                      setQualityId(q.id);
                      trySubmitRQ(rootPc, q.id, inversion);
                    }}
                    className={cn(phase === "answered" && question?.spec?.qualityId === q.id && "border-green-500")}
                    title={q.name}
                  >
                    {q.suffix || "maj"} <span className="text-[10px] font-normal text-muted-foreground">{q.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
          {settings.chordAskInversion && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Inversion</Label>
              <div className="flex flex-wrap gap-2">
                {INVERSION_LABELS.slice(0, 4).map((label, i) => (
                  <Button
                    key={i}
                    variant={inversion === i ? "default" : "outline"}
                    size="sm"
                    disabled={phase !== "question"}
                    onClick={() => {
                      setInversion(i);
                      trySubmitRQ(rootPc, qualityId, i);
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Or play the chord on the USB piano and the app identifies it.</p>
        </div>
      )}
    </QuizShell>
  );
}
