"use client";

import { useUiStore, type PracticeTabId } from "@/lib/ui-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarView } from "@/components/practice/calendar-view";
import { ProgressView } from "@/components/practice/progress-view";
import { LearnView } from "@/components/practice/learn-view";

export function PracticeTabs() {
  const tab = useUiStore((s) => s.practiceTab);
  const setTab = useUiStore((s) => s.setPracticeTab);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Practice & Learn</h1>
        <p className="text-sm text-muted-foreground">Plan the days, watch each skill grow, and read the theory behind what you hear.</p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v) as PracticeTabId)}>
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="learn">Learn</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar">{tab === "calendar" && <CalendarView />}</TabsContent>
        <TabsContent value="progress">{tab === "progress" && <ProgressView />}</TabsContent>
        <TabsContent value="learn">{tab === "learn" && <LearnView />}</TabsContent>
      </Tabs>
    </div>
  );
}
