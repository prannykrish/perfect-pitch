"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const AXIS = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 11 } as const;

function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export interface DayPoint {
  day: string;
  total: number;
  correct: number;
  avgMs: number;
}

/** Reps per day: one series, columns. */
export function DailyRepsChart({ data }: { data: DayPoint[] }) {
  const config: ChartConfig = { total: { label: "Reps", color: "var(--series-1)" } };
  return (
    <ChartContainer config={config} className="h-56 w-full aspect-auto">
      <BarChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} allowDecimals={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => String(v)} />} cursor={{ fill: "var(--viz-grid)" }} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  );
}

/** Accuracy per day, 0–100, one 2px line. */
export function DailyAccuracyChart({ data }: { data: DayPoint[] }) {
  const rows = data.map((d) => ({ day: d.day, accuracy: d.total ? Math.round((100 * d.correct) / d.total) : 0 }));
  const config: ChartConfig = { accuracy: { label: "Accuracy %", color: "var(--series-1)" } };
  return (
    <ChartContainer config={config} className="h-56 w-full aspect-auto">
      <LineChart data={rows} margin={{ left: -12, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={24} />
        <YAxis domain={[0, 100]} {...AXIS} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => String(v)} />} cursor={{ stroke: "var(--viz-axis)" }} />
        <Line type="monotone" dataKey="accuracy" stroke="var(--color-accuracy)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)", fill: "var(--color-accuracy)" }} activeDot={{ r: 5 }} />
      </LineChart>
    </ChartContainer>
  );
}

/** Average response time per day in ms. */
export function DailyResponseChart({ data }: { data: DayPoint[] }) {
  const config: ChartConfig = { avgMs: { label: "Avg response (ms)", color: "var(--series-1)" } };
  return (
    <ChartContainer config={config} className="h-56 w-full aspect-auto">
      <LineChart data={data} margin={{ left: -4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={48} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => String(v)} />} cursor={{ stroke: "var(--viz-axis)" }} />
        <Line type="monotone" dataKey="avgMs" stroke="var(--color-avgMs)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)", fill: "var(--color-avgMs)" }} />
      </LineChart>
    </ChartContainer>
  );
}

export interface CategoryPoint {
  label: string;
  total: number;
  correct: number;
}

/** Accuracy by category (pitch class, octave, interval, ...). One series, so one color. */
export function CategoryAccuracyChart({ data, height = 224 }: { data: CategoryPoint[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, accuracy: d.total ? Math.round((100 * d.correct) / d.total) : 0 }));
  const config: ChartConfig = { accuracy: { label: "Accuracy %", color: "var(--series-1)" } };
  return (
    <ChartContainer config={config} className="w-full aspect-auto" style={{ height }}>
      <BarChart data={rows} margin={{ left: -12, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="label" {...AXIS} interval={0} />
        <YAxis domain={[0, 100]} {...AXIS} width={40} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value, _name, item) => <span className="flex w-full justify-between gap-3"><span className="text-muted-foreground">{item.payload?.correct}/{item.payload?.total} right</span><span className="font-mono tabular-nums">{value}%</span></span>} />}
          cursor={{ fill: "var(--viz-grid)" }}
        />
        <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  );
}

/** Any 0–100 value per day (e.g. shadow-mode accuracy), one line. */
export function DailyPercentChart({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  const config: ChartConfig = { value: { label, color: "var(--series-1)" } };
  return (
    <ChartContainer config={config} className="h-56 w-full aspect-auto">
      <LineChart data={data} margin={{ left: -12, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={24} />
        <YAxis domain={[0, 100]} {...AXIS} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => String(v)} />} cursor={{ stroke: "var(--viz-axis)" }} />
        <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)", fill: "var(--color-value)" }} activeDot={{ r: 5 }} />
      </LineChart>
    </ChartContainer>
  );
}

/** Any numeric value per day (e.g. first-note latency in ms), one line, auto-scaled axis. */
export function DailyValueChart({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  const config: ChartConfig = { value: { label, color: "var(--series-1)" } };
  return (
    <ChartContainer config={config} className="h-56 w-full aspect-auto">
      <LineChart data={data} margin={{ left: -4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={48} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => String(v)} />} cursor={{ stroke: "var(--viz-axis)" }} />
        <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)", fill: "var(--color-value)" }} />
      </LineChart>
    </ChartContainer>
  );
}

/** Smallest deviation reliably heard per day (lower is better). */
export function JndChart({ data }: { data: { day: string; jnd: number | null }[] }) {
  const rows = data.filter((d) => d.jnd !== null);
  const config: ChartConfig = { jnd: { label: "Cents", color: "var(--series-1)" } };
  return (
    <ChartContainer config={config} className="h-56 w-full aspect-auto">
      <LineChart data={rows} margin={{ left: -12, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={24} />
        <YAxis domain={[0, 50]} {...AXIS} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => String(v)} />} cursor={{ stroke: "var(--viz-axis)" }} />
        <Line type="monotone" dataKey="jnd" stroke="var(--color-jnd)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)", fill: "var(--color-jnd)" }} />
      </LineChart>
    </ChartContainer>
  );
}
