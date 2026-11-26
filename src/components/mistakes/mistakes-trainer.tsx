"use client";

/**
 * Find the Mistake: the quiz card. Plays material with one planted problem, shows the answer
 * timeline, then the feedback (what was planted, the diff on a piano roll, clean vs mistake
 * replays) and an end-of-session summary.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, PlayIcon, RotateCcwIcon, SquareIcon, XIcon, SparklesIcon, BugIcon } from "lucide-react";
import { instrumentLabel } from "@/lib/audio/instruments";
import { beatsToMs } from "@/lib/music/score";
import { CENTS_BUCKETS } from "@/lib/trainer/generators";
import { PROBLEM_LABELS, MATERIAL_LABELS, DIAGNOSIS_LABELS } from "@/lib/mistakes/types";
import { describeAnswer } from "@/lib/mistakes/plant";
import { useLatest } from "@/lib/hooks/use-latest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { PianoRoll, RollLegend, type RollNote } from "@/components/piano-roll";
import { FeedbackBanner } from "@/components/trainer/quiz-shell";
import { PhoneStage } from "@/components/phone-stage";
import { useIsPhone } from "@/lib/hooks/use-media";
import { SessionSummary, rowsFrom, pct } from "@/components/trainer/session-summary";
import { AnswerTimeline } from "./answer-timeline";
import { playbackPosition, useMistakesQuiz } from "./use-mistakes-quiz";

interface NowPlaying {
  slot: number | null;
  label: string | null;
  ab: "A" | "B" | null;
}
const NOTHING_PLAYING: NowPlaying = { slot: null, label: null, ab: null };

export function MistakesTrainer() {
  const quiz = useMistakesQuiz();
  const phone = useIsPhone();
  const { settings, phase, asked, draft, scored, history, playback } = quiz;
  const buckets = useMemo(() => {
    const b = CENTS_BUCKETS.filter((c) => c >= settings.centsMin && c <= settings.centsMax);
    return b.length ? b : [settings.centsMax];
  }, [settings.centsMin, settings.centsMax]);

  // ----- playhead: which slot / rendition is sounding -----
  const [now, setNow] = useState<NowPlaying>(NOTHING_PLAYING);
  const nowRef = useRef(0);
  const askedRef = useLatest(asked);
  useEffect(() => {
    if (!playback) return;
    let raf = 0;
    let last: NowPlaying = NOTHING_PLAYING;
    const tick = () => {
      const a = askedRef.current;
      const pos = a ? playbackPosition(playback, performance.now(), a.material.bpm) : null;
      let next: NowPlaying = NOTHING_PLAYING;
      if (pos && a) {
        nowRef.current = beatsToMs(pos.beat, a.material.bpm);
        const slot = a.planted.slots.findIndex((s) => pos.beat >= s.start && pos.beat < s.end);
        const ab = pos.rendition.ab ?? null;
        const label = ab ? `Playing ${ab}` : pos.rendition.label === "clean" ? "Playing the clean version" : a.planted.referenceFirst ? "Playing the version with the mistake" : "Playing";
        next = { slot: slot < 0 ? null : slot, label, ab };
      } else nowRef.current = 0;
      if (next.slot !== last.slot || next.label !== last.label || next.ab !== last.ab) {
        last = next;
        setNow(next);
      }
      if (performance.now() - playback.startedAt <= playback.plan.totalMs + 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playback, askedRef]);
  // a new question clears the playback, so anything left over from the last one is ignored
  const { slot: nowSlot, label: nowLabel, ab: nowAb } = playback ? now : NOTHING_PLAYING;

  // ----- piano roll -----
  const showRoll = !!asked && (phase === "answered" || (phase === "question" && settings.showRollWhileAnswering));
  const rollNotes = useMemo<RollNote[]>(() => {
    if (!asked) return [];
    const { planted, material } = asked;
    const bpm = material.bpm;
    const out: RollNote[] = [];
    const changed = new Set(planted.changedIndexes);
    if (phase === "answered") {
      for (const i of planted.changedIndexes) {
        const o = material.notes[i];
        out.push({ midi: o.midi, startMs: beatsToMs(o.start, bpm), endMs: beatsToMs(o.start + o.duration, bpm), kind: "ghost" });
      }
      planted.altered.forEach((n, i) => {
        out.push({ midi: n.midi, startMs: beatsToMs(n.start, bpm), endMs: beatsToMs(n.start + n.duration, bpm), kind: changed.has(i) ? "wrong" : "played", velocity: n.velocity });
      });
    } else {
      for (const n of planted.altered) out.push({ midi: n.midi, startMs: beatsToMs(n.start, bpm), endMs: beatsToMs(n.start + n.duration, bpm), kind: "played", velocity: n.velocity });
    }
    return out;
  }, [asked, phase]);
  const notesRef = useLatest<RollNote[]>(rollNotes);
  const rollDurationMs = asked ? beatsToMs(asked.material.totalBeats, asked.material.bpm) + 200 : 4000;
  const rollRange = useMemo<[number, number]>(() => {
    if (!asked) return [48, 84];
    const all = [...asked.material.notes.map((n) => n.midi), ...asked.planted.altered.map((n) => n.midi)];
    return [Math.max(21, Math.min(...all) - 3), Math.min(108, Math.max(...all) + 3)];
  }, [asked]);

  // ----- summary -----
  const typeOf = (h: (typeof history)[number]) => (h.asked.q.type === "ab" ? `A/B · ${PROBLEM_LABELS[h.asked.planted.type]}` : PROBLEM_LABELS[h.asked.planted.type]);
  const summary = history.length > 0 && (
    <SessionSummary
      total={history.length}
      correct={quiz.correctCount}
      avgScore={history.reduce((a, h) => a + h.scored.score, 0) / history.length}
      avgMs={Math.round(history.reduce((a, h) => a + h.responseMs, 0) / history.length)}
      breakdowns={[
        {
          title: "By problem type",
          rows: rowsFrom(history, typeOf, (h) => h.scored.correct).map((r) => ({
            ...r,
            extra: pct(history.filter((h) => typeOf(h) === r.label && h.scored.locationOk).length, r.total),
          })),
          extraHeader: "Location right",
        },
        {
          title: "By cents (detuned note / drift)",
          rows: rowsFrom(
            history.filter((h) => h.asked.planted.cents !== undefined && h.asked.q.type !== "ab"),
            (h) => `${Math.abs(h.asked.planted.cents ?? 0)} cents`,
            (h) => h.scored.correct,
            "label"
          ).map((r) => ({
            ...r,
            extra: pct(history.filter((h) => h.asked.q.type !== "ab" && h.asked.planted.cents !== undefined && `${Math.abs(h.asked.planted.cents)} cents` === r.label && h.scored.diagnosisOk).length, r.total),
          })),
          extraHeader: "Direction right",
        },
        { title: "By source", rows: rowsFrom(history, (h) => MATERIAL_LABELS[h.asked.material.kind], (h) => h.scored.correct) },
        {
          title: "Fix named (bonus)",
          rows: rowsFrom(
            history.filter((h) => h.scored.fixOk !== null),
            (h) => (h.asked.q.type === "ab" ? "A/B: what was wrong" : `${DIAGNOSIS_LABELS[h.asked.planted.diagnosis]} fix`),
            (h) => h.scored.fixOk === true
          ),
        },
      ]}
      misses={history
        .filter((h) => !h.scored.correct)
        .slice(-10)
        .reverse()
        .map((h) => ({
          target: h.asked.planted.description,
          answer: describeAnswer(h.asked.q, h.answer),
          instrumentId: h.asked.instruments[h.asked.material.voices[0]] ?? settings.instrumentId,
          responseMs: h.responseMs,
        }))}
    />
  );

  const instruments = asked ? [...new Set(Object.values(asked.instruments))].map(instrumentLabel).join(", ") : "";

  const statusText =
    phase === "idle"
      ? "One problem is planted in what you hear. Point at where it is and say what it is. Press Space or Start."
      : phase === "loading"
        ? quiz.loadingLabel
          ? `Loading ${quiz.loadingLabel}…`
          : "Building the question…"
        : phase === "question"
          ? (nowLabel ?? (asked?.q.type === "ab" ? "Which one was clean?" : "Where is the problem, and what is it?"))
          : phase === "answered"
            ? scored?.correct
              ? "Correct."
              : scored && scored.score > 0
                ? "Partly right."
                : "Not quite."
            : "Session finished.";
  const materialText = asked && (phase === "question" || phase === "answered") && (
    <span className="ml-1 text-muted-foreground">
      · {asked.material.label} · {instruments}
      {asked.q.type !== "ab" && asked.planted.referenceFirst && " · clean version first"}
    </span>
  );
  const score = (
    <>
      <Badge variant="secondary">
        {quiz.correctCount}/{quiz.answeredCount} {quiz.answeredCount ? `(${Math.round((100 * quiz.correctCount) / quiz.answeredCount)}%)` : ""}
      </Badge>
      {quiz.remaining !== null && <Badge variant="outline">{quiz.remaining} left</Badge>}
      {quiz.engineLoading.length > 0 && (
        <Badge variant="outline" className="animate-pulse">
          loading {quiz.engineLoading.length}
        </Badge>
      )}
    </>
  );
  /** What was planted and how each part of the answer did. */
  const verdictBadges = asked && scored && (
    <div className="flex flex-wrap gap-2 text-xs">
      <Badge variant="outline">{asked.q.type === "ab" ? `A/B · ${PROBLEM_LABELS[asked.planted.type]}` : PROBLEM_LABELS[asked.planted.type]}</Badge>
      <Badge variant={scored.locationOk ? "secondary" : "destructive"}>{asked.q.type === "ab" ? "choice" : "location"} {scored.locationOk ? "✓" : scored.locationPartial ? "½ (right beat, wrong voice)" : "✗"}</Badge>
      {asked.q.type !== "ab" && <Badge variant={scored.diagnosisOk ? "secondary" : "destructive"}>diagnosis {scored.diagnosisOk ? "✓" : "✗"}</Badge>}
      {scored.fixOk !== null && <Badge variant={scored.fixOk ? "secondary" : "outline"}>{asked.q.type === "ab" ? "what was wrong" : "fix"} {scored.fixOk ? "✓" : "✗"} (bonus)</Badge>}
      {scored.amountOk !== null && <Badge variant={scored.amountOk ? "secondary" : "outline"}>amount {scored.amountOk ? "✓" : "✗"} (bonus)</Badge>}
      {!scored.correct && <span className="text-muted-foreground">you said: {describeAnswer(asked.q, draft)}</span>}
    </div>
  );
  const timeline = asked && (phase === "question" || phase === "answered") && (
    <AnswerTimeline
      asked={asked}
      draft={draft}
      phase={phase}
      scored={scored}
      onPatch={quiz.patchDraft}
      onSubmit={quiz.submit}
      onClear={quiz.clearDraft}
      canSubmit={quiz.canSubmit}
      nowSlot={nowSlot}
      nowAb={nowAb}
      askFix={settings.askFix}
      askAmount={settings.askAmount}
      buckets={buckets}
    />
  );
  const roll = showRoll && (
    <div className="flex flex-col gap-2">
      <PianoRoll notesRef={notesRef} nowRef={nowRef} mode="static" durationMs={rollDurationMs} low={rollRange[0]} high={rollRange[1]} height={220} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RollLegend kinds={phase === "answered" ? ["played", "wrong", "ghost"] : ["played"]} />
        {phase === "answered" && <span className="text-xs text-muted-foreground">red = what was played there, grey = what it should have been (a detuned note keeps its pitch)</span>}
      </div>
    </div>
  );

  // ----- the phone: one fixed screen (see phone-stage.tsx). The answer form is taller than a phone, so that part scrolls. -----
  if (phone) {
    return (
      <PhoneStage
        title="Find the Mistake"
        levelStore="mistakes"
        tallStatus
        status={
          <>
            {statusText}
            {materialText}
          </>
        }
        feedback={
          phase === "answered" && asked && scored ? (
            <FeedbackBanner correct={scored.correct} partial={scored.score > 0}>
              {scored.correct ? <CheckIcon className="size-5 shrink-0 text-green-500" /> : <XIcon className="size-5 shrink-0 text-red-500" />}
              <div className="min-w-0 flex-1 text-base leading-snug font-semibold">
                {asked.q.type === "ab" && <span className="mr-2 text-muted-foreground">{asked.q.cleanIs} was clean.</span>}
                {asked.planted.description}
              </div>
              <div className="w-full text-right text-xs text-muted-foreground">
                {Math.round(scored.score * 100)}% · {Math.round(quiz.lastResponseMs)} ms
              </div>
            </FeedbackBanner>
          ) : undefined
        }
        score={score}
        inQuiz={quiz.inQuiz}
        ended={phase === "ended"}
        onEnd={quiz.finish}
        transport={
          !quiz.inQuiz ? (
            <Button onClick={quiz.start}>
              <PlayIcon /> {phase === "ended" ? "Practice again" : "Start"}
            </Button>
          ) : (
            <>
              <Button onClick={quiz.askNext} disabled={phase !== "answered"}>
                <PlayIcon /> Hear next
              </Button>
              <Button variant="outline" onClick={() => quiz.hearAgain()} disabled={phase === "loading"}>
                <RotateCcwIcon /> Hear again
                {settings.oneListen && phase === "question" && <span className="text-xs text-muted-foreground">(one listen)</span>}
              </Button>
            </>
          )
        }
        extras={
          phase === "answered" && (
            <>
              <Button variant="outline" onClick={() => quiz.hearAgain("clean")}>
                <SparklesIcon /> Clean version
              </Button>
              <Button variant="outline" onClick={() => quiz.hearAgain("altered")}>
                <BugIcon /> The mistake
              </Button>
            </>
          )
        }
        summary={summary}
      >
        <div className="flex flex-col gap-4 pb-2">
          {phase === "answered" && verdictBadges}
          {timeline}
          {roll}
        </div>
      </PhoneStage>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Find the Mistake</CardTitle>
              <CardDescription>
                {statusText}
                {materialText}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm tabular-nums">{score}</div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {!quiz.inQuiz ? (
              <Button size="lg" onClick={quiz.start}>
                <PlayIcon /> {phase === "ended" ? "Practice again" : "Start"} <Kbd>Space</Kbd>
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={quiz.askNext} disabled={phase !== "answered"}>
                  <PlayIcon /> Hear next <Kbd>Space</Kbd>
                </Button>
                <Button size="lg" variant="outline" onClick={() => quiz.hearAgain()} disabled={phase === "loading"}>
                  <RotateCcwIcon /> Hear again {phase === "question" && <Kbd>Space</Kbd>} <Kbd>R</Kbd>
                  {settings.oneListen && phase === "question" && <span className="text-xs text-muted-foreground">(one listen)</span>}
                </Button>
                {phase === "answered" && (
                  <>
                    <Button size="lg" variant="outline" onClick={() => quiz.hearAgain("clean")}>
                      <SparklesIcon /> Hear the clean version
                    </Button>
                    <Button size="lg" variant="outline" onClick={() => quiz.hearAgain("altered")}>
                      <BugIcon /> Hear the mistake again
                    </Button>
                  </>
                )}
                <Button size="lg" variant="ghost" onClick={quiz.finish} className="ml-auto">
                  <SquareIcon /> End <Kbd>Esc</Kbd>
                </Button>
              </>
            )}
          </div>

          {phase === "answered" && asked && scored && (
            <FeedbackBanner correct={scored.correct} partial={scored.score > 0}>
              {scored.correct ? <CheckIcon className="size-6 text-green-500" /> : <XIcon className="size-6 text-red-500" />}
              <div className="flex flex-col gap-1">
                <div className="text-lg font-semibold">
                  {asked.q.type === "ab" && <span className="mr-2 text-muted-foreground">{asked.q.cleanIs} was clean.</span>}
                  {asked.planted.description}
                </div>
                {verdictBadges}
              </div>
              <div className="ml-auto text-sm text-muted-foreground">
                {Math.round(scored.score * 100)}% · {Math.round(quiz.lastResponseMs)} ms
              </div>
            </FeedbackBanner>
          )}

          {timeline}
          {roll}

          {phase === "question" && !showRoll && (
            <p className="text-xs text-muted-foreground">
              The piano roll appears after you answer.
              <span className="touch:hidden">
                {" "}
                <Kbd>R</Kbd> replays{settings.oneListen ? " (off in one-listen mode)" : ""}.
              </span>
            </p>
          )}
        </CardContent>
      </Card>
      {phase === "ended" && summary}
    </div>
  );
}
