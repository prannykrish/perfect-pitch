"use client";

import { useEffect } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { useUiStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrainerSettingsPanel } from "@/components/trainer/trainer-settings";
import { SingleNoteQuiz } from "@/components/trainer/single-note-quiz";
import { SequenceQuiz } from "@/components/trainer/sequence-quiz";
import { IntervalQuiz } from "@/components/trainer/interval-quiz";
import { ChordQuiz } from "@/components/trainer/chord-quiz";
import { CentsQuiz } from "@/components/trainer/cents-quiz";
import { cn } from "@/lib/utils";

export type TrainerMode = "single" | "sequence" | "intervals" | "chords" | "cents";

const MODES: { id: TrainerMode; label: string }[] = [
  { id: "single", label: "Single note" },
  { id: "sequence", label: "Sequence" },
  { id: "intervals", label: "Intervals" },
  { id: "chords", label: "Chords & clusters" },
  { id: "cents", label: "Cents" },
];

export function TrainerTabs() {
  const storedMode = useUiStore((s) => s.trainerMode);
  const setMode = useUiStore((s) => s.setTrainerMode);
  const mode: TrainerMode = MODES.some((m) => m.id === storedMode) ? (storedMode as TrainerMode) : "single";
  const settingsOpen = useUiStore((s) => s.trainerSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setTrainerSettingsOpen);

  // Find out early whether streamed (CDN) instruments work here so the pickers only offer what plays.
  useEffect(() => {
    getEngine()
      .checkSamples()
      .catch(() => {});
  }, []);

  return (
    <div className={cn("grid gap-4", settingsOpen ? "lg:grid-cols-[320px_1fr]" : "grid-cols-1")}>
      {settingsOpen && (
        <aside className="order-2 lg:order-1">
          <TrainerSettingsPanel mode={mode} />
        </aside>
      )}
      <section className="order-1 flex flex-col gap-4 lg:order-2">
        <Tabs value={mode} onValueChange={(v) => setMode(String(v) as TrainerMode)}>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="outline" size="icon-sm" aria-label={settingsOpen ? "Hide settings" : "Show settings"} onClick={() => setSettingsOpen(!settingsOpen)} />
                }
              >
                {settingsOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
              </TooltipTrigger>
              <TooltipContent>{settingsOpen ? "Hide settings" : "Show settings"}</TooltipContent>
            </Tooltip>
            <TabsList variant="line" className="w-full justify-start overflow-x-auto">
              {MODES.map((m) => (
                <TabsTrigger key={m.id} value={m.id}>
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {/* Only mount the active mode so exactly one quiz owns the keyboard and the piano. */}
          <TabsContent value="single">{mode === "single" && <SingleNoteQuiz />}</TabsContent>
          <TabsContent value="sequence">{mode === "sequence" && <SequenceQuiz />}</TabsContent>
          <TabsContent value="intervals">{mode === "intervals" && <IntervalQuiz />}</TabsContent>
          <TabsContent value="chords">{mode === "chords" && <ChordQuiz />}</TabsContent>
          <TabsContent value="cents">{mode === "cents" && <CentsQuiz />}</TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
