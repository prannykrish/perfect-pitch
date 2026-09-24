/**
 * Theory drills for Head to Keys: tasks in plain words ("play D♭maj9 in second inversion", "play
 * ii–V–I in F♯ with drop-2 voicings", "play D dorian", "harmonise this melody"), the note sets they
 * expect, and grading of what was played on the piano. Pure: no audio, no DOM.
 *
 * Levels (so practice can ramp up): 1 triads in root position and major / minor scales; 2 triad
 * inversions, sevenths in root position, modes; 3 seventh inversions, open voicings, scales in both
 * directions; 4 extensions, altered chords, drop-2; 5 progressions in a key; 6 harmonising a melody.
 */
import {
  bassPitchClass,
  chordLabel,
  chordOffsets,
  chordPitchClasses,
  chordQuality,
  CHORD_QUALITIES,
  identifyChord,
  INVERSION_LABELS,
  VOICING_LABELS,
  type ChordSpec,
  type Voicing,
} from "@/lib/music/chords";
import { PITCH_CLASS_SHORT, pick, pitchClassOf, randomInt } from "@/lib/music/notes";
import { SCALES, SCALE_LABELS, type ScaleName } from "@/lib/trainer/phrase-gen";

export type TheoryKind = "chord" | "scale" | "progression" | "harmonise";
export type Strictness = "strict" | "inversion" | "lenient";
export const THEORY_KINDS: TheoryKind[] = ["chord", "scale", "progression", "harmonise"];
export const THEORY_KIND_LABELS: Record<TheoryKind, string> = {
  chord: "Chord voicings by name",
  scale: "Scales and modes",
  progression: "Progressions in a key",
  harmonise: "Harmonise a melody",
};
export const STRICTNESS_LABELS: Record<Strictness, string> = {
  strict: "Exact voicing (inversion and spacing as asked)",
  inversion: "Right notes and right bass note, any spacing",
  lenient: "Right notes in any octave and order",
};
export const LEVEL_LABELS: Record<number, string> = {
  1: "Triads in root position · major and minor scales",
  2: "Triad inversions · sevenths · modes",
  3: "Seventh inversions · open voicings · scales both ways",
  4: "9ths, 11ths, 13ths, altered · drop-2",
  5: "Progressions in a key",
  6: "Harmonise a melody",
};
export const MAX_LEVEL = 6;

export interface ChordTask {
  kind: "chord";
  level: number;
  spec: ChordSpec;
  prompt: string;
}

export interface ScaleTask {
  kind: "scale";
  level: number;
  tonic: number;
  scale: ScaleName;
  startMidi: number;
  direction: "asc" | "desc" | "both";
  /** The notes expected, in order. */
  expected: number[];
  prompt: string;
}

export interface RomanChord {
  /** 0-based scale degree. */
  degree: number;
  roman: string;
  spec: ChordSpec;
}

export type VoicingConstraint = "free" | "closed" | "drop2";

export interface ProgressionTask {
  kind: "progression";
  level: number;
  tonic: number;
  minor: boolean;
  chords: RomanChord[];
  voicing: VoicingConstraint;
  prompt: string;
}

export interface HarmoniseTask {
  kind: "harmonise";
  level: number;
  tonic: number;
  minor: boolean;
  /** Melody notes (MIDI), one chord expected under each, in order. */
  melody: number[];
  bpm: number;
  prompt: string;
}

export type TheoryTask = ChordTask | ScaleTask | ProgressionTask | HarmoniseTask;

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const TRIADS = ["maj", "min", "dim", "aug"];
const SEVENTHS = ["7", "maj7", "m7", "m7b5", "dim7", "mMaj7", "6", "m6"];
const EXTENDED = CHORD_QUALITIES.filter((q) => q.category === "extended" || q.category === "altered" || q.category === "sus-add").map((q) => q.id);

const MAJOR_DEG = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEG = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_ROMAN = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
const MAJOR_TRIAD_Q = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MINOR_TRIAD_Q = ["min", "dim", "maj", "min", "min", "maj", "maj"];
const MAJOR_SEVENTH_Q = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
const MINOR_SEVENTH_Q = ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"];
const MAJOR_ROMAN_7 = ["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"];
const MINOR_ROMAN_7 = ["i7", "iiø7", "IIImaj7", "iv7", "v7", "VImaj7", "VII7"];

/** Progressions as scale degrees (0-based). */
const PROGRESSIONS: number[][] = [
  [1, 4, 0],
  [0, 5, 3, 4],
  [0, 3, 4, 0],
  [0, 4, 5, 3],
  [5, 3, 0, 4],
  [0, 2, 3, 4],
  [1, 4, 0, 5],
  [3, 4, 2, 5],
  [0, 3, 1, 4],
];

const KEY_NAMES = PITCH_CLASS_SHORT;

export function keyName(tonic: number, minor: boolean): string {
  return `${KEY_NAMES[tonic]} ${minor ? "minor" : "major"}`;
}

export function scaleDegreeSemitone(minor: boolean, degree: number): number {
  return (minor ? MINOR_DEG : MAJOR_DEG)[((degree % 7) + 7) % 7];
}

function chordPrompt(spec: ChordSpec): string {
  const q = chordQuality(spec.qualityId)!;
  const name = `${KEY_NAMES[spec.rootPc]} ${q.name}`;
  const parts = [`Play ${name}`];
  if (spec.inversion) parts.push(`in ${INVERSION_LABELS[spec.inversion].toLowerCase()}`);
  else if (spec.voicing !== "closed" || q.intervals.length > 3) parts.push("in root position");
  if (spec.voicing === "open") parts.push("with an open (spread) voicing");
  if (spec.voicing === "drop2") parts.push("as a drop-2 voicing");
  return `${parts.join(", ")} (${chordLabel(spec)}).`;
}

export function generateChordTask(level: number): ChordTask {
  const lvl = Math.max(1, Math.min(4, level));
  let qualities: string[];
  let inversions = false;
  let voicings: Voicing[] = ["closed"];
  if (lvl === 1) qualities = TRIADS;
  else if (lvl === 2) {
    qualities = pick([TRIADS, SEVENTHS]);
    inversions = qualities === TRIADS;
  } else if (lvl === 3) {
    qualities = pick([TRIADS, SEVENTHS]);
    inversions = true;
    voicings = ["closed", "open"];
  } else {
    qualities = pick([SEVENTHS, EXTENDED, EXTENDED]);
    inversions = qualities === SEVENTHS;
    voicings = ["closed", "drop2", "drop2"];
  }
  const qualityId = pick(qualities);
  const q = chordQuality(qualityId)!;
  const n = q.intervals.length;
  let voicing = pick(voicings);
  if (voicing === "drop2" && n < 4) voicing = "closed";
  if (voicing === "open" && n < 3) voicing = "closed";
  const inversion = inversions ? randomInt(0, Math.min(n - 1, 3)) : 0;
  const spec: ChordSpec = { rootPc: randomInt(0, 11), qualityId, inversion, voicing };
  return { kind: "chord", level: lvl, spec, prompt: chordPrompt(spec) };
}

const LEVEL_SCALES: Record<number, ScaleName[]> = {
  1: ["major", "minor"],
  2: ["major", "minor", "dorian", "mixolydian", "pentatonic", "blues"],
  3: ["major", "minor", "dorian", "mixolydian", "pentatonic", "blues", "chromatic"],
};

/** One octave of a scale starting on `startMidi`: up to the octave, down to the octave below, or up and back. */
export function scaleNotes(tonic: number, scale: ScaleName, startMidi: number, direction: "asc" | "desc" | "both"): number[] {
  const steps = SCALES[scale];
  const up = [...steps.map((s) => startMidi + s), startMidi + 12];
  if (direction === "asc") return up;
  if (direction === "desc") return [...up].reverse().map((m) => m - 12);
  return [...up, ...[...up].reverse().slice(1)];
}

export function generateScaleTask(level: number): ScaleTask {
  const lvl = Math.max(1, Math.min(3, level));
  const scale = pick(LEVEL_SCALES[lvl]);
  const tonic = randomInt(0, 11);
  const octave = pick([3, 4]);
  const startMidi = (octave + 1) * 12 + tonic;
  const direction: ScaleTask["direction"] = lvl >= 3 ? pick(["asc", "desc", "both"]) : lvl === 2 ? pick(["asc", "asc", "desc"]) : "asc";
  const expected = scaleNotes(tonic, scale, startMidi, direction);
  const dirWord = direction === "asc" ? "going up" : direction === "desc" ? "going down" : "up and back down";
  const label = scale === "major" || scale === "minor" ? `${KEY_NAMES[tonic]} ${SCALE_LABELS[scale].toLowerCase()}` : `${KEY_NAMES[tonic]} ${SCALE_LABELS[scale].toLowerCase()}`;
  return { kind: "scale", level: lvl, tonic, scale, startMidi, direction, expected, prompt: `Play ${label} from ${KEY_NAMES[tonic]}${octave}, one octave, ${dirWord}.` };
}

export function romanChords(tonic: number, minor: boolean, degrees: number[], sevenths: boolean): RomanChord[] {
  return degrees.map((degree) => {
    const d = ((degree % 7) + 7) % 7;
    const qualityId = sevenths ? (minor ? MINOR_SEVENTH_Q : MAJOR_SEVENTH_Q)[d] : (minor ? MINOR_TRIAD_Q : MAJOR_TRIAD_Q)[d];
    const roman = sevenths ? (minor ? MINOR_ROMAN_7 : MAJOR_ROMAN_7)[d] : (minor ? MINOR_ROMAN : MAJOR_ROMAN)[d];
    const rootPc = (tonic + scaleDegreeSemitone(minor, d)) % 12;
    return { degree: d, roman, spec: { rootPc, qualityId, inversion: 0, voicing: "closed" } };
  });
}

export function generateProgressionTask(level: number, opts: { sevenths?: boolean; voicing?: VoicingConstraint } = {}): ProgressionTask {
  const tonic = randomInt(0, 11);
  const minor = Math.random() < 0.35;
  const sevenths = opts.sevenths ?? Math.random() < 0.5;
  const degrees = pick(PROGRESSIONS);
  const chords = romanChords(tonic, minor, degrees, sevenths);
  const voicing: VoicingConstraint = opts.voicing ?? (sevenths ? pick(["free", "closed", "drop2"]) : pick(["free", "closed"]));
  const voicingText = voicing === "drop2" ? " with drop-2 voicings" : voicing === "closed" ? " in closed voicings" : "";
  const names = chords.map((c) => chordLabel(c.spec)).join(" – ");
  return {
    kind: "progression",
    level: Math.max(5, level),
    tonic,
    minor,
    chords,
    voicing,
    prompt: `Play ${chords.map((c) => c.roman).join("–")} in ${keyName(tonic, minor)}${voicingText}: ${names}.`,
  };
}

export function generateHarmoniseTask(level: number, notes = 4): HarmoniseTask {
  const tonic = randomInt(0, 11);
  const minor = Math.random() < 0.3;
  const deg = minor ? MINOR_DEG : MAJOR_DEG;
  const melody: number[] = [];
  let idx = randomInt(2, 5);
  for (let i = 0; i < notes; i++) {
    idx = Math.max(0, Math.min(deg.length + 3, idx + pick([-2, -1, -1, 0, 1, 1, 2])));
    const oct = Math.floor(idx / deg.length);
    melody.push(72 + tonic + deg[idx % deg.length] + 12 * oct - (tonic > 6 ? 12 : 0));
  }
  return {
    kind: "harmonise",
    level: Math.max(6, level),
    tonic,
    minor,
    melody,
    bpm: 72,
    prompt: `Harmonise this ${notes}-note melody in ${keyName(tonic, minor)}: under each note play a diatonic triad that contains it (${melody.map((m) => PITCH_CLASS_SHORT[pitchClassOf(m)]).join(" ")}).`,
  };
}

export interface TheoryGenOptions {
  level: number;
  /** Draw from every level up to `level` rather than only that level. */
  mixLower: boolean;
  kinds: TheoryKind[];
}

/** Which kinds a level can produce. */
export function kindsForLevel(level: number): TheoryKind[] {
  if (level <= 3) return ["chord", "scale"];
  if (level === 4) return ["chord"];
  if (level === 5) return ["progression"];
  return ["harmonise"];
}

export function generateTheoryTask(o: TheoryGenOptions): TheoryTask {
  const wanted = o.kinds.length ? o.kinds : THEORY_KINDS;
  const levels = o.mixLower ? Array.from({ length: o.level }, (_, i) => i + 1) : [o.level];
  const options = levels.flatMap((lvl) => kindsForLevel(lvl).filter((k) => wanted.includes(k)).map((k) => ({ lvl, k })));
  const choice = options.length ? pick(options) : { lvl: o.level, k: kindsForLevel(o.level)[0] };
  switch (choice.k) {
    case "chord":
      return generateChordTask(choice.lvl);
    case "scale":
      return generateScaleTask(choice.lvl);
    case "progression":
      return generateProgressionTask(choice.lvl);
    case "harmonise":
      return generateHarmoniseTask(choice.lvl);
  }
}

// ---------------------------------------------------------------------------
// Grouping what was played
// ---------------------------------------------------------------------------

export interface PlayedEvent {
  midi: number;
  timeMs: number;
}

/** Notes pressed within this many ms of each other are one chord. */
export const CHORD_WINDOW_MS = 120;

/** Group note-ons into chords: a new chord starts when the gap from the previous note-on exceeds the window. */
export function groupChords(played: PlayedEvent[], windowMs = CHORD_WINDOW_MS): number[][] {
  const sorted = [...played].sort((a, b) => a.timeMs - b.timeMs);
  const groups: number[][] = [];
  let last = -Infinity;
  for (const p of sorted) {
    if (p.timeMs - last > windowMs || !groups.length) groups.push([]);
    groups[groups.length - 1].push(p.midi);
    last = p.timeMs;
  }
  return groups.map((g) => [...new Set(g)].sort((a, b) => a - b));
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface ChordGrade {
  ok: boolean;
  /** Pitch classes right. */
  notesOk: boolean;
  bassOk: boolean;
  voicingOk: boolean;
  /** Plain-language reasons, empty when ok. */
  problems: string[];
}

function pcSet(midis: number[]): Set<number> {
  return new Set(midis.map(pitchClassOf));
}

function sameSet(a: Set<number>, b: Set<number>) {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/** Relative shape of a voicing: offsets from the lowest note. */
function shape(midis: number[]): number[] {
  const s = [...new Set(midis)].sort((a, b) => a - b);
  return s.map((m) => m - s[0]);
}

function isClosed(midis: number[]): boolean {
  const s = [...new Set(midis)].sort((a, b) => a - b);
  return s.length > 0 && s[s.length - 1] - s[0] < 12;
}

/** Does the played chord match `spec` as a drop-2 voicing in any inversion? */
function matchesDrop2(midis: number[], spec: ChordSpec): boolean {
  const n = chordQuality(spec.qualityId)?.intervals.length ?? 0;
  const played = shape(midis);
  for (let inv = 0; inv < n; inv++) {
    const want = shape(chordOffsets({ ...spec, inversion: inv, voicing: "drop2" }));
    if (want.length === played.length && want.every((x, i) => x === played[i])) return true;
  }
  return false;
}

/** Grade one played chord against a spec. */
export function gradeChord(midis: number[], spec: ChordSpec, strictness: Strictness): ChordGrade {
  const problems: string[] = [];
  const want = chordPitchClasses(spec.rootPc, spec.qualityId);
  const got = pcSet(midis);
  const notesOk = sameSet(want, got);
  if (!notesOk) {
    const missing = [...want].filter((p) => !got.has(p)).map((p) => PITCH_CLASS_SHORT[p]);
    const extra = [...got].filter((p) => !want.has(p)).map((p) => PITCH_CLASS_SHORT[p]);
    if (missing.length) problems.push(`missing ${missing.join(", ")}`);
    if (extra.length) problems.push(`extra ${extra.join(", ")}`);
    const id = identifyChord(midis);
    if (id && !(id.rootPc === spec.rootPc && id.qualityId === spec.qualityId)) problems.push(`you played ${chordLabel(id)}`);
  }
  const wantBass = bassPitchClass(spec);
  const gotBass = midis.length ? pitchClassOf(Math.min(...midis)) : -1;
  const bassOk = gotBass === wantBass;
  if (notesOk && !bassOk && strictness !== "lenient") problems.push(`${PITCH_CLASS_SHORT[gotBass]} in the bass; ${INVERSION_LABELS[spec.inversion].toLowerCase()} puts ${PITCH_CLASS_SHORT[wantBass]} there`);
  const wantShape = shape(chordOffsets(spec));
  const gotShape = shape(midis);
  const voicingOk = wantShape.length === gotShape.length && wantShape.every((x, i) => x === gotShape[i]);
  if (notesOk && bassOk && !voicingOk && strictness === "strict") {
    const closedWanted = spec.voicing === "closed";
    problems.push(closedWanted && !isClosed(midis) ? "spread over more than an octave; a closed voicing was asked" : `spacing is not ${VOICING_LABELS[spec.voicing].toLowerCase()} (${INVERSION_LABELS[spec.inversion].toLowerCase()})`);
  }
  const ok = notesOk && (strictness === "lenient" || bassOk) && (strictness !== "strict" || voicingOk);
  return { ok, notesOk, bassOk, voicingOk, problems: ok ? [] : problems };
}

export interface TheoryGrade {
  correct: boolean;
  /** 0..1 */
  score: number;
  /** One line per chord / step, "✓ Dm7" or "✗ G7: missing F". */
  lines: string[];
  summary: string;
}

export function gradeChordTask(task: ChordTask, played: PlayedEvent[], strictness: Strictness): TheoryGrade {
  const groups = groupChords(played);
  const midis = groups.length ? groups[groups.length - 1] : [];
  const g = gradeChord(midis, task.spec, strictness);
  const label = chordLabel(task.spec, true);
  return {
    correct: g.ok,
    score: g.ok ? 1 : g.notesOk ? 0.5 : 0,
    lines: [g.ok ? `✓ ${label}` : `✗ ${label}: ${g.problems.join("; ") || "not right"}`],
    summary: g.ok ? "Exactly right." : g.notesOk ? "Right notes, wrong shape." : "Wrong notes.",
  };
}

export function gradeProgressionTask(task: ProgressionTask, played: PlayedEvent[], strictness: Strictness): TheoryGrade {
  const groups = groupChords(played);
  const lines: string[] = [];
  let right = 0;
  task.chords.forEach((c, i) => {
    const midis = groups[i] ?? [];
    const label = `${c.roman} (${chordLabel(c.spec)})`;
    if (!midis.length) {
      lines.push(`✗ ${label}: not played`);
      return;
    }
    // notes must match; the bass is free unless strict + closed asks for root position; voicing per the constraint
    const base = gradeChord(midis, c.spec, "lenient");
    const problems = [...base.problems];
    let ok = base.notesOk;
    if (ok && task.voicing === "closed" && !isClosed(midis)) {
      ok = false;
      problems.push("spread over more than an octave; closed voicing asked");
    }
    if (ok && task.voicing === "drop2" && !matchesDrop2(midis, c.spec)) {
      ok = false;
      problems.push("not a drop-2 shape (second note from the top dropped an octave)");
    }
    if (ok && strictness === "strict" && task.voicing === "closed" && !base.bassOk) {
      ok = false;
      problems.push(`${PITCH_CLASS_SHORT[pitchClassOf(Math.min(...midis))]} in the bass; root position asked in strict mode`);
    }
    if (ok) right++;
    lines.push(ok ? `✓ ${label}` : `✗ ${label}: ${problems.join("; ")}`);
  });
  if (groups.length > task.chords.length) lines.push(`… ${groups.length - task.chords.length} extra chord${groups.length - task.chords.length === 1 ? "" : "s"} played`);
  const correct = right === task.chords.length && groups.length === task.chords.length;
  return { correct, score: right / task.chords.length, lines, summary: correct ? "Whole progression right." : `${right} of ${task.chords.length} chords right.` };
}

export function gradeScaleTask(task: ScaleTask, played: PlayedEvent[]): TheoryGrade {
  const seq = [...played].sort((a, b) => a.timeMs - b.timeMs).map((p) => p.midi);
  // simple alignment: walk the expected notes, matching in order; count wrong / missing / extra
  let i = 0;
  let right = 0;
  const wrong: string[] = [];
  for (const m of seq) {
    if (i >= task.expected.length) break;
    if (m === task.expected[i]) {
      right++;
      i++;
    } else if (pitchClassOf(m) === pitchClassOf(task.expected[i])) {
      wrong.push(`${noteLabel(task.expected[i])} played an octave off`);
      i++;
    } else {
      wrong.push(`${noteLabel(m)} instead of ${noteLabel(task.expected[i])}`);
      i++;
    }
  }
  const missing = task.expected.length - i;
  const extra = Math.max(0, seq.length - task.expected.length);
  const lines = [...wrong.map((w) => `✗ ${w}`)];
  if (missing) lines.push(`✗ ${missing} note${missing === 1 ? "" : "s"} missing at the end`);
  if (extra) lines.push(`… ${extra} extra note${extra === 1 ? "" : "s"}`);
  const correct = right === task.expected.length && extra === 0;
  if (correct) lines.push(`✓ ${task.expected.length} notes in order`);
  return { correct, score: right / task.expected.length, lines, summary: correct ? "Clean." : `${right} of ${task.expected.length} notes right.` };
}

function noteLabel(m: number) {
  return `${PITCH_CLASS_SHORT[pitchClassOf(m)]}${Math.floor(m / 12) - 1}`;
}

/** Diatonic triads of a key: root pitch class → quality. */
export function diatonicTriads(tonic: number, minor: boolean): Map<number, string> {
  const out = new Map<number, string>();
  const deg = minor ? MINOR_DEG : MAJOR_DEG;
  const q = minor ? MINOR_TRIAD_Q : MAJOR_TRIAD_Q;
  deg.forEach((s, i) => out.set((tonic + s) % 12, q[i]));
  return out;
}

export function gradeHarmoniseTask(task: HarmoniseTask, played: PlayedEvent[]): TheoryGrade {
  const groups = groupChords(played);
  const triads = diatonicTriads(task.tonic, task.minor);
  const lines: string[] = [];
  let right = 0;
  task.melody.forEach((m, i) => {
    const midis = groups[i] ?? [];
    const mel = PITCH_CLASS_SHORT[pitchClassOf(m)];
    if (!midis.length) {
      lines.push(`✗ under ${mel}: nothing played`);
      return;
    }
    const id = identifyChord(midis);
    const pcs = pcSet(midis);
    const diatonicQ = id ? triads.get(id.rootPc) : undefined;
    const isDiatonicTriad = !!id && diatonicQ === id.qualityId && pcs.size === 3;
    const containsMelody = pcs.has(pitchClassOf(m));
    if (isDiatonicTriad && containsMelody) {
      right++;
      lines.push(`✓ under ${mel}: ${chordLabel(id!)}`);
    } else if (!containsMelody) {
      lines.push(`✗ under ${mel}: ${id ? chordLabel(id) : "that chord"} does not contain ${mel}`);
    } else {
      lines.push(`✗ under ${mel}: ${id ? chordLabel(id) : "that chord"} is not a diatonic triad of ${keyName(task.tonic, task.minor)}`);
    }
  });
  const correct = right === task.melody.length;
  return { correct, score: right / task.melody.length, lines, summary: correct ? "Every chord fits." : `${right} of ${task.melody.length} chords fit.` };
}

export function gradeTheoryTask(task: TheoryTask, played: PlayedEvent[], strictness: Strictness): TheoryGrade {
  switch (task.kind) {
    case "chord":
      return gradeChordTask(task, played, strictness);
    case "progression":
      return gradeProgressionTask(task, played, strictness);
    case "scale":
      return gradeScaleTask(task, played);
    case "harmonise":
      return gradeHarmoniseTask(task, played);
  }
}

/** The notes that would satisfy a task, for "show me" and for playing the answer. */
export function referenceNotes(task: TheoryTask): number[][] {
  switch (task.kind) {
    case "chord": {
      const root = 48 + task.spec.rootPc;
      return [chordOffsets(task.spec).map((o) => root + o)];
    }
    case "progression":
      return task.chords.map((c) => {
        const spec: ChordSpec = task.voicing === "drop2" ? { ...c.spec, voicing: "drop2" } : c.spec;
        const root = 48 + spec.rootPc;
        return chordOffsets(spec).map((o) => root + o);
      });
    case "scale":
      return task.expected.map((m) => [m]);
    case "harmonise":
      return task.melody.map((m) => {
        // a diatonic triad containing the melody note, voiced just below it
        const triads = diatonicTriads(task.tonic, task.minor);
        const pc = pitchClassOf(m);
        const roots = [...triads.entries()].filter(([root, q]) => chordPitchClasses(root, q).has(pc));
        const [root, q] = roots[0] ?? [task.tonic, task.minor ? "min" : "maj"];
        const pcs = [...chordPitchClasses(root, q)];
        return pcs.map((p) => m - 12 + ((p - pitchClassOf(m - 12) + 12) % 12)).sort((a, b) => a - b);
      });
  }
}

export const THEORY_STRICTNESS: Strictness[] = ["strict", "inversion", "lenient"];
