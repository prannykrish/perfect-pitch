"use client";

import { useEffect } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { useUiStore, type ComposeTabId } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ComposeSettingsPanel } from "@/components/compose/compose-settings";
import { MidiMonitor } from "@/components/compose/midi-monitor";
import { TheoryDrill } from "@/components/compose/theory-drill";
import { PromptDrill } from "@/components/compose/prompt-drill";
import { HumDrill } from "@/components/compose/hum-drill";
import { cn } from "@/lib/utils";

export function ComposeLayout() {
  const settingsOpen = useUiStore((s) => s.composeSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setComposeSettingsOpen);
  const tab = useUiStore((s) => s.composeTab);
  const setTab = useUiStore((s) => s.setComposeTab);

  useEffect(() => {
    getEngine()
      .checkSamples()
      .catch(() => {});
  }, []);

  return (
    <div className={cn("grid gap-4", settingsOpen ? "lg:grid-cols-[340px_1fr]" : "grid-cols-1")}>
      {settingsOpen && (
        <aside className="order-2 lg:order-1">
          <ComposeSettingsPanel />
        </aside>
      )}
      <section className="order-1 flex flex-col gap-4 lg:order-2">
        <div>
          <h1 className="text-xl font-semibold">Head to Keys</h1>
          <p className="text-sm text-muted-foreground">Hear it in your head, play it immediately. The piano is where it happens; the app is the judge and the rep counter.</p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v) as ComposeTabId)}>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" size="icon-sm" aria-label={settingsOpen ? "Hide settings" : "Show settings"} onClick={() => setSettingsOpen(!settingsOpen)} />}>
                {settingsOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
              </TooltipTrigger>
              <TooltipContent>{settingsOpen ? "Hide settings" : "Show settings"}</TooltipContent>
            </Tooltip>
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="monitor">Monitor & takes</TabsTrigger>
              <TabsTrigger value="theory">Theory drills</TabsTrigger>
              <TabsTrigger value="prompt">Prompt drill</TabsTrigger>
              <TabsTrigger value="hum">Hum then play</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="monitor">{tab === "monitor" && <MidiMonitor />}</TabsContent>
          <TabsContent value="theory">{tab === "theory" && <TheoryDrill />}</TabsContent>
          <TabsContent value="prompt">{tab === "prompt" && <PromptDrill />}</TabsContent>
          <TabsContent value="hum">{tab === "hum" && <HumDrill />}</TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
