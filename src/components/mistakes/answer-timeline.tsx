"use client";

/**
 * The shared answer widget for Find the Mistake: the timeline of slots (notes, chords or beats),
 * a voice picker for multi-voice material, the diagnosis picker, and the optional fix / amount
 * pickers. A/B questions show two big buttons instead of the timeline.
 */
import { CheckIcon, Undo2Icon } from "lucide-react";
import { chordQuality, INVERSION_LABELS, VOICING_LABELS } from "@/lib/music/chords";
import { PITCH_CLASS_SHORT } from "@/lib/music/notes";
import { DIAGNOSIS_KEYS, DIAGNOSIS_LABELS, asksAmount, fixKindFor, isDrift, type Answer, type Fix, type ScoredAnswer } from "@/lib/mistakes/types";
import { sameFix } from "@/lib/mistakes/plant";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Asked, QuizPhase } from "./use-mistakes-quiz";

const FIX_QUALITY_IDS = ["maj", "min", "dim", "aug", "sus2", "sus4", "7", "maj7", "m7", "m7b5", "dim7", "mMaj7", "6", "m6", "7sus4"];
const FIX_INVERSIONS: { value: string; label: string }[] = [
  ...[0, 1, 2, 3].map((k) => ({ value: `inv:${k}`, label: INVERSION_LABELS[k] })),
  ...(["closed", "open", "drop2"] as const).map((v) => ({ value: `voicing:${v}`, label: VOICING_LABELS[v] })),
];

const SELECTED = "border-primary bg-primary/15 text-foreground";
const RIGHT = "border-green-500 bg-green-500/15 text-green-600 dark:text-green-400";
const MISSED = "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400";
const PLAYING = "ring-2 ring-primary/60";

export interface AnswerTimelineProps {
  asked: Asked;
  draft: Answer;
  phase: QuizPhase;
  scored: ScoredAnswer | null;
  onPatch: (patch: Partial<Answer>) => void;
  onSubmit: () => void;
  onClear: () => void;
  canSubmit: boolean;
  /** Slot currently sounding (question playback), for the highlight. */
  nowSlot: number | null;
  /** Rendition currently sounding in an A/B question. */
  nowAb: "A" | "B" | null;
  askFix: boolean;
  askAmount: boolean;
  buckets: number[];
}

export function AnswerTimeline({ asked, draft, phase, scored, onPatch, onSubmit, onClear, canSubmit, nowSlot, nowAb, askFix, askAmount, buckets }: AnswerTimelineProps) {
  const { q, planted, material, diagnoses } = asked;
  const answering = phase === "question";
  const answered = phase === "answered";
  const multiVoice = material.voices.length > 1 && planted.slotKind === "beat";
  const drift = isDrift(draft.diagnosis);

  const state = (picked: boolean, right: boolean) => cn(answering && picked && SELECTED, answered && right && RIGHT, answered && picked && !right && MISSED);

  // ----- A/B -----
  if (q.type === "ab") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Label className="mb-2 text-xs text-muted-foreground">Which rendition is clean?</Label>
          <div className="grid grid-cols-2 gap-3">
            {(["A", "B"] as const).map((c) => (
              <Button
                key={c}
                variant="outline"
                size="lg"
                disabled={!answering}
                onClick={() => onPatch({ choice: c })}
                className={cn("h-16 text-2xl font-semibold", state(draft.choice === c, q.cleanIs === c), answering && nowAb === c && PLAYING)}
              >
                {c} <Kbd className="ml-2">{c}</Kbd>
                {answering && nowAb === c && <span className="ml-2 text-xs font-normal text-muted-foreground">playing</span>}
              </Button>
            ))}
          </div>
        </div>
        {askFix && (
          <DiagnosisRow label="What was wrong with the other one? (bonus)" diagnoses={diagnoses} draft={draft} target={planted.diagnosis} answering={answering} answered={answered} onPatch={onPatch} state={state} />
        )}
        {answering && <SubmitRow canSubmit={canSubmit} onSubmit={onSubmit} onClear={onClear} hasDraft={draft.choice !== null || draft.diagnosis !== null} />}
      </div>
    );
  }

  // ----- timeline -----
  const bpb = material.beatsPerBar;
  const barOf = (start: number) => Math.floor(start / bpb + 1e-6);
  const slotWord = planted.slotKind === "chord" ? "chord" : planted.slotKind === "beat" ? "beat" : "note";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground">{drift ? "Which voice? (the beat does not matter for a drift)" : `Which ${slotWord}?`}</Label>
          <span className="touch:hidden text-xs text-muted-foreground">
            <Kbd>1</Kbd>–<Kbd>9</Kbd> <Kbd>0</Kbd> = {slotWord} 10
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-1.5">
          {planted.slots.map((slot, i) => {
            const newBar = i > 0 && barOf(slot.start) !== barOf(planted.slots[i - 1].start);
            const right = planted.acceptIndexes.includes(i) && planted.locationBy !== "voice";
            return (
              <Button
                key={i}
                variant="outline"
                disabled={!answering || drift}
                onClick={() => onPatch({ index: i })}
                className={cn(
                  "h-12 min-w-11 flex-col gap-0 px-2",
                  newBar && "ml-3",
                  state(draft.index === i, right),
                  answered && planted.locationBy === "voice" && planted.acceptIndexes.includes(i) && "border-amber-500/70",
                  answering && nowSlot === i && PLAYING
                )}
              >
                <span className="text-base font-semibold leading-none">{slot.label}</span>
                <span className="text-[10px] leading-none text-muted-foreground">{slot.sub}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {multiVoice && (
        <div>
          <Label className="mb-2 text-xs text-muted-foreground">Which voice?</Label>
          <div className="flex flex-wrap gap-2">
            {material.voices.map((v) => (
              <Button key={v} variant="outline" disabled={!answering} onClick={() => onPatch({ voice: v })} className={cn("h-10 px-4", state(draft.voice === v, planted.voice === v))}>
                {material.voiceNames[v] ?? `Voice ${v + 1}`}
              </Button>
            ))}
          </div>
        </div>
      )}

      <DiagnosisRow label="What is wrong?" diagnoses={diagnoses} draft={draft} target={planted.diagnosis} answering={answering} answered={answered} onPatch={onPatch} state={state} />

      {askFix && fixKindFor(draft.diagnosis) === "note" && (
        <div>
          <Label className="mb-2 text-xs text-muted-foreground">What should the note have been? (bonus · or play it on the piano)</Label>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {PITCH_CLASS_SHORT.map((name, pc) => (
              <Button
                key={pc}
                variant="outline"
                disabled={!answering}
                onClick={() => onPatch({ fix: { kind: "note", pc } })}
                className={cn("h-10 px-1 text-sm font-semibold", state(draft.fix?.kind === "note" && draft.fix.pc === pc, planted.fix?.kind === "note" && planted.fix.pc === pc))}
              >
                {name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {askFix && fixKindFor(draft.diagnosis) === "chord" && (
        <div>
          <Label className="mb-2 text-xs text-muted-foreground">What quality should it have been? (bonus)</Label>
          <div className="flex flex-wrap gap-1.5">
            {FIX_QUALITY_IDS.map((id) => {
              const qual = chordQuality(id);
              return (
                <Button
                  key={id}
                  variant="outline"
                  disabled={!answering}
                  title={qual?.name}
                  onClick={() => onPatch({ fix: { kind: "chord", qualityId: id } })}
                  className={cn("h-10 px-3 text-sm", state(draft.fix?.kind === "chord" && draft.fix.qualityId === id, planted.fix?.kind === "chord" && planted.fix.qualityId === id))}
                >
                  {qual?.suffix || "maj"}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {askFix && fixKindFor(draft.diagnosis) === "inversion" && (
        <div>
          <Label className="mb-2 text-xs text-muted-foreground">What should it have been? (bonus)</Label>
          <div className="flex flex-wrap gap-1.5">
            {FIX_INVERSIONS.map((opt) => (
              <Button
                key={opt.value}
                variant="outline"
                disabled={!answering}
                onClick={() => onPatch({ fix: { kind: "inversion", value: opt.value } })}
                className={cn("h-10 px-3 text-sm", state(draft.fix?.kind === "inversion" && draft.fix.value === opt.value, planted.fix?.kind === "inversion" && planted.fix.value === opt.value))}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {askAmount && asksAmount(draft.diagnosis) && (
        <div>
          <Label className="mb-2 text-xs text-muted-foreground">How far out? (bonus · cents; 100 = one semitone)</Label>
          <div className="flex flex-wrap gap-1.5">
            {buckets.map((b) => (
              <Button
                key={b}
                variant="outline"
                disabled={!answering}
                onClick={() => onPatch({ amount: b })}
                className={cn("h-10 w-14 text-sm tabular-nums", state(draft.amount === b, planted.type === "detune" && Math.abs(planted.cents ?? 0) === b))}
              >
                {b}
              </Button>
            ))}
          </div>
        </div>
      )}

      {answering && <SubmitRow canSubmit={canSubmit} onSubmit={onSubmit} onClear={onClear} hasDraft={draft.index !== null || draft.voice !== null || draft.fix !== null || draft.amount !== null} />}
      {answered && scored && draft.fix && planted.fix && !sameFix(draft.fix, planted.fix) && (
        <p className="text-xs text-muted-foreground">Fix: you said {fixText(draft.fix)}, it was {fixText(planted.fix)}.</p>
      )}
    </div>
  );
}

function fixText(f: Fix) {
  if (f.kind === "note") return PITCH_CLASS_SHORT[f.pc];
  if (f.kind === "chord") return chordQuality(f.qualityId)?.name ?? f.qualityId;
  const [k, v] = f.value.split(":");
  return k === "inv" ? INVERSION_LABELS[Number(v)] : VOICING_LABELS[v as keyof typeof VOICING_LABELS];
}

function DiagnosisRow({
  label,
  diagnoses,
  draft,
  target,
  answering,
  answered,
  onPatch,
  state,
}: {
  label: string;
  diagnoses: Asked["diagnoses"];
  draft: Answer;
  target: Asked["planted"]["diagnosis"];
  answering: boolean;
  answered: boolean;
  onPatch: (p: Partial<Answer>) => void;
  state: (picked: boolean, right: boolean) => string;
}) {
  return (
    <div>
      <Label className="mb-2 text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {diagnoses.map((d) => (
          <Button key={d} variant="outline" disabled={!answering} onClick={() => onPatch({ diagnosis: d })} className={cn("h-10 px-3", state(draft.diagnosis === d, answered && target === d))}>
            {DIAGNOSIS_LABELS[d]} <Kbd className="ml-1">{DIAGNOSIS_KEYS[d]}</Kbd>
          </Button>
        ))}
      </div>
    </div>
  );
}

function SubmitRow({ canSubmit, onSubmit, onClear, hasDraft }: { canSubmit: boolean; onSubmit: () => void; onClear: () => void; hasDraft: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onSubmit} disabled={!canSubmit}>
        <CheckIcon /> Answer <Kbd>Enter</Kbd>
      </Button>
      <Button variant="ghost" onClick={onClear} disabled={!hasDraft}>
        <Undo2Icon /> Clear <Kbd>⌫</Kbd>
      </Button>
      <span className="text-xs text-muted-foreground">
        Answers submit on their own once nothing optional is left; <span className="touch:hidden">press Enter</span>
        <span className="touch:inline hidden">tap Answer</span> to skip the bonus.
      </span>
    </div>
  );
}
