"use client";

/**
 * Hear It, Play It: the app plays a phrase it knows exactly, you play it back on the USB piano,
 * it grades pitch (and optionally rhythm) with alignment and shows a piano-roll diff.
 * Drills: echo (random phrase), ladder (length grows with success), chunk (walk through a piece).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { claimKey } from "@/lib/keys";
import { toast } from "sonner";
import { CheckIcon, XIcon, PlayIcon, RotateCcwIcon, SquareIcon, Volume2Icon, EyeIcon, SkipForwardIcon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { instrumentLabel } from "@/lib/audio/instruments";
import { getMidi, useMidiStore } from "@/lib/midi/midi";
import { beatsToMs, phraseDurationBeats, type Phrase } from "@/lib/music/score";
import { noteName } from "@/lib/music/notes";
import { gradePerformance, type GradeResult, type PlayedNote } from "@/lib/trainer/grade";
import { useTranscribeSettings } from "@/lib/transcribe/settings";
import { generatedPhrase, loadSourcePiece, piecePhrases } from "@/lib/transcribe/sources";
import { endSession, getPieceProgress, logAttempt, recordPhraseResult, startSession } from "@/lib/db/actions";
import { levelTags } from "@/lib/practice/level-run";
import { useLatest } from "@/lib/hooks/use-latest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PianoRoll, RollLegend, type RollNote } from "@/components/piano-roll";
import { PianoKeyboard, type KeyHighlight } from "@/components/piano-keyboard";
import { FeedbackBanner } from "@/components/trainer/quiz-shell";
import { cn } from "@/lib/utils";

type Phase = "idle" | "loading" | "listening" | "recording" | "graded" | "ended";

interface Attempt {
  phrase: Phrase;
  result: GradeResult;
  bars: number;
  responseMs: number;
}

const MAX_BARS = 8;

function phraseBars(p: Phrase) {
  return Math.max(1, Math.round((p.endBeat - p.startBeat) / p.beatsPerBar));
}

export function TranscribeTrainer() {
  const settings = useTranscribeSettings((s) => s.settings);
  const settingsRef = useLatest(settings);

  const [phase, setPhase] = useState<Phase>("idle");
  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [played, setPlayed] = useState<PlayedNote[]>([]);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [bars, setBars] = useState(1);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [status, setStatus] = useState<string>("");

  const phaseRef = useLatest(phase);
  const phraseRef = useLatest(phrase);
  const barsRef = useLatest(bars);
  const chunkRef = useLatest(chunkIndex);
  const playedRef = useRef<PlayedNote[]>([]);
  const openNotes = useRef(new Map<number, PlayedNote>());
  const recordStart = useRef(0);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionId = useRef<number | null>(null);
  const historyRef = useRef<Attempt[]>([]);
  const midiHeld = useMidiStore((s) => s.held);

  const clearTimers = () => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (listenTimer.current) clearTimeout(listenTimer.current);
    silenceTimer.current = null;
    listenTimer.current = null;
  };

  // ----- playback -----
  const playPhrase = useCallback(async (p: Phrase, onDone?: () => void) => {
    const s = settingsRef.current;
    const engine = getEngine();
    await engine.resume();
    const total = await engine.playNotes(
      p.notes.map((n) => ({ instrumentId: s.instrumentId, midi: n.midi, at: beatsToMs(n.start, p.bpm) / 1000, duration: Math.max(0.12, beatsToMs(n.duration, p.bpm) / 1000) * 0.95, velocity: n.velocity ?? 90 }))
    );
    if (onDone) {
      if (listenTimer.current) clearTimeout(listenTimer.current);
      listenTimer.current = setTimeout(onDone, total * 1000 + 250);
    }
  }, [settingsRef]);

  const playTake = useCallback(async (p: Phrase, take: PlayedNote[]) => {
    if (!take.length) return;
    const s = settingsRef.current;
    const t0 = take[0].timeMs;
    await getEngine().playNotes(
      take.map((n) => ({ instrumentId: s.instrumentId, midi: n.midi, at: (n.timeMs - t0) / 1000, duration: Math.max(0.12, (n.durationMs ?? beatsToMs(0.6, p.bpm)) / 1000), velocity: n.velocity ?? 90 }))
    );
  }, [settingsRef]);

  // ----- building phrases -----
  const buildPhrase = useCallback(async (): Promise<Phrase> => {
    const s = settingsRef.current;
    const b = s.drill === "ladder" ? barsRef.current : s.source === "generated" ? s.genBars : s.phraseBars;
    if (s.source === "generated") return generatedPhrase(s, b);
    const piece = await loadSourcePiece(s);
    if (!piece) throw new Error("No piece");
    const phrases = piecePhrases(piece, s, b);
    if (!phrases.length) throw new Error("That piece has no notes in the selected voices");
    if (s.drill === "chunk") {
      const idx = Math.min(chunkRef.current, phrases.length - 1);
      setChunkTotal(phrases.length);
      return phrases[idx];
    }
    return phrases[Math.floor(Math.random() * phrases.length)];
  }, [settingsRef, barsRef, chunkRef]);

  // ----- flow -----
  const finish = useCallback(() => {
    clearTimers();
    getEngine().stopAll();
    setPhase("ended");
    if (sessionId.current) endSession(sessionId.current).catch(() => {});
    sessionId.current = null;
  }, []);

  const startRecording = useCallback(() => {
    playedRef.current = [];
    openNotes.current.clear();
    setPlayed([]);
    recordStart.current = performance.now();
    setPhase("recording");
    setStatus("Your turn. Play it back.");
  }, []);

  const next = useCallback(async () => {
    clearTimers();
    setPhase("loading");
    setResult(null);
    setPlayed([]);
    playedRef.current = [];
    try {
      const p = await buildPhrase();
      setPhrase(p);
      phraseRef.current = p;
      setPhase("listening");
      setStatus("Listen…");
      await playPhrase(p, startRecording);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }, [buildPhrase, playPhrase, startRecording, phraseRef]);

  const start = useCallback(async () => {
    const s = settingsRef.current;
    historyRef.current = [];
    setHistory([]);
    setBars(s.drill === "ladder" ? 1 : s.source === "generated" ? s.genBars : s.phraseBars);
    barsRef.current = s.drill === "ladder" ? 1 : s.source === "generated" ? s.genBars : s.phraseBars;
    if (s.drill === "chunk" && s.source !== "generated") {
      // resume where you left off: first phrase not yet passed
      try {
        const piece = await loadSourcePiece(s);
        if (piece) {
          const phrases = piecePhrases(piece, s, s.phraseBars);
          const progress = await getPieceProgress(piece.id);
          const passed = new Set(progress.filter((p) => p.bestScore >= s.passThreshold).map((p) => p.phraseIndex));
          let idx = 0;
          while (idx < phrases.length - 1 && passed.has(idx)) idx++;
          setChunkIndex(idx);
          chunkRef.current = idx;
          setChunkTotal(phrases.length);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    startSession({ mode: "transcribe", settings: s })
      .then((id) => {
        sessionId.current = id;
      })
      .catch(() => {});
    await next();
  }, [settingsRef, barsRef, chunkRef, next]);

  const submit = useCallback(() => {
    const p = phraseRef.current;
    if (!p || phaseRef.current !== "recording") return;
    clearTimers();
    const s = settingsRef.current;
    // close notes still held
    const now = performance.now() - recordStart.current;
    for (const n of openNotes.current.values()) if (n.durationMs === undefined) n.durationMs = Math.max(30, now - n.timeMs);
    openNotes.current.clear();
    const take = [...playedRef.current];
    const r = gradePerformance(p.notes, take, p.bpm, { rhythm: s.rhythm, rhythmToleranceBeats: s.rhythmTolerance, octaveInsensitive: s.octaveInsensitive });
    const responseMs = now;
    setResult(r);
    setPlayed(take);
    setPhase("graded");
    setStatus(r.correct ? "Nailed it." : `${Math.round(r.pitchScore * 100)}% of the notes.`);
    const b = phraseBars(p);
    const attempt: Attempt = { phrase: p, result: r, bars: b, responseMs };
    historyRef.current = [...historyRef.current, attempt];
    setHistory(historyRef.current);

    logAttempt({
      sessionId: sessionId.current,
      mode: "transcribe",
      instrumentId: s.instrumentId,
      target: { source: s.source, pieceId: p.pieceId ?? null, phraseIndex: p.phraseIndex ?? null, bars: b, voices: p.voices.length, notes: p.notes.length, drill: s.drill, label: p.label },
      answer: { played: take.length, matched: r.matched, wrong: r.wrong, missing: r.missing, extra: r.extra, pitchScore: r.pitchScore, rhythmScore: r.rhythmScore, msPerBeat: r.msPerBeat },
      correct: r.correct,
      score: r.score,
      responseMs,
      replays: 0,
      ...levelTags("transcribe"),
    }).catch(() => {});

    if (s.drill === "chunk" && p.pieceId && p.phraseIndex !== undefined) recordPhraseResult(p.pieceId, p.phraseIndex, r.score).catch(() => {});

    // ladder: grow on pass, shrink on miss
    if (s.drill === "ladder") {
      const passed = r.score >= s.passThreshold;
      const nb = Math.max(1, Math.min(MAX_BARS, barsRef.current + (passed ? 1 : -1)));
      setBars(nb);
      barsRef.current = nb;
    }
    if (s.drill === "chunk" && r.score >= s.passThreshold) {
      const ni = chunkRef.current + 1;
      setChunkIndex(ni);
      chunkRef.current = ni;
    }
    // Right: move on after a short pause. Wrong: hold the diff until Space / Enter / click.
    if (s.autoProceed && r.correct) listenTimer.current = setTimeout(() => next(), 1200);
  }, [phraseRef, phaseRef, settingsRef, barsRef, chunkRef, next]);

  const giveUp = useCallback(() => {
    if (phaseRef.current !== "recording") return;
    playedRef.current = [];
    submit();
  }, [phaseRef, submit]);

  const hearAgain = useCallback(() => {
    const p = phraseRef.current;
    if (!p) return;
    const s = settingsRef.current;
    if (phaseRef.current === "recording" && s.oneListen) {
      toast("One listen only in this drill");
      return;
    }
    if (phaseRef.current === "recording") {
      // restart the take after the replay
      clearTimers();
      setPhase("listening");
      setStatus("Listening again…");
      playPhrase(p, startRecording);
      return;
    }
    playPhrase(p);
  }, [phraseRef, phaseRef, settingsRef, playPhrase, startRecording]);

  // ----- USB piano capture -----
  useEffect(() => {
    getMidi().init();
    return getMidi().subscribe((ev) => {
      if (ev.type === "cc") return;
      if (phaseRef.current !== "recording") return;
      const t = performance.now() - recordStart.current;
      if (ev.type === "noteon") {
        const n: PlayedNote = { midi: ev.note, timeMs: t, velocity: ev.velocity };
        playedRef.current.push(n);
        openNotes.current.set(ev.note, n);
        setPlayed([...playedRef.current]);
        // auto-submit after silence once enough notes are in
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        const s = settingsRef.current;
        const need = phraseRef.current?.notes.length ?? 0;
        if (playedRef.current.length >= need) silenceTimer.current = setTimeout(() => submit(), s.autoSubmitSilenceMs);
      } else {
        const n = openNotes.current.get(ev.note);
        if (n) {
          n.durationMs = Math.max(30, t - n.timeMs);
          openNotes.current.delete(ev.note);
        }
      }
    });
  }, [phaseRef, phraseRef, settingsRef, submit]);

  // ----- keyboard -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const p = phaseRef.current;
      if (e.code === "Space") {
        claimKey(e);
        if (p === "idle" || p === "ended") start();
        else if (p === "graded") next();
        else if (p === "recording") hearAgain();
      } else if (e.key === "Enter") {
        if (p === "recording") {
          e.preventDefault();
          submit();
        } else if (p === "graded") {
          e.preventDefault();
          next();
        }
      } else if (e.key.toUpperCase() === "R") {
        hearAgain();
      } else if (e.key === "Escape") {
        if (p !== "idle" && p !== "ended") finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phaseRef, start, next, hearAgain, submit, finish]);

  useEffect(() => () => clearTimers(), []);

  // ----- roll data -----
  const rollDurationMs = useMemo(() => (phrase ? beatsToMs(Math.max(phraseDurationBeats(phrase), phrase.endBeat - phrase.startBeat), phrase.bpm) + 300 : 4000), [phrase]);
  const rollNotes = useMemo<RollNote[]>(() => {
    if (!phrase) return [];
    const bpm = phrase.bpm;
    const out: RollNote[] = [];
    if (phase === "graded" && result) {
      for (const a of result.refs) {
        out.push({ midi: a.ref.midi, startMs: beatsToMs(a.ref.start, bpm), endMs: beatsToMs(a.ref.start + a.ref.duration, bpm), kind: a.status === "missing" ? "missing" : "ghost" });
      }
      for (const p of result.playedOnTimeline) {
        const startMs = beatsToMs(p.beat, bpm);
        const durMs = p.played.durationMs !== undefined && result.msPerBeat ? (p.played.durationMs / result.msPerBeat) * (60000 / bpm) : beatsToMs(0.5, bpm);
        out.push({ midi: p.played.midi, startMs, endMs: startMs + Math.max(80, durMs), kind: p.status === "matched" ? "correct" : p.status === "wrong" ? "wrong" : "extra", velocity: p.played.velocity });
      }
    } else {
      // while listening / recording: show the reference only after it has been graded, unless the take is in progress (show what you played so far)
      if (phase === "recording") {
        const msPerBeat = 60000 / bpm;
        for (const p of played) out.push({ midi: p.midi, startMs: p.timeMs, endMs: p.timeMs + (p.durationMs ?? msPerBeat * 0.5), kind: "played" });
      }
    }
    return out;
  }, [phrase, phase, result, played]);
  const notesRef = useLatest<RollNote[]>(rollNotes);
  const nowRef = useRef(0);

  const rollRange = useMemo<[number, number]>(() => {
    const all = [...(phrase?.notes.map((n) => n.midi) ?? []), ...played.map((p) => p.midi)];
    if (!all.length) return [48, 84];
    return [Math.max(21, Math.min(...all) - 4), Math.min(108, Math.max(...all) + 4)];
  }, [phrase, played]);

  const highlights = useMemo(() => {
    const h: Partial<Record<number, KeyHighlight>> = {};
    for (const m of midiHeld) h[m] = "pressed";
    if (phase === "graded" && result) for (const a of result.refs) if (a.status !== "matched") h[a.ref.midi] = "target";
    return h;
  }, [midiHeld, phase, result]);

  const inDrill = phase !== "idle" && phase !== "ended";
  const totalAttempts = history.length;
  const passedCount = history.filter((h) => h.result.score >= settings.passThreshold).length;
  const bestBars = history.filter((h) => h.result.score >= settings.passThreshold).reduce((m, h) => Math.max(m, h.bars), 0);

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>
                {settings.drill === "ladder" ? "Ladder" : settings.drill === "chunk" ? "Chunk mode" : "Phrase echo"}
                {settings.oneListen && <Badge variant="outline" className="ml-2">one listen</Badge>}
                {settings.rhythm && <Badge variant="outline" className="ml-2">rhythm graded</Badge>}
              </CardTitle>
              <CardDescription>
                {phase === "idle" && "The app plays a phrase, you play it back on the piano. Press Space or Start."}
                {phase === "loading" && "Loading…"}
                {(phase === "listening" || phase === "recording" || phase === "graded") && status}
                {phase === "ended" && "Drill finished."}
                {phrase && phase !== "idle" && phase !== "ended" && <span className="ml-1 text-muted-foreground">· {phrase.label} · {phrase.notes.length} notes</span>}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">
                {passedCount}/{totalAttempts} passed
              </Badge>
              {settings.drill === "ladder" && <Badge variant="outline">{bars} bar{bars === 1 ? "" : "s"}</Badge>}
              {settings.drill === "chunk" && chunkTotal > 0 && (
                <Badge variant="outline">
                  phrase {Math.min(chunkIndex + 1, chunkTotal)}/{chunkTotal}
                </Badge>
              )}
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
                <Button size="lg" onClick={next} disabled={phase !== "graded"}>
                  <SkipForwardIcon /> Next phrase <Kbd>Space</Kbd> <Kbd>Enter</Kbd>
                </Button>
                <Button size="lg" variant="outline" onClick={hearAgain} disabled={phase === "loading" || phase === "listening"}>
                  <RotateCcwIcon /> Hear again <Kbd>R</Kbd>
                </Button>
                {phase === "recording" && (
                  <>
                    <Button size="lg" variant="outline" onClick={submit} disabled={played.length === 0}>
                      <CheckIcon /> Done <Kbd>Enter</Kbd>
                    </Button>
                    <Button size="lg" variant="ghost" onClick={giveUp}>
                      <EyeIcon /> Show me
                    </Button>
                  </>
                )}
                {phase === "graded" && phrase && played.length > 0 && (
                  <Button size="lg" variant="outline" onClick={() => playTake(phrase, played)}>
                    <Volume2Icon /> Hear my take
                  </Button>
                )}
                <Button size="lg" variant="ghost" onClick={finish} className="ml-auto">
                  <SquareIcon /> End <Kbd>Esc</Kbd>
                </Button>
              </>
            )}
          </div>

          {phase === "graded" && result && phrase && (
            <FeedbackBanner correct={result.correct} partial={result.score > 0}>
              {result.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
              <div className="text-2xl font-semibold tabular-nums">{Math.round(result.score * 100)}%</div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{result.matched} matched</Badge>
                {result.wrong > 0 && <Badge variant="destructive">{result.wrong} wrong</Badge>}
                {result.missing > 0 && <Badge variant="outline">{result.missing} missed</Badge>}
                {result.extra > 0 && <Badge variant="outline">{result.extra} extra</Badge>}
                {result.rhythmScore !== null && <Badge variant="outline">rhythm {Math.round(result.rhythmScore * 100)}%</Badge>}
                {result.msPerBeat && <Badge variant="outline">your tempo ≈ {Math.round(60000 / result.msPerBeat)} bpm</Badge>}
              </div>
              <div className="ml-auto text-sm text-muted-foreground">
                {instrumentLabel(settings.instrumentId)} · {(result.playedOnTimeline.length && Math.round(history[history.length - 1]?.responseMs / 100) / 10) || 0}s
              </div>
            </FeedbackBanner>
          )}

          <PianoRoll notesRef={notesRef} nowRef={nowRef} mode="static" durationMs={rollDurationMs} low={rollRange[0]} high={rollRange[1]} height={260} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <RollLegend kinds={phase === "graded" ? ["ghost", "correct", "wrong", "missing", "extra"] : ["played"]} />
            {phase === "recording" && (
              <span className="text-xs text-muted-foreground">
                {played.length}/{phrase?.notes.length ?? 0} notes · auto-grades after {(settings.autoSubmitSilenceMs / 1000).toFixed(1)}s of silence
              </span>
            )}
          </div>
          <PianoKeyboard low={rollRange[0]} high={rollRange[1]} highlights={highlights} height={70} labels="c" />
        </CardContent>
      </Card>

      {phase === "ended" && history.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>
                {passedCount} of {totalAttempts} phrases passed
              </CardTitle>
              <CardDescription>
                Average {Math.round((history.reduce((a, h) => a + h.result.score, 0) / history.length) * 100)}% · longest phrase passed: {bestBars || "–"} bar{bestBars === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>By phrase length</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bars</TableHead>
                    <TableHead className="text-right">Tries</TableHead>
                    <TableHead className="text-right">Passed</TableHead>
                    <TableHead className="text-right">Avg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...new Set(history.map((h) => h.bars))]
                    .sort((a, b) => a - b)
                    .map((b) => {
                      const hs = history.filter((h) => h.bars === b);
                      return (
                        <TableRow key={b}>
                          <TableCell>{b}</TableCell>
                          <TableCell className="text-right">{hs.length}</TableCell>
                          <TableCell className="text-right">{hs.filter((h) => h.result.score >= settings.passThreshold).length}</TableCell>
                          <TableCell className="text-right">{Math.round((hs.reduce((a, h) => a + h.result.score, 0) / hs.length) * 100)}%</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card size="sm" className="md:col-span-2">
            <CardHeader>
              <CardTitle>Attempts</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phrase</TableHead>
                    <TableHead className="text-right">Notes</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Misses</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...history].reverse().map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-64 truncate">{h.phrase.label}</TableCell>
                      <TableCell className="text-right">{h.phrase.notes.length}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", h.result.score >= settings.passThreshold ? "text-green-600 dark:text-green-400" : "")}>{Math.round(h.result.score * 100)}%</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {h.result.refs
                          .filter((r) => r.status !== "matched")
                          .slice(0, 8)
                          .map((r) => `${noteName(r.ref.midi)}${r.status === "wrong" && r.played ? `→${noteName(r.played.midi)}` : " missed"}`)
                          .join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
