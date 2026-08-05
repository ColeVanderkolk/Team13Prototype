import { useState, useEffect, useCallback, useRef } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

export interface ParticipantAudioState {
  participantId: string; // Colyseus sessionId, used as the LiveKit identity too
  displayName: string;
  isSpeaking: boolean;
  isMuted: boolean;
}

interface UseVoiceChatProps {
  token: string | null;
  livekitUrl: string | null;
  enabled: boolean;
}

// Joins a LiveKit room for real-time voice and tracks who's connected/speaking/muted.
// Entirely optional and separate from the Colyseus game-state path - if token/livekitUrl
// never arrive (server has no LiveKit credentials configured), this just stays idle.
export function useVoiceChat({ token, livekitUrl, enabled }: UseVoiceChatProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [participants, setParticipants] = useState<Map<string, ParticipantAudioState>>(new Map());
  const [connectionState, setConnectionState] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const roomRef = useRef<Room | null>(null);

  const updateParticipants = useCallback((lkRoom: Room) => {
    const next = new Map<string, ParticipantAudioState>();

    const local = lkRoom.localParticipant;
    if (local) {
      const audioTrack = local.getTrackPublication(Track.Source.Microphone);
      next.set(local.identity, {
        participantId: local.identity,
        displayName: local.name || local.identity,
        isSpeaking: local.isSpeaking,
        isMuted: audioTrack?.isMuted ?? true,
      });
    }

    lkRoom.remoteParticipants.forEach((participant) => {
      const audioTrack = participant.getTrackPublication(Track.Source.Microphone);
      next.set(participant.identity, {
        participantId: participant.identity,
        displayName: participant.name || participant.identity,
        isSpeaking: participant.isSpeaking,
        isMuted: audioTrack?.isMuted ?? true,
      });
    });

    setParticipants(next);
  }, []);

  useEffect(() => {
    if (!token || !livekitUrl || !enabled) return;

    const newRoom = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = newRoom;
    setConnectionState("connecting");

    const handleConnected = () => {
      setConnectionState("connected");
      updateParticipants(newRoom);
    };
    const handleDisconnected = () => setConnectionState("disconnected");
    const handleUpdate = () => updateParticipants(newRoom);

    newRoom.on(RoomEvent.Connected, handleConnected);
    newRoom.on(RoomEvent.Disconnected, handleDisconnected);
    newRoom.on(RoomEvent.ParticipantConnected, handleUpdate);
    newRoom.on(RoomEvent.ParticipantDisconnected, handleUpdate);
    newRoom.on(RoomEvent.ActiveSpeakersChanged, handleUpdate);
    newRoom.on(RoomEvent.TrackMuted, handleUpdate);
    newRoom.on(RoomEvent.TrackUnmuted, handleUpdate);
    newRoom.on(RoomEvent.TrackSubscribed, handleUpdate);

    newRoom
      .connect(livekitUrl, token)
      .then(async () => {
        setRoom(newRoom);
        try {
          await newRoom.localParticipant.setMicrophoneEnabled(true);
        } catch (micError) {
          console.warn("[VoiceChat] Microphone permission denied, joining muted:", micError);
          setIsMuted(true);
        }
      })
      .catch((error) => {
        console.error("[VoiceChat] Connection failed:", error);
        setConnectionState("disconnected");
      });

    return () => {
      newRoom.off(RoomEvent.Connected, handleConnected);
      newRoom.off(RoomEvent.Disconnected, handleDisconnected);
      newRoom.off(RoomEvent.ParticipantConnected, handleUpdate);
      newRoom.off(RoomEvent.ParticipantDisconnected, handleUpdate);
      newRoom.off(RoomEvent.ActiveSpeakersChanged, handleUpdate);
      newRoom.off(RoomEvent.TrackMuted, handleUpdate);
      newRoom.off(RoomEvent.TrackUnmuted, handleUpdate);
      newRoom.off(RoomEvent.TrackSubscribed, handleUpdate);
      newRoom.disconnect();
      roomRef.current = null;
      setRoom(null);
    };
  }, [token, livekitUrl, enabled, updateParticipants]);

  const toggleMute = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;
    const newMuted = !isMuted;
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
    } catch {
      // mic permission denied - stay muted
    }
  }, [isMuted]);

  return { room, isMuted, toggleMute, participants, connectionState };
}
