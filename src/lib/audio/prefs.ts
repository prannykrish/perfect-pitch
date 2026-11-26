import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Audio preferences that outlive a page load.
 *
 * `reinforceBass`: the free GM piano's samples from A0 to G♭1 carry almost no fundamental
 * (measured 36–41 dB below the overtones, against about 7 dB from G1 upward), so those keys sound
 * like the octave above with a fifth on top. When on, the engine adds a sine at the fundamental
 * with a piano-like decay under those keys only.
 *
 * `playWhenSilent`: on an iPhone, play like a music app even when the ring/silent switch is set to
 * silent (see device.ts). Where the phone cannot do that, `silentHintShown` records that the
 * one-time "check the silent switch" hint has been given.
 */
interface AudioPrefs {
  reinforceBass: boolean;
  setReinforceBass: (on: boolean) => void;
  playWhenSilent: boolean;
  setPlayWhenSilent: (on: boolean) => void;
  silentHintShown: boolean;
  setSilentHintShown: (shown: boolean) => void;
}

export const useAudioPrefs = create<AudioPrefs>()(
  persist(
    (set) => ({
      reinforceBass: true,
      setReinforceBass: (on) => set({ reinforceBass: on }),
      playWhenSilent: true,
      setPlayWhenSilent: (on) => set({ playWhenSilent: on }),
      silentHintShown: false,
      setSilentHintShown: (shown) => set({ silentHintShown: shown }),
    }),
    { name: "pp-audio-prefs-v1" }
  )
);
