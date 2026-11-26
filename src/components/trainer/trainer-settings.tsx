"use client";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { DicesIcon } from "lucide-react";
import { isInstrumentAvailable, useEngineStore } from "@/lib/audio/engine";
import {
  DEFAULT_INSTRUMENT_ID,
  FAMILY_LABELS,
  FAMILY_ORDER,
  getInstrument,
  INSTRUMENTS,
  type InstrumentFamily,
  type InstrumentTier,
} from "@/lib/audio/instruments";
import { CHORD_CATEGORY_LABELS, VOICING_LABELS, type ChordCategory, type Voicing } from "@/lib/music/chords";
import { INTERVALS } from "@/lib/music/intervals";
import { MIDI_MAX, MIDI_MIN, noteName, PITCH_CLASS_SHORT, randomInt, shuffle } from "@/lib/music/notes";
import { SCALE_CATEGORY_LABELS, scalesByCategory } from "@/lib/music/scales";
import {
  useTrainerSettings,
  type AnswerMode,
  type CentsVariant,
  type ChordAnswer,
  type ChordKind,
  type ChordPlayback,
  type InstrumentMode,
  type IntervalDirection,
  type IntervalPlayback,
  type IntervalVariant,
  type NotesOrder,
  type PoolMode,
  type ReplayLimit,
  type ScaleDirection,
  type ScaleVariant,
} from "@/lib/trainer/settings";
import type { TrainerMode } from "@/components/trainer/trainer-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { InstrumentSelect } from "@/components/instrument-select";
import { MidiPanel } from "@/components/midi-panel";
import { AudioDiagnostics } from "@/components/audio-diagnostics";
import { DifficultyDial } from "@/components/practice/difficulty-dial";
import { PianoPrefsFields } from "@/components/piano-prefs-fields";

const INSTRUMENT_MODES: Record<InstrumentMode, string> = {
  fixed: "One instrument",
  "random-question": "Random instrument every question",
  "random-note": "Random instrument every note",
};

const SCALE_VARIANTS: Record<ScaleVariant, string> = {
  run: "Scale runs only",
  melody: "Melodies only",
  both: "Runs and melodies",
};

const SCALE_DIRECTIONS: Record<ScaleDirection, string> = {
  random: "Runs go up, down or both (random)",
  asc: "Runs go up",
  desc: "Runs go down",
  both: "Runs go up and back down",
};

const REPLAY_LIMITS: Record<ReplayLimit, string> = {
  unlimited: "Unlimited replays",
  one: "One replay",
  none: "No replays (one-shot)",
};

const POOL_MODES: Record<PoolMode, string> = {
  all: "All instruments",
  everything: "Everything, new sound every question (timbre roulette)",
  random: "Random handful of families",
  custom: "Choose families",
};

const INTERVAL_VARIANTS: Record<IntervalVariant, string> = {
  pair: "Two notes",
  chain: "Chain: every interval in a sequence",
  stack: "Stack: intervals from the bottom note",
};
const INTERVAL_PLAYBACK: Record<IntervalPlayback, string> = { melodic: "Melodic (one after the other)", harmonic: "Harmonic (together)" };
const INTERVAL_DIRECTIONS: Record<IntervalDirection, string> = { asc: "Ascending", desc: "Descending", both: "Both" };

const CHORD_KINDS: Record<ChordKind, string> = { chords: "Real chords", clusters: "Random clusters", mixed: "Mixed" };
const CHORD_ANSWERS: Record<ChordAnswer, string> = { "root-quality": "Root + quality (e.g. C dim)", notes: "Every note" };
const CHORD_PLAYBACK: Record<ChordPlayback, string> = { blocked: "Blocked (all at once)", "arp-then-blocked": "Arpeggio, then blocked", arp: "Arpeggio only" };
const NOTES_ORDER: Record<NotesOrder, string> = { any: "Any order", "bottom-up": "Bottom to top" };
const CENTS_VARIANTS: Record<CentsVariant, string> = { single: "One note: flat, sharp or in tune", pair: "Two notes: which is off", chord: "Triad: which member is off" };

/** 2–5 random families, so a session has a theme without you clicking anything. */
function rollFamilies(): InstrumentFamily[] {
  return shuffle(FAMILY_ORDER).slice(0, randomInt(2, 5));
}

const TIERS: { id: InstrumentTier; label: string }[] = [
  { id: "clean", label: "Clean" },
  { id: "hard", label: "Hard" },
  { id: "chaos", label: "Chaos" },
];

function SelectField<T extends string>({ value, items, onChange }: { value: T; items: Record<T, string>; onChange: (v: T) => void }) {
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

export function TrainerSettingsPanel({ mode, disabled = false }: { mode: TrainerMode; disabled?: boolean }) {
  const { settings, update, reset } = useTrainerSettings();
  const s = settings;
  const samples = useEngineStore((st) => st.samples);
  const vendored = useEngineStore((st) => st.vendored);
  const availableInstruments = useMemo(() => INSTRUMENTS.filter((d) => isInstrumentAvailable(d, { samples, vendored })), [samples, vendored]);

  useEffect(() => {
    if (!samples) return;
    const def = getInstrument(s.instrumentId);
    if (def && !isInstrumentAvailable(def, { samples, vendored })) {
      update({ instrumentId: DEFAULT_INSTRUMENT_ID });
      toast.warning(`${def.label} streams from the CDN and cannot play in this browser. Switched to Acoustic Grand Piano.`);
    }
  }, [samples, vendored, s.instrumentId, update]);

  const setPitchClass = (i: number, on: boolean) => {
    const next = [...s.pitchClasses];
    next[i] = on;
    update({ pitchClasses: next });
  };

  const showAnswerMode = mode !== "intervals" && mode !== "cents";
  const showNotesRange = true;
  const isRoulette = false;

  return (
    <Card size="sm" className="h-fit">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DifficultyDial id={mode} />
        <Separator />

        {/* ---------- mode specific ---------- */}
        {mode === "sequence" && (
          <section className="flex flex-col gap-2">
            <Label>Sequence</Label>
            <SliderField label="Notes per question" value={s.seqLength} display={String(s.seqLength)} min={2} max={12} onChange={(v) => update({ seqLength: v })} />
            <SliderField label="Gap between notes" value={s.seqGapMs} display={`${(s.seqGapMs / 1000).toFixed(2)}s`} min={150} max={1500} step={50} onChange={(v) => update({ seqGapMs: v })} />
            <SliderField label="Max jump between notes" value={s.seqMaxLeap} display={s.seqMaxLeap === 0 ? "unlimited" : `${s.seqMaxLeap} semitones`} min={0} max={36} onChange={(v) => update({ seqMaxLeap: v })} />
            <Separator />
          </section>
        )}

        {mode === "intervals" && (
          <section className="flex flex-col gap-2">
            <Label>Intervals</Label>
            <SelectField value={s.intervalVariant} items={INTERVAL_VARIANTS} onChange={(v) => update({ intervalVariant: v })} />
            {s.intervalVariant === "pair" && <SelectField value={s.intervalPlayback} items={INTERVAL_PLAYBACK} onChange={(v) => update({ intervalPlayback: v })} />}
            {(s.intervalVariant === "pair" && s.intervalPlayback === "melodic") || s.intervalVariant === "chain" ? (
              <SelectField value={s.intervalDirection} items={INTERVAL_DIRECTIONS} onChange={(v) => update({ intervalDirection: v })} />
            ) : null}
            {s.intervalVariant === "chain" && (
              <SliderField label="Notes in the chain" value={s.intervalChainLength} display={`${s.intervalChainLength} notes, ${s.intervalChainLength - 1} intervals`} min={3} max={10} onChange={(v) => update({ intervalChainLength: v })} />
            )}
            {s.intervalVariant === "stack" && (
              <SliderField label="Notes in the stack" value={s.intervalStackSize} display={`${s.intervalStackSize} notes, ${s.intervalStackSize - 1} intervals`} min={2} max={5} onChange={(v) => update({ intervalStackSize: v })} />
            )}
            {s.intervalVariant !== "stack" && (
              <SliderField label="Gap between notes" value={s.intervalGapMs} display={`${(s.intervalGapMs / 1000).toFixed(2)}s`} min={150} max={1500} step={50} onChange={(v) => update({ intervalGapMs: v })} />
            )}
            <Label className="gap-2">
              <Switch size="sm" checked={s.intervalCompound} onCheckedChange={(v) => update({ intervalCompound: v })} />
              Include compound intervals (9ths and up, to two octaves)
            </Label>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Allowed intervals (none = all)</Label>
              <Button variant="ghost" size="xs" onClick={() => update({ intervalSet: [] })}>
                All
              </Button>
            </div>
            <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={s.intervalSet.map(String)} onValueChange={(v) => update({ intervalSet: v.map(Number) })}>
              {INTERVALS.filter((i) => i.semitones <= 12).map((i) => (
                <ToggleGroupItem key={i.semitones} value={String(i.semitones)} className="h-6 px-2 text-xs" title={i.name}>
                  {i.short}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Separator />
          </section>
        )}

        {mode === "chords" && (
          <section className="flex flex-col gap-2">
            <Label>Chords & clusters</Label>
            <SelectField value={s.chordKind} items={CHORD_KINDS} onChange={(v) => update({ chordKind: v })} />
            {s.chordKind !== "clusters" && (
              <>
                <Label className="text-xs text-muted-foreground">Answer with</Label>
                <SelectField value={s.chordAnswer} items={CHORD_ANSWERS} onChange={(v) => update({ chordAnswer: v })} />
                <Label className="text-xs text-muted-foreground">Chord types</Label>
                <ToggleGroup
                  multiple
                  variant="outline"
                  size="sm"
                  className="flex-wrap"
                  value={s.chordCategories}
                  onValueChange={(v) => update({ chordCategories: v as ChordCategory[] })}
                >
                  {(Object.keys(CHORD_CATEGORY_LABELS) as ChordCategory[]).map((c) => (
                    <ToggleGroupItem key={c} value={c} className="h-6 px-2 text-xs">
                      {CHORD_CATEGORY_LABELS[c]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Label className="text-xs text-muted-foreground">Voicings</Label>
                <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={s.chordVoicings} onValueChange={(v) => update({ chordVoicings: v as Voicing[] })}>
                  {(Object.keys(VOICING_LABELS) as Voicing[]).map((v) => (
                    <ToggleGroupItem key={v} value={v} className="h-6 px-2 text-xs">
                      {VOICING_LABELS[v]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Label className="gap-2">
                  <Switch size="sm" checked={s.chordInversions} onCheckedChange={(v) => update({ chordInversions: v })} />
                  Use inversions
                </Label>
                {s.chordInversions && s.chordAnswer === "root-quality" && (
                  <Label className="gap-2">
                    <Switch size="sm" checked={s.chordAskInversion} onCheckedChange={(v) => update({ chordAskInversion: v })} />
                    Ask for the inversion too
                  </Label>
                )}
              </>
            )}
            {s.chordKind !== "chords" && (
              <>
                <Label className="flex justify-between">
                  <span>Cluster size</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.clusterMin}–{s.clusterMax} notes
                  </span>
                </Label>
                <Slider
                  min={2}
                  max={6}
                  step={1}
                  value={[s.clusterMin, s.clusterMax]}
                  onValueChange={(v) => {
                    if (Array.isArray(v) && v.length === 2) update({ clusterMin: v[0], clusterMax: v[1] });
                  }}
                />
                <SliderField label="Cluster span" value={s.clusterSpan} display={`${s.clusterSpan} semitones`} min={6} max={36} onChange={(v) => update({ clusterSpan: v })} />
              </>
            )}
            {(s.chordKind !== "chords" || s.chordAnswer === "notes") && (
              <>
                <Label className="text-xs text-muted-foreground">Note order</Label>
                <SelectField value={s.chordNotesOrder} items={NOTES_ORDER} onChange={(v) => update({ chordNotesOrder: v })} />
              </>
            )}
            <Label className="text-xs text-muted-foreground">Playback</Label>
            <SelectField value={s.chordPlayback} items={CHORD_PLAYBACK} onChange={(v) => update({ chordPlayback: v })} />
            <Separator />
          </section>
        )}

        {mode === "cents" && (
          <section className="flex flex-col gap-2">
            <Label>Cents</Label>
            <SelectField value={s.centsVariant} items={CENTS_VARIANTS} onChange={(v) => update({ centsVariant: v })} />
            <Label className="flex justify-between">
              <span>Detune range</span>
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
                if (Array.isArray(v) && v.length === 2) update({ centsMin: v[0], centsMax: v[1] });
              }}
            />
            {s.centsVariant === "single" && (
              <SliderField
                label="Chance the note is perfectly in tune"
                value={Math.round(s.centsInTuneChance * 100)}
                display={`${Math.round(s.centsInTuneChance * 100)}%`}
                min={0}
                max={50}
                step={5}
                onChange={(v) => update({ centsInTuneChance: v / 100 })}
              />
            )}
            <Separator />
          </section>
        )}

        {mode === "scales" && (
          <section className="flex flex-col gap-2">
            <Label>Scales & modes</Label>
            <SelectField value={s.scaleVariant} items={SCALE_VARIANTS} onChange={(v) => update({ scaleVariant: v })} />
            {s.scaleVariant !== "melody" && <SelectField value={s.scaleDirection} items={SCALE_DIRECTIONS} onChange={(v) => update({ scaleDirection: v })} />}
            <Label className="gap-2">
              <Switch size="sm" checked={s.scaleAskTonic} onCheckedChange={(v) => update({ scaleAskTonic: v })} />
              Ask for the tonic too (buttons, piano or keyboard)
            </Label>
            {s.scaleVariant !== "melody" && <SliderField label="Run speed" value={s.scaleRunNoteMs} display={`${s.scaleRunNoteMs} ms per note`} min={150} max={600} step={10} onChange={(v) => update({ scaleRunNoteMs: v })} />}
            {s.scaleVariant !== "run" && (
              <>
                <SliderField label="Melody length" value={s.scaleMelodyNotes} display={`${s.scaleMelodyNotes} notes`} min={5} max={14} onChange={(v) => update({ scaleMelodyNotes: v })} />
                <SliderField label="Melody tempo" value={s.scaleMelodyBpm} display={`${s.scaleMelodyBpm} bpm`} min={60} max={160} step={2} onChange={(v) => update({ scaleMelodyBpm: v })} />
              </>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Scales to ask (none ticked = all)</Label>
              {s.scaleSet.length > 0 && (
                <Button variant="ghost" size="xs" onClick={() => update({ scaleSet: [] })}>
                  All
                </Button>
              )}
            </div>
            {scalesByCategory([]).map((g) => (
              <div key={g.category} className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">{SCALE_CATEGORY_LABELS[g.category]}</span>
                <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={s.scaleSet} onValueChange={(v) => update({ scaleSet: v as string[] })}>
                  {g.items.map((sc) => (
                    <ToggleGroupItem key={sc.id} value={sc.id} className="h-6 px-2 text-xs" title={sc.tell}>
                      {sc.short}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            ))}
            <Separator />
          </section>
        )}

        {/* ---------- instrument ---------- */}
        <section className="flex flex-col gap-2">
          <Label>Instrument</Label>
          {isRoulette ? (
            <p className="text-xs text-muted-foreground">Roulette draws from every instrument and synth, rotating every question. Tiers still apply.</p>
          ) : (
            <SelectField value={s.instrumentMode} items={INSTRUMENT_MODES} onChange={(v) => update({ instrumentMode: v })} />
          )}
          {s.instrumentMode === "fixed" && !isRoulette ? (
            <InstrumentSelect size="sm" value={s.instrumentId} onChange={(id) => update({ instrumentId: id })} instruments={availableInstruments} />
          ) : (
            <>
              <Label className="text-xs text-muted-foreground">Tiers</Label>
              <ToggleGroup multiple variant="outline" size="sm" value={s.tiers} onValueChange={(v) => update({ tiers: v as InstrumentTier[] })}>
                {TIERS.map((t) => (
                  <ToggleGroupItem key={t.id} value={t.id}>
                    {t.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {!isRoulette && (
                <>
                  <Label className="text-xs text-muted-foreground">Instrument pool</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      items={POOL_MODES}
                      value={s.poolMode}
                      onValueChange={(v) => {
                        if (!v) return;
                        const m = v as PoolMode;
                        if (m === "all" || m === "everything") update({ poolMode: m, families: [] });
                        else if (m === "random") update({ poolMode: m, families: rollFamilies() });
                        else update({ poolMode: m });
                      }}
                    >
                      <SelectTrigger size="sm" className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(POOL_MODES).map(([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(s.poolMode === "random" || s.poolMode === "custom") && (
                      <Button variant="outline" size="sm" onClick={() => update({ families: rollFamilies() })}>
                        <DicesIcon /> Random
                      </Button>
                    )}
                  </div>
                  {s.poolMode === "everything" && (
                    <p className="text-xs text-muted-foreground">Every question a different instrument or synth. Add the Chaos tier for the random synth that invents a new timbre per note.</p>
                  )}
                  {s.poolMode === "random" && (
                    <div className="flex flex-wrap gap-1">
                      {s.families.map((f) => (
                        <Badge key={f} variant="secondary">
                          {FAMILY_LABELS[f]}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {s.poolMode === "custom" && (
                    <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={s.families} onValueChange={(v) => update({ families: v as InstrumentFamily[] })}>
                      {FAMILY_ORDER.map((f) => (
                        <ToggleGroupItem key={f} value={f} className="h-6 px-2 text-xs">
                          {FAMILY_LABELS[f]}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  )}
                  {s.poolMode === "custom" && s.families.length === 0 && <p className="text-xs text-muted-foreground">Nothing selected = all families.</p>}
                </>
              )}
            </>
          )}
          <Label className="gap-2">
            <Switch size="sm" checked={s.useRealisticRange} onCheckedChange={(v) => update({ useRealisticRange: v })} />
            Keep notes inside each instrument&apos;s real range
          </Label>
          <AudioDiagnostics />
        </section>

        <Separator />

        {/* ---------- notes ---------- */}
        {showNotesRange && (
          <>
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Pitch classes</Label>
                <div className="flex gap-1">
                  <Button variant="ghost" size="xs" onClick={() => update({ pitchClasses: Array(12).fill(true) })}>
                    All
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => update({ pitchClasses: Array(12).fill(false) })}>
                    None
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {PITCH_CLASS_SHORT.map((name, i) => (
                  <Label key={name} className="gap-1.5 text-xs">
                    <Checkbox checked={s.pitchClasses[i]} onCheckedChange={(v) => setPitchClass(i, v)} />
                    {name}
                  </Label>
                ))}
              </div>
              <Label className="mt-1 flex justify-between">
                <span>Range</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {noteName(s.rangeLow)} – {noteName(s.rangeHigh)}
                </span>
              </Label>
              <Slider
                min={MIDI_MIN}
                max={MIDI_MAX}
                step={1}
                value={[s.rangeLow, s.rangeHigh]}
                onValueChange={(v) => {
                  if (Array.isArray(v) && v.length === 2) update({ rangeLow: v[0], rangeHigh: v[1] });
                }}
              />
            </section>
            <Separator />
          </>
        )}

        {/* ---------- answering ---------- */}
        <section className="flex flex-col gap-2">
          <Label>Answer with</Label>
          {showAnswerMode && (
            <RadioGroup value={s.answerMode} onValueChange={(v) => update({ answerMode: v as AnswerMode })}>
              <Label className="gap-2 font-normal">
                <RadioGroupItem value="pitch-octave" /> Pitch + octave (e.g. C♯4)
              </Label>
              <Label className="gap-2 font-normal">
                <RadioGroupItem value="pitch-class" /> Pitch class only (e.g. C♯)
              </Label>
            </RadioGroup>
          )}
          <Label className="gap-2">
            <Switch size="sm" checked={s.keyboardShortcuts} onCheckedChange={(v) => update({ keyboardShortcuts: v })} />
            Answer with letter keys (A W S E D F T G Y H U J, octave Z / X / 0–8)
          </Label>
          <p className="touch:hidden text-xs text-muted-foreground">Space (start, hear again, hear next), Enter, R, C and Esc always work.</p>
          <Label className="gap-2">
            <Switch size="sm" checked={s.midiInput} onCheckedChange={(v) => update({ midiInput: v })} />
            Answer on the USB piano
          </Label>
          {s.midiInput && <MidiPanel />}
          <Label className="mt-1 text-xs text-muted-foreground">On-screen piano</Label>
          <PianoPrefsFields />
        </section>

        <Separator />

        {/* ---------- quiz flow ---------- */}
        <section className="flex flex-col gap-2">
          <Label htmlFor="question-count" className="flex justify-between">
            <span>Number of questions</span>
            <span className="text-xs text-muted-foreground">0 = never-ending</span>
          </Label>
          <Input id="question-count" type="number" min={0} value={s.questionCount} onChange={(e) => update({ questionCount: Math.max(0, Number(e.target.value) || 0) })} />
          <Label className="gap-2">
            <Switch size="sm" checked={s.autoProceed} onCheckedChange={(v) => update({ autoProceed: v })} />
            Auto proceed after a right answer
          </Label>
          <p className="text-xs text-muted-foreground">A wrong answer always waits: read the correction, then Space (or click Hear next).</p>
          <Label>Replays</Label>
          <SelectField value={s.replayLimit} items={REPLAY_LIMITS} onChange={(v) => update({ replayLimit: v })} />
          <SliderField label="Note length" value={s.noteDurationMs} display={`${(s.noteDurationMs / 1000).toFixed(1)}s`} min={200} max={4000} step={100} onChange={(v) => update({ noteDurationMs: v })} />
          <Label className="gap-2">
            <Switch size="sm" checked={s.adaptive} onCheckedChange={(v) => update({ adaptive: v })} />
            Adaptive: ask more of what you miss
          </Label>
        </section>

        <Button variant="ghost" size="sm" disabled={disabled} onClick={reset}>
          Reset to defaults
        </Button>
      </CardContent>
    </Card>
  );
}
