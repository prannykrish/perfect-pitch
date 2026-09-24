/**
 * Web MIDI input manager. Reads the USB electric piano (or any MIDI device) and fans
 * note events out to subscribers. UI state (device list, status) lives in a zustand store.
 */
import { create } from "zustand";

export interface MidiNoteEvent {
  type: "noteon" | "noteoff";
  note: number; // midi number
  velocity: number; // 0..127
  /** performance.now() ms; use for recording and latency measurement. */
  time: number;
  inputId: string;
}

export interface MidiControlEvent {
  type: "cc";
  controller: number;
  value: number;
  time: number;
  inputId: string;
}

export type MidiEvent = MidiNoteEvent | MidiControlEvent;
type Listener = (ev: MidiEvent) => void;

export type MidiStatus = "idle" | "unsupported" | "requesting" | "ready" | "denied" | "error";

export interface MidiInputInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

interface MidiStore {
  status: MidiStatus;
  inputs: MidiInputInfo[];
  selectedInputId: string; // "all" or a device id
  /** Global switch: when off, no events are delivered to subscribers. */
  enabled: boolean;
  /** Set of currently held notes (for on-screen piano highlighting). */
  held: number[];
  lastNote: MidiNoteEvent | null;
  error: string | null;
  setSelectedInput: (id: string) => void;
  setEnabled: (on: boolean) => void;
}

export const useMidiStore = create<MidiStore>((set) => ({
  status: "idle",
  inputs: [],
  selectedInputId: "all",
  enabled: true,
  held: [],
  lastNote: null,
  error: null,
  setSelectedInput: (id) => set({ selectedInputId: id }),
  setEnabled: (on) => set({ enabled: on, held: on ? [] : [] }),
}));

type MidiAccessLike = {
  inputs: Map<string, MidiInputLike>;
  onstatechange: ((ev: unknown) => void) | null;
};
type MidiInputLike = {
  id: string;
  name: string | null;
  manufacturer: string | null;
  state: string;
  onmidimessage: ((ev: { data: Uint8Array | null; timeStamp: number }) => void) | null;
};

class MidiManager {
  private access: MidiAccessLike | null = null;
  private listeners = new Set<Listener>();
  private heldSet = new Set<number>();
  private initPromise: Promise<void> | null = null;

  get supported(): boolean {
    return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  }

  /** Request access. Idempotent. */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (!this.supported) {
      useMidiStore.setState({ status: "unsupported" });
      this.initPromise = Promise.resolve();
      return this.initPromise;
    }
    useMidiStore.setState({ status: "requesting", error: null });
    this.initPromise = (navigator as unknown as { requestMIDIAccess(opts?: { sysex?: boolean }): Promise<MidiAccessLike> })
      .requestMIDIAccess({ sysex: false })
      .then((access) => {
        this.access = access;
        access.onstatechange = () => this.refreshInputs();
        this.refreshInputs();
        useMidiStore.setState({ status: "ready" });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        useMidiStore.setState({
          status: /denied|allowed|permission/i.test(msg) ? "denied" : "error",
          error: msg,
        });
        this.initPromise = null;
      });
    return this.initPromise;
  }

  /** Re-scan devices (e.g. after plugging the piano in). */
  rescan() {
    if (!this.access) return this.init();
    this.refreshInputs();
    return Promise.resolve();
  }

  private refreshInputs() {
    if (!this.access) return;
    const inputs: MidiInputInfo[] = [];
    for (const input of this.access.inputs.values()) {
      inputs.push({
        id: input.id,
        name: input.name ?? "MIDI input",
        manufacturer: input.manufacturer ?? "",
        state: input.state,
      });
      input.onmidimessage = (ev) => this.handleMessage(input.id, ev);
    }
    useMidiStore.setState({ inputs });
  }

  private handleMessage(inputId: string, ev: { data: Uint8Array | null; timeStamp: number }) {
    const data = ev.data;
    if (!data || data.length < 2) return;
    const { enabled, selectedInputId } = useMidiStore.getState();
    if (!enabled) return;
    if (selectedInputId !== "all" && selectedInputId !== inputId) return;
    const status = data[0] & 0xf0;
    const time = ev.timeStamp || performance.now();
    if (status === 0x90 || status === 0x80) {
      const note = data[1];
      const velocity = data.length > 2 ? data[2] : 0;
      const isOn = status === 0x90 && velocity > 0;
      const event: MidiNoteEvent = { type: isOn ? "noteon" : "noteoff", note, velocity, time, inputId };
      if (isOn) this.heldSet.add(note);
      else this.heldSet.delete(note);
      useMidiStore.setState({ held: [...this.heldSet].sort((a, b) => a - b), ...(isOn ? { lastNote: event } : {}) });
      for (const l of this.listeners) l(event);
    } else if (status === 0xb0 && data.length > 2) {
      const event: MidiControlEvent = { type: "cc", controller: data[1], value: data[2], time, inputId };
      for (const l of this.listeners) l(event);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

let manager: MidiManager | null = null;
export function getMidi(): MidiManager {
  if (!manager) manager = new MidiManager();
  return manager;
}
