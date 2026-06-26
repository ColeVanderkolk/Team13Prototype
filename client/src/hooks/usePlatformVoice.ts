import { useState, useEffect, useCallback, useRef } from "react";
import { Room, RoomEvent, RemoteParticipant, LocalParticipant, Track } from "livekit-client";

export interface ParticipantAudioState {
  participantId: string;
  displayName: string;
  isSpeaking: boolean;
  isMuted: boolean;
}

interface UsePlatformVoiceProps {
  token: string | null;
  livekitUrl: string | null;
  enabled: boolean;
  /** When false, joins the room without publishing a mic track (listen-only). */
  micEnabled?: boolean;
}

export function usePlatformVoice({
  token,
  livekitUrl,
  enabled,
  micEnabled = true,
}: UsePlatformVoiceProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [participants, setParticipants] = useState<Map<string, ParticipantAudioState>>(new Map());
  const [connectionState, setConnectionState] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const roomRef = useRef<Room | null>(null);

  const updateParticipants = useCallback((lkRoom: Room) => {
    const newParticipants = new Map<string, ParticipantAudioState>();

    const local = lkRoom.localParticipant;
    if (local) {
      const audioTrack = local.getTrackPublication(Track.Source.Microphone);
      newParticipants.set(local.identity, {
        participantId: local.identity,
        displayName: local.name || local.identity,
        isSpeaking: local.isSpeaking,
        isMuted: audioTrack?.isMuted ?? true,
      });
    }

    lkRoom.remoteParticipants.forEach((participant) => {
      if (participant.identity.startsWith("agent-")) return;
      const audioTrack = participant.getTrackPublication(Track.Source.Microphone);
      newParticipants.set(participant.identity, {
        participantId: participant.identity,
        displayName: participant.name || participant.identity,
        isSpeaking: participant.isSpeaking,
        isMuted: audioTrack?.isMuted ?? true,
      });
    });

    setParticipants(newParticipants);
  }, []);

  useEffect(() => {
    if (!token || !livekitUrl || !enabled) {
      return;
    }

    const newRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    roomRef.current = newRoom;
    setConnectionState("connecting");

    const handleConnected = () => {
      setConnectionState("connected");
      updateParticipants(newRoom);
    };

    const handleDisconnected = () => {
      setConnectionState("disconnected");
    };

    const handleParticipantConnected = () => updateParticipants(newRoom);
    const handleParticipantDisconnected = () => updateParticipants(newRoom);
    const handleActiveSpeakersChanged = () => updateParticipants(newRoom);
    const handleTrackMuted = () => updateParticipants(newRoom);
    const handleTrackUnmuted = () => updateParticipants(newRoom);
    const handleTrackSubscribed = () => updateParticipants(newRoom);

    newRoom.on(RoomEvent.Connected, handleConnected);
    newRoom.on(RoomEvent.Disconnected, handleDisconnected);
    newRoom.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    newRoom.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    newRoom.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
    newRoom.on(RoomEvent.TrackMuted, handleTrackMuted);
    newRoom.on(RoomEvent.TrackUnmuted, handleTrackUnmuted);
    newRoom.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);

    newRoom
      .connect(livekitUrl, token)
      .then(async () => {
        console.log("[PlatformVoice] Connected to LiveKit room");
        setRoom(newRoom);
        if (micEnabled) {
          try {
            await newRoom.localParticipant.setMicrophoneEnabled(true);
            console.log("[PlatformVoice] Microphone enabled");
          } catch (micError) {
            console.warn("[PlatformVoice] Microphone permission denied, joining muted:", micError);
            setIsMuted(true);
          }
        } else {
          console.log("[PlatformVoice] Mic skipped by user, joining listen-only");
          setIsMuted(true);
        }
      })
      .catch((error) => {
        console.error("[PlatformVoice] Connection failed:", error);
        setConnectionState("disconnected");
      });

    return () => {
      newRoom.off(RoomEvent.Connected, handleConnected);
      newRoom.off(RoomEvent.Disconnected, handleDisconnected);
      newRoom.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      newRoom.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      newRoom.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
      newRoom.off(RoomEvent.TrackMuted, handleTrackMuted);
      newRoom.off(RoomEvent.TrackUnmuted, handleTrackUnmuted);
      newRoom.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);

      newRoom.disconnect();
      roomRef.current = null;
      setRoom(null);
    };
  }, [token, livekitUrl, enabled, micEnabled, updateParticipants]);

  const toggleMute = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;
    const newMuted = !isMuted;
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
    } catch {
      // mic permission denied — stay muted
    }
  }, [isMuted]);

  return {
    room,
    isMuted,
    toggleMute,
    participants,
    connectionState,
  };
}
