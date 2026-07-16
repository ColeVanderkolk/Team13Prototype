import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const WALL_MODEL_URL = (import.meta.env.VITE_MAZE_WALL_MODEL_URL || "").trim();
// Lets MazeBoard fall back to per-wall rendering when a custom Blender wall model is set
export const HAS_WALL_MODEL = Boolean(WALL_MODEL_URL);
const PLAYER_MODEL_URL = (import.meta.env.VITE_MAZE_PLAYER_MODEL_URL || "").trim();
const EXIT_BARRIER_MODEL_URL = (import.meta.env.VITE_EXIT_BARRIER_MODEL_URL || "").trim();

// visual size only — the server's collision radius (PLAYER_RADIUS) is unaffected, so this
// can't clip anyone through a wall, it just shrinks how big the character looks
const PLAYER_AVATAR_SCALE = 0.7;

type Vec3 = [number, number, number];

export function GltfModel({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
}: {
  url: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useEffect(() => {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }, [scene]);

  return <primitive object={scene} position={position} rotation={rotation} scale={scale} />;
}

export function MazeWallPiece({
  position,
  size,
  color = "#7dd3fc",
  emissive = "#0ea5e9",
}: {
  position: Vec3;
  size: Vec3;
  color?: string;
  emissive?: string;
}) {
  if (WALL_MODEL_URL) {
    return <GltfModel url={WALL_MODEL_URL} position={position} scale={size} />;
  }

  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={0.16}
        roughness={0.42}
        metalness={0.22}
      />
    </mesh>
  );
}

export function MazePlayerAvatar({
  color,
  isMe,
}: {
  color: string;
  isMe: boolean;
}) {
  if (PLAYER_MODEL_URL) {
    return <GltfModel url={PLAYER_MODEL_URL} position={[0, 0, 0]} scale={[0.72, 0.72, 0.72]} />;
  }

  return (
    <group scale={[PLAYER_AVATAR_SCALE, PLAYER_AVATAR_SCALE, PLAYER_AVATAR_SCALE]}>
      <mesh position={[0, 0.58, 0]} castShadow>
        <capsuleGeometry args={[0.31, 0.58, 8, 18]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isMe ? 0.36 : 0.18}
          metalness={0.12}
          roughness={0.42}
        />
      </mesh>
      <mesh position={[-0.16, 0.16, 0.03]} castShadow>
        <boxGeometry args={[0.18, 0.32, 0.22]} />
        <meshStandardMaterial color="#192233" roughness={0.68} metalness={0.08} />
      </mesh>
      <mesh position={[0.16, 0.16, 0.03]} castShadow>
        <boxGeometry args={[0.18, 0.32, 0.22]} />
        <meshStandardMaterial color="#192233" roughness={0.68} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.74, 0.3]} castShadow>
        <boxGeometry args={[0.36, 0.18, 0.07]} />
        <meshStandardMaterial color="#dff9ff" emissive="#7dd3fc" emissiveIntensity={0.18} roughness={0.25} />
      </mesh>
    </group>
  );
}

// the barrier that blocks the exit cell until the level's obstacle is solved — not the exit itself
export function ExitBarrier({
  exitWorldX,
  exitWorldZ,
  wallHeight,
  cellSize,
}: {
  exitWorldX: number;
  exitWorldZ: number;
  wallHeight: number;
  cellSize: number;
}) {
  const position: Vec3 = [exitWorldX, wallHeight / 2, exitWorldZ];
  const size: Vec3 = [cellSize * 0.82, wallHeight, cellSize * 0.82];

  return (
    <>
      {EXIT_BARRIER_MODEL_URL ? (
        <GltfModel url={EXIT_BARRIER_MODEL_URL} position={position} scale={size} />
      ) : (
        <mesh position={position}>
          <boxGeometry args={size} />
          <meshStandardMaterial color="#7c3aed" emissive="#4c1d95" emissiveIntensity={0.7} roughness={0.25} metalness={0.1} />
        </mesh>
      )}
      <pointLight position={[exitWorldX, 1.5, exitWorldZ]} color="#7c3aed" intensity={1.8} distance={5} />
    </>
  );
}