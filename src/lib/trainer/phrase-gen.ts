/**
 * Generated practice phrases for Hear It, Play It: single melodic lines in a key and style, or
 * two to four voices over a diatonic progression. Everything is in beats.
 */
import { pick, randomInt } from "@/lib/music/notes";
import type { Phrase, ScoreNote } from "@/lib/music/score";

export type ScaleName = "major" | "minor" | "dorian" | "mixolydian" | "pentatonic" | "blues" | "chromatic";
export type PhraseStyle = "stepwise" | "mixed" | "arpeggio" | "jazz" | "bass";
export type PhraseRhythm = "quarters" | "eighths" | "mixed" | "syncopated";

export const SCALES: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const SCALE_LABELS: Record<ScaleName, string> = {
  major: "Major",
  minor: "Natural minor",
  dorian: "Dorian",
  mixolydian: "Mixolydian",
  pentatonic: "Major pentatonic",
  blues: "Blues",
  chromatic: "Chromatic",
};

export interface GenOptions {
  /** Tonic pitch class; -1 = random. */
  key: number;
  scale: ScaleName;
  bars: number;
  beatsPerBar: number;
  bpm: number;
  low: number;
  high: number;
  /** Max jump in semitones between consecutive melody notes. */
  maxLeap: number;
  /** 0..1 chance of a chromatic neighbour / passing note. */
  chromaticism: number;
  style: PhraseStyle;
  rhythm: PhraseRhythm;
  voices: 1 | 2 | 3 | 4;
  /** 0..1 chance of a rest instead of a note (melody only). */
  rests: number;
}

const DURATIONS: Record<PhraseRhythm, number[]> = {
  quarters: [1],
  eighths: [0.5],
  mixed: [0.5, 0.5, 1, 1, 1, 1.5, 2],
  syncopated: [0.5, 0.75, 0.75, 1, 1.5, 0.25],
};

/** Diatonic triads by scale degree for progressions (degree indexes into the scale). */
const PROGRESSIONS = [
  [0, 3, 4, 0],
  [0, 5, 3, 4],
  [0, 4, 5, 3],
  [1, 4, 0, 0],
  [5, 3, 0, 4],
  [0, 3, 0, 4],
  [0, 2, 3, 4],
  [3, 4, 0, 5],
];

function scaleNotes(tonic: number, scale: ScaleName, low: number, high: number): number[] {
  const set = new Set(SCALES[scale].map((s) => (s + tonic) % 12));
  const out: number[] = [];
  for (let m = low; m <= high; m++) if (set.has(m % 12)) out.push(m);
  return out;
}

/** Chord tones (pitch classes) of the triad on a scale degree. */
function triadPcs(tonic: number, scale: ScaleName, degree: number): number[] {
  const s = SCALES[scale];
  const len = s.length;
  const d = ((degree % len) + len) % len;
  return [s[d], s[(d + 2) % len], s[(d + 4) % len]].map((x) => (x + tonic) % 12);
}

function rhythmFor(bars: number, beatsPerBar: number, rhythm: PhraseRhythm): { start: number; duration: number }[] {
  const total = bars * beatsPerBar;
  const out: { start: number; duration: number }[] = [];
  let t = 0;
  while (t < total - 1e-9) {
    let d = pick(DURATIONS[rhythm]);
    // do not cross the end; keep bar lines mostly aligned for readability
    const toBar = beatsPerBar - (t % beatsPerBar);
    if (d > toBar) d = toBar;
    if (t + d > total) d = total - t;
    out.push({ start: t, duration: d });
    t += d;
  }
  return out;
}

function melodyLine(opts: GenOptions, tonic: number, slots: { start: number; duration: number }[], progression: number[], voice: number, low: number, high: number): ScoreNote[] {
  const pool = scaleNotes(tonic, opts.scale, low, high);
  if (!pool.length) return [];
  const notes: ScoreNote[] = [];
  let cur = pool[randomInt(Math.floor(pool.length * 0.3), Math.floor(pool.length * 0.7))];
  for (const slot of slots) {
    if (opts.style !== "bass" && Math.random() < opts.rests) continue;
    const bar = Math.floor(slot.start / opts.beatsPerBar);
    const chord = triadPcs(tonic, opts.scale, progression[bar % progression.length]);
    const chordTones = pool.filter((m) => chord.includes(m % 12));
    let next: number;
    const near = (cands: number[], maxLeap: number) => {
      const c = cands.filter((m) => Math.abs(m - cur) <= maxLeap && m !== cur);
      return c.length ? pick(c) : pick(cands);
    };
    const onBeat = Math.abs(slot.start - Math.round(slot.start)) < 1e-6;
    switch (opts.style) {
      case "stepwise": {
        const idx = pool.indexOf(cur);
        const step = pick([-2, -1, -1, 1, 1, 2]);
        next = pool[Math.min(pool.length - 1, Math.max(0, idx + step))];
        break;
      }
      case "arpeggio":
        next = near(chordTones.length ? chordTones : pool, opts.maxLeap);
        break;
      case "bass":
        next = onBeat && slot.start % opts.beatsPerBar === 0 ? near(chordTones.filter((m) => m % 12 === chord[0]).length ? chordTones.filter((m) => m % 12 === chord[0]) : chordTones, 12) : near(chordTones.length ? chordTones : pool, opts.maxLeap);
        break;
      case "jazz": {
        const useChord = onBeat && Math.random() < 0.6;
        next = near(useChord && chordTones.length ? chordTones : pool, opts.maxLeap);
        if (!onBeat && Math.random() < Math.max(0.15, opts.chromaticism)) next = Math.min(high, Math.max(low, next + pick([-1, 1])));
        break;
      }
      default: {
        const useChord = onBeat && Math.random() < 0.5;
        next = near(useChord && chordTones.length ? chordTones : pool, opts.maxLeap);
      }
    }
    if (opts.style !== "jazz" && Math.random() < opts.chromaticism) next = Math.min(high, Math.max(low, next + pick([-1, 1])));
    cur = next;
    notes.push({ midi: next, start: slot.start, duration: slot.duration, velocity: 90, voice });
  }
  return notes;
}

/** Voice ranges for multi-voice phrases, top to bottom. */
const VOICE_RANGES: [number, number][] = [
  [60, 81], // soprano
  [55, 74], // alto
  [48, 67], // tenor
  [40, 60], // bass
];

export function generatePhrase(opts: GenOptions): Phrase {
  const tonic = opts.key >= 0 ? opts.key : randomInt(0, 11);
  const progression = pick(PROGRESSIONS);
  const notes: ScoreNote[] = [];
  if (opts.voices === 1) {
    const slots = rhythmFor(opts.bars, opts.beatsPerBar, opts.rhythm);
    notes.push(...melodyLine(opts, tonic, slots, progression, 0, opts.low, opts.high));
  } else {
    // top voice melodic, inner voices and bass move in longer values on chord tones (chorale-like)
    const slots = rhythmFor(opts.bars, opts.beatsPerBar, opts.rhythm);
    notes.push(...melodyLine({ ...opts, style: opts.style === "bass" ? "mixed" : opts.style }, tonic, slots, progression, 0, VOICE_RANGES[0][0], VOICE_RANGES[0][1]));
    const lowerSlots = rhythmFor(opts.bars, opts.beatsPerBar, opts.rhythm === "quarters" ? "quarters" : "mixed").filter((s) => s.duration >= 1 || Math.random() < 0.3);
    for (let v = 1; v < opts.voices; v++) {
      const isBass = v === opts.voices - 1;
      const [lo, hi] = VOICE_RANGES[isBass ? 3 : v];
      const pool = scaleNotes(tonic, opts.scale, lo, hi);
      let cur = pool[Math.floor(pool.length / 2)];
      for (const slot of lowerSlots) {
        const bar = Math.floor(slot.start / opts.beatsPerBar);
        const chord = triadPcs(tonic, opts.scale, progression[bar % progression.length]);
        let cands = pool.filter((m) => chord.includes(m % 12));
        if (isBass && slot.start % opts.beatsPerBar === 0) {
          const roots = cands.filter((m) => m % 12 === chord[0]);
          if (roots.length) cands = roots;
        }
        if (!cands.length) cands = pool;
        // avoid doubling a note another voice already holds at this moment
        const clash = notes.filter((n) => n.start <= slot.start + 1e-6 && n.start + n.duration > slot.start + 1e-6).map((n) => n.midi);
        let choose = cands.filter((m) => !clash.includes(m));
        if (!choose.length) choose = pool.filter((m) => !clash.includes(m));
        if (!choose.length) continue; // every note in range is already sounding: rest
        const nearest = choose.reduce((best, m) => (Math.abs(m - cur) < Math.abs(best - cur) ? m : best), choose[0]);
        cur = Math.random() < 0.75 ? nearest : pick(choose);
        notes.push({ midi: cur, start: slot.start, duration: slot.duration, velocity: 80, voice: v });
      }
    }
  }
  const sorted = notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  return {
    notes: sorted,
    startBeat: 0,
    endBeat: opts.bars * opts.beatsPerBar,
    bpm: opts.bpm,
    beatsPerBar: opts.beatsPerBar,
    voices: Array.from({ length: opts.voices }, (_, i) => i),
    label: `Generated · ${["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][tonic]} ${SCALE_LABELS[opts.scale].toLowerCase()} · ${opts.bars} bar${opts.bars === 1 ? "" : "s"}`,
  };
}
