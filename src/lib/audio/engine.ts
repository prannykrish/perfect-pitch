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
import { getInstrument, instrumentLabel, type InstrumentDef } from "./instruments";
import { SynthInstrument } from "./synth";
import { clearCachedFormat, detectSampleCapability, otherFormat, withSampleFormat, type SampleCapability, type SampleFormat } from "./sample-format";
import { useAudioPrefs } from "./prefs";
import { applyAudioSession, isTouchDevice } from "./device";
import { midiToFrequency, noteName } from "@/lib/music/notes";

/**
 * The free GM piano's samples from A0 to G♭1 have their fundamental 36–41 dB below the overtones
 * (measured with scripts/measure-tuning.mjs; from G1 up it is within 7 dB), so those keys sound
 * like the octave above with a fifth on top and the octave is hard to place. These ids get a sine
 * at the fundamental added underneath for those keys only.
 */
const REINFORCED_PIANOS = new Set(["gm:acoustic_grand_piano", "gm:bright_acoustic_piano"]);
const REINFORCE_BELOW_MIDI = 31; // G1
/** Peak gain at full velocity: about 8 dB under the sample's strongest overtone after its 5× soundfont gain. */
const REINFORCE_GAIN = 0.06;

export interface NoteEventIn {
  note: number; // midi
  velocity?: number;
  time?: number; // absolute AudioContext time
  duration?: number | null;
  detune?: number; // cents
  /**
   * Called when a voice really starts. smplr silently skips a note it has no sample for, so this
   * is the only way to know a note made sound.
   */
  onStart?: () => void;
}

/** Emitted when a playback produced no sound at all on one or more instruments. */
export interface SilenceEvent {
  instrumentIds: string[];
  notes: number[];
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

/** The public home of the General MIDI soundfonts; `npm run samples` downloads these same files. */
const GM_CDN = "https://gleitz.github.io/midi-js-soundfonts";

/**
 * Where the sample folders are served from. "" means this site's own /soundfonts and /streamed
 * (the laptop, after `npm run samples`). Naming a bucket here later puts the streamed sets on the
 * phone without a code change (PLAN 8c).
 */
const SAMPLE_BASE = (process.env.NEXT_PUBLIC_SAMPLE_BASE ?? "").replace(/\/+$/, "");
/**
 * Does this build have the sample folders next to it? next.config.ts looks at build time. The
 * hosted app does not (they are 800 MB and stay out of git), and then it does not ask for them at
 * all: the GM instruments come straight from the public CDN and are kept by the browser's cache.
 */
const HAS_LOCAL_SOUNDFONTS = SAMPLE_BASE !== "" || process.env.NEXT_PUBLIC_LOCAL_SOUNDFONTS === "1";
const HAS_LOCAL_STREAMED = SAMPLE_BASE !== "" || process.env.NEXT_PUBLIC_LOCAL_STREAMED === "1";

/**
 * On a phone the streamed sets (Steinway, e-pianos, mallets, orchestral, Mellotron, double bass)
 * are left out unless an mp3 copy is served (the laptop over Wi‑Fi, or a bucket later). Safari
 * could decode the CDN's AAC files, but each set is hundreds of megabytes once decoded and a phone
 * browser kills the tab; the 128 GM instruments and the synths are the phone's instruments.
 */
function phoneCapability(): SampleCapability {
  const skipped = { ok: false, skipped: true, error: "not checked on a phone" };
  return {
    status: "unavailable",
    reason: "phone",
    format: null,
    localOpus: skipped,
    localAac: skipped,
    cdn: skipped,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    detail: "On a phone the app plays the 128 General MIDI instruments and the synths. The streamed sets (Steinway, electric pianos, mallets, orchestral, Mellotron, double bass) stay on the laptop.",
    checkedAt: Date.now(),
  };
}

/** CDN sample URL -> local vendored mp3 path (mirrors localRelPath in scripts/vendor-streamed.ts). */
export function localPathFor(url: string): string | null {
  if (!url.startsWith(CDN_PREFIX)) return null;
  return SAMPLE_BASE + "/streamed/" + url.slice(CDN_PREFIX.length).replace(/\.(ogg|m4a)$/i, ".mp3");
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
  /**
   * Instruments dropped for this session because they failed to load, loaded but made no sound,
   * or went silent while playing. Id → reason. Random pools skip them.
   */
  broken: Record<string, string>;
}

export const useEngineStore = create<LoadingState>(() => ({
  loading: [],
  loaded: [],
  lastError: null,
  samples: null,
  samplesChecking: false,
  vendored: [],
  broken: {},
}));

/** True for instruments that stream individual samples from smplr's CDN (not local soundfonts or synths). */
export function isStreamedInstrument(def: InstrumentDef): boolean {
  return def.source.kind !== "soundfont" && def.source.kind !== "synth";
}

/**
 * Can this instrument play here? Local soundfonts and synths always can. Streamed ones can when they
 * are vendored locally, or when the browser can decode and reach the CDN. Anything that has proved
 * broken this session (failed to load, or made no sound) is out regardless.
 */
export function isInstrumentAvailable(def: InstrumentDef, state: Pick<LoadingState, "samples" | "vendored"> & Partial<Pick<LoadingState, "broken">> = useEngineStore.getState()): boolean {
  if (state.broken?.[def.id]) return false;
  if (!isStreamedInstrument(def)) return true;
  if (state.vendored.includes(def.id)) return true;
  return state.samples?.status !== "unavailable";
}

/**
 * Instruments kept decoded in memory. One GM instrument is about 97 MB once decoded (88 notes,
 * 275 s of stereo float samples; measured), so a phone browser would kill the tab long before 14.
 * The quiz pools shrink to match (use-quiz.ts).
 */
const MAX_LOADED = 14;
const MAX_LOADED_TOUCH = 4;
export function maxLoadedInstruments(): number {
  return isTouchDevice() ? MAX_LOADED_TOUCH : MAX_LOADED;
}

/** One scheduled playback: which instruments were asked to sound, and whether they did. */
interface Tracked {
  id: string;
  notes: number[];
  started: number;
}

interface PendingPlayback {
  cancelled: boolean;
  stops: (() => void)[];
}

class Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cache = new Map<string, CacheEntry>();
  private storage: Storage | null = null;
  private sampleSetup: Promise<{ storage: Storage; format: SampleFormat | null; capability: SampleCapability }> | null = null;
  private manifest: Promise<Manifest | null> | null = null;
  private streamedManifest: Promise<StreamedManifest | null> | null = null;
  private silenceListeners = new Set<(ev: SilenceEvent) => void>();
  private pending = new Set<PendingPlayback>();
  private playListeners = new Set<() => void>();
  /** Set once a silent sample has been played inside a tap (see unlock). */
  private unlocked = false;
  /** Fundamental-reinforcement voices currently sounding (see REINFORCED_PIANOS). */
  private subs = new Set<{ osc: OscillatorNode; gain: GainNode }>();

  /**
   * Add a sine at the fundamental under a bass piano key whose sample lacks one. Same start, a
   * piano-like decay (about 3.7 dB per second, measured on the samples), and a quick release at
   * the note's end.
   */
  private reinforce(instrumentId: string, midi: number, detune: number, time: number, duration: number, velocity: number) {
    if (!useAudioPrefs.getState().reinforceBass) return;
    if (!REINFORCED_PIANOS.has(instrumentId) || midi >= REINFORCE_BELOW_MIDI || velocity < 5) return;
    const ctx = this.context;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToFrequency(midi, detune);
    const gain = ctx.createGain();
    const peak = REINFORCE_GAIN * Math.min(1, velocity / 127);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.015);
    gain.gain.setTargetAtTime(0, time + 0.015, 2.2);
    const end = time + Math.min(Math.max(0.1, duration), 8);
    gain.gain.setTargetAtTime(0, end, 0.06);
    osc.connect(gain).connect(this.destination);
    osc.start(time);
    osc.stop(end + 0.4);
    const voice = { osc, gain };
    this.subs.add(voice);
    osc.onended = () => {
      this.subs.delete(voice);
      try {
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

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

  /** True once an AudioContext exists. */
  get hasContext(): boolean {
    return this.ctx !== null;
  }

  /** "running" when sound can come out; "suspended" or iOS's "interrupted" when the browser has paused it. */
  get state(): string {
    return this.ctx ? this.ctx.state : "none";
  }

  /**
   * Call inside a tap (touchend / click). A phone browser only lets sound start from one, and iOS
   * pauses the context again whenever the page leaves the screen, so this runs on every tap and does
   * nothing when all is well. The first time it also plays one silent sample, which older iOS needs
   * before its audio clock starts, and picks the audio session (silent switch, see device.ts).
   */
  unlock(): void {
    const ctx = this.context;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    if (this.unlocked) return;
    this.unlocked = true;
    applyAudioSession(useAudioPrefs.getState().playWhenSilent);
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* not worth failing a tap over */
    }
  }

  /** The page is on screen again: restart a context the browser paused in the background. Needs no tap on most browsers. */
  wake(): void {
    if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {});
  }

  /** Called each time something is asked to play, before any loading. Returns the unsubscribe function. */
  onPlay(listener: () => void): () => void {
    this.playListeners.add(listener);
    return () => {
      this.playListeners.delete(listener);
    };
  }

  private announcePlay() {
    for (const l of this.playListeners) l();
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
      this.sampleSetup = (isTouchDevice() ? Promise.resolve(phoneCapability()) : detectSampleCapability(base, { force }))
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
      const asked: Promise<StreamedManifest | null> = HAS_LOCAL_STREAMED
        ? fetch(`${SAMPLE_BASE}/streamed/manifest.json`).then((r) => (r.ok ? (r.json() as Promise<StreamedManifest>) : null))
        : Promise.resolve(null);
      this.streamedManifest = asked
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
    if (force) {
      this.streamedManifest = null;
      this.clearBroken();
    }
    return Promise.all([this.getSampleSetup(force), this.getStreamedManifest()]).then(([s]) => s.capability);
  }

  /** Drop an instrument for this session: unload it and keep it out of random pools. */
  markBroken(id: string, reason: string) {
    const entry = this.cache.get(id);
    if (entry) {
      try {
        entry.instance?.dispose();
      } catch {
        /* ignore */
      }
      this.cache.delete(id);
    }
    useEngineStore.setState((s) => ({ broken: { ...s.broken, [id]: reason }, lastError: `${instrumentLabel(id)}: ${reason}` }));
    this.publish();
  }

  clearBroken() {
    useEngineStore.setState({ broken: {} });
  }

  /** Subscribe to "this playback made no sound" events. Returns the unsubscribe function. */
  onSilence(listener: (ev: SilenceEvent) => void): () => void {
    this.silenceListeners.add(listener);
    return () => {
      this.silenceListeners.delete(listener);
    };
  }

  /**
   * Play one nearly silent, very short note to prove the instrument has samples at all. smplr
   * resolves `ready` even when every sample failed to fetch or decode, and then plays nothing.
   * Notes scheduled inside the scheduler's lookahead dispatch synchronously, so `onStart` has
   * fired (or not) by the time `start` returns.
   */
  private probe(inst: Playable, def: InstrumentDef) {
    const [lo, hi] = def.range;
    const mid = Math.round((lo + hi) / 2);
    const candidates = [...new Set([mid, mid - 5, mid + 7, lo + 2, hi - 2].map((m) => Math.min(hi, Math.max(lo, m))))];
    for (const note of candidates) {
      let started = false;
      const stop = inst.start({
        note,
        velocity: 1,
        time: this.currentTime + 0.01,
        duration: 0.02,
        onStart: () => {
          started = true;
        },
      });
      try {
        stop();
      } catch {
        /* ignore */
      }
      if (started) return;
    }
    throw new Error("loaded but made no sound (samples missing or not decodable)");
  }

  /**
   * Watch a scheduled playback: once every note should have started, any instrument that started
   * no voice is marked broken and listeners are told. `stopAll` cancels the watch.
   */
  private watch(tracked: Tracked[], stops: (() => void)[], lastStartSec: number, endSec: number) {
    const p: PendingPlayback = { cancelled: false, stops };
    this.pending.add(p);
    setTimeout(() => {
      if (p.cancelled) return;
      // A paused context (phone in the background, a call, the tab hidden) starts nothing, and that says
      // nothing about the instrument. Only judge silence while the audio clock is really running.
      if (this.ctx?.state !== "running" || (typeof document !== "undefined" && document.hidden)) return;
      const silent = tracked.filter((t) => t.started === 0 && t.notes.length > 0);
      if (!silent.length) return;
      for (const t of silent) this.markBroken(t.id, `made no sound for ${[...new Set(t.notes)].slice(0, 6).map((m) => noteName(m)).join(", ")}`);
      const ev: SilenceEvent = { instrumentIds: silent.map((t) => t.id), notes: [...new Set(silent.flatMap((t) => t.notes))] };
      for (const l of this.silenceListeners) l(ev);
    }, Math.max(0, lastStartSec * 1000) + 300);
    setTimeout(() => this.pending.delete(p), Math.max(0, endSec * 1000) + 500);
  }

  private getManifest(): Promise<Manifest | null> {
    if (!this.manifest) {
      this.manifest = HAS_LOCAL_SOUNDFONTS
        ? fetch(`${SAMPLE_BASE}/soundfonts/manifest.json`)
            .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
            .catch(() => null)
        : Promise.resolve(null);
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
      // Without a local copy, ask the public CDN for the mp3 file by name: the same bytes as the
      // local download, and mp3 decodes in every browser (left to itself smplr may pick Ogg, which
      // Safari advertises but cannot always decode).
      const instrumentUrl = format ? `${SAMPLE_BASE}/soundfonts/${kit}/${src.name}-${format}.js` : `${GM_CDN}/${kit}/${src.name}-mp3.js`;
      const inst = Soundfont(ctx, { instrumentUrl, storage, destination });
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
      if (setup.capability.reason === "phone") throw new Error(`${def.label} is one of the streamed sets, which play on the laptop only for now.`);
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

  /** Build the instrument and prove it makes sound; a silent one is disposed and rejected. */
  private async createVerified(def: InstrumentDef): Promise<Playable> {
    const inst = await this.create(def);
    if (def.source.kind === "synth") return inst;
    try {
      this.probe(inst, def);
    } catch (err) {
      try {
        inst.dispose();
      } catch {
        /* ignore */
      }
      throw err;
    }
    return inst;
  }

  private publish() {
    const loading: string[] = [];
    const loaded: string[] = [];
    for (const [id, e] of this.cache) (e.loaded ? loaded : loading).push(id);
    useEngineStore.setState({ loading, loaded });
  }

  private evict() {
    const loadedEntries = [...this.cache.entries()].filter(([, e]) => e.loaded);
    const max = maxLoadedInstruments();
    if (loadedEntries.length <= max) return;
    loadedEntries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const excess = loadedEntries.length - max;
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
      promise: Promise.resolve().then(() => this.createVerified(def)),
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
        this.markBroken(id, err?.message ?? String(err));
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
    this.announcePlay();
    await this.resume();
    const inst = await this.load(instrumentId);
    const at = (opts.at ?? 0) + 0.02;
    const dur = opts.duration ?? 1.5;
    const tracked: Tracked = { id: instrumentId, notes: [midi], started: 0 };
    const time = this.currentTime + at;
    const stop = inst.start({
      note: midi,
      velocity: opts.velocity ?? 100,
      time,
      duration: dur,
      detune: opts.detune ?? 0,
      onStart: () => {
        tracked.started++;
      },
    });
    this.reinforce(instrumentId, midi, opts.detune ?? 0, time, dur, opts.velocity ?? 100);
    this.watch([tracked], [stop], at, at + dur);
  }

  /**
   * Play several notes with relative offsets (seconds). Notes may use different instruments.
   * Returns the total duration in seconds.
   */
  async playNotes(
    notes: { instrumentId: string; midi: number; at: number; duration?: number; velocity?: number; detune?: number }[]
  ): Promise<number> {
    this.announcePlay();
    await this.resume();
    const ids = [...new Set(notes.map((n) => n.instrumentId))];
    const insts = new Map(await Promise.all(ids.map(async (id) => [id, await this.load(id)] as const)));
    const base = this.currentTime + 0.05;
    const tracked = new Map<string, Tracked>(ids.map((id) => [id, { id, notes: [], started: 0 }]));
    const stops: (() => void)[] = [];
    let end = 0;
    let lastStart = 0;
    for (const n of notes) {
      const dur = n.duration ?? 1.5;
      const t = tracked.get(n.instrumentId)!;
      t.notes.push(n.midi);
      stops.push(
        insts.get(n.instrumentId)!.start({
          note: n.midi,
          velocity: n.velocity ?? 100,
          time: base + n.at,
          duration: dur,
          detune: n.detune ?? 0,
          onStart: () => {
            t.started++;
          },
        })
      );
      this.reinforce(n.instrumentId, n.midi, n.detune ?? 0, base + n.at, dur, n.velocity ?? 100);
      end = Math.max(end, n.at + dur);
      lastStart = Math.max(lastStart, n.at);
    }
    this.watch([...tracked.values()], stops, 0.05 + lastStart, 0.05 + end);
    return end;
  }

  /** Stop everything: sounding voices and notes still queued in the schedulers. */
  stopAll() {
    for (const p of this.pending) {
      p.cancelled = true;
      for (const stop of p.stops) {
        try {
          stop();
        } catch {
          /* ignore */
        }
      }
    }
    this.pending.clear();
    for (const e of this.cache.values()) {
      try {
        e.instance?.stop();
      } catch {
        /* ignore */
      }
    }
    const now = this.currentTime;
    for (const v of this.subs) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.03);
        v.osc.stop(now + 0.2);
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
