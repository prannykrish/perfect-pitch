"use client";

import { INSTRUMENTS } from "@/lib/audio/instruments";
import { isInstrumentAvailable, useEngineStore } from "@/lib/audio/engine";
import { PITCH_CLASS_SHORT } from "@/lib/music/notes";
import { GRID_LABELS, type QuantizeGrid } from "@/lib/midi/take-tools";
import { useComposeSettings } from "@/lib/compose/settings";
import { LEVEL_LABELS, MAX_LEVEL, STRICTNESS_LABELS, THEORY_KIND_LABELS, THEORY_KINDS, type Strictness, type TheoryKind } from "@/lib/compose/theory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { InstrumentSelect } from "@/components/instrument-select";
import { MidiPanel } from "@/components/midi-panel";

const KEYS: Record<string, string> = { "-1": "Random key", ...Object.fromEntries(PITCH_CLASS_SHORT.map((n, i) => [String(i), n])) };
const LEVELS: Record<string, string> = Object.fromEntries(Array.from({ length: MAX_LEVEL }, (_, i) => [String(i + 1), `${i + 1} · ${LEVEL_LABELS[i + 1]}`]));

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

export function ComposeSettingsPanel() {
  const { settings: s, update, reset } = useComposeSettings();
  const samples = useEngineStore((st) => st.samples);
  const vendored = useEngineStore((st) => st.vendored);
  const instruments = INSTRUMENTS.filter((d) => isInstrumentAvailable(d, { samples, vendored }));

  return (
    <Card size="sm" className="h-fit">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <Label>Playback instrument</Label>
          <InstrumentSelect size="sm" value={s.instrumentId} onChange={(id) => update({ instrumentId: id })} instruments={instruments} />
          <MidiPanel />
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>Theory drills</Label>
          <Label className="text-xs text-muted-foreground">Level</Label>
          <SelectField value={String(s.theoryLevel)} items={LEVELS} onChange={(v) => update({ theoryLevel: Number(v) })} />
          <SwitchRow checked={s.theoryMixLower} onChange={(v) => update({ theoryMixLower: v })}>
            Mix in everything below this level too
          </SwitchRow>
          <Label className="text-xs text-muted-foreground">Kinds (none = all)</Label>
          <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={s.theoryKinds} onValueChange={(v) => update({ theoryKinds: v as TheoryKind[] })}>
            {THEORY_KINDS.map((k) => (
              <ToggleGroupItem key={k} value={k} className="h-6 px-2 text-xs">
                {THEORY_KIND_LABELS[k]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Label className="text-xs text-muted-foreground">Grading</Label>
          <SelectField value={s.theoryStrictness} items={STRICTNESS_LABELS as Record<Strictness, string>} onChange={(v) => update({ theoryStrictness: v })} />
          <SliderField label="Answer after silence" value={s.theoryAutoSubmitMs} display={`${(s.theoryAutoSubmitMs / 1000).toFixed(1)}s`} min={500} max={4000} step={100} onChange={(v) => update({ theoryAutoSubmitMs: v })} />
          <SwitchRow checked={s.theoryAutoProceed} onChange={(v) => update({ theoryAutoProceed: v })}>
            Auto proceed after a right answer
          </SwitchRow>
          <SwitchRow checked={s.theoryPlayReference} onChange={(v) => update({ theoryPlayReference: v })}>
            Play the answer first, then you play it (easing in)
          </SwitchRow>
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>Prompt drill</Label>
          <SelectField value={String(s.promptKey)} items={KEYS} onChange={(v) => update({ promptKey: Number(v) })} />
          <Label className="flex justify-between">
            <span>Tempo range</span>
            <span className="font-mono text-xs text-muted-foreground">
              {s.promptBpmMin}–{s.promptBpmMax} bpm
            </span>
          </Label>
          <Slider
            min={50}
            max={160}
            step={2}
            value={[s.promptBpmMin, s.promptBpmMax]}
            onValueChange={(v) => {
              if (Array.isArray(v) && v.length === 2) update({ promptBpmMin: v[0], promptBpmMax: v[1] });
            }}
          />
          <SliderField label="Bars per take" value={s.promptBars} display={String(s.promptBars)} min={1} max={8} onChange={(v) => update({ promptBars: v })} />
          <SliderField label="Seconds to imagine it" value={s.promptCountdownSec} display={`${s.promptCountdownSec}s`} min={3} max={20} onChange={(v) => update({ promptCountdownSec: v })} />
          <SwitchRow checked={s.promptSevenths} onChange={(v) => update({ promptSevenths: v })}>
            Seventh chords in the progression
          </SwitchRow>
          <SwitchRow checked={s.promptMood} onChange={(v) => update({ promptMood: v })}>
            Give a mood word
          </SwitchRow>
          <SwitchRow checked={s.promptSeed} onChange={(v) => update({ promptSeed: v })}>
            Play a one-bar seed motif to start from
          </SwitchRow>
          <SwitchRow checked={s.promptClick} onChange={(v) => update({ promptClick: v })}>
            Click track (count-in and during the take)
          </SwitchRow>
          <SwitchRow checked={s.promptBacking} onChange={(v) => update({ promptBacking: v })}>
            Play the chords softly underneath
          </SwitchRow>
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>Hum then play</Label>
          <SwitchRow checked={s.humOctaveInsensitive} onChange={(v) => update({ humOctaveInsensitive: v })}>
            Accept the right note in any octave
          </SwitchRow>
          <SliderField label="Pitch confidence needed" value={Math.round(s.humMinClarity * 100)} display={`${Math.round(s.humMinClarity * 100)}%`} min={70} max={98} onChange={(v) => update({ humMinClarity: v / 100 })} />
          <SliderField label="Mic level needed" value={Math.round(s.humMinLevel * 1000)} display={`${(s.humMinLevel * 100).toFixed(1)}%`} min={2} max={50} onChange={(v) => update({ humMinLevel: v / 1000 })} />
          <SliderField label="Shortest note" value={s.humMinNoteMs} display={`${s.humMinNoteMs} ms`} min={50} max={300} step={10} onChange={(v) => update({ humMinNoteMs: v })} />
          <SliderField label="Stop humming after silence" value={s.humSilenceMs} display={`${(s.humSilenceMs / 1000).toFixed(1)}s`} min={800} max={4000} step={100} onChange={(v) => update({ humSilenceMs: v })} />
          <SliderField label="Answer after silence (playing)" value={s.humPlaySilenceMs} display={`${(s.humPlaySilenceMs / 1000).toFixed(1)}s`} min={800} max={4000} step={100} onChange={(v) => update({ humPlaySilenceMs: v })} />
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <Label>Recorder</Label>
          <SliderField label="Tempo for quantize and export" value={s.recBpm} display={`${s.recBpm} bpm`} min={40} max={200} onChange={(v) => update({ recBpm: v })} />
          <Label className="text-xs text-muted-foreground">Quantize grid</Label>
          <SelectField value={String(s.quantizeGrid)} items={Object.fromEntries(Object.entries(GRID_LABELS)) as Record<string, string>} onChange={(v) => update({ quantizeGrid: Number(v) as QuantizeGrid })} />
        </section>

        <Button variant="ghost" size="sm" onClick={reset}>
          Reset to defaults
        </Button>
      </CardContent>
    </Card>
  );
}
