/**
 * smplr's CDN-hosted instruments (Steinway, e-pianos, mallets, Versilian, Mellotron, double bass)
 * ship every sample as Ogg **Opus** (.ogg) and AAC (.m4a). Some browsers decode neither, and some
 * environments cannot reach the CDN. We probe once, using local copies of one sample and one real
 * CDN fetch, so we know (a) which format to request and (b) whether streamed instruments work at all.
 */
import type { Storage } from "smplr";

export type SampleFormat = "ogg" | "m4a";

export interface ProbeResult {
  ok: boolean;
  /** True when the probe was not run because a working format is already known. Not a failure. */
  skipped?: boolean;
  status?: number;
  contentType?: string;
  bytes?: number;
  head?: string;
  error?: string;
  ms?: number;
}

export interface SampleCapability {
  status: "ok" | "unavailable";
  /** Format to request from the CDN, or null when nothing decodes. */
  format: SampleFormat | null;
  localOpus: ProbeResult;
  localAac: ProbeResult;
  cdn: ProbeResult & { url?: string };
  userAgent: string;
  detail: string;
  checkedAt: number;
}

const LOCAL_PROBES: Record<SampleFormat, string> = {
  ogg: "/probe/opus.ogg",
  m4a: "/probe/aac.m4a",
};

const CDN_PROBES: Record<SampleFormat, string> = {
  ogg: "https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples/Mp%20E3.ogg",
  m4a: "https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples/Mp%20E3.m4a",
};

const STORAGE_KEY = "pp-sample-format-v2";

function decodeContext(): BaseAudioContext {
  // OfflineAudioContext decodes without a user gesture and without the autoplay warning.
  return new OfflineAudioContext(1, 1, 44100);
}

function headOf(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes.slice(0, 12));
  let s = "";
  for (const b of view) s += b >= 32 && b < 127 ? String.fromCharCode(b) : ".";
  return s;
}

async function probe(fetcher: () => Promise<{ status: number; headers?: Headers; arrayBuffer(): Promise<ArrayBuffer> }>): Promise<ProbeResult> {
  const t0 = performance.now();
  const r: ProbeResult = { ok: false };
  try {
    const res = await fetcher();
    r.status = res.status;
    r.contentType = res.headers?.get("content-type") ?? undefined;
    const bytes = await res.arrayBuffer();
    r.bytes = bytes.byteLength;
    r.head = headOf(bytes);
    if (res.status >= 400) {
      r.error = `HTTP ${res.status}`;
      return r;
    }
    if (!bytes.byteLength) {
      r.error = "empty response";
      return r;
    }
    await decodeContext().decodeAudioData(bytes.slice(0));
    r.ok = true;
  } catch (err) {
    r.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    r.ms = Math.round(performance.now() - t0);
  }
  return r;
}

function readCachedFormat(): SampleFormat | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "ogg" || v === "m4a" ? v : null;
  } catch {
    return null;
  }
}

export function clearCachedFormat() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Full capability check. Fast path: if a format was cached from a previous successful check, only
 * the local decode for that format is re-verified (cheap, 110 KB from localhost).
 */
export async function detectSampleCapability(storage: Storage, opts: { force?: boolean } = {}): Promise<SampleCapability> {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const cached = opts.force ? null : readCachedFormat();

  const localOpus: ProbeResult =
    cached && cached !== "ogg" ? { ok: false, skipped: true, error: "not needed, AAC already works here" } : await probe(() => fetch(LOCAL_PROBES.ogg));
  const localAac: ProbeResult =
    cached && cached !== "m4a" ? { ok: false, skipped: true, error: "not needed, Opus already works here" } : await probe(() => fetch(LOCAL_PROBES.m4a));

  // Prefer Opus (smaller files); fall back to AAC.
  const format: SampleFormat | null = localOpus.ok ? "ogg" : localAac.ok ? "m4a" : null;

  let cdn: SampleCapability["cdn"] = { ok: false, skipped: true, error: "skipped (no decodable format)" };
  if (format) {
    if (cached === format) {
      cdn = { ok: true, skipped: true, error: "verified on an earlier visit", url: CDN_PROBES[format] };
    } else {
      const url = CDN_PROBES[format];
      cdn = { ...(await probe(() => storage.fetch(url) as Promise<Response>)), url };
    }
  }

  const status: SampleCapability["status"] = format && cdn.ok ? "ok" : "unavailable";
  let detail: string;
  if (status === "ok") {
    detail = `Streamed instruments available (${format === "ogg" ? "Opus" : "AAC"}).`;
  } else if (!format) {
    detail = `This browser decodes neither Ogg Opus (${localOpus.error}) nor AAC (${localAac.error}). Only the local MP3 instruments and synths are available.`;
  } else {
    detail = `Decoding works locally but the sample CDN failed: ${cdn.error ?? "unknown"}${cdn.contentType ? ` (content-type ${cdn.contentType})` : ""}. Check network / content filters.`;
  }

  if (status === "ok" && format) {
    try {
      localStorage.setItem(STORAGE_KEY, format);
    } catch {
      /* ignore */
    }
  } else {
    clearCachedFormat();
  }

  return { status, format, localOpus, localAac, cdn, userAgent, detail, checkedAt: Date.now() };
}

/** Wraps a smplr Storage so every .ogg/.m4a sample URL is fetched in `format`, falling back to the original URL. */
export function withSampleFormat(inner: Storage, format: SampleFormat): Storage {
  return {
    async fetch(url: string) {
      const match = url.match(/\.(ogg|m4a)$/i);
      if (!match || match[1].toLowerCase() === format) return inner.fetch(url);
      const rewritten = url.slice(0, -match[1].length) + format;
      const res = await inner.fetch(rewritten);
      if (res.status >= 200 && res.status < 400) return res;
      return inner.fetch(url);
    },
  };
}

export function otherFormat(format: SampleFormat): SampleFormat {
  return format === "ogg" ? "m4a" : "ogg";
}
