"use client";

/**
 * Mounted once in the layout. Turns the audio engine's silent failures into toasts: an instrument
 * that failed to load, loaded but made no sound, or went silent mid-question is announced and is
 * kept out of the random pools for the rest of the session.
 */
import { useEffect } from "react";
import { toast } from "sonner";
import { useEngineStore } from "@/lib/audio/engine";
import { instrumentLabel } from "@/lib/audio/instruments";

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
  return null;
}
