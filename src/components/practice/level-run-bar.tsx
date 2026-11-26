"use client";

/**
 * Which level drill the reps are counting toward and why (a run started from the level card, or
 * "always count" matching the settings), or that they are not counting.
 *
 * `LevelRunBar` is the full bar with buttons to re-apply a run's settings after a hand edit or end
 * the run: at the top of a tab on the laptop, inside the side panel on a phone. `LevelRunFlag` is
 * the same verdict as one coloured flag, for the phone's quiz screen where there is no room for a bar.
 */
import { useEffect } from "react";
import Link from "next/link";
import { FlagIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useTrainerSettings } from "@/lib/trainer/settings";
import { useTranscribeSettings } from "@/lib/transcribe/settings";
import { useMistakesSettings } from "@/lib/mistakes/settings";
import { useComposeSettings } from "@/lib/compose/settings";
import { useUiStore } from "@/lib/ui-store";
import { getLevelState } from "@/lib/db/actions";
import { DRILL_BY_ID, LEVEL_BY_ID, LEVELS, type DrillDef } from "@/lib/practice/levels";
import { matchDrill } from "@/lib/practice/auto-count";
import { useCountPrefs } from "@/lib/practice/count-prefs";
import { reapplyRun, useLevelRun } from "@/lib/practice/level-run";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tone = "on" | "warn" | "off";

interface LevelRunStatus {
  /** on = reps count; warn = a run is open but a setting was changed, so they do not; off = not counting. */
  tone: Tone;
  title: string;
  note: string;
  /** A run is open and can be re-applied. */
  reapply: boolean;
  /** A run is open and can be ended. */
  hasRun: boolean;
}

function useLevelRunStatus(store: DrillDef["store"]): LevelRunStatus | null {
  const run = useLevelRun((s) => s.run);
  const alwaysCount = useCountPrefs((s) => s.alwaysCount);
  const levelId = useCountPrefs((s) => s.levelId);
  const setLevelId = useCountPrefs((s) => s.setLevelId);
  // subscribe to every settings store so a hand edit re-evaluates the snapshot
  const live: Record<DrillDef["store"], Record<string, unknown>> = {
    trainer: useTrainerSettings((s) => s.settings) as unknown as Record<string, unknown>,
    transcribe: useTranscribeSettings((s) => s.settings) as unknown as Record<string, unknown>,
    mistakes: useMistakesSettings((s) => s.settings) as unknown as Record<string, unknown>,
    compose: useComposeSettings((s) => s.settings) as unknown as Record<string, unknown>,
  };
  const modes: Record<DrillDef["store"], string | null> = {
    trainer: useUiStore((s) => s.trainerMode),
    transcribe: useUiStore((s) => s.transcribeTab),
    mistakes: null,
    compose: useUiStore((s) => s.composeTab),
  };

  // keep the cached current level in step with the database
  useEffect(() => {
    getLevelState()
      .then((st) => st && setLevelId(st.currentLevelId))
      .catch(() => {});
  }, [setLevelId]);

  const current = LEVEL_BY_ID.get(levelId) ?? LEVELS[0];
  const ownRun = run && run.store === store ? run : null;
  const intact = !!ownRun && JSON.stringify(ownRun.keys.map((k) => [k, live[ownRun.store][k]])) === ownRun.snapshot;
  const runDrill = ownRun ? DRILL_BY_ID.get(ownRun.drillId) : undefined;
  const runLevel = ownRun ? LEVEL_BY_ID.get(ownRun.levelId) : undefined;
  const auto = alwaysCount && !intact ? matchDrill(current, store, modes[store], live[store]) : undefined;

  if (ownRun && intact && runDrill && runLevel) {
    return { tone: "on", title: `Level ${runLevel.n} · ${runDrill.label}`, note: "settings applied, every rep counts toward the gate", reapply: false, hasRun: true };
  }
  if (auto) {
    const review = !current.drills.some((d) => d.id === auto.id);
    return { tone: "on", title: `Level ${current.n} · ${auto.label}${review ? " (review)" : ""}`, note: "these settings match the drill, so every rep counts (always count is on)", reapply: false, hasRun: !!ownRun };
  }
  if (ownRun && runDrill && runLevel) {
    return { tone: "warn", title: `Level ${runLevel.n} · ${runDrill.label}`, note: "a setting was changed by hand, so reps are not counting", reapply: true, hasRun: true };
  }
  // the monitor tab logs no reps, so there is nothing to say there
  if (alwaysCount && !(store === "compose" && modes.compose === "monitor")) {
    return { tone: "off", title: `Not counting toward level ${current.n}`, note: "these settings don't match any drill on your level; start one from the level card to apply its settings", reapply: false, hasRun: false };
  }
  return null;
}

export function LevelRunBar({ store }: { store: DrillDef["store"] }) {
  const status = useLevelRunStatus(store);
  const end = useLevelRun((s) => s.end);
  if (!status) return null;
  const { tone } = status;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        tone === "on" && "border-primary/40 bg-primary/5",
        tone === "warn" && "border-amber-500/50 bg-amber-500/10",
        tone === "off" && "border-dashed text-muted-foreground"
      )}
    >
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <FlagIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className={cn("font-medium", tone !== "off" && "text-foreground")}>{status.title}</span>
          <span className="text-muted-foreground"> · {status.note}</span>
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {status.reapply && (
          <Button size="sm" variant="outline" onClick={reapplyRun}>
            <RotateCcwIcon /> Re-apply level settings
          </Button>
        )}
        <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/calendar" />}>
          Level card
        </Button>
        {status.hasRun && (
          <Button size="sm" variant="ghost" onClick={end} aria-label="End level run">
            <XIcon /> End run
          </Button>
        )}
      </div>
    </div>
  );
}

/** The bar's verdict as one flag: blue = these reps count toward the level, amber = a run is open but a setting was changed, grey = not counting. */
export function LevelRunFlag({ store, className }: { store: DrillDef["store"]; className?: string }) {
  const status = useLevelRunStatus(store);
  if (!status) return null;
  return (
    <FlagIcon
      role="img"
      aria-label={`${status.title}: ${status.note}`}
      className={cn("size-4 shrink-0", status.tone === "on" && "fill-blue-500/30 text-blue-500", status.tone === "warn" && "fill-amber-500/30 text-amber-500", status.tone === "off" && "text-muted-foreground/60", className)}
    />
  );
}
