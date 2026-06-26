import { useEffect, useState, useRef } from "react";

/**
 * StageAnnouncement — Simple fade in / fade out at center of screen.
 *
 * Usage:
 *   <StageAnnouncement stage={stage} />
 */

interface StageAnnouncementProps {
  stage: number;
}

export function StageAnnouncement({ stage }: StageAnnouncementProps) {
  const [phase, setPhase] = useState<"idle" | "visible" | "fading">("idle");
  const [displayStage, setDisplayStage] = useState(stage);
  const prevStageRef = useRef(stage);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Don't announce stage 1 (game start)
    if (stage === prevStageRef.current) return;
    prevStageRef.current = stage;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setDisplayStage(stage);
    setPhase("visible");

    // Hold for 1.4s, then fade out
    timeoutRef.current = setTimeout(() => {
      setPhase("fading");
    }, 1400);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [stage]);

  if (phase === "idle") return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center overflow-hidden"
      aria-live="assertive"
      role="status"
    >
      <h1
        className="font-montreal font-black uppercase leading-none text-white"
        style={{
          fontSize: "clamp(3rem, 12vw, 8rem)",
          letterSpacing: "-0.02em",
          transition: phase === "visible"
            ? "opacity 0.3s ease-out"
            : "opacity 0.6s ease-in",
          opacity: phase === "visible" ? 1 : 0,
        }}
        onTransitionEnd={() => {
          if (phase === "fading") setPhase("idle");
        }}
      >
        Stage {displayStage}
      </h1>
    </div>
  );
}
