/**
 * GameControls — keyboard + mouse control reference.
 * Faithfully based on the reference HTML, styled for polar HUD.
 */

import { POLAR_HUD, HudCornerLs } from "@/components/ui/polar-chrome";

/* Solid colors that match the look of sky-400 at various opacities on dark bg */
const BLUE = "#5ba8c8";          /* main: strokes, text, arrows */
const BLUE_BORDER = "#2d6a82";   /* key borders */
const BLUE_DIM = "#3d7a94";      /* secondary text ("or", subtitle) */

export function GameControls({ showPing = true }: { showPing?: boolean }) {
  return (
    <div
      className="relative rounded-none border border-solid bg-canvas/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[4px]"
      style={{ borderColor: POLAR_HUD.border }}
      data-ui="game-controls"
    >
      <HudCornerLs />
      <div className="relative z-[1] flex flex-col items-center gap-2.5 p-2.5">
        {/* ── Keyboard section ── */}
        <div className="flex items-start gap-2.5">
          {/* Arrow keys cluster */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(3, 20px)",
                gridTemplateRows: "repeat(2, 20px)",
                gap: "2px",
              }}
            >
              <span />
              <Key>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none">
                  <path d="M12 19V5M5 12l7-7 7 7" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Key>
              <span />
              <Key>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none">
                  <path d="M19 12H5M12 5l-7 7 7 7" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Key>
              <Key>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none">
                  <path d="M12 5v14M5 12l7 7 7-7" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Key>
              <Key>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Key>
            </div>
            <span className="font-montreal text-[8px] font-bold uppercase tracking-[0.05em]" style={{ color: BLUE }}>
              Move
            </span>
          </div>

          {/* "or" */}
          <span
            className="font-montreal text-[10px] font-bold"
            style={{ color: BLUE_DIM, marginTop: "24px" }}
          >
            or
          </span>

          {/* WASD cluster */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(3, 20px)",
                gridTemplateRows: "repeat(2, 20px)",
                gap: "2px",
              }}
            >
              <span />
              <Key>W</Key>
              <span />
              <Key>A</Key>
              <Key>S</Key>
              <Key>D</Key>
            </div>
            <span className="font-montreal text-[8px] font-bold uppercase tracking-[0.05em]" style={{ color: BLUE }}>
              Move
            </span>
          </div>
        </div>

        {/* ── Mouse section ── */}
        {showPing && (
          <div className="flex items-center gap-2 border-t border-white/10 pt-2.5" style={{ transform: "translateX(-3px)" }}>
            <svg width="32" height="36" viewBox="0 0 39 43" fill="none" style={{ color: BLUE, overflow: "visible" }} className="shrink-0">
              {/* Left button fill — clipped to top-left of body */}
              <defs>
                <clipPath id="gc-mouse-left">
                  <path d="M22.5004 1.5004C10.5004 1.5004 7.50049 10.5203 7.50049 21.5004H22.5004V1.5004Z" />
                </clipPath>
              </defs>
              <rect x="7" y="1" width="16" height="21" fill="currentColor" clipPath="url(#gc-mouse-left)" />
              <path d="M22.5005 8.5004V1.5004M22.5005 21.5004V15.5004" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22.5004 41.5004C34.5005 41.5004 37.5005 32.4804 37.5005 21.5004C37.5005 10.5204 34.5005 1.5004 22.5004 1.5004C10.5004 1.5004 7.50049 10.5203 7.50049 21.5004C7.50049 32.4805 10.5004 41.5004 22.5004 41.5004Z" stroke="currentColor" strokeWidth="3" />
              <path d="M25.5005 11.5004C25.5005 10.5685 25.5005 10.1026 25.3482 9.73503C25.1453 9.24497 24.7559 8.85563 24.2659 8.65264C23.8983 8.5004 23.4324 8.5004 22.5005 8.5004C21.5686 8.5004 21.1027 8.5004 20.7351 8.65264C20.2451 8.85563 19.8557 9.24497 19.6527 9.73503C19.5005 10.1026 19.5005 10.5685 19.5005 11.5004V12.5004C19.5005 13.4323 19.5005 13.8982 19.6527 14.2658C19.8557 14.7558 20.2451 15.1452 20.7351 15.3482C21.1027 15.5004 21.5686 15.5004 22.5005 15.5004C23.4324 15.5004 23.8983 15.5004 24.2659 15.3482C24.7559 15.1452 25.1453 14.7558 25.3482 14.2658C25.5005 13.8982 25.5005 13.4323 25.5005 12.5004V11.5004Z" stroke="currentColor" strokeWidth="3" />
              <path d="M7.50049 21.5004L37.5005 21.5004" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.50049 3.83531L4.73824 1.5004M3.55784 8.63531L1.50049 9.5004" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>

            <div className="flex flex-col gap-0.5">
              <p className="font-montreal text-[11px] font-semibold leading-snug" style={{ color: BLUE }}>
                Ping a location.
              </p>
              <p className="font-montreal text-[10px] font-medium leading-snug" style={{ color: BLUE_DIM }}>
                (Visible to your team)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex items-center justify-center rounded-[3px] font-montreal text-[9px] font-semibold uppercase"
      style={{
        border: `2px solid ${BLUE_BORDER}`,
        color: BLUE,
        width: "20px",
        height: "20px",
      }}
    >
      {children}
    </span>
  );
}
