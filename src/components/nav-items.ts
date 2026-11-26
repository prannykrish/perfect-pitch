import { BarChart3Icon, BugIcon, CalendarDaysIcon, EarIcon, KeyboardMusicIcon, PianoIcon, SettingsIcon, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Answered on the USB piano, which a phone browser cannot read. */
  piano?: boolean;
}

/** The phone's tab bar: the hearing half of the app, which needs no USB piano. */
export const PHONE_TABS: NavItem[] = [
  { href: "/trainer", label: "Trainer", icon: EarIcon },
  { href: "/mistakes", label: "Mistakes", icon: BugIcon },
  { href: "/calendar", label: "Practice", icon: CalendarDaysIcon },
  { href: "/stats", label: "Stats", icon: BarChart3Icon },
];

/** Behind "More" on the phone. */
export const MORE_TABS: NavItem[] = [
  { href: "/transcribe", label: "Hear It, Play It", icon: PianoIcon, piano: true },
  { href: "/compose", label: "Head to Keys", icon: KeyboardMusicIcon, piano: true },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export const isActivePath = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
