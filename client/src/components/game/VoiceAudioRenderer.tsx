import { useEffect, useRef } from "react";
import { RemoteParticipant, Track, TrackPublication } from "livekit-client";

interface VoiceAudioRendererProps {
  participant: RemoteParticipant;
}

// One of these per remote participant - LiveKit only gives you an audio MediaStreamTrack,
// so it has to be attached to a real <audio> element to actually be heard. Hidden/off-screen;
// this component exists purely for its side effect.
export function VoiceAudioRenderer({ participant }: VoiceAudioRendererProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const attach = (publication: TrackPublication | undefined) => {
      if (publication?.track && audioRef.current) {
        publication.track.attach(audioRef.current);
      }
    };
    const detach = (publication: TrackPublication | undefined) => {
      publication?.track?.detach();
    };

    const initial = participant.getTrackPublication(Track.Source.Microphone);
    attach(initial);

    const handleSubscribed = () => attach(participant.getTrackPublication(Track.Source.Microphone));
    const handleUnsubscribed = () => detach(participant.getTrackPublication(Track.Source.Microphone));

    participant.on("trackSubscribed", handleSubscribed);
    participant.on("trackUnsubscribed", handleUnsubscribed);

    return () => {
      detach(initial);
      participant.off("trackSubscribed", handleSubscribed);
      participant.off("trackUnsubscribed", handleUnsubscribed);
    };
  }, [participant]);

  return <audio ref={audioRef} autoPlay playsInline />;
}
