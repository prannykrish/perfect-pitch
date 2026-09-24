/**
 * Score model for the transcription trainer. Time is in beats (quarter notes) so pieces are
 * tempo-independent; playback converts with the phrase's bpm.
 */

export interface ScoreNote {
  midi: number;
  /** Start in beats from the beginning of the piece / phrase. */
  start: number;
  /** Length in beats. */
  duration: number;
  velocity?: number;
  /** Track index the note came from (0 = top voice). */
  voice: number;
}

export interface Track {
  name: string;
  notes: Omit<ScoreNote, "voice">[];
}

export interface Piece {
  /** "bach:012", "upload:5", "generated" */
  id: string;
  name: string;
  source: "bach" | "upload" | "generated";
  bpm: number;
  beatsPerBar: number;
  totalBeats: number;
  tracks: Track[];
}

export interface Phrase {
  /** Notes with `start` relative to the phrase start (0-based). */
  notes: ScoreNote[];
  /** Position in the source piece, in beats. */
  startBeat: number;
  endBeat: number;
  bpm: number;
  beatsPerBar: number;
  /** Track indexes included. */
  voices: number[];
  label: string;
  pieceId?: string;
  phraseIndex?: number;
}

export function beatsToMs(beats: number, bpm: number): number {
  return (beats * 60000) / bpm;
}

export function msToBeats(ms: number, bpm: number): number {
  return (ms * bpm) / 60000;
}

export function sortNotes(notes: ScoreNote[]): ScoreNote[] {
  return [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
}

/** Flatten a piece's tracks (optionally a subset of voices) into one sorted note list. */
export function pieceNotes(piece: Piece, voices?: number[]): ScoreNote[] {
  const out: ScoreNote[] = [];
  piece.tracks.forEach((t, v) => {
    if (voices && !voices.includes(v)) return;
    for (const n of t.notes) out.push({ ...n, voice: v });
  });
  return sortNotes(out);
}

export function phraseDurationBeats(p: Phrase): number {
  return p.notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
}

/**
 * Slice a piece into phrases of `bars` bars on bar boundaries. Notes that start inside the
 * phrase are included; their duration is clipped to the phrase end. Empty phrases are dropped.
 */
export function slicePhrases(piece: Piece, bars: number, voices?: number[]): Phrase[] {
  const notes = pieceNotes(piece, voices);
  const phraseBeats = Math.max(1, bars) * piece.beatsPerBar;
  const phrases: Phrase[] = [];
  const totalBars = Math.ceil(piece.totalBeats / piece.beatsPerBar);
  let idx = 0;
  for (let b = 0; b < totalBars; b += bars) {
    const startBeat = b * piece.beatsPerBar;
    const endBeat = Math.min(piece.totalBeats, startBeat + phraseBeats);
    const inside = notes
      .filter((n) => n.start >= startBeat && n.start < endBeat)
      .map((n) => ({ ...n, start: n.start - startBeat, duration: Math.min(n.duration, endBeat - n.start) }));
    if (!inside.length) continue;
    phrases.push({
      notes: inside,
      startBeat,
      endBeat,
      bpm: piece.bpm,
      beatsPerBar: piece.beatsPerBar,
      voices: voices ?? piece.tracks.map((_, i) => i),
      label: `${piece.name} · bars ${b + 1}–${Math.min(totalBars, b + bars)}`,
      pieceId: piece.id,
      phraseIndex: idx++,
    });
  }
  return phrases;
}

/** Shape of @tonejs/midi's Midi.toJSON(), the parts we use. */
export interface MidiJsonLike {
  header: {
    ppq: number;
    tempos?: { bpm: number; ticks: number }[];
    timeSignatures?: { timeSignature: number[]; ticks: number }[];
    name?: string;
  };
  tracks: { name?: string; channel?: number; notes: { midi: number; ticks: number; durationTicks: number; velocity: number }[] }[];
}

/** Convert a parsed MIDI file into a Piece. Drums (channel 9) and empty tracks are dropped. */
export function pieceFromMidiJson(json: MidiJsonLike, name: string, id: string): Piece {
  const ppq = json.header.ppq || 480;
  const bpm = Math.round(json.header.tempos?.[0]?.bpm ?? 100);
  const ts = json.header.timeSignatures?.[0]?.timeSignature ?? [4, 4];
  const beatsPerBar = Math.max(1, Math.round((ts[0] * 4) / (ts[1] || 4)));
  const tracks: Track[] = json.tracks
    .filter((t) => t.notes.length && t.channel !== 9)
    .map((t, i) => ({
      name: t.name?.trim() || `Track ${i + 1}`,
      notes: t.notes.map((n) => ({ midi: n.midi, start: n.ticks / ppq, duration: Math.max(0.05, n.durationTicks / ppq), velocity: Math.round((n.velocity ?? 0.8) * 127) })),
    }));
  const totalBeats = tracks.reduce((m, t) => Math.max(m, ...t.notes.map((n) => n.start + n.duration)), 0);
  return { id, name, source: "upload", bpm, beatsPerBar, totalBeats: Math.ceil(totalBeats / beatsPerBar) * beatsPerBar, tracks };
}
