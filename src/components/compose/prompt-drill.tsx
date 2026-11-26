"use client";

/**
 * Prompt drill: a key, tempo, progression and mood; a few seconds to imagine four bars; a
 * one-bar count-in; one take with a click and optional backing chords; then listen back and rate
 * yourself. The measured number is the latency from the downbeat to your first note.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { claimKey } from "@/lib/keys";
import { toast } from "sonner";
import { PlayIcon, SaveIcon, SquareIcon, Volume2Icon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { clickEvents } from "@/lib/audio/click";
import { getMidi } from "@/lib/midi/midi";
import { MidiRecorder, recordingDurationMs, type RecordedNote } from "@/lib/midi/recorder";
import { beatsToMs } from "@/lib/music/score";
import { PITCH_CLASS_SHORT } from "@/lib/music/notes";
import { useComposeSettings } from "@/lib/compose/settings";
import { backingNotes, generatePrompt, type Prompt } from "@/lib/compose/prompt-gen";
import { keyName } from "@/lib/compose/theory";
import { endSession, logAttempt, saveRecording, startSession } from "@/lib/db/actions";
import { levelTags } from "@/lib/practice/level-run";
import { useLatest } from "@/lib/hooks/use-latest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { PianoRoll, type RollNote } from "@/components/piano-roll";
import { SessionSummary, rowsFrom } from "@/components/trainer/session-summary";
import { cn } from "@/lib/utils";

type Phase = "idle" | "imagine" | "countin" | "take" | "review" | "rated" | "ended";

interface Attempt {
  prompt: Prompt;
  notes: RecordedNote[];
  latencyMs: number | null;
  rating: number;
}

const RATING_WORDS = ["", "lost it", "rough", "okay", "good", "nailed it"];

export function PromptDrill() {
  const settings = useComposeSettings((s) => s.settings);
  const settingsRef = useLatest(settings);
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [take, setTake] = useState<RecordedNote[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [rating, setRating] = useState(0);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [saved, setSaved] = useState(false);
  const phaseRef = useLatest(phase);
  const promptRef = useLatest(prompt);
  const takeRef = useRef<RecordedNote[]>([]);
  const historyRef = useRef<Attempt[]>([]);
  const sessionId = useRef<number | null>(null);
  const recorder = useRef(new MidiRecorder());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rollNotes = useRef<RollNote[]>([]);
  const rollNow = useRef(0);
  const raf = useRef(0);
  const takeStartPerf = useRef(0);
  const takeMs = useRef(4000);

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    cancelAnimationFrame(raf.current);
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const finish = useCallback(() => {
    clearTimers();
    getEngine().stopAll();
    recorder.current.stop();
    setPhase("ended");
    if (sessionId.current) endSession(sessionId.current).catch(() => {});
    sessionId.current = null;
  }, []);

  /** Schedule count-in + click + backing for a prompt; returns the ms until the take's downbeat. */
  const scheduleBed = useCallback(async (p: Prompt, withCountIn: boolean) => {
    const s = settingsRef.current;
    const engine = getEngine();
    await engine.resume();
    engine.stopAll();
    const beatSec = 60 / p.bpm;
    const countInBeats = withCountIn ? 4 : 0;
    const events: { instrumentId: string; midi: number; at: number; duration: number; velocity: number }[] = [];
    if (s.promptClick) {
      if (withCountIn) events.push(...clickEvents({ bpm: p.bpm, beats: 4 }));
      events.push(...clickEvents({ bpm: p.bpm, beats: p.bars * 4, offsetSec: countInBeats * beatSec, soft: true }));
    }
    if (s.promptBacking) {
      for (const n of backingNotes(p)) events.push({ instrumentId: s.instrumentId, midi: n.midi, at: countInBeats * beatSec + n.startBeat * beatSec, duration: n.durationBeats * beatSec * 0.95, velocity: 45 });
    }
    if (events.length) await engine.playNotes(events);
    return countInBeats * beatSec * 1000 + 50;
  }, [settingsRef]);

  const beginTake = useCallback(async (p: Prompt) => {
    const countInMs = await scheduleBed(p, true);
    const now = performance.now();
    takeStartPerf.current = now + countInMs;
    takeMs.current = beatsToMs(p.bars * 4, p.bpm);
    recorder.current.start(takeStartPerf.current);
    rollNotes.current = [];
    setTake([]);
    setLatency(null);
    setPhase("countin");
    later(() => {
      setPhase("take");
      const tick = () => {
        rollNow.current = performance.now() - takeStartPerf.current;
        // live roll of the take so far
        rollNotes.current = recorder.current.current.map((n) => ({ midi: n.midi, startMs: n.startMs, endMs: n.endMs, velocity: n.velocity, kind: "played" }));
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }, countInMs);
    later(() => {
      cancelAnimationFrame(raf.current);
      const notes = recorder.current.stop();
      takeRef.current = notes;
      setTake(notes);
      rollNotes.current = notes.map((n) => ({ midi: n.midi, startMs: n.startMs, endMs: n.endMs, velocity: n.velocity, kind: "played" }));
      rollNow.current = 0;
      setLatency(notes.length ? Math.round(Math.min(...notes.map((n) => n.startMs))) : null);
      setRating(0);
      setSaved(false);
      setPhase("review");
      getEngine().stopAll();
    }, countInMs + takeMs.current + 150);
  }, [scheduleBed]);

  const next = useCallback(async () => {
    clearTimers();
    const s = settingsRef.current;
    const p = generatePrompt({ key: s.promptKey, bpmMin: s.promptBpmMin, bpmMax: s.promptBpmMax, bars: s.promptBars, sevenths: s.promptSevenths, mood: s.promptMood, seed: s.promptSeed });
    setPrompt(p);
    setPhase("imagine");
    if (p.seed) {
      const engine = getEngine();
      await engine.resume();
      engine.stopAll();
      engine.playNotes(p.seed.map((n) => ({ instrumentId: s.instrumentId, midi: n.midi, at: beatsToMs(n.start, p.bpm) / 1000, duration: Math.max(0.12, (beatsToMs(n.duration, p.bpm) / 1000) * 0.9), velocity: 90 }))).catch(() => {});
    }
    let left = s.promptCountdownSec;
    setCountdown(left);
    const tickDown = () => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) beginTake(p).catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
      else later(tickDown, 1000);
    };
    later(tickDown, 1000);
  }, [settingsRef, beginTake]);

  const start = useCallback(async () => {
    await getEngine().resume();
    getMidi().init();
    historyRef.current = [];
    setHistory([]);
    startSession({ mode: "prompt", settings: settingsRef.current })
      .then((id) => {
        sessionId.current = id;
      })
      .catch(() => {});
    await next();
  }, [settingsRef, next]);

  // MIDI → recorder while counting in / taking
  useEffect(() => getMidi().subscribe((ev) => recorder.current.handle(ev)), []);

  const playBack = useCallback(async () => {
    const p = promptRef.current;
    const notes = takeRef.current;
    if (!p) return;
    const s = settingsRef.current;
    const engine = getEngine();
    await engine.resume();
    engine.stopAll();
    const beatSec = 60 / p.bpm;
    const events: { instrumentId: string; midi: number; at: number; duration: number; velocity: number }[] = notes.map((n) => ({ instrumentId: s.instrumentId, midi: n.midi, at: Math.max(0, n.startMs) / 1000, duration: Math.max(0.1, ((n.endMs ?? n.startMs + 300) - n.startMs) / 1000), velocity: n.velocity }));
    if (s.promptClick) events.push(...clickEvents({ bpm: p.bpm, beats: p.bars * 4, soft: true }));
    if (s.promptBacking) for (const b of backingNotes(p)) events.push({ instrumentId: s.instrumentId, midi: b.midi, at: b.startBeat * beatSec, duration: b.durationBeats * beatSec * 0.95, velocity: 40 });
    await engine.playNotes(events);
    const t0 = performance.now() + 50;
    cancelAnimationFrame(raf.current);
    const tick = () => {
      rollNow.current = performance.now() - t0;
      if (rollNow.current < takeMs.current) raf.current = requestAnimationFrame(tick);
      else rollNow.current = 0;
    };
    raf.current = requestAnimationFrame(tick);
  }, [promptRef, settingsRef]);

  const rate = useCallback(
    (r: number) => {
      const p = promptRef.current;
      if (!p || phaseRef.current !== "review") return;
      const notes = takeRef.current;
      const lat = notes.length ? Math.round(Math.min(...notes.map((n) => n.startMs))) : null;
      const attempt: Attempt = { prompt: p, notes, latencyMs: lat, rating: r };
      historyRef.current = [...historyRef.current, attempt];
      setHistory(historyRef.current);
      setRating(r);
      setPhase("rated");
      logAttempt({
        sessionId: sessionId.current,
        mode: "prompt",
        instrumentId: settingsRef.current.instrumentId,
        target: { tonic: p.tonic, minor: p.minor, key: keyName(p.tonic, p.minor), bpm: p.bpm, bars: p.bars, roman: p.chords.map((c) => c.roman), mood: p.mood, seed: !!p.seed },
        answer: { rating: r, latencyMs: lat, notes: notes.length, durationMs: Math.round(recordingDurationMs(notes)) },
        correct: r >= 4,
        score: r / 5,
        responseMs: Math.max(0, lat ?? 0),
        replays: 0,
        ...levelTags("compose"),
      }).catch(() => {});
    },
    [promptRef, phaseRef, settingsRef]
  );

  const save = useCallback(async () => {
    const p = promptRef.current;
    if (!p || !takeRef.current.length) return;
    try {
      await saveRecording({ name: `Prompt · ${p.text.slice(0, 40)}`, instrumentId: settingsRef.current.instrumentId, bpm: p.bpm, durationMs: Math.round(recordingDurationMs(takeRef.current)), events: takeRef.current, sourceRef: JSON.stringify({ prompt: p.text }) });
      setSaved(true);
      toast.success("Take saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [promptRef, settingsRef]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const p = phaseRef.current;
      if (e.code === "Space" || e.key === "Enter") {
        claimKey(e);
        if (p === "idle" || p === "ended") start();
        else if (p === "rated") next();
        else if (p === "review" && e.key === "Enter") playBack();
      } else if (/^[1-5]$/.test(e.key) && p === "review") {
        rate(Number(e.key));
      } else if (e.key.toUpperCase() === "P" && (p === "review" || p === "rated")) {
        playBack();
      } else if (e.key === "Escape") {
        if (p !== "idle" && p !== "ended") finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phaseRef, start, next, rate, playBack, finish]);

  useEffect(() => () => clearTimers(), []);

  const avgRating = history.length ? history.reduce((a, h) => a + h.rating, 0) / history.length : 0;
  const lats = history.filter((h) => h.latencyMs !== null).map((h) => h.latencyMs!);
  const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;
  const rollRange = useMemo<[number, number]>(() => {
    if (!take.length) return [36, 96];
    const ms = take.map((n) => n.midi);
    return [Math.max(21, Math.min(...ms) - 4), Math.min(108, Math.max(...ms) + 4)];
  }, [take]);
  const inDrill = phase !== "idle" && phase !== "ended";

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Prompt drill</CardTitle>
              <CardDescription>
                {phase === "idle" && "Imagine four bars against a prompt, then play them in one take. Press Space or Start."}
                {phase === "imagine" && `Imagine it. ${countdown}…`}
                {phase === "countin" && "Count-in. Play on the next downbeat."}
                {phase === "take" && "Recording."}
                {phase === "review" && "Listen back, then rate yourself 1–5."}
                {phase === "rated" && "Logged. Space for the next prompt."}
                {phase === "ended" && "Session finished."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm tabular-nums">
              <Badge variant="secondary">{history.length} takes</Badge>
              {history.length > 0 && <Badge variant="outline">avg {avgRating.toFixed(1)}/5</Badge>}
              {avgLat !== null && <Badge variant="outline">first note ≈ {avgLat} ms</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {!inDrill ? (
              <Button size="lg" onClick={start}>
                <PlayIcon /> {phase === "ended" ? "Again" : "Start"} <Kbd>Space</Kbd>
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={next} disabled={phase !== "rated"}>
                  <PlayIcon /> Next prompt <Kbd>Space</Kbd>
                </Button>
                {(phase === "review" || phase === "rated") && (
                  <>
                    <Button size="lg" variant="outline" onClick={playBack} disabled={!take.length}>
                      <Volume2Icon /> Play back <Kbd>P</Kbd>
                    </Button>
                    <Button size="lg" variant="outline" onClick={save} disabled={!take.length || saved}>
                      <SaveIcon /> {saved ? "Saved" : "Save take"}
                    </Button>
                  </>
                )}
                <Button size="lg" variant="ghost" onClick={finish} className="ml-auto">
                  <SquareIcon /> End <Kbd>Esc</Kbd>
                </Button>
              </>
            )}
          </div>

          {prompt && inDrill && (
            <div className={cn("rounded-lg border px-4 py-3", phase === "imagine" && "border-primary/50 bg-primary/5")}>
              <div className="text-xs text-muted-foreground">Prompt</div>
              <div className="text-lg font-semibold">{prompt.text}</div>
              {phase === "imagine" && <div className="mt-2 text-4xl font-semibold tabular-nums">{countdown}</div>}
              {phase === "countin" && <div className="mt-2 text-2xl font-semibold text-primary">1 · 2 · 3 · 4</div>}
              {phase === "take" && (
                <Badge variant="destructive" className="mt-2 animate-pulse">
                  REC
                </Badge>
              )}
            </div>
          )}

          {(phase === "take" || phase === "review" || phase === "rated") && prompt && (
            <>
              <PianoRoll notesRef={rollNotes} nowRef={rollNow} mode="static" durationMs={takeMs.current} low={rollRange[0]} high={rollRange[1]} height={220} />
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{take.length} notes</span>
                {latency !== null && <span>first note {latency >= 0 ? `${latency} ms after` : `${-latency} ms before`} the downbeat</span>}
                {latency === null && phase !== "take" && <span>nothing played</span>}
              </div>
            </>
          )}

          {(phase === "review" || phase === "rated") && (
            <div className="flex flex-col gap-2">
              <div className="text-sm">How close was it to what you imagined?</div>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((r) => (
                  <Button key={r} variant="outline" disabled={phase !== "review"} onClick={() => rate(r)} className={cn("h-12 min-w-24 flex-col gap-0", rating === r && "border-primary bg-primary/15")}>
                    <span className="text-base font-semibold">
                      {r} <Kbd className="ml-1">{r}</Kbd>
                    </span>
                    <span className="text-[10px] text-muted-foreground">{RATING_WORDS[r]}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {phase === "ended" && history.length > 0 && (
        <SessionSummary
          total={history.length}
          correct={history.filter((h) => h.rating >= 4).length}
          avgScore={avgRating / 5}
          avgMs={avgLat ?? 0}
          breakdowns={[
            { title: "By key", rows: rowsFrom(history, (h) => keyName(h.prompt.tonic, h.prompt.minor), (h) => h.rating >= 4) },
            { title: "By mood", rows: rowsFrom(history, (h) => h.prompt.mood || "no mood", (h) => h.rating >= 4) },
            { title: "By tempo", rows: rowsFrom(history, (h) => `${Math.floor(h.prompt.bpm / 10) * 10}s bpm`, (h) => h.rating >= 4, "label") },
            { title: "By tonic", rows: rowsFrom(history, (h) => PITCH_CLASS_SHORT[h.prompt.tonic], (h) => h.rating >= 4, "label") },
          ]}
        />
      )}
    </div>
  );
}
