"use client";

import { instrumentLabel } from "@/lib/audio/instruments";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface SummaryRow {
  label: string;
  total: number;
  correct: number;
  /** Optional extra column, e.g. average score. */
  extra?: string;
}

export interface SummaryBreakdown {
  title: string;
  rows: SummaryRow[];
  extraHeader?: string;
}

export interface SummaryMiss {
  target: string;
  answer: string;
  instrumentId: string;
  responseMs: number;
}

export function pct(correct: number, total: number) {
  return total ? `${Math.round((100 * correct) / total)}%` : "–";
}

export function rowsFrom<T>(items: T[], key: (t: T) => string, correct: (t: T) => boolean, sort: "count" | "label" = "count"): SummaryRow[] {
  const m = new Map<string, SummaryRow>();
  for (const it of items) {
    const k = key(it);
    const r = m.get(k) ?? { label: k, total: 0, correct: 0 };
    r.total++;
    if (correct(it)) r.correct++;
    m.set(k, r);
  }
  const rows = [...m.values()];
  return sort === "count" ? rows.sort((a, b) => b.total - a.total) : rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function SessionSummary({
  total,
  correct,
  avgScore,
  avgMs,
  breakdowns,
  misses,
}: {
  total: number;
  correct: number;
  avgScore?: number;
  avgMs: number;
  breakdowns: SummaryBreakdown[];
  misses?: SummaryMiss[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            You got {correct} of {total} fully right, or {pct(correct, total)}
            {avgScore !== undefined && total > 0 && ` · average credit ${Math.round(avgScore * 100)}%`}
          </CardTitle>
          <CardDescription>Average response {avgMs} ms. Practice a little bit every day.</CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {breakdowns.map((b) => (
          <Card size="sm" key={b.title}>
            <CardHeader>
              <CardTitle>{b.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{b.title}</TableHead>
                    <TableHead className="text-right">Heard</TableHead>
                    <TableHead className="text-right">Wrong</TableHead>
                    <TableHead className="text-right">Accuracy</TableHead>
                    {b.extraHeader && <TableHead className="text-right">{b.extraHeader}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.rows.map((r) => (
                    <TableRow key={r.label}>
                      <TableCell className="max-w-48 truncate">{r.label}</TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right">{r.total - r.correct}</TableCell>
                      <TableCell className="text-right">{pct(r.correct, r.total)}</TableCell>
                      {b.extraHeader && <TableCell className="text-right">{r.extra ?? ""}</TableCell>}
                    </TableRow>
                  ))}
                  {b.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={b.extraHeader ? 5 : 4} className="text-muted-foreground">
                        Nothing yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
      {misses && misses.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Recent misses</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Played</TableHead>
                  <TableHead>You said</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {misses.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell>{m.target}</TableCell>
                    <TableCell>{m.answer}</TableCell>
                    <TableCell className="max-w-48 truncate">{instrumentLabel(m.instrumentId)}</TableCell>
                    <TableCell className="text-right">{Math.round(m.responseMs)} ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
