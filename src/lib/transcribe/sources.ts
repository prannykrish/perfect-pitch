"use client";

/**
 * Client-side loaders for practice material: bundled Bach chorales (static JSON), uploaded pieces
 * (database), and generated phrases.
 */
import { getPiece } from "@/lib/db/actions";
import { pieceFromMidiJson, slicePhrases, type MidiJsonLike, type Phrase, type Piece } from "@/lib/music/score";
import { generatePhrase } from "@/lib/trainer/phrase-gen";
import type { TranscribeSettings } from "./settings";

export interface BachIndexEntry {
  id: string;
  name: string;
  bars: number;
  notes: number;
  file: string;
}

let bachIndexPromise: Promise<BachIndexEntry[]> | null = null;
const pieceCache = new Map<string, Promise<Piece>>();

export function loadBachIndex(): Promise<BachIndexEntry[]> {
  if (!bachIndexPromise) {
    bachIndexPromise = fetch("/pieces/bach/index.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load the chorale index (HTTP ${r.status}). Run: node scripts/build-chorales.mjs`);
        return r.json() as Promise<BachIndexEntry[]>;
      })
      .catch((err) => {
        bachIndexPromise = null;
        throw err;
      });
  }
  return bachIndexPromise;
}

export async function loadBachPiece(index: number): Promise<Piece> {
  const list = await loadBachIndex();
  const entry = list[Math.max(0, Math.min(list.length - 1, index))];
  if (!pieceCache.has(entry.id)) {
    pieceCache.set(
      entry.id,
      fetch(entry.file).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${entry.name}`);
        return r.json() as Promise<Piece>;
      })
    );
  }
  return pieceCache.get(entry.id)!;
}

export async function loadUploadedPiece(id: number): Promise<Piece> {
  const key = `upload:${id}`;
  if (!pieceCache.has(key)) {
    pieceCache.set(
      key,
      getPiece(id).then((p) => {
        if (!p) throw new Error("That piece no longer exists");
        return p;
      })
    );
  }
  return pieceCache.get(key)!;
}

export function forgetUploadedPiece(id: number) {
  pieceCache.delete(`upload:${id}`);
}

/** Resolve the piece the settings point at (bach / upload), or null for generated. */
export async function loadSourcePiece(s: TranscribeSettings): Promise<Piece | null> {
  if (s.source === "bach") return loadBachPiece(s.bachIndex);
  if (s.source === "upload") {
    if (s.uploadId === null) throw new Error("Pick an uploaded piece first, or upload a MIDI file.");
    return loadUploadedPiece(s.uploadId);
  }
  return null;
}

/** Voices that actually exist for a piece, from the settings selection. */
export function effectiveVoices(piece: Piece, selected: number[]): number[] {
  const valid = selected.filter((v) => v < piece.tracks.length);
  return valid.length ? valid : piece.tracks.map((_, i) => i);
}

export function generatedPhrase(s: TranscribeSettings, bars: number): Phrase {
  return generatePhrase({
    key: s.genKey,
    scale: s.genScale,
    bars,
    beatsPerBar: 4,
    bpm: s.genBpm,
    low: s.genLow,
    high: s.genHigh,
    maxLeap: s.genMaxLeap,
    chromaticism: s.genChromaticism,
    style: s.genStyle,
    rhythm: s.genRhythm,
    voices: s.genVoices,
    rests: s.genRests,
  });
}

export function piecePhrases(piece: Piece, s: TranscribeSettings, bars: number): Phrase[] {
  const phrases = slicePhrases(piece, bars, effectiveVoices(piece, s.voices));
  return phrases.map((p) => ({ ...p, bpm: Math.round(p.bpm * s.tempoScale) }));
}

/** Parse a MIDI file the user picked. */
export async function parseMidiFile(file: File): Promise<Piece> {
  const { Midi } = await import("@tonejs/midi");
  const buf = await file.arrayBuffer();
  const midi = new Midi(buf);
  const json = midi.toJSON() as unknown as MidiJsonLike;
  const name = file.name.replace(/\.(mid|midi)$/i, "");
  return pieceFromMidiJson(json, name, "upload:new");
}
