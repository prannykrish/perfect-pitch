/**
 * Grades a performance against a reference phrase.
 *
 * Pitch: the reference and the played notes are both ordered by time (then pitch) and aligned
 * with edit distance, so one dropped or inserted note does not shift everything after it.
 * Each reference note ends up matched / wrong (a different note played in its place) / missing;
 * played notes with no partner are extra.
 *
 * Rhythm (optional): a straight line ms = offset + scale·beat is fitted through the matched
 * pairs (the player sets their own tempo), then each matched note's deviation from that line is
 * measured in beats against a tolerance.
 */
import type { ScoreNote } from "@/lib/music/score";

export interface PlayedNote {
  midi: number;
  /** ms, any origin (only differences matter). */
  timeMs: number;
  durationMs?: number;
  velocity?: number;
}

export interface GradeOptions {
  rhythm: boolean;
  /** Allowed deviation in beats when rhythm is graded. */
  rhythmToleranceBeats: number;
  /** Treat the same pitch class in any octave as a match. */
  octaveInsensitive?: boolean;
  /** Weight of rhythm in the combined score when rhythm is on. */
  rhythmWeight?: number;
}

export type RefStatus = "matched" | "wrong" | "missing";

export interface AlignedRef {
  ref: ScoreNote;
  status: RefStatus;
  played?: PlayedNote;
  /** Deviation in beats from the fitted timeline (matched notes only, when a fit exists). */
  deviationBeats?: number;
}

export interface GradeResult {
  pitchScore: number;
  rhythmScore: number | null;
  score: number;
  correct: boolean;
  matched: number;
  wrong: number;
  missing: number;
  extra: number;
  refs: AlignedRef[];
  extras: PlayedNote[];
  /** ms per beat of the player's tempo (null when fewer than 2 matched notes). */
  msPerBeat: number | null;
  offsetMs: number | null;
  /** Every played note placed on the reference timeline (beats), for the piano-roll overlay. */
  playedOnTimeline: { played: PlayedNote; beat: number; status: "matched" | "wrong" | "extra" }[];
}

function samePitch(a: number, b: number, octaveInsensitive?: boolean) {
  return octaveInsensitive ? ((a - b) % 12) === 0 : a === b;
}

/** Notes pressed within this many ms of each other count as one chord and are ordered by pitch. */
const CHORD_WINDOW_MS = 80;

/** Sort by time, but treat near-simultaneous notes as a chord ordered by pitch (like the reference). */
function orderPlayed(played: PlayedNote[]): PlayedNote[] {
  const byTime = [...played].sort((a, b) => a.timeMs - b.timeMs || a.midi - b.midi);
  const out: PlayedNote[] = [];
  let group: PlayedNote[] = [];
  let groupStart = -Infinity;
  for (const p of byTime) {
    if (p.timeMs - groupStart > CHORD_WINDOW_MS) {
      out.push(...group.sort((a, b) => a.midi - b.midi));
      group = [];
      groupStart = p.timeMs;
    }
    group.push(p);
  }
  out.push(...group.sort((a, b) => a.midi - b.midi));
  return out;
}

export function gradePerformance(refNotesIn: ScoreNote[], playedIn: PlayedNote[], bpm: number, opts: GradeOptions): GradeResult {
  const refs = [...refNotesIn].sort((a, b) => a.start - b.start || a.midi - b.midi);
  const played = orderPlayed(playedIn);
  const n = refs.length;
  const m = played.length;

  // Levenshtein with backtrace. cost: match 0, substitution 1, indel 1.
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = dp[i - 1][j - 1] + (samePitch(refs[i - 1].midi, played[j - 1].midi, opts.octaveInsensitive) ? 0 : 1);
      dp[i][j] = Math.min(sub, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  const aligned: AlignedRef[] = refs.map((ref) => ({ ref, status: "missing" }));
  const extras: PlayedNote[] = [];
  const playedStatus = new Map<PlayedNote, "matched" | "wrong" | "extra">();
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const isMatch = samePitch(refs[i - 1].midi, played[j - 1].midi, opts.octaveInsensitive);
      const sub = dp[i - 1][j - 1] + (isMatch ? 0 : 1);
      if (dp[i][j] === sub) {
        aligned[i - 1] = { ref: refs[i - 1], status: isMatch ? "matched" : "wrong", played: played[j - 1] };
        playedStatus.set(played[j - 1], isMatch ? "matched" : "wrong");
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      aligned[i - 1] = { ref: refs[i - 1], status: "missing" };
      i--;
      continue;
    }
    // insertion: extra played note
    extras.push(played[j - 1]);
    playedStatus.set(played[j - 1], "extra");
    j--;
  }

  const matched = aligned.filter((a) => a.status === "matched").length;
  const wrong = aligned.filter((a) => a.status === "wrong").length;
  const missing = aligned.filter((a) => a.status === "missing").length;
  const pitchScore = n ? matched / n : 0;

  // Timeline fit through matched pairs: timeMs = offset + msPerBeat * beat
  const pairs = aligned.filter((a) => a.status === "matched" && a.played).map((a) => ({ beat: a.ref.start, ms: a.played!.timeMs }));
  let msPerBeat: number | null = null;
  let offsetMs: number | null = null;
  if (pairs.length >= 2) {
    const mb = pairs.reduce((s, p) => s + p.beat, 0) / pairs.length;
    const mm = pairs.reduce((s, p) => s + p.ms, 0) / pairs.length;
    const sxx = pairs.reduce((s, p) => s + (p.beat - mb) ** 2, 0);
    if (sxx > 1e-9) {
      const slope = pairs.reduce((s, p) => s + (p.beat - mb) * (p.ms - mm), 0) / sxx;
      if (slope > 50) {
        msPerBeat = slope;
        offsetMs = mm - slope * mb;
      }
    }
  }
  const fallbackMsPerBeat = 60000 / bpm;
  const firstPlayed = played[0]?.timeMs ?? 0;
  const firstRefBeat = refs[0]?.start ?? 0;
  const toBeat = (ms: number) => (msPerBeat && offsetMs !== null ? (ms - offsetMs) / msPerBeat : firstRefBeat + (ms - firstPlayed) / fallbackMsPerBeat);

  let rhythmScore: number | null = null;
  if (opts.rhythm) {
    if (msPerBeat && offsetMs !== null) {
      let ok = 0;
      for (const a of aligned) {
        if (a.status !== "matched" || !a.played) continue;
        const dev = toBeat(a.played.timeMs) - a.ref.start;
        a.deviationBeats = dev;
        if (Math.abs(dev) <= opts.rhythmToleranceBeats) ok++;
      }
      rhythmScore = matched ? ok / matched : 0;
    } else rhythmScore = 0;
  } else {
    for (const a of aligned) if (a.status === "matched" && a.played) a.deviationBeats = toBeat(a.played.timeMs) - a.ref.start;
  }

  const w = opts.rhythmWeight ?? 0.3;
  const score = rhythmScore === null ? pitchScore : (1 - w) * pitchScore + w * rhythmScore;
  const correct = matched === n && extras.length === 0 && (rhythmScore === null || rhythmScore >= 0.999);

  const playedOnTimeline = played.map((p) => ({ played: p, beat: toBeat(p.timeMs), status: playedStatus.get(p) ?? "extra" }));

  return { pitchScore, rhythmScore, score, correct, matched, wrong, missing, extra: extras.length, refs: aligned, extras, msPerBeat, offsetMs, playedOnTimeline };
}
