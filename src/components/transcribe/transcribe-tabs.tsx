"use client";

import { useEffect } from "react";
import { getEngine } from "@/lib/audio/engine";
import { useUiStore, type TranscribeTabId } from "@/lib/ui-store";
import { useIsPhone } from "@/lib/hooks/use-media";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TranscribeSettingsPanel } from "@/components/transcribe/transcribe-settings";
import { TranscribeTrainer } from "@/components/transcribe/transcribe-trainer";
import { ShadowMode } from "@/components/transcribe/shadow-mode";
import { LevelRunBar } from "@/components/practice/level-run-bar";
import { SettingsToggle } from "@/components/settings-drawer";
import { NeedsPianoNote } from "@/components/needs-piano-note";
import { cn } from "@/lib/utils";

export function TranscribeTabs() {
  const tab = useUiStore((s) => s.transcribeTab);
  const setTab = useUiStore((s) => s.setTranscribeTab);
  const settingsOpen = useUiStore((s) => s.transcribeSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setTranscribeSettingsOpen);
  // On a phone the settings are a drawer opened from the sliders button, not a column.
  const phone = useIsPhone();
  const showColumn = settingsOpen && !phone;

  useEffect(() => {
    getEngine()
      .checkSamples()
      .catch(() => {});
    // /transcribe?tab=shadow (from the practice calendar)
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "shadow" || t === "phrases") setTab(t);
  }, [setTab]);

  return (
    <div className={cn("grid gap-4", showColumn ? "lg:grid-cols-[340px_1fr]" : "grid-cols-1")}>
      {showColumn && (
        <aside className="order-2 lg:order-1">
          <TranscribeSettingsPanel />
        </aside>
      )}
      <section className="order-1 flex flex-col gap-4 lg:order-2">
        <div>
          <h1 className="text-xl font-semibold">Hear It, Play It</h1>
          <p className="text-sm text-muted-foreground">The app plays music it knows note for note. You play it back on the USB piano. It grades and shows the diff.</p>
        </div>
        <NeedsPianoNote />
        <LevelRunBar store="transcribe" />
        <Tabs value={tab} onValueChange={(v) => setTab(String(v) as TranscribeTabId)}>
          <div className="flex items-center gap-2">
            <SettingsToggle open={settingsOpen} onOpenChange={setSettingsOpen}>
              <TranscribeSettingsPanel />
            </SettingsToggle>
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
