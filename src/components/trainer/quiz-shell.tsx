"use client";

import type { ReactNode } from "react";
import { PlayIcon, RotateCcwIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
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
  children?: ReactNode;
}

export function QuizShell({ quiz, title, idleText, questionText, feedback, extraButtons, summary, children }: QuizShellProps) {
  const { phase, settings, replays, loadingLabel, engineLoading, inQuiz, answeredCount, correctCount, remaining, scored } = quiz;
  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                {phase === "idle" && idleText}
                {phase === "loading" && (loadingLabel ? `Loading ${loadingLabel}…` : "Loading…")}
                {phase === "question" && questionText}
                {phase === "answered" && (scored?.correct ? "Correct." : scored && scored.score > 0 ? "Partly right." : "Not quite.")}
                {phase === "ended" && "Quiz finished."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm tabular-nums">
              <Badge variant="secondary">
                {correctCount}/{answeredCount} {answeredCount ? `(${Math.round((100 * correctCount) / answeredCount)}%)` : ""}
              </Badge>
              {remaining !== null && <Badge variant="outline">{remaining} left</Badge>}
              {engineLoading.length > 0 && (
                <Badge variant="outline" className="animate-pulse">
                  loading {engineLoading.length}
                </Badge>
              )}
            </div>
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
                  <RotateCcwIcon /> Hear again <Kbd>R</Kbd>
                  {settings.replayLimit !== "unlimited" && phase === "question" && (
                    <span className="text-xs text-muted-foreground">({settings.replayLimit === "one" ? Math.max(0, 1 - replays) : 0} left)</span>
                  )}
                </Button>
                {phase === "answered" && extraButtons}
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

/** Green/red feedback banner used by every mode. */
export function FeedbackBanner({ correct, partial, children }: { correct: boolean; partial?: boolean; children: ReactNode }) {
  const tone = correct ? "border-green-500/50 bg-green-500/10" : partial ? "border-amber-500/50 bg-amber-500/10" : "border-red-500/50 bg-red-500/10";
  return <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${tone}`}>{children}</div>;
}
