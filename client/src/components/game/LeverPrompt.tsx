import { useEffect, useRef, type MutableRefObject } from "react";

type LeverPromptProps = {
  leverInRangeRef: MutableRefObject<boolean>;
};

// "Press E" hint — a hollow square with an E inside, shown only while a lever is within reach.
// Reads a ref updated every frame inside the R3F canvas (same pattern as Compass), so it doesn't
// force a React re-render of the whole HUD on every position update.
export function LeverPrompt({ leverInRangeRef }: LeverPromptProps) {
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let rafId: number;
    let visible = false;
    const update = () => {
      const shouldShow = leverInRangeRef.current;
      if (shouldShow !== visible && elRef.current) {
        visible = shouldShow;
        elRef.current.style.opacity = shouldShow ? "1" : "0";
        elRef.current.style.transform = shouldShow ? "scale(1)" : "scale(0.85)";
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [leverInRangeRef]);

  return (
    <div
      ref={elRef}
      style={{ opacity: 0, transform: "scale(0.85)", transition: "opacity 0.15s ease, transform 0.15s ease" }}
      className="flex h-10 w-10 items-center justify-center rounded-none border-2 border-slate-200/80 bg-canvas/60 shadow-[0_0_10px_rgba(56,189,248,0.25)] backdrop-blur-[2px]"
    >
      <span className="font-montreal text-base font-bold leading-none text-slate-100">E</span>
    </div>
  );
}
