"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { EllipsisIcon, MoonIcon, Music2Icon, SettingsIcon, SunIcon } from "lucide-react";
import { useStage } from "@/lib/stage-store";
import { useIsPhoneSideways } from "@/lib/hooks/use-media";
import { MORE_TABS, PHONE_TABS, isActivePath as isActive } from "@/components/nav-items";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; short: string }[] = [
  { href: "/trainer", label: "Pitch Trainer", short: "Trainer" },
  { href: "/transcribe", label: "Hear It, Play It", short: "Transcribe" },
  { href: "/mistakes", label: "Find the Mistake", short: "Mistakes" },
  { href: "/compose", label: "Head to Keys", short: "Compose" },
  { href: "/stats", label: "Stats", short: "Stats" },
  { href: "/calendar", label: "Practice & Learn", short: "Practice" },
];

export function AppNav() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  // A quiz is running on the phone's fixed screen: the bar steps aside so a stray thumb cannot leave it.
  const quizRunning = useStage((s) => s.focus);
  const stageUp = useStage((s) => s.mounted);
  const sideways = useIsPhoneSideways();
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  // The browser's own chrome (and the phone's status bar) takes the colour of the page behind it.
  useEffect(() => {
    const color = resolvedTheme === "light" ? "#ffffff" : "#0a0a0a";
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
  }, [resolvedTheme, pathname]);

  // The lock screen of the hosted app: nothing to navigate to yet.
  if (pathname === "/unlock") return null;
  // A phone on its side showing a quiz: the screen is too short to give any of it to a bar, and the
  // pages are in the quiz's side panel. (Upright, the tab bar stays and only hides during a quiz.)
  if (sideways && stageUp) return null;

  return (
    <>
      {/* Installed on a phone the page runs under the status bar, whose text is white: keep it on black. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-neutral-950" />

      {/* md and up: the top bar */}
      <header className="sticky top-[env(safe-area-inset-top)] z-40 hidden border-b bg-background/80 backdrop-blur md:block">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-2 px-4">
          <Link href="/trainer" className="mr-2 flex items-center gap-2 font-semibold">
            <Music2Icon className="size-4" />
            <span className="hidden sm:inline">Perfect Pitch Lab</span>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <Button
                key={t.href}
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={t.href} />}
                className={cn("shrink-0 text-muted-foreground", isActive(pathname, t.href) && "bg-muted text-foreground")}
              >
                <span className="hidden md:inline">{t.label}</span>
                <span className="md:hidden">{t.short}</span>
              </Button>
            ))}
          </nav>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/settings" />}
            aria-label="Settings"
            className={cn("shrink-0 text-muted-foreground", pathname.startsWith("/settings") && "bg-muted text-foreground")}
          >
            <SettingsIcon />
            <span className="hidden md:inline">Settings</span>
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggleTheme}>
            <SunIcon className="hidden dark:block" />
            <MoonIcon className="dark:hidden" />
          </Button>
        </div>
      </header>

      {/* below md: a tab bar under the thumb */}
      <nav
        aria-label="Main"
        aria-hidden={quizRunning || undefined}
        className={cn("fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden", quizRunning && "pointer-events-none invisible")}
      >
        <div className="mx-auto grid h-14 max-w-lg grid-cols-5 px-[env(safe-area-inset-left)]">
          {PHONE_TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Button
                key={t.href}
                variant="ghost"
                nativeButton={false}
                render={<Link href={t.href} />}
                aria-current={active ? "page" : undefined}
                className={cn("h-full flex-col gap-0.5 rounded-none px-0 text-[11px] text-muted-foreground", active && "text-foreground")}
              >
                <t.icon className={cn("size-5", active && "text-blue-500")} />
                {t.label}
              </Button>
            );
          })}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  className={cn("h-full flex-col gap-0.5 rounded-none px-0 text-[11px] text-muted-foreground", MORE_TABS.some((t) => isActive(pathname, t.href)) && "text-foreground")}
                />
              }
            >
              <EllipsisIcon className={cn("size-5", MORE_TABS.some((t) => isActive(pathname, t.href)) && "text-blue-500")} />
              More
            </SheetTrigger>
            <SheetContent side="bottom" className="gap-0 rounded-t-xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <SheetHeader>
                <SheetTitle>Perfect Pitch Lab</SheetTitle>
                <SheetDescription className="touch:block hidden">The two piano tabs need the USB piano, so they work on the laptop.</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-1 px-2">
                {MORE_TABS.map((t) => (
                  <Button
                    key={t.href}
                    variant="ghost"
                    nativeButton={false}
                    render={<Link href={t.href} />}
                    onClick={() => setMoreOpen(false)}
                    className={cn("h-12 justify-start gap-3 px-3 text-base", isActive(pathname, t.href) && "bg-muted")}
                  >
                    <t.icon className="size-5" />
                    {t.label}
                    {t.piano && <span className="touch:inline ml-auto hidden text-xs font-normal text-muted-foreground">needs the USB piano</span>}
                  </Button>
                ))}
                <Button variant="ghost" onClick={toggleTheme} className="h-12 justify-start gap-3 px-3 text-base">
                  <SunIcon className="hidden size-5 dark:block" />
                  <MoonIcon className="size-5 dark:hidden" />
                  <span className="hidden dark:inline">Light theme</span>
                  <span className="dark:hidden">Dark theme</span>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
