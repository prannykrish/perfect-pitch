import type { MidiEvent } from "./midi";

/** A note as recorded from the keyboard. Times are ms relative to the recording start. */
export interface RecordedNote {
  midi: number;
  velocity: number;
  startMs: number;
  /** null while the key is still held. */
  endMs: number | null;
}

export class MidiRecorder {
  private startTime = 0;
  private notes: RecordedNote[] = [];
  private open = new Map<number, RecordedNote>();
  private _recording = false;

  get recording() {
    return this._recording;
  }

  get elapsedMs() {
    return this._recording ? performance.now() - this.startTime : 0;
  }

  /** Live view of the notes so far (the same array instance, mutated in place). */
  get current(): RecordedNote[] {
    return this.notes;
  }

  start(now = performance.now()) {
    this.startTime = now;
    this.notes = [];
    this.open.clear();
    this._recording = true;
  }

  handle(ev: MidiEvent) {
    if (!this._recording || ev.type === "cc") return;
    const t = ev.time - this.startTime;
    if (ev.type === "noteon") {
      const existing = this.open.get(ev.note);
      if (existing) existing.endMs = t;
      const n: RecordedNote = { midi: ev.note, velocity: ev.velocity, startMs: Math.max(0, t), endMs: null };
      this.notes.push(n);
      this.open.set(ev.note, n);
    } else {
      const n = this.open.get(ev.note);
      if (n) {
        n.endMs = Math.max(n.startMs + 20, t);
        this.open.delete(ev.note);
      }
    }
  }

  stop(): RecordedNote[] {
    const t = performance.now() - this.startTime;
    for (const n of this.open.values()) n.endMs = Math.max(n.startMs + 20, t);
    this.open.clear();
    this._recording = false;
    return this.notes;
  }
}

export function recordingDurationMs(notes: RecordedNote[]): number {
  return notes.reduce((m, n) => Math.max(m, n.endMs ?? n.startMs + 200), 0);
}
