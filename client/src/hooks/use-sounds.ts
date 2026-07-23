import { useRef, useCallback, useState } from "react";

const SOUNDS = ["collect", "unlock", "lightSwitch", "progress", "plate"] as const; 
type SoundName = (typeof SOUNDS)[number];

export const useSounds = () => {
    const audioRef = useRef<Record<SoundName, HTMLAudioElement> | null>(null);
    const volumeRef = useRef(0.25);
    const [sfxVolume, setSfxVolumeState] = useState(0.25); 

    if (!audioRef.current) {
        audioRef.current = {
            collect: new Audio("/sounds/collectables.mp3"),
            unlock: new Audio("/sounds/door-unlocked.mp3"),
            lightSwitch: new Audio("/sounds/light-switch.mp3"),
            progress: new Audio("/sounds/next-level.mp3"),
            plate: new Audio("/sounds/plate-click.mp3"),
        };

        for (const sound of Object.values(audioRef.current)) {
            sound.preload = "auto";
        }
    }

    const play = useCallback((name: SoundName) => {
        // deferred to the next tick so this never runs inside the caller's current frame —
        // several callers trigger this from inside a useFrame loop, and mutating an <audio>
        // element (currentTime, play()) can do real synchronous work that would otherwise
        // stall that frame and show up as a stutter right at the moment of the sound
        setTimeout(() => {
            const audio = audioRef.current![name];
            audio.volume = volumeRef.current;
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }, 0);
    }, []);

    const setSfxVolume = useCallback((volume: number) => {
        volumeRef.current = volume;
        setSfxVolumeState(volume);
    }, []);

    return { play, sfxVolume, setSfxVolume };
};