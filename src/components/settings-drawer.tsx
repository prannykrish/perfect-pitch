"use client";

/**
 * The button that shows a tab's settings. On the laptop it folds the settings column away, as it
 * always has. On a phone there is no room for a column, so the same panel opens as a drawer from
 * the bottom and the page keeps the quiz. The layouts render the column only when `useIsPhone()`
 * is false.
 */
import { useState, type ReactNode } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SlidersHorizontalIcon } from "lucide-react";
import { useIsPhone } from "@/lib/hooks/use-media";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SettingsToggle({
  open,
  onOpenChange,
  children,
}: {
  /** The laptop's column: shown or folded away (remembered). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The settings panel, for the phone's drawer. */
  children: ReactNode;
}) {
  const phone = useIsPhone();
  const [drawer, setDrawer] = useState(false);

  if (phone) {
    return (
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetTrigger render={<Button variant="outline" size="icon-sm" aria-label="Settings" />}>
          <SlidersHorizontalIcon />
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[88dvh] gap-0 rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription className="sr-only">Settings for this tab. They apply from the next question.</SheetDescription>
          </SheetHeader>
          {/* The panel is a card with its own "Settings" title; inside the drawer it loses both. */}
          <div className="overflow-y-auto overscroll-contain px-1 pb-[max(1rem,env(safe-area-inset-bottom))] [&>[data-slot=card]]:bg-transparent [&>[data-slot=card]]:py-0 [&>[data-slot=card]]:ring-0 [&>[data-slot=card]>[data-slot=card-header]]:hidden">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" size="icon-sm" aria-label={open ? "Hide settings" : "Show settings"} onClick={() => onOpenChange(!open)} />}>
        {open ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
      </TooltipTrigger>
      <TooltipContent>{open ? "Hide settings" : "Show settings"}</TooltipContent>
    </Tooltip>
  );
}
