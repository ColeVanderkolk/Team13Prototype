import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GltfModel } from "./MazeModels";

// only the body is swappable, same convention as Levers.tsx
const LEVER_BODY_MODEL_URL = (import.meta.env.VITE_LEVER_BODY_MODEL_URL || "").trim();

const CELL_SIZE = 1.8;
const WALL_NORTH = 1;
const WALL_EAST = 2;
const WALL_SOUTH = 4;
const WALL_WEST = 8;
const WALL_INSET = 0.8; // matches Levers.tsx — flush against the wall's inner face

// must match PLAYER_COLORS[0..2] in MazeBoard.tsx — each lever is colored to match the one
// player slot allowed to pull it (lever index i's owner is columnOwner[i % 3], randomized
// per level - see LinkedLeversProps)
const SLOT_COLORS = ["#38f8b6", "#ff5a7a", "#facc15"];

const HANDLE_UP_Y = 0.77; // off
const HANDLE_DOWN_Y = 0.43; // on, or mid-attempt
const HANDLE_LERP_SPEED = 10; // higher = snappier
const PULSE_DURATION_MS = 260;

function cellToWorld(gridWidth: number, gridHeight: number, x: number, y: number): [number, number] {
  return [
    (x - (gridWidth - 1) / 2) * CELL_SIZE,
    (y - (gridHeight - 1) / 2) * CELL_SIZE,
  ];
}

function directionInfo(wallDir: number) {
  if (wallDir === WALL_NORTH) return { offsetX: 0, offsetZ: -WALL_INSET, rotationY: 0 };
  if (wallDir === WALL_SOUTH) return { offsetX: 0, offsetZ: WALL_INSET, rotationY: Math.PI };
  if (wallDir === WALL_EAST) return { offsetX: WALL_INSET, offsetZ: 0, rotationY: -Math.PI / 2 };
  return { offsetX: -WALL_INSET, offsetZ: 0, rotationY: Math.PI / 2 }; // WALL_WEST
}

function SingleLinkedLever({
  worldX,
  worldZ,
  rotationY,
  color,
  isLit,
  index,
  pullAttemptIndex,
  pullAttemptKey,
}: {
  worldX: number;
  worldZ: number;
  rotationY: number;
  color: string; // identifies which player slot owns this lever
  isLit: boolean; // server-confirmed on/off state — toggles as the team pulls levers
  index: number; // this lever's own index (0-5)
  pullAttemptIndex: number; // which lever (0-5) was just pulled by anyone, -1 = none yet
  pullAttemptKey: number; // shared counter, increments on every pull attempt anywhere
}) {
  // plain circle marker — no shape-encoded order here, ownership is conveyed by color alone
  const shapeGeometry = useMemo(() => new THREE.CircleGeometry(0.16, 28), []);

  // Decoy motion: a wrong-owner pull is silently rejected server-side (no light change), which
  // read as "the lever is unresponsive/broken" with nothing else going on. This makes the handle
  // physically dip and return on EVERY attempt, right or wrong — only the light (isLit) reflects
  // whether it actually counted. A correct pull's real, lasting position change rides along on
  // the same motion, so nothing needs to special-case "was this the right lever". Keyed on the
  // shared pullAttemptKey (not a per-lever value) so switching the attempted lever away from this
  // one never looks like a fresh attempt on THIS lever.
  const [isPulsing, setIsPulsing] = useState(false);
  useEffect(() => {
    if (index !== pullAttemptIndex) return;
    setIsPulsing(true);
    const timeout = setTimeout(() => setIsPulsing(false), PULSE_DURATION_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the shared key should retrigger this
  }, [pullAttemptKey]);

  const handleRef = useRef<THREE.Mesh>(null);
  const handleYRef = useRef(isLit ? HANDLE_DOWN_Y : HANDLE_UP_Y);
  useFrame((_, delta) => {
    if (!handleRef.current) return;
    const target = isPulsing || isLit ? HANDLE_DOWN_Y : HANDLE_UP_Y;
    handleYRef.current += (target - handleYRef.current) * Math.min(1, HANDLE_LERP_SPEED * delta);
    handleRef.current.position.y = handleYRef.current;
  });

  return (
    <group position={[worldX, 0, worldZ]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.05, 0.02]} geometry={shapeGeometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isLit ? 0.85 : 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* always mounted, intensity toggled instead of adding/removing (see Levers.tsx for why) */}
      <pointLight position={[0, 1.05, 0.15]} color={color} intensity={isLit ? 1.2 : 0} distance={2} />

      {LEVER_BODY_MODEL_URL ? (
        <GltfModel url={LEVER_BODY_MODEL_URL} position={[0, 0.6, 0.045]} scale={[0.18, 0.5, 0.09]} />
      ) : (
        <mesh position={[0, 0.6, 0.045]} castShadow receiveShadow>
          <boxGeometry args={[0.18, 0.5, 0.09]} />
          <meshStandardMaterial color="#262b36" roughness={0.55} metalness={0.2} />
        </mesh>
      )}

      {/* handle: sits high (off) sticking out past the body's sides, drops flush once lit —
          position is driven every frame above, not declaratively, so a wrong-owner pull can
          animate down and back up without ever actually becoming "lit" */}
      <mesh ref={handleRef} position={[0, HANDLE_UP_Y, 0.1]} castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.14, 0.13]} />
        <meshStandardMaterial
          color={isLit ? color : "#5b6579"}
          emissive={isLit ? color : "#000000"}
          emissiveIntensity={isLit ? 0.5 : 0}
          roughness={0.45}
          metalness={0.25}
        />
      </mesh>
    </group>
  );
}

type LinkedLeverPlacement = {
  cellX: number;
  cellY: number;
  wallDir: number;
};

type LinkedLeversProps = {
  levers: LinkedLeverPlacement[]; // index i (0-5), grid column i%3 owned by columnOwner[i%3]
  columnOwner: number[]; // columnOwner[c] = which player slot (0-2) owns grid column c
  gridWidth: number;
  gridHeight: number;
  litMask: number; // bit i set = lever i currently lit
  pullAttemptIndex: number; // which lever (0-5) was just pulled by anyone, -1 = none yet
  pullAttemptKey: number; // increments on every pull attempt, right or wrong
};

// Six levers, two per player slot (color-coded by columnOwner, randomized each level so who
// ends up needing to pull both of their levers isn't a fixed pattern) - a Lights Out puzzle
// with a hidden wiring between them (see LINKED_LEVER_TOGGLE_SETS in GameRoom.ts). Nothing
// shows the wiring directly; the team has to find it by pulling their own two and comparing
// notes on what changed elsewhere.
export function LinkedLevers({
  levers,
  columnOwner,
  gridWidth,
  gridHeight,
  litMask,
  pullAttemptIndex,
  pullAttemptKey,
}: LinkedLeversProps) {
  if (levers.length === 0) return null;

  return (
    <>
      {levers.map((lever, index) => {
        if (lever.cellX < 0) return null;
        const [cellWorldX, cellWorldZ] = cellToWorld(gridWidth, gridHeight, lever.cellX, lever.cellY);
        const { offsetX, offsetZ, rotationY } = directionInfo(lever.wallDir);
        const ownerSlot = columnOwner[index % 3] ?? index % 3;
        const color = SLOT_COLORS[ownerSlot] ?? SLOT_COLORS[0];
        const isLit = (litMask & (1 << index)) !== 0;

        return (
          <SingleLinkedLever
            key={index}
            worldX={cellWorldX + offsetX}
            worldZ={cellWorldZ + offsetZ}
            rotationY={rotationY}
            color={color}
            isLit={isLit}
            index={index}
            pullAttemptIndex={pullAttemptIndex}
            pullAttemptKey={pullAttemptKey}
          />
        );
      })}
    </>
  );
}
