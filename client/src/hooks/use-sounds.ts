import { useRef, useCallback, useState } from "react";

const SOUNDS = ["move", "ping", "activate", "deactivate", "gold", "vote", "clear", "abandon", "unlock", "portal", "lightSwitch"] as const;
type SoundName = (typeof SOUNDS)[number];

export const useSounds = () => {
  const audioRef = useRef<Record<SoundName, HTMLAudioElement> | null>(null);
  const volumeRef = useRef(0.25);
  const [sfxVolume, setSfxVolumeState] = useState(0.25);

  if (!audioRef.current) {
    // Algorithm: preload each sound effect once so it can be replayed instantly during gameplay.
    // Each entry maps a gameplay event name to a browser Audio object that is cached in memory.
    audioRef.current = {
      move: new Audio("/sounds/move.mp3"),
      ping: new Audio("/sounds/ping.mp3"),
      activate: new Audio("/sounds/activate.mp3"),
      deactivate: new Audio("/sounds/deactivate.mp3"),
      gold: new Audio("/sounds/gold.mp3"),
      vote: new Audio("/sounds/vote.mp3"),
      clear: new Audio("/sounds/clear.mp3"),
      abandon: new Audio("/sounds/abandon.mp3"),
      unlock: new Audio("/sounds/unlock.mp3"),
      portal: new Audio("/sounds/portal.mp3"),
      lightSwitch: new Audio("/sounds/light-switch.mp3"),
    };
    for (const sound of Object.values(audioRef.current)) {
      sound.preload = "auto";
    }
  }

  const play = useCallback((name: SoundName) => {
    const audio = audioRef.current![name];
    // Algorithm: when an event fires, reset the clip to the beginning and play it immediately.
    // This makes repeated feedback feel responsive instead of overlapping with a previous playback.
    audio.volume = volumeRef.current;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  const setSfxVolume = useCallback((volume: number) => {
    volumeRef.current = volume;
    setSfxVolumeState(volume);
  }, []);

  return { play, sfxVolume, setSfxVolume };
};
