"use client";

import { useEffect } from "react";
import { getEngine } from "@/lib/audio/engine";
import { useUiStore, type ComposeTabId } from "@/lib/ui-store";
import { useIsPhone } from "@/lib/hooks/use-media";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComposeSettingsPanel } from "@/components/compose/compose-settings";
import { MidiMonitor } from "@/components/compose/midi-monitor";
import { TheoryDrill } from "@/components/compose/theory-drill";
import { PromptDrill } from "@/components/compose/prompt-drill";
import { HumDrill } from "@/components/compose/hum-drill";
import { LevelRunBar } from "@/components/practice/level-run-bar";
import { SettingsToggle } from "@/components/settings-drawer";
import { NeedsPianoNote } from "@/components/needs-piano-note";
import { cn } from "@/lib/utils";

export function ComposeLayout() {
  const settingsOpen = useUiStore((s) => s.composeSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setComposeSettingsOpen);
  const tab = useUiStore((s) => s.composeTab);
  const setTab = useUiStore((s) => s.setComposeTab);
  // On a phone the settings are a drawer opened from the sliders button, not a column.
  const phone = useIsPhone();
  const showColumn = settingsOpen && !phone;

  useEffect(() => {
    getEngine()
      .checkSamples()
      .catch(() => {});
    // /compose?tab=theory (from the practice calendar)
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "monitor" || t === "theory" || t === "prompt" || t === "hum") setTab(t);
  }, [setTab]);

  return (
    <div className={cn("grid gap-4", showColumn ? "lg:grid-cols-[340px_1fr]" : "grid-cols-1")}>
      {showColumn && (
        <aside className="order-2 lg:order-1">
          <ComposeSettingsPanel />
        </aside>
      )}
      <section className="order-1 flex flex-col gap-4 lg:order-2">
        <div>
          <h1 className="text-xl font-semibold">Head to Keys</h1>
          <p className="text-sm text-muted-foreground">Hear it in your head, play it immediately. The piano is where it happens; the app is the judge and the rep counter.</p>
        </div>
        <NeedsPianoNote />
        <LevelRunBar store="compose" />
        <Tabs value={tab} onValueChange={(v) => setTab(String(v) as ComposeTabId)}>
          <div className="flex items-center gap-2">
            <SettingsToggle open={settingsOpen} onOpenChange={setSettingsOpen}>
              <ComposeSettingsPanel />
            </SettingsToggle>
            <TabsList variant="line" className="w-full justify-start overflow-x-auto">
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
