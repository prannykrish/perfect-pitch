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

/**
 * A phone held sideways: a touch screen in landscape that is too short to lay a page out on.
 * (The tallest phone is about 440 px high on its side; the smallest tablet 744.) The same query
 * is the `sideways:` variant in globals.css.
 */
export const PHONE_SIDEWAYS_QUERY = "(hover: none) and (orientation: landscape) and (max-height: 540px)";

/**
 * A phone, held either way: below Tailwind's `md` in width, or a phone on its side (which is wider
 * than `md` on most iPhones, and used to get the laptop's scrolling page). Decides the fixed quiz
 * screen and its side panel, and settings as a sheet on the two piano tabs.
 */
export function useIsPhone(): boolean {
  return useMediaQuery(`(max-width: 767.98px), ${PHONE_SIDEWAYS_QUERY}`);
}

/** A phone on its side: the quiz screen puts the Hear buttons beside the answer instead of above it. */
export function useIsPhoneSideways(): boolean {
  return useMediaQuery(PHONE_SIDEWAYS_QUERY);
}

/** A finger rather than a mouse. Matches the `touch:` Tailwind variant in globals.css. */
export function useIsTouch(): boolean {
  return useMediaQuery("(hover: none)");
}
