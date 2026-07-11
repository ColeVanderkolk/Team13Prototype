import { HudCornerLs, POLAR_HUD } from "@/components/ui/polar-chrome";
import { Canvas, useThree } from "@react-three/fiber";
import * as Client from "colyseus.js";
import { Component, useRef, useEffect, useState, type MutableRefObject } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Info, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GameControls } from "@/components/game/GameControls";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { NoiseFieldOverlay, type NoiseFieldHandle } from "@/components/game/NoiseFieldOverlay";
import { StageAnnouncement } from "@/components/game/StageAnnouncement";
import { DevStageControls } from "@/components/game/DevStageControls";
import { MazeBoard } from "@/components/game/MazeBoard";
import { Compass } from "@/components/game/Compass";

// Error boundary to catch silent Canvas/Three.js crashes
class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Canvas Error Boundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-canvas">
          <div className="text-center">
            <p className="text-slate-400 text-sm mb-3">3D rendering failed</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-none border border-emerald-500/60 bg-emerald-950/40 px-4 py-2 font-montreal text-xs uppercase tracking-wider text-emerald-200 transition hover:border-emerald-400/80 hover:bg-emerald-900/50"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Defers EffectComposer mount until canvas has real dimensions,
// preventing Bloom from creating 0x0 framebuffers inside iframes
const DeferredEffects = () => {
  const { size } = useThree();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (size.width > 0 && size.height > 0) setReady(true);
  }, [size.width, size.height]);

  if (!ready) return null;
  return (
    <EffectComposer>
      <Bloom intensity={0.75} luminanceThreshold={0.5} luminanceSmoothing={0.9} mipmapBlur />
    </EffectComposer>
  );
};

interface PlayerState {
    x: number;
    y: number;
    sessionId: string;
    name: string;
}

interface Collectible {
    x: number;
    y: number;
    id: string;
    score: number;
}

interface GameScreenProps {
    room: Client.Room | null;
    players: Map<string, PlayerState>;
    gridWidth: number;
    gridHeight: number;
    mazeWalls: number[];
    startX: number;
    startY: number;
    exitX: number;
    exitY: number;
    exitUnlocked: boolean;
    collectibles: Collectible[];
    totalScore: number; 
    stage: number;
    timeRemaining: number; 
    seed: number;
    isSoloMode: boolean;
    isDevMode: boolean;
    countdown?: number;
    onGameAbandoned?: ()=> void;

    pressurePlatesRequired: number;
    plate0X: number;
    plate0Y: number;
    plate1X: number;
    plate1Y: number;
    plate2X: number;
    plate2Y: number;

    keysRequired: number
    key0X: number;
    key0Y: number;
    key1X: number;
    key1Y: number;
    key2X: number;
    key2Y: number;
    allKeysCollected: boolean;
    keysCollectedMask: number; 
    
    obstacleType: string;
    playersAtExit: number;
}

export const GameScreen = ({
    room,
    players, 
    gridWidth,
    gridHeight,
    mazeWalls,
    startX,
    startY,
    exitX,
    exitY,
    exitUnlocked,
    collectibles,
    totalScore,
    stage,
    timeRemaining,
    seed,
    isSoloMode,
    isDevMode,
    countdown,
    onGameAbandoned,

    pressurePlatesRequired,
    plate0X,
    plate0Y,
    plate1X,
    plate1Y,
    plate2X,
    plate2Y,

    keysRequired,
    key0X,
    key0Y,
    key1X,
    key1Y,
    key2X,
    key2Y,
    allKeysCollected,
    keysCollectedMask,

    obstacleType,
    playersAtExit,
}: GameScreenProps) => {
    const pendingInputsRef = useRef<Map<number, { x: number, y: number }>>(new Map());
    const seqCounterRef = useRef(0);
    const lastRepeatTimeRef = useRef(0);
    const prevStageRef = useRef(stage);
    const onGameAbandonedRef = useRef(onGameAbandoned);
    onGameAbandonedRef.current = onGameAbandoned;
    // const WALK_SPEED = 6.0;
    // const SPRINT_SPEED = 10.5; 

    const noiseFieldRef = useRef<NoiseFieldHandle>(null);
    const compassYawRef = useRef<number | null>(null);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsExiting, setSettingsExiting] = useState(false);
    const [controlsOpen, setControlsOpen] = useState(false);
    const [barBloom, setBarBloom] = useState(0);
    const settingsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const SETTINGS_CLOSE_MS = 300; 


    // Dev: client-side stage override for effects testing (does NOT affect game)
    const [fakeStage, setFakeStage] = useState<number | null>(null);
    const effectiveStage = fakeStage ?? stage;

    const openSettings = () => {
        if (settingsCloseTimerRef.current != null) {
            clearTimeout(settingsCloseTimerRef.current);
            settingsCloseTimerRef.current = null;
            }
            setSettingsExiting(false);
            setSettingsOpen(true);
    };

    const requestCloseSettings = () => {
        if (settingsCloseTimerRef.current != null) return;
            setSettingsExiting(true);
            settingsCloseTimerRef.current = setTimeout(() => {
            settingsCloseTimerRef.current = null;
            setSettingsOpen(false);
            setSettingsExiting(false);
        }, SETTINGS_CLOSE_MS);
    };
    
  return (
    <div className="isolate w-full h-screen relative overflow-hidden bg-canvas">
      {/* Cloud nebula backdrop is rendered inside the R3F Canvas (NebulaBackdrop). */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-canvas/25 via-transparent to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_45%,transparent_35%,hsl(222_45%_6%/0.35)_100%)]"
        aria-hidden
      />
      {/* NOTE: PolarAmbientParticlesCanvas & NoiseBlobFieldCanvas removed —
           hidden behind opaque R3F Canvas (z-[1]), wasted WebGL contexts.
           NoiseFieldOverlay + ScoreBurstOverlay moved AFTER the R3F Canvas below. */}
      <style>{`
        @keyframes hudVotePulse {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.12);
          }
        }
        @keyframes hudVoteBanner {
          0% {
            opacity: 0;
            transform: translate(-50%, -8px);
          }
          18% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          70% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -4px);
          }
        }
        @keyframes scoreGainPop {
          0% {
            transform: translateY(14px) scale(0.45) rotate(-8deg);
            opacity: 0;
          }
          12% {
            transform: translateY(-6px) scale(1.14) rotate(4deg);
            opacity: 1;
          }
          30% {
            transform: translateY(-3px) scale(1.02) rotate(-1deg);
          }
          52% {
            transform: translateY(-5px) scale(1) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(-84px) scale(0.86) rotate(0deg);
            opacity: 0;
          }
        }
        @keyframes scoreLossPop {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          22% {
            transform: translateY(4px) scale(1.12) rotate(-4deg);
          }
          100% {
            transform: translateY(56px) scale(0.75) rotate(6deg);
            opacity: 0;
          }
        }
        @keyframes scoreBurstRing {
          0% {
            transform: translate(-50%, -50%) scale(0.35);
            opacity: 0.65;
          }
          100% {
            transform: translate(-50%, -50%) scale(2.4);
            opacity: 0;
          }
        }
      `}</style>

      {/* HUD: frosted polar chrome (match timer / stage chips); settings swap into same shell */}
      <div className="absolute left-4 top-4 z-20 flex w-[min(11.5rem,calc(100vw-2rem))] flex-col gap-2">
        <div
          className="relative flex flex-col overflow-hidden rounded-none border border-solid bg-canvas/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[4px]"
          style={{ borderColor: POLAR_HUD.border }}
          role="status"
          aria-live="polite"
          data-ui="game-hud-panel"
        >
          <HudCornerLs />
          <div className="relative z-[1] flex min-h-0 flex-col">
          {settingsOpen && (
            <div className="relative z-30 flex h-9 w-full shrink-0 items-center justify-end border-b border-white/10 bg-canvas/30 px-2">
              <button
                type="button"
                onClick={requestCloseSettings}
                aria-controls="game-settings-panel"
                aria-label="Close settings"
                title="Close"
                className="flex size-7 shrink-0 items-center justify-center rounded-none text-slate-500 transition-colors hover:bg-white/[0.07] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <X className="size-3.5" strokeWidth={1.65} aria-hidden />
              </button>
            </div>
          )}

          {settingsOpen && (
            <div
              id="game-settings-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="game-settings-title"
              className={cn(
                "relative z-20 flex max-h-[min(70vh,22rem)] min-h-0 w-full shrink-0 flex-col gap-3 overflow-y-auto bg-transparent px-3 py-3 transition-opacity duration-300 ease-out",
                settingsExiting ? "pointer-events-none opacity-0" : "opacity-100",
              )}
            >
              <p
                id="game-settings-title"
                className="font-montreal text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500"
              >
                Settings
              </p>
              {room?.roomId && (
                <div className="border-t border-white/10 pt-3">
                  <p className="font-montreal text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    Room code
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold tracking-widest text-white">
                    {room.roomId}
                  </p>
                </div>
              )}
            </div>
          )}

          {!settingsOpen && (
            <>
          {isSoloMode ? (
            <>
              <div className="relative z-10 flex w-full shrink-0 flex-col gap-3 px-3 py-3">
                <div className="grid min-w-0 gap-1">
                  <p className="font-montreal text-[9px] uppercase leading-none tracking-[0.12em] text-slate-500">
                    Mode
                  </p>
                  <p className="truncate text-xs font-medium tabular-nums leading-tight text-slate-200">
                    Solo mode
                  </p>
                </div>
              </div>

              <div className="relative z-10 flex min-h-10 w-full shrink-0 flex-nowrap items-center justify-between gap-x-2 border-t border-white/10 px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-x-1.5">
                  <kbd
                    className="inline-flex shrink-0 items-center rounded-none border border-solid bg-canvas/50 px-1.5 py-0.5 font-montreal text-[9px] font-medium uppercase tracking-[0.1em] text-slate-400"
                    style={{ borderColor: POLAR_HUD.border }}
                  >
                    Tab
                  </kbd>
                  <span className="min-w-0 truncate text-[11px] leading-snug text-slate-500">
                    Switch player
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setControlsOpen(v => !v)}
                    aria-expanded={controlsOpen}
                    aria-label="Toggle controls"
                    title="Controls"
                    className="flex size-7 shrink-0 items-center justify-center rounded-none text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <Info className="size-3.5" strokeWidth={1.65} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={openSettings}
                    aria-expanded={settingsOpen}
                    aria-controls="game-settings-panel"
                    aria-label="Open settings"
                    title="Settings"
                    className="flex size-7 shrink-0 items-center justify-center rounded-none text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <Settings className="size-3.5" strokeWidth={1.65} aria-hidden />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="relative z-10 flex w-full shrink-0 flex-col gap-3 px-3 py-3">
              <div className="grid min-w-0 gap-1">
                <p className="font-montreal text-[9px] uppercase leading-none tracking-[0.12em] text-slate-500">
                  Mode
                </p>
                <p className="truncate text-xs font-medium tabular-nums leading-tight text-slate-200">Multiplayer</p>
              </div>
              {room?.roomId && (
                <div className="grid min-w-0 gap-1">
                  <p className="font-montreal text-[9px] uppercase leading-none tracking-[0.12em] text-slate-500">
                    Room code
                  </p>
                  <p className="truncate font-mono text-xs font-semibold tracking-widest text-white">
                    {room.roomId}
                  </p>
                </div>
              )}
              <div className="grid min-w-0 gap-1">
                <p className="font-montreal text-[9px] uppercase leading-none tracking-[0.12em] text-slate-500">
                  You
                </p>
              </div>
              <div className="flex w-full shrink-0 justify-end gap-0.5 border-t border-white/10 pt-2">
                <button
                  type="button"
                  onClick={() => setControlsOpen(v => !v)}
                  aria-expanded={controlsOpen}
                  aria-label="Toggle controls"
                  title="Controls"
                  className="flex size-7 shrink-0 items-center justify-center rounded-none text-slate-500 transition-colors hover:bg-white/[0.07] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <Info className="size-3.5" strokeWidth={1.65} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={openSettings}
                  aria-expanded={settingsOpen}
                  aria-controls="game-settings-panel"
                  aria-label="Open settings"
                  title="Settings"
                  className="flex size-7 shrink-0 items-center justify-center rounded-none text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <Settings className="size-3.5" strokeWidth={1.65} aria-hidden />
                </button>
              </div>
            </div>
          )}
            </>
          )}
          </div>
        </div>

        {/* Controls reference — toggled via info button */}
        {controlsOpen && <GameControls showPing={!isSoloMode} />}
      </div>

      {/* Stage Display - Top Center (polar blue chrome) */}
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
        {/* Outer glow — intensity scales with stage + bloom pulse on transition */}
        <div
          className="absolute -inset-3 rounded-sm"
          style={{
            background: barBloom > 0
              ? `radial-gradient(ellipse at center, rgba(56,189,248,${0.15 + barBloom * 0.3}) 0%, rgba(186,230,253,${barBloom * 0.1}) 50%, transparent 75%)`
              : `radial-gradient(ellipse at center, rgba(56,189,248,${0.06 + (effectiveStage / 8) * 0.18}) 0%, transparent 70%)`,
            filter: `blur(${barBloom > 0 ? 10 + barBloom * 8 : 6 + effectiveStage * 1.5}px)`,
            transition: barBloom > 0 ? "none" : "all 1.5s ease-out",
          }}
          aria-hidden
        />
        <div
          className="relative min-w-[7rem] rounded-none border border-solid bg-canvas/50 px-5 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[4px]"
          style={{
            borderColor: `rgba(56,189,248,${0.2 + (effectiveStage / 8) * 0.2})`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 ${8 + effectiveStage * 3}px rgba(56,189,248,${0.05 + (effectiveStage / 8) * 0.15})`,
          }}
          data-ui="game-stage-chip"
        >
          <HudCornerLs />
          <div className="relative z-[1]">
            <p className="font-montreal text-[9px] uppercase leading-tight tracking-[0.12em] text-slate-300">Level</p>
            <p className="mt-1 font-montreal text-3xl font-bold leading-none text-white">
              {effectiveStage}
            </p>
          </div>
        </div>
      </div>



      {/* Score Display - Top Right (temporary scoring shell for collectible pickups) */}
      <div className="absolute right-4 top-4 z-10">
        <div
          className="relative min-w-[7.25rem] whitespace-nowrap rounded-none border border-solid bg-canvas/50 px-4 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[4px]"
          style={{ borderColor: POLAR_HUD.border }}
          data-ui="game-score-chip"
        >
          <HudCornerLs />
          <div className="relative z-[1]">
            <p className="font-montreal text-[9px] uppercase leading-tight tracking-[0.12em] text-slate-300">Score</p>
            <p className="mt-1 font-montreal text-3xl font-bold leading-none text-white">
              {totalScore}
            </p>
          </div>
        </div>
      </div>

      {/* Exit waiting indicator — only shows when exit is unlocked and someone is there */}
      {exitUnlocked && playersAtExit > 0 && (
        <div className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-none border border-yellow-400/40 bg-canvas/70 px-4 py-2 text-center backdrop-blur-sm">
          <p className="font-montreal text-[9px] uppercase tracking-[0.12em] text-yellow-300/80">At exit</p>
          <p className="mt-0.5 font-montreal text-lg font-bold leading-none text-yellow-300">
            {playersAtExit} / {players.size}
          </p>
        </div>
      )}

      {/* Timer Display - Bottom Center (polar blue chrome) */}
      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
        <div
          className="relative min-w-[7.25rem] whitespace-nowrap rounded-none border border-solid bg-canvas/50 px-4 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[4px]"
          style={{ borderColor: POLAR_HUD.border }}
          data-ui="game-timer-chip"
        >
          <HudCornerLs />
          <div className="relative z-[1]">
            <p className="font-montreal text-[9px] uppercase leading-tight tracking-[0.12em] text-slate-300">Time</p>
            <p className="font-montreal text-[9px] uppercase leading-tight tracking-[0.12em] text-slate-300">Remaining</p>
            <p className="mt-1 font-montreal text-3xl font-bold leading-none tracking-[-0.04em] text-white">
              {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, "0")}
            </p>
          </div>
        </div>
      </div>


      {/* Main Game Canvas */}
      <CanvasErrorBoundary>
      <Canvas
        className="absolute inset-0 z-[1] h-full w-full min-h-0"
        style={{ background: "#000000" }}
        shadows
        camera={{ position: [0, 12, 12], fov: 46, near: 0.1, far: 120 }}
        gl={{
          powerPreference: "default",
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            console.warn("[WebGL] Context lost");
          });
          canvas.addEventListener("webglcontextrestored", () => {
            console.log("[WebGL] Context restored");
          });
        }}
      >

        <MazeBoard
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          mazeWalls={mazeWalls}
          startX={startX}
          startY={startY}
          exitX={exitX}
          exitY={exitY}
          exitUnlocked={exitUnlocked}
          seed={seed}
          collectibles={collectibles}
          players={players}
          room={room}
          countdown={countdown}
          currentSessionId={room?.sessionId}
          pressurePlatesRequired={pressurePlatesRequired}
          plate0X={plate0X}
          plate0Y={plate0Y}
          plate1X={plate1X}
          plate1Y={plate1Y}
          plate2X={plate2X}
          plate2Y={plate2Y}
          keysRequired={keysRequired}
          key0X={key0X}
          key0Y={key0Y}
          key1X={key1X}
          key1Y={key1Y}
          key2X={key2X}
          key2Y={key2Y}
          allKeysCollected={allKeysCollected}
          keysCollectedMask={keysCollectedMask}
          obstacleType={obstacleType}
          playersAtExit={playersAtExit}
          compassYawRef={compassYawRef}
        />

        <DeferredEffects />

      </Canvas>
      </CanvasErrorBoundary>

      <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
        <Compass compassYawRef={compassYawRef} />
      </div>

      {/* Overlays — AFTER R3F Canvas, no wrapper divs, canvases use mix-blend-mode:screen */}
      <NoiseFieldOverlay ref={noiseFieldRef} resolutionScale={0.8} />
      <StageAnnouncement stage={effectiveStage} />
      <DevStageControls room={room} isDevMode={isDevMode} stage={effectiveStage} onFakeStageChange={setFakeStage} />

    </div>
  );
};
