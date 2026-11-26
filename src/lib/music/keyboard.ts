/**
 * Pure geometry for the on-screen piano: which white keys a stretch of keyboard holds, where the
 * phone's window may sit, and which key is under a finger. No DOM, so `npm run selftest` covers it.
 */
import { isBlackKey } from "./notes";

export function whiteAtOrBelow(midi: number): number {
  return isBlackKey(midi) ? midi - 1 : midi;
}

export function whiteAtOrAbove(midi: number): number {
  return isBlackKey(midi) ? midi + 1 : midi;
}

/** `count` white keys going up from `first` (a white key). */
export function whiteKeysFrom(first: number, count: number): number[] {
  const out: number[] = [];
  for (let m = whiteAtOrBelow(first); out.length < count; m++) if (!isBlackKey(m)) out.push(m);
  return out;
}

/** Every white key from `first` to `last` inclusive. */
export function whiteKeysBetween(first: number, last: number): number[] {
  const out: number[] = [];
  for (let m = first; m <= last; m++) if (!isBlackKey(m)) out.push(m);
  return out;
}

/**
 * Where the phone's window may sit on a keyboard of low..high. The left edge is always a C: from
 * the C at or below the lowest key to the last C that still has a key of the range beside it.
 */
export function windowBounds(low: number, high: number): { min: number; max: number } {
  const min = Math.floor(low / 12) * 12;
  const max = Math.max(min, Math.floor((high - 1) / 12) * 12);
  return { min, max };
}

/** Snap a left edge to the nearest C and keep it on the keyboard. */
export function clampWindowStart(start: number, low: number, high: number): number {
  const { min, max } = windowBounds(low, high);
  return Math.min(max, Math.max(min, Math.round(start / 12) * 12));
}

/**
 * The key under a point (px from the keyboard's top-left corner). `whites` are the white keys
 * drawn, each `whiteWidth` wide. Black keys are drawn 0.6 of a white key wide, but a finger gets
 * 0.76: the strip between two white keys' centres belongs to the black key above them.
 */
export function keyAt(whites: number[], whiteWidth: number, blackHeight: number, x: number, y: number): number {
  const i = Math.min(whites.length - 1, Math.max(0, Math.floor(x / whiteWidth)));
  const white = whites[i];
  if (y < blackHeight) {
    const fromLeft = x - i * whiteWidth;
    const reach = whiteWidth * 0.38;
    if (fromLeft < reach && i > 0 && white - whites[i - 1] === 2) return white - 1;
    if (whiteWidth - fromLeft <= reach && i < whites.length - 1 && whites[i + 1] - white === 2) return white + 1;
  }
  return white;
}
