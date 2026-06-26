import { useEffect, useRef } from "react";
import { RemoteParticipant, Track, TrackPublication } from "livekit-client";

interface AudioRendererProps {
  participant: RemoteParticipant;
}

export const AudioRenderer = ({ participant }: AudioRendererProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audioTrack = participant.getTrackPublication(Track.Source.Microphone);

    const attachTrack = (publication: TrackPublication | undefined) => {
      if (publication?.track && audioRef.current) {
        publication.track.attach(audioRef.current);
      }
    };

    const detachTrack = (publication: TrackPublication | undefined) => {
      if (publication?.track) {
        publication.track.detach();
      }
    };

    attachTrack(audioTrack);

    const handleTrackSubscribed = () => {
      const track = participant.getTrackPublication(Track.Source.Microphone);
      attachTrack(track);
    };

    const handleTrackUnsubscribed = () => {
      const track = participant.getTrackPublication(Track.Source.Microphone);
      detachTrack(track);
    };

    participant.on("trackSubscribed", handleTrackSubscribed);
    participant.on("trackUnsubscribed", handleTrackUnsubscribed);

    return () => {
      detachTrack(audioTrack);
      participant.off("trackSubscribed", handleTrackSubscribed);
      participant.off("trackUnsubscribed", handleTrackUnsubscribed);
    };
  }, [participant]);

  return <audio ref={audioRef} autoPlay playsInline />;
};
