"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CircleIcon, PlayIcon, SaveIcon, SquareIcon, Trash2Icon, ListMusicIcon } from "lucide-react";
import { getEngine, isInstrumentAvailable, useEngineStore } from "@/lib/audio/engine";
import { DEFAULT_INSTRUMENT_ID, INSTRUMENTS, instrumentLabel } from "@/lib/audio/instruments";
import { getMidi, useMidiStore } from "@/lib/midi/midi";
import { MidiRecorder, recordingDurationMs, type RecordedNote } from "@/lib/midi/recorder";
import { deleteRecording, getRecording, listRecordings, saveRecording, type RecordingSummary } from "@/lib/db/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PianoRoll, type RollNote } from "@/components/piano-roll";
import { PianoKeyboard, type KeyHighlight } from "@/components/piano-keyboard";
import { InstrumentSelect } from "@/components/instrument-select";
import { MidiPanel } from "@/components/midi-panel";
import { useLatest } from "@/lib/hooks/use-latest";

const LIVE_WINDOW_MS = 30000;

export function MidiMonitor() {
  const [instrumentId, setInstrumentId] = useState(DEFAULT_INSTRUMENT_ID);
  const [localSound, setLocalSound] = useState(false);
  const [recording, setRecording] = useState(false);
  const [take, setTake] = useState<RecordedNote[] | null>(null);
  const [takeName, setTakeName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState<RecordingSummary[]>([]);
  const [view, setView] = useState<"live" | "take">("live");
  const [recElapsed, setRecElapsed] = useState(0);
  const [takeDurationMs, setTakeDurationMs] = useState(1000);

  const held = useMidiStore((s) => s.held);
  const samples = useEngineStore((s) => s.samples);
  const vendored = useEngineStore((s) => s.vendored);
  const availableInstruments = INSTRUMENTS.filter((d) => isInstrumentAvailable(d, { samples, vendored }));

  const liveNotes = useRef<RollNote[]>([]);
  const liveNow = useRef(0);
  const liveT0 = useRef(0);
  const openLive = useRef(new Map<number, RollNote>());

  const takeNotes = useRef<RollNote[]>([]);
  const takeNow = useRef(0);
  const takeDuration = useRef(1000);
  const playRaf = useRef(0);
  const stopFns = useRef<(() => void)[]>([]);

  const recorder = useRef(new MidiRecorder());
  const instrumentRef = useLatest(instrumentId);
  const localSoundRef = useLatest(localSound);
  const liveVoices = useRef(new Map<number, (t?: number) => void>());

  const refreshSaved = useCallback(() => {
    listRecordings()
      .then(setSaved)
      .catch(() => {});
  }, []);

  useEffect(() => {
    getMidi().init();
    refreshSaved();
    getEngine()
      .checkSamples()
      .catch(() => {});
  }, [refreshSaved]);

  // recording elapsed badge
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setRecElapsed(Math.round(recorder.current.elapsedMs / 1000)), 500);
    return () => clearInterval(id);
  }, [recording]);

  // live clock + trimming
  useEffect(() => {
    let raf = 0;
    liveT0.current = performance.now();
    const tick = () => {
      liveNow.current = performance.now() - liveT0.current;
      const cutoff = liveNow.current - LIVE_WINDOW_MS;
      if (liveNotes.current.length && (liveNotes.current[0].endMs ?? Infinity) < cutoff) {
        liveNotes.current = liveNotes.current.filter((n) => (n.endMs ?? Infinity) >= cutoff);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // MIDI → live roll (+ recorder, + optional local sound)
  useEffect(() => {
    return getMidi().subscribe((ev) => {
      recorder.current.handle(ev);
      if (ev.type === "cc") return;
      const t = ev.time - liveT0.current;
      if (ev.type === "noteon") {
        const prev = openLive.current.get(ev.note);
        if (prev) prev.endMs = t;
        const n: RollNote = { midi: ev.note, startMs: t, endMs: null, velocity: ev.velocity, kind: "played" };
        liveNotes.current.push(n);
        openLive.current.set(ev.note, n);
        if (localSoundRef.current) {
          const engine = getEngine();
          engine.resume().then(() => engine.load(instrumentRef.current)).then((inst) => {
            liveVoices.current.get(ev.note)?.();
            liveVoices.current.set(ev.note, inst.start({ note: ev.note, velocity: ev.velocity }));
          }).catch(() => {});
        }
      } else {
        const n = openLive.current.get(ev.note);
        if (n) {
          n.endMs = Math.max(n.startMs + 20, t);
          openLive.current.delete(ev.note);
        }
        const stop = liveVoices.current.get(ev.note);
        if (stop) {
          stop();
          liveVoices.current.delete(ev.note);
        }
      }
    });
  }, [instrumentRef, localSoundRef]);

  const startRecording = () => {
    recorder.current.start();
    setRecElapsed(0);
    setRecording(true);
    setTake(null);
    setView("live");
  };

  const stopRecording = () => {
    const notes = recorder.current.stop();
    setRecording(false);
    if (!notes.length) {
      toast("Nothing was played during the recording");
      return;
    }
    // normalise so the first note starts at 0
    const t0 = Math.min(...notes.map((n) => n.startMs));
    const shifted = notes.map((n) => ({ ...n, startMs: n.startMs - t0, endMs: n.endMs === null ? null : n.endMs - t0 }));
    loadTake(shifted, `Take ${new Date().toLocaleTimeString()}`);
  };

  const loadTake = (notes: RecordedNote[], name: string) => {
    setTake(notes);
    setTakeName(name);
    takeNotes.current = notes.map((n) => ({ midi: n.midi, startMs: n.startMs, endMs: n.endMs, velocity: n.velocity, kind: "played" }));
    takeDuration.current = Math.max(1000, recordingDurationMs(notes) + 300);
    setTakeDurationMs(takeDuration.current);
    takeNow.current = 0;
    setView("take");
  };

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(playRaf.current);
    for (const s of stopFns.current) s();
    stopFns.current = [];
    getEngine().stopAll();
    setPlaying(false);
  }, []);

  const playTake = async () => {
    if (!take) return;
    stopPlayback();
    const engine = getEngine();
    await engine.resume();
    let inst: Awaited<ReturnType<typeof engine.load>>;
    try {
      inst = await engine.load(instrumentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    const base = engine.currentTime + 0.1;
    for (const n of take) {
      const dur = ((n.endMs ?? n.startMs + 300) - n.startMs) / 1000;
      stopFns.current.push(inst.start({ note: n.midi, velocity: n.velocity, time: base + n.startMs / 1000, duration: dur }));
    }
    setPlaying(true);
    setView("take");
    const start = performance.now() + 100;
    const tick = () => {
      takeNow.current = performance.now() - start;
      if (takeNow.current >= takeDuration.current) {
        setPlaying(false);
        takeNow.current = 0;
        return;
      }
      playRaf.current = requestAnimationFrame(tick);
    };
    playRaf.current = requestAnimationFrame(tick);
  };

  const save = async () => {
    if (!take) return;
    try {
      await saveRecording({
        name: takeName || "Untitled take",
        instrumentId,
        durationMs: recordingDurationMs(take),
        events: take,
      });
      toast.success("Take saved");
      refreshSaved();
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const open = async (id: number) => {
    const r = await getRecording(id);
    if (!r) return;
    setInstrumentId(r.instrumentId);
    loadTake(r.events, r.name);
  };

  const remove = async (id: number) => {
    await deleteRecording(id);
    refreshSaved();
  };

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const highlights: Partial<Record<number, KeyHighlight>> = {};
  for (const m of held) highlights[m] = "pressed";

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Live monitor</CardTitle>
              <CardDescription>Ableton-style roll of what you play. Time flows left; the red line is now.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {recording && (
                <Badge variant="destructive" className="animate-pulse">
                  REC {recElapsed}s
                </Badge>
              )}
              <Button variant={view === "live" ? "default" : "outline"} size="sm" onClick={() => setView("live")}>
                Live
              </Button>
              <Button variant={view === "take" ? "default" : "outline"} size="sm" disabled={!take} onClick={() => setView("take")}>
                Take
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {view === "live" ? (
            <PianoRoll notesRef={liveNotes} nowRef={liveNow} mode="live" low={24} high={100} pxPerSecond={110} height={340} />
          ) : (
            <PianoRoll notesRef={takeNotes} nowRef={takeNow} mode="static" durationMs={takeDurationMs} low={24} high={100} height={340} />
          )}
          <PianoKeyboard low={21} high={108} highlights={highlights} height={70} labels="c" />
          <div className="flex flex-wrap items-center gap-3">
            {!recording ? (
              <Button onClick={startRecording}>
                <CircleIcon className="fill-red-500 text-red-500" /> Record
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopRecording}>
                <SquareIcon /> Stop
              </Button>
            )}
            <Button variant="outline" disabled={!take || recording} onClick={playing ? stopPlayback : playTake}>
              {playing ? <SquareIcon /> : <PlayIcon />} {playing ? "Stop" : "Play take"}
            </Button>
            <div className="flex min-w-56 items-center gap-2">
              <Label className="text-xs text-muted-foreground">Playback sound</Label>
              <InstrumentSelect size="sm" value={instrumentId} onChange={setInstrumentId} className="w-64" instruments={availableInstruments} />
            </div>
            <Label className="gap-2 text-xs">
              <Switch size="sm" checked={localSound} onCheckedChange={setLocalSound} />
              Also sound live notes through this instrument
            </Label>
          </div>
          {take && (
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-64" value={takeName} onChange={(e) => setTakeName(e.target.value)} placeholder="Take name" />
              <Button variant="outline" onClick={save}>
                <SaveIcon /> Save take
              </Button>
              <span className="text-xs text-muted-foreground">
                {take.length} notes · {(recordingDurationMs(take) / 1000).toFixed(1)}s
              </span>
            </div>
          )}
          <MidiPanel />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListMusicIcon className="size-4" /> Saved takes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead className="text-right">Notes</TableHead>
                <TableHead className="text-right">Length</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {saved.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="max-w-48 truncate">{instrumentLabel(r.instrumentId)}</TableCell>
                  <TableCell className="text-right">{r.noteCount}</TableCell>
                  <TableCell className="text-right">{(r.durationMs / 1000).toFixed(1)}s</TableCell>
                  <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button size="icon-xs" variant="ghost" aria-label="Open" onClick={() => open(r.id)}>
                      <PlayIcon />
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label="Delete" onClick={() => remove(r.id)}>
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {saved.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No saved takes yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
