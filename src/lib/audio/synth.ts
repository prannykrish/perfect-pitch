/**
 * Web Audio synth that implements the same tiny interface smplr instruments expose
 * (start / stop / ready / dispose) so the engine can treat it like a sampled instrument.
 *
 * Presets range from clean waveforms to "random": a brand new randomised timbre for every
 * note, which is the "random noises that have a pitch" drill.
 */
import { midiToFrequency } from "@/lib/music/notes";

export interface SynthParams {
  /** Oscillator source. "additive" uses `partials`; "noise" is band-passed noise at the pitch. */
  source: "sine" | "triangle" | "square" | "sawtooth" | "additive" | "fm" | "noise";
  /** Amplitude of harmonics 1..n for additive; ratios relative to fundamental. */
  partials?: number[];
  /** For additive: multiply harmonic index by this stretch factor (1 = harmonic, >1 = bell-like inharmonic). */
  partialStretch?: number;
  fmRatio?: number; // modulator freq / carrier freq
  fmIndex?: number; // modulation depth in multiples of carrier freq
  fmDecay?: number; // seconds for the index to fall to ~0
  attack: number;
  decay: number;
  sustain: number; // 0..1
  release: number;
  /** Low-pass cutoff as a multiple of the note frequency. */
  filterCutoffRatio?: number;
  filterQ?: number;
  /** Extra noise mixed in (0..1). */
  noiseMix?: number;
  vibratoRate?: number; // Hz
  vibratoDepth?: number; // cents
  /** Start this many semitones away and glide to the target over glideTime seconds. */
  glideFrom?: number;
  glideTime?: number;
  gain?: number;
}

export const SYNTH_PRESET_PARAMS: Record<string, SynthParams> = {
  sine: { source: "sine", attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3, gain: 0.5 },
  triangle: { source: "triangle", attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3, gain: 0.5 },
  square: { source: "square", attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3, filterCutoffRatio: 8, gain: 0.25 },
  sawtooth: { source: "sawtooth", attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3, filterCutoffRatio: 10, gain: 0.25 },
  organ: {
    source: "additive",
    partials: [1, 0.6, 0.4, 0.5, 0.2, 0.3, 0.1, 0.2],
    attack: 0.02,
    decay: 0.1,
    sustain: 1,
    release: 0.15,
    gain: 0.35,
  },
  "fm-bell": { source: "fm", fmRatio: 3.5, fmIndex: 2.5, fmDecay: 1.2, attack: 0.005, decay: 1.5, sustain: 0, release: 0.8, gain: 0.5 },
  "fm-metal": { source: "fm", fmRatio: 1.41, fmIndex: 6, fmDecay: 0.6, attack: 0.005, decay: 0.8, sustain: 0.2, release: 0.5, gain: 0.4 },
  pluck: {
    source: "sawtooth",
    attack: 0.003,
    decay: 0.6,
    sustain: 0,
    release: 0.2,
    filterCutoffRatio: 4,
    filterQ: 3,
    gain: 0.4,
  },
  "pitched-noise": { source: "noise", attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.3, filterQ: 40, gain: 2.5 },
  inharmonic: {
    source: "additive",
    partials: [1, 0.7, 0.5, 0.6, 0.3, 0.4],
    partialStretch: 1.13,
    attack: 0.005,
    decay: 2,
    sustain: 0,
    release: 0.5,
    gain: 0.4,
  },
  glide: { source: "triangle", attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, glideFrom: 7, glideTime: 0.35, gain: 0.5 },
};

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const chance = (p: number) => Math.random() < p;

/** A fresh, unpredictable timbre. Always keeps a real fundamental so the pitch is identifiable. */
export function randomSynthParams(): SynthParams {
  const sources: SynthParams["source"][] = ["sine", "triangle", "square", "sawtooth", "additive", "fm", "noise"];
  const source = sources[Math.floor(Math.random() * sources.length)];
  const p: SynthParams = {
    source,
    attack: chance(0.7) ? rand(0.002, 0.05) : rand(0.1, 0.6),
    decay: rand(0.1, 1.5),
    sustain: chance(0.5) ? rand(0.3, 1) : 0,
    release: rand(0.1, 0.8),
    gain: 0.4,
  };
  if (source === "additive") {
    const n = 3 + Math.floor(Math.random() * 8);
    p.partials = Array.from({ length: n }, (_, i) => (i === 0 ? 1 : rand(0, 0.8) / Math.sqrt(i + 1)));
    p.partialStretch = chance(0.4) ? rand(1.02, 1.25) : 1;
  }
  if (source === "fm") {
    p.fmRatio = chance(0.5) ? [0.5, 1, 2, 3, 4][Math.floor(Math.random() * 5)] : rand(0.7, 5);
    p.fmIndex = rand(0.5, 8);
    p.fmDecay = rand(0.2, 2);
  }
  if (source === "noise") {
    p.filterQ = rand(15, 60);
    p.gain = 2.5;
  }
  if (source === "square" || source === "sawtooth") {
    p.filterCutoffRatio = rand(2, 12);
    p.filterQ = rand(0.5, 6);
    p.gain = 0.25;
  }
  if (chance(0.35)) {
    p.vibratoRate = rand(3, 8);
    p.vibratoDepth = rand(5, 40);
  }
  if (chance(0.25)) {
    p.glideFrom = rand(-12, 12);
    p.glideTime = rand(0.1, 0.5);
  }
  if (chance(0.3) && source !== "noise") {
    p.noiseMix = rand(0.05, 0.4);
  }
  return p;
}

export interface SynthNoteEvent {
  note: number; // midi
  velocity?: number; // 0..127
  time?: number; // absolute AudioContext time
  duration?: number | null; // seconds
  detune?: number; // cents
  /** Called once the voice is scheduled (mirrors smplr's onStart so the engine can count voices). */
  onStart?: () => void;
}

let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

export class SynthInstrument {
  readonly ready: Promise<void> = Promise.resolve();
  readonly output: GainNode;
  private voices = new Set<{ stop: (t?: number) => void }>();
  private disposed = false;

  constructor(
    private ctx: BaseAudioContext,
    private preset: string,
    destination?: AudioNode
  ) {
    this.output = ctx.createGain();
    this.output.gain.value = 1;
    this.output.connect(destination ?? ctx.destination);
  }

  private paramsFor(): SynthParams {
    if (this.preset === "random") return randomSynthParams();
    return SYNTH_PRESET_PARAMS[this.preset] ?? SYNTH_PRESET_PARAMS.sine;
  }

  start(ev: SynthNoteEvent): (time?: number) => void {
    if (this.disposed) return () => {};
    const ctx = this.ctx;
    const p = this.paramsFor();
    const t0 = ev.time ?? ctx.currentTime;
    const vel = (ev.velocity ?? 100) / 127;
    const freq = midiToFrequency(ev.note, ev.detune ?? 0);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(vel * (p.gain ?? 0.5), t0 + p.attack);
    amp.gain.setTargetAtTime(vel * (p.gain ?? 0.5) * p.sustain, t0 + p.attack, Math.max(0.01, p.decay / 3));

    let chain: AudioNode = amp;
    let filter: BiquadFilterNode | null = null;
    if (p.filterCutoffRatio) {
      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.min(18000, freq * p.filterCutoffRatio);
      filter.Q.value = p.filterQ ?? 1;
      filter.connect(amp);
      chain = filter;
    }
    amp.connect(this.output);

    const nodes: AudioScheduledSourceNode[] = [];
    const freqParams: AudioParam[] = [];

    const applyGlide = (param: AudioParam, target: number) => {
      if (p.glideFrom && p.glideTime) {
        param.setValueAtTime(target * Math.pow(2, p.glideFrom / 12), t0);
        param.exponentialRampToValueAtTime(target, t0 + p.glideTime);
      } else {
        param.setValueAtTime(target, t0);
      }
    };

    if (p.source === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = getNoiseBuffer(ctx);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = p.filterQ ?? 30;
      applyGlide(bp.frequency, freq);
      freqParams.push(bp.frequency);
      src.connect(bp).connect(chain);
      nodes.push(src);
    } else if (p.source === "additive") {
      const partials = p.partials ?? [1];
      const stretch = p.partialStretch ?? 1;
      partials.forEach((a, i) => {
        if (a <= 0) return;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        const ratio = Math.pow(i + 1, stretch);
        const f = freq * ratio;
        if (f > ctx.sampleRate / 2) return;
        applyGlide(osc.frequency, f);
        freqParams.push(osc.frequency);
        const g = ctx.createGain();
        g.gain.value = a / partials.length;
        osc.connect(g).connect(chain);
        nodes.push(osc);
      });
    } else if (p.source === "fm") {
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      applyGlide(carrier.frequency, freq);
      freqParams.push(carrier.frequency);
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.setValueAtTime(freq * (p.fmRatio ?? 2), t0);
      const modGain = ctx.createGain();
      const idx = (p.fmIndex ?? 2) * freq;
      modGain.gain.setValueAtTime(idx, t0);
      modGain.gain.setTargetAtTime(0, t0, Math.max(0.05, (p.fmDecay ?? 1) / 3));
      mod.connect(modGain).connect(carrier.frequency);
      carrier.connect(chain);
      nodes.push(carrier, mod);
    } else {
      const osc = ctx.createOscillator();
      osc.type = p.source;
      applyGlide(osc.frequency, freq);
      freqParams.push(osc.frequency);
      osc.connect(chain);
      nodes.push(osc);
    }

    if (p.noiseMix && p.source !== "noise") {
      const src = ctx.createBufferSource();
      src.buffer = getNoiseBuffer(ctx);
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = p.noiseMix * 0.3;
      src.connect(g).connect(chain);
      nodes.push(src);
    }

    if (p.vibratoRate && p.vibratoDepth && freqParams.length) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = p.vibratoRate;
      const lfoGain = ctx.createGain();
      // detune is in cents on OscillatorNode; for BiquadFilter frequency we approximate in Hz
      lfoGain.gain.value = (p.vibratoDepth / 1200) * freq;
      lfo.connect(lfoGain);
      for (const fp of freqParams) lfoGain.connect(fp);
      lfo.start(t0);
      nodes.push(lfo);
    }

    for (const n of nodes) n.start(t0);
    if (nodes.length) ev.onStart?.();

    const voice = {
      stop: (time?: number) => {
        const t = Math.max(time ?? ctx.currentTime, t0 + p.attack);
        amp.gain.cancelScheduledValues(t);
        amp.gain.setValueAtTime(amp.gain.value, t);
        amp.gain.setTargetAtTime(0, t, Math.max(0.01, p.release / 4));
        const end = t + p.release + 0.1;
        for (const n of nodes) {
          try {
            n.stop(end);
          } catch {
            /* already stopped */
          }
        }
        setTimeout(() => {
          amp.disconnect();
          filter?.disconnect();
          this.voices.delete(voice);
        }, (end - ctx.currentTime) * 1000 + 50);
      },
    };
    this.voices.add(voice);
    if (ev.duration) voice.stop(t0 + ev.duration);
    return voice.stop;
  }

  stop(): void {
    for (const v of [...this.voices]) v.stop();
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    setTimeout(() => this.output.disconnect(), 1500);
  }
}
