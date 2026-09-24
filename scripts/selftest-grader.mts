/**
 * Sanity checks for the transcription grader, phrase generator and phrase slicing.
 *   npx tsx scripts/selftest-grader.mts
 */
import { gradePerformance, type PlayedNote } from "../src/lib/trainer/grade";
import { generatePhrase, type GenOptions } from "../src/lib/trainer/phrase-gen";
import { slicePhrases, pieceNotes, type Piece, type ScoreNote } from "../src/lib/music/score";

let failures = 0;
const check = (c: boolean, msg: string) => {
  if (!c) {
    failures++;
    console.error("  ✗", msg);
  }
};

const ref: ScoreNote[] = [60, 62, 64, 65, 67].map((midi, i) => ({ midi, start: i, duration: 1, voice: 0 }));
const play = (midis: number[], msPerBeat = 500, jitter: number[] = []): PlayedNote[] => midis.map((midi, i) => ({ midi, timeMs: 1000 + i * msPerBeat + (jitter[i] ?? 0) }));
const opts = { rhythm: false, rhythmToleranceBeats: 0.25 };

// perfect
let g = gradePerformance(ref, play([60, 62, 64, 65, 67]), 120, opts);
check(g.correct && g.pitchScore === 1 && g.extra === 0, `perfect: ${JSON.stringify({ p: g.pitchScore, c: g.correct })}`);
check(g.msPerBeat !== null && Math.abs(g.msPerBeat - 500) < 1, `tempo fit ${g.msPerBeat}`);
// one wrong note
g = gradePerformance(ref, play([60, 62, 63, 65, 67]), 120, opts);
check(g.matched === 4 && g.wrong === 1 && g.missing === 0 && g.extra === 0, `one wrong: m${g.matched} w${g.wrong} mi${g.missing} e${g.extra}`);
// one dropped note: everything after still matches
g = gradePerformance(ref, play([60, 62, 65, 67]), 120, opts);
check(g.matched === 4 && g.missing === 1 && g.wrong === 0 && g.extra === 0, `dropped: m${g.matched} w${g.wrong} mi${g.missing} e${g.extra}`);
// one extra note inserted
g = gradePerformance(ref, play([60, 62, 61, 64, 65, 67]), 120, opts);
check(g.matched === 5 && g.extra === 1 && !g.correct, `extra: m${g.matched} e${g.extra} correct=${g.correct}`);
// nothing played
g = gradePerformance(ref, [], 120, opts);
check(g.pitchScore === 0 && g.missing === 5, "nothing played");
// octave insensitive
g = gradePerformance(ref, play([72, 74, 76, 77, 79]), 120, { ...opts, octaveInsensitive: true });
check(g.pitchScore === 1, "octave insensitive");
g = gradePerformance(ref, play([72, 74, 76, 77, 79]), 120, opts);
check(g.pitchScore === 0, "octave sensitive");
// rhythm: right notes at a steady but different tempo → rhythm perfect
g = gradePerformance(ref, play([60, 62, 64, 65, 67], 800), 120, { rhythm: true, rhythmToleranceBeats: 0.15 });
check(g.rhythmScore === 1 && g.correct, `rhythm steady different tempo: ${g.rhythmScore}`);
// rhythm: one note badly late
g = gradePerformance(ref, play([60, 62, 64, 65, 67], 500, [0, 0, 300, 0, 0]), 120, { rhythm: true, rhythmToleranceBeats: 0.15 });
check(g.rhythmScore !== null && g.rhythmScore < 1 && g.rhythmScore >= 0.6, `rhythm late note: ${g.rhythmScore}`);
// chords: simultaneous notes align regardless of the order they were pressed
const chordRef: ScoreNote[] = [
  { midi: 60, start: 0, duration: 1, voice: 0 },
  { midi: 64, start: 0, duration: 1, voice: 1 },
  { midi: 67, start: 0, duration: 1, voice: 2 },
  { midi: 62, start: 1, duration: 1, voice: 0 },
];
g = gradePerformance(chordRef, [{ midi: 67, timeMs: 0 }, { midi: 60, timeMs: 5 }, { midi: 64, timeMs: 8 }, { midi: 62, timeMs: 500 }], 120, opts);
check(g.pitchScore === 1 && g.correct, `chord order-insensitive: ${g.pitchScore} m${g.matched}`);

// generator
const base: GenOptions = { key: -1, scale: "major", bars: 2, beatsPerBar: 4, bpm: 100, low: 55, high: 84, maxLeap: 7, chromaticism: 0, style: "mixed", rhythm: "mixed", voices: 1, rests: 0 };
for (const style of ["stepwise", "mixed", "arpeggio", "jazz", "bass"] as const) {
  for (const rhythm of ["quarters", "eighths", "mixed", "syncopated"] as const) {
    for (let i = 0; i < 30; i++) {
      const p = generatePhrase({ ...base, style, rhythm, key: i % 12 });
      check(p.notes.length > 0, `${style}/${rhythm} has notes`);
      check(p.notes.every((n) => n.midi >= 55 && n.midi <= 84), `${style}/${rhythm} range ${p.notes.map((n) => n.midi)}`);
      check(p.notes.every((n) => n.start >= 0 && n.start + n.duration <= 8 + 1e-6), `${style}/${rhythm} inside 2 bars`);
      if (style !== "jazz") for (let j = 1; j < p.notes.length; j++) check(Math.abs(p.notes[j].midi - p.notes[j - 1].midi) <= 12, `${style} leap ${p.notes.map((n) => n.midi)}`);
    }
  }
}
for (const voices of [2, 3, 4] as const) {
  for (let i = 0; i < 20; i++) {
    const p = generatePhrase({ ...base, voices, rhythm: "quarters" });
    const vs = new Set(p.notes.map((n) => n.voice));
    check(vs.size === voices, `${voices} voices present: ${[...vs]}`);
    // no two notes of different voices with identical pitch at the same start
    const seen = new Set<string>();
    for (const n of p.notes) {
      const k = `${n.start}:${n.midi}`;
      check(!seen.has(k), `voice doubling at ${k}`);
      seen.add(k);
    }
  }
}

// slicing
const piece: Piece = {
  id: "t",
  name: "t",
  source: "generated",
  bpm: 100,
  beatsPerBar: 4,
  totalBeats: 16,
  tracks: [
    { name: "a", notes: Array.from({ length: 16 }, (_, i) => ({ midi: 60 + (i % 5), start: i, duration: 1 })) },
    { name: "b", notes: Array.from({ length: 8 }, (_, i) => ({ midi: 48, start: i * 2, duration: 2 })) },
  ],
};
const ph = slicePhrases(piece, 2);
check(ph.length === 2 && ph[0].notes.length === 12 && ph[1].startBeat === 8, `slice: ${ph.length} phrases, ${ph[0]?.notes.length} notes, start ${ph[1]?.startBeat}`);
check(slicePhrases(piece, 1, [1]).every((p) => p.notes.every((n) => n.voice === 1)), "voice filter");
check(pieceNotes(piece).length === 24, "pieceNotes count");

console.log(failures ? `${failures} checks failed` : "all grader checks passed");
process.exit(failures ? 1 : 0);
