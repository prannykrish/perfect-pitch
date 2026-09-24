/**
 * Vendors every "streamed" instrument (Steinway, e-pianos, mallets, Versilian, Mellotron, double bass)
 * as local MP3 files under public/streamed/, so they play in any browser and offline.
 *
 * How: smplr is run in Node against a fake AudioContext with a recording Storage, which yields the
 * exact sample URLs it would fetch in the browser. Each Ogg Opus sample is downloaded, decoded with
 * ogg-opus-decoder (WASM) and encoded to MP3 with lamejs. A manifest records which instruments are
 * complete; the engine (src/lib/audio/engine.ts) rewrites CDN URLs to /streamed/... for those.
 *
 * Usage (run with tsx; .mts so tsx uses ESM resolution for the encoder package):
 *   npm run samples:streamed                     # everything (~6k files, takes a while, resumable)
 *   npm run samples:streamed -- --dry-run        # just count files
 *   npm run samples:streamed -- --only vcsl:     # ids containing this substring (e.g. "splendid", "mellotron:")
 *   npm run samples:streamed -- --kbps 160
 *   npm run samples:streamed -- --fill-missing  # only the instruments with samples the CDN lacks (see below)
 *
 * Gaps: a few sample files do not exist on the CDN at all (recorded under `missing` in the manifest).
 * smplr then plays nothing for that key at that velocity layer, which sounds like dropped notes. After
 * transcoding, every such gap is filled with a substitute written at the missing path: the same key
 * from another velocity layer / round-robin (a plain copy), or, when the key has no sample at all,
 * the nearest sampled key resampled to the right pitch. `filled` in the manifest records what was used.
 */
import { mkdir, writeFile, readFile, stat, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as smplr from "smplr";
import { OggOpusDecoder } from "ogg-opus-decoder";
import * as lameNs from "@breezystack/lamejs";
import { INSTRUMENTS, type InstrumentDef } from "../src/lib/audio/instruments";

// The package ships ESM (named exports) and an IIFE build; resolve Mp3Encoder from either shape.
type Mp3EncoderCtor = new (channels: number, sampleRate: number, kbps: number) => { encodeBuffer(l: Int16Array, r?: Int16Array): Uint8Array; flush(): Uint8Array };
const lameAny = lameNs as unknown as { Mp3Encoder?: Mp3EncoderCtor; default?: { Mp3Encoder?: Mp3EncoderCtor } };
function resolveMp3Encoder(): Mp3EncoderCtor {
  const ctor = lameAny.Mp3Encoder ?? lameAny.default?.Mp3Encoder;
  if (!ctor) throw new Error("Could not resolve Mp3Encoder from @breezystack/lamejs");
  return ctor;
}
const Mp3Encoder: Mp3EncoderCtor = resolveMp3Encoder();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "streamed");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const CDN_PREFIX = "https://smpldsnds.github.io/";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
};
const DRY_RUN = args.includes("--dry-run");
const FILL_ONLY = args.includes("--fill-missing");
const ONLY = flag("only", "");
const KBPS = Number(flag("kbps", "128"));
const DOWNLOAD_CONCURRENCY = Number(flag("concurrency", "6"));

// ---------- fake audio context so smplr runs in Node ----------
function nodeProxy(): unknown {
  const target = function () {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "value") return 0;
      if (typeof prop === "symbol" || prop === "then") return undefined;
      return nodeProxy();
    },
    set: () => true,
    apply: () => nodeProxy(),
    has: () => false,
  });
}
const fakeBuffer = { duration: 1, sampleRate: 48000, numberOfChannels: 1, length: 48000, getChannelData: () => new Float32Array(48000) };
const fakeContext = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === "currentTime") return 0;
      if (prop === "sampleRate") return 48000;
      if (prop === "state") return "running";
      if (prop === "destination") return nodeProxy();
      if (prop === "decodeAudioData") return async () => fakeBuffer;
      if (prop === "createBuffer") return () => fakeBuffer;
      if (prop === "resume") return async () => {};
      if (typeof prop === "symbol" || prop === "then") return undefined;
      return () => nodeProxy();
    },
  }
) as unknown as BaseAudioContext;

async function captureUrls(def: InstrumentDef): Promise<string[]> {
  const urls: string[] = [];
  const storage = {
    fetch: async (url: string) => {
      urls.push(url);
      return { status: 200, arrayBuffer: async () => new ArrayBuffer(8), json: async () => ({}), text: async () => "" };
    },
  };
  const src = def.source;
  let inst: { ready: Promise<void>; dispose(): void };
  switch (src.kind) {
    case "splendid":
      inst = smplr.SplendidGrandPiano(fakeContext, { storage });
      break;
    case "epiano":
      inst = smplr.ElectricPiano(fakeContext, { instrument: src.name, storage });
      break;
    case "mallet":
      inst = smplr.Mallet(fakeContext, { instrument: src.name, storage });
      break;
    case "versilian":
      inst = smplr.Versilian(fakeContext, { instrument: src.name, storage });
      break;
    case "mellotron":
      inst = smplr.Mellotron(fakeContext, { instrument: src.name, storage });
      break;
    case "smolken":
      inst = smplr.Smolken(fakeContext, { instrument: src.name, storage });
      break;
    default:
      return [];
  }
  await inst.ready;
  try {
    inst.dispose();
  } catch {
    /* ignore */
  }
  return [...new Set(urls)];
}

/** CDN URL -> local relative path (decoded, .mp3). Mirrors `localPathFor` in the engine. */
export function localRelPath(url: string): string {
  if (!url.startsWith(CDN_PREFIX)) throw new Error(`Unexpected sample host: ${url}`);
  const rel = decodeURIComponent(url.slice(CDN_PREFIX.length));
  return rel.replace(/\.(ogg|m4a)$/i, ".mp3");
}

// ---------- transcoding ----------
function floatTo16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function encodeMp3(channels: Float32Array[], sampleRate: number): Uint8Array {
  const ch = Math.min(2, channels.length);
  const enc = new Mp3Encoder(ch, sampleRate, KBPS);
  const left = floatTo16(channels[0]);
  const right = ch === 2 ? floatTo16(channels[1]) : undefined;
  const chunks: Uint8Array[] = [];
  const BLOCK = 1152 * 8;
  for (let i = 0; i < left.length; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK);
    const r = right ? right.subarray(i, i + BLOCK) : undefined;
    const out = ch === 2 ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
    if (out.length) chunks.push(out);
  }
  const end = enc.flush();
  if (end.length) chunks.push(end);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    result.set(c, off);
    off += c.length;
  }
  return result;
}

/** Linear-interpolation resample: ratio 2 = one octave up (half as long). */
function resample(channels: Float32Array[], ratio: number): Float32Array[] {
  return channels.map((ch) => {
    const outLen = Math.max(1, Math.floor(ch.length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const j = Math.floor(pos);
      const frac = pos - j;
      const a = ch[j] ?? 0;
      const b = ch[j + 1] ?? a;
      out[i] = a + (b - a) * frac;
    }
    return out;
  });
}

// ---------- gap filling: substitutes for samples the CDN does not have ----------
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /(?<![A-Za-z0-9])([A-G])(#|b)?(-?\d)(?![0-9A-Za-z])/;
const VELOCITY_ORDER = ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "vl1", "vl2", "vl3", "vl4"];

interface ParsedName {
  midi: number;
  /** File name with the note token replaced by "*", split into tokens, for comparing layers. */
  tokens: string[];
}

function parseSampleName(fileName: string): ParsedName | null {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  const m = NOTE_RE.exec(base);
  if (!m) return null;
  const pc = PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + pc;
  const masked = base.slice(0, m.index) + base.slice(m.index).replace(m[0], m[0].startsWith(m[1]) ? "*" : m[0][0] + "*");
  return { midi, tokens: masked.toLowerCase().split(/[-_ .]+/).filter(Boolean) };
}

/** How different two names are apart from the note: mismatching tokens, with a velocity-order tie-break. */
function layerDistance(a: string[], b: string[]): number {
  const n = Math.max(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? "";
    const y = b[i] ?? "";
    if (x === y) continue;
    const vx = VELOCITY_ORDER.indexOf(x);
    const vy = VELOCITY_ORDER.indexOf(y);
    if (vx >= 0 && vy >= 0) d += 1 + Math.abs(vx - vy) * 0.1;
    else if (/^(rr\d+|\d+)$/.test(x) && /^(rr\d+|\d+)$/.test(y)) d += 0.5; // round robin: nearly the same sound
    else d += 2;
  }
  return d;
}

interface Substitute {
  fromUrl: string;
  semitones: number;
}

/** Pick the best donor for a missing sample among the same instrument's other files (same folder). */
function chooseSubstitute(missingUrl: string, instrumentUrls: string[], missing: Set<string>): Substitute | null {
  const rel = localRelPath(missingUrl);
  const dir = path.posix.dirname(rel);
  const target = parseSampleName(path.posix.basename(rel));
  if (!target) return null;
  let best: { url: string; score: number; semitones: number } | null = null;
  for (const url of instrumentUrls) {
    if (url === missingUrl || missing.has(url)) continue;
    const r = localRelPath(url);
    if (path.posix.dirname(r) !== dir) continue;
    const cand = parseSampleName(path.posix.basename(r));
    if (!cand) continue;
    const semitones = target.midi - cand.midi;
    if (Math.abs(semitones) > 12) continue;
    const score = Math.abs(semitones) * 100 + layerDistance(target.tokens, cand.tokens);
    if (!best || score < best.score) best = { url, score, semitones };
  }
  return best ? { fromUrl: best.url, semitones: best.semitones } : null;
}

class NotFoundError extends Error {}

async function fetchBytes(url: string, tries = 4): Promise<Uint8Array> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) throw new NotFoundError("HTTP 404");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (err instanceof NotFoundError) break; // the CDN does not have it; the browser would skip it too
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

interface Manifest {
  generatedAt: string;
  kbps: number;
  instruments: Record<string, { files: number; done: boolean; missing?: number; filled?: number }>;
  /** Sample URLs the CDN itself does not have (404). smplr would play nothing for them; see `filled`. */
  missing?: string[];
  /** Missing URL -> the sample written in its place locally (same key, or a nearby key resampled by `semitones`). */
  filled?: Record<string, { from: string; semitones: number }>;
}

async function loadManifest(): Promise<Manifest> {
  if (existsSync(MANIFEST_PATH)) {
    try {
      return JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest;
    } catch {
      /* rewrite */
    }
  }
  return { generatedAt: new Date().toISOString(), kbps: KBPS, instruments: {} };
}

async function saveManifest(m: Manifest) {
  m.generatedAt = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

async function main() {
  const startManifest = await loadManifest();
  const defs = INSTRUMENTS.filter((d) => d.source.kind !== "soundfont" && d.source.kind !== "synth")
    .filter((d) => !ONLY || d.id.includes(ONLY))
    .filter((d) => !FILL_ONLY || (startManifest.instruments[d.id]?.missing ?? 0) > 0);
  console.log(`Streamed instruments to vendor: ${defs.length}${ONLY ? ` (filter "${ONLY}")` : ""}${FILL_ONLY ? " (only those with gaps to fill)" : ""}`);

  // 1) capture URL lists
  const plan: { def: InstrumentDef; urls: string[] }[] = [];
  const allFiles = new Map<string, string>(); // rel path -> url
  for (const def of defs) {
    try {
      const urls = await captureUrls(def);
      plan.push({ def, urls });
      for (const u of urls) allFiles.set(localRelPath(u), u);
    } catch (err) {
      console.error(`  ✗ could not resolve ${def.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  const knownMissing = new Set<string>((await loadManifest()).missing ?? []);
  const pending = [...allFiles.entries()].filter(([rel, url]) => !knownMissing.has(url) && !existsSync(path.join(OUT_DIR, rel)));
  console.log(`Unique sample files: ${allFiles.size}; already present: ${allFiles.size - pending.length}; to transcode: ${pending.length}`);
  if (DRY_RUN) {
    for (const p of plan) console.log(`  ${p.def.id}: ${p.urls.length} files`);
    process.exit(0);
  }

  // 2) download (ahead, concurrent) + decode + encode (sequential, single decoder)
  const decoder = new OggOpusDecoder();
  await decoder.ready;
  let done = 0;
  let failed = 0;
  const manifest = await loadManifest();
  const missing = new Set<string>(manifest.missing ?? []);
  const t0 = Date.now();
  const queue = [...pending];
  // Downloads are started ahead of time; wrap them so an early rejection can never become an
  // unhandled rejection (which would crash the process before we get to await it).
  type Settled = { ok: true; bytes: Uint8Array } | { ok: false; error: unknown };
  const inflight = new Map<string, Promise<Settled>>();
  const prime = () => {
    while (inflight.size < DOWNLOAD_CONCURRENCY && queue.length) {
      const [rel, url] = queue.shift()!;
      inflight.set(
        rel,
        fetchBytes(url).then(
          (bytes): Settled => ({ ok: true, bytes }),
          (error): Settled => ({ ok: false, error })
        )
      );
    }
  };
  prime();
  while (inflight.size) {
    const [rel, p] = inflight.entries().next().value as [string, Promise<Settled>];
    inflight.delete(rel);
    prime();
    try {
      const settled = await p;
      if (!settled.ok) throw settled.error;
      const bytes = settled.bytes;
      const decoded = await decoder.decodeFile(bytes);
      await decoder.reset();
      if (!decoded.samplesDecoded) throw new Error("decoded 0 samples");
      const mp3 = encodeMp3(decoded.channelData, decoded.sampleRate);
      const file = path.join(OUT_DIR, rel);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, mp3);
      done++;
      if (done % 50 === 0 || done === pending.length) {
        const el = (Date.now() - t0) / 1000;
        const rate = done / el;
        const eta = Math.round((pending.length - done) / Math.max(rate, 0.01));
        console.log(`  ${done}/${pending.length} (${failed} failed) · ${rate.toFixed(1)} files/s · ETA ${eta}s`);
      }
    } catch (err) {
      if (err instanceof NotFoundError) {
        missing.add(allFiles.get(rel)!);
        console.warn(`  – ${rel}: not on the CDN (skipped, same as the browser)`);
      } else {
        failed++;
        console.error(`  ✗ ${rel}: ${err instanceof Error ? err.message : err}`);
      }
      try {
        await decoder.reset();
      } catch {
        /* ignore */
      }
    }
  }
  // 2b) fill the gaps the CDN leaves: write a substitute at every missing path so no key is ever silent
  const filled: NonNullable<Manifest["filled"]> = { ...(manifest.filled ?? {}) };
  let filledNow = 0;
  for (const { def, urls } of plan) {
    for (const url of urls) {
      if (!missing.has(url)) continue;
      const rel = localRelPath(url);
      const file = path.join(OUT_DIR, rel);
      if (existsSync(file)) continue;
      const sub = chooseSubstitute(url, urls, missing);
      if (!sub) {
        console.warn(`  – ${def.id}: no substitute for ${path.posix.basename(rel)} (no other sample of a nearby key in that folder)`);
        continue;
      }
      try {
        await mkdir(path.dirname(file), { recursive: true });
        const fromLocal = path.join(OUT_DIR, localRelPath(sub.fromUrl));
        if (sub.semitones === 0 && existsSync(fromLocal)) {
          await copyFile(fromLocal, file);
        } else {
          const bytes = await fetchBytes(sub.fromUrl);
          const decoded = await decoder.decodeFile(bytes);
          await decoder.reset();
          if (!decoded.samplesDecoded) throw new Error("decoded 0 samples");
          const shifted = sub.semitones === 0 ? decoded.channelData : resample(decoded.channelData, Math.pow(2, sub.semitones / 12));
          await writeFile(file, encodeMp3(shifted, decoded.sampleRate));
        }
        filled[url] = { from: sub.fromUrl, semitones: sub.semitones };
        filledNow++;
        console.log(`  + ${def.id}: ${path.posix.basename(rel)} ← ${path.posix.basename(localRelPath(sub.fromUrl))}${sub.semitones ? ` shifted ${sub.semitones > 0 ? "+" : ""}${sub.semitones} st` : " (copy)"}`);
      } catch (err) {
        console.error(`  ✗ ${def.id}: could not fill ${path.posix.basename(rel)}: ${err instanceof Error ? err.message : err}`);
        try {
          await decoder.reset();
        } catch {
          /* ignore */
        }
      }
    }
  }
  decoder.free();

  // 3) manifest: an instrument is done when every file it needs exists locally or is missing on the CDN itself
  manifest.kbps = KBPS;
  manifest.missing = [...missing].sort();
  manifest.filled = filled;
  let complete = 0;
  for (const { def, urls } of plan) {
    const missingHere = urls.filter((u) => missing.has(u)).length;
    const filledHere = urls.filter((u) => missing.has(u) && filled[u]).length;
    const ok = urls.every((u) => missing.has(u) || existsSync(path.join(OUT_DIR, localRelPath(u))));
    manifest.instruments[def.id] = { files: urls.length, done: ok, ...(missingHere ? { missing: missingHere } : {}), ...(filledHere ? { filled: filledHere } : {}) };
    if (ok) complete++;
  }
  await saveManifest(manifest);
  if (filledNow) console.log(`Filled ${filledNow} gap${filledNow === 1 ? "" : "s"} with substitute samples.`);

  let bytes = 0;
  for (const rel of allFiles.keys()) {
    const f = path.join(OUT_DIR, rel);
    if (existsSync(f)) bytes += (await stat(f)).size;
  }
  console.log(`\nDone: ${done} transcoded, ${failed} failed. ${complete}/${plan.length} instruments complete. ${(bytes / 1024 / 1024).toFixed(0)} MB in public/streamed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
