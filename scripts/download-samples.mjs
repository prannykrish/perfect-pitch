#!/usr/bin/env node
/**
 * Downloads General MIDI soundfont instruments (pre-rendered by Benjamin Gleitzman,
 * https://github.com/gleitz/midi-js-soundfonts) into public/soundfonts so the app
 * works offline and does not depend on GitHub Pages being up.
 *
 * Usage:
 *   node scripts/download-samples.mjs                 # FluidR3_GM, mp3, all 128 instruments
 *   node scripts/download-samples.mjs --kit MusyngKite # higher quality, much larger
 *   node scripts/download-samples.mjs --kit all
 *   node scripts/download-samples.mjs --format ogg
 *   node scripts/download-samples.mjs --only marimba,violin,cello
 *
 * Files are skipped if they already exist. A manifest.json is written listing what is local.
 */
import { mkdir, writeFile, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "soundfonts");
const BASE = "https://gleitz.github.io/midi-js-soundfonts";
const KITS = ["FluidR3_GM", "MusyngKite"];

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
const kitArg = flag("kit", "FluidR3_GM");
const format = flag("format", "mp3");
const only = flag("only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const concurrency = Number(flag("concurrency", "6"));
const kits = kitArg === "all" ? KITS : [kitArg];

for (const kit of kits) {
  if (!KITS.includes(kit)) {
    console.error(`Unknown kit "${kit}". Use one of: ${KITS.join(", ")}, all`);
    process.exit(1);
  }
}

async function fetchWithRetry(url, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function downloadKit(kit) {
  const kitDir = path.join(OUT_DIR, kit);
  await mkdir(kitDir, { recursive: true });

  const namesRes = await fetchWithRetry(`${BASE}/${kit}/names.json`);
  /** @type {string[]} */
  let names = await namesRes.json();
  if (only.length) names = names.filter((n) => only.includes(n));

  console.log(`\n${kit}: ${names.length} instruments (${format})`);
  let done = 0;
  let skipped = 0;
  let failed = [];
  const queue = [...names];

  async function worker() {
    while (queue.length) {
      const name = queue.shift();
      const file = path.join(kitDir, `${name}-${format}.js`);
      if (existsSync(file)) {
        const s = await stat(file);
        if (s.size > 1000) {
          skipped++;
          continue;
        }
      }
      try {
        const res = await fetchWithRetry(`${BASE}/${kit}/${name}-${format}.js`);
        const text = await res.text();
        if (!text.includes("MIDI.Soundfont.")) throw new Error("unexpected file content");
        await writeFile(file, text, "utf8");
        done++;
        const mb = (text.length / 1024 / 1024).toFixed(1);
        console.log(`  ✓ ${name} (${mb} MB)  [${done + skipped}/${names.length}]`);
      } catch (err) {
        failed.push(name);
        console.error(`  ✗ ${name}: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`${kit}: downloaded ${done}, already present ${skipped}, failed ${failed.length}`);
  if (failed.length) console.log(`  failed: ${failed.join(", ")}`);
}

async function writeManifest() {
  const manifest = { generatedAt: new Date().toISOString(), kits: {} };
  for (const kit of KITS) {
    const kitDir = path.join(OUT_DIR, kit);
    if (!existsSync(kitDir)) continue;
    const files = await readdir(kitDir);
    const byFormat = {};
    for (const f of files) {
      const m = f.match(/^(.+)-(mp3|ogg)\.js$/);
      if (!m) continue;
      (byFormat[m[2]] ??= []).push(m[1]);
    }
    for (const list of Object.values(byFormat)) list.sort();
    manifest.kits[kit] = byFormat;
  }
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  const total = Object.values(manifest.kits).reduce(
    (n, k) => n + Object.values(k).reduce((m, l) => m + l.length, 0),
    0
  );
  console.log(`\nmanifest.json written (${total} instrument files local)`);
}

for (const kit of kits) await downloadKit(kit);
await writeManifest();
