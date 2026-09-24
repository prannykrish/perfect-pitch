"use client";

/**
 * The practice calendar: a month grid with planned-versus-done per day, the day's plan (items with
 * live completion from logged attempts, notes), the starter programme, and a 26-week heatmap
 * with streaks.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, PlusIcon, Trash2Icon, WandSparklesIcon } from "lucide-react";
import { deletePlan, getPracticeRange, getRepsByDay, savePlan, savePlans, type PracticeRange } from "@/lib/db/actions";
import { addDays, computeStreak, dayKey, itemProgress, MODE_INFO, newItemId, parseDayKey, PLAN_MODES, planModeForAttempt, programDay, STARTER_PROGRAM, todayKey, type PlanItem, type PlanMode } from "@/lib/practice/plan";
import { LESSON_BY_ID } from "@/lib/learn/content";
import { useUiStore } from "@/lib/ui-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface DayInfo {
  reps: number;
  correct: number;
  byMode: Partial<Record<PlanMode, number>>;
  minutes: number;
  items: PlanItem[];
  notes: string;
  planned: number;
  complete: number;
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

export function CalendarView() {
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [selected, setSelected] = useState(() => todayKey());
  const [range, setRange] = useState<PracticeRange | null>(null);
  const [heat, setHeat] = useState<{ day: string; total: number; correct: number }[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const setPracticeTab = useUiStore((s) => s.setPracticeTab);

  const from = useMemo(() => dayKey(new Date(month.getFullYear(), month.getMonth(), 1 - 7, 12)), [month]);
  const to = useMemo(() => dayKey(new Date(month.getFullYear(), month.getMonth() + 1, 7, 12)), [month]);

  useEffect(() => {
    let cancelled = false;
    getPracticeRange(from, to)
      .then((r) => {
        if (!cancelled) setRange(r);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [from, to, reloadTick]);

  useEffect(() => {
    let cancelled = false;
    getRepsByDay(26 * 7 + 7)
      .then((r) => {
        if (!cancelled) setHeat(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // ----- per-day info -----
  const days = useMemo(() => {
    const map = new Map<string, DayInfo>();
    const get = (d: string) => {
      let v = map.get(d);
      if (!v) {
        v = { reps: 0, correct: 0, byMode: {}, minutes: 0, items: [], notes: "", planned: 0, complete: 0 };
        map.set(d, v);
      }
      return v;
    };
    if (range) {
      for (const r of range.reps) {
        const v = get(r.day);
        v.reps += r.total;
        v.correct += r.correct;
        const pm = planModeForAttempt(r.mode);
        if (pm) v.byMode[pm] = (v.byMode[pm] ?? 0) + r.total;
      }
      for (const m of range.minutes) get(m.day).minutes += m.minutes;
      for (const p of range.plans) {
        const v = get(p.date);
        v.items = p.items as PlanItem[];
        v.notes = p.notes;
      }
      for (const v of map.values()) {
        v.planned = v.items.length;
        v.complete = v.items.filter((it) => itemProgress(it, v.byMode).complete).length;
      }
    }
    return map;
  }, [range]);

  const selectedInfo: DayInfo = days.get(selected) ?? { reps: 0, correct: 0, byMode: {}, minutes: 0, items: [], notes: "", planned: 0, complete: 0 };

  // ----- saving -----
  const persist = useCallback(
    async (date: string, items: PlanItem[], notes: string) => {
      try {
        if (!items.length && !notes.trim()) await deletePlan(date);
        else await savePlan(date, items, notes);
        reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    },
    [reload]
  );

  const applyWeek = useCallback(
    async (weekIndex: number) => {
      const week = STARTER_PROGRAM[weekIndex];
      const rows = Array.from({ length: 7 }, (_, i) => ({ date: addDays(selected, i), items: programDay(week, i), notes: i === 0 ? `Week ${week.week}: ${week.title}. ${week.focus}` : "" }));
      try {
        await savePlans(rows);
        toast.success(`Week ${week.week} planned from ${selected}`);
        reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    },
    [selected, reload]
  );

  // ----- grid -----
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= count; d++) out.push(dayKey(new Date(month.getFullYear(), month.getMonth(), d, 12)));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const today = todayKey();
  const activeDays = useMemo(() => new Set(heat.filter((h) => h.total > 0).map((h) => h.day)), [heat]);
  const streak = useMemo(() => computeStreak(activeDays), [activeDays]);
  const monthReps = [...days.entries()].filter(([d]) => d.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`)).reduce((a, [, v]) => a + v.reps, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card size="sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}>
                  <ChevronLeftIcon />
                </Button>
                <CardTitle className="min-w-40 text-center">
                  {MONTHS[month.getMonth()]} {month.getFullYear()}
                </CardTitle>
                <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}>
                  <ChevronRightIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMonth(monthStart(new Date()));
                    setSelected(today);
                  }}
                >
                  Today
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{monthReps} reps this month</Badge>
                <Badge variant="outline">streak {streak.current} day{streak.current === 1 ? "" : "s"}</Badge>
                <Badge variant="outline">longest {streak.longest}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-1 text-center text-[11px] font-medium text-muted-foreground">
                  {w}
                </div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`b${i}`} />;
                const info = days.get(d);
                const isSel = d === selected;
                const isToday = d === today;
                const past = d < today;
                return (
                  <Button
                    key={d}
                    variant="outline"
                    onClick={() => setSelected(d)}
                    className={cn(
                      "h-16 flex-col items-stretch justify-between gap-0.5 px-1.5 py-1 text-left",
                      isSel && "border-primary bg-primary/10",
                      isToday && "font-semibold",
                      !info?.reps && !info?.planned && past && "text-muted-foreground"
                    )}
                  >
                    <div className="flex items-start justify-between text-xs">
                      <span className={cn(isToday && "rounded bg-primary px-1 text-primary-foreground")}>{Number(d.slice(-2))}</span>
                      {info && info.reps > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{info.reps}</span>}
                    </div>
                    {info && info.planned > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <Progress value={Math.round((100 * info.complete) / info.planned)} className="h-1" />
                        <span className="text-[10px] text-muted-foreground">
                          {info.complete}/{info.planned} done
                        </span>
                      </div>
                    ) : info && info.reps > 0 ? (
                      <span className="text-[10px] text-muted-foreground">{Math.round((100 * info.correct) / info.reps)} % right</span>
                    ) : (
                      <span />
                    )}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <DayPlan date={selected} info={selectedInfo} onSave={(items, notes) => persist(selected, items, notes)} />
      </div>

      <Heatmap heat={heat} />

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WandSparklesIcon className="size-4" /> Starter programme
          </CardTitle>
          <CardDescription>
            Eight weeks that ease in, from naming single notes to harmonising a chorale. Pick a day in the calendar and apply a week: it fills that day and the six after it (day seven is a light day). Adjust anything afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STARTER_PROGRAM.map((w, i) => (
            <div key={w.week} className="flex flex-col gap-2 rounded-lg border p-3">
              <div>
                <div className="text-sm font-semibold">
                  Week {w.week}: {w.title}
                </div>
                <div className="text-xs text-muted-foreground">{w.focus}</div>
              </div>
              <ul className="flex flex-col gap-0.5 text-xs">
                {w.daily.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span>{MODE_INFO[it.mode].label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {it.target} {MODE_INFO[it.mode].unit}
                    </span>
                  </li>
                ))}
              </ul>
              {w.lessons.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Read:{" "}
                  {w.lessons.map((id, k) => (
                    <span key={id}>
                      {k > 0 && ", "}
                      <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={() => { useUiStore.getState().setLearnLesson(id); setPracticeTab("learn"); }}>
                        {LESSON_BY_ID.get(id)?.title ?? id}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" className="mt-auto" onClick={() => applyWeek(i)}>
                Apply from {selected}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day plan
// ---------------------------------------------------------------------------

function DayPlan({ date, info, onSave }: { date: string; info: DayInfo; onSave: (items: PlanItem[], notes: string) => void }) {
  const [mode, setMode] = useState<PlanMode>("single-note");
  const [target, setTarget] = useState("30");
  const [minutes, setMinutes] = useState("");
  const [hint, setHint] = useState("");
  const [notes, setNotes] = useState(info.notes);
  // the notes box follows the selected day
  const [notesFor, setNotesFor] = useState(date);
  if (notesFor !== date) {
    setNotesFor(date);
    setNotes(info.notes);
  }
  const d = parseDayKey(date);
  const label = `${WEEKDAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const modeItems = Object.fromEntries(PLAN_MODES.map((m) => [m, MODE_INFO[m].label])) as Record<PlanMode, string>;

  const add = () => {
    const t = Math.max(0, Number(target) || 0);
    const it: PlanItem = { id: newItemId(), mode, target: t, hint: hint.trim() || undefined, minutes: Number(minutes) > 0 ? Number(minutes) : undefined };
    onSave([...info.items, it], notes);
    setHint("");
  };
  const remove = (id: string) => onSave(info.items.filter((it) => it.id !== id), notes);
  const toggle = (id: string, done: boolean) => onSave(info.items.map((it) => (it.id === id ? { ...it, done } : it)), notes);

  return (
    <Card size="sm" className="h-fit">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>
          {info.reps ? `${info.reps} reps logged, ${Math.round((100 * info.correct) / info.reps)} % right${info.minutes ? `, ${Math.round(info.minutes)} min` : ""}` : "Nothing logged yet."}
          {info.planned > 0 && ` · ${info.complete}/${info.planned} plan items done`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {info.items.length === 0 && <p className="text-xs text-muted-foreground">No plan for this day. Add items below or apply a starter week.</p>}
        {info.items.map((it) => {
          const p = itemProgress(it, info.byMode);
          const m = MODE_INFO[it.mode];
          return (
            <div key={it.id} className={cn("flex flex-col gap-1 rounded-md border p-2", p.complete && "border-green-500/50 bg-green-500/5")}>
              <div className="flex items-center gap-2">
                <Checkbox checked={p.complete} onCheckedChange={(v) => toggle(it.id, v === true)} aria-label="Done" />
                <span className="text-sm font-medium">{m.label}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {p.done}/{it.target} {m.unit}
                  {it.minutes ? ` · ${it.minutes} min` : ""}
                </span>
                <Button size="icon-xs" variant="ghost" nativeButton={false} render={<Link href={m.href} />} aria-label="Open">
                  <ExternalLinkIcon />
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => remove(it.id)}>
                  <Trash2Icon />
                </Button>
              </div>
              <Progress value={Math.round(p.ratio * 100)} className="h-1.5" />
              {it.hint && <div className="text-xs text-muted-foreground">{it.hint}</div>}
            </div>
          );
        })}

        <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
          <Label className="text-xs text-muted-foreground">Add an item</Label>
          <Select items={modeItems} value={mode} onValueChange={(v) => v && setMode(v as PlanMode)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_INFO[m].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="reps" aria-label="Target reps" />
            <Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="minutes (optional)" aria-label="Minutes" />
          </div>
          <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="settings hint, e.g. triads, root + quality" />
          <Button size="sm" onClick={add}>
            <PlusIcon /> Add
          </Button>
        </div>

        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== info.notes && onSave(info.items, notes)} placeholder="How it went, what to change…" rows={3} />
        {notes !== info.notes && (
          <Button size="sm" variant="outline" onClick={() => onSave(info.items, notes)}>
            <CheckIcon /> Save notes
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

function heatStep(n: number) {
  if (!n) return 0;
  if (n >= 200) return 5;
  if (n >= 100) return 4;
  if (n >= 50) return 3;
  if (n >= 20) return 2;
  return 1;
}

function Heatmap({ heat }: { heat: { day: string; total: number; correct: number }[] }) {
  const byDay = new Map(heat.map((h) => [h.day, h]));
  const today = todayKey();
  // 26 columns of weeks ending this week, Monday at the top
  const end = parseDayKey(today);
  const endMonday = addDays(today, -((end.getDay() + 6) % 7));
  const weeks: string[][] = [];
  for (let w = 25; w >= 0; w--) {
    const monday = addDays(endMonday, -7 * w);
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  const totalReps = heat.reduce((a, h) => a + h.total, 0);
  const active = heat.filter((h) => h.total > 0).length;
  return (
    <Card size="sm" className="viz-root">
      <CardHeader>
        <CardTitle>Last 26 weeks</CardTitle>
        <CardDescription>
          {totalReps.toLocaleString()} reps on {active} day{active === 1 ? "" : "s"}. Darker is more reps.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="flex gap-0.5">
            <div className="mr-1 flex flex-col gap-0.5 text-[9px] text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <div key={w} className="h-3 leading-3">
                  {w[0]}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {week.map((d) => {
                  const h = byDay.get(d);
                  const s = heatStep(h?.total ?? 0);
                  const future = d > today;
                  return (
                    <Tooltip key={d}>
                      <TooltipTrigger render={<div className="size-3 rounded-[2px]" style={{ background: future ? "transparent" : `var(--heat-${s})`, outline: future ? "1px dashed var(--viz-grid)" : undefined, outlineOffset: -1 }} />}>{null}</TooltipTrigger>
                      <TooltipContent>
                        {d}: {h ? `${h.total} reps, ${Math.round((100 * h.correct) / h.total)} % right` : "nothing"}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
