"use client";

/** App-wide settings (the nav's gear). Per-mode settings stay in each tab's settings column. */
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { LEVEL_BY_ID, LEVELS } from "@/lib/practice/levels";
import { useCountPrefs } from "@/lib/practice/count-prefs";
import { applyAudioSession, hasAudioSession, isIOS } from "@/lib/audio/device";
import { useAudioPrefs } from "@/lib/audio/prefs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PianoPrefsFields } from "@/components/piano-prefs-fields";

const never = () => () => {};

/** What this device is, known only in the browser (false while the server renders). */
function useDevice() {
  const ios = useSyncExternalStore(never, isIOS, () => false);
  const session = useSyncExternalStore(never, hasAudioSession, () => false);
  return { ios, session };
}

export function SettingsView() {
  const alwaysCount = useCountPrefs((s) => s.alwaysCount);
  const setAlwaysCount = useCountPrefs((s) => s.setAlwaysCount);
  const levelId = useCountPrefs((s) => s.levelId);
  const level = LEVEL_BY_ID.get(levelId) ?? LEVELS[0];
  const playWhenSilent = useAudioPrefs((s) => s.playWhenSilent);
  const setPlayWhenSilent = useAudioPrefs((s) => s.setPlayWhenSilent);
  const { ios, session } = useDevice();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Settings that apply across the whole app.</p>
      </div>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Practice</CardTitle>
          <CardDescription>
            You are on level {level.n}: {level.title}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Label className="gap-3 text-sm">
            <Switch checked={alwaysCount} onCheckedChange={setAlwaysCount} />
            Always count reps toward my level
          </Label>
          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">On:</span> you don’t need to press Start. A rep counts toward a drill on your level (or one of its reviews) whenever your settings run that drill’s test: the same instrument, range, answer mode and other settings that decide what you hear and what you’re asked. Comfort settings never stop a rep counting: question count, auto-proceed, note length, replays, adaptive weighting, keyboard and piano input.
            </p>
            <p>
              <span className="font-medium text-foreground">Off:</span> only reps started from the level card count, and only while the drill’s settings are left exactly as Start set them.
            </p>
            <p>The bar at the top of each tab tells you which drill your reps are counting toward, or that they aren’t counting.</p>
          </div>
          <div>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/calendar" />}>
              Open the level card
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>On-screen piano</CardTitle>
          <CardDescription>
            On a phone the whole keyboard cannot fit at a size a finger can hit, so the piano shows part of it. These are saved on this device only and never change what a drill asks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PianoPrefsFields />
        </CardContent>
      </Card>

      {(ios || session) && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Sound on this phone</CardTitle>
            <CardDescription>The switch on the side of an iPhone normally mutes sound from a web page.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {session ? (
              <>
                <Label className="gap-3 text-sm">
                  <Switch
                    checked={playWhenSilent}
                    onCheckedChange={(on) => {
                      setPlayWhenSilent(on);
                      applyAudioSession(on);
                    }}
                  />
                  Play even when the phone is on silent
                </Label>
                <p className="text-xs text-muted-foreground">On: the app sounds like a music app, whatever the switch says, and other audio stops while it plays. Off: the silent switch mutes it.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">This version of iOS cannot play through the silent switch. If you hear nothing, flip the switch off (no orange showing) and turn the volume up.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
