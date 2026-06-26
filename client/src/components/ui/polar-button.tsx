import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PolarButton — the tutorial-style platform button extracted for reuse.
 *
 * - `size="md"` (default): h-11 / px-5 / font-montreal text-base font-medium
 *   tracking-tight, mixed-case. Mirrors the lobby/tutorial primary controls.
 * - `size="sm"`: compact HUD style — h-8 / px-3 / text-[10px] font-semibold
 *   uppercase tracking-[0.18em]. Good for inline / footer / dense rows.
 * - `highlight`: bumps to the lifted dark-gray primary CTA treatment with a
 *   subtle cool halo.
 * - `arrow`: optional "left" | "right" renders the SwapArrow on the matching
 *   side; arrow swaps in/out on hover via group-hover.
 *
 * Lives here so we can drop it into any screen later without rewriting the
 * styles. Not wired into Tutorial.tsx yet (Tutorial keeps its inline button).
 */
export type PolarButtonSize = "md" | "sm";

export interface PolarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: PolarButtonSize;
  /** Lifted primary-CTA treatment (dark-gray bg + halo). */
  highlight?: boolean;
  /** Optional swap-on-hover arrow on the leading (left) or trailing (right) side. */
  arrow?: "left" | "right";
}

const SIZE_CLASSES: Record<PolarButtonSize, string> = {
  md: "h-11 px-5 font-montreal text-base font-medium tracking-tight",
  sm: "h-8 px-3 font-montreal text-[10px] font-semibold uppercase tracking-[0.18em]",
};

const ARROW_ICON_SIZE: Record<PolarButtonSize, string> = {
  md: "h-4 w-4",
  sm: "h-3 w-3",
};

const ARROW_WINDOW_SIZE: Record<PolarButtonSize, string> = {
  // window width must match icon width so the strip translation lines up.
  md: "h-4 w-4",
  sm: "h-3 w-3",
};

/** Arrow-swap on hover. Strip of two arrows in an overflow-hidden window;
 *  on group-hover the visible arrow exits in its pointing direction and a
 *  fresh duplicate slides in from the opposite side. Reverses on hover-out. */
export const PolarSwapArrow = ({
  direction = "right",
  size = "md",
  className,
}: {
  direction?: "left" | "right";
  size?: PolarButtonSize;
  className?: string;
}) => {
  const Arrow = direction === "right" ? ArrowRight : ArrowLeft;
  // Right: strip [B][A] starts at -100% (showing A); hover → 0% (A exits right, B enters left)
  // Left:  strip [A][B] starts at 0%    (showing A); hover → -100% (A exits left, B enters right)
  const idleTransform =
    direction === "right"
      ? size === "sm"
        ? "-translate-x-3"
        : "-translate-x-4"
      : "translate-x-0";
  const hoverTransform =
    direction === "right"
      ? "group-hover:translate-x-0"
      : size === "sm"
        ? "group-hover:-translate-x-3"
        : "group-hover:-translate-x-4";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden",
        ARROW_WINDOW_SIZE[size],
        className,
      )}
      aria-hidden
    >
      <span
        className={cn(
          "flex transition-transform duration-300 ease-out",
          idleTransform,
          hoverTransform,
        )}
      >
        <Arrow
          className={cn("shrink-0", ARROW_ICON_SIZE[size])}
          strokeWidth={2}
        />
        <Arrow
          className={cn("shrink-0", ARROW_ICON_SIZE[size])}
          strokeWidth={2}
        />
      </span>
    </span>
  );
};

export const PolarButton = React.forwardRef<HTMLButtonElement, PolarButtonProps>(
  function PolarButton(
    {
      size = "md",
      highlight,
      arrow,
      disabled,
      children,
      className,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(
          "group relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-none border-[1px] border-solid border-white/[0.08] bg-[#040406] text-white transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40 disabled:cursor-not-allowed disabled:opacity-40",
          SIZE_CLASSES[size],
          !disabled &&
            "enabled:hover:border-white/20 enabled:hover:bg-[#1c1d22] enabled:active:scale-[0.98]",
          highlight &&
            "border-white/15 bg-[#2a2a2e] text-white shadow-[0_0_22px_rgba(186,230,253,0.12)]",
          highlight &&
            !disabled &&
            "enabled:hover:bg-[#36363a] enabled:hover:border-white/25 enabled:hover:shadow-[0_0_30px_rgba(186,230,253,0.22)] enabled:active:scale-[0.98]",
          className,
        )}
        {...rest}
      >
        {arrow === "left" && <PolarSwapArrow direction="left" size={size} className="-ml-0.5" />}
        <span className="relative z-[1] inline-flex items-center gap-1.5">{children}</span>
        {arrow === "right" && <PolarSwapArrow direction="right" size={size} className="-mr-0.5" />}
      </button>
    );
  },
);
