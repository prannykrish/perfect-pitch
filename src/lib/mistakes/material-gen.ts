/**
 * Pure generators for Find the Mistake material: a melody, a 2–4 voice texture (both via the
 * transcription phrase generator) and a diatonic chord progression whose chord specs are known,
 * so quality / inversion problems can be planted exactly.
 */
import { chordOffsets, type ChordSpec, type Voicing } from "@/lib/music/chords";
import { pick, randomInt } from "@/lib/music/notes";
import type { Phrase, Piece, ScoreNote } from "@/lib/music/score";
import { generatePhrase, SCALE_LABELS, type PhraseRhythm, type PhraseStyle, type ScaleName } from "@/lib/trainer/phrase-gen";
import { voiceNamesFor, type Material, type ProgressionChord } from "./types";

const KEY_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

export interface MelodyGenOptions {
  key: number; // -1 random
  scale: ScaleName;
  bars: number;
  bpm: number;
  low: number;
  high: number;
  style: PhraseStyle;
  rhythm: PhraseRhythm;
  maxLeap: number;
}

export function generateMelodyMaterial(o: MelodyGenOptions): Material {
  const tonic = o.key >= 0 ? o.key : randomInt(0, 11);
  const phrase = generatePhrase({
    key: tonic,
    scale: o.scale,
    bars: o.bars,
    beatsPerBar: 4,
    bpm: o.bpm,
    low: o.low,
    high: o.high,
    maxLeap: o.maxLeap,
    chromaticism: 0,
    style: o.style,
    rhythm: o.rhythm,
    voices: 1,
    rests: 0,
  });
  return materialFromPhrase(phrase, "melody", { key: { tonic, scale: o.scale }, label: `Melody · ${KEY_NAMES[tonic]} ${SCALE_LABELS[o.scale].toLowerCase()} · ${o.bars} bars` });
}

export interface VoicesGenOptions {
  key: number;
  scale: ScaleName;
  bars: number;
  bpm: number;
  voices: 2 | 3 | 4;
}

export function generateVoicesMaterial(o: VoicesGenOptions): Material {
  const tonic = o.key >= 0 ? o.key : randomInt(0, 11);
  const phrase = generatePhrase({
    key: tonic,
    scale: o.scale,
    bars: o.bars,
    beatsPerBar: 4,
    bpm: o.bpm,
    low: 60,
    high: 81,
    maxLeap: 7,
    chromaticism: 0,
    style: "mixed",
    rhythm: "mixed",
    voices: o.voices,
    rests: 0,
  });
  return materialFromPhrase(phrase, "voices", { key: { tonic, scale: o.scale }, label: `${o.voices} voices · ${KEY_NAMES[tonic]} ${SCALE_LABELS[o.scale].toLowerCase()} · ${o.bars} bars` });
}

/** Turn a phrase (generated, or sliced from a piece) into material. */
export function materialFromPhrase(
  phrase: Phrase,
  kind: Material["kind"],
  extra: { key?: Material["key"]; label?: string; piece?: Piece; sourceRef?: string } = {}
): Material {
  const notes: ScoreNote[] = [...phrase.notes].sort((a, b) => a.start - b.start || a.midi - b.midi).map((n) => ({ ...n }));
  const voices = [...new Set(notes.map((n) => n.voice))].sort((a, b) => a - b);
  const voiceNames: Record<number, string> = {};
  if (extra.piece) {
    for (const v of voices) voiceNames[v] = extra.piece.tracks[v]?.name ?? `Track ${v + 1}`;
  } else {
    const names = voiceNamesFor(voices.length);
    voices.forEach((v, i) => {
      voiceNames[v] = names[i] ?? `Voice ${v + 1}`;
    });
  }
  return {
    kind,
    notes,
    bpm: phrase.bpm,
    beatsPerBar: phrase.beatsPerBar,
    totalBeats: Math.max(phrase.endBeat - phrase.startBeat, notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0)),
    voices,
    voiceNames,
    key: extra.key,
    label: extra.label ?? phrase.label,
    sourceRef: extra.sourceRef,
  };
}

// ---------------------------------------------------------------------------
// Progressions
// ---------------------------------------------------------------------------

export interface ProgressionGenOptions {
  key: number; // -1 random
  minor: boolean;
  chords: number; // 3..8
  beatsPerChord: number; // 2 or 4
  sevenths: boolean;
  inversions: boolean;
  voicings: Voicing[];
  bpm: number;
}

/** Scale-degree patterns (0-based) that sound like progressions. */
const PATTERNS = [
  [0, 3, 4, 0],
  [0, 5, 3, 4],
  [0, 4, 5, 3],
  [1, 4, 0, 0],
  [5, 3, 0, 4],
  [0, 3, 0, 4],
  [0, 2, 3, 4],
  [3, 4, 0, 5],
  [0, 5, 1, 4],
  [0, 3, 1, 4],
  [0, 4, 5, 2],
  [5, 4, 3, 4],
];

const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEGREES = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_TRIADS = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MINOR_TRIADS = ["min", "dim", "maj", "min", "min", "maj", "maj"];
const MAJOR_SEVENTHS = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
const MINOR_SEVENTHS = ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"];

export function generateProgressionMaterial(o: ProgressionGenOptions): Material {
  const tonic = o.key >= 0 ? o.key : randomInt(0, 11);
  const count = Math.max(2, Math.min(8, o.chords));
  const pattern = pick(PATTERNS);
  const degrees: number[] = [];
  for (let i = 0; i < count; i++) degrees.push(pattern[i % pattern.length]);
  // end on the tonic when the pattern does not already
  if (count >= 4 && degrees[count - 1] !== 0 && Math.random() < 0.6) degrees[count - 1] = 0;
  const scale = o.minor ? MINOR_DEGREES : MAJOR_DEGREES;
  const triads = o.minor ? MINOR_TRIADS : MAJOR_TRIADS;
  const sevenths = o.minor ? MINOR_SEVENTHS : MAJOR_SEVENTHS;
  const voicings = o.voicings.length ? o.voicings : (["closed"] as Voicing[]);

  const notes: ScoreNote[] = [];
  const chords: ProgressionChord[] = [];
  degrees.forEach((deg, i) => {
    const useSeventh = o.sevenths && Math.random() < 0.7;
    const qualityId = useSeventh ? sevenths[deg] : triads[deg];
    const rootPc = (tonic + scale[deg]) % 12;
    const size = useSeventh ? 4 : 3;
    const inversion = o.inversions ? randomInt(0, Math.min(size - 1, 2)) : 0;
    const allowedVoicings = voicings.filter((v) => v !== "drop2" || size >= 4);
    const voicing = pick(allowedVoicings.length ? allowedVoicings : (["closed"] as Voicing[]));
    const spec: ChordSpec = { rootPc, qualityId, inversion, voicing };
    // root in the octave C3–B3 so the voicing sits in the middle of the keyboard
    const rootMidi = 48 + rootPc;
    const offsets = chordOffsets(spec);
    const start = i * o.beatsPerChord;
    const noteIndexes: number[] = [];
    for (const off of offsets) {
      noteIndexes.push(notes.length);
      notes.push({ midi: rootMidi + off, start, duration: o.beatsPerChord, velocity: 85, voice: 0 });
    }
    chords.push({ spec, rootMidi, start, duration: o.beatsPerChord, noteIndexes });
  });

  const beatsPerBar = 4;
  const totalBeats = count * o.beatsPerChord;
  return {
    kind: "progression",
    notes,
    bpm: o.bpm,
    beatsPerBar,
    totalBeats,
    voices: [0],
    voiceNames: { 0: "Chords" },
    key: { tonic, scale: o.minor ? "minor" : "major" },
    chords,
    label: `Progression · ${KEY_NAMES[tonic]} ${o.minor ? "minor" : "major"} · ${count} chords`,
  };
}
