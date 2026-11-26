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
import { CategoryAccuracyChart, DailyAccuracyChart, DailyPercentChart, DailyRepsChart, DailyResponseChart, DailyValueChart, JndChart } from "@/components/stats/charts";
import { ConfusionMatrix } from "@/components/stats/confusion-matrix";
import { MATERIAL_LABELS, PROBLEM_LABELS, type MaterialKind, type ProblemType } from "@/lib/mistakes/types";
import { LEVEL_LABELS, THEORY_KIND_LABELS, type TheoryKind } from "@/lib/compose/theory";
import { scaleDef } from "@/lib/music/scales";

export const dynamic = "force-dynamic";

const MODE_LABELS: Record<string, string> = {
  "single-note": "Single note",
  roulette: "Single note (roulette)",
  sequence: "Sequence",
  intervals: "Intervals",
  chords: "Chords & clusters",
  scales: "Scales & modes",
  cents: "Cents",
  transcribe: "Hear It, Play It",
  shadow: "Shadow mode",
  mistakes: "Find the Mistake",
  theory: "Theory drills",
  prompt: "Prompt drill (self-rated)",
  hum: "Hum then play",
};

const PROBLEM_SHORT: Record<string, string> = {
  detune: "Detune",
  "wrong-note": "Wrong note",
  "chord-quality": "Chord quality",
  inversion: "Inversion",
  rhythm: "Rhythm",
  drift: "Drift",
  "voice-leading": "Voice leading",
  ab: "A/B",
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

  const scaleRowMap = new Map<string, { label: string; name: string; total: number; correct: number; runs: number; melodies: number }>();
  for (const r of s.scales) {
    const def = scaleDef(r.scaleId);
    const row = scaleRowMap.get(r.scaleId) ?? { label: def?.short ?? r.scaleId, name: def?.name ?? r.scaleId, total: 0, correct: 0, runs: 0, melodies: 0 };
    row.total += r.total;
    row.correct += r.correct;
    if (r.variant === "run") row.runs += r.total;
    else row.melodies += r.total;
    scaleRowMap.set(r.scaleId, row);
  }
  const scaleRows = [...scaleRowMap.values()];
  const mistakeRows = s.mistakes.byType.map((r) => ({
    label: PROBLEM_SHORT[r.type] ?? r.type,
    name: PROBLEM_LABELS[r.type as ProblemType] ?? r.type,
    total: r.total,
    correct: r.correct,
    avgScore: r.avgScore,
    locCorrect: r.locCorrect,
    diagCorrect: r.diagCorrect,
    fixAsked: r.fixAsked,
    fixCorrect: r.fixCorrect,
  }));
  const mistakeCentsRows = s.mistakes.byCents.map((r) => ({ label: `${r.amount}¢`, total: r.total, correct: r.correct, dirCorrect: r.dirCorrect }));
  const shadowRows = s.shadowByDay.map((d) => ({ day: d.day, value: Math.round(d.avgScore * 100), total: d.total }));
  const theoryLevelRows = s.theory.byLevel.map((r) => ({ label: `L${r.level}`, name: LEVEL_LABELS[r.level] ?? "", total: r.total, correct: r.correct, avgScore: r.avgScore }));
  const theoryKindRows = s.theory.byKind.map((r) => ({ label: THEORY_KIND_LABELS[r.kind as TheoryKind] ?? r.kind, total: r.total, correct: r.correct, avgScore: r.avgScore }));
  const promptLatencyRows = s.promptByDay.filter((d) => d.avgLatencyMs !== null).map((d) => ({ day: d.day, value: d.avgLatencyMs!, total: d.total, rating: d.avgRating }));
  const humRows = s.humByDay.map((d) => ({ day: d.day, value: Math.round(d.avgScore * 100), total: d.total }));

  // Weakest items: at least 5 reps, lowest accuracy first
  const weakest = [
    ...pitchRows.map((r) => ({ kind: "Note", ...r })),
    ...mistakeRows.map((r) => ({ kind: "Mistake", label: r.name, total: r.total, correct: r.correct })),
    ...scaleRows.map((r) => ({ kind: "Scale", label: r.name, total: r.total, correct: r.correct })),
    ...theoryKindRows.map((r) => ({ kind: "Theory", label: r.label, total: r.total, correct: r.correct })),
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

      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-5">
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

      <ChartCard
        title="Scales & modes"
        description="Hear a run or a melody, name the scale and its tonic"
        empty={scaleRows.length === 0}
        table={{
          columns: ["Scale", "Runs", "Melodies", "Reps", "Right", "Accuracy"],
          rows: scaleRows.map((r) => [r.name, r.runs, r.melodies, r.total, r.correct, pct(r.correct, r.total)]),
          numeric: [1, 2, 3, 4, 5],
        }}
      >
        <CategoryAccuracyChart data={scaleRows} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Find the Mistake: by problem type"
          description="Fully right = location and diagnosis both right. The fix is a bonus."
          empty={mistakeRows.length === 0}
          table={{
            columns: ["Problem", "Reps", "Fully right", "Location right", "Diagnosis right", "Fix named", "Avg credit"],
            rows: mistakeRows.map((r) => [r.name, r.total, pct(r.correct, r.total), pct(r.locCorrect, r.total), pct(r.diagCorrect, r.total), r.fixAsked ? `${pct(r.fixCorrect, r.fixAsked)} of ${r.fixAsked}` : "–", `${Math.round(r.avgScore * 100)}%`]),
            numeric: [1, 2, 3, 4, 5, 6],
          }}
        >
          <CategoryAccuracyChart data={mistakeRows} />
        </ChartCard>
        <ChartCard
          title="Find the Mistake: cents in context"
          description="A detuned note or drifted voice inside real material: the production-relevant threshold"
          empty={mistakeCentsRows.length === 0}
          table={{
            columns: ["Deviation", "Reps", "Fully right", "Direction right"],
            rows: mistakeCentsRows.map((r) => [r.label, r.total, pct(r.correct, r.total), pct(r.dirCorrect, r.total)]),
            numeric: [1, 2, 3],
          }}
        >
          <CategoryAccuracyChart data={mistakeCentsRows} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Find the Mistake: by source</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Reps</TableHead>
                  <TableHead className="text-right">Fully right</TableHead>
                  <TableHead className="text-right">Avg credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.mistakes.bySource.map((r) => (
                  <TableRow key={r.source}>
                    <TableCell>{MATERIAL_LABELS[r.source as MaterialKind] ?? r.source}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.correct, r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(r.avgScore * 100)}%</TableCell>
                  </TableRow>
                ))}
                {s.mistakes.bySource.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No Find the Mistake reps in this range yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Hear It, Play It</CardTitle>
            <CardDescription>
              Longest phrase fully right: {s.transcribe.longestCorrectBars ?? "–"} bar{s.transcribe.longestCorrectBars === 1 ? "" : "s"} · at 90%+: {s.transcribe.longestPassedBars ?? "–"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phrase</TableHead>
                  <TableHead className="text-right">Reps</TableHead>
                  <TableHead className="text-right">Fully right</TableHead>
                  <TableHead className="text-right">Avg credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.transcribe.byVoices.map((r) => (
                  <TableRow key={`v-${r.voices}`}>
                    <TableCell>
                      {r.voices} voice{r.voices === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.correct, r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(r.avgScore * 100)}%</TableCell>
                  </TableRow>
                ))}
                {s.transcribe.byBars.map((r) => (
                  <TableRow key={`b-${r.bars}`}>
                    <TableCell>
                      {r.bars} bar{r.bars === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.correct, r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(r.avgScore * 100)}%</TableCell>
                  </TableRow>
                ))}
                {s.transcribe.byVoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No transcription reps in this range yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <ChartCard
          title="Shadow mode accuracy per day"
          description="Share of reference notes hit live, within the timing window"
          empty={shadowRows.length === 0}
          table={{ columns: ["Day", "Accuracy", "Runs"], rows: shadowRows.map((d) => [d.day, `${d.value}%`, d.total]), numeric: [1, 2] }}
        >
          <DailyPercentChart data={shadowRows} label="Accuracy %" />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Theory drills by level"
          description="Played on the piano and checked note for note"
          empty={theoryLevelRows.length === 0}
          table={{
            columns: ["Level", "Reps", "Right", "Accuracy", "Avg credit"],
            rows: theoryLevelRows.map((r) => [`${r.label} ${r.name}`, r.total, r.correct, pct(r.correct, r.total), `${Math.round(r.avgScore * 100)}%`]),
            numeric: [1, 2, 3, 4],
          }}
        >
          <CategoryAccuracyChart data={theoryLevelRows} />
        </ChartCard>
        <ChartCard
          title="Prompt drill: first-note latency"
          description="Milliseconds from the downbeat to your first note, per day. Lower is better."
          empty={promptLatencyRows.length === 0}
          table={{ columns: ["Day", "Latency ms", "Takes", "Avg rating"], rows: promptLatencyRows.map((d) => [d.day, d.value, d.total, d.rating.toFixed(1)]), numeric: [1, 2, 3] }}
        >
          <DailyValueChart data={promptLatencyRows} label="First note (ms)" />
        </ChartCard>
        <ChartCard
          title="Hum then play"
          description="Share of hummed notes played back right, per day"
          empty={humRows.length === 0}
          table={{ columns: ["Day", "Accuracy", "Takes"], rows: humRows.map((d) => [d.day, `${d.value}%`, d.total]), numeric: [1, 2] }}
        >
          <DailyPercentChart data={humRows} label="Accuracy %" />
        </ChartCard>
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
