import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { HudCornerLs, POLAR_HUD } from "@/components/ui/polar-chrome";

export interface ResultsOverlayProps {
  totalScore: number;
  stage: number;
  reason: "gameover" | "abandoned";
  returnUrl?: string | null;
  onBack: () => void;
}

const labelCls = "text-left font-montreal text-[9px] font-medium uppercase tracking-[0.12em] text-slate-300";
const valueCls = "font-montreal text-lg font-bold text-white sm:text-xl";

export const ResultsOverlay = ({
  totalScore,
  stage,
  reason,
  returnUrl,
  onBack,
}: ResultsOverlayProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  const formatScore = (n: number) => n.toLocaleString();

  return (
    <div
      className={cn(
        "fixed inset-0 z-[45] flex items-center justify-center px-5 py-10 transition-opacity duration-700",
        "bg-canvas/88 backdrop-blur-sm",
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_85%_55%_at_50%_32%,rgba(56,189,248,0.09),transparent_58%)]",
      )}
      style={{ opacity: visible ? 1 : 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-overlay-title"
    >
      <div
        className="relative z-10 w-full max-w-[min(22rem,calc(100vw-2.5rem))] rounded-none border border-solid bg-canvas/50 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[6px]"
        style={{ borderColor: POLAR_HUD.border }}
        data-ui="results-overlay-panel"
      >
        <HudCornerLs />
        <div className="relative z-[1]">
          <header className="mb-5 border-b border-white/10 pb-5 text-center">
            <p className="font-montreal text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">
              {reason === "abandoned" ? "Session status" : "Run complete"}
            </p>
            <h1
              id="results-overlay-title"
              className="mt-2 font-montreal text-2xl font-bold tracking-tight text-white"
            >
              {reason === "abandoned" ? "Game abandoned" : "Game over"}
            </h1>
          </header>

          <div className="overflow-hidden rounded-none border border-solid ring-1 ring-inset ring-white/[0.04]" style={{ borderColor: POLAR_HUD.border, background: "rgba(255,255,255,0.03)" }}>
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-3.5 py-2.5 sm:px-4 sm:py-3">
              <span className={labelCls}>Levels passed</span>
              <span className={valueCls}>{stage}</span>
            </div>
            <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 sm:px-4 sm:py-3">
              <span className={labelCls}>Score</span>
              <span className={valueCls}>{formatScore(totalScore)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="relative mt-7 flex h-11 w-full items-center justify-center rounded-none border border-solid bg-canvas/50 font-montreal text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[4px] transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            style={{ borderColor: POLAR_HUD.border }}
          >
            <HudCornerLs />
            <span className="relative z-[1]">{returnUrl ? "Back to platform" : "Main menu"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
