import * as Client from "colyseus.js";
import { useRef, useEffect } from "react";
import * as THREE from "three";

const CONTROL_KEYS = {
  up: ["ArrowUp", "w", "W"],
  down: ["ArrowDown", "s", "S"],
  left: ["ArrowLeft", "a", "A"],
  right: ["ArrowRight", "d", "D"],
};

interface PlayerState {
    x: number;
    y: number;
    sessionId: string;
    name: string;
}

interface Collectible {
    x: number;
    y: number;
    id: string;
    score: number;
}

interface GameScreenProps {
    room: Client.Room | null;
    players: Map<string, PlayerState>;
    totalScore: number; 
    stage: number;
    timeRemaining: number; 
    seed: number;
    isDevMode: boolean;
    countdown?: number;
    onGameAbandoned?: ()=> void;
}

export const GameScreen = ({
    room,
    players, 
    totalScore,
    stage,
    timeRemaining,
    seed,
    isDevMode,
    countdown,
    onGameAbandoned
}: GameScreenProps) => {
    const pendingInputsRef = useRef<Map<number, { x: number, y: number }>>(new Map());
    const seqCounterRef = useRef(0);
    const lastRepeatTimeRef = useRef(0);
    const prevStageRef = useRef(stage);
    const onGameAbandonedRef = useRef(onGameAbandoned);
    onGameAbandonedRef.current = onGameAbandoned;
    
    // Keyboard controls
    useEffect(() => {
        const REPEAT_INTERVAL = 1000 / 5; // 5 times per second

        const handleKeyDown = (e: KeyboardEvent) => {
        if (e.repeat) {
            const now = performance.now();
            if (now - lastRepeatTimeRef.current < REPEAT_INTERVAL) return;
            lastRepeatTimeRef.current = now;
        }

        let direction: "up" | "down" | "left" | "right" | null = null;
        if (CONTROL_KEYS.up.includes(e.key)) direction = "up";
        else if (CONTROL_KEYS.down.includes(e.key)) direction = "down";
        else if (CONTROL_KEYS.left.includes(e.key)) direction = "left";
        else if (CONTROL_KEYS.right.includes(e.key)) direction = "right";

        if (direction) {
            e.preventDefault();

            const playerArray = Array.from(players.values());
        }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [room, players, isDevMode, countdown]);
};