"use client";

import { useState, type ReactNode } from "react";
import { BarChart3Icon, TableIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface TableSpec {
  columns: string[];
  rows: (string | number)[][];
  /** Column indexes to right-align (numbers). */
  numeric?: number[];
}

/** Every chart ships with its table twin: the WCAG-clean equivalent, one toggle away. */
export function ChartCard({ title, description, table, empty, children }: { title: string; description?: string; table: TableSpec; empty?: boolean; children: ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card size="sm" className="viz-root">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <ToggleGroup variant="outline" size="sm" value={[view]} onValueChange={(v) => v[0] && setView(v[0] as "chart" | "table")}>
            <ToggleGroupItem value="chart" aria-label="Chart view">
              <BarChart3Icon />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view">
              <TableIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No reps in this range yet.</p>
        ) : view === "chart" ? (
          children
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {table.columns.map((c, i) => (
                  <TableHead key={c} className={table.numeric?.includes(i) ? "text-right" : undefined}>
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((r, i) => (
                <TableRow key={i}>
                  {r.map((v, j) => (
                    <TableCell key={j} className={table.numeric?.includes(j) ? "text-right tabular-nums" : undefined}>
                      {v}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
