"use client";

import { createContext, useContext, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { isBlackKey, noteName, octaveOf, pitchClassOf } from "@/lib/music/notes";
import { clampWindowStart, keyAt, whiteAtOrAbove, whiteAtOrBelow, whiteKeysBetween, whiteKeysFrom, windowBounds } from "@/lib/music/keyboard";
import { useIsTouch } from "@/lib/hooks/use-media";
import { usePianoPrefs, WINDOW_WHITE_KEYS } from "@/lib/piano-prefs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type KeyHighlight = "correct" | "wrong" | "target" | "pressed" | "hint";

const HIGHLIGHT_COLORS: Record<KeyHighlight, string> = {
  correct: "#22c55e",
  wrong: "#ef4444",
  target: "#3b82f6",
  pressed: "#f59e0b",
  hint: "#a78bfa",
};

/**
 * Where the windowed keyboard puts its overview strip and octave arrows, when a parent offers a
 * place for them. The phone's quiz screen does (phone-stage.tsx): the strip sits up with the
 * buttons and the line of text between it and the keys keeps a stray thumb off it.
 */
export const PianoStripSlotContext = createContext<HTMLElement | null>(null);

/** A finger cannot hit a white key narrower than this, so a touch screen gets the windowed keyboard. */
const MIN_TOUCH_WHITE = 24;
/** Octave arrow buttons beside the overview strip (px), and the gap between them and the strip. */
const ARROW = 36;
const STRIP_GAP = 8;

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
  /**
   * "auto": on a touch screen, a keyboard you answer on that cannot fit at 24 px per white key
   * shows a window of itself with an overview strip instead (the phone). "full": always all of it.
   */
  layout?: "auto" | "full";
  /**
   * Be 340 px tall where there is room and give up height where there is not (the parent must be
   * a flex column), instead of the fixed `height`. The phone's quiz screen uses this.
   */
  fill?: boolean;
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
  layout = "auto",
  fill = false,
}: PianoKeyboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const stripSlot = useContext(PianoStripSlotContext);
  const touch = useIsTouch();
  const confirmTaps = usePianoPrefs((s) => s.confirmTaps);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerWidth(e.contentRect.width);
        setContainerHeight(e.contentRect.height);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    setContainerHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // "Confirm taps": the key lit by a first tap. Forgotten whenever the keyboard is switched off or on.
  const [armed, setArmed] = useState<number | null>(null);
  const [wasDisabled, setWasDisabled] = useState(!!disabled);
  if (wasDisabled !== !!disabled) {
    setWasDisabled(!!disabled);
    setArmed(null);
  }

  // Start and end on white keys so the drawing is tidy.
  const start = whiteAtOrBelow(low);
  const end = whiteAtOrAbove(high);
  const whites = whiteKeysBetween(start, end);
  const fitWidth = containerWidth ? Math.floor((containerWidth - 2) / whites.length) : maxWhiteWidth;
  const windowed = layout === "auto" && !!onKey && touch && containerWidth > 0 && fitWidth < MIN_TOUCH_WHITE;
  const confirming = !!onKey && confirmTaps;

  const press = (m: number) => {
    if (disabled || !onKey) return;
    if (confirming && armed !== m) {
      setArmed(m);
      return;
    }
    setArmed(null);
    onKey(m);
  };
  const shown: Partial<Record<number, KeyHighlight>> = armed !== null ? { ...highlights, [armed]: "hint" } : highlights;

  // Height of the keys themselves. Filling: whatever the box has, less the rows drawn inside it.
  const inlineStrip = windowed && !stripSlot ? STRIP_TOP + STRIP_KEYS + 8 : 0;
  const confirmRow = confirming ? 44 : 0;
  const keysHeight = fill && containerHeight > 0 ? Math.max(110, Math.floor(containerHeight - inlineStrip - confirmRow)) : windowed ? Math.max(height, 150) : height;

  // contain-inline-size: the keyboard is sized from this box, so the box must not be sized from the
  // keyboard. Without it a grid column that grows to fit its content (the tab layouts' `1fr`) is held
  // open by the keys drawn at the last measured width, and the keyboard never shrinks to fit.
  return (
    // `fill` works the same way in the other direction (contain-size): the box is 340 px or what the
    // screen leaves, and the keys drawn in it must not be what decides how much that is.
    <div ref={containerRef} className={cn("flex w-full flex-col gap-2", fill ? "h-[340px] min-h-[7.5rem] shrink contain-size" : "contain-inline-size", className)}>
      {windowed ? (
        <WindowedKeys low={start} high={end} containerWidth={containerWidth} height={keysHeight} highlights={shown} labels={labels} disabled={disabled} onPress={press} stripSlot={stripSlot} />
      ) : (
        <div className="overflow-x-auto">
          <Keys whites={whites} whiteWidth={Math.min(maxWhiteWidth, fitWidth)} height={keysHeight} highlights={shown} labels={labels} activeLow={start} activeHigh={end} disabled={disabled} onPress={press} />
        </div>
      )}
      {confirming && (
        <div className="flex min-h-9 flex-wrap items-center gap-2 text-sm">
          {armed !== null ? (
            <>
              <span className="text-muted-foreground">Selected</span>
              <span className="font-semibold tabular-nums">{noteName(armed)}</span>
              <Button size="sm" onClick={() => press(armed)}>
                <CheckIcon /> Answer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setArmed(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Confirm taps is on: tap a key, then tap it again or press Answer.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The keys themselves
// ---------------------------------------------------------------------------

interface KeysProps {
  /** White keys to draw, left to right. Black keys are drawn between neighbours a whole tone apart. */
  whites: number[];
  whiteWidth: number;
  height: number;
  highlights: Partial<Record<number, KeyHighlight>>;
  labels: "c" | "all" | "none";
  /** Keys outside this range are drawn faint and cannot be pressed (the end of the keyboard). */
  activeLow: number;
  activeHigh: number;
  disabled?: boolean;
  onPress: (midi: number) => void;
  /** One touch handler for the whole keyboard with finger-sized black keys, and no scrolling from it. */
  finger?: boolean;
}

function Keys({ whites, whiteWidth: W, height, highlights, labels, activeLow, activeHigh, disabled, onPress, finger }: KeysProps) {
  const BW = Math.max(6, Math.round(W * 0.6));
  const BH = Math.round(height * 0.62);
  const width = whites.length * W;
  const active = (m: number) => m >= activeLow && m <= activeHigh;

  const blacks: { midi: number; x: number }[] = [];
  for (let i = 0; i < whites.length - 1; i++) {
    if (whites[i + 1] - whites[i] === 2) blacks.push({ midi: whites[i] + 1, x: (i + 1) * W - BW / 2 - 0.5 });
  }

  const fillFor = (m: number, black: boolean) => {
    const h = highlights[m];
    if (h) return HIGHLIGHT_COLORS[h];
    return black ? "#1f1f1f" : "#f4f4f5";
  };

  // A mouse presses the key it points at. A finger covers several, so the keyboard works out which.
  const keyDown = (m: number) => (!finger && !disabled && active(m) ? () => onPress(m) : undefined);
  const fingerDown =
    finger && !disabled
      ? (e: ReactPointerEvent<SVGSVGElement>) => {
          const r = e.currentTarget.getBoundingClientRect();
          const m = keyAt(whites, W, BH, e.clientX - r.left, e.clientY - r.top);
          if (active(m)) onPress(m);
        }
      : undefined;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block select-none", disabled ? "opacity-60" : "cursor-pointer")}
      style={finger ? { touchAction: "none", WebkitTouchCallout: "none" } : undefined}
      role="group"
      aria-label="Piano keyboard"
      onPointerDown={fingerDown}
    >
      {whites.map((m, i) => (
        <g key={m} opacity={active(m) ? 1 : 0.2}>
          <rect x={i * W} y={0} width={W - 1} height={height} rx={3} fill={fillFor(m, false)} stroke="#71717a" strokeWidth={0.5} onPointerDown={keyDown(m)} />
          {labels !== "none" && (labels === "all" || pitchClassOf(m) === 0) && (
            <text x={i * W + (W - 1) / 2} y={height - 6} textAnchor="middle" fontSize={Math.max(8, Math.min(11, W * 0.42))} fill="#3f3f46" pointerEvents="none" fontFamily="var(--font-sans)">
              {noteName(m)}
            </text>
          )}
        </g>
      ))}
      {blacks.map(({ midi, x }) => (
        <rect key={midi} x={x} y={0} width={BW} height={BH} rx={2} fill={fillFor(midi, true)} stroke="#09090b" strokeWidth={0.5} opacity={active(midi) ? 1 : 0.2} onPointerDown={keyDown(midi)} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The phone: a window of the keyboard, octave arrows, and an overview strip of all of it
// ---------------------------------------------------------------------------

const STRIP_TOP = 12; // band above the miniature keys: octave numbers and the marks' dots
const STRIP_KEYS = 24;

function WindowedKeys({
  low,
  high,
  containerWidth,
  height,
  highlights,
  labels,
  disabled,
  onPress,
  stripSlot,
}: {
  low: number;
  high: number;
  containerWidth: number;
  height: number;
  highlights: Partial<Record<number, KeyHighlight>>;
  labels: "c" | "all" | "none";
  disabled?: boolean;
  onPress: (midi: number) => void;
  /** Draw the strip and arrows here instead of above the keys. */
  stripSlot: HTMLElement | null;
}) {
  const windowOctaves = usePianoPrefs((s) => s.windowOctaves);
  const stored = usePianoPrefs((s) => s.windowStart);
  const setStored = usePianoPrefs((s) => s.setWindowStart);
  /** Left-edge white key while a finger is on the strip; it settles on the nearest C when lifted. */
  const [drag, setDrag] = useState<number | null>(null);

  const count = WINDOW_WHITE_KEYS[windowOctaves];
  const { min, max } = windowBounds(low, high);
  const settled = clampWindowStart(stored, low, high);
  const start = drag ?? settled;
  const whites = whiteKeysFrom(start, count);

  // The strip shows every place the window can be: from the lowest C to the end of the highest window.
  const stripWhites = whiteKeysBetween(min, whiteKeysFrom(max, count)[count - 1]);
  const stripWidth = Math.max(80, containerWidth - 2 * (ARROW + STRIP_GAP));
  const sw = stripWidth / stripWhites.length;
  const startIndex = Math.max(0, stripWhites.indexOf(start));
  const lastIndex = Math.max(0, stripWhites.indexOf(max));
  const xOf = (m: number) => {
    const i = stripWhites.indexOf(whiteAtOrBelow(m));
    return i < 0 ? null : i * sw + (isBlackKey(m) ? sw : sw / 2);
  };

  const follow = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const under = Math.floor((e.clientX - r.left) / sw);
    const left = Math.min(lastIndex, Math.max(0, under - Math.floor(count / 2)));
    setDrag(stripWhites[left]);
  };
  const settle = () => {
    if (drag === null) return;
    setStored(clampWindowStart(drag, low, high));
    setDrag(null);
  };
  const shift = (semitones: number) => setStored(clampWindowStart(settled + semitones, low, high));

  const lowX = Math.max(0, stripWhites.indexOf(low)) * sw;
  const highIndex = stripWhites.indexOf(high);
  const highX = (highIndex < 0 ? stripWhites.length : highIndex + 1) * sw;
  const boxX = startIndex * sw;
  const boxW = count * sw;
  const marks = Object.entries(highlights)
    .map(([m, kind]) => ({ x: xOf(Number(m)), kind: kind as KeyHighlight }))
    .filter((k): k is { x: number; kind: KeyHighlight } => k.x !== null && !!k.kind);

  const strip = (
      <div className="flex items-center" style={{ gap: STRIP_GAP }}>
        <Button variant="outline" size="icon" className="size-9 shrink-0" aria-label="One octave lower" disabled={settled <= min} onClick={() => shift(-12)}>
          <ChevronLeftIcon />
        </Button>
        <svg
          width={stripWidth}
          height={STRIP_TOP + STRIP_KEYS}
          viewBox={`0 0 ${stripWidth} ${STRIP_TOP + STRIP_KEYS}`}
          className="block shrink-0 cursor-pointer select-none text-muted-foreground"
          style={{ touchAction: "none", WebkitTouchCallout: "none" }}
          role="slider"
          aria-label="Keyboard overview: drag or tap to move the keys shown"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={settled}
          aria-valuetext={`${noteName(whites[0])} to ${noteName(whites[count - 1])}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            follow(e);
          }}
          onPointerMove={(e) => {
            if (drag !== null) follow(e);
          }}
          onPointerUp={settle}
          onPointerCancel={settle}
        >
          {/* miniature keys */}
          <rect x={0} y={STRIP_TOP} width={stripWidth} height={STRIP_KEYS} rx={2} fill="#f4f4f5" />
          {stripWhites.map((m, i) =>
            pitchClassOf(m) === 0 ? (
              <g key={m}>
                {i > 0 && <line x1={i * sw} x2={i * sw} y1={STRIP_TOP} y2={STRIP_TOP + STRIP_KEYS} stroke="#71717a" strokeWidth={0.75} />}
                <text x={i * sw + 2} y={STRIP_TOP - 3} fontSize={9} fill="currentColor" fontFamily="var(--font-sans)">
                  {octaveOf(m)}
                </text>
              </g>
            ) : null
          )}
          {stripWhites.map((m, i) =>
            i < stripWhites.length - 1 && stripWhites[i + 1] - m === 2 ? (
              <rect key={m} x={(i + 1) * sw - Math.max(1.5, sw * 0.55) / 2} y={STRIP_TOP} width={Math.max(1.5, sw * 0.55)} height={STRIP_KEYS * 0.58} fill="#27272a" />
            ) : null
          )}
          {/* past the ends of the keyboard */}
          {lowX > 0 && <rect x={0} y={STRIP_TOP} width={lowX} height={STRIP_KEYS} fill="var(--card)" opacity={0.8} />}
          {highX < stripWidth && <rect x={highX} y={STRIP_TOP} width={stripWidth - highX} height={STRIP_KEYS} fill="var(--card)" opacity={0.8} />}
          {/* everything outside the window recedes */}
          <rect x={0} y={STRIP_TOP} width={boxX} height={STRIP_KEYS} fill="#000" opacity={0.4} />
          <rect x={boxX + boxW} y={STRIP_TOP} width={Math.max(0, stripWidth - boxX - boxW)} height={STRIP_KEYS} fill="#000" opacity={0.4} />
          <rect x={boxX + 1} y={STRIP_TOP - 1} width={boxW - 2} height={STRIP_KEYS + 2} rx={3} fill="rgba(59,130,246,0.14)" stroke="#3b82f6" strokeWidth={2} />
          {/* the target and the answer, wherever they are */}
          {marks.map((k, i) => (
            <g key={i}>
              <rect x={k.x - Math.max(4, sw) / 2} y={STRIP_TOP} width={Math.max(4, sw)} height={STRIP_KEYS} rx={1} fill={HIGHLIGHT_COLORS[k.kind]} />
              <circle cx={k.x} cy={STRIP_TOP / 2 - 0.5} r={4.5} fill={HIGHLIGHT_COLORS[k.kind]} />
            </g>
          ))}
        </svg>
        <Button variant="outline" size="icon" className="size-9 shrink-0" aria-label="One octave higher" disabled={settled >= max} onClick={() => shift(12)}>
          <ChevronRightIcon />
        </Button>
      </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {stripSlot ? createPortal(strip, stripSlot) : strip}
      <Keys whites={whites} whiteWidth={containerWidth / count} height={height} highlights={highlights} labels={labels} activeLow={low} activeHigh={high} disabled={disabled} onPress={onPress} finger />
    </div>
  );
}
