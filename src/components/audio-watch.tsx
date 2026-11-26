"use client";

/**
 * Mounted once in the layout. Everything about audio that is not tied to one screen:
 *
 * - Turns the engine's silent failures into toasts: an instrument that failed to load, loaded but
 *   made no sound, or went silent mid-question is announced and is kept out of the random pools for
 *   the rest of the session.
 * - Keeps sound alive on a phone: starts the AudioContext inside the first tap, restarts it when the
 *   page comes back to the screen (iOS suspends it in the background), and says so when the browser
 *   has paused it or when the iPhone's silent switch may be muting it.
 */
import { useEffect } from "react";
import { toast } from "sonner";
import { getEngine, useEngineStore } from "@/lib/audio/engine";
import { hasAudioSession, isIOS, isTouchDevice } from "@/lib/audio/device";
import { instrumentLabel } from "@/lib/audio/instruments";
import { useAudioPrefs } from "@/lib/audio/prefs";

export function AudioWatch() {
  useEffect(
    () =>
      useEngineStore.subscribe((state, prev) => {
        for (const [id, reason] of Object.entries(state.broken)) {
          if (prev.broken[id]) continue;
          toast.warning(`${instrumentLabel(id)} ${reason}.`, { description: "Kept out of the random pools for the rest of this session.", duration: 7000 });
        }
      }),
    []
  );

  useEffect(() => {
    const engine = getEngine();
    const touch = isTouchDevice();

    // A phone only lets sound start inside a tap, so the first tap anywhere starts the audio; later
    // taps restart it if the browser paused it. On the laptop this only ever restarts, never creates.
    const onTap = () => {
      if (touch || engine.hasContext) engine.unlock();
    };
    const onVisible = () => {
      if (!document.hidden) engine.wake();
    };
    window.addEventListener("touchend", onTap, { capture: true, passive: true });
    window.addEventListener("click", onTap, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);

    let pausedToastAt = 0;
    let check: ReturnType<typeof setTimeout> | null = null;
    const offPlay = engine.onPlay(() => {
      // 1. Something was asked to play but the browser has the audio paused.
      if (check) clearTimeout(check);
      check = setTimeout(() => {
        if (engine.state === "running" || document.hidden) return;
        if (performance.now() - pausedToastAt < 20000) return;
        pausedToastAt = performance.now();
        toast.warning("Sound is paused by the browser.", { description: touch ? "Tap anywhere to switch it back on." : "Click anywhere to switch it back on.", duration: 6000 });
      }, 700);

      // 2. An iPhone on silent mutes web audio and nothing on the page can tell. Say it once.
      const prefs = useAudioPrefs.getState();
      if (!isIOS() || prefs.silentHintShown) return;
      if (hasAudioSession() && prefs.playWhenSilent) return; // the app plays through the silent switch
      prefs.setSilentHintShown(true);
      toast.info("No sound? Check the silent switch.", {
        description: "The switch on the side of the iPhone mutes this app. Flip it off (no orange showing) and turn the volume up.",
        duration: 10000,
      });
    });

    return () => {
      window.removeEventListener("touchend", onTap, { capture: true });
      window.removeEventListener("click", onTap, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      offPlay();
      if (check) clearTimeout(check);
    };
  }, []);

  return null;
}
