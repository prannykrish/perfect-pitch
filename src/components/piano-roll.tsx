"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useTheme } from "next-themes";
import { isBlackKey, noteName, pitchClassOf } from "@/lib/music/notes";
import { cn } from "@/lib/utils";

export type RollNoteKind = "played" | "ghost" | "correct" | "wrong" | "missing" | "extra";

export interface RollNote {
  midi: number;
  startMs: number;
  /** null = still sounding (live mode) */
  endMs: number | null;
  velocity?: number; // 0..127
  kind?: RollNoteKind;
}

export interface PianoRollProps {
  /** Notes to draw. Read every frame, so mutate in place or swap the ref's value. */
  notesRef: RefObject<RollNote[]>;
  /** Current time in ms (live: performance.now() - t0; playback: playhead). Read every frame. */
  nowRef: RefObject<number>;
  /** "live": time scrolls with the playhead pinned near the right. "static": 0..durationMs fills the width, playhead moves. */
  mode: "live" | "static";
  durationMs?: number;
  low?: number;
  high?: number;
  pxPerSecond?: number;
  height?: number;
  className?: string;
}

export const KIND_COLORS: Record<RollNoteKind, string> = {
  played: "#3b82f6",
  ghost: "#a1a1aa",
  correct: "#22c55e",
  wrong: "#ef4444",
  missing: "#f59e0b",
  extra: "#a855f7",
};

export const KIND_LABELS: Record<RollNoteKind, string> = {
  played: "played",
  ghost: "reference",
  correct: "matched",
  wrong: "wrong note",
  missing: "missed",
  extra: "extra",
};

/** Small legend for a roll that mixes kinds. */
export function RollLegend({ kinds }: { kinds: RollNoteKind[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {kinds.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-[2px]" style={{ background: KIND_COLORS[k], opacity: k === "ghost" ? 0.5 : 0.9 }} />
          {KIND_LABELS[k]}
        </span>
      ))}
    </div>
  );
}

export function PianoRoll({
  notesRef,
  nowRef,
  mode,
  durationMs = 10000,
  low = 36,
  high = 96,
  pxPerSecond = 120,
  height = 320,
  className,
}: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const KEY_W = 44;

    const draw = () => {
      const parent = canvas.parentElement;
      const cssW = parent ? parent.clientWidth : canvas.clientWidth;
      const cssH = height;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const rows = high - low + 1;
      const rowH = cssH / rows;
      const gridW = cssW - KEY_W;
      const now = nowRef.current ?? 0;
      const notes = notesRef.current ?? [];

      // time → x mapping
      let msToX: (ms: number) => number;
      if (mode === "live") {
        const playheadX = KEY_W + gridW * 0.78;
        const pxPerMs = pxPerSecond / 1000;
        msToX = (ms) => playheadX - (now - ms) * pxPerMs;
      } else {
        const pxPerMs = gridW / Math.max(1, durationMs);
        msToX = (ms) => KEY_W + ms * pxPerMs;
      }

      // row backgrounds (black keys darker)
      for (let m = low; m <= high; m++) {
        const y = cssH - (m - low + 1) * rowH;
        const black = isBlackKey(m);
        ctx.fillStyle = dark
          ? black
            ? "rgba(255,255,255,0.03)"
            : "rgba(255,255,255,0.06)"
          : black
            ? "rgba(0,0,0,0.06)"
            : "rgba(0,0,0,0.02)";
        ctx.fillRect(KEY_W, y, gridW, rowH);
        if (pitchClassOf(m) === 0) {
          ctx.strokeStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(KEY_W, y + rowH);
          ctx.lineTo(cssW, y + rowH);
          ctx.stroke();
        }
      }

      // vertical time grid every second
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      const secStart = mode === "live" ? Math.floor((now - (gridW * 0.78) / (pxPerSecond / 1000)) / 1000) : 0;
      const secEnd = mode === "live" ? Math.ceil((now + (gridW * 0.22) / (pxPerSecond / 1000)) / 1000) : Math.ceil(durationMs / 1000);
      for (let s = Math.max(0, secStart); s <= secEnd; s++) {
        const x = msToX(s * 1000);
        if (x < KEY_W || x > cssW) continue;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssH);
        ctx.stroke();
      }

      // notes
      for (const n of notes) {
        if (n.midi < low || n.midi > high) continue;
        const x1 = msToX(n.startMs);
        const x2 = msToX(n.endMs ?? now);
        if (x2 < KEY_W || x1 > cssW) continue;
        const y = cssH - (n.midi - low + 1) * rowH;
        const kind = n.kind ?? "played";
        const alpha = kind === "ghost" ? 0.35 : 0.55 + 0.45 * ((n.velocity ?? 100) / 127);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = KIND_COLORS[kind];
        const left = Math.max(KEY_W, x1);
        const w = Math.max(2, Math.min(cssW, x2) - left);
        ctx.fillRect(left, y + 1, w, Math.max(1, rowH - 2));
        ctx.globalAlpha = 1;
        if (rowH >= 9 && w > 22) {
          ctx.fillStyle = dark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.9)";
          ctx.font = `${Math.min(10, rowH - 2)}px var(--font-sans, sans-serif)`;
          ctx.textBaseline = "middle";
          ctx.fillText(noteName(n.midi), left + 3, y + rowH / 2);
        }
      }

      // playhead
      const px = msToX(now);
      if (px >= KEY_W && px <= cssW) {
        ctx.strokeStyle = "#f43f5e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, cssH);
        ctx.stroke();
      }

      // key column
      ctx.fillStyle = dark ? "#18181b" : "#fafafa";
      ctx.fillRect(0, 0, KEY_W, cssH);
      for (let m = low; m <= high; m++) {
        const y = cssH - (m - low + 1) * rowH;
        const black = isBlackKey(m);
        ctx.fillStyle = black ? "#1f1f1f" : "#f4f4f5";
        ctx.fillRect(0, y + 0.5, KEY_W - 4, rowH - 1);
        if (pitchClassOf(m) === 0 && rowH >= 6) {
          ctx.fillStyle = "#3f3f46";
          ctx.font = `${Math.min(10, Math.max(7, rowH))}px var(--font-sans, sans-serif)`;
          ctx.textBaseline = "middle";
          ctx.fillText(noteName(m), 4, y + rowH / 2);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [notesRef, nowRef, mode, durationMs, low, high, pxPerSecond, height, dark]);

  return (
    <div className={cn("w-full overflow-hidden rounded-lg border bg-card", className)}>
      <canvas ref={canvasRef} />
    </div>
  );
}
