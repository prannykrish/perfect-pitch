/**
 * Planting exactly one problem into a piece of material, scoring an answer, and describing the
 * result in plain language. Pure: no audio, no DOM, no settings store.
 */
import { chordLabel, chordOffsets, chordQuality, CHORD_QUALITIES, INVERSION_LABELS, VOICING_LABELS, type ChordSpec, type Voicing } from "@/lib/music/chords";
import { noteName, pick, pitchClassOf, randomInt, shuffle } from "@/lib/music/notes";
import { SCALES } from "@/lib/trainer/phrase-gen";
import { CENTS_BUCKETS } from "@/lib/trainer/generators";
import {
  DIAGNOSES_BY_TYPE,
  PLANT_TYPES,
  isDrift,
  type Answer,
  type Diagnosis,
  type Fix,
  type Material,
  type MistakeNote,
  type MistakeQuestion,
  type PlantType,
  type Planted,
  type ProblemType,
  type ScoredAnswer,
  type Slot,
  type SlotKind,
} from "./types";

export interface PlantOptions {
  centsMin: number;
  centsMax: number;
  /** Size of a rhythm slip in beats. */
  slipBeats: number;
  /** Play the clean version first (forced on for inversion problems). */
  referenceFirst: boolean;
}

const EPS = 1e-6;

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function fmtBeat(beat: number): string {
  return Math.abs(beat - Math.round(beat)) < 1e-6 ? String(Math.round(beat)) : beat.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** "Bar 2, beat 3" for a start in beats. */
export function whereLabel(start: number, beatsPerBar: number): string {
  const bar = Math.floor(start / beatsPerBar + EPS) + 1;
  const beat = start - (bar - 1) * beatsPerBar + 1;
  return `Bar ${bar}, beat ${fmtBeat(beat)}`;
}

function shortWhere(start: number, beatsPerBar: number): string {
  const bar = Math.floor(start / beatsPerBar + EPS) + 1;
  const beat = start - (bar - 1) * beatsPerBar + 1;
  return `${bar}·${fmtBeat(beat)}`;
}

export function slipLabel(beats: number): string {
  const b = Math.abs(beats);
  if (Math.abs(b - 0.25) < EPS) return "a quarter beat";
  if (Math.abs(b - 0.5) < EPS) return "half a beat";
  if (Math.abs(b - 1) < EPS) return "a whole beat";
  if (Math.abs(b - 1 / 3) < 0.01) return "a third of a beat";
  return `${fmtBeat(b)} beats`;
}

export function centsLabel(cents: number): string {
  return `${Math.abs(cents)} cents ${cents > 0 ? "sharp" : "flat"}`;
}

export function fixLabel(fix: Fix): string {
  if (fix.kind === "note") return ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][fix.pc];
  if (fix.kind === "chord") return chordQuality(fix.qualityId)?.name ?? fix.qualityId;
  const [k, v] = fix.value.split(":");
  return k === "inv" ? INVERSION_LABELS[Number(v)] ?? fix.value : VOICING_LABELS[v as Voicing] ?? v;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export function slotKindFor(m: Material): SlotKind {
  if (m.kind === "progression" && m.chords?.length) return "chord";
  return m.voices.length > 1 ? "beat" : "note";
}

export function buildSlots(m: Material, kind: SlotKind): Slot[] {
  const bpb = m.beatsPerBar;
  if (kind === "note") return m.notes.map((n, i) => ({ kind, label: String(i + 1), sub: shortWhere(n.start, bpb), start: n.start, end: n.start + n.duration }));
  if (kind === "chord") return (m.chords ?? []).map((c, i) => ({ kind, label: String(i + 1), sub: `bar ${Math.floor(c.start / bpb + EPS) + 1}`, start: c.start, end: c.start + c.duration }));
  const beats = Math.max(1, Math.ceil(m.totalBeats - EPS));
  return Array.from({ length: beats }, (_, b) => ({ kind, label: String(b + 1), sub: shortWhere(b, bpb), start: b, end: b + 1 }));
}

function slotIndexFor(m: Material, kind: SlotKind, noteIndex: number, slotCount: number): number {
  if (kind === "note") return noteIndex;
  if (kind === "chord") {
    const ci = (m.chords ?? []).findIndex((c) => c.noteIndexes.includes(noteIndex));
    return Math.max(0, ci);
  }
  return Math.min(slotCount - 1, Math.max(0, Math.floor(m.notes[noteIndex].start + EPS)));
}

function beatSlot(start: number, slotCount: number): number {
  return Math.min(slotCount - 1, Math.max(0, Math.floor(start + EPS)));
}

// ---------------------------------------------------------------------------
// Compatibility
// ---------------------------------------------------------------------------

/** Which problem types can be planted in this material. */
export function compatibleTypes(m: Material): PlantType[] {
  const out: PlantType[] = [];
  if (m.notes.length) out.push("detune");
  if (m.kind === "progression" && m.chords && m.chords.length >= 2) {
    out.push("chord-quality", "inversion", "rhythm");
  } else {
    if (m.notes.length) out.push("wrong-note");
    if (m.notes.length >= 2) out.push("rhythm");
    if (m.voices.length >= 2) out.push("drift", "voice-leading");
  }
  return out;
}

/** Static guess used before the material exists (uploads: assume multi-voice). */
export function staticCompatibleTypes(kind: Material["kind"]): PlantType[] {
  switch (kind) {
    case "progression":
      return ["detune", "chord-quality", "inversion", "rhythm"];
    case "melody":
      return ["detune", "wrong-note", "rhythm"];
    default:
      return ["detune", "wrong-note", "rhythm", "drift", "voice-leading"];
  }
}

/** Diagnoses the picker should offer for a question, given the enabled types. */
export function diagnosesFor(m: Material, enabled: ProblemType[]): Diagnosis[] {
  const plantable = enabled.filter((t): t is PlantType => t !== "ab");
  const pool = plantable.length ? plantable : PLANT_TYPES;
  const compat = compatibleTypes(m);
  const out: Diagnosis[] = [];
  for (const t of PLANT_TYPES) {
    if (!pool.includes(t) || !compat.includes(t)) continue;
    for (const d of DIAGNOSES_BY_TYPE[t]) if (!out.includes(d)) out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickBucket(opts: PlantOptions): number {
  const b = CENTS_BUCKETS.filter((c) => c >= opts.centsMin && c <= opts.centsMax);
  return pick(b.length ? b : [opts.centsMax]);
}

function cloneNotes(notes: readonly MistakeNote[]): MistakeNote[] {
  return notes.map((n) => ({ ...n }));
}

/** Notes of one voice, as indexes into m.notes, sorted by start. */
function voiceNoteIndexes(m: Material, voice: number): number[] {
  return m.notes
    .map((n, i) => (n.voice === voice ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => m.notes[a].start - m.notes[b].start || m.notes[a].midi - m.notes[b].midi);
}

/** Notes sounding at `t` (start <= t < end). */
function soundingAt(notes: readonly MistakeNote[], t: number): number[] {
  return notes.map((n, i) => (n.start <= t + EPS && n.start + n.duration > t + EPS ? i : -1)).filter((i) => i >= 0);
}

function scalePcs(m: Material): Set<number> | null {
  if (!m.key) return null;
  return new Set(SCALES[m.key.scale].map((s) => (s + m.key!.tonic) % 12));
}

function base(m: Material, type: PlantType, altered: MistakeNote[], kind: SlotKind, slots: Slot[], opts: PlantOptions): Omit<Planted, "index" | "acceptIndexes" | "diagnosis" | "original" | "wrong" | "description" | "changedIndexes" | "locationBy"> {
  return { type, material: m, altered, slots, slotKind: kind, referenceFirst: opts.referenceFirst || type === "inversion" };
}

function voiceWord(m: Material, kind: SlotKind, voice: number): string {
  return kind === "beat" ? `the ${m.voiceNames[voice] ?? `voice ${voice + 1}`}` : "";
}

// ---------------------------------------------------------------------------
// 1. Detuned note
// ---------------------------------------------------------------------------

export function plantDetune(m: Material, opts: PlantOptions): Planted | null {
  if (!m.notes.length) return null;
  const kind = slotKindFor(m);
  const slots = buildSlots(m, kind);
  const long = m.notes.map((_, i) => i).filter((i) => m.notes[i].duration >= 0.5);
  const i = pick(long.length ? long : m.notes.map((_, j) => j));
  const n = m.notes[i];
  const cents = pick([1, -1]) * pickBucket(opts);
  const altered = cloneNotes(m.notes);
  altered[i].detune = cents;
  const index = slotIndexFor(m, kind, i, slots.length);
  const dir: Diagnosis = cents > 0 ? "sharp" : "flat";
  const who = kind === "beat" ? `${voiceWord(m, kind, n.voice)} ` : "";
  const where = kind === "chord" ? `Chord ${index + 1} (${whereLabel(n.start, m.beatsPerBar).toLowerCase()})` : whereLabel(n.start, m.beatsPerBar);
  return {
    ...base(m, "detune", altered, kind, slots, opts),
    locationBy: kind === "beat" ? "slot+voice" : "slot",
    index,
    acceptIndexes: [index],
    voice: kind === "beat" ? n.voice : undefined,
    diagnosis: dir,
    cents,
    original: noteName(n.midi),
    wrong: centsLabel(cents),
    description: `${where}: ${who}${noteName(n.midi)} was played ${centsLabel(cents)}.`,
    changedIndexes: [i],
  };
}

// ---------------------------------------------------------------------------
// 2. Wrong note
// ---------------------------------------------------------------------------

export function plantWrongNote(m: Material, opts: PlantOptions): Planted | null {
  if (!m.notes.length || m.kind === "progression") return null;
  const kind = slotKindFor(m);
  const slots = buildSlots(m, kind);
  const pcs = scalePcs(m);
  const order = shuffle(m.notes.map((_, i) => i));
  for (const i of order) {
    const n = m.notes[i];
    const alts: number[] = [];
    // chromatic neighbours
    alts.push(n.midi - 1, n.midi + 1);
    if (pcs) {
      // wrong scale degree: the next scale note up / down, and a diatonic third away
      const up: number[] = [];
      const down: number[] = [];
      for (let d = 1; d <= 5 && up.length < 2; d++) if (pcs.has(pitchClassOf(n.midi + d))) up.push(n.midi + d);
      for (let d = 1; d <= 5 && down.length < 2; d++) if (pcs.has(pitchClassOf(n.midi - d))) down.push(n.midi - d);
      alts.push(...up, ...down);
    } else {
      alts.push(n.midi - 2, n.midi + 2, n.midi + 3, n.midi - 3);
    }
    const simultaneous = new Set(soundingAt(m.notes, n.start).filter((j) => j !== i).map((j) => m.notes[j].midi));
    const usable = [...new Set(alts)].filter((a) => a !== n.midi && a >= 21 && a <= 108 && !simultaneous.has(a));
    if (!usable.length) continue;
    // weight: chromatic neighbours half the time
    const chromatic = usable.filter((a) => Math.abs(a - n.midi) === 1);
    const alt = chromatic.length && Math.random() < 0.5 ? pick(chromatic) : pick(usable);
    const altered = cloneNotes(m.notes);
    altered[i].midi = alt;
    const index = slotIndexFor(m, kind, i, slots.length);
    const who = kind === "beat" ? `${voiceWord(m, kind, n.voice)}: ` : "";
    return {
      ...base(m, "wrong-note", altered, kind, slots, opts),
      locationBy: kind === "beat" ? "slot+voice" : "slot",
      index,
      acceptIndexes: [index],
      voice: kind === "beat" ? n.voice : undefined,
      diagnosis: "wrong-note",
      fix: { kind: "note", pc: pitchClassOf(n.midi) },
      original: noteName(n.midi),
      wrong: noteName(alt),
      description: `${whereLabel(n.start, m.beatsPerBar)}: ${who}${noteName(alt)} should be ${noteName(n.midi)}.`,
      changedIndexes: [i],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Wrong chord quality
// ---------------------------------------------------------------------------

/** Plausible swaps that keep the number of chord tones. */
const QUALITY_SWAPS: Record<string, string[]> = {
  maj: ["min", "sus4", "aug", "sus2"],
  min: ["maj", "dim", "sus4"],
  dim: ["min", "maj"],
  aug: ["maj", "min"],
  sus4: ["maj", "min"],
  sus2: ["maj", "min"],
  "7": ["maj7", "m7", "7sus4", "6"],
  maj7: ["7", "mMaj7", "6"],
  m7: ["7", "mMaj7", "m7b5", "m6"],
  m7b5: ["m7", "dim7"],
  dim7: ["m7b5"],
  mMaj7: ["m7", "maj7"],
  "6": ["maj7", "m6"],
  m6: ["m7", "6"],
  "7sus4": ["7"],
  aug7: ["7"],
  augMaj7: ["maj7"],
};

function chordNotesFor(spec: ChordSpec, rootMidi: number): number[] {
  return chordOffsets(spec).map((o) => rootMidi + o);
}

export function plantChordQuality(m: Material, opts: PlantOptions): Planted | null {
  if (!m.chords?.length) return null;
  const slots = buildSlots(m, "chord");
  const order = shuffle(m.chords.map((_, i) => i));
  for (const ci of order) {
    const c = m.chords[ci];
    const q = chordQuality(c.spec.qualityId);
    if (!q) continue;
    const count = q.intervals.length;
    let swaps = (QUALITY_SWAPS[q.id] ?? []).filter((id) => chordQuality(id)?.intervals.length === count);
    if (!swaps.length) swaps = CHORD_QUALITIES.filter((x) => x.id !== q.id && x.intervals.length === count && x.category === q.category).map((x) => x.id);
    if (!swaps.length) continue;
    const newSpec: ChordSpec = { ...c.spec, qualityId: pick(swaps) };
    const newNotes = chordNotesFor(newSpec, c.rootMidi);
    if (newNotes.length !== c.noteIndexes.length || newNotes.some((x) => x < 21 || x > 108)) continue;
    const altered = cloneNotes(m.notes);
    c.noteIndexes.forEach((ni, k) => {
      altered[ni].midi = newNotes[k];
    });
    if (c.noteIndexes.every((ni) => altered[ni].midi === m.notes[ni].midi)) continue;
    return {
      ...base(m, "chord-quality", altered, "chord", slots, opts),
      locationBy: "slot",
      index: ci,
      acceptIndexes: [ci],
      diagnosis: "wrong-chord",
      fix: { kind: "chord", qualityId: c.spec.qualityId },
      original: chordLabel(c.spec),
      wrong: chordLabel(newSpec),
      description: `Chord ${ci + 1} (${whereLabel(c.start, m.beatsPerBar).toLowerCase()}): ${chordLabel(newSpec)} was played; it should be ${chordLabel(c.spec)} (${chordQuality(c.spec.qualityId)?.name}).`,
      changedIndexes: [...c.noteIndexes],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. Wrong inversion / voicing
// ---------------------------------------------------------------------------

export function plantInversion(m: Material, opts: PlantOptions): Planted | null {
  if (!m.chords?.length) return null;
  const slots = buildSlots(m, "chord");
  const order = shuffle(m.chords.map((_, i) => i));
  for (const ci of order) {
    const c = m.chords[ci];
    const q = chordQuality(c.spec.qualityId);
    if (!q) continue;
    const n = q.intervals.length;
    const inversions = Array.from({ length: Math.min(n, 4) }, (_, k) => k).filter((k) => k !== c.spec.inversion);
    const voicings = (["closed", "open", "drop2"] as Voicing[]).filter((v) => v !== c.spec.voicing && (v !== "open" || n >= 3) && (v !== "drop2" || n >= 4));
    const useVoicing = voicings.length && (!inversions.length || Math.random() < 0.3);
    const newSpec: ChordSpec = useVoicing ? { ...c.spec, voicing: pick(voicings) } : { ...c.spec, inversion: pick(inversions) };
    const newNotes = chordNotesFor(newSpec, c.rootMidi);
    if (newNotes.length !== c.noteIndexes.length || newNotes.some((x) => x < 21 || x > 108)) continue;
    if (newNotes.every((x, k) => x === m.notes[c.noteIndexes[k]].midi)) continue;
    const altered = cloneNotes(m.notes);
    c.noteIndexes.forEach((ni, k) => {
      altered[ni].midi = newNotes[k];
    });
    const original = useVoicing ? VOICING_LABELS[c.spec.voicing] : INVERSION_LABELS[c.spec.inversion];
    const wrong = useVoicing ? VOICING_LABELS[newSpec.voicing] : INVERSION_LABELS[newSpec.inversion];
    return {
      ...base(m, "inversion", altered, "chord", slots, opts),
      referenceFirst: true,
      locationBy: "slot",
      index: ci,
      acceptIndexes: [ci],
      diagnosis: "wrong-inversion",
      fix: { kind: "inversion", value: useVoicing ? `voicing:${c.spec.voicing}` : `inv:${c.spec.inversion}` },
      original,
      wrong,
      description: `Chord ${ci + 1} (${chordLabel(c.spec)}): played ${useVoicing ? "in a" : "in"} ${wrong.toLowerCase()} ${useVoicing ? "voicing" : ""} instead of ${original.toLowerCase()}.`.replace(/\s+/g, " "),
      changedIndexes: [...c.noteIndexes],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. Rhythm slip
// ---------------------------------------------------------------------------

export function plantRhythm(m: Material, opts: PlantOptions): Planted | null {
  const d = Math.max(0.05, opts.slipBeats);
  const kind = slotKindFor(m);
  const slots = buildSlots(m, kind);

  if (kind === "chord" && m.chords) {
    const order = shuffle(m.chords.map((_, i) => i).filter((i) => i > 0));
    for (const ci of order) {
      const c = m.chords[ci];
      const prev = m.chords[ci - 1];
      const dirs: ("early" | "late")[] = [];
      if (c.start - d > prev.start + 0.05) dirs.push("early");
      if (c.duration - d >= 0.25) dirs.push("late");
      if (!dirs.length) continue;
      const dir = pick(dirs);
      const shift = dir === "early" ? -d : d;
      const altered = cloneNotes(m.notes);
      for (const ni of c.noteIndexes) {
        altered[ni].start = c.start + shift;
        altered[ni].duration = dir === "early" ? c.duration + d : c.duration - d;
      }
      if (dir === "early") for (const ni of prev.noteIndexes) altered[ni].duration = Math.max(0.1, Math.min(altered[ni].duration, c.start + shift - prev.start));
      return {
        ...base(m, "rhythm", altered, kind, slots, opts),
        locationBy: "slot",
        index: ci,
        acceptIndexes: [ci],
        diagnosis: dir,
        shiftBeats: shift,
        original: `on beat ${fmtBeat((c.start % m.beatsPerBar) + 1)}`,
        wrong: `${slipLabel(d)} ${dir}`,
        description: `Chord ${ci + 1} (${whereLabel(c.start, m.beatsPerBar).toLowerCase()}) came in ${slipLabel(d)} ${dir}.`,
        changedIndexes: [...c.noteIndexes],
      };
    }
    return null;
  }

  const order = shuffle(m.notes.map((_, i) => i));
  for (const i of order) {
    const n = m.notes[i];
    const inVoice = voiceNoteIndexes(m, n.voice);
    const pos = inVoice.indexOf(i);
    if (pos <= 0) continue; // the first note of a voice has no beat reference before it
    const prev = m.notes[inVoice[pos - 1]];
    const dirs: ("early" | "late")[] = [];
    if (n.start - d > prev.start + 0.05) dirs.push("early");
    if (n.duration - d >= 0.125) dirs.push("late");
    if (!dirs.length) continue;
    const dir = pick(dirs);
    const shift = dir === "early" ? -d : d;
    const altered = cloneNotes(m.notes);
    altered[i].start = n.start + shift;
    altered[i].duration = dir === "early" ? n.duration + d : n.duration - d;
    if (dir === "early") {
      const pi = inVoice[pos - 1];
      altered[pi].duration = Math.max(0.1, Math.min(altered[pi].duration, altered[i].start - prev.start));
    }
    const index = slotIndexFor(m, kind, i, slots.length);
    const accept = kind === "beat" ? [...new Set([index, beatSlot(altered[i].start, slots.length)])] : [index];
    const who = kind === "beat" ? `${voiceWord(m, kind, n.voice)} ` : "";
    return {
      ...base(m, "rhythm", altered, kind, slots, opts),
      locationBy: kind === "beat" ? "slot+voice" : "slot",
      index,
      acceptIndexes: accept,
      voice: kind === "beat" ? n.voice : undefined,
      diagnosis: dir,
      shiftBeats: shift,
      original: `on ${whereLabel(n.start, m.beatsPerBar).toLowerCase()}`,
      wrong: `${slipLabel(d)} ${dir}`,
      description: `${whereLabel(n.start, m.beatsPerBar)}: ${who}${noteName(n.midi)} came in ${slipLabel(d)} ${dir}.`,
      changedIndexes: [i],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 6. Drifted voice
// ---------------------------------------------------------------------------

export function plantDrift(m: Material, opts: PlantOptions): Planted | null {
  if (m.voices.length < 2) return null;
  const slots = buildSlots(m, "beat");
  const voices = shuffle(m.voices.filter((v) => voiceNoteIndexes(m, v).length >= 2));
  if (!voices.length) return null;
  const v = voices[0];
  const idx = voiceNoteIndexes(m, v);
  const len = Math.max(2, Math.ceil(idx.length * 0.5));
  const s = randomInt(0, idx.length - len);
  const stretch = idx.slice(s, s + len);
  const cents = pick([1, -1]) * pickBucket(opts);
  const altered = cloneNotes(m.notes);
  for (const i of stretch) altered[i].detune = cents;
  const first = m.notes[stretch[0]];
  const last = m.notes[stretch[stretch.length - 1]];
  const index = beatSlot(first.start, slots.length);
  const accept: number[] = [];
  for (let b = index; b <= beatSlot(last.start, slots.length); b++) accept.push(b);
  const name = m.voiceNames[v] ?? `voice ${v + 1}`;
  return {
    ...base(m, "drift", altered, "beat", slots, opts),
    locationBy: "voice",
    index,
    acceptIndexes: accept,
    voice: v,
    diagnosis: cents > 0 ? "drift-sharp" : "drift-flat",
    cents,
    original: name,
    wrong: centsLabel(cents),
    description: `The ${name} drifted ${centsLabel(cents)} from ${whereLabel(first.start, m.beatsPerBar).toLowerCase()} to ${whereLabel(last.start, m.beatsPerBar).toLowerCase()}.`,
    changedIndexes: stretch,
  };
}

// ---------------------------------------------------------------------------
// 7. Voice-leading fault (parallel fifths / octaves)
// ---------------------------------------------------------------------------

export function plantVoiceLeading(m: Material, opts: PlantOptions): Planted | null {
  if (m.voices.length < 2) return null;
  const slots = buildSlots(m, "beat");
  const times = [...new Set(m.notes.map((n) => Math.round(n.start * 1000) / 1000))].sort((a, b) => a - b);
  interface Cand {
    v1: number;
    v2: number;
    p1: number;
    q1: number;
    p2i: number;
    q2i: number;
    target: number;
    interval: number;
  }
  const cands: Cand[] = [];
  const startingAt = (t: number) => m.notes.map((n, i) => (Math.abs(n.start - t) < EPS ? i : -1)).filter((i) => i >= 0);
  for (let k = 1; k < times.length; k++) {
    const t1 = times[k - 1];
    const t2 = times[k];
    const at1 = soundingAt(m.notes, t1);
    const st2 = startingAt(t2);
    for (const v1 of m.voices) {
      for (const v2 of m.voices) {
        if (v1 === v2) continue;
        const p1i = at1.find((i) => m.notes[i].voice === v1);
        const q1i = at1.find((i) => m.notes[i].voice === v2);
        const p2i = st2.find((i) => m.notes[i].voice === v1);
        const q2i = st2.find((i) => m.notes[i].voice === v2);
        if (p1i === undefined || q1i === undefined || p2i === undefined || q2i === undefined) continue;
        const p1 = m.notes[p1i].midi;
        const q1 = m.notes[q1i].midi;
        const p2 = m.notes[p2i].midi;
        const q2 = m.notes[q2i].midi;
        const interval = q1 - p1;
        const cls = ((interval % 12) + 12) % 12;
        const isFifth = cls === 7;
        const isOctave = cls === 0 && interval !== 0;
        if (!isFifth && !isOctave) continue;
        if (p2 === p1) continue; // v1 must move
        const target = p2 + interval;
        if (target === q2) continue; // already parallel
        if (target < 21 || target > 108) continue;
        if (Math.abs(target - q1) > 7) continue; // keep it a plausible voice move
        const others = st2.filter((i) => m.notes[i].voice !== v2).map((i) => m.notes[i].midi);
        const held = soundingAt(m.notes, t2).filter((i) => m.notes[i].voice !== v2 && Math.abs(m.notes[i].start - t2) >= EPS).map((i) => m.notes[i].midi);
        if ([...others, ...held].includes(target)) continue;
        cands.push({ v1, v2, p1, q1, p2i, q2i, target, interval });
      }
    }
  }
  if (!cands.length) return null;
  const c = pick(cands);
  const q2 = m.notes[c.q2i];
  const altered = cloneNotes(m.notes);
  altered[c.q2i].midi = c.target;
  const index = beatSlot(q2.start, slots.length);
  const what = ((c.interval % 12) + 12) % 12 === 7 ? "fifths" : "octaves";
  const n2 = m.voiceNames[c.v2] ?? `voice ${c.v2 + 1}`;
  const n1 = m.voiceNames[c.v1] ?? `voice ${c.v1 + 1}`;
  return {
    ...base(m, "voice-leading", altered, "beat", slots, opts),
    locationBy: "slot+voice",
    index,
    acceptIndexes: [index],
    voice: c.v2,
    diagnosis: "voice-leading",
    fix: { kind: "note", pc: pitchClassOf(q2.midi) },
    original: noteName(q2.midi),
    wrong: noteName(c.target),
    description: `${whereLabel(q2.start, m.beatsPerBar)}: the ${n2} moved to ${noteName(c.target)}, making parallel ${what} with the ${n1}. It should be ${noteName(q2.midi)}.`,
    changedIndexes: [c.q2i],
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function plantProblem(m: Material, type: PlantType, opts: PlantOptions): Planted | null {
  switch (type) {
    case "detune":
      return plantDetune(m, opts);
    case "wrong-note":
      return plantWrongNote(m, opts);
    case "chord-quality":
      return plantChordQuality(m, opts);
    case "inversion":
      return plantInversion(m, opts);
    case "rhythm":
      return plantRhythm(m, opts);
    case "drift":
      return plantDrift(m, opts);
    case "voice-leading":
      return plantVoiceLeading(m, opts);
  }
}

/** Try the given types (in order) and return the first that can be planted. */
export function plantAny(m: Material, types: PlantType[], opts: PlantOptions): Planted | null {
  const compat = compatibleTypes(m);
  for (const t of types) {
    if (!compat.includes(t)) continue;
    const p = plantProblem(m, t, opts);
    if (p) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function sameFix(a: Fix, b: Fix): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "note" && b.kind === "note") return a.pc === b.pc;
  if (a.kind === "chord" && b.kind === "chord") return a.qualityId === b.qualityId;
  if (a.kind === "inversion" && b.kind === "inversion") return a.value === b.value;
  return false;
}

export function scoreAnswer(q: MistakeQuestion, a: Answer): ScoredAnswer {
  if (q.type === "ab") {
    const choiceOk = a.choice !== null && a.choice === q.cleanIs;
    const diagOk = a.diagnosis !== null ? a.diagnosis === q.inner.diagnosis : null;
    return { correct: choiceOk, score: choiceOk ? 1 : 0, locationOk: choiceOk, locationPartial: false, diagnosisOk: diagOk === true, fixOk: diagOk, amountOk: null };
  }
  let loc = 0;
  const slotOk = a.index !== null && q.acceptIndexes.includes(a.index);
  const voiceOk = q.voice === undefined || a.voice === q.voice;
  if (q.locationBy === "voice") loc = voiceOk && a.voice !== null ? 1 : 0;
  else if (q.locationBy === "slot+voice") loc = slotOk ? (voiceOk ? 1 : 0.5) : 0;
  else loc = slotOk ? 1 : 0;
  const diagOk = a.diagnosis === q.diagnosis;
  const score = 0.5 * loc + (diagOk ? 0.5 : 0);
  const fixOk = q.fix ? (a.fix ? sameFix(q.fix, a.fix) : null) : null;
  const amountOk = q.type === "detune" && q.cents !== undefined ? (a.amount === null ? null : a.amount === Math.abs(q.cents)) : null;
  return { correct: loc === 1 && diagOk, score, locationOk: loc === 1, locationPartial: loc === 0.5, diagnosisOk: diagOk, fixOk, amountOk };
}

/** Is the answer complete enough to submit? */
export function canSubmit(q: MistakeQuestion, a: Answer): boolean {
  if (q.type === "ab") return a.choice !== null;
  if (a.diagnosis === null) return false;
  if (isDrift(a.diagnosis)) return a.voice !== null;
  if (a.index === null) return false;
  if (q.material.voices.length > 1 && q.slotKind === "beat") return a.voice !== null;
  return true;
}

/** Plain-language version of an answer, for the summary table. */
export function describeAnswer(q: MistakeQuestion, a: Answer): string {
  if (q.type === "ab") return `${a.choice ?? "?"} is clean${a.diagnosis ? `, other one: ${DIAG_SHORT[a.diagnosis]}` : ""}`;
  const parts: string[] = [];
  if (isDrift(a.diagnosis)) {
    if (a.voice !== null) parts.push(q.material.voiceNames[a.voice] ?? `voice ${a.voice + 1}`);
  } else {
    if (a.index !== null) parts.push(`${q.slotKind === "chord" ? "chord" : q.slotKind === "beat" ? "beat" : "note"} ${a.index + 1}`);
    if (a.voice !== null && q.slotKind === "beat") parts.push(q.material.voiceNames[a.voice] ?? `voice ${a.voice + 1}`);
  }
  if (a.diagnosis) parts.push(DIAG_SHORT[a.diagnosis]);
  if (a.amount !== null) parts.push(`${a.amount}¢`);
  if (a.fix) parts.push(`fix ${fixLabel(a.fix)}`);
  return parts.join(", ") || "no answer";
}

const DIAG_SHORT: Record<Diagnosis, string> = {
  flat: "flat",
  sharp: "sharp",
  "wrong-note": "wrong note",
  "wrong-chord": "wrong chord",
  "wrong-inversion": "wrong inversion",
  early: "early",
  late: "late",
  "drift-flat": "drifts flat",
  "drift-sharp": "drifts sharp",
  "voice-leading": "bad voice leading",
};

/** The planted problem behind any question. */
export function plantedOf(q: MistakeQuestion): Planted {
  return q.type === "ab" ? q.inner : q;
}
