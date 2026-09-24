import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

export function parseRange(key: string | undefined): { key: string; days: number | null } {
  const r = RANGES.find((x) => x.key === key) ?? RANGES[3];
  return { key: r.key, days: r.days };
}

/** One filter row above every chart; all charts re-render against the same slice. */
export function RangeFilter({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {RANGES.map((r) => (
        <Button
          key={r.key}
          size="sm"
          variant={r.key === active ? "default" : "outline"}
          nativeButton={false}
          render={<Link href={`/stats?range=${r.key}`} />}
          className={cn(r.key === active && "pointer-events-none")}
        >
          {r.label}
        </Button>
      ))}
    </div>
  );
}
