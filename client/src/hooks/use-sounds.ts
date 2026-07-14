import { useCallback, useEffect, useState } from "react";

const SOUND_SOURCES = {
  plateClick: "/sounds/plate-click.mp3",
  lightSwitch: "/sounds/light-switch.mp3",
  collectible: "/sounds/collectables.mp3",
  doorUnlocked: "/sounds/door-unlocked.mp3",
  nextLevel: "/sounds/next-level.mp3",
} as const;

const SOUNDS = Object.keys(SOUND_SOURCES) as Array<keyof typeof SOUND_SOURCES>;
type SoundName = (typeof SOUNDS)[number];

// Audio is shared by every useSounds caller. A small pool lets events such as
// multiple pressure plates activating together overlap without creating a full
// set of Audio elements for every rendered plate and collectible.
const POOL_SIZE = 3;
const audioPools: Partial<Record<SoundName, HTMLAudioElement[]>> = {};
const nextPlayerIndexes: Partial<Record<SoundName, number>> = {};
let masterVolume = 0.25;

const getAudioPool = (name: SoundName) => {
  if (typeof Audio === "undefined") return [];
  if (audioPools[name]) return audioPools[name];

  const pool = Array.from({ length: POOL_SIZE }, () => {
    const audio = new Audio(SOUND_SOURCES[name]);
    audio.preload = "auto";
    audio.volume = masterVolume;
    return audio;
  });
  audioPools[name] = pool;
  return pool;
};

export const useSounds = () => {
  const [sfxVolume, setSfxVolumeState] = useState(masterVolume);

  useEffect(() => {
    SOUNDS.forEach(getAudioPool);
  }, []);

  const play = useCallback((name: SoundName) => {
    const pool = getAudioPool(name);
    if (pool.length === 0) return;

    const index = nextPlayerIndexes[name] ?? 0;
    nextPlayerIndexes[name] = (index + 1) % pool.length;
    const audio = pool[index];
    audio.volume = masterVolume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  const setSfxVolume = useCallback((volume: number) => {
    const nextVolume = Math.max(0, Math.min(1, volume));
    masterVolume = nextVolume;
    Object.values(audioPools).forEach((pool) => {
      pool?.forEach((audio) => {
        audio.volume = nextVolume;
      });
    });
    setSfxVolumeState(nextVolume);
  }, []);

  return { play, sfxVolume, setSfxVolume };
};
