import { useEffect, useState, useCallback } from "react";
import type * as Client from "colyseus.js";

/**
 * DevStageControls — Floating debug panel for advancing stages.
 *
 * EFFECTS TESTING ONLY — does NOT affect game logic beyond triggering
 * the existing server-side devStageUp message.
 *
 * Enabled on localhost or when isDevMode is true.
 * Shows a small "DEV" pill in bottom-right — click to expand.
 * Also toggleable via backtick or F9 keys.
 */

interface DevStageControlsProps {
  room: Client.Room | null;
  isDevMode: boolean;
  stage: number;
  /** Client-side stage override for effects testing (won't affect server) */
  onFakeStageChange?: (stage: number) => void;
}

export function DevStageControls({ room, isDevMode, stage, onFakeStageChange }: DevStageControlsProps) {
  const isLocalhost = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
  // On localhost: no pill, but keyboard shortcut (` or F9) works
  // With server devMode: pill visible + keyboard shortcut
  const enabled = isDevMode || isLocalhost;

  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback((e: KeyboardEvent) => {
    if (e.key === "`" || e.key === "F9") {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(prev => !prev);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", toggle, true);
    return () => window.removeEventListener("keydown", toggle, true);
  }, [enabled, toggle]);

  if (!enabled) return null;

  const advanceStage = () => {
    if (stage >= 8) return;
    // Try server-side first (works if room is in devMode)
    if (room && isDevMode) {
      room.send("devStageUp");
    }
    // Also fire client-side fake stage for effects preview
    if (onFakeStageChange) {
      onFakeStageChange(stage + 1);
    }
  };

  // Collapsed: show pill only when server devMode is on (not on localhost-only)
  if (!expanded) {
    if (!isDevMode) return null; // localhost: no pill, use ` or F9 to open
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-3 right-3 z-[100] rounded border border-yellow-500/30 bg-black/70 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-yellow-400/80 backdrop-blur-sm transition-opacity hover:opacity-100 opacity-50"
        title="Open dev controls (` or F9)"
      >
        DEV
      </button>
    );
  }

  // Expanded panel
  return (
    <div
      className="fixed bottom-3 right-3 z-[100] flex flex-col gap-2 rounded-lg border border-white/10 bg-black/85 p-3 backdrop-blur-sm"
      data-ui="dev-stage-controls"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-400/80">
          Dev Controls
        </p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[10px] text-white/40 hover:text-white/70"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/60">Stage {stage}/8</span>
        <button
          type="button"
          onClick={advanceStage}
          disabled={stage >= 8}
          className="rounded border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next Stage →
        </button>
      </div>
      <p className="text-[9px] text-white/30">Effects only — board expands on real stage change (server-side)</p>
    </div>
  );
}