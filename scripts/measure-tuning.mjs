/**
 * Measures how in tune the piano samples are: decodes each note's mp3, estimates the fundamental
 * with a harmonic-sum search around the expected frequency, and prints the error in cents plus
 * how weak the fundamental is next to the second partial (why the bottom octave is hard to place).
 *   node scripts/measure-tuning.mjs                 # FluidR3 piano + Steinway, bottom octaves
 *   node scripts/measure-tuning.mjs gm:xylophone    # any local GM soundfont, all notes
 */
import fs from "node:fs";
import path from "node:path";
import { MPEGDecoder } from "mpg123-decoder";

const ROOT = process.cwd();
const midiOf = (name) => {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + pc;
};
const expectedHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const cents = (f, ref) => 1200 * Math.log2(f / ref);

function goertzelPower(x, sampleRate, freq) {
  const n = x.length;
  const k = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(k);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    s0 = x[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/** Best f0 near `guess` by summing log power over the first partials (inharmonicity-tolerant: only 1–4). */
function estimateF0(x, sampleRate, guess) {
  const weights = [1, 1, 0.7, 0.5];
  const score = (f0) => weights.reduce((acc, w, i) => acc + w * Math.log10(1e-12 + goertzelPower(x, sampleRate, f0 * (i + 1))), 0);
  let best = guess;
  let bestScore = -Infinity;
  for (let c = -300; c <= 300; c += 2) {
    const f = guess * Math.pow(2, c / 1200);
    const s = score(f);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  const coarse = best;
  for (let c = -8; c <= 8; c += 0.25) {
    const f = coarse * Math.pow(2, c / 1200);
    const s = score(f);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  return best;
}

async function decodeMp3(bytes) {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const { channelData, sampleRate } = decoder.decode(bytes);
  decoder.free();
  const ch = channelData[0];
  const mono = new Float32Array(ch.length);
  for (let i = 0; i < ch.length; i++) mono[i] = channelData.length > 1 ? (ch[i] + channelData[1][i]) / 2 : ch[i];
  return { pcm: mono, sampleRate };
}

/** A one-second window after the attack (or as much as exists). */
function window(pcm, sampleRate) {
  const start = Math.min(pcm.length - 1, Math.round(sampleRate * 0.25));
  const end = Math.min(pcm.length, start + sampleRate);
  return pcm.subarray(start, end);
}

/** Where each overtone really sits: peak power within ±90 cents of k·f0, reported as cents off k·f0 and level. */
function partials(x, sampleRate, f0, count = 6) {
  const out = [];
  for (let k = 1; k <= count; k++) {
    let best = k * f0;
    let bestP = -1;
    for (let c = -90; c <= 90; c += 1.5) {
      const f = k * f0 * Math.pow(2, c / 1200);
      const p = goertzelPower(x, sampleRate, f);
      if (p > bestP) {
        bestP = p;
        best = f;
      }
    }
    out.push({ k, hz: best, offCents: cents(best, k * f0), power: bestP });
  }
  return out;
}

/**
 * The pitch the ear infers when the fundamental is missing: the f0 that best fits the audible
 * partials (2nd–6th), each weighted by its level. Piano strings are stiff, so these sit sharp of
 * true multiples and the inferred pitch drifts sharp with them.
 */
function inferredF0(parts) {
  const audible = parts.filter((p) => p.k >= 2);
  const maxP = Math.max(...audible.map((p) => p.power));
  let wsum = 0;
  let sum = 0;
  for (const p of audible) {
    const w = Math.max(0, 1 + 0.1 * Math.log10(p.power / maxP)); // 0 dB → 1, -100 dB → 0
    wsum += w;
    sum += (w * p.hz) / p.k;
  }
  return wsum ? sum / wsum : parts[0].hz;
}

async function measure(label, bytes, midi, detail = false) {
  const { pcm, sampleRate } = await decodeMp3(bytes);
  const x = window(pcm, sampleRate);
  const ref = expectedHz(midi);
  const f0 = estimateF0(x, sampleRate, ref);
  const parts = partials(x, sampleRate, f0);
  const p1 = parts[0].power;
  const fundDb = 10 * Math.log10((p1 + 1e-12) / (Math.max(parts[1].power, parts[2].power) + 1e-12));
  const err = cents(f0, ref);
  const heard = cents(inferredF0(parts), ref);
  const flag = Math.abs(err) > 15 ? "  <-- out of tune" : Math.abs(err) > 6 ? "  (a bit off)" : "";
  console.log(`${label.padEnd(22)} expected ${ref.toFixed(2).padStart(7)} Hz  fundamental ${f0.toFixed(2).padStart(7)} Hz (${(err >= 0 ? "+" : "") + err.toFixed(1)} c, ${fundDb >= 0 ? "+" : ""}${fundDb.toFixed(0)} dB vs overtones)   pitch the ear infers from the overtones: ${(heard >= 0 ? "+" : "") + heard.toFixed(0)} cents${flag}`);
  if (detail) {
    const top = Math.max(...parts.map((p) => p.power));
    console.log("    " + parts.map((p) => `${p.k}×: ${(p.offCents >= 0 ? "+" : "") + p.offCents.toFixed(0)}c ${(10 * Math.log10(p.power / top)).toFixed(0)}dB`).join("   "));
  }
  return err;
}

function soundfontNotes(id) {
  const kit = id.startsWith("mk:") ? "MusyngKite" : "FluidR3_GM";
  const name = id.replace(/^(gm|mk):/, "");
  const file = path.join(ROOT, "public", "soundfonts", kit, `${name}-mp3.js`);
  const s = fs.readFileSync(file, "utf8");
  const re = /"([A-G]b?\d)"\s*:\s*"data:audio\/mp3;base64,([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(s))) out.push({ note: m[1], bytes: new Uint8Array(Buffer.from(m[2], "base64")) });
  return out;
}

const only = process.argv[2];
if (only === "rms") {
  // loudness and decay of the GM piano samples, to size the bass reinforcement
  for (const n of soundfontNotes("gm:acoustic_grand_piano")) {
    if (!["A0", "C1", "E1", "G1", "A1", "C2", "C3", "C4"].includes(n.note)) continue;
    const { pcm, sampleRate } = await decodeMp3(n.bytes);
    const seg = (a, b) => {
      const s = pcm.subarray(Math.round(a * sampleRate), Math.min(pcm.length, Math.round(b * sampleRate)));
      let sum = 0;
      let peak = 0;
      for (const v of s) {
        sum += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      return { rms: Math.sqrt(sum / Math.max(1, s.length)), peak };
    };
    const a = seg(0.05, 0.3);
    const b = seg(0.3, 1.3);
    const c = seg(1.3, 2.3);
    console.log(`${n.note.padEnd(3)} length ${(pcm.length / sampleRate).toFixed(1)}s | attack rms ${a.rms.toFixed(3)} peak ${a.peak.toFixed(2)} | 0.3–1.3 s rms ${b.rms.toFixed(3)} | 1.3–2.3 s rms ${c.rms.toFixed(3)}`);
  }
} else if (only === "compare-low") {
  // the three pianos over the bottom keys, side by side
  const low = new Set(["A0", "Bb0", "B0", "C1", "D1", "E1", "F1", "G1", "A1", "C2", "C3"]);
  for (const id of ["gm:acoustic_grand_piano", "mk:acoustic_grand_piano"]) {
    console.log(`\n${id}:`);
    try {
      for (const n of soundfontNotes(id)) if (low.has(n.note)) await measure(`${id.slice(0, 2)} piano ${n.note}`, n.bytes, midiOf(n.note), ["A0", "C1", "E1"].includes(n.note));
    } catch (err) {
      console.log("  not available:", err.message);
    }
  }
  const dir = path.join(ROOT, "public", "streamed", "sfzinstruments-splendid-grand-piano", "samples");
  for (const vel of ["Mf", "FF"]) {
    console.log(`\nSteinway ${vel} samples:`);
    const files = fs.readdirSync(dir).filter((f) => new RegExp(`^${vel} [A-G]b?\\d\\.mp3$`, "i").test(f));
    const notes = files.map((f) => ({ f, note: f.replace(/^\w+ /, "").replace(/\.mp3$/, "") })).filter((n) => midiOf(n.note) >= 21 && midiOf(n.note) <= 48).sort((a, b) => midiOf(a.note) - midiOf(b.note));
    for (const n of notes) await measure(`Steinway ${vel} ${n.note}`, new Uint8Array(fs.readFileSync(path.join(dir, n.f))), midiOf(n.note), ["A0", "C1", "E1"].includes(n.note));
  }
} else if (only) {
  console.log(`\n${only}, every sampled note:`);
  for (const n of soundfontNotes(only)) await measure(`${only} ${n.note}`, n.bytes, midiOf(n.note));
} else {
  console.log("\nFluidR3 acoustic grand piano (the app's default piano), bottom two octaves plus references:");
  const wanted = new Set(["A0", "Bb0", "B0", "C1", "Db1", "D1", "Eb1", "E1", "F1", "Gb1", "G1", "Ab1", "A1", "Bb1", "B1", "C2", "C3", "C4", "A4"]);
  const detailed = new Set(["A0", "Bb0", "B0", "C1", "E1", "A1", "C2"]);
  for (const n of soundfontNotes("gm:acoustic_grand_piano")) if (wanted.has(n.note)) await measure(`FluidR3 piano ${n.note}`, n.bytes, midiOf(n.note), detailed.has(n.note));

  console.log("\nSplendid Grand Piano (Steinway, vendored), same region, mezzo-forte samples:");
  const dir = path.join(ROOT, "public", "streamed", "sfzinstruments-splendid-grand-piano", "samples");
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((f) => /^(Mf|MF) [A-G]b?\d\.mp3$/.test(f));
    const notes = files
      .map((f) => ({ f, note: f.replace(/^(Mf|MF) /, "").replace(/\.mp3$/, "") }))
      .filter((n) => midiOf(n.note) <= 48 || ["C4", "A4"].includes(n.note))
      .sort((a, b) => midiOf(a.note) - midiOf(b.note));
    for (const n of notes) await measure(`Steinway ${n.note}`, new Uint8Array(fs.readFileSync(path.join(dir, n.f))), midiOf(n.note), ["A0", "B0", "C2"].includes(n.note));
  } else console.log("  (not vendored)");
}
console.log("\nNotes: real pianos are stretch-tuned, so a bass sample recorded from a real piano may read a few cents flat on purpose. Anything past about 15 cents is a tuning fault in the sample. A fundamental many dB below the 2nd partial is why the bottom octave is hard to place: the ear is inferring the pitch from the overtones.");
