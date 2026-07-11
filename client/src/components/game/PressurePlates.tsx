import { useRef } from 'react';
import { useFrame } from '@react-three/fiber'; // runs code every frame inside the 3D canvas, like a game loop
import * as THREE from 'three'; // the 3D library, needed for material stuff and DoubleSide

const CELL_SIZE = 1.8;
const PLATE_DETECT_RADIUS = 0.22; // how close a player has to be before the plate counts as activated

// plate colors match the player color order (sorted by sessionId alphabetically)
const PLATE_COLORS = ["#38f8b6", "#ff5a7a", "#facc15"]; // teal, red, yellow

// converts grid coordinates to 3D world position — same formula as MazeBoard
function cellToWorld(gridWidth: number, gridHeight: number, x: number, y: number): [number, number] {
    return [
        (x - (gridWidth - 1) / 2) * CELL_SIZE,
        (y - (gridHeight - 1) / 2) * CELL_SIZE,
    ];
}

// a single plate — broken out into its own component because useFrame has to live inside a component
// and each plate needs to animate on its own
function Plate({
    worldX,
    worldZ,
    color,
    isActive, // true when the assigned player is standing on this plate
}: {
    worldX: number;
    worldZ: number;
    color: string;
    isActive: boolean;
}) {
    // refs let us poke the material directly every frame instead of going through React
    const discRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const ringRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const timeRef = useRef(0);

    // breathing glow when active, dim when waiting
    useFrame((_, delta) => {
        timeRef.current += delta;
        if (discRef.current) {
            discRef.current.opacity = isActive
                ? 0.7 + Math.sin(timeRef.current * 3) * 0.15
                : 0.2;
        }
        if (ringRef.current) {
            ringRef.current.opacity = isActive
                ? 0.85 + Math.sin(timeRef.current * 3) * 0.1
                : 0.5;
        }
    });

    return (
        <group>
            {/* filled colored disc on the floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[worldX, 0.05, worldZ]}>
                <circleGeometry args={[0.36, 28]} />
                <meshBasicMaterial ref={discRef} color={color} transparent opacity={isActive ? 0.85 : 0.2} side={THREE.DoubleSide} />
            </mesh>

            {/* ring border around the disc */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[worldX, 0.04, worldZ]}>
                <ringGeometry args={[0.36, 0.46, 28]} />
                <meshBasicMaterial ref={ringRef} color={color} transparent opacity={isActive ? 0.95 : 0.5} side={THREE.DoubleSide} />
            </mesh>

            {/* colored glow that only turns on when someone is standing on it */}
            {isActive && <pointLight position={[worldX, 0.8, worldZ]} color={color} intensity={2.0} distance={2.5} />}
        </group>
    );
}

type PlayerPos = { x: number; y: number };

type PlatePos = { gridX: number; gridY: number };

type PressurePlatesProps = {
    plates: PlatePos[];       // actual grid positions of each plate, sent from the server
    gridWidth: number;
    gridHeight: number;
    players: Map<string, PlayerPos>;
    pressurePlatesRequired: number;
    obstacleType: string;
    keysCollectedMask: number;
};

// renders pressure plates at their actual maze positions
// plates are placed randomly in the maze by the server each level
export function PressurePlates({
    plates,
    gridWidth,
    gridHeight,
    players,
    pressurePlatesRequired,
    obstacleType,
    keysCollectedMask
}: PressurePlatesProps) {
    if (pressurePlatesRequired === 0 || plates.length === 0) return null;

    // same sort order as the server — player 0 = teal plate, player 1 = red, player 2 = yellow
    const orderedPlayers = Array.from(players.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([_, p]) => p);

    return (
        <>
            {plates.map((plate, idx) => {
                const [worldX, worldZ] = cellToWorld(gridWidth, gridHeight, plate.gridX, plate.gridY);
                const color = PLATE_COLORS[idx] ?? PLATE_COLORS[0];

                // only the player at this index can light up this plate
                const assignedPlayer = orderedPlayers[idx];
                const isOnPlate = assignedPlayer
                    ? Math.hypot(assignedPlayer.x - plate.gridX, assignedPlayer.y - plate.gridY) < PLATE_DETECT_RADIUS
                    : false;

                const hasKey = obstacleType === "keys"
                    ? (keysCollectedMask & (1 << idx)) !== 0 
                    : true; 
                
                const isActive = isOnPlate && hasKey; 

                return (
                    <Plate 
                        key={idx}
                        worldX={worldX} 
                        worldZ={worldZ} 
                        color={color} 
                        isActive={isActive} 
                    />
                );
            })}
        </>
    );
}
