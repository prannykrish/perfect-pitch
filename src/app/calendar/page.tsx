import { ComingSoon } from "@/components/coming-soon";

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Practice Calendar</h1>
        <p className="text-sm text-muted-foreground">Plan sessions per day, see planned versus completed, keep the streak alive.</p>
      </div>
      <ComingSoon
        title="Planner, completion tracking, streak heatmap"
        phase={7}
        description="Daily plan items (mode, rep target, minutes) auto-checked from logged attempts. Contribution-style heatmap. Google Calendar sync later."
      />
    </div>
  );
}
