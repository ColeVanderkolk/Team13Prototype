import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GltfModel } from './MazeModels';

// only the base pad is swappable — same convention as PressurePlates.tsx
const PLATE_MODEL_URL = (import.meta.env.VITE_PRESSURE_PLATE_MODEL_URL || "").trim();

const CELL_SIZE = 1.8;

// same palette as PressurePlates/Keys, but here it just identifies which of the 3 plates
// this is — unlike PressurePlates, these aren't tied to any specific player's slot, since
// completing one requires every player standing on it together, not one assigned person
const PLATE_COLORS = ["#38f8b6", "#ff5a7a", "#facc15"];

function cellToWorld(gridWidth: number, gridHeight: number, x: number, y: number): [number, number] {
    return [
        (x - (gridWidth - 1) / 2) * CELL_SIZE,
        (y - (gridHeight - 1) / 2) * CELL_SIZE,
    ];
}

function ConvergePlate({
    worldX,
    worldZ,
    color,
    isLocked, // server-confirmed — permanent once true, never flips back off
}: {
    worldX: number;
    worldZ: number;
    color: string;
    isLocked: boolean;
}) {
    const discRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const ringRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const timeRef = useRef(0);

    // gentle breathing glow once locked in, dim and static before that — no need to react to
    // players standing on/off it moment to moment the way PressurePlates does, since the
    // server-authoritative locked state is the only thing that ever matters visually here
    useFrame((_, delta) => {
        timeRef.current += delta;

        if (discRef.current) {
            discRef.current.opacity = isLocked
                ? 0.75 + Math.sin(timeRef.current * 2.2) * 0.15
                : 0.2;
        }
        if (ringRef.current) {
            ringRef.current.opacity = isLocked ? 0.95 : 0.5;
        }
    });

    return (
        <group>
            {PLATE_MODEL_URL ? (
                <GltfModel url={PLATE_MODEL_URL} position={[worldX, 0.05, worldZ]} scale={[0.72, 0.72, 0.72]} />
            ) : (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[worldX, 0.05, worldZ]}>
                    <circleGeometry args={[0.36, 28]} />
                    <meshBasicMaterial ref={discRef} color={color} transparent opacity={isLocked ? 0.85 : 0.2} side={THREE.DoubleSide} />
                </mesh>
            )}

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[worldX, 0.04, worldZ]}>
                <ringGeometry args={[0.36, 0.46, 28]} />
                <meshBasicMaterial ref={ringRef} color={color} transparent opacity={isLocked ? 0.95 : 0.5} side={THREE.DoubleSide} />
            </mesh>

            {/* always mounted, intensity toggled instead of adding/removing — removing a light
                forces a shader recompile for every other lit material in view */}
            <pointLight position={[worldX, 0.8, worldZ]} color={color} intensity={isLocked ? 2.0 : 0} distance={2.5} />
        </group>
    );
}

type PlatePos = { gridX: number; gridY: number };

type ConvergePlatesProps = {
    plates: PlatePos[];
    gridWidth: number;
    gridHeight: number;
    completedMask: number; // bit i set = plate i is locked in permanently
};

// Three plates, each completed once every current player is standing on it together (any
// order) — the server is the sole authority on "locked in" (completedMask), so this component
// never guesses proximity on its own the way PressurePlates does; it just reflects state.
export function ConvergePlates({ plates, gridWidth, gridHeight, completedMask }: ConvergePlatesProps) {
    if (plates.length === 0) return null;

    return (
        <>
            {plates.map((plate, idx) => {
                if (plate.gridX < 0) return null;
                const [worldX, worldZ] = cellToWorld(gridWidth, gridHeight, plate.gridX, plate.gridY);
                const color = PLATE_COLORS[idx] ?? PLATE_COLORS[0];
                const isLocked = (completedMask & (1 << idx)) !== 0;

                return <ConvergePlate key={idx} worldX={worldX} worldZ={worldZ} color={color} isLocked={isLocked} />;
            })}
        </>
    );
}
