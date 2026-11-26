"use client";

import { useEffect } from "react";
import { CheckIcon, Undo2Icon, XIcon } from "lucide-react";
import { useLatest } from "@/lib/hooks/use-latest";

/** Backspace = undo, Enter = submit, while `active`. */
export function useEntryShortcuts(active: boolean, onUndo: () => void, onSubmit?: () => void) {
  const undoRef = useLatest(onUndo);
  const submitRef = useLatest(onSubmit);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        undoRef.current();
      } else if (e.key === "Enter") {
        e.preventDefault();
        submitRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, undoRef, submitRef]);
}
import { noteName, PITCH_CLASS_SHORT, pitchClassOf } from "@/lib/music/notes";
import { useIsPhone } from "@/lib/hooks/use-media";
import { usePianoPrefs } from "@/lib/piano-prefs";
import type { AnswerMode } from "@/lib/trainer/settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { PianoKeyboard, type KeyHighlight } from "@/components/piano-keyboard";
import { PitchClassGrid } from "@/components/trainer/pitch-class-grid";
import { OctaveChips } from "@/components/trainer/octave-chips";
import { cn } from "@/lib/utils";

export interface NoteEntryProps {
  answerMode: AnswerMode;
  /** Entered notes so far: MIDI numbers (pitch-octave) or pitch classes (pitch-class). */
  entries: number[];
  /** Expected number of entries, shown as slots. */
  count?: number;
  onAdd: (midi: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onSubmit?: () => void;
  disabled?: boolean;
  pianoRange: [number, number];
  highlights?: Partial<Record<number, KeyHighlight>>;
  octave: number;
  setOctave: (o: number) => void;
  showKeys?: boolean;
  /** Per-entry state after answering. */
  entryStates?: ("correct" | "wrong")[];
  /** Hint under the slots, e.g. "in order" / "any order". */
  hint?: string;
}

function label(value: number, mode: AnswerMode) {
  return mode === "pitch-octave" ? noteName(value) : PITCH_CLASS_SHORT[pitchClassOf(value)];
}

export function NoteEntry({
  answerMode,
  entries,
  count,
  onAdd,
  onUndo,
  onClear,
  onSubmit,
  disabled,
  pianoRange,
  highlights,
  octave,
  setOctave,
  showKeys = true,
  entryStates,
  hint,
}: NoteEntryProps) {
  const slots = count ?? Math.max(entries.length, 1);
  // The phone's fixed screen has room for one way of answering at a time (see piano-prefs.ts).
  const phone = useIsPhone();
  const phoneInput = usePianoPrefs((s) => s.phoneInput);
  const showPiano = answerMode === "pitch-octave" && (!phone || phoneInput === "piano");
  const showButtons = answerMode !== "pitch-octave" || !phone || phoneInput === "buttons";
  return (
    <div className="flex min-h-0 shrink flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: slots }, (_, i) => {
          const v = entries[i];
          const st = entryStates?.[i];
          return (
            <Badge
              key={i}
              variant={v === undefined ? "outline" : "secondary"}
              className={cn(
                "h-8 min-w-12 justify-center text-sm tabular-nums",
                st === "correct" && "border-green-500 bg-green-500/15 text-green-600 dark:text-green-400",
                st === "wrong" && "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400"
              )}
            >
              {v === undefined ? "·" : label(v, answerMode)}
            </Badge>
          );
        })}
        {count === undefined && entries.length > slots && null}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        {/* On a phone the three buttons take a row of their own ABOVE the slots: the slots cannot be tapped, so they are what sits next to the keys. */}
        <div className="ml-auto flex gap-1 max-md:order-first max-md:w-full max-md:justify-end">
          <Button variant="ghost" size="sm" onClick={onUndo} disabled={disabled || entries.length === 0}>
            <Undo2Icon /> Undo <Kbd>⌫</Kbd>
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={disabled || entries.length === 0}>
            <XIcon /> Clear
          </Button>
          {onSubmit && (
            <Button size="sm" onClick={onSubmit} disabled={disabled || entries.length === 0}>
              <CheckIcon /> Answer <Kbd>Enter</Kbd>
            </Button>
          )}
        </div>
      </div>
      {showPiano && <PianoKeyboard low={pianoRange[0]} high={pianoRange[1]} onKey={onAdd} highlights={highlights} disabled={disabled} fill={phone} />}
      {answerMode === "pitch-octave" && showButtons && <OctaveChips octave={octave} setOctave={setOctave} />}
      {showButtons && <PitchClassGrid onSelect={(pc) => onAdd((octave + 1) * 12 + pc)} disabled={disabled} showKeys={showKeys} />}
    </div>
  );
}
