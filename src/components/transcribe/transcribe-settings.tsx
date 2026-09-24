"use client";

import { useEffect, useState } from "react";
import { ShuffleIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { INSTRUMENTS } from "@/lib/audio/instruments";
import { isInstrumentAvailable, useEngineStore } from "@/lib/audio/engine";
import { noteName, PITCH_CLASS_SHORT } from "@/lib/music/notes";
import { SCALE_LABELS, type PhraseRhythm, type PhraseStyle, type ScaleName } from "@/lib/trainer/phrase-gen";
import { useTranscribeSettings, type DrillKind, type SourceKind } from "@/lib/transcribe/settings";
import { loadBachIndex, loadSourcePiece, type BachIndexEntry } from "@/lib/transcribe/sources";
import type { Piece } from "@/lib/music/score";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { InstrumentSelect } from "@/components/instrument-select";
import { MidiPanel } from "@/components/midi-panel";
import { UploadPiece } from "@/components/transcribe/upload-piece";

const SOURCES: Record<SourceKind, string> = { generated: "Generated phrases", bach: "Bach chorales (382)", upload: "My MIDI files" };
const DRILLS: Record<DrillKind, string> = { echo: "Phrase echo (random phrase each time)", ladder: "Ladder (length grows as you pass)", chunk: "Chunk mode (walk through the piece)" };
const STYLES: Record<PhraseStyle, string> = { stepwise: "Stepwise", mixed: "Mixed", arpeggio: "Arpeggiated", jazz: "Jazz line", bass: "Bass line" };
const RHYTHMS: Record<PhraseRhythm, string> = { quarters: "Quarter notes", eighths: "Eighth notes", mixed: "Mixed values", syncopated: "Syncopated" };
const KEYS: Record<string, string> = { "-1": "Random key", ...Object.fromEntries(PITCH_CLASS_SHORT.map((n, i) => [String(i), n])) };

function SelectField<T extends string>({ value, items, onChange, placeholder }: { value: T | null; items: Record<T, string>; onChange: (v: T) => void; placeholder?: string }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger size="sm" className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(Object.entries(items) as [T, string][]).map(([k, label]) => (
          <SelectItem key={k} value={k}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SliderField({ label, value, display, min, max, step = 1, onChange }: { label: string; value: number; display: string; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <>
      <Label className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{display}</span>
      </Label>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
    </>
  );
}

export function TranscribeSettingsPanel() {
  const { settings: s, update, reset } = useTranscribeSettings();
  const samples = useEngineStore((st) => st.samples);
  const vendored = useEngineStore((st) => st.vendored);
  const instruments = INSTRUMENTS.filter((d) => isInstrumentAvailable(d, { samples, vendored }));
  const [bachIndex, setBachIndex] = useState<BachIndexEntry[]>([]);
  const [loadedPiece, setLoadedPiece] = useState<Piece | null>(null);

  useEffect(() => {
    if (s.source === "bach") loadBachIndex().then(setBachIndex).catch(() => setBachIndex([]));
  }, [s.source]);

  // load the selected piece to show its tracks (voice picker)
  const { source, bachIndex: bachIdx, uploadId } = s;
  useEffect(() => {
    if (source === "generated") return;
    let cancelled = false;
    loadSourcePiece({ ...useTranscribeSettings.getState().settings, source, bachIndex: bachIdx, uploadId })
      .then((p) => {
        if (!cancelled) setLoadedPiece(p);
      })
      .catch(() => {
        if (!cancelled) setLoadedPiece(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source, bachIdx, uploadId]);
  const piece = s.source === "generated" ? null : loadedPiece && loadedPiece.id === (s.source === "bach" ? `bach:${String(s.bachIndex + 1).padStart(3, "0")}` : `upload:${s.uploadId}`) ? loadedPiece : null;

  const bachEntry = bachIndex[s.bachIndex];

  return (
    <Card size="sm" className="h-fit">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <Label>Drill</Label>
          <SelectField value={s.drill} items={DRILLS} onChange={(v) => update({ drill: v })} />
          {s.drill === "chunk" && s.source === "generated" && <p className="text-xs text-muted-foreground">Chunk mode walks through a piece; pick Bach or an upload as the source.</p>}
          <Label>Source</Label>
          <SelectField value={s.source} items={SOURCES} onChange={(v) => update({ source: v, voices: v === "bach" ? [0] : [] })} />
        </section>

        {s.source === "generated" && (
          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Generated phrases</Label>
            <div className="grid grid-cols-2 gap-2">
              <SelectField value={String(s.genKey)} items={KEYS} onChange={(v) => update({ genKey: Number(v) })} />
              <SelectField value={s.genScale} items={SCALE_LABELS as Record<ScaleName, string>} onChange={(v) => update({ genScale: v })} />
              <SelectField value={s.genStyle} items={STYLES} onChange={(v) => update({ genStyle: v })} />
              <SelectField value={s.genRhythm} items={RHYTHMS} onChange={(v) => update({ genRhythm: v })} />
            </div>
            {s.drill !== "ladder" && <SliderField label="Bars" value={s.genBars} display={String(s.genBars)} min={1} max={8} onChange={(v) => update({ genBars: v })} />}
            <SliderField label="Voices" value={s.genVoices} display={String(s.genVoices)} min={1} max={4} onChange={(v) => update({ genVoices: v as 1 | 2 | 3 | 4 })} />
            <SliderField label="Tempo" value={s.genBpm} display={`${s.genBpm} bpm`} min={50} max={160} step={2} onChange={(v) => update({ genBpm: v })} />
            <Label className="flex justify-between">
              <span>Melody range</span>
              <span className="font-mono text-xs text-muted-foreground">
                {noteName(s.genLow)} – {noteName(s.genHigh)}
              </span>
            </Label>
            <Slider
              min={36}
              max={96}
              step={1}
              value={[s.genLow, s.genHigh]}
              onValueChange={(v) => {
                if (Array.isArray(v) && v.length === 2) update({ genLow: v[0], genHigh: v[1] });
              }}
            />
            <SliderField label="Max leap" value={s.genMaxLeap} display={`${s.genMaxLeap} semitones`} min={2} max={24} onChange={(v) => update({ genMaxLeap: v })} />
            <SliderField label="Chromaticism" value={Math.round(s.genChromaticism * 100)} display={`${Math.round(s.genChromaticism * 100)}%`} min={0} max={60} step={5} onChange={(v) => update({ genChromaticism: v / 100 })} />
            <SliderField label="Rests" value={Math.round(s.genRests * 100)} display={`${Math.round(s.genRests * 100)}%`} min={0} max={40} step={5} onChange={(v) => update({ genRests: v / 100 })} />
          </section>
        )}

        {s.source === "bach" && (
          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Chorale</Label>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" aria-label="Previous chorale" onClick={() => update({ bachIndex: Math.max(0, s.bachIndex - 1) })}>
                <ChevronLeftIcon />
              </Button>
              <Input
                type="number"
                min={1}
                max={bachIndex.length || 382}
                value={s.bachIndex + 1}
                onChange={(e) => update({ bachIndex: Math.max(0, Math.min((bachIndex.length || 382) - 1, Number(e.target.value) - 1)) })}
                className="w-20 text-center"
              />
              <Button variant="outline" size="icon-sm" aria-label="Next chorale" onClick={() => update({ bachIndex: Math.min((bachIndex.length || 382) - 1, s.bachIndex + 1) })}>
                <ChevronRightIcon />
              </Button>
              <Button variant="outline" size="sm" onClick={() => update({ bachIndex: Math.floor(Math.random() * (bachIndex.length || 382)) })}>
                <ShuffleIcon /> Random
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{bachEntry ? `${bachEntry.name} · ${bachEntry.bars} bars · ${bachEntry.notes} notes` : "…"}</p>
          </section>
        )}

        {s.source === "upload" && (
          <section className="flex flex-col gap-2">
            <UploadPiece />
          </section>
        )}

        {s.source !== "generated" && (
          <section className="flex flex-col gap-2">
            {piece && piece.tracks.length > 1 && (
              <>
                <Label className="text-xs text-muted-foreground">Voices to play back (none = all)</Label>
                <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={s.voices.map(String)} onValueChange={(v) => update({ voices: v.map(Number) })}>
                  {piece.tracks.map((t, i) => (
                    <ToggleGroupItem key={i} value={String(i)} className="h-6 px-2 text-xs">
                      {t.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </>
            )}
            {s.drill !== "ladder" && <SliderField label="Bars per phrase" value={s.phraseBars} display={String(s.phraseBars)} min={1} max={8} onChange={(v) => update({ phraseBars: v })} />}
            <SliderField label="Tempo" value={Math.round(s.tempoScale * 100)} display={`${Math.round(s.tempoScale * 100)}%${piece ? ` (${Math.round(piece.bpm * s.tempoScale)} bpm)` : ""}`} min={50} max={150} step={5} onChange={(v) => update({ tempoScale: v / 100 })} />
          </section>
        )}

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>Grading</Label>
          <Label className="gap-2 font-normal">
            <Switch size="sm" checked={s.rhythm} onCheckedChange={(v) => update({ rhythm: v })} />
            Grade rhythm too (off = pitch and order only)
          </Label>
          {s.rhythm && <SliderField label="Rhythm tolerance" value={s.rhythmTolerance} display={`±${s.rhythmTolerance} beat`} min={0.1} max={0.5} step={0.05} onChange={(v) => update({ rhythmTolerance: v })} />}
          <Label className="gap-2 font-normal">
            <Switch size="sm" checked={s.octaveInsensitive} onCheckedChange={(v) => update({ octaveInsensitive: v })} />
            Accept the right note in any octave
          </Label>
          <SliderField label="Pass mark" value={Math.round(s.passThreshold * 100)} display={`${Math.round(s.passThreshold * 100)}%`} min={50} max={100} step={5} onChange={(v) => update({ passThreshold: v / 100 })} />
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>Flow</Label>
          <Label className="gap-2 font-normal">
            <Switch size="sm" checked={s.oneListen} onCheckedChange={(v) => update({ oneListen: v })} />
            One listen only (no replay while answering)
          </Label>
          <Label className="gap-2 font-normal">
            <Switch size="sm" checked={s.autoProceed} onCheckedChange={(v) => update({ autoProceed: v })} />
            Auto proceed to the next phrase
          </Label>
          <SliderField label="Auto-grade after silence" value={s.autoSubmitSilenceMs} display={`${(s.autoSubmitSilenceMs / 1000).toFixed(1)}s`} min={500} max={4000} step={100} onChange={(v) => update({ autoSubmitSilenceMs: v })} />
          <Label className="text-xs text-muted-foreground">Playback instrument</Label>
          <InstrumentSelect size="sm" value={s.instrumentId} onChange={(id) => update({ instrumentId: id })} instruments={instruments} />
          <SliderField label="Shadow mode lag" value={s.shadowLagBeats} display={`${s.shadowLagBeats} beat${s.shadowLagBeats === 1 ? "" : "s"}`} min={0} max={4} step={0.5} onChange={(v) => update({ shadowLagBeats: v })} />
          <SliderField label="Shadow timing window" value={s.shadowWindowMs} display={`±${s.shadowWindowMs} ms`} min={150} max={800} step={50} onChange={(v) => update({ shadowWindowMs: v })} />
          <MidiPanel />
        </section>

        <Button variant="ghost" size="sm" onClick={reset}>
          Reset to defaults
        </Button>
      </CardContent>
    </Card>
  );
}
