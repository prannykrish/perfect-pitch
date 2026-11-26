"use client";

import { useEffect } from "react";
import { getEngine } from "@/lib/audio/engine";
import { useUiStore } from "@/lib/ui-store";
import { useIsPhone } from "@/lib/hooks/use-media";
import { useStage } from "@/lib/stage-store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrainerSettingsPanel } from "@/components/trainer/trainer-settings";
import { SingleNoteQuiz } from "@/components/trainer/single-note-quiz";
import { SequenceQuiz } from "@/components/trainer/sequence-quiz";
import { IntervalQuiz } from "@/components/trainer/interval-quiz";
import { ChordQuiz } from "@/components/trainer/chord-quiz";
import { CentsQuiz } from "@/components/trainer/cents-quiz";
import { ScalesQuiz } from "@/components/trainer/scales-quiz";
import { LevelRunBar } from "@/components/practice/level-run-bar";
import { SettingsToggle } from "@/components/settings-drawer";
import { StagePanel } from "@/components/phone-stage";
import { cn } from "@/lib/utils";

export type TrainerMode = "single" | "sequence" | "intervals" | "chords" | "cents" | "scales";

const MODES: { id: TrainerMode; label: string }[] = [
  { id: "single", label: "Single note" },
  { id: "sequence", label: "Sequence" },
  { id: "intervals", label: "Intervals" },
  { id: "chords", label: "Chords & clusters" },
  { id: "scales", label: "Scales & modes" },
  { id: "cents", label: "Cents" },
];

export function TrainerTabs() {
  const storedMode = useUiStore((s) => s.trainerMode);
  const setMode = useUiStore((s) => s.setTrainerMode);
  const mode: TrainerMode = MODES.some((m) => m.id === storedMode) ? (storedMode as TrainerMode) : "single";
  const settingsOpen = useUiStore((s) => s.trainerSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setTrainerSettingsOpen);
  const phone = useIsPhone();
  const showColumn = settingsOpen && !phone;
  const setPanelOpen = useStage((s) => s.setPanelOpen);

  // Find out early whether streamed (CDN) instruments work here so the pickers only offer what plays.
  useEffect(() => {
    getEngine()
      .checkSamples()
      .catch(() => {});
  }, []);

  // /trainer?mode=chords (from the practice calendar) opens that mode.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m && MODES.some((x) => x.id === m)) setMode(m as TrainerMode);
  }, [setMode]);

  // Only mount the active mode so exactly one quiz owns the keyboard and the piano.
  const quiz = (
    <>
      {mode === "single" && <SingleNoteQuiz />}
      {mode === "sequence" && <SequenceQuiz />}
      {mode === "intervals" && <IntervalQuiz />}
      {mode === "chords" && <ChordQuiz />}
      {mode === "scales" && <ScalesQuiz />}
      {mode === "cents" && <CentsQuiz />}
    </>
  );

  // The phone: the quiz is one fixed screen (QuizShell renders it as a PhoneStage); the level bar,
  // the modes and the settings live in its side panel instead of around it.
  if (phone) {
    return (
      <>
        {quiz}
        <StagePanel title="Pitch Trainer">
          <LevelRunBar store="trainer" />
          <section className="flex flex-col gap-2">
            <div className="text-sm font-medium">Mode</div>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <Button
                  key={m.id}
                  variant={m.id === mode ? "default" : "outline"}
                  className="h-11"
                  onClick={() => {
                    setMode(m.id);
                    setPanelOpen(false);
                  }}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </section>
          <TrainerSettingsPanel mode={mode} />
        </StagePanel>
      </>
    );
  }

  return (
    <div className={cn("grid gap-4", showColumn ? "lg:grid-cols-[320px_1fr]" : "grid-cols-1")}>
      {showColumn && (
        <aside className="order-2 lg:order-1">
          <TrainerSettingsPanel mode={mode} />
        </aside>
      )}
      <section className="order-1 flex flex-col gap-4 lg:order-2">
        <LevelRunBar store="trainer" />
        <Tabs value={mode} onValueChange={(v) => setMode(String(v) as TrainerMode)}>
          <div className="flex items-center gap-2">
            <SettingsToggle open={settingsOpen} onOpenChange={setSettingsOpen}>
              <TrainerSettingsPanel mode={mode} />
            </SettingsToggle>
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
          <TabsContent value="scales">{mode === "scales" && <ScalesQuiz />}</TabsContent>
          <TabsContent value="cents">{mode === "cents" && <CentsQuiz />}</TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
