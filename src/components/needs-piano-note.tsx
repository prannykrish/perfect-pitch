import { UsbIcon } from "lucide-react";

/**
 * Shown on phones and tablets at the top of the two tabs that are answered on the USB piano.
 * Their browsers cannot read a USB instrument (no Web MIDI on iOS), so those tabs belong to the laptop.
 */
export function NeedsPianoNote() {
  return (
    <div className="touch:flex hidden items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <UsbIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="font-medium text-foreground">This tab needs the USB piano.</span> A phone or tablet browser cannot read it, so do this one on the laptop. Trainer, Mistakes, Practice and Stats all work here.
      </span>
    </div>
  );
}
