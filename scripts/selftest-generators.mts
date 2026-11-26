/**
 * Quick sanity checks for the theory helpers and question generators (no browser needed).
 *   npx tsx scripts/selftest-generators.mts
 */
import { bassPitchClass, buildChord, chordLabel, chordPitchClasses, CHORD_QUALITIES, identifyChord, randomCluster, samePitchClasses } from "../src/lib/music/chords";
import { intervalPool, intervalShort } from "../src/lib/music/intervals";
import { noteName } from "../src/lib/music/notes";
import { DEFAULT_TRAINER_SETTINGS, type TrainerSettings } from "../src/lib/trainer/settings";
import { generateCents, generateChord, generateInterval, generateScale, generateSequence } from "../src/lib/trainer/generators";
import { emptyMissStats } from "../src/lib/trainer/quiz-core";
import { SCALE_DEFS, scaleDef, scaleMelody, scalePitchClasses, scaleRun } from "../src/lib/music/scales";
import { pitchClassOf } from "../src/lib/music/notes";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error("  ✗", msg);
  }
}

// ---- chords ----
const cmaj = buildChord({ rootPc: 0, qualityId: "maj", inversion: 0, voicing: "closed" }, 60);
check(JSON.stringify(cmaj) === JSON.stringify([60, 64, 67]), `C major root position = ${cmaj}`);
const cmaj1 = buildChord({ rootPc: 0, qualityId: "maj", inversion: 1, voicing: "closed" }, 64);
check(JSON.stringify(cmaj1) === JSON.stringify([64, 67, 72]), `C major 1st inversion = ${cmaj1}`);
const cmaj2 = buildChord({ rootPc: 0, qualityId: "maj", inversion: 2, voicing: "closed" }, 67);
check(JSON.stringify(cmaj2) === JSON.stringify([67, 72, 76]), `C major 2nd inversion = ${cmaj2}`);
const g7d2 = buildChord({ rootPc: 7, qualityId: "7", inversion: 0, voicing: "drop2" }, 50);
check(g7d2.length === 4 && g7d2[0] === 50, `G7 drop2 = ${g7d2}`);
// drop-2 of G7 (G B D F): second from top (D) drops an octave → D is the bass
check(bassPitchClass({ rootPc: 7, qualityId: "7", inversion: 0, voicing: "drop2" }) === 2, "G7 drop2 bass is D");
check(bassPitchClass({ rootPc: 0, qualityId: "min", inversion: 1, voicing: "closed" }) === 3, "Cm/E♭ bass");
const cm1 = buildChord({ rootPc: 0, qualityId: "min", inversion: 1, voicing: "closed" }, 63);
check(JSON.stringify(cm1) === JSON.stringify([63, 67, 72]), `Cm first inversion from E♭3 = ${cm1}`);
for (const q of CHORD_QUALITIES) {
  const notes = buildChord({ rootPc: 5, qualityId: q.id, inversion: 0, voicing: "closed" }, 53);
  const id = identifyChord(notes);
  check(!!id && id.rootPc === 5 && id.qualityId === q.id, `identify ${q.id}: got ${id ? chordLabel(id) : "null"} for ${notes.map((n) => noteName(n)).join(" ")}`);
}
check(intervalShort(7) === "P5" && intervalPool({ compound: true, allowed: [] }).length === 24, "interval pool");
const cl = randomCluster(4, 12, 48, 72);
check(cl.length === 4 && new Set(cl).size === 4 && cl[3] - cl[0] <= 12, `cluster ${cl}`);

// ---- generators ----
const settings: TrainerSettings = { ...DEFAULT_TRAINER_SETTINGS, instrumentMode: "random-note", seqLength: 6, seqMaxLeap: 7 };
const insts = ["gm:acoustic_grand_piano", "gm:violin", "gm:cello", "gm:flute", "gm:tuba"];
let k = 0;
const choose = async () => insts[k++ % insts.length];
const stats = emptyMissStats();

(async () => {
  for (let i = 0; i < 200; i++) {
    const seq = await generateSequence(settings, choose, stats);
    check(seq.notes.length === 6, "seq length");
    // With a different instrument per note the jump can only be kept when ranges overlap; the picker then takes the nearest note.
    for (let j = 1; j < seq.notes.length; j++) {
      const leap = Math.abs(seq.notes[j].midi - seq.notes[j - 1].midi);
      const sameInst = seq.notes[j].instrumentId === seq.notes[j - 1].instrumentId;
      check(leap <= 7 || !sameInst, `seq leap ${seq.notes.map((n) => n.midi)}`);
      check(leap <= 24, `seq leap too big across instruments ${seq.notes.map((n) => `${n.midi}@${n.instrumentId}`)}`);
    }
    check(seq.notes.every((n) => n.midi >= 21 && n.midi <= 108), "seq range");
  }
  for (const variant of ["pair", "chain", "stack"] as const) {
    for (const playback of ["melodic", "harmonic"] as const) {
      for (let i = 0; i < 100; i++) {
        const q = await generateInterval({ ...settings, intervalVariant: variant, intervalPlayback: playback, intervalCompound: i % 2 === 0, intervalChainLength: 5, intervalStackSize: 4 }, choose, stats);
        check(q.notes.every((n) => n.midi >= 21 && n.midi <= 108), `${variant} range ${q.notes.map((n) => n.midi)}`);
        if (variant === "pair") check(q.intervals.length === 1 && Math.abs(q.notes[1].midi - q.notes[0].midi) === q.intervals[0], `pair interval ${q.notes.map((n) => n.midi)} ${q.intervals}`);
        if (variant === "chain") check(q.notes.length === 5 && q.intervals.length === 4 && q.intervals.every((s, j) => Math.abs(q.notes[j + 1].midi - q.notes[j].midi) === s), `chain ${q.notes.map((n) => n.midi)} ${q.intervals}`);
        if (variant === "stack") check(q.notes.length === 4 && q.intervals.length === 3 && q.intervals.every((s, j) => q.notes[j + 1].midi - q.notes[0].midi === s), `stack ${q.notes.map((n) => n.midi)} ${q.intervals}`);
        check(q.intervals.every((s) => s >= 1 && s <= 24), `interval size ${q.intervals}`);
      }
    }
  }
  for (const kind of ["chords", "clusters", "mixed"] as const) {
    for (let i = 0; i < 150; i++) {
      const q = await generateChord({ ...settings, chordKind: kind, chordCategories: [], chordVoicings: ["closed", "open", "drop2"], chordInversions: true }, choose, stats);
      check(q.notes.every((n) => n.midi >= 21 && n.midi <= 108), `${kind} range ${q.notes.map((n) => n.midi)}`);
      check(q.notes.every((n, j) => j === 0 || n.midi > q.notes[j - 1].midi), `${kind} sorted ${q.notes.map((n) => n.midi)}`);
      if (q.kind === "chord") {
        const midis = q.notes.map((n) => n.midi);
        const want = chordPitchClasses(q.spec!.rootPc, q.spec!.qualityId);
        const got = new Set(midis.map((m) => ((m % 12) + 12) % 12));
        check(samePitchClasses(want, got), `chord notes ${chordLabel(q.spec!, true)} ${q.spec!.voicing}: ${midis.map((m) => noteName(m)).join(" ")}`);
        check(midis[0] % 12 === bassPitchClass(q.spec!), `bass tone ${chordLabel(q.spec!, true)}: ${midis.map((m) => noteName(m)).join(" ")}`);
        const id = identifyChord(midis);
        check(!!id && samePitchClasses(chordPitchClasses(id.rootPc, id.qualityId), want), `identify ${chordLabel(q.spec!, true)} → ${id ? chordLabel(id) : "null"}`);
      } else check(q.notes.length >= 2 && q.notes.length <= 4, "cluster size");
    }
  }
  for (const variant of ["single", "pair", "chord"] as const) {
    for (let i = 0; i < 100; i++) {
      const q = await generateCents({ ...settings, centsVariant: variant, centsMin: 10, centsMax: 30 }, choose, stats);
      check(q.notes.every((m) => m >= 21 && m <= 108), `cents range ${q.notes}`);
      if (q.cents !== 0) check([10, 15, 20, 30].includes(Math.abs(q.cents)), `cents bucket ${q.cents}`);
      if (variant !== "single") check(q.detunedIndex >= 0 && q.detunedIndex < q.notes.length && q.cents !== 0, `cents index ${q.detunedIndex}`);
    }
  }
  // ---- scales & modes ----
  for (const def of SCALE_DEFS) {
    check(def.intervals[0] === 0 && def.intervals.every((x, i) => i === 0 || x > def.intervals[i - 1]) && def.intervals.every((x) => x < 12), `scale ${def.id} intervals`);
    check(def.characteristic.every((c) => def.intervals.includes(c)), `scale ${def.id} characteristic notes belong to it`);
    const run = scaleRun(def.id, 60, "asc");
    check(run[0] === 60 && run[run.length - 1] === 72 && run.length === def.intervals.length + 1, `run ${def.id}`);
    const both = scaleRun(def.id, 60, "both");
    check(both[0] === 60 && both[both.length - 1] === 60 && both.length === 2 * def.intervals.length + 1, `run both ${def.id}`);
    for (let i = 0; i < 40; i++) {
      const tonic = i % 12;
      const mel = scaleMelody(def.id, tonic, { notes: 8, low: 55, high: 84 });
      const pcs = scalePitchClasses(tonic, def.id);
      check(mel.length === 8 && mel.every((n) => pcs.has(pitchClassOf(n.midi)) && n.midi >= 55 && n.midi <= 84), `melody ${def.id} in scale`);
      check(pitchClassOf(mel[0].midi) === tonic && pitchClassOf(mel[mel.length - 1].midi) === tonic && mel[mel.length - 1].duration === 2, `melody ${def.id} starts and ends on the tonic`);
      for (const c of def.characteristic) check(mel.some((n) => pitchClassOf(n.midi) === (tonic + c) % 12), `melody ${def.id} contains characteristic ${c}`);
      check(mel.every((n, j) => j === 0 || n.beat > mel[j - 1].beat), `melody ${def.id} beats increase`);
    }
  }
  for (const variant of ["run", "melody", "both"] as const) {
    for (let i = 0; i < 120; i++) {
      const q = await generateScale({ ...settings, scaleVariant: variant, scaleSet: i % 2 ? ["dorian", "lydian", "blues"] : [] }, choose, stats);
      const def = scaleDef(q.scaleId)!;
      check(!!def && (i % 2 === 0 || ["dorian", "lydian", "blues"].includes(q.scaleId)), `scale set respected: ${q.scaleId}`);
      check(q.notes.every((n) => n.midi >= 21 && n.midi <= 108 && n.at >= 0 && n.duration > 0), `scale question range ${q.notes.map((n) => n.midi)}`);
      check(q.notes.every((n) => scalePitchClasses(q.tonic, q.scaleId).has(pitchClassOf(n.midi))), `scale question notes in scale ${q.scaleId}`);
      if (q.variant === "run") check(pitchClassOf(q.notes[0].midi) === q.tonic && q.notes.length >= def.intervals.length + 1, `run question starts on the tonic`);
      if (variant !== "both") check(q.variant === variant, "variant respected");
    }
  }

  console.log(failures ? `${failures} checks failed` : "all generator checks passed");
  process.exit(failures ? 1 : 0);
})();
