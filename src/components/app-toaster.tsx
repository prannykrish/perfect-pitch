"use client";

import { useIsPhone } from "@/lib/hooks/use-media";
import { useStage } from "@/lib/stage-store";
import { Toaster } from "@/components/ui/sonner";

/**
 * Messages appear bottom right on the laptop. On a phone the bottom of the screen is where the
 * answers are tapped (and where the tab bar and the drawers live), so they drop in from the top.
 * On the phone's quiz screen the top holds the Hear buttons, so there they come in just below
 * those, over the line of text that nothing is tapped on.
 */
export function AppToaster() {
  const phone = useIsPhone();
  const onStage = useStage((s) => s.mounted);
  const top = onStage ? "calc(10.5rem + env(safe-area-inset-top))" : "calc(0.5rem + env(safe-area-inset-top))";
  return <Toaster position={phone ? "top-center" : "bottom-right"} mobileOffset={{ top, left: "0.5rem", right: "0.5rem" }} />;
}
