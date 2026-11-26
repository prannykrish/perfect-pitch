"use client";

/**
 * The current level: every drill with its gate progress and today's dose, the reviews kept sharp,
 * the lessons to read, and the Advance button that unlocks when the app thinks you are ready.
 * The data comes from useLevelData so the calendar shows the very same plan.
 */
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, CheckIcon, FlagIcon, PlayIcon, ShieldCheckIcon } from "lucide-react";
import type { DrillStatus } from "@/lib/practice/gates";
import { gateText, previousLevel } from "@/lib/practice/levels";
import { LESSON_BY_ID } from "@/lib/learn/content";
import { useUiStore } from "@/lib/ui-store";
import { useCountPrefs } from "@/lib/practice/count-prefs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { LevelData, LevelPlanRow } from "./use-level-data";

export function LevelCard({ data }: { data: LevelData }) {
  const { state, level, status, today, plan } = data;
  const setPracticeTab = useUiStore((s) => s.setPracticeTab);
  const setLearnLesson = useUiStore((s) => s.setLearnLesson);
  const alwaysCount = useCountPrefs((s) => s.alwaysCount);

  if (!state || !status) return <p className="text-sm text-muted-foreground">Loading your level…</p>;

  const openDrills = status.drills.filter((d) => !d.passed).length;
  const todayTotal = plan.reduce((a, r) => a + Math.min(today.get(r.drill.id) ?? 0, r.target), 0);
  const todayPlanned = plan.reduce((a, r) => a + r.target, 0);

  return (
    <Card size="sm" className={cn(status.ready && "border-green-500/60")}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FlagIcon className="size-4" /> Level {level.n}: {level.title}
            </CardTitle>
            <CardDescription>{level.focus}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={status.ready ? "default" : "secondary"}>
              {status.passedCount}/{status.totalCount} gates
            </Badge>
            <Badge variant="outline">
              today {todayTotal}/{todayPlanned} reps
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status.ready ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3">
            <ShieldCheckIcon className="size-6 text-green-500" />
            <div className="text-sm">
              <div className="font-semibold">Every gate holds. The app thinks you are ready for level {level.n + 1}.</div>
              <div className="text-muted-foreground">Stay as long as you like; the reps keep counting. Advance when it feels automatic.</div>
            </div>
            <Button className="ml-auto" onClick={data.advance}>
              Advance to level {level.n + 1} <ArrowRightIcon />
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Mastery here means:</span> {level.mastery} {openDrills > 0 && `${openDrills} drill${openDrills === 1 ? "" : "s"} still open.`}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {plan
            .filter((r) => !r.review)
            .map((r) => (
              <DrillRowView key={r.drill.id} row={r} doneToday={today.get(r.drill.id) ?? 0} onStart={() => data.start(r.drill)} />
            ))}
        </div>

        {plan.some((r) => r.review) && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Keep sharp (from earlier levels)</div>
            {plan
              .filter((r) => r.review)
              .map((r) => (
                <DrillRowView key={r.drill.id} row={r} doneToday={today.get(r.drill.id) ?? 0} onStart={() => data.start(r.drill)} />
              ))}
          </div>
        )}

        {status.lessons.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Read</div>
            {status.lessons.map((l) => {
              const lesson = LESSON_BY_ID.get(l.id);
              return (
                <div key={l.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm", l.read && "border-green-500/50 bg-green-500/5")}>
                  <Checkbox checked={l.read} onCheckedChange={(v) => data.toggleLesson(l.id, v === true)} aria-label="Read" />
                  <BookOpenIcon className="size-4 text-muted-foreground" />
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => {
                      setLearnLesson(l.id);
                      setPracticeTab("learn");
                    }}
                  >
                    {lesson?.title ?? l.id}
                  </button>
                  {lesson && <span className="hidden text-xs text-muted-foreground md:inline">· {lesson.summary}</span>}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {previousLevel(level.id) && (
            <Button variant="ghost" size="xs" onClick={data.back}>
              <ArrowLeftIcon /> Back to level {level.n - 1}
            </Button>
          )}
          <span className="ml-auto">
            {Object.keys(state.completed).length
              ? `Levels passed: ${Object.keys(state.completed).sort().join(", ")}`
              : alwaysCount
                ? "Always count is on: any rep whose settings match a drill here counts, Start or not."
                : "Only reps started from this card count toward the gates."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DrillRowView({ row, doneToday, onStart }: { row: LevelPlanRow; doneToday: number; onStart: () => void }) {
  const { drill: d, status, target, review } = row;
  const pctValue = Math.round(status.value * 100);
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg border p-3", status.passed ? "border-green-500/50 bg-green-500/5" : "")}>
      <div className="flex flex-wrap items-center gap-2">
        {status.passed ? <CheckIcon className="size-4 text-green-500" /> : <span className="inline-block size-4 rounded-full border-2 border-muted-foreground/40" />}
        <span className="font-medium">{d.label}</span>
        {review && (
          <Badge variant="outline" className="text-[10px]">
            review
          </Badge>
        )}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          today {Math.min(doneToday, target)}/{target}
        </span>
        <Button size="sm" onClick={onStart}>
          <PlayIcon /> Start
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">{d.summary}</div>
      <div className="flex items-center gap-3">
        {/* flex-1: beside the numbers the bar has no width of its own and would vanish */}
        <Progress value={Math.round(status.progress * 100)} className="h-1.5 min-w-0 flex-1" />
        <span className="w-44 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {status.n}/{status.gate.window} reps · {status.n ? `${pctValue} %` : "–"} · {status.days} day{status.days === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>Gate: {gateText(status.gate)}</span>
        {status.open.map((o) => (
          <span key={o} className="text-amber-600 dark:text-amber-400">
            {o}
          </span>
        ))}
      </div>
      {status.spread.length > 0 && <SpreadChips status={status} />}
    </div>
  );
}

function SpreadChips({ status }: { status: DrillStatus }) {
  const minPerKey = status.gate.spread?.minPerKey ?? 1;
  return (
    <div className="flex flex-wrap gap-1">
      {status.spread.map((c) => (
        <Tooltip key={c.key}>
          <TooltipTrigger
            render={<span className={cn("rounded px-1.5 py-0.5 text-[10px] tabular-nums", c.n < minPerKey ? "bg-muted text-muted-foreground" : c.ok ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-red-500/15 text-red-700 dark:text-red-400")} />}
          >
            {c.label} {Math.round(c.value * 100)}
          </TooltipTrigger>
          <TooltipContent>
            {c.label}: {c.n} reps, {Math.round(c.value * 100)} % {c.n < minPerKey ? `(needs ${minPerKey})` : ""}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
