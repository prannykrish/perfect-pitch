"use client";

/**
 * Hum then play: hum a line into the mic (pitch tracked live), then play it on the piano; the
 * hummed notes are the reference and the take is graded with the transcription grader.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { claimKey } from "@/lib/keys";
import { toast } from "sonner";
import { CheckIcon, MicIcon, PlayIcon, SquareIcon, Volume2Icon, XIcon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { noteName } from "@/lib/music/notes";
import { useComposeSettings } from "@/lib/compose/settings";
import { segmentHum, type HummedNote, type PitchFrame } from "@/lib/compose/hum-segment";
import { PitchTracker } from "@/lib/compose/pitch-track";
import { gradePerformance, type GradeResult, type PlayedNote } from "@/lib/trainer/grade";
import type { PlayedEvent } from "@/lib/compose/theory";
import { endSession, logAttempt, startSession } from "@/lib/db/actions";
import { levelTags } from "@/lib/practice/level-run";
import { useLatest } from "@/lib/hooks/use-latest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { PianoRoll, RollLegend, type RollNote } from "@/components/piano-roll";
import { FeedbackBanner } from "@/components/trainer/quiz-shell";
import { SessionSummary, rowsFrom } from "@/components/trainer/session-summary";
import { useMidiTake } from "./use-midi-take";

type Phase = "idle" | "hum" | "play" | "graded" | "ended";

/** Hummed notes are laid on a nominal grid of 120 bpm so the grader's beats are just ms / 500. */
const NOMINAL_BPM = 120;

interface Attempt {
  hummed: HummedNote[];
  played: PlayedEvent[];
  result: GradeResult;
  firstNoteMs: number | null;
}

export function HumDrill() {
  const settings = useComposeSettings((s) => s.settings);
  const settingsRef = useLatest(settings);
  const [phase, setPhase] = useState<Phase>("idle");
  const [hummed, setHummed] = useState<HummedNote[]>([]);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [level, setLevel] = useState(0);
  const [liveNote, setLiveNote] = useState<string>("");
  const [micError, setMicError] = useState<string | null>(null);
  const phaseRef = useLatest(phase);
  const hummedRef = useRef<HummedNote[]>([]);
  const frames = useRef<PitchFrame[]>([]);
  const tracker = useRef<PitchTracker | null>(null);
  const lastGoodMs = useRef(0);
  const uiTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyRef = useRef<Attempt[]>([]);
  const sessionId = useRef<number | null>(null);
  const rollNotes = useRef<RollNote[]>([]);
  const rollNow = useRef(0);
  const [rollDurationMs, setRollDurationMs] = useState(6000);
  const playStartedAt = useRef(0);

  const stopTracker = useCallback(() => {
    tracker.current?.stop();
    tracker.current = null;
    if (uiTimer.current) clearInterval(uiTimer.current);
    uiTimer.current = null;
  }, []);

  const finish = useCallback(() => {
    stopTracker();
    getEngine().stopAll();
    setPhase("ended");
    if (sessionId.current) endSession(sessionId.current).catch(() => {});
    sessionId.current = null;
  }, [stopTracker]);

  const finishHumming = useCallback(() => {
    if (phaseRef.current !== "hum") return;
    stopTracker();
    const s = settingsRef.current;
    const notes = segmentHum(frames.current, { minClarity: s.humMinClarity, minLevel: s.humMinLevel, minNoteMs: s.humMinNoteMs, tolerance: 0.6, maxGapMs: 120 });
    if (!notes.length) {
      toast("Nothing clear was heard. Hum a little louder and steadier, closer to the mic.");
      setPhase("idle");
      return;
    }
    // start the reference at zero
    const t0 = notes[0].startMs;
    const shifted = notes.map((n) => ({ ...n, startMs: n.startMs - t0, endMs: n.endMs - t0 }));
    hummedRef.current = shifted;
    setHummed(shifted);
    rollNotes.current = shifted.map((n) => ({ midi: n.midi, startMs: n.startMs, endMs: n.endMs, kind: "ghost" }));
    rollNow.current = 0;
    setRollDurationMs(Math.max(3000, shifted[shifted.length - 1].endMs + 500));
    playStartedAt.current = performance.now();
    setPhase("play");
  }, [phaseRef, settingsRef, stopTracker]);

  const startHumming = useCallback(async () => {
    const engine = getEngine();
    await engine.resume();
    engine.stopAll();
    frames.current = [];
    hummedRef.current = [];
    setHummed([]);
    setResult(null);
    setMicError(null);
    rollNotes.current = [];
    rollNow.current = 0;
    setRollDurationMs(8000);
    const t = new PitchTracker(engine.context);
    tracker.current = t;
    lastGoodMs.current = 0;
    setPhase("hum");
    try {
      await t.start((f) => {
        frames.current.push(f);
        const s = settingsRef.current;
        if (f.midi !== null && f.clarity >= s.humMinClarity && f.level >= s.humMinLevel) lastGoodMs.current = f.tMs;
        rollNow.current = f.tMs;
        if (f.tMs > 7500) setRollDurationMs((d) => (f.tMs + 2000 > d ? f.tMs + 2000 : d));
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMicError(msg);
      toast.error(`Microphone: ${msg}`);
      stopTracker();
      setPhase("idle");
      return;
    }
    // UI refresh: level, live note, live contour, auto-stop after silence
    uiTimer.current = setInterval(() => {
      const s = settingsRef.current;
      const last = frames.current[frames.current.length - 1];
      if (!last) return;
      setLevel(Math.min(1, last.level * 8));
      const good = last.midi !== null && last.clarity >= s.humMinClarity && last.level >= s.humMinLevel;
      setLiveNote(good && last.midi !== null ? `${noteName(Math.round(last.midi))} ${Math.round((last.midi - Math.round(last.midi)) * 100) >= 0 ? "+" : ""}${Math.round((last.midi - Math.round(last.midi)) * 100)}¢` : "");
      const seg = segmentHum(frames.current, { minClarity: s.humMinClarity, minLevel: s.humMinLevel, minNoteMs: s.humMinNoteMs, tolerance: 0.6, maxGapMs: 120 });
      rollNotes.current = seg.map((n) => ({ midi: n.midi, startMs: n.startMs, endMs: n.endMs, kind: "ghost" }));
      if (lastGoodMs.current > 0 && last.tMs - lastGoodMs.current > s.humSilenceMs) finishHumming();
    }, 80);
  }, [settingsRef, stopTracker, finishHumming]);

  const start = useCallback(async () => {
    historyRef.current = [];
    setHistory([]);
    startSession({ mode: "hum", settings: settingsRef.current })
      .then((id) => {
        sessionId.current = id;
      })
      .catch(() => {});
    await startHumming();
  }, [settingsRef, startHumming]);

  const onSubmit = useCallback(
    (played: PlayedEvent[]) => {
      if (phaseRef.current !== "play" || !played.length) return;
      const s = settingsRef.current;
      const ref = hummedRef.current.map((n) => ({ midi: n.midi, start: n.startMs / 500, duration: Math.max(0.1, (n.endMs - n.startMs) / 500), voice: 0 }));
      const take: PlayedNote[] = played.map((p) => ({ midi: p.midi, timeMs: p.timeMs }));
      const r = gradePerformance(ref, take, NOMINAL_BPM, { rhythm: false, rhythmToleranceBeats: 0.25, octaveInsensitive: s.humOctaveInsensitive });
      const firstNoteMs = Math.round(Math.min(...played.map((p) => p.timeMs)));
      const attempt: Attempt = { hummed: hummedRef.current, played, result: r, firstNoteMs };
      historyRef.current = [...historyRef.current, attempt];
      setHistory(historyRef.current);
      setResult(r);
      setPhase("graded");
      // roll: hummed as ghost / missing, played on the timeline
      const out: RollNote[] = [];
      for (const a of r.refs) out.push({ midi: a.ref.midi, startMs: a.ref.start * 500, endMs: (a.ref.start + a.ref.duration) * 500, kind: a.status === "missing" ? "missing" : "ghost" });
      for (const p of r.playedOnTimeline) {
        const startMs = p.beat * 500;
        out.push({ midi: p.played.midi, startMs, endMs: startMs + 300, kind: p.status === "matched" ? "correct" : p.status === "wrong" ? "wrong" : "extra" });
      }
      rollNotes.current = out;
      rollNow.current = 0;
      logAttempt({
        sessionId: sessionId.current,
        mode: "hum",
        instrumentId: s.instrumentId,
        target: { notes: hummedRef.current.map((n) => n.midi), cents: hummedRef.current.map((n) => n.cents), durationsMs: hummedRef.current.map((n) => Math.round(n.endMs - n.startMs)) },
        answer: { played: played.map((p) => p.midi), matched: r.matched, wrong: r.wrong, missing: r.missing, extra: r.extra, octaveInsensitive: s.humOctaveInsensitive, firstNoteMs },
        correct: r.correct,
        score: r.pitchScore,
        responseMs: firstNoteMs,
        replays: 0,
        ...levelTags("compose"),
      }).catch(() => {});
    },
    [phaseRef, settingsRef]
  );

  const take = useMidiTake({ active: phase === "play", silenceMs: settings.humPlaySilenceMs, onSubmit });

  const hearHum = useCallback(async () => {
    const notes = hummedRef.current;
    if (!notes.length) return;
    const engine = getEngine();
    await engine.resume();
    engine.stopAll();
    await engine.playNotes(notes.map((n) => ({ instrumentId: settingsRef.current.instrumentId, midi: n.midi, at: n.startMs / 1000, duration: Math.max(0.15, (n.endMs - n.startMs) / 1000), velocity: 90 })));
  }, [settingsRef]);

  const hearTake = useCallback(async () => {
    const last = historyRef.current[historyRef.current.length - 1];
    if (!last?.played.length) return;
    const engine = getEngine();
    await engine.resume();
    engine.stopAll();
    const t0 = Math.min(...last.played.map((p) => p.timeMs));
    await engine.playNotes(last.played.map((p) => ({ instrumentId: settingsRef.current.instrumentId, midi: p.midi, at: (p.timeMs - t0) / 1000, duration: 0.4, velocity: 90 })));
  }, [settingsRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const p = phaseRef.current;
      if (e.code === "Space") {
        claimKey(e);
        if (p === "idle" || p === "ended") start();
        else if (p === "graded") startHumming();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (p === "hum") finishHumming();
        else if (p === "play") take.submitNow();
        else if (p === "graded") startHumming();
      } else if (e.key.toUpperCase() === "H" && (p === "play" || p === "graded")) {
        hearHum();
      } else if (e.key === "Escape") {
        if (p !== "idle" && p !== "ended") finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phaseRef, start, startHumming, finishHumming, hearHum, finish, take]);

  useEffect(() => () => stopTracker(), [stopTracker]);

  const rollRange = useMemo<[number, number]>(() => {
    const all = [...hummed.map((n) => n.midi), ...take.played.map((p) => p.midi)];
    if (!all.length) return [40, 84];
    return [Math.max(21, Math.min(...all) - 5), Math.min(108, Math.max(...all) + 5)];
  }, [hummed, take.played]);
  const inDrill = phase !== "idle" && phase !== "ended";
  const correctCount = history.filter((h) => h.result.correct).length;

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Hum then play</CardTitle>
              <CardDescription>
                {phase === "idle" && (PitchTracker.supported() ? "Hum a line, then play it on the piano. The hum is the answer key. Press Space or Start." : "This browser has no microphone access.")}
                {phase === "hum" && "Humming… it stops by itself after a pause, or press Enter."}
                {phase === "play" && "Now play what you hummed. It answers itself after a pause, or press Enter."}
                {phase === "graded" && result && (result.correct ? "Matched." : `${Math.round(result.pitchScore * 100)}% of the hummed notes.`)}
                {phase === "ended" && "Session finished."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm tabular-nums">
              <Badge variant="secondary">
                {correctCount}/{history.length}
              </Badge>
              {settings.humOctaveInsensitive && <Badge variant="outline">any octave</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {!inDrill ? (
              <Button size="lg" onClick={start} disabled={!PitchTracker.supported()}>
                <MicIcon /> {phase === "ended" ? "Again" : "Start humming"} <Kbd>Space</Kbd>
              </Button>
            ) : (
              <>
                {phase === "hum" && (
                  <Button size="lg" onClick={finishHumming}>
                    <SquareIcon /> Done humming <Kbd>Enter</Kbd>
                  </Button>
                )}
                {phase === "play" && (
                  <Button size="lg" onClick={take.submitNow} disabled={take.played.length === 0}>
                    <CheckIcon /> Answer now <Kbd>Enter</Kbd>
                  </Button>
                )}
                {phase === "graded" && (
                  <Button size="lg" onClick={startHumming}>
                    <MicIcon /> Hum the next one <Kbd>Space</Kbd>
                  </Button>
                )}
                {(phase === "play" || phase === "graded") && (
                  <Button size="lg" variant="outline" onClick={hearHum}>
                    <Volume2Icon /> Hear what I hummed <Kbd>H</Kbd>
                  </Button>
                )}
                {phase === "graded" && (
                  <Button size="lg" variant="outline" onClick={hearTake}>
                    <PlayIcon /> Hear my take
                  </Button>
                )}
                <Button size="lg" variant="ghost" onClick={finish} className="ml-auto">
                  <SquareIcon /> End <Kbd>Esc</Kbd>
                </Button>
              </>
            )}
          </div>

          {phase === "hum" && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-2 w-48 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
              <span className="min-w-24 font-mono text-sm">{liveNote || "…"}</span>
              <span className="text-xs text-muted-foreground">mic level and the note heard right now</span>
            </div>
          )}
          {micError && <p className="text-xs text-red-500">{micError}</p>}

          {phase === "graded" && result && (
            <FeedbackBanner correct={result.correct} partial={result.pitchScore > 0}>
              {result.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
              <div className="text-2xl font-semibold tabular-nums">{Math.round(result.pitchScore * 100)}%</div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{result.matched} matched</Badge>
                {result.wrong > 0 && <Badge variant="destructive">{result.wrong} wrong</Badge>}
                {result.missing > 0 && <Badge variant="outline">{result.missing} missed</Badge>}
                {result.extra > 0 && <Badge variant="outline">{result.extra} extra</Badge>}
              </div>
              <div className="ml-auto text-sm text-muted-foreground">
                hummed {hummed.map((n) => noteName(n.midi)).join(" ")}
              </div>
            </FeedbackBanner>
          )}

          {inDrill && (
            <>
              <PianoRoll notesRef={rollNotes} nowRef={rollNow} mode="static" durationMs={rollDurationMs} low={rollRange[0]} high={rollRange[1]} height={220} />
              <RollLegend kinds={phase === "graded" ? ["ghost", "correct", "wrong", "missing", "extra"] : ["ghost"]} />
              {phase === "play" && hummed.length > 0 && <p className="text-xs text-muted-foreground">Grey = what you hummed ({hummed.length} notes, {Math.round(hummed[hummed.length - 1].endMs / 100) / 10}s). Order matters, timing does not.</p>}
            </>
          )}
        </CardContent>
      </Card>

      {phase === "ended" && history.length > 0 && (
        <SessionSummary
          total={history.length}
          correct={correctCount}
          avgScore={history.reduce((a, h) => a + h.result.pitchScore, 0) / history.length}
          avgMs={Math.round(history.reduce((a, h) => a + (h.firstNoteMs ?? 0), 0) / history.length)}
          breakdowns={[{ title: "By length", rows: rowsFrom(history, (h) => `${h.hummed.length} notes`, (h) => h.result.correct, "label") }]}
          misses={history
            .filter((h) => !h.result.correct)
            .slice(-10)
            .reverse()
            .map((h) => ({ target: h.hummed.map((n) => noteName(n.midi)).join(" "), answer: h.played.map((p) => noteName(p.midi)).join(" "), instrumentId: settings.instrumentId, responseMs: h.firstNoteMs ?? 0 }))}
        />
      )}
    </div>
  );
}
