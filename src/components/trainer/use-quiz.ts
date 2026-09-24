"use client";

/**
 * The shared quiz engine every trainer mode runs on: phases, instrument pool, session logging,
 * replays, auto-proceed, keyboard shortcuts and USB piano input. A mode supplies an adapter
 * (generate / play / score / log) and renders its own answer UI.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getEngine, isInstrumentAvailable, useEngineStore } from "@/lib/audio/engine";
import { getInstrument, instrumentLabel } from "@/lib/audio/instruments";
import { getMidi } from "@/lib/midi/midi";
import { midiFrom, shuffle } from "@/lib/music/notes";
import { useLatest } from "@/lib/hooks/use-latest";
import { useTrainerSettings, type TrainerSettings } from "@/lib/trainer/settings";
import {
  candidateInstruments,
  emptyMissStats,
  pickInstrumentId,
  seedMissStats,
  type MissStats,
  type QuizPhase,
  type Scored,
} from "@/lib/trainer/quiz-core";
import { endSession, getMissWeights, logAttempt, startSession, type LogAttemptInput } from "@/lib/db/actions";
import { PC_KEYS } from "@/components/trainer/pitch-class-grid";

export interface GenerateCtx {
  settings: TrainerSettings;
  chooseInstrument: (avoid?: string) => Promise<string>;
  prev: unknown;
  stats: MissStats | undefined;
}

export interface QuizModeAdapter<Q, A> {
  /** Stored in the attempts table. */
  mode: string;
  /** Draw instruments from the whole registry regardless of pool settings (timbre roulette). */
  everything?: boolean;
  /** Always rotate to a different instrument each question. */
  rotateEveryQuestion?: boolean;
  generate(ctx: GenerateCtx): Promise<Q>;
  play(q: Q, settings: TrainerSettings): Promise<void>;
  score(q: Q, a: A, settings: TrainerSettings): Scored;
  log(q: Q, a: A, settings: TrainerSettings): Pick<LogAttemptInput, "instrumentId" | "target" | "answer"> & Partial<LogAttemptInput>;
  record?(stats: MissStats, q: Q, a: A, scored: Scored): void;
}

export interface HistoryEntry<Q, A> {
  q: Q;
  a: A;
  correct: boolean;
  score: number;
  responseMs: number;
}

export type NoteInputVia = "midi" | "keyboard" | "click";

export interface UseQuizOptions {
  /** Called with a MIDI number when a note arrives from the USB piano or the computer keyboard during a question. */
  onNoteInput?: (midi: number, via: NoteInputVia) => void;
}

const POOL_SIZE = 6;

export function useQuiz<Q, A>(adapter: QuizModeAdapter<Q, A>, opts: UseQuizOptions = {}) {
  const settings = useTrainerSettings((s) => s.settings);
  const settingsRef = useLatest(settings);
  const adapterRef = useLatest(adapter);
  const onNoteInputRef = useLatest(opts.onNoteInput);

  const [phase, setPhase] = useState<QuizPhase>("idle");
  const [question, setQuestion] = useState<Q | null>(null);
  const [answer, setAnswer] = useState<A | null>(null);
  const [scored, setScored] = useState<Scored | null>(null);
  const [history, setHistory] = useState<HistoryEntry<Q, A>[]>([]);
  const [replays, setReplays] = useState(0);
  const [octave, setOctave] = useState(4);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);

  const phaseRef = useLatest(phase);
  const questionRef = useLatest<Q | null>(question);
  const octaveRef = useLatest(octave);
  const askedAtRef = useRef(0);
  const replaysRef = useRef(0);
  const historyRef = useRef<HistoryEntry<Q, A>[]>([]);
  const sessionIdRef = useRef<number | null>(null);
  const statsRef = useRef<MissStats>(emptyMissStats());
  const poolRef = useRef<string[]>([]);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const engineLoading = useEngineStore((s) => s.loading);
  const answeredCount = history.length;
  const correctCount = useMemo(() => history.filter((h) => h.correct).length, [history]);

  // ----- instrument pool -----
  const refillPool = useCallback(
    (force = false) => {
      const s = settingsRef.current;
      const ad = adapterRef.current;
      const everything = ad.everything || s.poolMode === "everything";
      const rotate = ad.rotateEveryQuestion || s.poolMode === "everything";
      if (s.instrumentMode === "fixed" && !everything) {
        poolRef.current = [s.instrumentId];
        getEngine().warm(poolRef.current);
        return;
      }
      const engineState = useEngineStore.getState();
      const candidates = candidateInstruments(s, { isAvailable: (d) => isInstrumentAvailable(d, engineState), everything });
      const size = everything ? POOL_SIZE + 4 : POOL_SIZE;
      if (force || poolRef.current.length === 0) {
        poolRef.current = shuffle(candidates)
          .slice(0, size)
          .map((d) => d.id);
      } else if ((rotate || Math.random() < 0.4) && candidates.length > poolRef.current.length) {
        const fresh = shuffle(candidates.filter((d) => !poolRef.current.includes(d.id)))[0];
        if (fresh) poolRef.current[Math.floor(Math.random() * poolRef.current.length)] = fresh.id;
      }
      getEngine().warm(poolRef.current);
    },
    [settingsRef, adapterRef]
  );

  const chooseInstrument = useCallback(
    async (avoid?: string): Promise<string> => {
      const s = settingsRef.current;
      if (s.instrumentMode === "fixed" && !adapterRef.current.everything && s.poolMode !== "everything") return s.instrumentId;
      const engine = getEngine();
      const loaded = poolRef.current.filter((id) => engine.isLoaded(id));
      const ids = loaded.length ? loaded : poolRef.current.slice(0, 1);
      const defs = ids.map((id) => getInstrument(id)).filter((d): d is NonNullable<typeof d> => !!d);
      const id = pickInstrumentId(defs, s.adaptive ? statsRef.current : undefined, avoid);
      if (!engine.isLoaded(id)) {
        setLoadingLabel(instrumentLabel(id));
        try {
          await engine.load(id);
        } finally {
          setLoadingLabel(null);
        }
      }
      return id;
    },
    [settingsRef, adapterRef]
  );

  // ----- lifecycle -----
  const clearTimer = () => {
    if (autoTimer.current) {
      clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
  };

  const finish = useCallback(() => {
    clearTimer();
    setPhase("ended");
    const id = sessionIdRef.current;
    if (id) endSession(id).catch(() => {});
    sessionIdRef.current = null;
  }, []);

  const playQuestion = useCallback(
    async (q: Q) => {
      try {
        await adapterRef.current.play(q, settingsRef.current);
      } catch (err) {
        toast.error(`Playback failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [adapterRef, settingsRef]
  );

  const askNext = useCallback(async () => {
    clearTimer();
    const s = settingsRef.current;
    if (s.questionCount > 0 && historyRef.current.length >= s.questionCount) {
      finish();
      return;
    }
    setPhase("loading");
    setAnswer(null);
    setScored(null);
    refillPool();
    let q: Q;
    try {
      q = await adapterRef.current.generate({
        settings: s,
        chooseInstrument,
        prev: questionRef.current,
        stats: s.adaptive ? statsRef.current : undefined,
      });
    } catch (err) {
      toast.error(`Could not build a question: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("idle");
      return;
    }
    setQuestion(q);
    questionRef.current = q;
    replaysRef.current = 0;
    setReplays(0);
    setPhase("question");
    askedAtRef.current = performance.now();
    await playQuestion(q);
  }, [adapterRef, settingsRef, questionRef, chooseInstrument, finish, playQuestion, refillPool]);

  const start = useCallback(async () => {
    const engine = getEngine();
    await engine.resume();
    historyRef.current = [];
    setHistory([]);
    statsRef.current = emptyMissStats();
    questionRef.current = null;
    setQuestion(null);
    refillPool(true);
    const s = settingsRef.current;
    startSession({ mode: adapterRef.current.mode, settings: s })
      .then((id) => {
        sessionIdRef.current = id;
      })
      .catch((err) => toast.error(`Could not start a session log: ${err instanceof Error ? err.message : err}`));
    if (s.adaptive) {
      getMissWeights()
        .then((seed) => seedMissStats(statsRef.current, seed))
        .catch(() => {});
    }
    await askNext();
  }, [adapterRef, settingsRef, questionRef, askNext, refillPool]);

  const canReplay = useCallback(() => {
    const s = settingsRef.current;
    if (phaseRef.current !== "question") return true;
    const limit = s.replayLimit === "unlimited" ? Infinity : s.replayLimit === "one" ? 1 : 0;
    return replaysRef.current < limit;
  }, [settingsRef, phaseRef]);

  const hearAgain = useCallback(() => {
    const q = questionRef.current;
    if (!q) return;
    if (!canReplay()) {
      toast("No replays left for this one");
      return;
    }
    if (phaseRef.current === "question") {
      replaysRef.current++;
      setReplays(replaysRef.current);
    }
    playQuestion(q);
  }, [questionRef, phaseRef, canReplay, playQuestion]);

  const submit = useCallback(
    (a: A) => {
      const q = questionRef.current;
      if (!q || phaseRef.current !== "question") return;
      const s = settingsRef.current;
      const ad = adapterRef.current;
      const result = ad.score(q, a, s);
      const responseMs = performance.now() - askedAtRef.current;
      const entry: HistoryEntry<Q, A> = { q, a, correct: result.correct, score: result.score, responseMs };
      historyRef.current = [...historyRef.current, entry];
      setHistory(historyRef.current);
      ad.record?.(statsRef.current, q, a, result);
      setAnswer(a);
      setScored(result);
      setPhase("answered");

      const fields = ad.log(q, a, s);
      logAttempt({
        sessionId: sessionIdRef.current,
        mode: ad.mode,
        correct: result.correct,
        score: result.score,
        responseMs,
        replays: replaysRef.current,
        ...fields,
      }).catch((err) => console.warn("logAttempt failed", err));

      if (s.autoProceed) {
        autoTimer.current = setTimeout(() => askNext(), result.correct ? s.correctPauseMs : s.wrongPauseMs);
      }
    },
    [questionRef, phaseRef, settingsRef, adapterRef, askNext]
  );

  // ----- USB piano -----
  useEffect(() => {
    if (!settings.midiInput) return;
    getMidi().init();
    return getMidi().subscribe((ev) => {
      if (ev.type !== "noteon") return;
      if (!settingsRef.current.midiInput) return;
      if (phaseRef.current === "question") onNoteInputRef.current?.(ev.note, "midi");
    });
  }, [settings.midiInput, settingsRef, phaseRef, onNoteInputRef]);

  // ----- keyboard shortcuts -----
  useEffect(() => {
    if (!settings.keyboardShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (e.code === "Space") {
        e.preventDefault();
        const p = phaseRef.current;
        if (p === "idle" || p === "ended") start();
        else if (p === "answered") askNext();
        else if (p === "question") hearAgain();
        return;
      }
      if (key === "R") {
        e.preventDefault();
        hearAgain();
        return;
      }
      if (key === "Escape") {
        if (phaseRef.current === "question" || phaseRef.current === "answered") finish();
        return;
      }
      if (key === "Z") {
        setOctave((o) => Math.max(0, o - 1));
        return;
      }
      if (key === "X") {
        setOctave((o) => Math.min(8, o + 1));
        return;
      }
      if (/^[0-8]$/.test(key)) {
        setOctave(Number(key));
        return;
      }
      const pc = (PC_KEYS as readonly string[]).indexOf(key);
      if (pc >= 0 && phaseRef.current === "question") {
        e.preventDefault();
        onNoteInputRef.current?.(midiFrom(pc, octaveRef.current), "keyboard");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.keyboardShortcuts, start, askNext, hearAgain, finish, phaseRef, octaveRef, onNoteInputRef]);

  useEffect(() => () => clearTimer(), []);

  const inQuiz = phase === "question" || phase === "answered" || phase === "loading";
  const remaining = settings.questionCount > 0 ? Math.max(0, settings.questionCount - answeredCount) : null;

  return {
    settings,
    phase,
    question,
    answer,
    scored,
    history,
    replays,
    loadingLabel,
    engineLoading,
    octave,
    setOctave,
    start,
    askNext,
    hearAgain,
    finish,
    submit,
    inQuiz,
    answeredCount,
    correctCount,
    remaining,
    lastResponseMs: history[history.length - 1]?.responseMs ?? 0,
  };
}

export type QuizApi<Q, A> = ReturnType<typeof useQuiz<Q, A>>;
