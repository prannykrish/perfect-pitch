"use client";

import { useEffect, useState } from "react";
import { ShuffleIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { INSTRUMENTS, type InstrumentTier } from "@/lib/audio/instruments";
import { isInstrumentAvailable, useEngineStore } from "@/lib/audio/engine";
import { noteName, PITCH_CLASS_SHORT } from "@/lib/music/notes";
import { VOICING_LABELS, type Voicing } from "@/lib/music/chords";
import { SCALE_LABELS, type PhraseRhythm, type PhraseStyle, type ScaleName } from "@/lib/trainer/phrase-gen";
import { loadBachIndex, type BachIndexEntry } from "@/lib/transcribe/sources";
import { useMistakesSettings, type MistakesInstrumentMode, type MistakesSource } from "@/lib/mistakes/settings";
import { drillableTypes } from "@/lib/mistakes/material";
import { MATERIAL_LABELS, PROBLEM_HELP, PROBLEM_LABELS, PROBLEM_TYPES, type MaterialKind } from "@/lib/mistakes/types";
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

const SOURCES: Record<MistakesSource, string> = { auto: "Auto (whatever fits the problem)", ...MATERIAL_LABELS };
const STYLES: Record<PhraseStyle, string> = { stepwise: "Stepwise", mixed: "Mixed", arpeggio: "Arpeggiated", jazz: "Jazz line", bass: "Bass line" };
const RHYTHMS: Record<PhraseRhythm, string> = { quarters: "Quarter notes", eighths: "Eighth notes", mixed: "Mixed values", syncopated: "Syncopated" };
const KEYS: Record<string, string> = { "-1": "Random key", ...Object.fromEntries(PITCH_CLASS_SHORT.map((n, i) => [String(i), n])) };
const INSTRUMENT_MODES: Record<MistakesInstrumentMode, string> = { fixed: "One instrument", random: "Random instrument each question", "per-voice": "Different instrument per voice" };
const SLIPS: Record<string, string> = { "0.125": "1/8 beat", "0.25": "1/4 beat", "0.333": "1/3 beat", "0.5": "1/2 beat" };
const TIER_LABELS: Record<InstrumentTier, string> = { clean: "Clean", hard: "Hard", chaos: "Chaos" };

function SelectField<T extends string>({ value, items, onChange }: { value: T | null; items: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
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

function SwitchRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Label className="gap-2 font-normal">
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
      {children}
    </Label>
  );
}

export function MistakesSettingsPanel() {
  const { settings: s, update, setType, reset } = useMistakesSettings();
  const samples = useEngineStore((st) => st.samples);
  const vendored = useEngineStore((st) => st.vendored);
  const instruments = INSTRUMENTS.filter((d) => isInstrumentAvailable(d, { samples, vendored }));
  const [bachIndex, setBachIndex] = useState<BachIndexEntry[]>([]);
  useEffect(() => {
    if (s.source === "bach" || (s.source === "auto" && s.autoSources.includes("bach"))) loadBachIndex().then(setBachIndex).catch(() => setBachIndex([]));
  }, [s.source, s.autoSources]);
  const bachCount = bachIndex.length || 382;
  const bachEntry = bachIndex[s.bachIndex];

  const drillable = drillableTypes(s);
  const showGenerated = s.source === "auto" || s.source === "melody" || s.source === "voices" || s.source === "progression";
  const showMelody = s.source === "melody" || (s.source === "auto" && s.autoSources.includes("melody"));
  const showVoices = s.source === "voices" || (s.source === "auto" && s.autoSources.includes("voices"));
  const showProg = s.source === "progression" || (s.source === "auto" && s.autoSources.includes("progression"));
  const showBach = s.source === "bach" || (s.source === "auto" && s.autoSources.includes("bach"));
  const showUpload = s.source === "upload" || (s.source === "auto" && s.autoSources.includes("upload"));

  return (
    <Card size="sm" className="h-fit">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <Label>Problem types</Label>
          {PROBLEM_TYPES.map((t) => {
            const fits = t === "ab" || drillable.includes(t);
            return (
              <div key={t} className="flex flex-col">
                <Label className="gap-2 font-normal">
                  <Switch size="sm" checked={s.types[t]} onCheckedChange={(v) => setType(t, v)} />
                  <span className={s.types[t] && !fits ? "text-muted-foreground line-through" : undefined}>{PROBLEM_LABELS[t]}</span>
                </Label>
                <span className="pl-8 text-[11px] leading-tight text-muted-foreground">{s.types[t] && !fits ? "Does not fit the chosen source; it will be skipped." : PROBLEM_HELP[t]}</span>
              </div>
            );
          })}
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>Source</Label>
          <SelectField value={s.source} items={SOURCES} onChange={(v) => update({ source: v })} />
          {s.source === "auto" && (
            <>
              <Label className="text-xs text-muted-foreground">Auto draws from</Label>
              <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={s.autoSources} onValueChange={(v) => update({ autoSources: v as MaterialKind[] })}>
                {(Object.keys(MATERIAL_LABELS) as MaterialKind[]).map((k) => (
                  <ToggleGroupItem key={k} value={k} className="h-6 px-2 text-xs">
                    {k === "melody" ? "Melody" : k === "progression" ? "Progression" : k === "voices" ? "Voices" : k === "bach" ? "Bach" : "Uploads"}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </>
          )}
        </section>

        {showGenerated && (
          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Generated material</Label>
            <div className="grid grid-cols-2 gap-2">
              <SelectField value={String(s.key)} items={KEYS} onChange={(v) => update({ key: Number(v) })} />
              <SelectField value={s.scale} items={SCALE_LABELS as Record<ScaleName, string>} onChange={(v) => update({ scale: v })} />
            </div>
            {(showMelody || showVoices) && <SliderField label="Bars" value={s.bars} display={String(s.bars)} min={1} max={4} onChange={(v) => update({ bars: v })} />}
            <SliderField label="Tempo" value={s.bpm} display={`${s.bpm} bpm`} min={50} max={160} step={2} onChange={(v) => update({ bpm: v })} />
            {showMelody && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField value={s.melodyStyle} items={STYLES} onChange={(v) => update({ melodyStyle: v })} />
                  <SelectField value={s.melodyRhythm} items={RHYTHMS} onChange={(v) => update({ melodyRhythm: v })} />
                </div>
                <Label className="flex justify-between">
                  <span>Melody range</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {noteName(s.melodyLow)} – {noteName(s.melodyHigh)}
                  </span>
                </Label>
                <Slider
                  min={36}
                  max={96}
                  step={1}
                  value={[s.melodyLow, s.melodyHigh]}
                  onValueChange={(v) => {
                    if (Array.isArray(v) && v.length === 2) update({ melodyLow: v[0], melodyHigh: v[1] });
                  }}
                />
              </>
            )}
            {showVoices && <SliderField label="Voices (texture)" value={s.voiceCount} display={String(s.voiceCount)} min={2} max={4} onChange={(v) => update({ voiceCount: v as 2 | 3 | 4 })} />}
            {showProg && (
              <>
                <SliderField label="Chords in the progression" value={s.progChords} display={String(s.progChords)} min={3} max={8} onChange={(v) => update({ progChords: v })} />
                <SliderField label="Beats per chord" value={s.progBeatsPerChord} display={String(s.progBeatsPerChord)} min={1} max={4} onChange={(v) => update({ progBeatsPerChord: v })} />
                <SwitchRow checked={s.progSevenths} onChange={(v) => update({ progSevenths: v })}>
                  Use seventh chords too
                </SwitchRow>
                <SwitchRow checked={s.progInversions} onChange={(v) => update({ progInversions: v })}>
                  Random inversions in the reference
                </SwitchRow>
                <Label className="text-xs text-muted-foreground">Voicings</Label>
                <ToggleGroup multiple variant="outline" size="sm" value={s.progVoicings} onValueChange={(v) => update({ progVoicings: v as Voicing[] })}>
                  {(Object.keys(VOICING_LABELS) as Voicing[]).map((v) => (
                    <ToggleGroupItem key={v} value={v} className="h-6 px-2 text-xs">
                      {VOICING_LABELS[v]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </>
            )}
          </section>
        )}

        {showBach && (
          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Bach chorale</Label>
            <SwitchRow checked={s.bachRandom} onChange={(v) => update({ bachRandom: v })}>
              Random chorale every question
            </SwitchRow>
            {!s.bachRandom && (
              <>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" aria-label="Previous chorale" onClick={() => update({ bachIndex: Math.max(0, s.bachIndex - 1) })}>
                    <ChevronLeftIcon />
                  </Button>
                  <Input type="number" min={1} max={bachCount} value={s.bachIndex + 1} onChange={(e) => update({ bachIndex: Math.max(0, Math.min(bachCount - 1, Number(e.target.value) - 1)) })} className="w-20 text-center" />
                  <Button variant="outline" size="icon-sm" aria-label="Next chorale" onClick={() => update({ bachIndex: Math.min(bachCount - 1, s.bachIndex + 1) })}>
                    <ChevronRightIcon />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => update({ bachIndex: Math.floor(Math.random() * bachCount) })}>
                    <ShuffleIcon /> Random
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{bachEntry ? `${bachEntry.name} · ${bachEntry.bars} bars` : "…"}</p>
              </>
            )}
            <SliderField label="Bars per phrase" value={s.bachBars} display={String(s.bachBars)} min={1} max={4} onChange={(v) => update({ bachBars: v })} />
            <SliderField label="Tempo" value={Math.round(s.bachTempoScale * 100)} display={`${Math.round(s.bachTempoScale * 100)}%`} min={50} max={150} step={5} onChange={(v) => update({ bachTempoScale: v / 100 })} />
          </section>
        )}

        {showUpload && (
          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">My MIDI files</Label>
            <UploadPiece value={s.uploadId} onChange={(id) => update({ uploadId: id })} />
            <SliderField label="Bars per phrase" value={s.uploadBars} display={String(s.uploadBars)} min={1} max={4} onChange={(v) => update({ uploadBars: v })} />
          </section>
        )}

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>How big the problems are</Label>
          <Label className="flex justify-between">
            <span>Detune / drift</span>
            <span className="font-mono text-xs text-muted-foreground">
              {s.centsMin}–{s.centsMax} cents
            </span>
          </Label>
          <Slider
            min={5}
            max={50}
            step={5}
            value={[s.centsMin, s.centsMax]}
            onValueChange={(v) => {
              if (Array.isArray(v) && v.length === 2) update({ centsMin: Math.max(5, v[0]), centsMax: Math.max(v[0], v[1]) });
            }}
          />
          <Label className="text-xs text-muted-foreground">Rhythm slip</Label>
          <SelectField value={String(s.slipBeats)} items={SLIPS} onChange={(v) => update({ slipBeats: Number(v) })} />
          <SwitchRow checked={s.referenceFirst} onChange={(v) => update({ referenceFirst: v })}>
            Play the clean version first, then the one with the mistake (always on for inversions)
          </SwitchRow>
          <SwitchRow checked={s.askFix} onChange={(v) => update({ askFix: v })}>
            Ask what the fix is (bonus, never lowers the score)
          </SwitchRow>
          <SwitchRow checked={s.askAmount} onChange={(v) => update({ askAmount: v })}>
            Ask how many cents a detuned note was off (bonus)
          </SwitchRow>
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>Instruments</Label>
          <SelectField value={s.instrumentMode} items={INSTRUMENT_MODES} onChange={(v) => update({ instrumentMode: v })} />
          {s.instrumentMode === "fixed" ? (
            <InstrumentSelect size="sm" value={s.instrumentId} onChange={(id) => update({ instrumentId: id })} instruments={instruments} />
          ) : (
            <>
              <Label className="text-xs text-muted-foreground">Tiers to draw from</Label>
              <ToggleGroup multiple variant="outline" size="sm" value={s.tiers} onValueChange={(v) => v.length && update({ tiers: v as InstrumentTier[] })}>
                {(Object.keys(TIER_LABELS) as InstrumentTier[]).map((t) => (
                  <ToggleGroupItem key={t} value={t} className="h-6 px-2 text-xs">
                    {TIER_LABELS[t]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">Only instruments whose range covers the material are used; otherwise the fixed one below.</p>
              <InstrumentSelect size="sm" value={s.instrumentId} onChange={(id) => update({ instrumentId: id })} instruments={instruments} />
            </>
          )}
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>Flow</Label>
          <SliderField label="Questions (0 = never-ending)" value={s.questionCount} display={s.questionCount ? String(s.questionCount) : "∞"} min={0} max={50} step={5} onChange={(v) => update({ questionCount: v })} />
          <SwitchRow checked={s.autoProceed} onChange={(v) => update({ autoProceed: v })}>
            Auto proceed after a right answer
          </SwitchRow>
          {s.autoProceed && <SliderField label="Pause after a right answer" value={s.correctPauseMs} display={`${(s.correctPauseMs / 1000).toFixed(1)}s`} min={200} max={4000} step={100} onChange={(v) => update({ correctPauseMs: v })} />}
          <p className="text-xs text-muted-foreground">A wrong answer always waits: read what was planted, then Space, Enter or Hear next.</p>
          <SwitchRow checked={s.oneListen} onChange={(v) => update({ oneListen: v })}>
            One listen only (no replay while answering)
          </SwitchRow>
          <SwitchRow checked={s.clickTrack} onChange={(v) => update({ clickTrack: v })}>
            Click track on every beat (helps with rhythm slips)
          </SwitchRow>
          <SwitchRow checked={s.showRollWhileAnswering} onChange={(v) => update({ showRollWhileAnswering: v })}>
            Show the piano roll while answering (easier)
          </SwitchRow>
          <SwitchRow checked={s.midiInput} onChange={(v) => update({ midiInput: v })}>
            USB piano can name the fix note
          </SwitchRow>
          <MidiPanel />
        </section>

        <Button variant="ghost" size="sm" onClick={reset}>
          Reset to defaults
        </Button>
      </CardContent>
    </Card>
  );
}
