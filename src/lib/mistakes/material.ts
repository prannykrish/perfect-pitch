"use client";

/**
 * Builds a Find the Mistake question from the settings: picks a problem type and a source that
 * fit each other, loads or generates the material, plants the problem (retrying when a type
 * cannot be planted in that material) and assigns instruments.
 */
import { filterInstruments, getInstrument, type InstrumentDef } from "@/lib/audio/instruments";
import { isInstrumentAvailable, useEngineStore } from "@/lib/audio/engine";
import { pick, shuffle } from "@/lib/music/notes";
import { slicePhrases, type Piece } from "@/lib/music/score";
import { loadBachIndex, loadBachPiece, loadUploadedPiece } from "@/lib/transcribe/sources";
import { generateMelodyMaterial, generateProgressionMaterial, generateVoicesMaterial, materialFromPhrase } from "./material-gen";
import { compatibleTypes, plantProblem, staticCompatibleTypes, type PlantOptions } from "./plant";
import type { MistakesSettings } from "./settings";
import { PLANT_TYPES, PROBLEM_TYPES, type Material, type MaterialKind, type MistakeQuestion, type PlantType } from "./types";

const MINOR_SCALES = new Set(["minor", "dorian", "blues"]);

function plantOpts(s: MistakesSettings): PlantOptions {
  return { centsMin: s.centsMin, centsMax: s.centsMax, slipBeats: s.slipBeats, referenceFirst: s.referenceFirst };
}

function phrasesOf(piece: Piece, bars: number, minVoices: number) {
  return slicePhrases(piece, bars).filter((p) => new Set(p.notes.map((n) => n.voice)).size >= minVoices && p.notes.length >= 3);
}

export async function buildMaterial(kind: MaterialKind, s: MistakesSettings): Promise<Material> {
  switch (kind) {
    case "melody":
      return generateMelodyMaterial({ key: s.key, scale: s.scale, bars: s.bars, bpm: s.bpm, low: s.melodyLow, high: s.melodyHigh, style: s.melodyStyle, rhythm: s.melodyRhythm, maxLeap: 9 });
    case "voices":
      return generateVoicesMaterial({ key: s.key, scale: s.scale, bars: s.bars, bpm: s.bpm, voices: s.voiceCount });
    case "progression":
      return generateProgressionMaterial({
        key: s.key,
        minor: MINOR_SCALES.has(s.scale),
        chords: s.progChords,
        beatsPerChord: s.progBeatsPerChord,
        sevenths: s.progSevenths,
        inversions: s.progInversions,
        voicings: s.progVoicings,
        bpm: s.bpm,
      });
    case "bach": {
      const index = s.bachRandom ? Math.floor(Math.random() * (await loadBachIndex()).length) : s.bachIndex;
      const piece = await loadBachPiece(index);
      const phrases = phrasesOf(piece, s.bachBars, 2);
      if (!phrases.length) throw new Error(`${piece.name} has no usable ${s.bachBars}-bar phrase`);
      const phrase = pick(phrases);
      const scaled = { ...phrase, bpm: Math.round(phrase.bpm * s.bachTempoScale) };
      return materialFromPhrase(scaled, "bach", { piece, label: phrase.label, sourceRef: `${piece.id}#${phrase.phraseIndex ?? 0}` });
    }
    case "upload": {
      if (s.uploadId === null) throw new Error("Pick an uploaded piece first, or upload a MIDI file.");
      const piece = await loadUploadedPiece(s.uploadId);
      const phrases = phrasesOf(piece, s.uploadBars, 1);
      if (!phrases.length) throw new Error(`${piece.name} has no usable ${s.uploadBars}-bar phrase`);
      const phrase = pick(phrases);
      return materialFromPhrase(phrase, "upload", { piece, label: phrase.label, sourceRef: `${piece.id}#${phrase.phraseIndex ?? 0}` });
    }
  }
}

/** Sources "auto" may use for a type. */
function sourcesFor(type: PlantType, s: MistakesSettings): MaterialKind[] {
  const pool = s.autoSources.length ? s.autoSources : (["melody", "progression", "voices"] as MaterialKind[]);
  return pool.filter((k) => (k !== "upload" || s.uploadId !== null) && staticCompatibleTypes(k).includes(type));
}

export function enabledTypes(s: MistakesSettings) {
  return PROBLEM_TYPES.filter((t) => s.types[t]);
}

/** Problem types that can be drilled with the current source, before any material is built. */
export function drillableTypes(s: MistakesSettings): PlantType[] {
  const enabled = enabledTypes(s);
  const plantable = enabled.filter((t): t is PlantType => t !== "ab");
  const pool = plantable.length ? plantable : enabled.includes("ab") ? PLANT_TYPES : [];
  if (s.source === "auto") return pool.filter((t) => sourcesFor(t, s).length > 0);
  const compat = staticCompatibleTypes(s.source);
  return pool.filter((t) => compat.includes(t));
}

export async function buildQuestion(s: MistakesSettings): Promise<MistakeQuestion> {
  const enabled = enabledTypes(s);
  if (!enabled.length) throw new Error("Turn on at least one problem type in the settings.");
  const abOnly = enabled.length === 1 && enabled[0] === "ab";
  const wantAb = s.types.ab && (abOnly || Math.random() < 0.3);
  const candidates = drillableTypes(s);
  if (!candidates.length) {
    throw new Error(s.source === "auto" ? "None of the enabled problem types fit the sources ticked under Auto." : "None of the enabled problem types fit this source. Detuned note and rhythm slip fit everything; chord problems need a progression; drift and voice leading need 2+ voices.");
  }
  const opts = plantOpts(s);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const type = pick(candidates);
    const kinds = s.source === "auto" ? sourcesFor(type, s) : [s.source];
    if (!kinds.length) continue;
    const kind = pick(kinds);
    let material: Material;
    try {
      material = await buildMaterial(kind, s);
    } catch (err) {
      lastError = err;
      if (kinds.length === 1 && s.source !== "auto") throw err;
      continue;
    }
    const compat = compatibleTypes(material);
    const here = candidates.filter((t) => compat.includes(t));
    const order = here.includes(type) ? [type, ...shuffle(here.filter((t) => t !== type))] : shuffle(here);
    for (const t of order) {
      const p = plantProblem(material, t, opts);
      if (p) return wantAb ? { type: "ab", inner: p, cleanIs: pick(["A", "B"] as const) } : p;
    }
  }
  if (lastError) throw lastError;
  throw new Error("Could not plant a problem with these settings. Try another source or more problem types.");
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

function fits(def: InstrumentDef, notes: { midi: number }[]): boolean {
  return notes.every((n) => n.midi >= def.range[0] && n.midi <= def.range[1]);
}

/** One instrument id per voice index. */
export function assignInstruments(m: Material, s: MistakesSettings): Record<number, string> {
  const out: Record<number, string> = {};
  const fallback = getInstrument(s.instrumentId) ? s.instrumentId : "gm:acoustic_grand_piano";
  if (s.instrumentMode === "fixed") {
    for (const v of m.voices) out[v] = fallback;
    return out;
  }
  const state = useEngineStore.getState();
  const pool = shuffle(filterInstruments({ tiers: s.tiers, pitchedOnly: true }).filter((d) => isInstrumentAvailable(d, state)));
  if (s.instrumentMode === "random") {
    const def = pool.slice(0, 40).find((d) => fits(d, m.notes));
    for (const v of m.voices) out[v] = def?.id ?? fallback;
    return out;
  }
  const used = new Set<string>();
  for (const v of m.voices) {
    const notes = m.notes.filter((n) => n.voice === v);
    const def = pool.find((d) => !used.has(d.id) && fits(d, notes)) ?? pool.find((d) => fits(d, notes));
    const id = def?.id ?? fallback;
    used.add(id);
    out[v] = id;
  }
  return out;
}
