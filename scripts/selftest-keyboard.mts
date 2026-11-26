/**
 * On-screen piano geometry checks (the phone's windowed keyboard): which white keys a window
 * holds, where the window may sit, and which key a finger lands on.
 *   npx tsx scripts/selftest-keyboard.mts
 */
import { clampWindowStart, keyAt, whiteAtOrAbove, whiteAtOrBelow, whiteKeysBetween, whiteKeysFrom, windowBounds } from "../src/lib/music/keyboard";
import { isBlackKey, noteName, pitchClassOf } from "../src/lib/music/notes";
import { WINDOW_WHITE_KEYS, type WindowOctaves } from "../src/lib/piano-prefs";

let failures = 0;
const check = (c: boolean, msg: string) => {
  if (!c) {
    failures++;
    console.error("  ✗", msg);
  }
};

// ----- white keys -----
check(whiteAtOrBelow(61) === 60 && whiteAtOrBelow(60) === 60, "white at or below");
check(whiteAtOrAbove(61) === 62 && whiteAtOrAbove(62) === 62, "white at or above");
check(whiteKeysBetween(21, 108).length === 52, "an 88-key piano has 52 white keys");
check(whiteKeysFrom(60, 7).join() === "60,62,64,65,67,69,71", "seven white keys from middle C");

// ----- window sizes: start on C, end on E or B, so no black key is cut at an edge -----
for (const size of [1.5, 2, 2.5] as WindowOctaves[]) {
  const count = WINDOW_WHITE_KEYS[size];
  for (let c = 12; c <= 96; c += 12) {
    const w = whiteKeysFrom(c, count);
    const last = w[w.length - 1];
    check(w.length === count && w[0] === c, `${size} octaves from ${noteName(c)}: ${count} white keys`);
    check(!isBlackKey(last + 1), `${size} octaves from ${noteName(c)} ends on ${noteName(last)}, with no black key after it`);
  }
}
check(WINDOW_WHITE_KEYS[1.5] < WINDOW_WHITE_KEYS[2] && WINDOW_WHITE_KEYS[2] < WINDOW_WHITE_KEYS[2.5], "window sizes grow");

// ----- where the window may sit -----
const ranges: [number, number][] = [
  [21, 108], // the whole piano
  [31, 108], // level 0: G1–C8
  [36, 96],
  [55, 103], // a violin
  [60, 84],
];
for (const [low, high] of ranges) {
  const { min, max } = windowBounds(low, high);
  check(pitchClassOf(min) === 0 && pitchClassOf(max) === 0, `${noteName(low)}–${noteName(high)}: both ends of the travel are Cs`);
  check(min <= low && low - min < 12, `${noteName(low)}–${noteName(high)}: the lowest window holds the lowest key`);
  check(max <= high && max >= min, `${noteName(low)}–${noteName(high)}: the highest window starts inside the range`);
  for (const size of [1.5, 2, 2.5] as WindowOctaves[]) {
    const count = WINDOW_WHITE_KEYS[size];
    // every key of the range is reachable: some window (stepping by octaves) shows it
    for (let m = low; m <= high; m++) {
      let seen = false;
      for (let s = min; s <= max; s += 12) {
        const w = whiteKeysFrom(s, count);
        if (m >= w[0] && m <= w[w.length - 1]) seen = true;
      }
      check(seen, `${noteName(low)}–${noteName(high)}, ${size} octaves: ${noteName(m)} is in some window`);
    }
    // the highest window is not empty space: it shows at least one key of the range past its first
    const top = whiteKeysFrom(max, count);
    check(top[0] <= high, `${noteName(low)}–${noteName(high)}, ${size} octaves: the top window shows the top of the range`);
  }
  // clamping: any stored value lands on a C inside the travel; an in-range C is kept
  for (const stored of [-5, 0, 13, 47, 48, 49, 53, 54, 107, 200]) {
    const c = clampWindowStart(stored, low, high);
    check(pitchClassOf(c) === 0 && c >= min && c <= max, `${noteName(low)}–${noteName(high)}: stored ${stored} clamps to a C in range (got ${c})`);
  }
  for (let c = min; c <= max; c += 12) check(clampWindowStart(c, low, high) === c, `${noteName(low)}–${noteName(high)}: ${noteName(c)} stays put`);
}
check(clampWindowStart(53, 21, 108) === 48 && clampWindowStart(54, 21, 108) === 60, "a dragged window settles on the nearest C");
check(clampWindowStart(48 + 12, 21, 108) === 60 && clampWindowStart(96 + 12, 21, 108) === 96 && clampWindowStart(12 - 12, 21, 108) === 12, "octave arrows step by a C and stop at the ends");

// ----- which key a finger lands on -----
{
  const W = 25; // two octaves across a 350 px phone
  const H = 150;
  const BH = Math.round(H * 0.62);
  const whites = whiteKeysFrom(60, 14);
  // the bottom strip of every white key is that white key, edge to edge
  whites.forEach((m, i) => {
    for (const fx of [0.5, W / 2, W - 0.5]) check(keyAt(whites, W, BH, i * W + fx, H - 5) === m, `bottom of ${noteName(m)} at +${fx}px`);
  });
  // the centre of every drawn black key is that black key
  for (let i = 0; i < whites.length - 1; i++) {
    if (whites[i + 1] - whites[i] !== 2) continue;
    const black = whites[i] + 1;
    const cx = (i + 1) * W;
    check(keyAt(whites, W, BH, cx, 10) === black, `centre of ${noteName(black)}`);
    check(keyAt(whites, W, BH, cx - W * 0.3, 10) === black && keyAt(whites, W, BH, cx + W * 0.3, 10) === black, `${noteName(black)} reaches a finger's width either side`);
    check(keyAt(whites, W, BH, cx, BH + 2) !== black, `below ${noteName(black)} is a white key`);
  }
  // E–F and B–C have no black key between them: the boundary stays white all the way up
  for (let i = 0; i < whites.length - 1; i++) {
    if (whites[i + 1] - whites[i] !== 1) continue;
    const x = (i + 1) * W;
    check(keyAt(whites, W, BH, x - 1, 5) === whites[i] && keyAt(whites, W, BH, x + 1, 5) === whites[i + 1], `no black key between ${noteName(whites[i])} and ${noteName(whites[i + 1])}`);
  }
  // the middle of a white key's top is still that white key (D, G, A sit between two black keys)
  whites.forEach((m, i) => check(keyAt(whites, W, BH, i * W + W / 2, 5) === m, `top middle of ${noteName(m)}`));
  // the window's edges never invent a key outside it
  check(keyAt(whites, W, BH, 0, 5) === whites[0] && keyAt(whites, W, BH, 14 * W - 0.1, 5) === whites[13], "the edges of the window are its first and last white keys");
  check(keyAt(whites, W, BH, -20, 5) === whites[0] && keyAt(whites, W, BH, 9999, 5) === whites[13], "a touch outside lands on the nearest edge key");
  // every key of the window can be hit somewhere
  const hit = new Set<number>();
  for (let x = 0; x < 14 * W; x += 0.5) for (const y of [5, H - 5]) hit.add(keyAt(whites, W, BH, x, y));
  for (let m = whites[0]; m <= whites[13]; m++) check(hit.has(m), `${noteName(m)} can be hit`);
  check(hit.size === 24, `two octaves from C hold 24 keys (hit ${hit.size})`);
}

if (failures) {
  console.error(`keyboard self-test: ${failures} failure(s)`);
  process.exit(1);
}
console.log("keyboard self-test: ok (window sizes, travel, clamping, finger hit-testing)");
