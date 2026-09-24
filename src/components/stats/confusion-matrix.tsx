"use client";

import { PITCH_CLASS_SHORT } from "@/lib/music/notes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * 12×12 heatmap: rows are the note played, columns what you answered. Colour is the share of that
 * row (sequential blue, one hue), so each row reads on its own regardless of how often it came up.
 */
export function ConfusionMatrix({ cells }: { cells: { target: number; answer: number; n: number }[] }) {
  const grid: number[][] = Array.from({ length: 12 }, () => Array(12).fill(0));
  for (const c of cells) grid[c.target][c.answer] += c.n;
  const rowTotals = grid.map((r) => r.reduce((a, b) => a + b, 0));

  const step = (n: number, rowTotal: number) => {
    if (!n) return 0;
    const share = n / rowTotal;
    if (share >= 0.9) return 5;
    if (share >= 0.6) return 4;
    if (share >= 0.3) return 3;
    if (share >= 0.1) return 2;
    return 1;
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `3.5rem repeat(12, minmax(1.75rem, 1fr))`, minWidth: 420 }}>
        <div className="text-[10px] text-muted-foreground">played ↓ / said →</div>
        {PITCH_CLASS_SHORT.map((n) => (
          <div key={n} className="text-center text-[11px] font-medium text-muted-foreground">
            {n}
          </div>
        ))}
        {grid.map((row, t) => (
          <ContentsRow key={t}>
            <div className="flex items-center text-[11px] font-medium text-muted-foreground">
              {PITCH_CLASS_SHORT[t]} <span className="ml-1 text-[10px] font-normal">({rowTotals[t]})</span>
            </div>
            {row.map((n, a) => {
              const s = step(n, rowTotals[t]);
              return (
                <Tooltip key={a}>
                  <TooltipTrigger
                    render={
                      <div
                        className="flex h-7 items-center justify-center rounded-[3px] text-[11px] tabular-nums"
                        style={{
                          background: `var(--heat-${s})`,
                          color: s ? `var(--heat-ink-${s})` : "var(--viz-muted)",
                          outline: t === a ? "1px solid var(--viz-axis)" : undefined,
                          outlineOffset: -1,
                        }}
                      />
                    }
                  >
                    {n || ""}
                  </TooltipTrigger>
                  <TooltipContent>
                    Played {PITCH_CLASS_SHORT[t]}, answered {PITCH_CLASS_SHORT[a]}: {n} time{n === 1 ? "" : "s"}
                    {rowTotals[t] ? ` (${Math.round((100 * n) / rowTotals[t])}% of ${PITCH_CLASS_SHORT[t]})` : ""}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </ContentsRow>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">The outlined diagonal is correct answers. Darker means a larger share of that row.</p>
    </div>
  );
}

function ContentsRow({ children }: { children: React.ReactNode }) {
  return <div className="contents">{children}</div>;
}
