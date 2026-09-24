/**
 * The Progress tab: every musical skill the app trains, what "good" looks like, and where you are,
 * computed from the lifetime and recent stats. Pure.
 */
import { getInstrument } from "@/lib/audio/instruments";
import { intervalShort } from "@/lib/music/intervals";
import { chordQuality } from "@/lib/music/chords";
import type { StatsData } from "@/lib/db/actions";
import { LEVEL_LABELS } from "@/lib/compose/theory";
import { PROBLEM_LABELS, type ProblemType } from "@/lib/mistakes/types";

export type SkillArea = "hearing" | "harmony" | "hands";
export const AREA_LABELS: Record<SkillArea, string> = { hearing: "Hearing", harmony: "Harmony and theory", hands: "Head to hands" };

export interface SkillStatus {
  id: string;
  name: string;
  area: SkillArea;
  /** One line on what the skill is. */
  what: string;
  /** Headline number, e.g. "94 %" or "6 notes". */
  value: string;
  detail: string;
  /** 0 not started · 1 building · 2 solid · 3 strong */
  stage: 0 | 1 | 2 | 3;
  /** 0..1 towards the next stage. */
  progress: number;
  next: string;
  /** Recent change, in words, or null. */
  trend: string | null;
  href: string;
  lesson: string;
}

export const STAGE_LABELS = ["Not started", "Building", "Solid", "Strong"];

export interface ModeDay {
  day: string;
  mode: string;
  total: number;
  correct: number;
}

const pct = (c: number, t: number) => (t ? c / t : 0);
const fmtPct = (x: number) => `${Math.round(x * 100)} %`;

function stageFromAccuracy(acc: number, reps: number, minReps: number, solid: number, strong: number): { stage: 0 | 1 | 2 | 3; progress: number } {
  if (reps === 0) return { stage: 0, progress: 0 };
  if (reps < minReps) return { stage: 1, progress: Math.min(0.5, reps / minReps / 2) };
  if (acc >= strong) return { stage: 3, progress: 1 };
  if (acc >= solid) return { stage: 2, progress: (acc - solid) / (strong - solid) };
  return { stage: 1, progress: 0.5 + (acc / solid) * 0.5 };
}

/** Accuracy trend for a set of attempt modes: last 30 days vs the 30 before. */
function trendFor(modeDays: ModeDay[], modes: string[], cutoff: string, earlier: string): string | null {
  const recent = modeDays.filter((d) => modes.includes(d.mode) && d.day >= cutoff);
  const before = modeDays.filter((d) => modes.includes(d.mode) && d.day >= earlier && d.day < cutoff);
  const rt = recent.reduce((a, d) => a + d.total, 0);
  const bt = before.reduce((a, d) => a + d.total, 0);
  if (rt < 10 || bt < 10) return rt ? `${rt} reps in the last 30 days` : null;
  const ra = pct(recent.reduce((a, d) => a + d.correct, 0), rt);
  const ba = pct(before.reduce((a, d) => a + d.correct, 0), bt);
  const delta = Math.round((ra - ba) * 100);
  return `${rt} reps in 30 days · accuracy ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)} points vs the 30 days before`;
}

function dayKeyOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeSkills(all: StatsData, modeDays: ModeDay[]): SkillStatus[] {
  const cutoff = dayKeyOffset(30);
  const earlier = dayKeyOffset(60);
  const out: SkillStatus[] = [];

  // ---- pitch (single-note modes) ----
  {
    const total = all.byPitchClass.reduce((a, r) => a + r.total, 0);
    const correct = all.byPitchClass.reduce((a, r) => a + r.correct, 0);
    const acc = pct(correct, total);
    const weakest = [...all.byPitchClass].filter((r) => r.total >= 5).sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total))[0];
    const s = stageFromAccuracy(acc, total, 200, 0.9, 0.97);
    out.push({
      id: "pitch",
      name: "Naming notes",
      area: "hearing",
      what: "Hear one note on any instrument and say which note it is.",
      value: total ? fmtPct(acc) : "–",
      detail: total ? `${total} notes named${weakest ? ` · weakest ${["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][weakest.pitchClass]} at ${fmtPct(pct(weakest.correct, weakest.total))}` : ""}` : "No single-note reps yet.",
      stage: s.stage,
      progress: s.progress,
      next: total < 200 ? `${200 - total} more reps to judge it` : acc < 0.9 ? "90 % over 200 reps" : acc < 0.97 ? "97 %" : "Keep it there on hard timbres",
      trend: trendFor(modeDays, ["single-note", "roulette"], cutoff, earlier),
      href: "/trainer?mode=single",
      lesson: "notes-and-pitch",
    });
  }

  // ---- octaves ----
  {
    const total = all.byOctave.reduce((a, r) => a + r.total, 0);
    const correct = all.byOctave.reduce((a, r) => a + r.correct, 0);
    const acc = pct(correct, total);
    const weakest = [...all.byOctave].filter((r) => r.total >= 5).sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total))[0];
    const s = stageFromAccuracy(acc, total, 200, 0.85, 0.95);
    out.push({
      id: "octaves",
      name: "Placing the octave",
      area: "hearing",
      what: "Not just which note, but which octave it sits in.",
      value: total ? fmtPct(acc) : "–",
      detail: total ? `${total} reps${weakest ? ` · weakest octave ${weakest.octave} at ${fmtPct(pct(weakest.correct, weakest.total))}` : ""}` : "Answer with pitch + octave in the trainer.",
      stage: s.stage,
      progress: s.progress,
      next: acc < 0.85 ? "85 % with octave answers" : acc < 0.95 ? "95 %" : "Extreme octaves on odd timbres",
      trend: null,
      href: "/trainer?mode=single",
      lesson: "notes-and-pitch",
    });
  }

  // ---- timbre independence ----
  {
    let hardT = 0;
    let hardC = 0;
    let cleanT = 0;
    let cleanC = 0;
    for (const r of all.byInstrument) {
      const def = getInstrument(r.instrumentId);
      if (!def) continue;
      if (def.tier === "clean") {
        cleanT += r.total;
        cleanC += r.correct;
      } else {
        hardT += r.total;
        hardC += r.correct;
      }
    }
    const acc = pct(hardC, hardT);
    const gap = cleanT && hardT ? pct(cleanC, cleanT) - acc : 0;
    const s = stageFromAccuracy(acc, hardT, 100, 0.85, 0.95);
    out.push({
      id: "timbre",
      name: "Timbre independence",
      area: "hearing",
      what: "Pitch recognition that does not care whether it is a flute, a synth or a bell.",
      value: hardT ? fmtPct(acc) : "–",
      detail: hardT ? `${hardT} reps on hard / chaos sounds · ${gap > 0 ? `${Math.round(gap * 100)} points below clean sounds` : "no gap to clean sounds"}` : "Use a random-instrument pool with the hard tier on.",
      stage: s.stage,
      progress: s.progress,
      next: hardT < 100 ? "100 reps on hard or chaos instruments" : gap > 0.05 ? "Close the gap to clean sounds under 5 points" : "Chaos tier only",
      trend: null,
      href: "/trainer?mode=single",
      lesson: "timbre-and-harmonics",
    });
  }

  // ---- memory span (sequences) ----
  {
    const rows = all.sequence.filter((r) => r.total >= 5);
    const best = rows.filter((r) => r.avgScore >= 0.8).reduce((m, r) => Math.max(m, r.length), 0);
    const total = all.sequence.reduce((a, r) => a + r.total, 0);
    const stage: 0 | 1 | 2 | 3 = total === 0 ? 0 : best >= 8 ? 3 : best >= 5 ? 2 : 1;
    out.push({
      id: "memory",
      name: "Memory span",
      area: "hearing",
      what: "How many notes in a row you can hold and name in order.",
      value: best ? `${best} notes` : total ? "< 3 notes" : "–",
      detail: total ? `${total} sequences · longest length with 80 % average credit: ${best || "none yet"}` : "Run the Sequence mode.",
      stage,
      progress: Math.min(1, best / 8),
      next: best < 5 ? "Length 5 at 80 %" : best < 8 ? "Length 8 at 80 %" : "Length 12 with a random instrument per note",
      trend: trendFor(modeDays, ["sequence"], cutoff, earlier),
      href: "/trainer?mode=sequence",
      lesson: "ear-training-for-absolute-pitch",
    });
  }

  // ---- intervals ----
  {
    const total = all.intervals.reduce((a, r) => a + r.total, 0);
    const correct = all.intervals.reduce((a, r) => a + r.correct, 0);
    const acc = pct(correct, total);
    const good = all.intervals.filter((r) => r.total >= 5 && pct(r.correct, r.total) >= 0.9).length;
    const weakest = [...all.intervals].filter((r) => r.total >= 5).sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total))[0];
    const s = stageFromAccuracy(acc, total, 120, 0.85, 0.95);
    out.push({
      id: "intervals",
      name: "Intervals",
      area: "harmony",
      what: "The distance between two notes, named without leaning on the notes themselves.",
      value: total ? fmtPct(acc) : "–",
      detail: total ? `${good} of 12 simple intervals at 90 %+${weakest ? ` · weakest ${intervalShort(weakest.semitones)} at ${fmtPct(pct(weakest.correct, weakest.total))}` : ""}` : "Run the Intervals mode.",
      stage: s.stage,
      progress: s.progress,
      next: good < 12 ? `All 12 simple intervals at 90 % (${12 - good} to go)` : "Compound intervals and chains of 6",
      trend: trendFor(modeDays, ["intervals"], cutoff, earlier),
      href: "/trainer?mode=intervals",
      lesson: "intervals",
    });
  }

  // ---- chord vocabulary ----
  {
    const rows = all.chords.filter((r) => r.kind !== "cluster" && r.qualityId);
    const total = rows.reduce((a, r) => a + r.total, 0);
    const correct = rows.reduce((a, r) => a + r.correct, 0);
    const acc = pct(correct, total);
    const known = rows.filter((r) => r.total >= 5 && pct(r.correct, r.total) >= 0.85).length;
    const weakest = [...rows].filter((r) => r.total >= 5).sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total))[0];
    const stage: 0 | 1 | 2 | 3 = total === 0 ? 0 : known >= 20 ? 3 : known >= 8 ? 2 : 1;
    out.push({
      id: "chords",
      name: "Chord vocabulary",
      area: "harmony",
      what: "Naming root and quality of a chord you hear, 33 qualities from triads to 13ths.",
      value: total ? `${known} / 33` : "–",
      detail: total ? `${fmtPct(acc)} over ${total} chords${weakest ? ` · weakest ${chordQuality(weakest.qualityId!)?.name ?? weakest.qualityId} at ${fmtPct(pct(weakest.correct, weakest.total))}` : ""}` : "Run Chords & clusters with root + quality.",
      stage,
      progress: Math.min(1, known / 20),
      next: known < 8 ? "8 qualities at 85 % (triads and common sevenths)" : known < 20 ? "20 qualities at 85 %" : "All 33, with inversions asked",
      trend: trendFor(modeDays, ["chords"], cutoff, earlier),
      href: "/trainer?mode=chords",
      lesson: "chords",
    });
  }

  // ---- polyphony (clusters + every-note answers) ----
  {
    const rows = all.chords.filter((r) => r.kind === "cluster");
    const total = rows.reduce((a, r) => a + r.total, 0);
    const avg = total ? rows.reduce((a, r) => a + r.avgScore * r.total, 0) / total : 0;
    const s = stageFromAccuracy(avg, total, 60, 0.8, 0.95);
    out.push({
      id: "polyphony",
      name: "Splitting a cluster",
      area: "hearing",
      what: "Every note of a stack of random notes, with no chord theory to lean on.",
      value: total ? fmtPct(avg) : "–",
      detail: total ? `${total} clusters · average credit ${fmtPct(avg)}` : "Run Chords & clusters with clusters on.",
      stage: s.stage,
      progress: s.progress,
      next: avg < 0.8 ? "80 % credit on 3-note clusters" : "95 % on 4–6 notes within an octave",
      trend: null,
      href: "/trainer?mode=chords",
      lesson: "ear-training-for-absolute-pitch",
    });
  }

  // ---- cents ----
  {
    const rows = all.cents.filter((r) => r.amount > 0);
    const total = rows.reduce((a, r) => a + r.total, 0);
    const jndRow = [...rows].filter((r) => r.total >= 4 && pct(r.dirCorrect, r.total) >= 0.8).sort((a, b) => a.amount - b.amount)[0];
    const jnd = jndRow?.amount ?? null;
    const stage: 0 | 1 | 2 | 3 = total === 0 ? 0 : jnd !== null && jnd <= 10 ? 3 : jnd !== null && jnd <= 20 ? 2 : 1;
    out.push({
      id: "cents",
      name: "Tuning (cents)",
      area: "hearing",
      what: "The smallest detuning you reliably hear, and which way it went.",
      value: jnd !== null ? `${jnd} cents` : total ? "> 50 cents" : "–",
      detail: total ? `${total} reps · direction right 80 %+ down to ${jnd ?? "no"} cents` : "Run the Cents mode.",
      stage,
      progress: jnd === null ? 0 : Math.min(1, (50 - jnd) / 45),
      next: jnd === null || jnd > 20 ? "Direction right at 20 cents" : jnd > 10 ? "10 cents" : jnd > 5 ? "5 cents" : "5 cents inside real material (Find the Mistake)",
      trend: trendFor(modeDays, ["cents"], cutoff, earlier),
      href: "/trainer?mode=cents",
      lesson: "tuning-and-cents",
    });
  }

  // ---- transcription ----
  {
    const longest = all.transcribe.longestPassedBars;
    const total = all.transcribe.byBars.reduce((a, r) => a + r.total, 0);
    const voices = all.transcribe.byVoices.filter((r) => r.total >= 5 && r.avgScore >= 0.8).reduce((m, r) => Math.max(m, r.voices), 0);
    const stage: 0 | 1 | 2 | 3 = total === 0 ? 0 : (longest ?? 0) >= 4 && voices >= 2 ? 3 : (longest ?? 0) >= 2 ? 2 : 1;
    out.push({
      id: "transcription",
      name: "Hear it, play it",
      area: "hands",
      what: "Play back a phrase you just heard, exactly.",
      value: longest ? `${longest} bar${longest === 1 ? "" : "s"}` : total ? "< 1 bar" : "–",
      detail: total ? `${total} phrases · longest at 90 %: ${longest ?? "none"} bars · up to ${voices || 1} voice${voices === 1 ? "" : "s"} at 80 %` : "Run Hear It, Play It.",
      stage,
      progress: Math.min(1, ((longest ?? 0) / 4) * 0.7 + (Math.min(voices, 4) / 4) * 0.3),
      next: !longest || longest < 2 ? "2 bars at 90 %" : longest < 4 ? "4 bars at 90 %" : voices < 2 ? "Two voices of a chorale" : voices < 4 ? "All four voices" : "8 bars, four voices",
      trend: trendFor(modeDays, ["transcribe"], cutoff, earlier),
      href: "/transcribe",
      lesson: "reading-and-writing-what-you-hear",
    });
  }

  // ---- producer's ear ----
  {
    const rows = all.mistakes.byType;
    const total = rows.reduce((a, r) => a + r.total, 0);
    const correct = rows.reduce((a, r) => a + r.correct, 0);
    const acc = pct(correct, total);
    const good = rows.filter((r) => r.total >= 5 && pct(r.correct, r.total) >= 0.7).length;
    const weakest = [...rows].filter((r) => r.total >= 5).sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total))[0];
    const s = stageFromAccuracy(acc, total, 80, 0.7, 0.85);
    out.push({
      id: "mistakes",
      name: "Producer's ear",
      area: "harmony",
      what: "Point at the one thing wrong in a passage and say what the fix is.",
      value: total ? fmtPct(acc) : "–",
      detail: total ? `${good} of 8 problem types at 70 %+${weakest ? ` · weakest ${PROBLEM_LABELS[weakest.type as ProblemType] ?? weakest.type} at ${fmtPct(pct(weakest.correct, weakest.total))}` : ""}` : "Run Find the Mistake.",
      stage: s.stage,
      progress: s.progress,
      next: good < 8 ? `Every problem type at 70 % (${8 - good} to go)` : "85 % overall with 5–10 cent detunes",
      trend: trendFor(modeDays, ["mistakes"], cutoff, earlier),
      href: "/mistakes",
      lesson: "voice-leading",
    });
  }

  // ---- theory on the keys ----
  {
    const rows = all.theory.byLevel;
    const total = rows.reduce((a, r) => a + r.total, 0);
    const passed = rows.filter((r) => r.total >= 10 && pct(r.correct, r.total) >= 0.8).reduce((m, r) => Math.max(m, r.level), 0);
    const stage: 0 | 1 | 2 | 3 = total === 0 ? 0 : passed >= 6 ? 3 : passed >= 3 ? 2 : 1;
    out.push({
      id: "theory",
      name: "Theory on the keys",
      area: "hands",
      what: "Play what is named: voicings, scales, progressions, harmonisations.",
      value: passed ? `Level ${passed}` : total ? "Level 0" : "–",
      detail: total ? `${total} tasks · highest level at 80 % on 10+ tasks: ${passed || "none yet"}${passed ? ` (${LEVEL_LABELS[passed]})` : ""}` : "Run the Theory drills.",
      stage,
      progress: Math.min(1, passed / 6),
      next: passed < 6 ? `Level ${passed + 1}: ${LEVEL_LABELS[passed + 1]}` : "Everything at strict grading",
      trend: trendFor(modeDays, ["theory"], cutoff, earlier),
      href: "/compose?tab=theory",
      lesson: "voicings",
    });
  }

  // ---- imagination to hands (prompt) ----
  {
    const days = all.promptByDay;
    const total = days.reduce((a, d) => a + d.total, 0);
    const avgRating = total ? days.reduce((a, d) => a + d.avgRating * d.total, 0) / total : 0;
    const latDays = days.filter((d) => d.avgLatencyMs !== null);
    const lastLat = latDays.length ? latDays[latDays.length - 1].avgLatencyMs! : null;
    const firstLat = latDays.length ? latDays[0].avgLatencyMs! : null;
    const stage: 0 | 1 | 2 | 3 = total === 0 ? 0 : avgRating >= 4.2 && (lastLat ?? 9999) < 400 ? 3 : avgRating >= 3.5 ? 2 : 1;
    out.push({
      id: "prompt",
      name: "Imagine, then play",
      area: "hands",
      what: "Four bars from your head into one take, and how fast the first note comes.",
      value: total ? `${avgRating.toFixed(1)} / 5` : "–",
      detail: total ? `${total} takes${lastLat !== null ? ` · first note ${lastLat} ms after the downbeat${firstLat !== null && latDays.length > 1 ? ` (was ${firstLat})` : ""}` : ""}` : "Run the Prompt drill.",
      stage,
      progress: Math.min(1, avgRating / 5),
      next: avgRating < 3.5 ? "Average rating 3.5" : (lastLat ?? 9999) >= 400 ? "First note within 400 ms of the downbeat" : "Seed motifs and 8-bar takes",
      trend: null,
      href: "/compose?tab=prompt",
      lesson: "harmony-and-progressions",
    });
  }

  // ---- hum ----
  {
    const days = all.humByDay;
    const total = days.reduce((a, d) => a + d.total, 0);
    const avg = total ? days.reduce((a, d) => a + d.avgScore * d.total, 0) / total : 0;
    const s = stageFromAccuracy(avg, total, 20, 0.8, 0.95);
    out.push({
      id: "hum",
      name: "Hum then play",
      area: "hands",
      what: "A line from your voice to your hands, note for note.",
      value: total ? fmtPct(avg) : "–",
      detail: total ? `${total} lines` : "Run Hum then play (needs the mic).",
      stage: s.stage,
      progress: s.progress,
      next: avg < 0.8 ? "80 % over 20 lines" : "95 %, exact octave",
      trend: null,
      href: "/compose?tab=hum",
      lesson: "ear-training-for-absolute-pitch",
    });
  }

  return out;
}
