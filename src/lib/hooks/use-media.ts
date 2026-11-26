"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Live value of a CSS media query. False on the server and during hydration, then the real value. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** Below Tailwind's `md`: the phone layout (bottom tab bar, settings in a drawer). */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 767.98px)");
}

/** A finger rather than a mouse. Matches the `touch:` Tailwind variant in globals.css. */
export function useIsTouch(): boolean {
  return useMediaQuery("(hover: none)");
}
