"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon, Music2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-2 px-4">
        <Link href="/trainer" className="mr-2 flex items-center gap-2 font-semibold">
          <Music2Icon className="size-4" />
          <span className="hidden sm:inline">Perfect Pitch Lab</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <Button
                key={t.href}
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={t.href} />}
                className={cn(
                  "shrink-0 text-muted-foreground",
                  active && "bg-muted text-foreground"
                )}
              >
                <span className="hidden md:inline">{t.label}</span>
                <span className="md:hidden">{t.short}</span>
              </Button>
            );
          })}
        </nav>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <SunIcon className="hidden dark:block" />
          <MoonIcon className="dark:hidden" />
        </Button>
      </div>
    </header>
  );
}
