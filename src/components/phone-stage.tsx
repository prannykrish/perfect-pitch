"use client";

/**
 * The phone's quiz screen. One fixed screen that never scrolls and never rearranges itself:
 *
 *   [ ☰⚑  title                         score  End ]   the button opens the side panel
 *   [   Hear next   ][   Hear again   ]              (or Start)
 *   [ secondary buttons after an answer            ]   height kept even when empty
 *   [ ‹  overview strip of the keyboard          › ]   only when the piano is the answer
 *   [ what is asked / the feedback                 ]   fixed height, nothing to tap
 *   [ the answer: the piano, the buttons, …        ]   fills the rest
 *
 * Every row above the answer has a fixed height, so the answer never moves between the question
 * and the feedback. The page behind is locked, drags do nothing except inside an answer that is
 * taller than the screen, and while a quiz runs the tab bar steps aside (its space stays empty
 * under the keys, so nothing shifts and a stray thumb cannot leave the quiz).
 *
 * Everything that is not the question lives in the side panel (`StagePanel`): the level bar, the
 * modes, this tab's settings and the other pages.
 *
 * Held sideways the phone gets the same promise in a second arrangement (see the comment in
 * `PhoneStage`): without it a sideways iPhone is wider than `md` and fell through to the laptop's
 * scrolling page, where the result banner pushed everything down.
 *
 * `data-stage-part` marks the rows for scripts/check-phone-layout.mjs, which records where each
 * one sits while questions are answered and reports anything that moves or needs scrolling.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, SquareIcon } from "lucide-react";
import type { DrillDef } from "@/lib/practice/levels";
import { useStage } from "@/lib/stage-store";
import { useIsPhoneSideways } from "@/lib/hooks/use-media";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PianoStripSlotContext } from "@/components/piano-keyboard";
import { LevelRunFlag } from "@/components/practice/level-run-bar";
import { MORE_TABS, PHONE_TABS, isActivePath } from "@/components/nav-items";
import { cn } from "@/lib/utils";

export interface PhoneStageProps {
  title: string;
  /** Whose level drill these reps may count toward (the flag on the panel button). */
  levelStore: DrillDef["store"];
  /** What is being asked, or what is loading. */
  status: ReactNode;
  /** Shown in place of the status once answered. */
  feedback?: ReactNode;
  /** Modes whose feedback runs to several lines get a taller text row. */
  tallStatus?: boolean;
  score: ReactNode;
  inQuiz: boolean;
  ended: boolean;
  onEnd: () => void;
  /** One or two main buttons. */
  transport: ReactNode;
  /** Secondary buttons (after an answer). */
  extras?: ReactNode;
  /** Shown in place of the answer when the quiz has ended; scrolls. */
  summary?: ReactNode;
  /** The answer UI. With a piano in it, its root should be `flex min-h-0 shrink flex-col` so the piano can give up height on a short screen. */
  children: ReactNode;
}

export function PhoneStage({ title, levelStore, status, feedback, tallStatus, score, inQuiz, ended, onEnd, transport, extras, summary, children }: PhoneStageProps) {
  const setMounted = useStage((s) => s.setMounted);
  const setFocus = useStage((s) => s.setFocus);
  const setPanelOpen = useStage((s) => s.setPanelOpen);
  const sideways = useIsPhoneSideways();
  const [stripSlot, setStripSlot] = useState<HTMLDivElement | null>(null);

  // The page behind must not scroll or bounce while the stage is up.
  useEffect(() => {
    setMounted(true);
    document.documentElement.classList.add("stage-locked");
    return () => {
      document.documentElement.classList.remove("stage-locked");
      setMounted(false);
    };
  }, [setMounted]);

  useEffect(() => {
    setFocus(inQuiz);
  }, [inQuiz, setFocus]);

  const panelButton = (
    <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 px-2" aria-label="Level, modes, settings and pages" onClick={() => setPanelOpen(true)}>
      <MenuIcon />
      <LevelRunFlag store={levelStore} />
    </Button>
  );
  const endButton = inQuiz && (
    <Button variant="ghost" size="sm" className="h-9 shrink-0 px-2" onClick={onEnd}>
      <SquareIcon /> End
    </Button>
  );

  // ----- held sideways: the screen is wide and very short -----
  //
  //   [ ☰⚑ | what is asked / the result            | after-answer buttons | score | End ]   one row, fixed height
  //   [ Hear next  |  ‹ overview strip ›                                                 ]
  //   [ Hear again |  the answer: the keys, the buttons, …  (fills the rest)             ]
  //
  // The same promise as upright: nothing changes place between idle, question and result. The two
  // Hear buttons are the only things beside the keys (a stray thumb there replays the note, or moves
  // on once answered); everything that could spoil a rep is up in the top row. There is no tab bar
  // here at all: the height is worth more, and the pages are in the side panel.
  if (sideways) {
    return (
      <PianoStripSlotContext.Provider value={stripSlot}>
        <div
          data-stage="sideways"
          className="fixed inset-0 z-30 flex flex-col gap-2 overflow-hidden bg-background pt-[max(0.25rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] select-none"
          style={{ touchAction: "none", WebkitTouchCallout: "none" }}
        >
          <div data-stage-part="bar" className="flex h-11 shrink-0 items-center gap-2">
            {/* As wide as the column of Hear buttons below (plus the gap beside it), so the result starts exactly above the answer. */}
            <div className="flex w-29 shrink-0 items-center">{panelButton}</div>
            {/*
              The result has this slot and no more. One line fits in it; a longer one (the modes that
              show what was played against what was answered) hangs down over the answer, which is
              switched off by then, instead of pushing it. It never reaches over the Hear buttons.
            */}
            <div data-stage-part="text" className="relative h-11 min-w-0 flex-1">
              <div className="absolute inset-x-0 top-0 z-10 flex max-h-[80vh] min-h-full flex-col justify-center overflow-hidden rounded-lg bg-background text-sm">
                {feedback ?? (
                  <div className="truncate px-1 text-muted-foreground">
                    <span className="font-medium text-foreground">{title}</span> · {status}
                  </div>
                )}
              </div>
            </div>
            <div data-stage-part="extras" className="flex shrink-0 items-center gap-2 empty:hidden [&>*]:h-9 [&>*]:px-2.5 [&>*]:text-xs">
              {extras}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">{score}</div>
            {endButton}
          </div>

          <div className="flex min-h-0 flex-[1_1_0px] gap-3">
            <div data-stage-part="transport" className="flex w-28 shrink-0 flex-col gap-2 [&>*]:h-auto [&>*]:min-h-0 [&>*]:flex-1 [&>*]:flex-col [&>*]:gap-1 [&>*]:px-1 [&>*]:text-sm [&>*]:whitespace-normal [&>*>svg]:size-6">
              {transport}
            </div>
            <div className="flex min-w-0 flex-[1_1_0px] flex-col gap-2">
              <div data-stage-part="strip" ref={setStripSlot} className="shrink-0 empty:hidden" />
              <ScrollBox part="answer" bottom className="min-h-0 flex-[1_1_0px]" innerClassName="min-h-0 shrink">
                {ended ? summary : children}
              </ScrollBox>
            </div>
          </div>
        </div>
      </PianoStripSlotContext.Provider>
    );
  }

  return (
    <PianoStripSlotContext.Provider value={stripSlot}>
      <div
        data-stage="upright"
        className="fixed inset-x-0 top-[env(safe-area-inset-top)] bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 overflow-hidden bg-background px-2 pt-1 pb-2 select-none"
        style={{ touchAction: "none", WebkitTouchCallout: "none" }}
      >
        <div data-stage-part="bar" className="flex h-10 shrink-0 items-center gap-2">
          {panelButton}
          <div className="min-w-0 flex-1 truncate text-base font-medium">{title}</div>
          <div className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">{score}</div>
          {endButton}
        </div>

        <div data-stage-part="transport" className="grid shrink-0 grid-cols-2 gap-2 [&>*]:h-12 [&>*]:text-base [&>*:only-child]:col-span-2">
          {transport}
        </div>
        <div data-stage-part="extras" className="flex h-9 shrink-0 items-center gap-2 overflow-hidden [&>*]:h-9">
          {extras}
        </div>
        <div data-stage-part="strip" ref={setStripSlot} className="shrink-0 empty:hidden" />

        {/* The text row takes whatever height is spare and keeps its words at its bottom edge, so they sit right above the answer.
            Its size starts from zero pixels (not a percentage, not its content), so no browser can size it from what is written in it. */}
        <ScrollBox part="text" className={cn("flex-[1_1_0px] text-sm", tallStatus ? "min-h-32" : "min-h-20")} bottom innerClassName="shrink-0">
          {feedback ?? <div className="px-1 pb-1 text-muted-foreground">{status}</div>}
        </ScrollBox>

        {/* The answer is as tall as it needs and sits at the bottom, next to the thumb. Too tall for the screen: it gives way and scrolls. */}
        <ScrollBox part="answer" className="min-h-0 shrink" innerClassName="min-h-0 shrink">
          {ended ? summary : children}
        </ScrollBox>
      </div>
    </PianoStripSlotContext.Provider>
  );
}

/**
 * A region that scrolls only when what is in it does not fit, and otherwise ignores drags
 * entirely, so the screen cannot be pulled about. Its content is a flex column, so a piano inside
 * can give up height when the screen is short.
 *
 * `bottom` rests the content on the box's bottom edge when it is shorter than the box. It does that
 * with an auto margin, not `justify-end`: content that is taller than the box then starts at the top
 * and scrolls, where `justify-end` would push its top out of reach above the box.
 */
function ScrollBox({ part, bottom, className, innerClassName, children }: { part?: string; bottom?: boolean; className?: string; innerClassName?: string; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const check = () => setScrolls(i.scrollHeight > o.clientHeight + 1);
    const ro = new ResizeObserver(check);
    ro.observe(o);
    ro.observe(i);
    // What is inside can change height while this box keeps its own (the piano redrawn at a new
    // size, a different answer form), so look again shortly after anything in it changes.
    let timer = setTimeout(check, 300);
    const mo = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(check, 120);
    });
    mo.observe(i, { subtree: true, childList: true, attributes: true, attributeFilter: ["height", "class", "style"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={outer} data-stage-part={part} className={cn("flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain", className)} style={{ touchAction: scrolls ? "pan-y" : "none" }}>
      <div ref={inner} className={cn("flex flex-col", bottom ? "mt-auto" : "grow", innerClassName)}>
        {children}
      </div>
    </div>
  );
}

/**
 * The side panel of a stage: everything that is not the question. Opened by the stage's top-left
 * button. Scrolls on its own; the stage behind stays exactly where it was.
 */
export function StagePanel({ title, children }: { title: string; children: ReactNode }) {
  const open = useStage((s) => s.panelOpen);
  const setOpen = useStage((s) => s.setPanelOpen);
  const pathname = usePathname();
  const pages = [...PHONE_TABS, ...MORE_TABS];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="gap-0 data-[side=left]:w-[92vw] data-[side=left]:max-w-md">
        <SheetHeader className="pt-[max(1rem,env(safe-area-inset-top))]">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">Your level, the modes, this tab&apos;s settings and the other pages.</SheetDescription>
        </SheetHeader>
        {/* A settings panel is a card with its own "Settings" title; in here it loses the card and keeps the title as a heading. */}
        <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] [&>[data-slot=card]]:overflow-visible [&>[data-slot=card]]:bg-transparent [&>[data-slot=card]]:py-0 [&>[data-slot=card]]:ring-0 [&>[data-slot=card]>[data-slot=card-content]]:px-0 [&>[data-slot=card]>[data-slot=card-header]]:px-0">
          {children}
          <section className="flex flex-col gap-2">
            <div className="text-sm font-medium">Go to</div>
            <div className="grid grid-cols-2 gap-2">
              {pages.map((p) => (
                <Button
                  key={p.href}
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={p.href} />}
                  onClick={() => setOpen(false)}
                  className={cn("h-11 justify-start gap-2 px-3", isActivePath(pathname, p.href) && "border-primary/60 bg-primary/10")}
                >
                  <p.icon className="size-4" />
                  <span className="truncate">{p.label}</span>
                </Button>
              ))}
            </div>
            <p className="touch:block hidden text-xs text-muted-foreground">Hear It, Play It and Head to Keys need the USB piano, so they work on the laptop.</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
