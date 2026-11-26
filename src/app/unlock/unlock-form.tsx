"use client";

import { useActionState } from "react";
import { LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlock, type UnlockState } from "./actions";

const initial: UnlockState = { error: null };

export function UnlockForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(unlock, initial);
  return (
    <Card className="mx-auto mt-[10vh] w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockIcon className="size-4" />
          Perfect Pitch Lab
        </CardTitle>
        <CardDescription>Enter the password once and this device stays unlocked for a year.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" autoFocus required aria-invalid={state.error ? true : undefined} className="h-10" />
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? "Unlocking…" : "Unlock"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
