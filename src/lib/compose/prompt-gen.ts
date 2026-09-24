/**
 * Prompts for the "imagine four bars, then play" drill: a key, a tempo, a progression, a mood and
 * optionally a one-bar seed motif the app plays first. Pure.
 */
import { chordLabel, chordOffsets } from "@/lib/music/chords";
import { pick, randomInt } from "@/lib/music/notes";
import { generatePhrase } from "@/lib/trainer/phrase-gen";
import type { ScoreNote } from "@/lib/music/score";
import { keyName, romanChords, type RomanChord } from "./theory";

export const MOODS = ["calm", "urgent", "playful", "dark", "hopeful", "floating", "driving", "tender", "restless", "triumphant", "wistful", "cheeky"];

const PROGRESSIONS: number[][] = [
  [0, 5, 3, 4],
  [0, 3, 4, 0],
  [0, 4, 5, 3],
  [5, 3, 0, 4],
  [1, 4, 0, 0],
  [0, 3, 0, 4],
  [0, 2, 3, 4],
  [3, 4, 2, 5],
  [0, 5, 1, 4],
];

export interface Prompt {
  tonic: number;
  minor: boolean;
  bpm: number;
  bars: number;
  chords: RomanChord[];
  mood: string;
  /** Seed motif in beats (one bar), or null. */
  seed: ScoreNote[] | null;
  text: string;
}

export interface PromptGenOptions {
  key: number; // -1 random
  bpmMin: number;
  bpmMax: number;
  bars: number;
  sevenths: boolean;
  mood: boolean;
  seed: boolean;
}

export function generatePrompt(o: PromptGenOptions): Prompt {
  const tonic = o.key >= 0 ? o.key : randomInt(0, 11);
  const minor = Math.random() < 0.35;
  const bpm = randomInt(Math.min(o.bpmMin, o.bpmMax), Math.max(o.bpmMin, o.bpmMax));
  const degrees = pick(PROGRESSIONS);
  const chords = romanChords(tonic, minor, degrees, o.sevenths && Math.random() < 0.5);
  const mood = o.mood ? pick(MOODS) : "";
  let seed: ScoreNote[] | null = null;
  if (o.seed) {
    const phrase = generatePhrase({ key: tonic, scale: minor ? "minor" : "major", bars: 1, beatsPerBar: 4, bpm, low: 60, high: 79, maxLeap: 7, chromaticism: 0, style: "mixed", rhythm: "mixed", voices: 1, rests: 0 });
    seed = phrase.notes;
  }
  const names = chords.map((c) => chordLabel(c.spec)).join(" – ");
  const text = `${keyName(tonic, minor)} · ${bpm} bpm · ${chords.map((c) => c.roman).join("–")} (${names})${mood ? ` · ${mood}` : ""}${seed ? " · starts from the motif you will hear" : ""}`;
  return { tonic, minor, bpm, bars: o.bars, chords, mood, seed, text };
}

/** Backing chords for the take: one chord per bar, cycling the progression, voiced around C3–C4. */
export function backingNotes(p: Prompt): { midi: number; startBeat: number; durationBeats: number }[] {
  const out: { midi: number; startBeat: number; durationBeats: number }[] = [];
  for (let bar = 0; bar < p.bars; bar++) {
    const c = p.chords[bar % p.chords.length];
    const root = 48 + c.spec.rootPc;
    for (const off of chordOffsets(c.spec)) out.push({ midi: root + off, startBeat: bar * 4, durationBeats: 4 });
  }
  return out;
}
