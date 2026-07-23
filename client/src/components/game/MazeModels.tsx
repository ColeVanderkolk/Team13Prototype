import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const WALL_MODEL_URL = (import.meta.env.VITE_MAZE_WALL_MODEL_URL || "").trim();
const WALL_MODEL_URLS = [
  (import.meta.env.VITE_MAZE_WALL_MODEL_URL_1 || WALL_MODEL_URL).trim(),
  (import.meta.env.VITE_MAZE_WALL_MODEL_URL_2 || WALL_MODEL_URL).trim(),
  (import.meta.env.VITE_MAZE_WALL_MODEL_URL_3 || WALL_MODEL_URL).trim(),
  (import.meta.env.VITE_MAZE_WALL_MODEL_URL_4 || WALL_MODEL_URL).trim(),
];
export const USE_CUSTOM_WALL_MODELS = WALL_MODEL_URLS.some(Boolean);
const PLAYER_MODEL_URL = (import.meta.env.VITE_MAZE_PLAYER_MODEL_URL || "").trim();
const FLASHLIGHT_MODEL_URL = (import.meta.env.VITE_MAZE_FLASHLIGHT_MODEL_URL || "").trim();
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
  wallVariant = 0,
  color = "#7dd3fc",
  emissive = "#0ea5e9",
}: {
  position: Vec3;
  size: Vec3;
  wallVariant?: number;
  color?: string;
  emissive?: string;
}) {
  const wallModelUrl = WALL_MODEL_URLS[wallVariant] || WALL_MODEL_URL;

  if (wallModelUrl) {
    const alongX = size[0] >= size[2];
    return (
      <GltfModel
        url={wallModelUrl}
        position={position}
        rotation={[0, alongX ? 0 : Math.PI / 2, 0]}
      />
    );
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

export function FlashlightProp() {
  if (FLASHLIGHT_MODEL_URL) {
    return <GltfModel url={FLASHLIGHT_MODEL_URL} />;
  }

  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.065, 0.34, 18]} />
        <meshStandardMaterial color="#1b2130" roughness={0.48} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0, 0.19]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.045, 18]} />
        <meshStandardMaterial
          color="#2a3144"
          emissive="#ffd48a"
          emissiveIntensity={0.18}
          roughness={0.35}
          metalness={0.42}
        />
      </mesh>
      <mesh position={[0, 0, 0.218]}>
        <circleGeometry args={[0.055, 18]} />
        <meshBasicMaterial color="#ffd48a" transparent opacity={0.72} side={THREE.DoubleSide} />
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
