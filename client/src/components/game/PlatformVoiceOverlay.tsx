import { Mic, MicOff } from "lucide-react";
import { Room } from "livekit-client";
import type { ParticipantAudioState } from "@/hooks/usePlatformVoice";
import { cn } from "@/lib/utils";
import { getPlayerUiLabelHex, type PlayerColorId } from "@/constants/playerColors";
import { AudioRenderer } from "./AudioRenderer";

const COLOR_ORDER: PlayerColorId[] = ["RED", "GREEN", "BLUE"];

interface PlatformVoiceOverlayProps {
  participants: Map<string, ParticipantAudioState>;
  isMuted: boolean;
  onToggleMute: () => void;
  connectionState: "disconnected" | "connecting" | "connected";
  room: Room | null;
  /** Maps participant identity (userId) to player color name */
  colorMap?: Record<string, string>;
}

export const PlatformVoiceOverlay = ({
  participants,
  isMuted,
  onToggleMute,
  connectionState,
  room,
  colorMap = {},
}: PlatformVoiceOverlayProps) => {
  const getColor = (participantId: string): string => {
    const color = colorMap[participantId] as PlayerColorId | undefined;
    return color ? getPlayerUiLabelHex(color) : "#ffffff";
  };

  const sortedParticipants = Array.from(participants.values()).sort((a, b) => {
    const aColor = (colorMap[a.participantId] || "") as PlayerColorId;
    const bColor = (colorMap[b.participantId] || "") as PlayerColorId;
    return COLOR_ORDER.indexOf(aColor) - COLOR_ORDER.indexOf(bColor);
  });

  const micTitle =
    connectionState === "disconnected"
      ? "Voice offline"
      : connectionState === "connecting"
        ? "Connecting voice…"
        : isMuted
          ? "Unmute"
          : "Mute";

  return (
    <div className="absolute left-4 top-1/2 z-[46] flex -translate-y-1/2 flex-col items-start gap-3 pl-3">
      {/* Speaking Indicators */}
      {connectionState === "connected" && sortedParticipants.length > 0 && (
        <div className="flex flex-col gap-2 py-2">
          {sortedParticipants.map((p) => (
            <div key={p.participantId} className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full transition-all duration-150 ${
                  p.isMuted ? "opacity-30" : p.isSpeaking ? "scale-125" : "scale-100 opacity-50"
                }`}
                style={{
                  backgroundColor: getColor(p.participantId),
                  boxShadow: p.isSpeaking && !p.isMuted ? `0 0 8px ${getColor(p.participantId)}` : "none",
                }}
              />
              <span
                className={`text-sm transition-opacity duration-150 ${
                  p.isMuted ? "opacity-30 line-through" : p.isSpeaking ? "opacity-100" : "opacity-50"
                }`}
                style={{ color: getColor(p.participantId) }}
              >
                {p.displayName}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mute Button */}
      <button
        type="button"
        onClick={onToggleMute}
        disabled={connectionState !== "connected"}
        aria-label={micTitle}
        title={micTitle}
        className={cn(
          "rounded-full p-3 transition-all",
          connectionState === "connected" ? "cursor-pointer" : "cursor-not-allowed",
          isMuted && connectionState === "connected"
            ? "bg-red-500/80 hover:bg-red-500"
            : "hover:bg-white/10",
          connectionState === "disconnected" && "opacity-[0.42] ring-1 ring-inset ring-muted-foreground/20 hover:bg-transparent",
          connectionState === "connecting" && "opacity-80 ring-2 ring-sky-400/25 animate-pulse hover:bg-transparent",
        )}
      >
        {isMuted ? (
          <MicOff className="h-5 w-5 text-foreground" />
        ) : (
          <Mic className="h-5 w-5 text-foreground" />
        )}
      </button>

      {/* Hidden audio elements for remote participants */}
      {room &&
        Array.from(room.remoteParticipants.values()).map((participant) => (
          <AudioRenderer key={participant.sid} participant={participant} />
        ))}
    </div>
  );
};
