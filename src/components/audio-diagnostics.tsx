"use client";

import { useState } from "react";
import { CheckIcon, XIcon, MinusIcon, RefreshCwIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { getEngine, useEngineStore } from "@/lib/audio/engine";
import { instrumentLabel } from "@/lib/audio/instruments";
import type { ProbeResult } from "@/lib/audio/sample-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function Row({ label, r }: { label: string; r: ProbeResult }) {
  const icon = r.ok ? (
    <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-green-500" />
  ) : r.skipped ? (
    <MinusIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
  ) : (
    <XIcon className="mt-0.5 size-3.5 shrink-0 text-red-500" />
  );
  return (
    <div className="flex items-start gap-2 text-xs">
      {icon}
      <div className="min-w-0">
        <span className="font-medium">{label}</span>{" "}
        <span className="text-muted-foreground">
          {r.status !== undefined && `HTTP ${r.status} · `}
          {r.contentType && `${r.contentType} · `}
          {r.bytes !== undefined && `${r.bytes} B · `}
          {r.head && `“${r.head}” · `}
          {r.ms !== undefined && `${r.ms} ms`}
          {r.error && <span className={r.skipped || r.ok ? "" : "text-red-500"}> · {r.error}</span>}
        </span>
      </div>
    </div>
  );
}

/** Shows whether streamed (CDN) instruments work in this browser and why not. */
export function AudioDiagnostics() {
  const samples = useEngineStore((s) => s.samples);
  const checking = useEngineStore((s) => s.samplesChecking);
  const vendored = useEngineStore((s) => s.vendored);
  const broken = useEngineStore((s) => s.broken);
  const [open, setOpen] = useState(false);
  const brokenList = Object.entries(broken);

  const run = () => getEngine().checkSamples(true).catch((err) => toast.error(String(err)));

  const copy = () => {
    if (!samples) return;
    navigator.clipboard.writeText(JSON.stringify(samples, null, 2)).then(() => toast.success("Diagnostics copied"));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">Streamed instruments</span>
        {checking ? (
          <Badge variant="outline" className="animate-pulse">checking…</Badge>
        ) : samples ? (
          <Badge variant={samples.status === "ok" ? "default" : "destructive"}>
            {samples.status === "ok" ? `available (${samples.format === "ogg" ? "Opus" : "AAC"})` : "unavailable"}
          </Badge>
        ) : (
          <Badge variant="outline">not checked</Badge>
        )}
        <Button variant="ghost" size="icon-xs" aria-label="Re-run audio check" onClick={run} disabled={checking}>
          <RefreshCwIcon />
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide details" : "Details"}
        </Button>
      </div>
      {vendored.length > 0 && (
        <p className="text-xs text-muted-foreground">{vendored.length} streamed instruments are vendored locally as mp3 and always work.</p>
      )}
      {samples && samples.status !== "ok" && (
        <p className="text-xs text-muted-foreground">
          {samples.detail} Try a regular Chrome or Edge window, or run <code className="font-mono">npm run samples:streamed</code> to convert them to local mp3.
        </p>
      )}
      {brokenList.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-amber-500/40 p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Dropped this session ({brokenList.length})</span>
            <Button variant="ghost" size="xs" onClick={() => getEngine().clearBroken()}>
              Give them another chance
            </Button>
          </div>
          {brokenList.slice(0, 12).map(([id, reason]) => (
            <div key={id} className="text-muted-foreground">
              <span className="text-foreground">{instrumentLabel(id)}</span> · {reason}
            </div>
          ))}
          {brokenList.length > 12 && <div className="text-muted-foreground">…and {brokenList.length - 12} more</div>}
        </div>
      )}
      {open && samples && (
        <div className="flex flex-col gap-1 rounded-md border p-2">
          <Row label="Local Ogg Opus decode" r={samples.localOpus} />
          <Row label="Local AAC (m4a) decode" r={samples.localAac} />
          <Row label="CDN fetch + decode" r={samples.cdn} />
          <p className="text-[11px] text-muted-foreground break-all">{samples.userAgent}</p>
          <Button variant="outline" size="xs" className="w-fit" onClick={copy}>
            <CopyIcon /> Copy diagnostics
          </Button>
        </div>
      )}
    </div>
  );
}
