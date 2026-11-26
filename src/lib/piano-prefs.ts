import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The on-screen piano on a phone. The whole keyboard cannot fit at a size a finger can hit, so it
 * shows a window of it (see piano-keyboard.tsx). These are per-device comfort settings: they never
 * touch what is asked, so they live outside the trainer settings and the level gates ignore them.
 */
export type WindowOctaves = 1.5 | 2 | 2.5;

/**
 * How a note with its octave is answered on the phone's quiz screen: on the piano, or with the
 * octave and note buttons. One at a time: both together leave no room for either, and a stray
 * touch on whichever is not in use would count as an answer. The laptop shows both.
 */
export type PhoneInput = "piano" | "buttons";

/** White keys shown per window size. Each one starts on a C and ends on an E or a B, so no black key is cut in half. */
export const WINDOW_WHITE_KEYS: Record<WindowOctaves, number> = { 1.5: 10, 2: 14, 2.5: 17 };

interface PianoPrefs {
  windowOctaves: WindowOctaves;
  setWindowOctaves: (n: WindowOctaves) => void;
  phoneInput: PhoneInput;
  setPhoneInput: (v: PhoneInput) => void;
  /** First tap lights a key, the second tap on it (or the Answer button) submits. For small keys. */
  confirmTaps: boolean;
  setConfirmTaps: (on: boolean) => void;
  /** MIDI number of the C at the window's left edge. Only he moves it; it survives questions and visits. */
  windowStart: number;
  setWindowStart: (midi: number) => void;
}

export const usePianoPrefs = create<PianoPrefs>()(
  persist(
    (set) => ({
      windowOctaves: 2,
      setWindowOctaves: (n) => set({ windowOctaves: n }),
      phoneInput: "piano",
      setPhoneInput: (v) => set({ phoneInput: v }),
      confirmTaps: false,
      setConfirmTaps: (on) => set({ confirmTaps: on }),
      windowStart: 48, // C3: middle C sits in the middle of a two-octave window
      setWindowStart: (midi) => set({ windowStart: midi }),
    }),
    { name: "pp-piano-prefs-v1" }
  )
);

/** Put the C of this octave (scientific: C4 = 60) at the window's left edge. */
export function jumpPianoWindowToOctave(octave: number) {
  usePianoPrefs.getState().setWindowStart((octave + 1) * 12);
}
