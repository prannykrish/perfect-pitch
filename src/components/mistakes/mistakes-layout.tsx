"use client";

import { useEffect } from "react";
import { getEngine } from "@/lib/audio/engine";
import { useUiStore } from "@/lib/ui-store";
import { useIsPhone } from "@/lib/hooks/use-media";
import { MistakesSettingsPanel } from "@/components/mistakes/mistakes-settings";
import { MistakesTrainer } from "@/components/mistakes/mistakes-trainer";
import { LevelRunBar } from "@/components/practice/level-run-bar";
import { SettingsToggle } from "@/components/settings-drawer";
import { StagePanel } from "@/components/phone-stage";
import { cn } from "@/lib/utils";

export function MistakesLayout() {
  const settingsOpen = useUiStore((s) => s.mistakesSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setMistakesSettingsOpen);
  const phone = useIsPhone();
  const showColumn = settingsOpen && !phone;

  useEffect(() => {
    getEngine()
      .checkSamples()
      .catch(() => {});
  }, []);

  // The phone: the quiz is one fixed screen (see phone-stage.tsx); the level bar and the settings live in its side panel.
  if (phone) {
    return (
      <>
        <MistakesTrainer />
        <StagePanel title="Find the Mistake">
          <p className="text-sm text-muted-foreground">A melody, progression or texture with exactly one planted problem. Point at where it is and say what the fix is.</p>
          <LevelRunBar store="mistakes" />
          <MistakesSettingsPanel />
        </StagePanel>
      </>
    );
  }

  return (
    <div className={cn("grid gap-4", showColumn ? "lg:grid-cols-[340px_1fr]" : "grid-cols-1")}>
      {showColumn && (
        <aside className="order-2 lg:order-1">
          <MistakesSettingsPanel />
        </aside>
      )}
      <section className="order-1 flex flex-col gap-4 lg:order-2">
        <div className="flex items-start gap-2">
          <SettingsToggle open={settingsOpen} onOpenChange={setSettingsOpen}>
            <MistakesSettingsPanel />
          </SettingsToggle>
          <div>
            <h1 className="text-xl font-semibold">Find the Mistake</h1>
            <p className="text-sm text-muted-foreground">The producer-feedback drill. A melody, progression or texture with exactly one planted problem. Point at where it is and say what the fix is.</p>
          </div>
        </div>
        <LevelRunBar store="mistakes" />
        <MistakesTrainer />
      </section>
    </div>
  );
}
