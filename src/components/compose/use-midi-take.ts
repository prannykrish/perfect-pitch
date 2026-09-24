"use client";

/**
 * Captures what is played on the USB piano while `active`, as note-on events with times relative
 * to activation, and submits by itself after a stretch of silence (or on demand).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getMidi, useMidiStore } from "@/lib/midi/midi";
import { useLatest } from "@/lib/hooks/use-latest";
import type { PlayedEvent } from "@/lib/compose/theory";

export interface MidiTakeOptions {
  active: boolean;
  /** Submit after this many ms without a new note-on (once at least one note was played). 0 = never. */
  silenceMs: number;
  onSubmit: (played: PlayedEvent[]) => void;
}

export function useMidiTake({ active, silenceMs, onSubmit }: MidiTakeOptions) {
  const [played, setPlayed] = useState<PlayedEvent[]>([]);
  // a fresh activation starts with an empty take (state adjusted on the prop change, not in an effect)
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    if (active) setPlayed([]);
  }
  const playedRef = useRef<PlayedEvent[]>([]);
  const startRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSubmitRef = useLatest(onSubmit);
  const silenceRef = useLatest(silenceMs);
  const activeRef = useLatest(active);
  const held = useMidiStore((s) => s.held);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const submitNow = useCallback(() => {
    clear();
    if (!activeRef.current) return;
    onSubmitRef.current(playedRef.current);
  }, [clear, activeRef, onSubmitRef]);

  const reset = useCallback(() => {
    clear();
    playedRef.current = [];
    setPlayed([]);
    startRef.current = performance.now();
  }, [clear]);

  // (re)arm on activation
  useEffect(() => {
    if (!active) {
      clear();
      return;
    }
    playedRef.current = [];
    startRef.current = performance.now();
    getMidi().init();
    const unsub = getMidi().subscribe((ev) => {
      if (ev.type !== "noteon" || !activeRef.current) return;
      const e: PlayedEvent = { midi: ev.note, timeMs: performance.now() - startRef.current };
      playedRef.current = [...playedRef.current, e];
      setPlayed(playedRef.current);
      clear();
      const ms = silenceRef.current;
      if (ms > 0) timer.current = setTimeout(() => submitNow(), ms);
    });
    return () => {
      unsub();
      clear();
    };
  }, [active, activeRef, silenceRef, clear, submitNow]);

  return { played, held, submitNow, reset, startedAt: startRef };
}
