"use client";

/**
 * Shadow mode: the piece plays continuously and you play along on the USB piano. The roll scrolls
 * with the reference as ghost notes; your notes land on top and are matched live against the
 * reference within a time window (optionally lagged by a beat or more). Live accuracy updates as
 * you go.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { claimKey } from "@/lib/keys";
import { toast } from "sonner";
import { PlayIcon, SquareIcon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { getMidi } from "@/lib/midi/midi";
import { beatsToMs, pieceNotes, type Piece, type ScoreNote } from "@/lib/music/score";
import { useTranscribeSettings } from "@/lib/transcribe/settings";
import { effectiveVoices, loadSourcePiece } from "@/lib/transcribe/sources";
import { logAttempt } from "@/lib/db/actions";
import { levelTags } from "@/lib/practice/level-run";
import { useLatest } from "@/lib/hooks/use-latest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { PianoRoll, RollLegend, type RollNote } from "@/components/piano-roll";

type Phase = "idle" | "loading" | "countin" | "playing" | "done";

interface RefNote extends ScoreNote {
  timeMs: number;
  claimed: boolean;
}

export function ShadowMode() {
  const settings = useTranscribeSettings((s) => s.settings);
  const settingsRef = useLatest(settings);
  const [phase, setPhase] = useState<Phase>("idle");
  const [piece, setPiece] = useState<Piece | null>(null);
  const [stats, setStats] = useState({ matched: 0, wrong: 0, passed: 0, extra: 0 });
  const phaseRef = useLatest(phase);

  const refNotes = useRef<RefNote[]>([]);
  const rollNotes = useRef<RollNote[]>([]);
  const nowRef = useRef(0);
  const startPerf = useRef(0);
  const raf = useRef(0);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef(10000);
  const [range, setRange] = useState<[number, number]>([36, 96]);
  const liveStats = useRef({ matched: 0, wrong: 0, extra: 0 });

  const stop = useCallback((finished = false) => {
    cancelAnimationFrame(raf.current);
    if (endTimer.current) clearTimeout(endTimer.current);
    getEngine().stopAll();
    const refs = refNotes.current;
    const s = settingsRef.current;
    const passed = refs.filter((r) => r.timeMs + s.shadowWindowMs <= nowRef.current).length;
    const st = { ...liveStats.current, passed };
    setStats(st);
    setPhase("done");
    if (finished || passed > 8) {
      logAttempt({
        sessionId: null,
        mode: "shadow",
        instrumentId: s.instrumentId,
        target: { pieceId: piece?.id ?? null, voices: refs.length ? [...new Set(refs.map((r) => r.voice))] : [], notes: refs.length, lagBeats: s.shadowLagBeats },
        answer: { matched: st.matched, wrong: st.wrong, extra: st.extra, passed },
        correct: passed > 0 && st.matched === passed && st.wrong === 0 && st.extra === 0,
        score: passed ? st.matched / passed : 0,
        responseMs: Math.round(nowRef.current),
        ...levelTags("transcribe"),
      }).catch(() => {});
    }
  }, [settingsRef, piece]);

  const start = useCallback(async () => {
    const s = settingsRef.current;
    setPhase("loading");
    let p: Piece | null = null;
    try {
      p = await loadSourcePiece(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setPhase("idle");
      return;
    }
    if (!p) {
      toast.error("Shadow mode needs a piece: choose a Bach chorale or an uploaded MIDI in the settings.");
      setPhase("idle");
      return;
    }
    setPiece(p);
    const bpm = Math.round(p.bpm * s.tempoScale);
    const notes = pieceNotes(p, effectiveVoices(p, s.voices));
    const countIn = beatsToMs(p.beatsPerBar, bpm);
    refNotes.current = notes.map((n) => ({ ...n, timeMs: countIn + beatsToMs(n.start, bpm), claimed: false }));
    rollNotes.current = refNotes.current.map((n) => ({ midi: n.midi, startMs: n.timeMs, endMs: n.timeMs + beatsToMs(n.duration, bpm), kind: "ghost", velocity: n.velocity }));
    liveStats.current = { matched: 0, wrong: 0, extra: 0 };
    setStats({ matched: 0, wrong: 0, passed: 0, extra: 0 });
    const total = countIn + beatsToMs(p.totalBeats, bpm) + 1500;
    durationRef.current = total;
    const midis = notes.map((n) => n.midi);
    setRange([Math.max(21, Math.min(...midis) - 4), Math.min(108, Math.max(...midis) + 4)]);

    const engine = getEngine();
    await engine.resume();
    await engine.load(s.instrumentId);
    // count-in clicks on a woodblock-like short note, then the piece
    const clickInst = "gm:woodblock";
    engine.load(clickInst).catch(() => {});
    const events = [
      ...Array.from({ length: p.beatsPerBar }, (_, i) => ({ instrumentId: clickInst, midi: i === 0 ? 76 : 72, at: beatsToMs(i, bpm) / 1000, duration: 0.1, velocity: 90 })),
      ...notes.map((n) => ({ instrumentId: s.instrumentId, midi: n.midi, at: (countIn + beatsToMs(n.start, bpm)) / 1000, duration: Math.max(0.12, beatsToMs(n.duration, bpm) / 1000) * 0.95, velocity: n.velocity ?? 85 })),
    ];
    startPerf.current = performance.now() + 60;
    setPhase("playing");
    await engine.playNotes(events);
    const tick = () => {
      nowRef.current = performance.now() - startPerf.current;
      if (nowRef.current >= durationRef.current) {
        stop(true);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [settingsRef, stop]);

  // live matching of what you play
  useEffect(() => {
    getMidi().init();
    return getMidi().subscribe((ev) => {
      if (ev.type !== "noteon" || phaseRef.current !== "playing") return;
      const s = settingsRef.current;
      const bpm = Math.round((piece?.bpm ?? 100) * s.tempoScale);
      const t = performance.now() - startPerf.current;
      const refTime = t - beatsToMs(s.shadowLagBeats, bpm); // where in the reference this note "belongs"
      const win = s.shadowWindowMs;
      // nearest unclaimed reference note of the same pitch within the window
      let best: RefNote | null = null;
      for (const r of refNotes.current) {
        if (r.claimed || r.midi !== ev.note) continue;
        const d = Math.abs(r.timeMs - refTime);
        if (d <= win && (!best || d < Math.abs(best.timeMs - refTime))) best = r;
      }
      let kind: RollNote["kind"];
      if (best) {
        best.claimed = true;
        liveStats.current.matched++;
        kind = "correct";
      } else {
        // a reference note of another pitch nearby → wrong; nothing nearby → extra
        const near = refNotes.current.some((r) => !r.claimed && Math.abs(r.timeMs - refTime) <= win);
        if (near) liveStats.current.wrong++;
        else liveStats.current.extra++;
        kind = near ? "wrong" : "extra";
      }
      rollNotes.current.push({ midi: ev.note, startMs: t, endMs: t + beatsToMs(0.4, bpm), kind, velocity: ev.velocity });
      const passed = refNotes.current.filter((r) => r.timeMs + win <= refTime).length;
      setStats({ ...liveStats.current, passed });
    });
  }, [phaseRef, settingsRef, piece]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        claimKey(e);
        if (phaseRef.current === "idle" || phaseRef.current === "done") start();
        else if (phaseRef.current === "playing") stop(false);
      } else if (e.key === "Escape" && phaseRef.current === "playing") stop(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phaseRef, start, stop]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const accuracy = stats.passed ? Math.round((100 * stats.matched) / stats.passed) : null;
  const pxPerSecond = useMemo(() => 110, []);

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Shadow mode</CardTitle>
            <CardDescription>
              {phase === "idle" && "The piece plays straight through; you play along. One bar of count-in. Reference notes scroll in as ghosts; yours land on top."}
              {phase === "loading" && "Loading…"}
              {phase === "playing" && `${piece?.name ?? ""} · playing ${settings.shadowLagBeats} beat${settings.shadowLagBeats === 1 ? "" : "s"} behind`}
              {phase === "done" && `${piece?.name ?? ""} · finished`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{accuracy === null ? "–" : `${accuracy}%`} live</Badge>
            <Badge variant="outline">{stats.matched} matched</Badge>
            {stats.wrong > 0 && <Badge variant="destructive">{stats.wrong} wrong</Badge>}
            {stats.extra > 0 && <Badge variant="outline">{stats.extra} extra</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {phase === "playing" ? (
            <Button size="lg" variant="destructive" onClick={() => stop(false)}>
              <SquareIcon /> Stop <Kbd>Esc</Kbd>
            </Button>
          ) : (
            <Button size="lg" onClick={start} disabled={phase === "loading"}>
              <PlayIcon /> {phase === "done" ? "Again" : "Start"} <Kbd>Space</Kbd>
            </Button>
          )}
          <span className="text-xs text-muted-foreground">Uses the piece and voices chosen in the settings. Set the lag there.</span>
        </div>
        <PianoRoll notesRef={rollNotes} nowRef={nowRef} mode="live" low={range[0]} high={range[1]} pxPerSecond={pxPerSecond} height={320} />
        <RollLegend kinds={["ghost", "correct", "wrong", "extra"]} />
        <p className="text-xs text-muted-foreground">Ghost notes ahead of the red line are coming up; play them as they cross it (or {settings.shadowLagBeats} beat{settings.shadowLagBeats === 1 ? "" : "s"} later with the lag).</p>
      </CardContent>
    </Card>
  );
}
