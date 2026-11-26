"use client";

/**
 * The Find the Mistake quiz loop: builds a question, plays it (clean-then-altered, A/B, or the
 * altered rendition alone), collects the answer draft, scores, logs and auto-proceeds. Keyboard:
 * Space (start / next / hear again), R (hear again), Enter (answer, or next once answered), Esc (end), 1–9/0 (slot),
 * letters for diagnoses (see DIAGNOSIS_KEYS), A/B for A/B questions, Backspace (clear).
 * USB piano: playing a note fills in the "fix" note when one is asked for.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { claimKey } from "@/lib/keys";
import { toast } from "sonner";
import { getEngine, useEngineStore } from "@/lib/audio/engine";
import { getInstrument, instrumentLabel } from "@/lib/audio/instruments";
import { getMidi } from "@/lib/midi/midi";
import { beatsToMs } from "@/lib/music/score";
import { pitchClassOf } from "@/lib/music/notes";
import { useLatest } from "@/lib/hooks/use-latest";
import { endSession, logAttempt, startSession } from "@/lib/db/actions";
import { levelTags } from "@/lib/practice/level-run";
import { useMistakesSettings, type MistakesSettings } from "@/lib/mistakes/settings";
import { assignInstruments, buildQuestion, enabledTypes } from "@/lib/mistakes/material";
import { canSubmit, diagnosesFor, plantedOf, scoreAnswer } from "@/lib/mistakes/plant";
import {
  DIAGNOSIS_KEYS,
  EMPTY_ANSWER,
  asksAmount,
  fixKindFor,
  isDrift,
  type Answer,
  type Diagnosis,
  type Material,
  type MistakeNote,
  type MistakeQuestion,
  type Planted,
} from "@/lib/mistakes/types";

export type QuizPhase = "idle" | "loading" | "question" | "answered" | "ended";

export interface Rendition {
  label: "clean" | "altered";
  /** "A" / "B" for A/B questions. */
  ab?: "A" | "B";
  offsetMs: number;
  durationMs: number;
  notes: MistakeNote[];
}

export interface PlaybackPlan {
  renditions: Rendition[];
  totalMs: number;
}

export interface Playback {
  /** performance.now() at which the plan starts sounding. */
  startedAt: number;
  plan: PlaybackPlan;
}

export interface Asked {
  id: number;
  q: MistakeQuestion;
  planted: Planted;
  material: Material;
  /** Instrument id per voice index. */
  instruments: Record<number, string>;
  diagnoses: Diagnosis[];
}

export interface HistoryEntry {
  asked: Asked;
  answer: Answer;
  scored: ReturnType<typeof scoreAnswer>;
  responseMs: number;
}

const GAP_MS = 900;
const TAIL_MS = 350;
const CLICK_INSTRUMENT = "gm:woodblock";

export function buildPlan(q: MistakeQuestion, m: Material, mode: "question" | "clean" | "altered"): PlaybackPlan {
  const planted = plantedOf(q);
  const durationMs = beatsToMs(m.totalBeats, m.bpm) + TAIL_MS;
  const clean: Rendition = { label: "clean", offsetMs: 0, durationMs, notes: m.notes };
  const altered: Rendition = { label: "altered", offsetMs: 0, durationMs, notes: planted.altered };
  let seq: Rendition[];
  if (mode === "clean") seq = [clean];
  else if (mode === "altered") seq = [altered];
  else if (q.type === "ab") seq = q.cleanIs === "A" ? [{ ...clean, ab: "A" }, { ...altered, ab: "B" }] : [{ ...altered, ab: "A" }, { ...clean, ab: "B" }];
  else seq = planted.referenceFirst ? [clean, altered] : [altered];
  let t = 0;
  const renditions = seq.map((r) => {
    const out = { ...r, offsetMs: t };
    t += r.durationMs + GAP_MS;
    return out;
  });
  return { renditions, totalMs: t - GAP_MS };
}

/** Which rendition / beat is sounding at wall-clock `now`. */
export function playbackPosition(pb: Playback | null, now: number, bpm: number): { rendition: Rendition; beat: number } | null {
  if (!pb) return null;
  const elapsed = now - pb.startedAt;
  if (elapsed < 0 || elapsed > pb.plan.totalMs) return null;
  for (const r of pb.plan.renditions) {
    if (elapsed >= r.offsetMs && elapsed < r.offsetMs + r.durationMs) return { rendition: r, beat: ((elapsed - r.offsetMs) * bpm) / 60000 };
  }
  return null;
}

export function useMistakesQuiz() {
  const settings = useMistakesSettings((s) => s.settings);
  const settingsRef = useLatest(settings);
  const engineLoading = useEngineStore((s) => s.loading);

  const [phase, setPhase] = useState<QuizPhase>("idle");
  const [asked, setAsked] = useState<Asked | null>(null);
  const [draft, setDraft] = useState<Answer>(EMPTY_ANSWER);
  const [scored, setScored] = useState<HistoryEntry["scored"] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [replays, setReplays] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);

  const phaseRef = useLatest(phase);
  const askedRef = useLatest(asked);
  const draftRef = useLatest(draft);
  const historyRef = useRef<HistoryEntry[]>([]);
  const askedAtRef = useRef(0);
  const replaysRef = useRef(0);
  const sessionIdRef = useRef<number | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const clearTimer = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
  };

  // ----- playback -----
  const play = useCallback(async (a: Asked, mode: "question" | "clean" | "altered") => {
    const s = settingsRef.current;
    const engine = getEngine();
    await engine.resume();
    engine.stopAll();
    const plan = buildPlan(a.q, a.material, mode);
    const m = a.material;
    const events: { instrumentId: string; midi: number; at: number; duration: number; velocity: number; detune: number }[] = [];
    for (const r of plan.renditions) {
      for (const n of r.notes) {
        const instrumentId = a.instruments[n.voice] ?? a.instruments[m.voices[0]] ?? s.instrumentId;
        events.push({
          instrumentId,
          midi: n.midi,
          at: (r.offsetMs + beatsToMs(n.start, m.bpm)) / 1000,
          duration: Math.max(0.12, (beatsToMs(n.duration, m.bpm) / 1000) * 0.95),
          velocity: n.velocity ?? 90,
          detune: n.detune ?? 0,
        });
      }
      if (s.clickTrack && getInstrument(CLICK_INSTRUMENT)) {
        const beats = Math.ceil(m.totalBeats - 1e-6);
        for (let b = 0; b < beats; b++) {
          events.push({ instrumentId: CLICK_INSTRUMENT, midi: b % m.beatsPerBar === 0 ? 76 : 72, at: (r.offsetMs + beatsToMs(b, m.bpm)) / 1000, duration: 0.08, velocity: b % m.beatsPerBar === 0 ? 70 : 45, detune: 0 });
        }
      }
    }
    try {
      await engine.playNotes(events);
      setPlayback({ startedAt: performance.now() + 50, plan });
    } catch (err) {
      toast.error(`Playback failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [settingsRef]);

  // ----- lifecycle -----
  const finish = useCallback(() => {
    clearTimer();
    getEngine().stopAll();
    setPhase("ended");
    setPlayback(null);
    const id = sessionIdRef.current;
    if (id) endSession(id).catch(() => {});
    sessionIdRef.current = null;
  }, []);

  const askNext = useCallback(async () => {
    clearTimer();
    const s = settingsRef.current;
    if (s.questionCount > 0 && historyRef.current.length >= s.questionCount) {
      finish();
      return;
    }
    setPhase("loading");
    setScored(null);
    setPlayback(null);
    let q: MistakeQuestion;
    try {
      q = await buildQuestion(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setPhase(historyRef.current.length ? "ended" : "idle");
      return;
    }
    const planted = plantedOf(q);
    const material = planted.material;
    const instruments = assignInstruments(material, s);
    const ids = [...new Set(Object.values(instruments))];
    if (s.clickTrack && getInstrument(CLICK_INSTRUMENT)) ids.push(CLICK_INSTRUMENT);
    const engine = getEngine();
    const missing = ids.filter((id) => !engine.isLoaded(id));
    if (missing.length) {
      setLoadingLabel(missing.map(instrumentLabel).join(", "));
      try {
        await Promise.all(missing.map((id) => engine.load(id)));
      } catch (err) {
        toast.error(`Could not load an instrument: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoadingLabel(null);
      }
    }
    const diagnoses = diagnosesFor(material, enabledTypes(s));
    const a: Asked = { id: ++idRef.current, q, planted, material, instruments, diagnoses };
    // pre-select the diagnosis when there is only one possible answer to that part
    const preset: Answer = { ...EMPTY_ANSWER, diagnosis: q.type !== "ab" && diagnoses.length === 1 ? diagnoses[0] : null };
    setAsked(a);
    setDraft(preset);
    replaysRef.current = 0;
    setReplays(0);
    setPhase("question");
    askedAtRef.current = performance.now();
    await play(a, "question");
  }, [settingsRef, finish, play]);

  const start = useCallback(async () => {
    await getEngine().resume();
    historyRef.current = [];
    setHistory([]);
    setAsked(null);
    const s = settingsRef.current;
    startSession({ mode: "mistakes", settings: s })
      .then((id) => {
        sessionIdRef.current = id;
      })
      .catch((err) => toast.error(`Could not start a session log: ${err instanceof Error ? err.message : err}`));
    await askNext();
  }, [settingsRef, askNext]);

  const hearAgain = useCallback(
    (mode: "question" | "clean" | "altered" = "question") => {
      const a = askedRef.current;
      if (!a) return;
      if (phaseRef.current === "question") {
        if (settingsRef.current.oneListen) {
          toast("One listen only in this drill");
          return;
        }
        replaysRef.current++;
        setReplays(replaysRef.current);
      }
      play(a, mode);
    },
    [askedRef, phaseRef, settingsRef, play]
  );

  const submit = useCallback(() => {
    const a = askedRef.current;
    const d = draftRef.current;
    if (!a || phaseRef.current !== "question") return;
    if (!canSubmit(a.q, d)) {
      toast("Pick where the problem is and what it is first");
      return;
    }
    const s = settingsRef.current;
    const result = scoreAnswer(a.q, d);
    const responseMs = performance.now() - askedAtRef.current;
    const entry: HistoryEntry = { asked: a, answer: d, scored: result, responseMs };
    historyRef.current = [...historyRef.current, entry];
    setHistory(historyRef.current);
    setScored(result);
    setPhase("answered");

    const p = a.planted;
    const m = a.material;
    logAttempt({
      sessionId: sessionIdRef.current,
      mode: "mistakes",
      instrumentId: a.instruments[m.voices[0]] ?? s.instrumentId,
      target: {
        type: a.q.type,
        inner: a.q.type === "ab" ? p.type : undefined,
        cleanIs: a.q.type === "ab" ? a.q.cleanIs : undefined,
        source: m.kind,
        slotKind: p.slotKind,
        locationBy: p.locationBy,
        index: p.index,
        voice: p.voice ?? null,
        cents: p.cents ?? null,
        shiftBeats: p.shiftBeats ?? null,
        original: p.original,
        altered: p.wrong,
        description: p.description,
        slots: p.slots.length,
        notes: m.notes.length,
        voices: m.voices.length,
        referenceFirst: p.referenceFirst,
        label: m.label,
        sourceRef: m.sourceRef ?? null,
      },
      answer: { ...d, locationOk: result.locationOk, locationPartial: result.locationPartial, diagnosisOk: result.diagnosisOk, fixOk: result.fixOk, amountOk: result.amountOk },
      correct: result.correct,
      score: result.score,
      responseMs,
      replays: replaysRef.current,
      ...levelTags("mistakes"),
    }).catch((err) => console.warn("logAttempt failed", err));

    // Right: move on after a short pause. Wrong: hold the feedback until Space / Enter / click.
    if (s.autoProceed && result.correct) autoTimer.current = setTimeout(() => askNext(), s.correctPauseMs);
  }, [askedRef, draftRef, phaseRef, settingsRef, askNext]);

  /** Is anything optional still open (fix / amount / A-B diagnosis)? */
  const optionalPending = useCallback((a: Asked, d: Answer) => {
    const s = settingsRef.current;
    if (a.q.type === "ab") return s.askFix && d.diagnosis === null;
    if (s.askFix && fixKindFor(d.diagnosis) && d.fix === null) return true;
    if (s.askAmount && asksAmount(d.diagnosis) && d.amount === null) return true;
    return false;
  }, [settingsRef]);

  const patchDraft = useCallback(
    (patch: Partial<Answer>) => {
      const a = askedRef.current;
      if (!a || phaseRef.current !== "question") return;
      const next = { ...draftRef.current, ...patch };
      // a changed diagnosis invalidates a fix / amount of another kind
      if (patch.diagnosis !== undefined && patch.diagnosis !== draftRef.current.diagnosis) {
        if (fixKindFor(patch.diagnosis) !== fixKindFor(draftRef.current.diagnosis)) next.fix = null;
        if (!asksAmount(patch.diagnosis)) next.amount = null;
      }
      draftRef.current = next;
      setDraft(next);
      if (canSubmit(a.q, next) && !optionalPending(a, next)) submit();
    },
    [askedRef, phaseRef, draftRef, optionalPending, submit]
  );

  const clearDraft = useCallback(() => {
    const a = askedRef.current;
    if (!a || phaseRef.current !== "question") return;
    const preset: Answer = { ...EMPTY_ANSWER, diagnosis: a.q.type !== "ab" && a.diagnoses.length === 1 ? a.diagnoses[0] : null };
    draftRef.current = preset;
    setDraft(preset);
  }, [askedRef, phaseRef, draftRef]);

  // ----- silent instrument: the engine drops it; replace the question it was asked in -----
  useEffect(
    () =>
      getEngine().onSilence(() => {
        if (phaseRef.current !== "question") return;
        clearTimer();
        askNext();
      }),
    [phaseRef, askNext]
  );

  // ----- USB piano: a played note is the "fix" note -----
  useEffect(() => {
    if (!settings.midiInput) return;
    getMidi().init();
    return getMidi().subscribe((ev) => {
      if (ev.type !== "noteon") return;
      const a = askedRef.current;
      if (!a || phaseRef.current !== "question" || !settingsRef.current.midiInput) return;
      const d = draftRef.current;
      if (a.q.type === "ab") return;
      if (fixKindFor(d.diagnosis) === "note") patchDraft({ fix: { kind: "note", pc: pitchClassOf(ev.note) } });
    });
  }, [settings.midiInput, askedRef, phaseRef, settingsRef, draftRef, patchDraft]);

  // ----- keyboard -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const p = phaseRef.current;
      const a = askedRef.current;
      if (e.code === "Space") {
        claimKey(e);
        if (p === "idle" || p === "ended") start();
        else if (p === "answered") askNext();
        else if (p === "question") hearAgain();
        return;
      }
      if (e.key === "Escape") {
        if (p === "question" || p === "answered") finish();
        return;
      }
      if (e.key === "Enter") {
        if (p === "question") {
          e.preventDefault();
          submit();
        } else if (p === "answered") {
          e.preventDefault();
          askNext();
        }
        return;
      }
      if (e.key === "Backspace") {
        if (p === "question") {
          e.preventDefault();
          clearDraft();
        }
        return;
      }
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (key === "R") {
        e.preventDefault();
        hearAgain();
        return;
      }
      if (p !== "question" || !a) return;
      if (a.q.type === "ab") {
        if (key === "A" || key === "B") {
          e.preventDefault();
          patchDraft({ choice: key });
          return;
        }
      } else if (/^[0-9]$/.test(key)) {
        const idx = key === "0" ? 9 : Number(key) - 1;
        if (idx < a.planted.slots.length) {
          e.preventDefault();
          patchDraft({ index: idx });
        }
        return;
      }
      // diagnosis letters (shift = the "voice drifts" variants)
      const want = (e.shiftKey ? "⇧" : "") + key;
      const diag = (Object.keys(DIAGNOSIS_KEYS) as Diagnosis[]).find((d) => DIAGNOSIS_KEYS[d] === want && a.diagnoses.includes(d));
      if (diag) {
        e.preventDefault();
        patchDraft({ diagnosis: diag });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phaseRef, askedRef, start, askNext, hearAgain, finish, submit, clearDraft, patchDraft]);

  useEffect(() => () => clearTimer(), []);

  const inQuiz = phase === "question" || phase === "answered" || phase === "loading";
  const correctCount = useMemo(() => history.filter((h) => h.scored.correct).length, [history]);
  const remaining = settings.questionCount > 0 ? Math.max(0, settings.questionCount - history.length) : null;

  return {
    settings,
    phase,
    asked,
    draft,
    scored,
    history,
    replays,
    loadingLabel,
    engineLoading,
    playback,
    inQuiz,
    answeredCount: history.length,
    correctCount,
    remaining,
    lastResponseMs: history[history.length - 1]?.responseMs ?? 0,
    start,
    askNext,
    hearAgain,
    finish,
    submit,
    patchDraft,
    clearDraft,
    /** True when the draft could be submitted now. */
    canSubmit: asked ? canSubmit(asked.q, draft) : false,
    /** Whether the diagnosis being edited wants a voice as well as a beat. */
    needsVoice: asked ? asked.material.voices.length > 1 && asked.planted.slotKind === "beat" : false,
    isDriftDraft: isDrift(draft.diagnosis),
  };
}

export type MistakesQuizApi = ReturnType<typeof useMistakesQuiz>;
export type { MistakesSettings };
