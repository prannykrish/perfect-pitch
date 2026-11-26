"use client";

/**
 * The phone's comfort settings for answering a note: piano or buttons, how much keyboard the
 * piano's window shows, and whether a key needs a second tap. Used in the trainer's settings and
 * on the Settings page. Saved on the device; they never change what a drill asks.
 */
import { usePianoPrefs, type PhoneInput, type WindowOctaves } from "@/lib/piano-prefs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const WIDTHS: { value: WindowOctaves; label: string }[] = [
  { value: 1.5, label: "1½" },
  { value: 2, label: "2" },
  { value: 2.5, label: "2½" },
];

const INPUTS: { value: PhoneInput; label: string }[] = [
  { value: "piano", label: "Piano" },
  { value: "buttons", label: "Buttons" },
];

export function PianoPrefsFields() {
  const phoneInput = usePianoPrefs((s) => s.phoneInput);
  const setPhoneInput = usePianoPrefs((s) => s.setPhoneInput);
  const windowOctaves = usePianoPrefs((s) => s.windowOctaves);
  const setWindowOctaves = usePianoPrefs((s) => s.setWindowOctaves);
  const confirmTaps = usePianoPrefs((s) => s.confirmTaps);
  const setConfirmTaps = usePianoPrefs((s) => s.setConfirmTaps);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="font-normal">Answer on a phone with</Label>
        <ToggleGroup variant="outline" size="sm" value={[phoneInput]} onValueChange={(v) => v[0] !== undefined && setPhoneInput(v[0] as PhoneInput)}>
          {INPUTS.map((i) => (
            <ToggleGroupItem key={i.value} value={i.value} className="px-3">
              {i.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <p className="text-xs text-muted-foreground">The phone shows one at a time, so each gets the whole screen and a stray touch on the other cannot count as an answer. Buttons: pick the octave, then the note.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="font-normal">Octaves the piano shows on a phone</Label>
        <ToggleGroup variant="outline" size="sm" value={[String(windowOctaves)]} onValueChange={(v) => v[0] !== undefined && setWindowOctaves(Number(v[0]) as WindowOctaves)}>
          {WIDTHS.map((w) => (
            <ToggleGroupItem key={w.value} value={String(w.value)} className="w-9">
              {w.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <p className="text-xs text-muted-foreground">Fewer octaves means wider keys. The arrows and the strip above the keys move along the keyboard.</p>
      <Label className="gap-2 font-normal">
        <Switch size="sm" checked={confirmTaps} onCheckedChange={setConfirmTaps} />
        Confirm taps: the first tap lights a key, the second answers
      </Label>
    </div>
  );
}
