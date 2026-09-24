#!/usr/bin/env node
/**
 * Builds the bundled Bach chorales for the Hear It, Play It tab.
 *
 * Source: the JSB Chorales dataset (Boulanger-Lewandowski 2012, as re-published by
 * czhuang/JSB-Chorales-dataset): 382 four-part chorales quantised to 16th notes, each step a
 * [soprano, alto, tenor, bass] list of MIDI pitches (-1 = rest). Consecutive equal pitches are
 * merged into one held note (the dataset cannot distinguish a repeated note from a tie).
 *
 * Output: public/pieces/bach/index.json + public/pieces/bach/NNN.json (our Piece format, beats).
 *   node scripts/build-chorales.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "public", "pieces", "bach");
const URL = "https://raw.githubusercontent.com/czhuang/JSB-Chorales-dataset/master/Jsb16thSeparated.json";
const VOICES = ["Soprano", "Alto", "Tenor", "Bass"];
const STEP = 0.25; // beats per 16th
const BPM = 76;

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** Rough key guess from pitch-class weights (Krumhansl profiles), for a helpful label only. */
function guessKey(steps) {
  const counts = Array(12).fill(0);
  for (const s of steps) for (const v of s) if (v >= 0) counts[v % 12]++;
  const major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minor = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  let best = { score: -Infinity, name: "" };
  for (let k = 0; k < 12; k++) {
    for (const [profile, mode] of [[major, "major"], [minor, "minor"]]) {
      let s = 0;
      for (let i = 0; i < 12; i++) s += profile[i] * counts[(i + k) % 12];
      if (s > best.score) best = { score: s, name: `${NOTE_NAMES[k]} ${mode}` };
    }
  }
  return best.name;
}

function convert(steps, index) {
  const tracks = VOICES.map((name) => ({ name, notes: [] }));
  for (let v = 0; v < 4; v++) {
    let cur = null;
    for (let i = 0; i <= steps.length; i++) {
      const pitch = i < steps.length ? steps[i][v] : -2;
      if (cur && cur.midi === pitch) {
        cur.duration += STEP;
        continue;
      }
      if (cur) {
        tracks[v].notes.push(cur);
        cur = null;
      }
      if (pitch >= 0) cur = { midi: pitch, start: i * STEP, duration: STEP, velocity: 90 };
    }
  }
  const totalBeats = steps.length * STEP;
  const id = String(index + 1).padStart(3, "0");
  return {
    id: `bach:${id}`,
    name: `Bach chorale ${index + 1} (${guessKey(steps)})`,
    source: "bach",
    bpm: BPM,
    beatsPerBar: 4,
    totalBeats,
    tracks,
  };
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${URL}`);
const data = await res.json();
const all = [...data.train, ...data.valid, ...data.test];
await mkdir(OUT, { recursive: true });
const index = [];
let bytes = 0;
for (let i = 0; i < all.length; i++) {
  const piece = convert(all[i], i);
  const json = JSON.stringify(piece);
  bytes += json.length;
  await writeFile(path.join(OUT, `${String(i + 1).padStart(3, "0")}.json`), json);
  index.push({
    id: piece.id,
    name: piece.name,
    bars: Math.ceil(piece.totalBeats / piece.beatsPerBar),
    notes: piece.tracks.reduce((n, t) => n + t.notes.length, 0),
    file: `/pieces/bach/${String(i + 1).padStart(3, "0")}.json`,
  });
}
await writeFile(path.join(OUT, "index.json"), JSON.stringify(index));
console.log(`Wrote ${all.length} chorales (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${OUT}`);
