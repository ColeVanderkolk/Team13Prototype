import { useRef, useCallback, useState } from "react";

const SOUNDS = ["plateClick", "lightSwitch", "collectible", "doorUnlocked", "nextLevel"] as const;
type SoundName = (typeof SOUNDS)[number];

export const useSounds = () => {
  const audioRef = useRef<Record<SoundName, HTMLAudioElement> | null>(null);
  const volumeRef = useRef(0.25);
  const [sfxVolume, setSfxVolumeState] = useState(0.25);

if (!audioRef.current) {
  audioRef.current = {
  plateClick: new Audio("/sounds/plate-click.mp3"),
  lightSwitch: new Audio("/sounds/light-switch.mp3"),
  collectible: new Audio("/sounds/collectables.mp3"),
  doorUnlocked: new Audio("/sounds/door-unlocked.mp3"),
  nextLevel: new Audio("/sounds/next-level.mp3"),
     };
    for (const sound of Object.values(audioRef.current)) {
      sound.preload = "auto";
    }
  };


  const play = useCallback((name: SoundName) => {
    const audio = audioRef.current![name];
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