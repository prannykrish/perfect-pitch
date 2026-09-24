/**
 * Find the Mistake: planted-problem checks (no browser needed).
 *   npx tsx scripts/selftest-mistakes.mts
 *
 * For every material kind and every compatible problem type: the altered material must differ
 * from the original in exactly one place (one note, one chord, or one voice's stretch), the
 * answer slot must exist, and the scorer must reward the right answer and give partial credit.
 */
import { generateMelodyMaterial, generateProgressionMaterial, generateVoicesMaterial } from "../src/lib/mistakes/material-gen";
import { buildSlots, canSubmit, compatibleTypes, diagnosesFor, plantProblem, scoreAnswer, type PlantOptions } from "../src/lib/mistakes/plant";
import { EMPTY_ANSWER, PLANT_TYPES, type Answer, type Material, type PlantType, type Planted } from "../src/lib/mistakes/types";

let failures = 0;
const check = (c: boolean, msg: string) => {
  if (!c) {
    failures++;
    if (failures <= 40) console.error("  ✗", msg);
  }
};

const opts: PlantOptions = { centsMin: 5, centsMax: 50, slipBeats: 0.25, referenceFirst: false };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function randomMelody(): Material {
  const styles = ["stepwise", "mixed", "arpeggio", "jazz", "bass"] as const;
  const rhythms = ["quarters", "eighths", "mixed", "syncopated"] as const;
  return generateMelodyMaterial({
    key: -1,
    scale: (["major", "minor", "dorian", "pentatonic"] as const)[Math.floor(Math.random() * 4)],
    bars: 1 + Math.floor(Math.random() * 4),
    bpm: 90,
    low: 55,
    high: 84,
    style: styles[Math.floor(Math.random() * styles.length)],
    rhythm: rhythms[Math.floor(Math.random() * rhythms.length)],
    maxLeap: 9,
  });
}

function randomVoices(): Material {
  return generateVoicesMaterial({ key: -1, scale: Math.random() < 0.5 ? "major" : "minor", bars: 1 + Math.floor(Math.random() * 3), bpm: 80, voices: ([2, 3, 4] as const)[Math.floor(Math.random() * 3)] });
}

function randomProgression(): Material {
  return generateProgressionMaterial({
    key: -1,
    minor: Math.random() < 0.4,
    chords: 3 + Math.floor(Math.random() * 6),
    beatsPerChord: Math.random() < 0.5 ? 2 : 4,
    sevenths: Math.random() < 0.5,
    inversions: Math.random() < 0.5,
    voicings: Math.random() < 0.5 ? ["closed"] : ["closed", "open", "drop2"],
    bpm: 90,
  });
}

/** The set of note indexes whose midi / start / detune differ between original and altered. */
function diff(q: Planted) {
  const m = q.material;
  check(q.altered.length === m.notes.length, `${q.type}: altered has ${q.altered.length} notes, original ${m.notes.length}`);
  const midi: number[] = [];
  const start: number[] = [];
  const detuned: number[] = [];
  const duration: number[] = [];
  q.altered.forEach((a, i) => {
    const o = m.notes[i];
    if (a.midi !== o.midi) midi.push(i);
    if (!near(a.start, o.start)) start.push(i);
    if ((a.detune ?? 0) !== 0) detuned.push(i);
    if (!near(a.duration, o.duration)) duration.push(i);
    check(a.voice === o.voice, `${q.type}: voice changed at ${i}`);
  });
  return { midi, start, detuned, duration };
}

function checkPlanted(q: Planted, kind: string) {
  const m = q.material;
  const tag = `${kind}/${q.type}`;
  const d = diff(q);
  check(q.slots.length > 0 && q.index >= 0 && q.index < q.slots.length, `${tag}: slot index ${q.index} of ${q.slots.length}`);
  check(q.acceptIndexes.includes(q.index) && q.acceptIndexes.every((i) => i >= 0 && i < q.slots.length), `${tag}: acceptIndexes ${q.acceptIndexes}`);
  check(q.description.length > 10, `${tag}: description "${q.description}"`);
  check(q.locationBy === "slot" || q.voice !== undefined, `${tag}: locationBy ${q.locationBy} without a voice`);
  check(JSON.stringify(buildSlots(m, q.slotKind)) === JSON.stringify(q.slots), `${tag}: slots differ from buildSlots`);
  const chordOf = (i: number) => m.chords?.findIndex((c) => c.noteIndexes.includes(i)) ?? -1;
  switch (q.type) {
    case "detune":
      check(d.detuned.length === 1 && d.midi.length === 0 && d.start.length === 0 && d.duration.length === 0, `${tag}: changed midi=${d.midi} start=${d.start} detuned=${d.detuned}`);
      check(q.cents !== undefined && [5, 10, 15, 20, 30, 50].includes(Math.abs(q.cents)) && q.altered[d.detuned[0]]?.detune === q.cents, `${tag}: cents ${q.cents}`);
      check(q.diagnosis === (q.cents! > 0 ? "sharp" : "flat"), `${tag}: diagnosis ${q.diagnosis}`);
      if (q.slotKind === "note") check(q.index === d.detuned[0], `${tag}: note slot ${q.index} vs ${d.detuned[0]}`);
      if (q.slotKind === "beat") check(q.index === Math.floor(m.notes[d.detuned[0]].start + 1e-6) && q.voice === m.notes[d.detuned[0]].voice, `${tag}: beat slot`);
      if (q.slotKind === "chord") check(q.index === chordOf(d.detuned[0]), `${tag}: chord slot`);
      break;
    case "wrong-note":
    case "voice-leading": {
      check(d.midi.length === 1 && d.start.length === 0 && d.detuned.length === 0 && d.duration.length === 0, `${tag}: changed midi=${d.midi} start=${d.start} detuned=${d.detuned}`);
      const i = d.midi[0];
      check(i === q.changedIndexes[0], `${tag}: changedIndexes ${q.changedIndexes} vs ${i}`);
      check(!!q.fix && q.fix.kind === "note" && q.fix.pc === ((m.notes[i].midi % 12) + 12) % 12, `${tag}: fix ${JSON.stringify(q.fix)}`);
      if (q.slotKind === "note") check(q.index === i, `${tag}: slot ${q.index} vs ${i}`);
      else check(q.index === Math.floor(m.notes[i].start + 1e-6) && q.voice === m.notes[i].voice, `${tag}: beat slot / voice`);
      // the altered note must not be doubled by another voice at the same moment
      const t = m.notes[i].start;
      const clash = q.altered.some((a, j) => j !== i && a.start <= t + 1e-6 && a.start + a.duration > t + 1e-6 && a.midi === q.altered[i].midi);
      check(!clash, `${tag}: altered note collides with another voice`);
      if (q.type === "voice-leading") {
        // parallels must really be there: some other voice moved by the same amount into a 5th/8ve
        const t2 = q.altered[i].start;
        const v2 = q.altered[i].voice;
        const t1 = Math.max(...q.altered.filter((n) => n.start < t2 - 1e-6).map((n) => n.start));
        const at = (t: number, v: number) => q.altered.find((n) => n.voice === v && n.start <= t + 1e-6 && n.start + n.duration > t + 1e-6);
        const q1 = at(t1, v2);
        let found = false;
        for (const v1 of m.voices) {
          if (v1 === v2) continue;
          const p1 = at(t1, v1);
          const p2 = q.altered.find((n) => n.voice === v1 && near(n.start, t2));
          if (!p1 || !p2 || !q1) continue;
          const i1 = q1.midi - p1.midi;
          const i2 = q.altered[i].midi - p2.midi;
          const cls = ((i1 % 12) + 12) % 12;
          if (i1 === i2 && p1.midi !== p2.midi && (cls === 7 || (cls === 0 && i1 !== 0))) found = true;
        }
        check(found, `${tag}: no parallel motion found (${q.description})`);
      }
      break;
    }
    case "chord-quality":
    case "inversion": {
      check(d.start.length === 0 && d.detuned.length === 0 && d.duration.length === 0, `${tag}: start/detune changed`);
      const chords = new Set(d.midi.map(chordOf));
      check(d.midi.length >= 1 && chords.size === 1 && chords.has(q.index), `${tag}: changed notes span chords ${[...chords]} (slot ${q.index})`);
      check(!!q.fix && (q.fix.kind === (q.type === "chord-quality" ? "chord" : "inversion")), `${tag}: fix ${JSON.stringify(q.fix)}`);
      if (q.type === "inversion") check(q.referenceFirst, `${tag}: inversion must play the reference first`);
      break;
    }
    case "rhythm": {
      check(d.midi.length === 0 && d.detuned.length === 0, `${tag}: midi/detune changed`);
      const moved = new Set(d.start.map((i) => (q.slotKind === "chord" ? chordOf(i) : i)));
      check(d.start.length >= 1 && moved.size === 1, `${tag}: moved ${d.start} (${[...moved]})`);
      check(d.start.every((i) => near(Math.abs(q.altered[i].start - m.notes[i].start), 0.25)), `${tag}: shift size`);
      check(q.shiftBeats !== undefined && near(Math.abs(q.shiftBeats), 0.25) && q.diagnosis === (q.shiftBeats! < 0 ? "early" : "late"), `${tag}: shift ${q.shiftBeats} ${q.diagnosis}`);
      // durations may change only for the moved notes and (early) the note just before them
      const extra = d.duration.filter((i) => !d.start.includes(i));
      if (q.slotKind === "chord") check(new Set(extra.map(chordOf)).size <= 1, `${tag}: trimmed notes span several chords`);
      else check(extra.length <= 1, `${tag}: ${extra.length} unrelated durations changed`);
      check(q.altered.every((a) => a.start >= -1e-6 && a.duration > 0), `${tag}: negative start / duration`);
      break;
    }
    case "drift": {
      check(d.midi.length === 0 && d.start.length === 0 && d.duration.length === 0, `${tag}: midi/start changed`);
      check(d.detuned.length >= 2 && d.detuned.every((i) => m.notes[i].voice === q.voice), `${tag}: detuned ${d.detuned} not all in voice ${q.voice}`);
      const inVoice = m.notes.map((n, i) => (n.voice === q.voice ? i : -1)).filter((i) => i >= 0);
      const positions = d.detuned.map((i) => inVoice.indexOf(i)).sort((a, b) => a - b);
      check(positions.every((p, k) => k === 0 || p === positions[k - 1] + 1), `${tag}: stretch not contiguous ${positions}`);
      check(q.locationBy === "voice" && q.diagnosis === (q.cents! > 0 ? "drift-sharp" : "drift-flat"), `${tag}: locationBy/diagnosis`);
      break;
    }
  }
}

function perfectAnswer(q: Planted): Answer {
  return { ...EMPTY_ANSWER, index: q.index, voice: q.voice ?? null, diagnosis: q.diagnosis, fix: q.fix ?? null, amount: q.type === "detune" ? Math.abs(q.cents!) : null };
}

function checkScoring(q: Planted, kind: string) {
  const tag = `${kind}/${q.type} scoring`;
  const good = perfectAnswer(q);
  check(canSubmit(q, good), `${tag}: perfect answer not submittable`);
  let s = scoreAnswer(q, good);
  check(s.correct && s.score === 1 && s.locationOk && s.diagnosisOk && (q.fix ? s.fixOk === true : s.fixOk === null) && (q.type === "detune" ? s.amountOk === true : s.amountOk === null), `${tag}: perfect → ${JSON.stringify(s)}`);
  // wrong diagnosis
  const otherDiag = q.diagnosis === "flat" ? "sharp" : "flat";
  s = scoreAnswer(q, { ...good, diagnosis: otherDiag });
  check(!s.correct && s.score === 0.5 && s.locationOk && !s.diagnosisOk, `${tag}: wrong diagnosis → ${JSON.stringify(s)}`);
  // wrong location
  if (q.locationBy === "voice") {
    const otherVoice = q.material.voices.find((v) => v !== q.voice)!;
    s = scoreAnswer(q, { ...good, voice: otherVoice });
    check(!s.correct && s.score === 0.5, `${tag}: wrong voice → ${JSON.stringify(s)}`);
    s = scoreAnswer(q, { ...good, index: (q.index + 1) % q.slots.length });
    check(s.correct, `${tag}: drift ignores the beat`);
  } else {
    const wrongSlot = q.slots.findIndex((_, i) => !q.acceptIndexes.includes(i));
    if (wrongSlot >= 0) {
      s = scoreAnswer(q, { ...good, index: wrongSlot });
      check(!s.correct && s.score === 0.5 && !s.locationOk, `${tag}: wrong slot → ${JSON.stringify(s)}`);
    }
    if (q.locationBy === "slot+voice") {
      const otherVoice = q.material.voices.find((v) => v !== q.voice)!;
      s = scoreAnswer(q, { ...good, voice: otherVoice });
      check(!s.correct && s.score === 0.75 && s.locationPartial, `${tag}: right beat wrong voice → ${JSON.stringify(s)}`);
    }
  }
  // wrong fix does not reduce the score
  if (q.fix) {
    const badFix = q.fix.kind === "note" ? { kind: "note" as const, pc: (q.fix.pc + 1) % 12 } : q.fix.kind === "chord" ? { kind: "chord" as const, qualityId: "zzz" } : { kind: "inversion" as const, value: "inv:9" };
    s = scoreAnswer(q, { ...good, fix: badFix });
    check(s.correct && s.score === 1 && s.fixOk === false, `${tag}: wrong fix → ${JSON.stringify(s)}`);
  }
  // A/B
  const ab = { type: "ab" as const, inner: q, cleanIs: "B" as const };
  s = scoreAnswer(ab, { ...EMPTY_ANSWER, choice: "B" });
  check(s.correct && s.score === 1, `${tag}: A/B right`);
  s = scoreAnswer(ab, { ...EMPTY_ANSWER, choice: "A", diagnosis: q.diagnosis });
  check(!s.correct && s.score === 0 && s.fixOk === true, `${tag}: A/B wrong choice, right diagnosis`);
}

const attempts: Record<string, { tried: number; ok: number }> = {};
const bump = (key: string, ok: boolean) => {
  const e = (attempts[key] ??= { tried: 0, ok: 0 });
  e.tried++;
  if (ok) e.ok++;
};

const kinds: [string, () => Material, PlantType[]][] = [
  ["melody", randomMelody, ["detune", "wrong-note", "rhythm"]],
  ["voices", randomVoices, ["detune", "wrong-note", "rhythm", "drift", "voice-leading"]],
  ["progression", randomProgression, ["detune", "chord-quality", "inversion", "rhythm"]],
];

for (const [kind, gen, expected] of kinds) {
  for (let i = 0; i < 150; i++) {
    const m = gen();
    check(m.notes.length > 0 && m.totalBeats > 0, `${kind}: empty material`);
    check(m.notes.every((n, j) => j === 0 || n.start >= m.notes[j - 1].start - 1e-9), `${kind}: notes not sorted`);
    if (kind === "progression") {
      check(!!m.chords && m.chords.length >= 3 && m.chords.every((c) => c.noteIndexes.every((ni) => m.notes[ni].start === c.start)), `${kind}: chord index map`);
    }
    const compat = compatibleTypes(m);
    for (const t of expected) check(compat.includes(t), `${kind}: ${t} should be compatible`);
    for (const t of PLANT_TYPES) if (!expected.includes(t)) check(!compat.includes(t), `${kind}: ${t} should not be compatible`);
    const diags = diagnosesFor(m, ["detune", "rhythm", "ab"]);
    check(diags.join() === "flat,sharp,early,late", `${kind}: diagnoses ${diags}`);
    for (const t of compat) {
      const q = plantProblem(m, t, opts);
      bump(`${kind}/${t}`, !!q);
      if (!q) continue;
      check(q.type === t, `${kind}: planted ${q.type} for ${t}`);
      checkPlanted(q, kind);
      checkScoring(q, kind);
    }
  }
}

// planting succeeds nearly always; voice leading is allowed to fail on sparse textures
for (const [key, e] of Object.entries(attempts)) {
  const rate = e.ok / e.tried;
  const min = key.endsWith("voice-leading") ? 0.5 : 0.95;
  check(rate >= min, `${key}: planted only ${e.ok}/${e.tried}`);
}
console.log(
  Object.entries(attempts)
    .map(([k, e]) => `${k} ${e.ok}/${e.tried}`)
    .join(", ")
);
console.log(failures ? `${failures} mistake checks failed` : "all planted-problem checks passed");
process.exit(failures ? 1 : 0);
