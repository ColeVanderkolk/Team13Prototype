import { useRef } from 'react';
import { useFrame } from '@react-three/fiber'; // runs code every frame inside the 3D canvas, like a game loop
import * as THREE from 'three'; // the 3D library, needed for material stuff and DoubleSide

// one object per plate — keeps the color, where it shows up on screen, and where the server checks for players all together
// world = what you see in the game, grid = what the server uses to track player positions
// the world offset is just the grid offset times 1.8 (the cell size), so they always match
const PLATES = [
    { color: "#38f8b6", worldDx: -0.45, worldDz: 0, gridDx: -0.25, gridDy: 0 }, // teal, player 1
    { color: "#ff5a7a", worldDx:  0,    worldDz: 0, gridDx:  0,    gridDy: 0 }, // red, player 2 — sits right on the exit
    { color: "#facc15", worldDx:  0.45, worldDz: 0, gridDx:  0.25, gridDy: 0 }, // yellow, player 3
];

// how close a player has to be before the plate counts as activated
const PLATE_DETECT_RADIUS = 0.22;

// a single plate — broken out into its own component because useFrame has to live inside a component
// and each plate needs to animate on its own
function Plate({
    worldX,
    worldZ,
    color,
    isActive, // true when someone is standing on this plate
}: {
    worldX: number;
    worldZ: number;
    color: string;
    isActive: boolean;
}) {
    // refs let us poke the material directly every frame instead of going through React
    // doing it this way is way faster for animations
    const discRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const ringRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const timeRef = useRef(0); // tracks how long this plate has been alive, used for the pulse math

    // this runs every frame — drives the breathing glow on active plates
    useFrame((_, delta) => {
        timeRef.current += delta; // delta is seconds since last frame so the speed stays consistent

        if (discRef.current) {
            discRef.current.opacity = isActive
                ? 0.7 + Math.sin(timeRef.current * 3) * 0.15 // slowly pulses when active
                : 0.2; // barely visible when nobody is on it
        }
        if (ringRef.current) {
            ringRef.current.opacity = isActive
                ? 0.85 + Math.sin(timeRef.current * 3) * 0.1 // ring pulses too, slightly less
                : 0.5; // ring stays a bit more visible than the disc so players can see it as a hint
        }
    });

    return (
        <group>
            {/* the filled colored circle on the floor */}
            {/* the rotation flips it flat — by default Three.js meshes stand upright */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[worldX, 0.05, worldZ]}>
                <circleGeometry args={[0.36, 28]} />
                <meshBasicMaterial
                    ref={discRef}
                    color={color}
                    transparent
                    opacity={isActive ? 0.85 : 0.2}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* ring border around the disc, drawn just below it so it shows as an outline */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[worldX, 0.04, worldZ]}>
                <ringGeometry args={[0.36, 0.46, 28]} />
                <meshBasicMaterial
                    ref={ringRef}
                    color={color}
                    transparent
                    opacity={isActive ? 0.95 : 0.5}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* colored glow light that only turns on when someone is standing on the plate */}
            {isActive && (
                <pointLight
                    position={[worldX, 0.8, worldZ]}
                    color={color}
                    intensity={2.0}
                    distance={2.5}
                />
            )}
        </group>
    );
}

type PlayerPos = { x: number; y: number };

type PressurePlatesProps = {
    exitX: number;
    exitY: number;
    exitWorldX: number; // MazeBoard already converts exit grid coords to world coords, so we just take them
    exitWorldZ: number;
    players: Map<string, PlayerPos>;
    pressurePlatesRequired: number; // 0 in solo, 3 in multiplayer
};

// renders all 3 pressure plates near the exit
// MazeBoard calls this and passes in the exit position and player list
export function PressurePlates({
    exitX,
    exitY,
    exitWorldX,
    exitWorldZ,
    players,
    pressurePlatesRequired,
}: PressurePlatesProps) {
    // sort players the same way the server does — alphabetical by sessionId
    // so player 0 = teal, player 1 = red, player 2 = yellow
    const orderedPlayers = Array.from(players.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([_, p]) => p);

    // solo mode — just the center plate, one player steps on it
    if (pressurePlatesRequired === 1) {
        const plate = PLATES[1];
        const plateGridX = exitX + plate.gridDx;
        const plateGridY = exitY + plate.gridDy;
        const soloPlayer = orderedPlayers[0];
        const isActive = soloPlayer
            ? Math.hypot(soloPlayer.x - plateGridX, soloPlayer.y - plateGridY) < PLATE_DETECT_RADIUS
            : false;
        return (
            <Plate
                worldX={exitWorldX + plate.worldDx}
                worldZ={exitWorldZ + plate.worldDz}
                color={PLATES[0].color}
                isActive={isActive}
            />
        );
    }

    return (
        <>
            {PLATES.map((plate, idx) => {
                const plateGridX = exitX + plate.gridDx;
                const plateGridY = exitY + plate.gridDy;

                const assignedPlayer = orderedPlayers[idx];
                const isActive = assignedPlayer
                    ? Math.hypot(assignedPlayer.x - plateGridX, assignedPlayer.y - plateGridY) < PLATE_DETECT_RADIUS
                    : false;

                return (
                    <Plate
                        key={idx}
                        worldX={exitWorldX + plate.worldDx}
                        worldZ={exitWorldZ + plate.worldDz}
                        color={plate.color}
                        isActive={isActive}
                    />
                );
            })}
        </>
    );
}
