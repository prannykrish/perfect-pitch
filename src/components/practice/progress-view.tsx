"use client";

/** Every skill the app trains, with where you are and what is next. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BookOpenIcon, PlayIcon } from "lucide-react";
import { getProgressData } from "@/lib/db/actions";
import { AREA_LABELS, computeSkills, STAGE_LABELS, type SkillArea, type SkillStatus } from "@/lib/practice/skills";
import { LESSON_BY_ID } from "@/lib/learn/content";
import { useUiStore } from "@/lib/ui-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STAGE_CLASS = ["", "border-amber-500/50 text-amber-600 dark:text-amber-400", "border-blue-500/50 text-blue-600 dark:text-blue-400", "border-green-500/50 text-green-600 dark:text-green-400"];

export function ProgressView() {
  const [skills, setSkills] = useState<SkillStatus[] | null>(null);
  const setPracticeTab = useUiStore((s) => s.setPracticeTab);
  const setLearnLesson = useUiStore((s) => s.setLearnLesson);

  useEffect(() => {
    let cancelled = false;
    getProgressData()
      .then((d) => {
        if (!cancelled) setSkills(computeSkills(d.all, d.modeDays));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!skills) return <p className="text-sm text-muted-foreground">Working it out…</p>;

  const areas = (Object.keys(AREA_LABELS) as SkillArea[]).map((a) => ({ area: a, items: skills.filter((s) => s.area === a) }));
  const started = skills.filter((s) => s.stage > 0).length;
  const strong = skills.filter((s) => s.stage === 3).length;
  const weakest = [...skills].filter((s) => s.stage > 0).sort((a, b) => a.stage - b.stage || a.progress - b.progress)[0];

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            {started} of {skills.length} skills started · {strong} strong
          </CardTitle>
          <CardDescription>
            {weakest ? (
              <>
                Weakest right now: <span className="text-foreground">{weakest.name}</span> ({STAGE_LABELS[weakest.stage].toLowerCase()}). Next step: {weakest.next}.
              </>
            ) : (
              "Nothing logged yet. Start with the Calendar tab's week 1."
            )}
          </CardDescription>
        </CardHeader>
      </Card>
      {areas.map(({ area, items }) => (
        <div key={area} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{AREA_LABELS[area]}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((s) => (
              <Card key={s.id} size="sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle>{s.name}</CardTitle>
                      <CardDescription>{s.what}</CardDescription>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0", STAGE_CLASS[s.stage])}>
                      {STAGE_LABELS[s.stage]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
                  <Progress value={Math.round(s.progress * 100)} className="h-1.5" />
                  <div className="text-xs text-muted-foreground">{s.detail}</div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Next: </span>
                    {s.next}
                  </div>
                  {s.trend && <div className="text-xs text-muted-foreground">{s.trend}</div>}
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={s.href} />}>
                      <PlayIcon /> Drill
                    </Button>
                    {LESSON_BY_ID.has(s.lesson) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setLearnLesson(s.lesson);
                          setPracticeTab("learn");
                        }}
                      >
                        <BookOpenIcon /> {LESSON_BY_ID.get(s.lesson)?.title}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
