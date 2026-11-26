/**
 * The password gate of the hosted app: one shared password (APP_PASSWORD), remembered on a device
 * by a cookie. The cookie holds an HMAC keyed by the password, so it proves the password was
 * entered without containing it, and changing the password signs every device out.
 *
 * With APP_PASSWORD unset (the laptop's `npm run dev` without it) there is no gate.
 *
 * Web Crypto only, so the same code runs in the proxy, in server actions and in scripts.
 */

export const GATE_COOKIE = "pp_gate";
/** A year, in seconds. */
export const GATE_MAX_AGE = 60 * 60 * 24 * 365;

const MESSAGE = "perfect-pitch-lab:gate:v1";

export function gatePassword(): string | null {
  const p = process.env.APP_PASSWORD;
  return p ? p : null;
}

export function gateIsOn(): boolean {
  return gatePassword() !== null;
}

export async function gateToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(MESSAGE));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares without stopping at the first difference. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Does this cookie value open the gate? Always true when there is no gate. */
export async function isUnlocked(cookieValue: string | undefined | null): Promise<boolean> {
  const password = gatePassword();
  if (!password) return true;
  if (!cookieValue) return false;
  return sameString(cookieValue, await gateToken(password));
}

/** Is this the password? Both sides go through the HMAC first, so their lengths give nothing away. */
export async function passwordMatches(attempt: string): Promise<boolean> {
  const password = gatePassword();
  if (!password) return true;
  if (!attempt) return false; // an empty field; HMAC also refuses an empty key
  return sameString(await gateToken(attempt), await gateToken(password));
}

/** Where to go after unlocking: only a path inside this app. */
export function safeNextPath(next: string | undefined | null, fallback = "/trainer"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/unlock")) return fallback;
  return next;
}
