"use client";

import { useEffect } from "react";
import { RefreshCwIcon } from "lucide-react";
import { getMidi, useMidiStore } from "@/lib/midi/midi";
import { noteName } from "@/lib/music/notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Compact USB piano status + device picker. Requests MIDI access on mount. */
export function MidiPanel({ compact = false }: { compact?: boolean }) {
  const { status, inputs, selectedInputId, enabled, lastNote, error, setSelectedInput, setEnabled } = useMidiStore();

  useEffect(() => {
    getMidi().init();
  }, []);

  const statusBadge = (() => {
    switch (status) {
      case "ready":
        return inputs.length ? (
          <Badge variant="default">{inputs.length === 1 ? inputs[0].name : `${inputs.length} devices`}</Badge>
        ) : (
          <Badge variant="outline">No device found</Badge>
        );
      case "requesting":
        return <Badge variant="outline">Requesting access…</Badge>;
      case "unsupported":
        return (
          <>
            <Badge variant="destructive" className="touch:hidden">
              Web MIDI not supported (use Chrome/Edge)
            </Badge>
            <Badge variant="outline" className="touch:inline-flex hidden">
              Not on a phone or tablet: laptop only
            </Badge>
          </>
        );
      case "denied":
        return <Badge variant="destructive">MIDI access denied</Badge>;
      case "error":
        return <Badge variant="destructive">MIDI error</Badge>;
      default:
        return <Badge variant="outline">Idle</Badge>;
    }
  })();

  const items: Record<string, string> = { all: "All devices" };
  for (const i of inputs) items[i.id] = i.name;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="gap-2">
          <Switch checked={enabled} onCheckedChange={(v) => setEnabled(v)} size="sm" />
          USB piano input
        </Label>
        {statusBadge}
        <Button variant="ghost" size="icon-xs" aria-label="Rescan MIDI devices" onClick={() => getMidi().rescan()}>
          <RefreshCwIcon />
        </Button>
      </div>
      {!compact && inputs.length > 1 && (
        <Select items={items} value={selectedInputId} onValueChange={(v) => v && setSelectedInput(v)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(items).map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!compact && (
        <p className="text-xs text-muted-foreground">
          {error
            ? error
            : lastNote
              ? `Last note: ${noteName(lastNote.note)} (velocity ${lastNote.velocity})`
              : "Play a key to check the connection."}
        </p>
      )}
    </div>
  );
}
