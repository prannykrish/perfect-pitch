/**
 * What kind of device the audio is running on. Client-only: call from effects and handlers.
 *
 * The phone differs from the laptop in three ways the engine cares about:
 * - memory: a decoded GM instrument is tens of megabytes, and a phone browser kills a tab that
 *   holds a dozen of them;
 * - the ring/silent switch: iOS treats Web Audio as "ambient" sound, which that switch mutes,
 *   unless the page asks for the "playback" audio session (Safari 16.4+);
 * - the browser suspends the AudioContext whenever the page leaves the screen.
 */

/** iPhone, iPod, or an iPad (which reports itself as a Mac with a touch screen). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** A phone or tablet: no mouse to hover with. Keeps fewer instruments in memory. */
export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;
}

interface AudioSessionLike {
  type: string;
}

function audioSession(): AudioSessionLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession ?? null;
}

/** True where the page can choose its audio session (iOS / iPadOS 16.4 and later). */
export function hasAudioSession(): boolean {
  return audioSession() !== null;
}

/**
 * "playback" = sound like a music app: it plays with the silent switch on. "auto" = the browser's
 * default, which on an iPhone the silent switch mutes. Returns whether the choice was applied.
 */
export function applyAudioSession(playWhenSilent: boolean): boolean {
  const session = audioSession();
  if (!session) return false;
  try {
    session.type = playWhenSilent ? "playback" : "auto";
    return true;
  } catch {
    return false;
  }
}
