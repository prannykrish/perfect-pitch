import { getStats } from "@/lib/db/actions";
import { instrumentLabel } from "@/lib/audio/instruments";
import { chordQuality } from "@/lib/music/chords";
import { intervalName, intervalShort } from "@/lib/music/intervals";
import { PITCH_CLASS_SHORT } from "@/lib/music/notes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatTile } from "@/components/stats/stat-tile";
import { RangeFilter, parseRange } from "@/components/stats/range-filter";
import { ChartCard } from "@/components/stats/chart-card";
import { CategoryAccuracyChart, DailyAccuracyChart, DailyRepsChart, DailyResponseChart, JndChart } from "@/components/stats/charts";
import { ConfusionMatrix } from "@/components/stats/confusion-matrix";

export const dynamic = "force-dynamic";

const MODE_LABELS: Record<string, string> = {
  "single-note": "Single note",
  roulette: "Single note (roulette)",
  sequence: "Sequence",
  intervals: "Intervals",
  chords: "Chords & clusters",
  cents: "Cents",
};

function pct(c: number, t: number) {
  return t ? `${Math.round((100 * c) / t)}%` : "–";
}

export default async function StatsPage(props: PageProps<"/stats">) {
  const sp = await props.searchParams;
  const rangeParam = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range = parseRange(rangeParam);
  const s = await getStats(range.days);

  const pitchRows = Array.from({ length: 12 }, (_, pc) => {
    const r = s.byPitchClass.find((x) => x.pitchClass === pc);
    return { label: PITCH_CLASS_SHORT[pc], total: r?.total ?? 0, correct: r?.correct ?? 0 };
  });
  const octaveRows = [...s.byOctave].sort((a, b) => a.octave - b.octave).map((r) => ({ label: String(r.octave), total: r.total, correct: r.correct }));
  const intervalRows = s.intervals.map((r) => ({ label: intervalShort(r.semitones), name: intervalName(r.semitones), total: r.total, correct: r.correct }));
  const centsRows = s.cents.map((r) => ({ label: r.amount === 0 ? "in tune" : `${r.amount}¢`, total: r.total, correct: r.correct, dirCorrect: r.dirCorrect }));
  const chordRows = s.chords.map((r) => ({
    label: r.kind === "cluster" ? "Cluster" : (chordQuality(r.qualityId ?? "")?.name ?? r.qualityId ?? "?"),
    total: r.total,
    correct: r.correct,
    avgScore: r.avgScore,
  }));

  // Weakest items: at least 5 reps, lowest accuracy first
  const weakest = [
    ...pitchRows.map((r) => ({ kind: "Note", ...r })),
    ...octaveRows.map((r) => ({ kind: "Octave", label: `Octave ${r.label}`, total: r.total, correct: r.correct })),
    ...s.byInstrument.map((r) => ({ kind: "Instrument", label: instrumentLabel(r.instrumentId), total: r.total, correct: r.correct })),
    ...intervalRows.map((r) => ({ kind: "Interval", label: `${r.label} ${r.name}`, total: r.total, correct: r.correct })),
    ...chordRows.map((r) => ({ kind: "Chord", label: r.label, total: r.total, correct: r.correct })),
    ...centsRows.map((r) => ({ kind: "Cents", label: r.label, total: r.total, correct: r.correct })),
  ]
    .filter((r) => r.total >= 5)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
    .slice(0, 10);

  const noData = s.totals.total === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Stats</h1>
        <RangeFilter active={range.key} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Reps" value={s.totals.total.toLocaleString()} hint={range.days ? `last ${range.days} days` : "all time"} />
        <StatTile label="Fully right" value={pct(s.totals.correct, s.totals.total)} hint={s.totals.total ? `average credit ${Math.round(s.totals.avgScore * 100)}%` : undefined} />
        <StatTile label="Today" value={`${s.today.total}`} hint={s.today.total ? `${pct(s.today.correct, s.today.total)} right` : "nothing yet today"} />
        <StatTile label="Streak" value={`${s.streak.current} day${s.streak.current === 1 ? "" : "s"}`} hint={`longest ${s.streak.longest}, ${s.streak.activeDays} active days`} />
        <StatTile label="Avg response" value={s.totals.total ? `${(s.totals.avgMs / 1000).toFixed(1)}s` : "–"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Reps per day"
          empty={noData}
          table={{ columns: ["Day", "Reps", "Right", "Accuracy"], rows: s.byDay.map((d) => [d.day, d.total, d.correct, pct(d.correct, d.total)]), numeric: [1, 2, 3] }}
        >
          <DailyRepsChart data={s.byDay} />
        </ChartCard>
        <ChartCard
          title="Accuracy per day"
          empty={noData}
          table={{ columns: ["Day", "Accuracy", "Reps"], rows: s.byDay.map((d) => [d.day, pct(d.correct, d.total), d.total]), numeric: [1, 2] }}
        >
          <DailyAccuracyChart data={s.byDay} />
        </ChartCard>
        <ChartCard
          title="Response time per day"
          description="Milliseconds from the note to your answer"
          empty={noData}
          table={{ columns: ["Day", "Avg ms"], rows: s.byDay.map((d) => [d.day, d.avgMs]), numeric: [1] }}
        >
          <DailyResponseChart data={s.byDay} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Accuracy by note"
          description="Every mode that targets a single note"
          empty={pitchRows.every((r) => !r.total)}
          table={{ columns: ["Note", "Reps", "Right", "Accuracy"], rows: pitchRows.map((r) => [r.label, r.total, r.correct, pct(r.correct, r.total)]), numeric: [1, 2, 3] }}
        >
          <CategoryAccuracyChart data={pitchRows} />
        </ChartCard>
        <ChartCard
          title="Accuracy by octave"
          empty={octaveRows.length === 0}
          table={{ columns: ["Octave", "Reps", "Right", "Accuracy"], rows: octaveRows.map((r) => [r.label, r.total, r.correct, pct(r.correct, r.total)]), numeric: [1, 2, 3] }}
        >
          <CategoryAccuracyChart data={octaveRows} />
        </ChartCard>
      </div>

      <ChartCard
        title="What you answered when each note was played"
        description="Single-note modes. Rows are the note played, columns your answer."
        empty={s.confusion.length === 0}
        table={{
          columns: ["Played", "Answered", "Times"],
          rows: [...s.confusion].filter((c) => c.target !== c.answer).sort((a, b) => b.n - a.n).slice(0, 30).map((c) => [PITCH_CLASS_SHORT[c.target], PITCH_CLASS_SHORT[c.answer], c.n]),
          numeric: [2],
        }}
      >
        <ConfusionMatrix cells={s.confusion} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Intervals"
          description="Accuracy per interval, every position of every chain and stack"
          empty={intervalRows.length === 0}
          table={{ columns: ["Interval", "Reps", "Right", "Accuracy"], rows: intervalRows.map((r) => [`${r.label} ${r.name}`, r.total, r.correct, pct(r.correct, r.total)]), numeric: [1, 2, 3] }}
        >
          <CategoryAccuracyChart data={intervalRows} />
        </ChartCard>
        <ChartCard
          title="Cents"
          description="Accuracy by how far out of tune the note was"
          empty={centsRows.length === 0}
          table={{
            columns: ["Deviation", "Reps", "Right", "Accuracy", "Direction right"],
            rows: centsRows.map((r) => [r.label, r.total, r.correct, pct(r.correct, r.total), pct(r.dirCorrect, r.total)]),
            numeric: [1, 2, 3, 4],
          }}
        >
          <CategoryAccuracyChart data={centsRows} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Smallest deviation you reliably hear"
          description="Per day: the smallest cents bucket with at least 80% direction accuracy on 4+ reps. Lower is better."
          empty={s.centsJndByDay.every((d) => d.jnd === null)}
          table={{ columns: ["Day", "Cents"], rows: s.centsJndByDay.map((d) => [d.day, d.jnd ?? "not enough reps"]), numeric: [1] }}
        >
          <JndChart data={s.centsJndByDay} />
        </ChartCard>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Chords, clusters and sequences</CardTitle>
            <CardDescription>Fully right and average credit</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Reps</TableHead>
                  <TableHead className="text-right">Fully right</TableHead>
                  <TableHead className="text-right">Avg credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chordRows.map((r) => (
                  <TableRow key={`c-${r.label}`}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.correct, r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(r.avgScore * 100)}%</TableCell>
                  </TableRow>
                ))}
                {s.sequence.map((r) => (
                  <TableRow key={`s-${r.length}`}>
                    <TableCell>Sequence of {r.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.correct, r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(r.avgScore * 100)}%</TableCell>
                  </TableRow>
                ))}
                {chordRows.length === 0 && s.sequence.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No chord or sequence reps in this range yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Weakest items</CardTitle>
            <CardDescription>At least 5 reps, lowest accuracy first. The adaptive picker targets these.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Reps</TableHead>
                  <TableHead className="text-right">Accuracy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weakest.map((r) => (
                  <TableRow key={`${r.kind}-${r.label}`}>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{r.kind} · </span>
                      {r.label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.correct, r.total)}</TableCell>
                  </TableRow>
                ))}
                {weakest.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Nothing with 5+ reps yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>By mode</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Reps</TableHead>
                  <TableHead className="text-right">Fully right</TableHead>
                  <TableHead className="text-right">Avg credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.byMode.map((r) => (
                  <TableRow key={r.mode}>
                    <TableCell>{MODE_LABELS[r.mode] ?? r.mode}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.correct, r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(r.avgScore * 100)}%</TableCell>
                  </TableRow>
                ))}
                {s.byMode.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No reps in this range yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>By instrument</CardTitle>
            <CardDescription>Most played first</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instrument</TableHead>
                  <TableHead className="text-right">Reps</TableHead>
                  <TableHead className="text-right">Accuracy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.byInstrument.slice(0, 25).map((r) => (
                  <TableRow key={r.instrumentId}>
                    <TableCell className="max-w-48 truncate">{instrumentLabel(r.instrumentId)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.correct, r.total)}</TableCell>
                  </TableRow>
                ))}
                {s.byInstrument.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No reps in this range yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
