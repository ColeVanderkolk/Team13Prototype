import { Children, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ShapeKind = "circle" | "square" | "triangle";

/** Dot positions in a 10×10 unit box (matches logo geometry); scaled by --shape-size. */
const DOTS: Record<ShapeKind, { x: number; y: number }[]> = {
  circle: [
    { x: 5, y: 0 },
    { x: 10, y: 5 },
    { x: 5, y: 10 },
    { x: 0, y: 5 },
  ],
  square: [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 10, y: 10 },
    { x: 5, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 5 },
  ],
  triangle: [
    { x: 5, y: 0 },
    { x: 3, y: 5 },
    { x: 7, y: 5 },
    { x: 0, y: 10 },
    { x: 5, y: 10 },
    { x: 10, y: 10 },
  ],
};

const DELAYS_MS: Record<ShapeKind, number[]> = {
  circle: [0, 50, 100, 150],
  square: [0, 30, 60, 90, 120, 150, 180, 210],
  triangle: [0, 40, 80, 120, 160, 200],
};

function shapeSlotPx(sizePx: number): number {
  /* Headroom for scale-110 + soft glow blur so the flex row never shifts when the active shape changes. */
  return Math.ceil(sizePx * 1.22) + 16;
}

function ShapeGlyph({
  kind,
  active,
  sizePx,
}: {
  kind: ShapeKind;
  active: boolean;
  sizePx: number;
}) {
  const dots = DOTS[kind];
  const delays = DELAYS_MS[kind];
  const dur = kind === "square" ? 2.35 : kind === "triangle" ? 2.5 : 2.6;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-visible"
      style={
        {
          width: sizePx,
          height: sizePx,
          "--shape-size": `${sizePx}px`,
        } as CSSProperties
      }
      aria-hidden
    >
      {/* Scale only the inner layer — outer box stays sizePx so slots stay stable. */}
      <span
        className={cn(
          "relative flex h-full w-full origin-center items-center justify-center overflow-visible transition-[transform,opacity] duration-500 ease-out",
          active ? "scale-110 opacity-100" : "scale-100 opacity-[0.42]",
        )}
      >
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[200%] w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-500"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(56, 189, 248, 0.42) 0%, rgba(14, 165, 233, 0.22) 28%, rgba(2, 132, 199, 0.08) 55%, transparent 78%)",
            filter: "blur(6px)",
            opacity: active ? 1 : 0.35,
          }}
        />
        {dots.map((d, i) => (
          <span
            key={`${kind}-${i}`}
            className="absolute z-[1] rounded-full"
            style={{
              left: `${(d.x / 10) * 100}%`,
              top: `${(d.y / 10) * 100}%`,
              width: Math.max(2, sizePx * 0.2),
              height: Math.max(2, sizePx * 0.2),
              backgroundColor: active ? "#e0f2fe" : "#7dd3fc",
              animation: `${active ? "atlas-shape-dot-glow-active" : "atlas-shape-dot-glow"} ${dur}s ease-in-out infinite`,
              animationDelay: `${(delays[i] ?? 0) / 1000}s`,
            }}
          />
        ))}
      </span>
    </span>
  );
}

const SEQUENCE: ShapeKind[] = ["circle", "square", "triangle"];

type AtlasShapeLoaderProps = {
  className?: string;
  sizePx?: number;
  gapClassName?: string;
  cycleMs?: number;
};

/**
 * Circle / square / triangle dot shapes (logo language) with cyan glow + pulsing dots — spinner replacement.
 */
export function AtlasShapeLoader({
  className,
  sizePx = 14,
  gapClassName = "gap-3",
  cycleMs = 720,
}: AtlasShapeLoaderProps) {
  const [hi, setHi] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHi((n) => (n + 1) % SEQUENCE.length);
    }, cycleMs);
    return () => window.clearInterval(id);
  }, [cycleMs]);

  const slot = shapeSlotPx(sizePx);

  return (
    <div
      className={cn("flex shrink-0 items-center justify-center", gapClassName, className)}
      style={{ height: slot, minHeight: slot }}
      aria-hidden
    >
      {SEQUENCE.map((kind, i) => (
        <div
          key={kind}
          className="flex shrink-0 items-center justify-center"
          style={{ width: slot, height: slot }}
        >
          <ShapeGlyph kind={kind} active={i === hi} sizePx={sizePx} />
        </div>
      ))}
    </div>
  );
}

type AtlasLoadingStatusProps = {
  children: ReactNode;
  className?: string;
  /** Shapes row */
  shapeClassName?: string;
  shapeSizePx?: number;
  cycleMs?: number;
  /**
   * Fixed size of the message area (`h-[…] w-[…]`). Copy updates must not change layout.
   */
  messageMinHeightClass?: string;
};

const MESSAGE_LINE_PX = 18;
const MESSAGE_LINE_GAP_PX = 6;

/**
 * Two fixed-height rows: first child → row 1, second → row 2; single child leaves row 2 as invisible spacer.
 * Left-aligned + no wrap + ellipsis so width/length changes don’t re-center or reflow the stack.
 */
function StableLoadingMessage({ children }: { children: ReactNode }) {
  const parts = Children.toArray(children).filter((c) => c != null && c !== false);
  const row1 = parts[0] ?? <span className="select-none opacity-0" aria-hidden>.</span>;
  const row2 = parts.length > 1 ? parts[1] : null;

  const rowShell = (content: ReactNode, muted: boolean) => (
    <div
      className={cn(
        "flex min-w-0 w-full shrink-0 items-center font-montreal text-[0.6875rem] uppercase tracking-[0.06em]",
        muted ? "text-sky-300/90" : "text-sky-200/90",
      )}
      style={{ height: MESSAGE_LINE_PX, lineHeight: `${MESSAGE_LINE_PX}px` }}
    >
      <span className="min-w-0 flex-1 truncate">{content}</span>
    </div>
  );

  return (
    <div
      className="flex min-w-0 w-full shrink-0 flex-col"
      style={{ gap: MESSAGE_LINE_GAP_PX }}
    >
      {rowShell(row1, false)}
      {rowShell(
        row2 ?? <span className="select-none opacity-0" aria-hidden>.</span>,
        true,
      )}
    </div>
  );
}

/**
 * Shapes + status copy with stable vertical space — use anywhere we replaced the ring spinner.
 */
export function AtlasLoadingStatus({
  children,
  className,
  shapeClassName,
  shapeSizePx = 15,
  cycleMs = 680,
  messageMinHeightClass = "h-[50px] w-full",
}: AtlasLoadingStatusProps) {
  return (
    <div
      className={cn(
        "flex w-[min(100%,20rem)] min-w-[13rem] max-w-[20rem] shrink-0 flex-col items-stretch gap-4",
        className,
      )}
    >
      <div className="flex shrink-0 justify-center">
        <AtlasShapeLoader
          className={cn("shrink-0", shapeClassName)}
          sizePx={shapeSizePx}
          cycleMs={cycleMs}
          gapClassName="gap-3.5"
        />
      </div>
      <div
        className={cn(
          "box-border flex shrink-0 flex-col justify-start overflow-hidden px-2 [contain:strict]",
          messageMinHeightClass,
        )}
      >
        <StableLoadingMessage>{children}</StableLoadingMessage>
      </div>
    </div>
  );
}
