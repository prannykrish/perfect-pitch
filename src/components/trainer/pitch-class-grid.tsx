"use client";

import { PITCH_CLASS_LABELS } from "@/lib/music/notes";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export const PC_KEYS = ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J"] as const;

export function PitchClassGrid({
  onSelect,
  disabled,
  states = {},
  showKeys = true,
}: {
  onSelect: (pitchClass: number) => void;
  disabled?: boolean;
  states?: Partial<Record<number, "correct" | "wrong">>;
  showKeys?: boolean;
}) {
  return (
    // One row of twelve on the laptop; two rows of six on a phone, each button a thumb wide.
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12 sm:gap-2">
      {PITCH_CLASS_LABELS.map((label, pc) => {
        const state = states[pc];
        return (
          <Button
            key={pc}
            variant="outline"
            disabled={disabled}
            onClick={() => onSelect(pc)}
            className={cn(
              "h-14 flex-col gap-0.5 px-1 text-sm font-semibold",
              state === "correct" && "border-green-500 bg-green-500/15 text-green-600 dark:text-green-400",
              state === "wrong" && "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400"
            )}
          >
            {/* the zero-width space lets "C♯/D♭" break after the slash where the button is narrow */}
            <span className="text-center leading-none max-sm:leading-tight max-sm:whitespace-normal">{label.replace("/", "/\u200b")}</span>
            {showKeys && <Kbd className="h-4 min-w-4 text-[10px]">{PC_KEYS[pc]}</Kbd>}
          </Button>
        );
      })}
    </div>
  );
}
