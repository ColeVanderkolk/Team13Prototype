import { useRef, useState } from 'react';
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

    if (isCollected) return null;

    return (
        <group ref={boxRef} position={[worldX, 0.5, worldZ]}>
            <mesh>
                <sphereGeometry args={[0.4]} /> 
                <meshBasicMaterial color={color}/>
            </mesh>

            <pointLight 
                position={[0, 0.3, 0]} 
                color={color} 
                intensity={2.0} 
                distance={2.5}
            />
        </group>
    );
};

type PlayerPos = { x: number; y: number};
type KeyPos = { gridX: number; gridY: number};

export function Keys({
    keys,
    gridWidth,
    gridHeight,
    players,
    localSessionId,
    keysRequired,
    onKeyCollected,
} : {
    keys: KeyPos[]
    gridWidth: number;
    gridHeight: number;
    players: Map<string, PlayerPos>;
    localSessionId: string;
    keysRequired: number;
    onKeyCollected?: (index: number) => void
}) { 
    if (keysRequired === 0) return null; 

    const orderedPlayers = Array.from(players.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sessionId, p]) => ({pos: p, sessionId}));

    const [collectedKeys, setCollectedKeys] = useState<Set<number>>(new Set());

    useFrame(() => {
        const localPlayer = players.get(localSessionId);
        if (!localPlayer) return;

        keys.forEach((key, index) => {
            if (collectedKeys.has(index)) return;

            // only the assigned player can collect their key
            const assignedPlayer = orderedPlayers[index];
            if (assignedPlayer?.sessionId !== localSessionId) return;

            const dist = Math.hypot(localPlayer.x - key.gridX, localPlayer.y - key.gridY);
            if (dist < KEY_DETECT_RADIUS) {
                setCollectedKeys(prev => new Set(prev).add(index));
                onKeyCollected?.(index);
            }
        });
    });

    return (
        <>
            {keys.map((key, idx) => {
                const [worldX, worldZ] = cellToWorld(gridWidth, gridHeight, key.gridX, key.gridY);
                const color = KEY_COLORS[idx] ?? KEY_COLORS[0];

                return (
                    <Key
                        key={idx}
                        worldX={worldX}
                        worldZ={worldZ}
                        color={color}
                        isCollected={collectedKeys.has(idx)}
                    />
                )
            })}
        </>
    )
};