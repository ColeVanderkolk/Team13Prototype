import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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
// Lets MazeBoard fall back to per-wall rendering when a custom Blender wall model is set
export const HAS_WALL_MODEL = USE_CUSTOM_WALL_MODELS;
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

// the barrier that blocks the exit cell until the level's obstacle is solved — not the exit
// itself. Stark white and deliberately outside the quadrant wall palette (blue/pink/amber/
// violet - see QUADRANT_WALL_COLORS in MazeBoard.tsx), so it can never blend into whichever
// quadrant the exit happens to land in the way its old matching-violet color once could.
// Pulses instead of sitting at a flat brightness, so it reads as something alive/ominous up
// close in first person, not just a differently-colored wall - the previous version only
// stood out from a distance, via its point light's glow against the dark floor.
//
// The exit cell is a dead end - three of its four sides already have real, solid maze walls,
// so there is exactly one direction a player can ever approach from or stand in. That means
// only the face across that one direction needs to be gapless (full width, flush with the
// corridor's own walls); the depth along the approach axis can be smaller than the cell
// without ever exposing a peekable gap, since there is no angle to see behind or beside it
// from anywhere a player can actually stand.
export function ExitBarrier({
  exitWorldX,
  exitWorldZ,
  wallHeight,
  cellSize,
  wallThickness,
  orientationY,
}: {
  exitWorldX: number;
  exitWorldZ: number;
  wallHeight: number;
  cellSize: number;
  wallThickness: number;
  orientationY: number;
}) {
  const localPosition: Vec3 = [0, wallHeight / 2, 0];
  // Width matches the actual clear gap between the corridor's two side walls, not the raw
  // cell size - the walls themselves eat into that gap by their own thickness on each side,
  // so using the full cell size here was overshooting past their inner faces and poking out
  // the other side, visible from outside the corridor. Shorter depth along the approach axis
  // for a distinct, standalone "block" look rather than a flat wall panel.
  const size: Vec3 = [cellSize - wallThickness, wallHeight, cellSize * 0.6];

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 0.8,
        roughness: 0.25,
        metalness: 0.1,
        // A standard material only renders its outward-facing side, so if the player's
        // camera ever clips even slightly inside the box's boundary (right up against it),
        // the inside would normally be invisible, revealing the empty cell behind it.
        // Rendering both sides means there's no angle where anything but solid white shows.
        side: THREE.DoubleSide,
        // The two side faces sit exactly flush with the corridor's real walls (see size
        // above), which on its own causes z-fighting - two surfaces competing for the same
        // pixels. polygonOffset nudges this surface's depth priority without moving its
        // actual position, resolving that without reopening a side gap.
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const pulse = 0.65 + Math.sin(state.clock.elapsedTime * 1.6) * 0.35;
    material.emissiveIntensity = pulse;
    if (lightRef.current) lightRef.current.intensity = 1.4 + pulse * 0.8;
  });

  return (
    <group position={[exitWorldX, 0, exitWorldZ]} rotation={[0, orientationY, 0]}>
      {EXIT_BARRIER_MODEL_URL ? (
        <GltfModel url={EXIT_BARRIER_MODEL_URL} position={localPosition} scale={size} />
      ) : (
        <mesh position={localPosition} material={material}>
          <boxGeometry args={size} />
        </mesh>
      )}
      {/* shorter reach than before (was 5) - the glow was visible far back down the corridor,
          well before a player was anywhere near it */}
      <pointLight ref={lightRef} position={[0, 1.5, 0]} color="#ffffff" intensity={1.8} distance={2.8} />
    </group>
  );
}

// must match PLATE_COLORS in ConvergePlates.tsx - a triangle side's lit color identifies
// which of the 3 plates was completed, so the two need to stay in sync
const TRIANGLE_PLATE_COLORS = ["#38f8b6", "#ff5a7a", "#facc15"];
const TRIANGLE_UNLIT_COLOR = "#3a3a3a";
const TRIANGLE_COMPLETE_COLOR = "#4ade80"; // green - all three plates done, come to the exit
const TRIANGLE_RADIUS = 0.55;
const TRIANGLE_BAR_THICKNESS = 0.07;

const TRIANGLE_VERTICES: Array<[number, number]> = [0, 1, 2].map((i) => {
  const angle = Math.PI / 2 + (i * 2 * Math.PI) / 3; // start pointing up, go around
  return [Math.cos(angle) * TRIANGLE_RADIUS, Math.sin(angle) * TRIANGLE_RADIUS];
});

function triangleBarTransform(p1: [number, number], p2: [number, number]) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return {
    length: Math.hypot(dx, dy),
    midX: (p1[0] + p2[0]) / 2,
    midY: (p1[1] + p2[1]) / 2,
    angle: Math.atan2(dy, dx),
  };
}

const TRIANGLE_SIDES = [
  triangleBarTransform(TRIANGLE_VERTICES[0], TRIANGLE_VERTICES[1]),
  triangleBarTransform(TRIANGLE_VERTICES[1], TRIANGLE_VERTICES[2]),
  triangleBarTransform(TRIANGLE_VERTICES[2], TRIANGLE_VERTICES[0]),
];

// Progress readout for the "convergePlates" obstacle, mounted on the exit barrier's own front
// face. A side lights up (in the color of whichever plate the team just completed) in
// whatever order they finish them in — not tied to a fixed side-per-plate mapping. The whole
// triangle only turns green once `isUnlocked` (the team has gathered at the exit after all
// three plates are done — see checkExitAdvance's convergePlates branch); mounted independent
// of exitUnlocked (not nested under a `!exitUnlocked` check) so it keeps showing green after
// the barrier disappears, instead of vanishing in the same instant it turns green.
export function ExitProgressTriangle({
  exitWorldX,
  exitWorldZ,
  orientationY,
  wallHeight,
  cellSize,
  completionOrder,
  isUnlocked,
}: {
  exitWorldX: number;
  exitWorldZ: number;
  orientationY: number;
  wallHeight: number;
  cellSize: number;
  completionOrder: number[];
  isUnlocked: boolean;
}) {
  // just in front of the barrier's own front face (barrier depth is cellSize * 0.6, so its
  // front sits at half that from center) - close enough to read as mounted on it
  const zOffset = cellSize * 0.3 + 0.03;

  return (
    <group position={[exitWorldX, wallHeight / 2, exitWorldZ]} rotation={[0, orientationY, 0]}>
      {TRIANGLE_SIDES.map((side, sideIndex) => {
        const plateIndex = completionOrder[sideIndex];
        const isLit = isUnlocked || plateIndex !== undefined;
        const color = isUnlocked
          ? TRIANGLE_COMPLETE_COLOR
          : plateIndex !== undefined
            ? TRIANGLE_PLATE_COLORS[plateIndex] ?? TRIANGLE_UNLIT_COLOR
            : TRIANGLE_UNLIT_COLOR;

        return (
          <mesh key={sideIndex} position={[side.midX, side.midY, zOffset]} rotation={[0, 0, side.angle]}>
            <planeGeometry args={[side.length, TRIANGLE_BAR_THICKNESS]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isLit ? 0.7 : 0.15}
              roughness={0.3}
              metalness={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}
