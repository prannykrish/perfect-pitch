"use client";

import type { ReactNode } from "react";
import { CheckIcon, PlayIcon, RotateCcwIcon, SquareIcon } from "lucide-react";
import { useIsPhone } from "@/lib/hooks/use-media";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { PhoneStage } from "@/components/phone-stage";
import type { QuizApi } from "./use-quiz";

export interface QuizShellProps {
  quiz: Pick<
    QuizApi<unknown, unknown>,
    | "phase"
    | "settings"
    | "replays"
    | "loadingLabel"
    | "engineLoading"
    | "start"
    | "askNext"
    | "hearAgain"
    | "markCorrect"
    | "finish"
    | "inQuiz"
    | "answeredCount"
    | "correctCount"
    | "remaining"
    | "scored"
  >;
  title: string;
  idleText: string;
  questionText: string;
  /** Rendered in the answered phase above the answer UI. */
  feedback?: ReactNode;
  /** Extra transport buttons shown while answered (e.g. "Hear my answer"). */
  extraButtons?: ReactNode;
  /** Rendered under the card when the quiz has ended. */
  summary?: ReactNode;
  /** On the phone's fixed screen the feedback row is a set height; modes whose feedback runs to several lines ask for the taller one. */
  tallFeedback?: boolean;
  children?: ReactNode;
}

export function QuizShell({ quiz, title, idleText, questionText, feedback, extraButtons, summary, tallFeedback, children }: QuizShellProps) {
  const { phase, settings, replays, loadingLabel, engineLoading, inQuiz, answeredCount, correctCount, remaining, scored } = quiz;
  const phone = useIsPhone();

  const statusText =
    phase === "idle"
      ? idleText
      : phase === "loading"
        ? loadingLabel
          ? `Loading ${loadingLabel}…`
          : "Loading…"
        : phase === "question"
          ? questionText
          : phase === "answered"
            ? scored?.correct
              ? "Correct."
              : scored && scored.score > 0
                ? "Partly right."
                : "Not quite."
            : "Quiz finished.";

  const score = (
    <>
      <Badge variant="secondary">
        {correctCount}/{answeredCount} {answeredCount ? `(${Math.round((100 * correctCount) / answeredCount)}%)` : ""}
      </Badge>
      {remaining !== null && <Badge variant="outline">{remaining} left</Badge>}
      {engineLoading.length > 0 && (
        <Badge variant="outline" className="animate-pulse">
          loading {engineLoading.length}
        </Badge>
      )}
    </>
  );
  const replaysLeft = settings.replayLimit !== "unlimited" && phase === "question" && (
    <span className="text-xs text-muted-foreground">({settings.replayLimit === "one" ? Math.max(0, 1 - replays) : 0} left)</span>
  );

  // ----- the phone: one fixed screen (see phone-stage.tsx) -----
  if (phone) {
    return (
      <PhoneStage
        title={title}
        levelStore="trainer"
        status={statusText}
        feedback={phase === "answered" ? feedback : undefined}
        tallStatus={tallFeedback}
        score={score}
        inQuiz={inQuiz}
        ended={phase === "ended"}
        onEnd={quiz.finish}
        transport={
          !inQuiz ? (
            <Button onClick={quiz.start}>
              <PlayIcon /> {phase === "ended" ? "Practice again" : "Start"}
            </Button>
          ) : (
            <>
              <Button onClick={quiz.askNext} disabled={phase !== "answered"}>
                <PlayIcon /> Hear next
              </Button>
              <Button variant="outline" onClick={quiz.hearAgain} disabled={phase === "loading"}>
                <RotateCcwIcon /> Hear again {replaysLeft}
              </Button>
            </>
          )
        }
        extras={
          phase === "answered" && (
            <>
              {extraButtons}
              {scored && !scored.correct && (
                <Button variant="outline" onClick={quiz.markCorrect}>
                  <CheckIcon /> I was right
                </Button>
              )}
            </>
          )
        }
        summary={summary}
      >
        {children}
      </PhoneStage>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{statusText}</CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm tabular-nums">{score}</div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {!inQuiz ? (
              <Button size="lg" onClick={quiz.start}>
                <PlayIcon /> {phase === "ended" ? "Practice again" : "Start"} <Kbd>Space</Kbd>
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={quiz.askNext} disabled={phase !== "answered"}>
                  <PlayIcon /> Hear next <Kbd>Space</Kbd>
                </Button>
                <Button size="lg" variant="outline" onClick={quiz.hearAgain} disabled={phase === "loading"}>
                  <RotateCcwIcon /> Hear again {phase === "question" && <Kbd>Space</Kbd>} <Kbd>R</Kbd>
                  {replaysLeft}
                </Button>
                {phase === "answered" && extraButtons}
                {phase === "answered" && scored && !scored.correct && (
                  <Button size="lg" variant="outline" onClick={quiz.markCorrect}>
                    <CheckIcon /> I was right <Kbd>C</Kbd>
                  </Button>
                )}
                <Button size="lg" variant="ghost" onClick={quiz.finish} className="ml-auto">
                  <SquareIcon /> End quiz <Kbd>Esc</Kbd>
                </Button>
              </>
            )}
          </div>
          {phase === "answered" && feedback}
          {children}
        </CardContent>
      </Card>
      {phase === "ended" && summary}
    </div>
  );
}

/**
 * Green/red feedback banner used by every mode.
 *
 * `sideways:` = a phone on its side, where the result has one short row of the screen
 * (phone-stage.tsx). `oneLine` is for a result that is a single line of text: there it never wraps,
 * and whatever does not fit is cut at the banner's edge rather than making it taller.
 */
export function FeedbackBanner({ correct, partial, oneLine, children }: { correct: boolean; partial?: boolean; oneLine?: boolean; children: ReactNode }) {
  const tone = correct ? "border-green-500/50 bg-green-500/10" : partial ? "border-amber-500/50 bg-amber-500/10" : "border-red-500/50 bg-red-500/10";
  const line = oneLine ? "sideways:flex-nowrap sideways:overflow-hidden sideways:whitespace-nowrap" : "";
  return <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 max-sm:gap-x-2 max-sm:gap-y-1 max-sm:px-3 max-sm:py-2 sideways:gap-x-2 sideways:gap-y-0.5 sideways:px-3 sideways:py-1 ${line} ${tone}`}>{children}</div>;
}
