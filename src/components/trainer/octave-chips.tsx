"use client";

import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * The 0–8 row that sets the octave the pitch buttons (and letter keys) answer in. Choosing one also
 * moves the phone's piano window to that octave (use-quiz does that). On a phone the nine chips
 * share the full width in one row.
 */
export function OctaveChips({ octave, setOctave }: { octave: number; setOctave: (o: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-sm text-muted-foreground">
        Octave for buttons
        <span className="touch:hidden">
          {" "}
          / keys <Kbd>Z</Kbd> <Kbd>X</Kbd> <Kbd>0-8</Kbd>
        </span>
      </span>
      <ToggleGroup variant="outline" size="sm" className="max-sm:grid max-sm:w-full max-sm:grid-cols-9 max-sm:gap-1" value={[String(octave)]} onValueChange={(v) => v[0] !== undefined && setOctave(Number(v[0]))}>
        {Array.from({ length: 9 }, (_, o) => (
          <ToggleGroupItem key={o} value={String(o)} className="w-8 max-sm:w-auto max-sm:min-w-0">
            {o}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
