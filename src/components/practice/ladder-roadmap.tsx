"use client";

/**
 * The whole ladder under the level card: every level marked passed, current or upcoming, each one
 * expandable to its focus, mastery rule, drills with their gates, reviews and reading.
 */
import { BookOpenIcon, CheckIcon, MapIcon, PlayIcon } from "lucide-react";
import { DRILL_BY_ID, gateText, LEVELS, type LevelDef } from "@/lib/practice/levels";
import { LESSON_BY_ID } from "@/lib/learn/content";
import { useUiStore } from "@/lib/ui-store";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LevelData } from "./use-level-data";

type LevelStage = "passed" | "current" | "upcoming";

export function LadderRoadmap({ data }: { data: LevelData }) {
  const { state, level: current } = data;
  if (!state) return null;
  const currentIdx = LEVELS.findIndex((l) => l.id === current.id);
  const next = LEVELS[currentIdx + 1];
  const stageOf = (l: LevelDef, i: number): LevelStage => (l.id === current.id ? "current" : state.completed[l.id] || i < currentIdx ? "passed" : "upcoming");

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapIcon className="size-4" /> The whole ladder
        </CardTitle>
        <CardDescription>
          Level {current.n} of {LEVELS.length - 1}, then Mastery.{next ? ` Next up: level ${next.n}, ${next.title}.` : ""} Open any level to see its drills, gates and reading.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion multiple>
          {LEVELS.map((l, i) => (
            <LevelItem key={l.id} level={l} stage={stageOf(l, i)} passedOn={state.completed[l.id]} lessonsRead={state.lessonsRead} />
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function LevelItem({ level, stage, passedOn, lessonsRead }: { level: LevelDef; stage: LevelStage; passedOn?: string; lessonsRead: string[] }) {
  const setPracticeTab = useUiStore((s) => s.setPracticeTab);
  const setLearnLesson = useUiStore((s) => s.setLearnLesson);
  const reviews = level.review.map((r) => ({ ...r, drill: DRILL_BY_ID.get(r.drillId) }));
  const name = level.id === "mastery" ? level.title : `Level ${level.n}: ${level.title}`;

  return (
    <AccordionItem value={level.id}>
      <AccordionTrigger className="items-center gap-3 hover:no-underline">
        <StageIcon stage={stage} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("flex flex-wrap items-center gap-2", stage === "upcoming" && "text-muted-foreground")}>
            {name}
            {stage === "current" && <Badge>you are here</Badge>}
            {stage === "passed" && passedOn && (
              <Badge variant="outline" className="text-[10px]">
                passed {passedOn}
              </Badge>
            )}
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {level.drills.length} drill{level.drills.length === 1 ? "" : "s"}
            {level.review.length > 0 && ` · ${level.review.length} review${level.review.length === 1 ? "" : "s"}`}
            {level.lessons.length > 0 && ` · ${level.lessons.length} lesson${level.lessons.length === 1 ? "" : "s"}`}
            {" · "}
            {level.focus}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3 pl-7">
        <p className="text-muted-foreground">{level.focus}</p>
        <p className="text-xs">
          <span className="font-medium">Mastery here means:</span> <span className="text-muted-foreground">{level.mastery}</span>
        </p>

        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Drills</div>
          {level.drills.map((d) => (
            <div key={d.id} className="rounded-md border px-2.5 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <PlayIcon className="size-3 text-muted-foreground" />
                <span className="font-medium">{d.label}</span>
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{d.daily} a day</span>
              </div>
              <div className="text-xs text-muted-foreground">{d.summary}</div>
              <div className="text-[11px] text-muted-foreground">Gate: {gateText(d.gate)}</div>
            </div>
          ))}
        </div>

        {reviews.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Keep sharp (from earlier levels)</div>
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {reviews.map((r) => (
                <li key={r.drillId}>
                  {r.drill?.label ?? r.drillId} · {r.daily} a day
                </li>
              ))}
            </ul>
          </div>
        )}

        {level.lessons.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Read</div>
            {level.lessons.map((id) => {
              const lesson = LESSON_BY_ID.get(id);
              const read = lessonsRead.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="flex items-center gap-2 text-left text-xs hover:underline"
                  onClick={() => {
                    setLearnLesson(id);
                    setPracticeTab("learn");
                  }}
                >
                  {read ? <CheckIcon className="size-3.5 text-green-500" /> : <BookOpenIcon className="size-3.5 text-muted-foreground" />}
                  {lesson?.title ?? id}
                </button>
              );
            })}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function StageIcon({ stage }: { stage: LevelStage }) {
  if (stage === "passed")
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-500/15">
        <CheckIcon className="size-3.5 text-green-600 dark:text-green-400" />
      </span>
    );
  if (stage === "current") return <span className="size-5 shrink-0 rounded-full border-2 border-primary bg-primary/20" />;
  return <span className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/30" />;
}
