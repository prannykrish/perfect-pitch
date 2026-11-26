/**
 * Draws the home-screen icons into public/icons (committed): `npm run icons`.
 * Five piano keys with one lit in the app's "target" blue, on the app's dark background.
 * Uses sharp, which Next.js already installs; nothing to add to package.json.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });

/** `scale` shrinks the drawing toward the centre: a maskable icon may be cropped to a circle. */
function svg(scale) {
  const white = 62;
  const gap = 8;
  const keys = 5;
  const width = keys * white + (keys - 1) * gap;
  const height = 236;
  const x0 = (512 - width) / 2;
  const y0 = (512 - height) / 2;
  const lit = 2; // the E of C D E F G
  const whites = Array.from({ length: keys }, (_, i) => {
    const x = x0 + i * (white + gap);
    return `<rect x="${x}" y="${y0}" width="${white}" height="${height}" rx="12" fill="${i === lit ? "#3b82f6" : "#f4f4f5"}"/>`;
  }).join("");
  // black keys sit over the gaps after C, D and F
  const blacks = [0, 1, 3]
    .map((i) => {
      const cx = x0 + (i + 1) * (white + gap) - gap / 2;
      return `<rect x="${cx - 21}" y="${y0 - 2}" width="42" height="${height * 0.6}" rx="8" fill="#0a0a0a"/><rect x="${cx - 15}" y="${y0}" width="30" height="${height * 0.6 - 8}" rx="5" fill="#27272a"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0a"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${whites}${blacks}</g>
</svg>`;
}

const files = [
  ["icon-192.png", 192, 1],
  ["icon-512.png", 512, 1],
  ["icon-512-maskable.png", 512, 0.78],
  ["apple-touch-icon.png", 180, 1],
];

for (const [name, size, scale] of files) {
  await sharp(Buffer.from(svg(scale)), { density: 300 }).resize(size, size).flatten({ background: "#0a0a0a" }).png().toFile(path.join(out, name));
  console.log(`public/icons/${name}  ${size}×${size}`);
}
