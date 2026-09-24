"use client";

import { useEffect } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { useUiStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MistakesSettingsPanel } from "@/components/mistakes/mistakes-settings";
import { MistakesTrainer } from "@/components/mistakes/mistakes-trainer";
import { cn } from "@/lib/utils";

export function MistakesLayout() {
  const settingsOpen = useUiStore((s) => s.mistakesSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setMistakesSettingsOpen);

  useEffect(() => {
    getEngine()
      .checkSamples()
      .catch(() => {});
  }, []);

  return (
    <div className={cn("grid gap-4", settingsOpen ? "lg:grid-cols-[340px_1fr]" : "grid-cols-1")}>
      {settingsOpen && (
        <aside className="order-2 lg:order-1">
          <MistakesSettingsPanel />
        </aside>
      )}
      <section className="order-1 flex flex-col gap-4 lg:order-2">
        <div className="flex items-start gap-2">
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" size="icon-sm" aria-label={settingsOpen ? "Hide settings" : "Show settings"} onClick={() => setSettingsOpen(!settingsOpen)} />}>
              {settingsOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
            </TooltipTrigger>
            <TooltipContent>{settingsOpen ? "Hide settings" : "Show settings"}</TooltipContent>
          </Tooltip>
          <div>
            <h1 className="text-xl font-semibold">Find the Mistake</h1>
            <p className="text-sm text-muted-foreground">The producer-feedback drill. A melody, progression or texture with exactly one planted problem. Point at where it is and say what the fix is.</p>
          </div>
        </div>
        <MistakesTrainer />
      </section>
    </div>
  );
}
