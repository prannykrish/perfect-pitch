"use client";

/**
 * Microphone pitch tracking with pitchy (McLeod pitch method). Monophonic: humming or a single
 * sung line. Emits one frame per animation frame with the detected fractional MIDI number,
 * the detector's clarity and the signal level, so the caller can gate on both.
 */
import { PitchDetector } from "pitchy";
import { frequencyToMidi } from "@/lib/music/notes";
import type { PitchFrame } from "./hum-segment";

const WINDOW = 2048;

export class PitchTracker {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private detector = PitchDetector.forFloat32Array(WINDOW);
  private buf = new Float32Array(WINDOW);
  private raf = 0;
  private t0 = 0;
  private running = false;

  constructor(private ctx: AudioContext) {}

  static supported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Ask for the mic and start emitting frames. Rejects when the mic is refused. */
  async start(onFrame: (f: PitchFrame) => void): Promise<void> {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
    });
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = WINDOW;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    this.t0 = performance.now();
    this.running = true;
    const tick = () => {
      if (!this.running || !this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const level = Math.sqrt(sum / this.buf.length);
      const [hz, clarity] = this.detector.findPitch(this.buf, this.ctx.sampleRate);
      const midi = hz > 40 && hz < 4000 && Number.isFinite(hz) ? frequencyToMidi(hz) : null;
      onFrame({ tMs: performance.now() - this.t0, midi, clarity, level });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  get elapsedMs() {
    return this.running ? performance.now() - this.t0 : 0;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.source = null;
    this.analyser = null;
  }
}
