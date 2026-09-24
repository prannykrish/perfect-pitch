"use client";

import { useEffect } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { useUiStore, type TranscribeTabId } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TranscribeSettingsPanel } from "@/components/transcribe/transcribe-settings";
import { TranscribeTrainer } from "@/components/transcribe/transcribe-trainer";
import { ShadowMode } from "@/components/transcribe/shadow-mode";
import { cn } from "@/lib/utils";

export function TranscribeTabs() {
  const tab = useUiStore((s) => s.transcribeTab);
  const setTab = useUiStore((s) => s.setTranscribeTab);
  const settingsOpen = useUiStore((s) => s.transcribeSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setTranscribeSettingsOpen);

  useEffect(() => {
    getEngine()
      .checkSamples()
      .catch(() => {});
    // /transcribe?tab=shadow (from the practice calendar)
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "shadow" || t === "phrases") setTab(t);
  }, [setTab]);

  return (
    <div className={cn("grid gap-4", settingsOpen ? "lg:grid-cols-[340px_1fr]" : "grid-cols-1")}>
      {settingsOpen && (
        <aside className="order-2 lg:order-1">
          <TranscribeSettingsPanel />
        </aside>
      )}
      <section className="order-1 flex flex-col gap-4 lg:order-2">
        <div>
          <h1 className="text-xl font-semibold">Hear It, Play It</h1>
          <p className="text-sm text-muted-foreground">The app plays music it knows note for note. You play it back on the USB piano. It grades and shows the diff.</p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v) as TranscribeTabId)}>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="outline" size="icon-sm" aria-label={settingsOpen ? "Hide settings" : "Show settings"} onClick={() => setSettingsOpen(!settingsOpen)} />}
              >
                {settingsOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
              </TooltipTrigger>
              <TooltipContent>{settingsOpen ? "Hide settings" : "Show settings"}</TooltipContent>
            </Tooltip>
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="phrases">Phrases</TabsTrigger>
              <TabsTrigger value="shadow">Shadow mode</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="phrases">{tab === "phrases" && <TranscribeTrainer />}</TabsContent>
          <TabsContent value="shadow">{tab === "shadow" && <ShadowMode />}</TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
