/**
 * Head to Keys checks: theory tasks and grading, take tools, hum segmentation, prompts.
 *   npx tsx scripts/selftest-compose.mts
 */
import { chordOffsets } from "../src/lib/music/chords";
import {
  generateChordTask,
  generateHarmoniseTask,
  generateProgressionTask,
  generateScaleTask,
  generateTheoryTask,
  gradeChord,
  gradeTheoryTask,
  groupChords,
  referenceNotes,
  type PlayedEvent,
  type TheoryTask,
} from "../src/lib/compose/theory";
import { quantize, scaleTempo, toMidiNotes } from "../src/lib/midi/take-tools";
import { segmentHum, type PitchFrame } from "../src/lib/compose/hum-segment";
import { backingNotes, generatePrompt } from "../src/lib/compose/prompt-gen";

let failures = 0;
const check = (c: boolean, msg: string) => {
  if (!c) {
    failures++;
    if (failures <= 40) console.error("  ✗", msg);
  }
};

/** Play the reference answer of a task as note-on events, one chord every 600 ms. */
function playReference(task: TheoryTask, transpose = 0): PlayedEvent[] {
  const out: PlayedEvent[] = [];
  referenceNotes(task).forEach((chord, i) => {
    chord.forEach((m, k) => out.push({ midi: m + transpose, timeMs: i * 600 + k * 10 }));
  });
  return out;
}

// ---- chords ----
for (let i = 0; i < 300; i++) {
  const level = 1 + (i % 4);
  const t = generateChordTask(level);
  check(t.level === level && t.prompt.startsWith("Play "), `chord task level ${level}: ${t.prompt}`);
  const ref = referenceNotes(t)[0];
  check(ref.length === chordOffsets(t.spec).length, "reference note count");
  check(gradeChord(ref, t.spec, "strict").ok, `strict grade of the reference fails: ${t.prompt} ref=${ref}`);
  // same notes an octave up: still strict-ok (shape is relative)
  check(gradeChord(ref.map((m) => m + 12), t.spec, "strict").ok, "octave-shifted reference should pass strict");
  // a different inversion: fails strict and inversion (when the bass changes), passes lenient
  const n = ref.length;
  const inv = [...ref.slice(1), ref[0] + 12];
  check(gradeChord(inv, t.spec, "lenient").ok, "rotated voicing should pass lenient");
  const rotatedBassSame = (inv[0] % 12) === (ref[0] % 12);
  if (!rotatedBassSame) check(!gradeChord(inv, t.spec, "inversion").ok, `rotated voicing should fail inversion mode: ${t.prompt}`);
  if (n >= 3 && t.spec.voicing === "closed") check(!gradeChord(inv, t.spec, "strict").ok || rotatedBassSame, "rotated closed voicing should fail strict");
  // a wrong note: fails everything, with a reason
  const wrong = [...ref];
  wrong[1] += 1;
  const g = gradeChord(wrong, t.spec, "lenient");
  check(!g.ok && g.problems.length > 0, `wrong note not caught: ${t.prompt} ${wrong}`);
  // through the task grader
  const grade = gradeTheoryTask(t, playReference(t), "strict");
  check(grade.correct && grade.score === 1, `task grade: ${t.prompt} → ${grade.lines.join(" | ")}`);
  const bad = gradeTheoryTask(t, playReference(t, 1), "strict");
  check(!bad.correct && bad.score === 0, `transposed answer accepted: ${t.prompt}`);
}

// ---- scales ----
for (let i = 0; i < 200; i++) {
  const t = generateScaleTask(1 + (i % 3));
  check(t.expected.length >= 6 && t.expected[0] === t.startMidi, `scale expected ${t.expected}`);
  if (t.direction === "asc") check(t.expected[t.expected.length - 1] === t.startMidi + 12, "ascending scale ends an octave up");
  if (t.direction === "both") check(t.expected[t.expected.length - 1] === t.startMidi, "up-and-down scale ends where it started");
  const good = gradeTheoryTask(t, t.expected.map((m, k) => ({ midi: m, timeMs: k * 300 })), "strict");
  check(good.correct, `scale reference not accepted: ${t.prompt}`);
  const oneWrong = t.expected.map((m, k) => ({ midi: k === 2 ? m + 1 : m, timeMs: k * 300 }));
  const g = gradeTheoryTask(t, oneWrong, "strict");
  check(!g.correct && g.score > 0.5 && g.score < 1, `scale with one wrong note: ${g.score} ${g.lines.join(" | ")}`);
}

// ---- progressions ----
for (let i = 0; i < 200; i++) {
  const t = generateProgressionTask(5);
  check(t.chords.length >= 3 && t.prompt.includes("Play "), `progression ${t.prompt}`);
  const good = gradeTheoryTask(t, playReference(t), "strict");
  check(good.correct && good.score === 1, `progression reference not accepted: ${t.prompt} → ${good.lines.join(" | ")}`);
  // drop one chord
  const events = playReference(t).filter((e) => e.timeMs >= 600);
  const g = gradeTheoryTask(t, events, "strict");
  check(!g.correct, `missing chord accepted: ${t.prompt}`);
  // free voicing accepts an inversion of every chord
  if (t.voicing === "free") {
    const rotated: PlayedEvent[] = [];
    referenceNotes(t).forEach((chord, ci) => {
      const rot = [...chord.slice(1), chord[0] + 12];
      rot.forEach((m, k) => rotated.push({ midi: m, timeMs: ci * 600 + k * 10 }));
    });
    check(gradeTheoryTask(t, rotated, "strict").correct, `free-voicing progression rejects inversions: ${t.prompt}`);
  }
}

// ---- harmonise ----
for (let i = 0; i < 200; i++) {
  const t = generateHarmoniseTask(6);
  check(t.melody.length === 4 && t.melody.every((m) => m >= 48 && m <= 100), `harmonise melody ${t.melody}`);
  const good = gradeTheoryTask(t, playReference(t), "strict");
  check(good.correct, `harmonise reference not accepted: ${t.prompt} → ${good.lines.join(" | ")}`);
  // a chord that does not contain the melody note: rejected
  const refs = referenceNotes(t);
  const badChord = refs[0].map((m) => m + 1);
  const events: PlayedEvent[] = [];
  [badChord, ...refs.slice(1)].forEach((chord, ci) => chord.forEach((m, k) => events.push({ midi: m, timeMs: ci * 600 + k * 10 })));
  const g = gradeTheoryTask(t, events, "strict");
  check(!g.correct && g.score === 0.75, `harmonise one bad chord: ${g.score} ${g.lines[0]}`);
}

// ---- mixed generation honours kinds and levels ----
for (let i = 0; i < 100; i++) {
  const t = generateTheoryTask({ level: 6, mixLower: true, kinds: ["scale"] });
  check(t.kind === "scale", `kind filter: got ${t.kind}`);
  const u = generateTheoryTask({ level: 2, mixLower: false, kinds: [] });
  check(u.level === 2 && (u.kind === "chord" || u.kind === "scale"), `level 2 only: ${u.kind} ${u.level}`);
}

// ---- grouping ----
const grouped = groupChords([
  { midi: 60, timeMs: 0 },
  { midi: 64, timeMs: 30 },
  { midi: 67, timeMs: 60 },
  { midi: 65, timeMs: 700 },
  { midi: 69, timeMs: 740 },
]);
check(grouped.length === 2 && grouped[0].join() === "60,64,67" && grouped[1].join() === "65,69", `groupChords ${JSON.stringify(grouped)}`);

// ---- take tools ----
const take = [
  { midi: 60, velocity: 90, startMs: 10, endMs: 400 },
  { midi: 62, velocity: 90, startMs: 520, endMs: 900 },
  { midi: 64, velocity: 90, startMs: 1010, endMs: null },
];
const q = quantize(take, 120, 8); // eighth at 120 bpm = 250 ms
check(q[0].startMs === 0 && q[1].startMs === 500 && q[2].startMs === 1000 && q[2].endMs === null && q[0].endMs === 390, `quantize ${JSON.stringify(q)}`);
const fast = scaleTempo(take, 2);
check(fast[1].startMs === 260 && fast[1].endMs === 450, `scaleTempo ${JSON.stringify(fast[1])}`);
const mn = toMidiNotes(take);
check(mn[2].duration > 0 && mn[0].velocity > 0.6 && mn[0].time === 0.01, `toMidiNotes ${JSON.stringify(mn[0])}`);

// ---- hum segmentation ----
const frames: PitchFrame[] = [];
let t = 0;
const push = (midi: number | null, ms: number, clarity = 0.97, level = 0.05) => {
  for (let k = 0; k < ms / 10; k++) {
    frames.push({ tMs: t, midi: midi === null ? null : midi + (Math.random() - 0.5) * 0.2, clarity, level });
    t += 10;
  }
};
push(null, 200);
push(60, 300);
push(62, 250);
push(null, 150, 0.2, 0.001);
push(64, 40); // too short
push(null, 100, 0.2, 0);
push(67, 400);
push(67.1, 50, 0.5); // low clarity: ignored, but inside the gap tolerance
push(67, 100);
const hummed = segmentHum(frames);
check(hummed.map((n) => n.midi).join() === "60,62,67", `segmentHum ${hummed.map((n) => `${n.midi}@${n.startMs}-${n.endMs}`).join(" ")}`);
check(hummed.every((n) => Math.abs(n.cents) <= 15), `hum cents ${hummed.map((n) => n.cents)}`);

// ---- prompts ----
for (let i = 0; i < 50; i++) {
  const p = generatePrompt({ key: -1, bpmMin: 70, bpmMax: 120, bars: 4, sevenths: true, mood: true, seed: true });
  check(p.bpm >= 70 && p.bpm <= 120 && p.chords.length >= 3 && p.mood.length > 0 && !!p.seed && p.seed.length > 0, `prompt ${p.text}`);
  const b = backingNotes(p);
  check(b.length >= 12 && b.every((n) => n.durationBeats === 4), `backing ${b.length}`);
}

console.log(failures ? `${failures} compose checks failed` : "all compose checks passed");
process.exit(failures ? 1 : 0);
