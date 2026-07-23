import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const CELL_SIZE = 1.8;
const KEY_DETECT_RADIUS = 0.22; // how close a player has to be before the plate counts as activated

// key colors match the player color order (sorted by sessionId alphabetically)
const KEY_COLORS = ["#38f8b6", "#ff5a7a", "#facc15"]; // teal, red, yellow

// converts grid coordinates to 3D world position — same formula as MazeBoard
function cellToWorld(gridWidth: number, gridHeight: number, x: number, y: number): [number, number] {
    return [
        (x - (gridWidth - 1) / 2) * CELL_SIZE,
        (y - (gridHeight - 1) / 2) * CELL_SIZE,
    ];
}

function Key({
    worldX,
    worldZ,
    color,
    isCollected, // true when assigned player interacts with it
} :  {
    worldX: number;
    worldZ: number;
    color: string;
    isCollected: boolean;
}) {

    const boxRef = useRef<THREE.Group | null>(null);
    const floatTime = useRef(0);

    // float and spin animation
    useFrame((_, deltaTime) => {
        if (!boxRef.current || isCollected) return;

        floatTime.current += deltaTime;
        boxRef.current.position.y = 0.5 + Math.sin(floatTime.current * 1.5) * 0.08;
        boxRef.current.rotation.y += deltaTime * 1.5;
    });

    return (
        <group ref={boxRef} position={[worldX, 0.5, worldZ]}>
            {/* hides the visual only — the group and light stay mounted below, so collecting
                a key never removes a light from the scene (which would force a shader
                recompile for every other lit material and show up as a stutter) */}
            <mesh visible={!isCollected}>
                <sphereGeometry args={[0.4]} />
                <meshBasicMaterial color={color}/>
            </mesh>

            <pointLight
                position={[0, 0.3, 0]}
                color={color}
                intensity={isCollected ? 0 : 2.0}
                distance={2.5}
            />
        </group>
    );
};

type PlayerPos = { x: number; y: number; slot: number };
type KeyPos = { gridX: number; gridY: number};

export function Keys({
    keys,
    gridWidth,
    gridHeight,
    players,
    localSessionId,
    keysRequired,
    keysCollectedMask,
    onKeyCollected,
    onCollection,
} : {
    keys: KeyPos[]
    gridWidth: number;
    gridHeight: number;
    players: Map<string, PlayerPos>;
    localSessionId: string;
    keysRequired: number;
    keysCollectedMask: number;
    onKeyCollected?: (index: number) => void
    onCollection: () => void;
}) {
    if (keysRequired === 0) return null;

    // authoritative — the server's shared bitmask, so a key collected by one player
    // disappears for everyone, not just the client that picked it up
    const isCollected = (index: number) => (keysCollectedMask & (1 << index)) !== 0;

    useFrame(() => {
        const localPlayer = players.get(localSessionId);
        if (!localPlayer) return;

        keys.forEach((key, index) => {
            // empty slot — never placed this level, or already collected (server sets it to -1,-1)
            if (key.gridX < 0) return;
            if (isCollected(index)) return;

            // only the player whose permanent slot matches this key's index can collect it —
            // never re-derived from a live sort, so one player leaving can't reassign ownership
            if (localPlayer.slot !== index) return;

            const dist = Math.hypot(localPlayer.x - key.gridX, localPlayer.y - key.gridY);
            if (dist < KEY_DETECT_RADIUS) {
                onKeyCollected?.(index);
                onCollection();
            }
        });
    });

    return (
        <>
            {keys.map((key, idx) => {
                if (key.gridX < 0) return null;

                const [worldX, worldZ] = cellToWorld(gridWidth, gridHeight, key.gridX, key.gridY);
                const color = KEY_COLORS[idx] ?? KEY_COLORS[0];

                return (
                    <Key
                        key={idx}
                        worldX={worldX}
                        worldZ={worldZ}
                        color={color}
                        isCollected={isCollected(idx)}
                    />
                )
            })}
        </>
    )
};