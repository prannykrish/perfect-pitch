"use client";

import { detectDialLevel, getDial, type DialId } from "@/lib/practice/difficulty";
import { useTrainerSettings } from "@/lib/trainer/settings";
import { useTranscribeSettings } from "@/lib/transcribe/settings";
import { useMistakesSettings } from "@/lib/mistakes/settings";
import { useComposeSettings } from "@/lib/compose/settings";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * A 1…N difficulty dial for one activity. Picking a number writes that level's full bundle into the
 * activity's settings store; a hand edit of any bundled key shows "custom". Free practice: the dial
 * itself never tags reps for the ladder (Always count still applies if the settings happen to run a
 * drill's test).
 */
export function DifficultyDial({ id, label }: { id: DialId; label?: string }) {
  const dial = getDial(id);
  // every store hook is called unconditionally; only the dial's own store returns its settings
  const trainer = useTrainerSettings((st) => (dial.store === "trainer" ? st.settings : null));
  const transcribe = useTranscribeSettings((st) => (dial.store === "transcribe" ? st.settings : null));
  const mistakes = useMistakesSettings((st) => (dial.store === "mistakes" ? st.settings : null));
  const compose = useComposeSettings((st) => (dial.store === "compose" ? st.settings : null));
  const settings = trainer ?? transcribe ?? mistakes ?? compose ?? {};
  const level = detectDialLevel(dial, settings);
  const current = level === null ? null : dial.levels[level - 1];

  const apply = (n: number) => {
    // narrowing the dial (not the patch) gives the store's own patch type
    const find = <L extends { n: number }>(levels: L[]) => levels.find((l) => l.n === n);
    switch (dial.store) {
      case "trainer": {
        const l = find(dial.levels);
        if (l) useTrainerSettings.getState().update(l.patch);
        break;
      }
      case "transcribe": {
        const l = find(dial.levels);
        if (l) useTranscribeSettings.getState().update(l.patch);
        break;
      }
      case "mistakes": {
        const l = find(dial.levels);
        if (l) useMistakesSettings.getState().update(l.patch);
        break;
      }
      case "compose": {
        const l = find(dial.levels);
        if (l) useComposeSettings.getState().update(l.patch);
        break;
      }
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <Label className="flex items-center justify-between">
        <span className={label ? "text-xs text-muted-foreground" : undefined}>{label ?? `${dial.label} difficulty`}</span>
        {level === null ? (
          <Badge variant="outline" className="text-muted-foreground">
            custom
          </Badge>
        ) : (
          <Badge variant="secondary">level {level}</Badge>
        )}
      </Label>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        className="w-full"
        value={level === null ? [] : [String(level)]}
        onValueChange={(v) => {
          // pressing the active level again deselects it in the group; keep the level instead
          if (v.length) apply(Number(v[0]));
        }}
      >
        {dial.levels.map((l) => (
          <ToggleGroupItem key={l.n} value={String(l.n)} title={l.title} className="h-7 flex-1 px-0 font-mono text-xs">
            {l.n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">
        {current ? (
          <>
            <span className="font-medium text-foreground">
              Level {current.n}: {current.title}.
            </span>{" "}
            {current.summary}
          </>
        ) : (
          "Custom: a setting below was changed by hand. Pick a number to load that level's settings."
        )}
      </p>
      <p className="text-[11px] text-muted-foreground/80">Free practice. The dial never moves you up the ladder.</p>
    </section>
  );
}
