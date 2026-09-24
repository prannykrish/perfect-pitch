"use client";

/**
 * Theory drills verified from the piano: "play D♭maj9 in second inversion", "play ii–V–I in F♯
 * with drop-2 voicings", "play D dorian", "harmonise this melody". Levels ramp from triads in root
 * position to harmonisation. Right → moves on by itself; wrong → holds until Space / Enter.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, EyeIcon, PlayIcon, RotateCcwIcon, SquareIcon, Volume2Icon, XIcon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { chordLabel } from "@/lib/music/chords";
import { noteName } from "@/lib/music/notes";
import { useComposeSettings } from "@/lib/compose/settings";
import { generateTheoryTask, gradeTheoryTask, groupChords, referenceNotes, THEORY_KIND_LABELS, type PlayedEvent, type TheoryGrade, type TheoryTask } from "@/lib/compose/theory";
import { endSession, logAttempt, startSession } from "@/lib/db/actions";
import { useLatest } from "@/lib/hooks/use-latest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { PianoKeyboard, type KeyHighlight } from "@/components/piano-keyboard";
import { FeedbackBanner } from "@/components/trainer/quiz-shell";
import { SessionSummary, rowsFrom } from "@/components/trainer/session-summary";
import { useMidiTake } from "./use-midi-take";

type Phase = "idle" | "task" | "graded" | "ended";

interface Attempt {
  task: TheoryTask;
  grade: TheoryGrade;
  played: PlayedEvent[];
  firstNoteMs: number | null;
  gaveUp: boolean;
}

export function TheoryDrill() {
  const settings = useComposeSettings((s) => s.settings);
  const settingsRef = useLatest(settings);
  const [phase, setPhase] = useState<Phase>("idle");
  const [task, setTask] = useState<TheoryTask | null>(null);
  const [grade, setGrade] = useState<TheoryGrade | null>(null);
  const [history, setHistory] = useState<Attempt[]>([]);
  const phaseRef = useLatest(phase);
  const taskRef = useLatest(task);
  const historyRef = useRef<Attempt[]>([]);
  const sessionId = useRef<number | null>(null);
  const shownAt = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
  };

  const playReference = useCallback(async (t: TheoryTask) => {
    const engine = getEngine();
    await engine.resume();
    engine.stopAll();
    const inst = settingsRef.current.instrumentId;
    const gap = t.kind === "scale" ? 0.32 : 0.75;
    const events = referenceNotes(t).flatMap((chord, i) => chord.map((m) => ({ instrumentId: inst, midi: m, at: i * gap, duration: t.kind === "scale" ? 0.3 : gap * 0.95, velocity: 85 })));
    await engine.playNotes(events);
  }, [settingsRef]);

  const playMelody = useCallback(async (t: TheoryTask) => {
    if (t.kind !== "harmonise") return;
    const engine = getEngine();
    await engine.resume();
    const beat = 60 / t.bpm;
    await engine.playNotes(t.melody.map((m, i) => ({ instrumentId: settingsRef.current.instrumentId, midi: m, at: i * beat, duration: beat * 0.9, velocity: 95 })));
  }, [settingsRef]);

  const finish = useCallback(() => {
    clearTimer();
    getEngine().stopAll();
    setPhase("ended");
    if (sessionId.current) endSession(sessionId.current).catch(() => {});
    sessionId.current = null;
  }, []);

  const next = useCallback(async () => {
    clearTimer();
    const s = settingsRef.current;
    const t = generateTheoryTask({ level: s.theoryLevel, mixLower: s.theoryMixLower, kinds: s.theoryKinds });
    setTask(t);
    setGrade(null);
    setPhase("task");
    shownAt.current = performance.now();
    if (t.kind === "harmonise") playMelody(t).catch(() => {});
    else if (s.theoryPlayReference) playReference(t).catch(() => {});
  }, [settingsRef, playMelody, playReference]);

  const start = useCallback(async () => {
    await getEngine().resume();
    historyRef.current = [];
    setHistory([]);
    startSession({ mode: "theory", settings: settingsRef.current })
      .then((id) => {
        sessionId.current = id;
      })
      .catch(() => {});
    await next();
  }, [settingsRef, next]);

  const record = useCallback(
    (t: TheoryTask, played: PlayedEvent[], g: TheoryGrade, gaveUp: boolean) => {
      const s = settingsRef.current;
      const firstNoteMs = played.length ? Math.min(...played.map((p) => p.timeMs)) : null;
      const attempt: Attempt = { task: t, grade: g, played, firstNoteMs, gaveUp };
      historyRef.current = [...historyRef.current, attempt];
      setHistory(historyRef.current);
      setGrade(g);
      setPhase("graded");
      const target: Record<string, unknown> = { kind: t.kind, level: t.level, prompt: t.prompt, strictness: s.theoryStrictness };
      if (t.kind === "chord") target.spec = t.spec;
      if (t.kind === "progression") Object.assign(target, { tonic: t.tonic, minor: t.minor, roman: t.chords.map((c) => c.roman), voicing: t.voicing });
      if (t.kind === "scale") Object.assign(target, { tonic: t.tonic, scale: t.scale, direction: t.direction, expected: t.expected });
      if (t.kind === "harmonise") Object.assign(target, { tonic: t.tonic, minor: t.minor, melody: t.melody });
      logAttempt({
        sessionId: sessionId.current,
        mode: "theory",
        instrumentId: s.instrumentId,
        target,
        answer: { chords: groupChords(played), lines: g.lines, gaveUp, firstNoteMs, totalMs: Math.round(performance.now() - shownAt.current) },
        correct: g.correct && !gaveUp,
        score: gaveUp ? 0 : g.score,
        responseMs: firstNoteMs ?? performance.now() - shownAt.current,
        replays: 0,
      }).catch(() => {});
      if (g.correct && !gaveUp && s.theoryAutoProceed) autoTimer.current = setTimeout(() => next(), 900);
    },
    [settingsRef, next]
  );

  const onSubmit = useCallback(
    (played: PlayedEvent[]) => {
      const t = taskRef.current;
      if (!t || phaseRef.current !== "task") return;
      if (!played.length) return;
      record(t, played, gradeTheoryTask(t, played, settingsRef.current.theoryStrictness), false);
    },
    [taskRef, phaseRef, settingsRef, record]
  );

  const take = useMidiTake({ active: phase === "task", silenceMs: settings.theoryAutoSubmitMs, onSubmit });

  const giveUp = useCallback(() => {
    const t = taskRef.current;
    if (!t || phaseRef.current !== "task") return;
    const g = gradeTheoryTask(t, [], settingsRef.current.theoryStrictness);
    record(t, [], { ...g, correct: false, score: 0, summary: "Skipped. Here is the answer." }, true);
    playReference(t).catch(() => {});
  }, [taskRef, phaseRef, settingsRef, record, playReference]);

  const hear = useCallback(() => {
    const t = taskRef.current;
    if (!t) return;
    if (phaseRef.current === "task" && t.kind === "harmonise") playMelody(t).catch(() => {});
    else if (phaseRef.current === "graded") playReference(t).catch(() => {});
  }, [taskRef, phaseRef, playMelody, playReference]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const p = phaseRef.current;
      if (e.code === "Space") {
        e.preventDefault();
        if (p === "idle" || p === "ended") start();
        else if (p === "graded") next();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (p === "task") take.submitNow();
        else if (p === "graded") next();
      } else if (e.key.toUpperCase() === "R") {
        hear();
      } else if (e.key === "Escape") {
        if (p === "task" || p === "graded") finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phaseRef, start, next, hear, finish, take]);

  useEffect(() => () => clearTimer(), []);

  const highlights = useMemo(() => {
    const h: Partial<Record<number, KeyHighlight>> = {};
    for (const m of take.held) h[m] = "pressed";
    if (phase === "graded" && task && grade && !grade.correct) {
      const ref = referenceNotes(task);
      for (const m of ref[ref.length - 1] ?? []) h[m] = "target";
    }
    return h;
  }, [take.held, phase, task, grade]);

  const playedChords = useMemo(() => groupChords(take.played), [take.played]);
  const correctCount = history.filter((h) => h.grade.correct && !h.gaveUp).length;
  const latencies = history.filter((h) => h.firstNoteMs !== null).map((h) => h.firstNoteMs!);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Theory drills</CardTitle>
              <CardDescription>
                {phase === "idle" && "A task in words; you play it on the piano; it is checked note for note. Press Space or Start."}
                {phase === "task" && (task?.kind === "harmonise" ? "Listen, then play one triad under each melody note, in order. Answers itself after a pause, or press Enter." : "Play it. It answers itself after a pause, or press Enter.")}
                {phase === "graded" && grade?.summary}
                {phase === "ended" && "Session finished."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm tabular-nums">
              <Badge variant="secondary">
                {correctCount}/{history.length}
              </Badge>
              {avgLatency !== null && <Badge variant="outline">first note ≈ {avgLatency} ms</Badge>}
              <Badge variant="outline">level {settings.theoryLevel}{settings.theoryMixLower && settings.theoryLevel > 1 ? " and below" : ""}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {phase === "idle" || phase === "ended" ? (
              <Button size="lg" onClick={start}>
                <PlayIcon /> {phase === "ended" ? "Practice again" : "Start"} <Kbd>Space</Kbd>
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={next} disabled={phase !== "graded"}>
                  <PlayIcon /> Next task <Kbd>Space</Kbd> <Kbd>Enter</Kbd>
                </Button>
                {phase === "task" && (
                  <>
                    <Button size="lg" variant="outline" onClick={take.submitNow} disabled={take.played.length === 0}>
                      <CheckIcon /> Answer now <Kbd>Enter</Kbd>
                    </Button>
                    {task?.kind === "harmonise" && (
                      <Button size="lg" variant="outline" onClick={hear}>
                        <RotateCcwIcon /> Hear the melody <Kbd>R</Kbd>
                      </Button>
                    )}
                    <Button size="lg" variant="ghost" onClick={giveUp}>
                      <EyeIcon /> Show me
                    </Button>
                  </>
                )}
                {phase === "graded" && (
                  <Button size="lg" variant="outline" onClick={hear}>
                    <Volume2Icon /> Hear the answer <Kbd>R</Kbd>
                  </Button>
                )}
                <Button size="lg" variant="ghost" onClick={finish} className="ml-auto">
                  <SquareIcon /> End <Kbd>Esc</Kbd>
                </Button>
              </>
            )}
          </div>

          {task && (phase === "task" || phase === "graded") && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <div className="mb-1 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{THEORY_KIND_LABELS[task.kind]}</Badge>
                <Badge variant="outline">level {task.level}</Badge>
              </div>
              <div className="text-lg font-semibold">{task.prompt}</div>
              {playedChords.length > 0 && (
                <div className="mt-2 text-sm text-muted-foreground">
                  You played: {playedChords.map((c, i) => <span key={i} className="mr-2 font-mono">{c.map((m) => noteName(m)).join(" ")}</span>)}
                </div>
              )}
            </div>
          )}

          {phase === "graded" && grade && task && (
            <FeedbackBanner correct={grade.correct} partial={grade.score > 0}>
              {grade.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
              <div className="flex flex-col gap-0.5 text-sm">
                {grade.lines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
                {!grade.correct && task.kind === "chord" && <div className="text-muted-foreground">Answer: {referenceNotes(task)[0].map((m) => noteName(m)).join(" ")} ({chordLabel(task.spec, true)})</div>}
                {!grade.correct && task.kind === "progression" && (
                  <div className="text-muted-foreground">Answer: {referenceNotes(task).map((c) => c.map((m) => noteName(m)).join(" ")).join(" | ")}</div>
                )}
                {!grade.correct && task.kind === "scale" && <div className="text-muted-foreground">Answer: {task.expected.map((m) => noteName(m)).join(" ")}</div>}
              </div>
              <div className="ml-auto text-sm text-muted-foreground">{Math.round(grade.score * 100)}%</div>
            </FeedbackBanner>
          )}

          <PianoKeyboard low={36} high={96} highlights={highlights} height={80} labels="c" />
        </CardContent>
      </Card>

      {phase === "ended" && history.length > 0 && (
        <SessionSummary
          total={history.length}
          correct={correctCount}
          avgScore={history.reduce((a, h) => a + (h.gaveUp ? 0 : h.grade.score), 0) / history.length}
          avgMs={avgLatency ?? 0}
          breakdowns={[
            { title: "By kind", rows: rowsFrom(history, (h) => THEORY_KIND_LABELS[h.task.kind], (h) => h.grade.correct && !h.gaveUp) },
            { title: "By level", rows: rowsFrom(history, (h) => `Level ${h.task.level}`, (h) => h.grade.correct && !h.gaveUp, "label") },
          ]}
          misses={history
            .filter((h) => !h.grade.correct || h.gaveUp)
            .slice(-10)
            .reverse()
            .map((h) => ({ target: h.task.prompt, answer: h.gaveUp ? "skipped" : h.grade.lines.filter((l) => l.startsWith("✗")).join("; ") || h.grade.summary, instrumentId: settings.instrumentId, responseMs: h.firstNoteMs ?? 0 }))}
        />
      )}
    </div>
  );
}
