"use client";

import { useEffect, useRef, useState } from "react";
import { isBlackKey, noteName, pitchClassOf } from "@/lib/music/notes";
import { cn } from "@/lib/utils";

export type KeyHighlight = "correct" | "wrong" | "target" | "pressed" | "hint";

const HIGHLIGHT_COLORS: Record<KeyHighlight, string> = {
  correct: "#22c55e",
  wrong: "#ef4444",
  target: "#3b82f6",
  pressed: "#f59e0b",
  hint: "#a78bfa",
};

export interface PianoKeyboardProps {
  low: number;
  high: number;
  onKey?: (midi: number) => void;
  highlights?: Partial<Record<number, KeyHighlight>>;
  /** Max white key width in px; the keyboard shrinks to fit its container. */
  maxWhiteWidth?: number;
  height?: number;
  labels?: "c" | "all" | "none";
  disabled?: boolean;
  className?: string;
}

export function PianoKeyboard({
  low,
  high,
  onKey,
  highlights = {},
  maxWhiteWidth = 26,
  height = 120,
  labels = "c",
  disabled,
  className,
}: PianoKeyboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Start and end on white keys so the drawing is tidy.
  const start = isBlackKey(low) ? low - 1 : low;
  const end = isBlackKey(high) ? high + 1 : high;
  const keys: number[] = [];
  for (let m = start; m <= end; m++) keys.push(m);
  const whites = keys.filter((m) => !isBlackKey(m));
  const whiteCount = whites.length;
  const W = containerWidth ? Math.min(maxWhiteWidth, Math.floor((containerWidth - 2) / whiteCount)) : maxWhiteWidth;
  const BW = Math.max(6, Math.round(W * 0.6));
  const BH = Math.round(height * 0.62);
  const width = whiteCount * W;

  const whiteIndex = new Map<number, number>();
  whites.forEach((m, i) => whiteIndex.set(m, i));

  const fillFor = (m: number, black: boolean) => {
    const h = highlights[m];
    if (h) return HIGHLIGHT_COLORS[h];
    return black ? "#1f1f1f" : "#f4f4f5";
  };

  return (
    <div ref={containerRef} className={cn("w-full overflow-x-auto", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn("block select-none", disabled ? "opacity-60" : "cursor-pointer")}
        role="group"
        aria-label="Piano keyboard"
      >
        {whites.map((m, i) => (
          <g key={m}>
            <rect
              x={i * W}
              y={0}
              width={W - 1}
              height={height}
              rx={3}
              fill={fillFor(m, false)}
              stroke="#71717a"
              strokeWidth={0.5}
              onPointerDown={disabled ? undefined : () => onKey?.(m)}
            />
            {labels !== "none" && (labels === "all" || pitchClassOf(m) === 0) && (
              <text
                x={i * W + (W - 1) / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={Math.max(8, Math.min(11, W * 0.42))}
                fill="#3f3f46"
                pointerEvents="none"
                fontFamily="var(--font-sans)"
              >
                {noteName(m)}
              </text>
            )}
          </g>
        ))}
        {keys
          .filter((m) => isBlackKey(m))
          .map((m) => {
            const wi = whiteIndex.get(m - 1)!;
            const x = (wi + 1) * W - BW / 2 - 0.5;
            return (
              <rect
                key={m}
                x={x}
                y={0}
                width={BW}
                height={BH}
                rx={2}
                fill={fillFor(m, true)}
                stroke="#09090b"
                strokeWidth={0.5}
                onPointerDown={disabled ? undefined : () => onKey?.(m)}
              />
            );
          })}
      </svg>
    </div>
  );
}
