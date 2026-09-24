/**
 * Audio engine: one AudioContext, an LRU cache of loaded instruments, and helpers to
 * play single notes, sequences and chords with sample-accurate scheduling.
 *
 * Client-only. Import lazily from client components.
 */
import {
  CacheStorage,
  ElectricPiano,
  HttpStorage,
  Mallet,
  Mellotron,
  Smolken,
  Soundfont,
  SplendidGrandPiano,
  Versilian,
  type Storage,
} from "smplr";
import { create } from "zustand";
import { getInstrument, type InstrumentDef } from "./instruments";
import { SynthInstrument } from "./synth";
import { clearCachedFormat, detectSampleCapability, otherFormat, withSampleFormat, type SampleCapability, type SampleFormat } from "./sample-format";

export interface NoteEventIn {
  note: number; // midi
  velocity?: number;
  time?: number; // absolute AudioContext time
  duration?: number | null;
  detune?: number; // cents
}

/** The subset of smplr's instrument API the engine relies on. */
export interface Playable {
  start(ev: NoteEventIn): (time?: number) => void;
  stop(): void;
  ready: Promise<void>;
  dispose(): void;
}

interface CacheEntry {
  def: InstrumentDef;
  promise: Promise<Playable>;
  instance?: Playable;
  lastUsed: number;
  loaded: boolean;
}

interface Manifest {
  kits: Record<string, Record<string, string[]>>;
}

/** Written by scripts/vendor-streamed.ts: which streamed instruments exist locally as mp3. */
interface StreamedManifest {
  instruments: Record<string, { files: number; done: boolean }>;
}

const CDN_PREFIX = "https://smpldsnds.github.io/";

/** CDN sample URL -> local vendored mp3 path (mirrors localRelPath in scripts/vendor-streamed.ts). */
export function localPathFor(url: string): string | null {
  if (!url.startsWith(CDN_PREFIX)) return null;
  return "/streamed/" + url.slice(CDN_PREFIX.length).replace(/\.(ogg|m4a)$/i, ".mp3");
}

/** Storage that serves vendored local mp3 files first and falls back to the CDN. */
function withLocalMirror(inner: Storage): Storage {
  return {
    async fetch(url: string) {
      const local = localPathFor(url);
      if (!local) return inner.fetch(url);
      try {
        const res = await fetch(local);
        if (res.ok) return res;
      } catch {
        /* fall through to CDN */
      }
      return inner.fetch(url);
    },
  };
}

export interface LoadingState {
  /** Instrument ids currently loading. */
  loading: string[];
  /** Instrument ids fully loaded and in memory. */
  loaded: string[];
  lastError: string | null;
  /** Result of the streamed-samples capability check; null until it has run. */
  samples: SampleCapability | null;
  samplesChecking: boolean;
  /** Streamed instrument ids that exist locally as mp3 (npm run samples:streamed). */
  vendored: string[];
}

export const useEngineStore = create<LoadingState>(() => ({
  loading: [],
  loaded: [],
  lastError: null,
  samples: null,
  samplesChecking: false,
  vendored: [],
}));

/** True for instruments that stream individual samples from smplr's CDN (not local soundfonts or synths). */
export function isStreamedInstrument(def: InstrumentDef): boolean {
  return def.source.kind !== "soundfont" && def.source.kind !== "synth";
}

/**
 * Can this instrument play here? Local soundfonts and synths always can. Streamed ones can when they
 * are vendored locally, or when the browser can decode and reach the CDN.
 */
export function isInstrumentAvailable(def: InstrumentDef, state: Pick<LoadingState, "samples" | "vendored"> = useEngineStore.getState()): boolean {
  if (!isStreamedInstrument(def)) return true;
  if (state.vendored.includes(def.id)) return true;
  return state.samples?.status !== "unavailable";
}

const MAX_LOADED = 14;

class Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cache = new Map<string, CacheEntry>();
  private storage: Storage | null = null;
  private sampleSetup: Promise<{ storage: Storage; format: SampleFormat | null; capability: SampleCapability }> | null = null;
  private manifest: Promise<Manifest | null> | null = null;
  private streamedManifest: Promise<StreamedManifest | null> | null = null;

  get context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  get destination(): AudioNode {
    void this.context; // ensures the context and master gain exist
    return this.master!;
  }

  get currentTime(): number {
    return this.context.currentTime;
  }

  /** Must be called from a user gesture at least once so the browser lets audio play. */
  async resume(): Promise<void> {
    const ctx = this.context;
    if (ctx.state !== "running") await ctx.resume();
  }

  setVolume(v: number) {
    void this.destination;
    this.master!.gain.value = Math.max(0, Math.min(1, v));
  }

  private getStorage(): Storage {
    if (this.storage) return this.storage;
    try {
      this.storage = typeof caches !== "undefined" ? CacheStorage("perfect-pitch-samples") : HttpStorage;
    } catch {
      this.storage = HttpStorage;
    }
    return this.storage;
  }

  /** Storage for CDN-hosted sample sets, with sample URLs rewritten to a format this browser can decode. */
  private getSampleSetup(force = false): Promise<{ storage: Storage; format: SampleFormat | null; capability: SampleCapability }> {
    if (!this.sampleSetup || force) {
      const base = this.getStorage();
      if (force) clearCachedFormat();
      useEngineStore.setState({ samplesChecking: true });
      this.sampleSetup = detectSampleCapability(base, { force })
        .then((capability) => {
          useEngineStore.setState({ samples: capability, samplesChecking: false });
          return {
            capability,
            format: capability.format,
            storage: capability.format ? withSampleFormat(base, capability.format) : base,
          };
        })
        .catch((err) => {
          useEngineStore.setState({ samplesChecking: false });
          this.sampleSetup = null;
          throw err;
        });
    }
    return this.sampleSetup;
  }

  private getStreamedManifest(): Promise<StreamedManifest | null> {
    if (!this.streamedManifest) {
      this.streamedManifest = fetch("/streamed/manifest.json")
        .then((r) => (r.ok ? (r.json() as Promise<StreamedManifest>) : null))
        .then((m) => {
          const vendored = m ? Object.entries(m.instruments).filter(([, v]) => v.done).map(([id]) => id) : [];
          useEngineStore.setState({ vendored });
          return m;
        })
        .catch(() => null);
    }
    return this.streamedManifest;
  }

  private async isVendored(id: string): Promise<boolean> {
    const m = await this.getStreamedManifest();
    return m?.instruments?.[id]?.done === true;
  }

  /** Run (or re-run) the streamed-samples check and load the vendored manifest. Safe before any user gesture. */
  checkSamples(force = false): Promise<SampleCapability> {
    if (force) this.streamedManifest = null;
    return Promise.all([this.getSampleSetup(force), this.getStreamedManifest()]).then(([s]) => s.capability);
  }

  private getManifest(): Promise<Manifest | null> {
    if (!this.manifest) {
      this.manifest = fetch("/soundfonts/manifest.json")
        .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
        .catch(() => null);
    }
    return this.manifest;
  }

  private async create(def: InstrumentDef): Promise<Playable> {
    const ctx = this.context;
    const destination = this.destination;
    const src = def.source;
    if (src.kind === "synth") return new SynthInstrument(ctx, src.preset, destination);
    if (src.kind === "soundfont") {
      // Local (or gleitz CDN) MIDI.js soundfont: base64 mp3 inside a .js file, decoded by smplr.
      const storage = this.getStorage();
      const kit = def.id.startsWith("mk:") ? "MusyngKite" : "FluidR3_GM";
      const manifest = await this.getManifest();
      const local = manifest?.kits?.[kit];
      const format = local?.mp3?.includes(src.name) ? "mp3" : local?.ogg?.includes(src.name) ? "ogg" : null;
      const opts = format
        ? { instrumentUrl: `/soundfonts/${kit}/${src.name}-${format}.js`, storage, destination }
        : { kit, instrument: src.name, storage, destination };
      const inst = Soundfont(ctx, opts);
      await inst.ready;
      return inst;
    }
    // Everything else streams individual .ogg/.m4a samples from smplr's CDN, unless vendored locally as mp3.
    let storage: Storage;
    let formats: string[];
    if (await this.isVendored(def.id)) {
      storage = withLocalMirror(this.getStorage());
      formats = ["ogg", "m4a"]; // extension only affects the URL we rewrite; local files are mp3
    } else {
      const setup = await this.getSampleSetup();
      if (!setup.format || setup.capability.status !== "ok") {
        throw new Error(
          `${def.label} streams from the CDN and cannot play in this browser. ${setup.capability.detail} Run "npm run samples:streamed" to vendor it locally as mp3.`
        );
      }
      storage = setup.storage;
      formats = [setup.format, otherFormat(setup.format)];
    }
    switch (src.kind) {
      case "splendid": {
        const inst = SplendidGrandPiano(ctx, { storage, destination, formats });
        await inst.ready;
        return inst;
      }
      case "epiano": {
        const inst = ElectricPiano(ctx, { instrument: src.name, storage, destination, formats });
        await inst.ready;
        return inst;
      }
      case "mallet": {
        const inst = Mallet(ctx, { instrument: src.name, storage, destination });
        await inst.ready;
        return inst;
      }
      case "versilian": {
        const inst = Versilian(ctx, { instrument: src.name, storage, destination });
        await inst.ready;
        return inst;
      }
      case "mellotron": {
        const inst = Mellotron(ctx, { instrument: src.name, storage, destination });
        await inst.ready;
        return inst;
      }
      case "smolken": {
        const inst = Smolken(ctx, { instrument: src.name, storage, destination });
        await inst.ready;
        return inst;
      }
    }
  }

  private publish() {
    const loading: string[] = [];
    const loaded: string[] = [];
    for (const [id, e] of this.cache) (e.loaded ? loaded : loading).push(id);
    useEngineStore.setState({ loading, loaded });
  }

  private evict() {
    const loadedEntries = [...this.cache.entries()].filter(([, e]) => e.loaded);
    if (loadedEntries.length <= MAX_LOADED) return;
    loadedEntries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const excess = loadedEntries.length - MAX_LOADED;
    for (let i = 0; i < excess; i++) {
      const [id, e] = loadedEntries[i];
      try {
        e.instance?.dispose();
      } catch {
        /* ignore */
      }
      this.cache.delete(id);
    }
  }

  isLoaded(id: string): boolean {
    return this.cache.get(id)?.loaded ?? false;
  }

  /** Load (or fetch from cache) an instrument. Safe to call repeatedly. */
  load(id: string): Promise<Playable> {
    const existing = this.cache.get(id);
    if (existing) {
      existing.lastUsed = performance.now();
      return existing.promise;
    }
    const def = getInstrument(id);
    if (!def) return Promise.reject(new Error(`Unknown instrument ${id}`));
    const entry: CacheEntry = {
      def,
      lastUsed: performance.now(),
      loaded: false,
      promise: Promise.resolve().then(() => this.create(def)),
    };
    this.cache.set(id, entry);
    this.publish();
    entry.promise
      .then((inst) => {
        entry.instance = inst;
        entry.loaded = true;
        entry.lastUsed = performance.now();
        this.evict();
        this.publish();
      })
      .catch((err) => {
        this.cache.delete(id);
        useEngineStore.setState({ lastError: `${def.label}: ${err?.message ?? err}` });
        this.publish();
      });
    return entry.promise;
  }

  /** Kick off loads in the background without awaiting them. */
  warm(ids: string[]) {
    for (const id of ids) this.load(id).catch(() => {});
  }

  /** Play one note. Resolves once the instrument is loaded and the note is scheduled. */
  async playNote(
    instrumentId: string,
    midi: number,
    opts: { duration?: number; velocity?: number; detune?: number; at?: number } = {}
  ): Promise<void> {
    await this.resume();
    const inst = await this.load(instrumentId);
    const time = this.currentTime + (opts.at ?? 0) + 0.02;
    inst.start({
      note: midi,
      velocity: opts.velocity ?? 100,
      time,
      duration: opts.duration ?? 1.5,
      detune: opts.detune ?? 0,
    });
  }

  /**
   * Play several notes with relative offsets (seconds). Notes may use different instruments.
   * Returns the total duration in seconds.
   */
  async playNotes(
    notes: { instrumentId: string; midi: number; at: number; duration?: number; velocity?: number; detune?: number }[]
  ): Promise<number> {
    await this.resume();
    const ids = [...new Set(notes.map((n) => n.instrumentId))];
    const insts = new Map(await Promise.all(ids.map(async (id) => [id, await this.load(id)] as const)));
    const base = this.currentTime + 0.05;
    let end = 0;
    for (const n of notes) {
      const dur = n.duration ?? 1.5;
      insts.get(n.instrumentId)!.start({
        note: n.midi,
        velocity: n.velocity ?? 100,
        time: base + n.at,
        duration: dur,
        detune: n.detune ?? 0,
      });
      end = Math.max(end, n.at + dur);
    }
    return end;
  }

  stopAll() {
    for (const e of this.cache.values()) {
      try {
        e.instance?.stop();
      } catch {
        /* ignore */
      }
    }
  }
}

let engine: Engine | null = null;
export function getEngine(): Engine {
  if (typeof window === "undefined") throw new Error("Audio engine is client-only");
  if (!engine) engine = new Engine();
  return engine;
}
