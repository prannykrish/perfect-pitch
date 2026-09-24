"use client";

/** The Learn tab: lessons with playable examples and drill links, plus a searchable glossary. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BookOpenIcon, PlayIcon, SearchIcon, Volume2Icon } from "lucide-react";
import { getEngine } from "@/lib/audio/engine";
import { DEFAULT_INSTRUMENT_ID } from "@/lib/audio/instruments";
import { glossary, LESSON_AREA_LABELS, LESSON_BY_ID, LESSONS, type Example, type Lesson, type LessonArea } from "@/lib/learn/content";
import { useUiStore } from "@/lib/ui-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

async function playExample(ex: Example) {
  const engine = getEngine();
  await engine.resume();
  engine.stopAll();
  const events: { instrumentId: string; midi: number; at: number; duration: number; velocity: number; detune: number }[] = [];
  let t = 0;
  for (const step of ex.steps) {
    const ms = step.ms ?? 700;
    for (const m of step.midis) events.push({ instrumentId: DEFAULT_INSTRUMENT_ID, midi: m, at: t / 1000, duration: Math.max(0.15, (ms / 1000) * 0.95), velocity: 90, detune: step.detune ?? 0 });
    t += ms;
  }
  await engine.playNotes(events);
}

export function LearnView() {
  const selectedId = useUiStore((s) => s.learnLesson);
  const setSelected = useUiStore((s) => s.setLearnLesson);
  const [query, setQuery] = useState("");
  const lesson = selectedId ? LESSON_BY_ID.get(selectedId) ?? null : null;
  const showGlossary = selectedId === "glossary";
  const entries = useMemo(() => glossary(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q)) : entries;
  }, [entries, query]);
  const areas = (Object.keys(LESSON_AREA_LABELS) as LessonArea[]).map((a) => ({ area: a, lessons: LESSONS.filter((l) => l.area === a) }));

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card size="sm" className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpenIcon className="size-4" /> Lessons
          </CardTitle>
          <CardDescription>Written for an ear that already hears everything and wants the words.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {areas.map(({ area, lessons }) => (
            <div key={area} className="flex flex-col gap-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{LESSON_AREA_LABELS[area]}</div>
              {lessons.map((l) => (
                <Button key={l.id} variant={l.id === selectedId ? "secondary" : "ghost"} size="sm" className="h-auto justify-start whitespace-normal py-1.5 text-left" onClick={() => setSelected(l.id)}>
                  {l.title}
                </Button>
              ))}
            </div>
          ))}
          <Button variant={showGlossary ? "secondary" : "outline"} size="sm" onClick={() => setSelected("glossary")}>
            <SearchIcon /> Glossary ({entries.length} terms)
          </Button>
        </CardContent>
      </Card>

      {showGlossary ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Glossary</CardTitle>
            <CardDescription>Every term from the lessons, with where it is explained.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search terms and definitions" />
            <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2">
              {filtered.map((e) => (
                <div key={`${e.lessonId}-${e.term}`} className="rounded-md border p-2">
                  <dt className="text-sm font-semibold">{e.term}</dt>
                  <dd className="text-sm text-muted-foreground">{e.definition}</dd>
                  <button type="button" className="mt-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={() => setSelected(e.lessonId)}>
                    {e.lessonTitle}
                  </button>
                </div>
              ))}
              {filtered.length === 0 && <p className="text-sm text-muted-foreground">No term matches.</p>}
            </dl>
          </CardContent>
        </Card>
      ) : lesson ? (
        <LessonReader lesson={lesson} />
      ) : (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Start anywhere</CardTitle>
            <CardDescription>
              The foundations come first if you want the vocabulary in order; the practice lessons explain what each tab of this app is for. Every lesson ends with the drills that train it, and every example has a Hear button.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {LESSONS.map((l) => (
              <button key={l.id} type="button" className="rounded-lg border p-3 text-left hover:bg-muted/50" onClick={() => setSelected(l.id)}>
                <div className="text-sm font-semibold">{l.title}</div>
                <div className="text-xs text-muted-foreground">{l.summary}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LessonReader({ lesson }: { lesson: Lesson }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const hear = (ex: Example) => {
    setPlaying(ex.label);
    playExample(ex)
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
      .finally(() => setPlaying(null));
  };
  return (
    <Card size="sm">
      <CardHeader>
        <Badge variant="outline" className="w-fit">
          {LESSON_AREA_LABELS[lesson.area]}
        </Badge>
        <CardTitle className="text-lg">{lesson.title}</CardTitle>
        <CardDescription>{lesson.summary}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {lesson.sections.map((s) => (
          <section key={s.heading} className="flex flex-col gap-2">
            <h3 className="text-base font-semibold">{s.heading}</h3>
            {s.body.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed">
                {p}
              </p>
            ))}
            {s.examples && s.examples.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {s.examples.map((ex) => (
                  <Button key={ex.label} variant="outline" size="sm" className={cn("h-auto whitespace-normal py-1.5 text-left", playing === ex.label && "border-primary")} onClick={() => hear(ex)}>
                    <Volume2Icon className="shrink-0" /> {ex.label}
                  </Button>
                ))}
              </div>
            )}
            {s.terms && s.terms.length > 0 && (
              <dl className="grid gap-1 rounded-md border bg-muted/30 p-2 text-sm md:grid-cols-2">
                {s.terms.map((t) => (
                  <div key={t.term}>
                    <dt className="font-medium">{t.term}</dt>
                    <dd className="text-muted-foreground">{t.definition}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
        {lesson.drills.length > 0 && (
          <section className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <h3 className="text-sm font-semibold">Drill it</h3>
            {lesson.drills.map((d) => (
              <div key={d.label} className="flex flex-wrap items-center gap-2 text-sm">
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={d.href} />}>
                  <PlayIcon /> {d.label}
                </Button>
                <span className="text-xs text-muted-foreground">{d.hint}</span>
              </div>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
