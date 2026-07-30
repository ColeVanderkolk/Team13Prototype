import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import type * as Client from "colyseus.js";
import * as THREE from "three";
import { MazeCollectibles } from "./MazeCollectibles";
import { ExitBarrier, FlashlightProp, MazePlayerAvatar, MazeWallPiece, USE_CUSTOM_WALL_MODELS, HAS_WALL_MODEL } from "./MazeModels";
import { PressurePlates } from "./PressurePlates";
import { Levers } from "./Levers";
import { Keys } from "./Keys";
import { useSounds } from "@/hooks/use-sounds";

const WALL_NORTH = 1;
const WALL_EAST = 2;
const WALL_SOUTH = 4;
const WALL_WEST = 8;
const ALL_WALLS = WALL_NORTH | WALL_EAST | WALL_SOUTH | WALL_WEST;

const CELL_SIZE = 1.8;
const WALL_THICKNESS = 0.18;
const WALL_HEIGHT = 1.35;
const FLOOR_TEXTURE_URL = (import.meta.env.VITE_MAZE_FLOOR_TEXTURE_URL || "").trim();
const SKY_TEXTURE_URL = (import.meta.env.VITE_MAZE_SKY_TEXTURE_URL || "").trim();
const FLOOR_TEXTURE_REPEAT_UNITS = Number(import.meta.env.VITE_MAZE_FLOOR_TEXTURE_REPEAT_UNITS || CELL_SIZE) || CELL_SIZE;
const envDegreesToRadians = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return THREE.MathUtils.degToRad(Number.isFinite(parsed) ? parsed : fallback);
};
const SKY_ROTATION: [number, number, number] = [
  envDegreesToRadians(import.meta.env.VITE_MAZE_SKY_ROTATION_X_DEG, 90),
  envDegreesToRadians(import.meta.env.VITE_MAZE_SKY_ROTATION_Y_DEG, 0),
  envDegreesToRadians(import.meta.env.VITE_MAZE_SKY_ROTATION_Z_DEG, 0),
];
const CAMERA_DISTANCE = 16;
const CAMERA_MIN_DISTANCE = 10;
const CAMERA_MAX_DISTANCE = 30;
const PLAYER_VISUAL_DAMPING = 26;
const CAMERA_DAMPING = 12;
const WALK_SPEED = 2.75;
const SPRINT_SPEED = 4.6;
const PLAYER_RADIUS = 0.23;
const CAM_ANGLE = Math.PI * 0.25;
const POSITION_SEND_INTERVAL = 1 / 20;

// mirrors the server's leverTriggerPosition (GameRoom.ts)
const LEVER_INTERACT_INSET = 0.35;

// Deliberately tighter than the server's own LEVER_RADIUS (0.55, GameRoom.ts): being
// anywhere in the lever's cell is enough for the server to accept a pull, but the "press E"
// hint (and the client's own pre-check before sending) should only fire once the player has
// actually walked up to the lever itself, not just entered its cell.
const LEVER_PROMPT_RADIUS = 0.32;
// Cosine of the half-angle of the "facing" cone in front of the player (~70°, so a ~140°
// total cone) — lets the lever be a little off-center without requiring pixel-perfect aim.
const LEVER_FACING_MIN_DOT = 0.35;

function leverTriggerPosition(cellX: number, cellY: number, wallDir: number): [number, number] {
  let offsetX = 0;
  let offsetY = 0;
  if (wallDir === WALL_NORTH) offsetY = -LEVER_INTERACT_INSET;
  else if (wallDir === WALL_SOUTH) offsetY = LEVER_INTERACT_INSET;
  else if (wallDir === WALL_WEST) offsetX = -LEVER_INTERACT_INSET;
  else if (wallDir === WALL_EAST) offsetX = LEVER_INTERACT_INSET;
  return [cellX + offsetX, cellY + offsetY];
}

// Single source of truth for "is the player close enough to, and facing, an interactable
// lever right now" — shared by the prompt (useFrame) and the actual E-key handler, so the
// hint showing and the pull working can never disagree. Reads lever positions from a ref
// (kept fresh every render) rather than closing over the props directly, so it can be used
// inside a long-lived event listener without going stale when the level changes.
function findFacingLeverIndex(
  px: number,
  py: number,
  yaw: number,
  cellX: number[],
  cellY: number[],
  wallDir: number[],
): number {
  const playerCellX = Math.round(px);
  const playerCellY = Math.round(py);
  const forwardX = Math.sin(yaw);
  const forwardY = Math.cos(yaw);

  for (let i = 0; i < cellX.length; i++) {
    // must be standing in the same cell the lever is mounted in — otherwise a wall may
    // separate the player from a trigger point that's still geometrically close by
    if (cellX[i] !== playerCellX || cellY[i] !== playerCellY) continue;

    const [triggerX, triggerY] = leverTriggerPosition(cellX[i], cellY[i], wallDir[i]);
    const dx = triggerX - px;
    const dy = triggerY - py;
    const distance = Math.hypot(dx, dy);
    if (distance >= LEVER_PROMPT_RADIUS) continue;

    // skip the facing check when almost exactly on top of the trigger — direction is
    // meaningless at ~zero distance, and this shouldn't be able to fail the interaction
    if (distance > 0.02) {
      const facingDot = (dx / distance) * forwardX + (dy / distance) * forwardY;
      if (facingDot < LEVER_FACING_MIN_DOT) continue;
    }

    return i;
  }

  return -1;
}

// First-person mode (toggle with V)
const FP_EYE_HEIGHT = 0.62;
const FP_FOV = 70;
const OVERHEAD_FOV = 46;
const FP_MOUSE_SENSITIVITY = 0.0032; // radians per pixel of mouse movement
const FP_PITCH_LIMIT = 0.6; // how far you can look up/down (radians)
const FLASHLIGHT_COLOR = "#ffd48a";
const FLASHLIGHT_POSITION: [number, number, number] = [0.34, 0.34, 0.3];
const FLASHLIGHT_BEAM_DISTANCE = 11;
const FLASHLIGHT_BEAM_INTENSITY = 13;
const FLASHLIGHT_LOCAL_GLOW_INTENSITY = 0.06;
const FLASHLIGHT_LOCAL_GLOW_DISTANCE = 0.85;

// Quadrant wall colors - each quarter of the maze glows a different hue for orientation
// [surface color, emissive glow] pairs; index 0 keeps the original blue
const QUADRANT_WALL_COLORS: Array<[string, string]> = [
  ["#7dd3fc", "#0ea5e9"], // blue
  ["#f9a8d4", "#db2777"], // pink
  ["#fcd34d", "#d97706"], // amber
  ["#c4b5fd", "#7c3aed"], // violet
];

// Graffiti drawing - hold left-click to draw on a wall (spray-can style in first
// person: hold and move your view). Right-click drags a chunky eraser.
const GRAFFITI_RANGE = 1.9; // how close (in cells) a wall must be to draw on it
const GRAFFITI_FALLBACK_COLOR = "#94a3b8"; // strokes left by players who disconnected
const GRAFFITI_CANVAS_PX_PER_UNIT = 128; // texture resolution of the drawing surface
const GRAFFITI_BRUSH_PX = 12; // pen thickness in canvas pixels
const GRAFFITI_ERASER_PX = 44; // medium eraser circle - clears fast without wiping everything
const GRAFFITI_MIN_POINT_DISTANCE = 0.015; // min uv movement before recording another point
const GRAFFITI_MAX_POINTS = 64; // per stroke; longer drags auto-split into new strokes
const GRAFFITI_PENDING_MS = 1500; // keep your just-sent stroke visible until the server echoes it
const GRAFFITI_OPACITY = 0.72;

const CONTROL_CODES = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};

interface MazePlayer {
  x: number;
  y: number;
  sessionId: string;
  name: string;
  slot: number; // permanent color/plate/key slot, assigned once at join
}

interface MazeCollectible {
  x: number;
  y: number;
  id: string;
  score: number;
}

interface MazeBoardProps {
  gridWidth: number;
  gridHeight: number;
  mazeWalls: number[];
  startX: number;
  startY: number;
  exitX: number;
  exitY: number;
  exitUnlocked: boolean;
  seed: number;
  collectibles: MazeCollectible[];
  players: Map<string, MazePlayer>;
  room: Client.Room | null;
  countdown?: number;
  currentSessionId?: string | null;
  /** Dev-only: enables the V key first-person camera toggle */
  viewToggleEnabled?: boolean;

  // preessure plates
  pressurePlatesRequired: number;
  plate0X: number;
  plate0Y: number;
  plate1X: number;
  plate1Y: number;
  plate2X: number;
  plate2Y: number;

  // keys
  keysRequired: number;
  key0X: number;
  key0Y: number;
  key1X: number;
  key1Y: number;
  key2X: number;
  key2Y: number;
  allKeysCollected: boolean;
  keysCollectedMask: number;

  obstacleType: string;
  playersAtExit: number;
  leversTotal: number;
  leversPulledInOrder: number;
  leverCellX: number[];
  leverCellY: number[];
  leverWallDir: number[];
  onWrongPull?: () => void;

  compassYawRef: MutableRefObject<number | null>;
  leverInRangeRef?: MutableRefObject<boolean>;
  disabled?: boolean; // freezes movement and all interaction — used for the post-game results screen
}

interface LocalPosition {
  x: number;
  y: number;
}

interface WallSegment {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
}

const PLAYER_COLORS = ["#38f8b6", "#ff5a7a", "#facc15", "#a78bfa", "#fb923c", "#67e8f9"];
const GRAFFITI_COLORS = ["#1f9f79", "#b23a55", "#b88a18", "#7864c8", "#b8642c", "#319aa8"];

function mazeIndex(width: number, x: number, y: number) {
  return y * width + x;
}

function wallForDirection(direction: "up" | "right" | "down" | "left") {
  switch (direction) {
    case "up":
      return WALL_NORTH;
    case "right":
      return WALL_EAST;
    case "down":
      return WALL_SOUTH;
    case "left":
      return WALL_WEST;
  }
}

function cellToWorld(gridWidth: number, gridHeight: number, x: number, y: number): [number, number] {
  return [
    (x - (gridWidth - 1) / 2) * CELL_SIZE,
    (y - (gridHeight - 1) / 2) * CELL_SIZE,
  ];
}

function MazeCamera({
  gridWidth,
  gridHeight,
  target,
  targetRef,
  firstPersonRef,
  fpYawRef,
  fpPitchRef,
}: {
  gridWidth: number;
  gridHeight: number;
  target: [number, number];
  targetRef?: MutableRefObject<LocalPosition>;
  firstPersonRef?: MutableRefObject<boolean>;
  fpYawRef?: MutableRefObject<number>;
  fpPitchRef?: MutableRefObject<number>;
}) {
  const { camera, gl } = useThree();
  const lookAtRef = useRef(new THREE.Vector3(target[0], 0.24, target[1]));
  const desiredLookAtRef = useRef(new THREE.Vector3(target[0], 0.24, target[1]));
  const distanceRef = useRef(CAMERA_DISTANCE);

  useEffect(() => {
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      distanceRef.current = Math.max(
        CAMERA_MIN_DISTANCE,
        Math.min(CAMERA_MAX_DISTANCE, distanceRef.current + event.deltaY * 0.018),
      );
    };

    gl.domElement.addEventListener("wheel", onWheel, { passive: true });
    return () => gl.domElement.removeEventListener("wheel", onWheel);
  }, [gl]);

  useFrame((_state, delta) => {
    const persp = camera as THREE.PerspectiveCamera;

    // ── First person: camera sits at the player's eye height, facing fpYaw ──
    if (firstPersonRef?.current && targetRef && fpYawRef) {
      const [fx, fz] = cellToWorld(gridWidth, gridHeight, targetRef.current.x, targetRef.current.y);
      if (persp.fov !== FP_FOV) {
        persp.fov = FP_FOV;
        persp.updateProjectionMatrix();
      }
      const yaw = fpYawRef.current;
      const pitch = fpPitchRef?.current ?? 0;
      const cosPitch = Math.cos(pitch);
      camera.position.set(fx, FP_EYE_HEIGHT, fz);
      camera.lookAt(
        fx + Math.sin(yaw) * cosPitch,
        FP_EYE_HEIGHT + Math.sin(pitch),
        fz + Math.cos(yaw) * cosPitch,
      );
      return;
    }

    // ── Overhead mode (original behavior) ──
    if (persp.fov !== OVERHEAD_FOV) {
      persp.fov = OVERHEAD_FOV;
      persp.updateProjectionMatrix();
    }
    const camAngle = Math.PI * 0.25;
    const camPitch = 1.05;
    const distance = distanceRef.current;
    if (targetRef) {
      const [x, z] = cellToWorld(gridWidth, gridHeight, targetRef.current.x, targetRef.current.y);
      desiredLookAtRef.current.set(x, 0.24, z);
    } else {
      desiredLookAtRef.current.set(target[0], 0.24, target[1]);
    }
    lookAtRef.current.x = THREE.MathUtils.damp(lookAtRef.current.x, desiredLookAtRef.current.x, CAMERA_DAMPING, delta);
    lookAtRef.current.y = THREE.MathUtils.damp(lookAtRef.current.y, desiredLookAtRef.current.y, CAMERA_DAMPING, delta);
    lookAtRef.current.z = THREE.MathUtils.damp(lookAtRef.current.z, desiredLookAtRef.current.z, CAMERA_DAMPING, delta);

    const offset = new THREE.Vector3(
      Math.sin(camAngle) * Math.cos(camPitch) * distance,
      Math.sin(camPitch) * distance,
      Math.cos(camAngle) * Math.cos(camPitch) * distance,
    );

    camera.position.copy(lookAtRef.current).add(offset);
    camera.lookAt(lookAtRef.current);
  });

  return null;
}

interface GraffitiStrokeData {
  id: string;
  sessionId: string;
  eraser: boolean;
  side: number; // which wall face the stroke lives on: 1 or -1
  points: number[]; // flat [u0, v0, u1, v1, ...] in wall-face coordinates (0..1)
}

function drawStrokesToCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: GraffitiStrokeData[],
  colorForSession: (sessionId: string) => string,
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    ctx.globalCompositeOperation = stroke.eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.eraser ? "#000" : colorForSession(stroke.sessionId);
    ctx.lineWidth = stroke.eraser ? GRAFFITI_ERASER_PX : GRAFFITI_BRUSH_PX;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0] * width, stroke.points[1] * height);
    if (stroke.points.length === 2) {
      ctx.lineTo(stroke.points[0] * width + 0.01, stroke.points[1] * height); // single click = dot
    }
    for (let p = 2; p < stroke.points.length; p += 2) {
      ctx.lineTo(stroke.points[p] * width, stroke.points[p + 1] * height);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

function GraffitiWall({
  segment,
  strokes,
  previewStroke,
  colorForSession,
}: {
  segment: WallSegment;
  strokes: GraffitiStrokeData[];
  previewStroke: GraffitiStrokeData | null;
  colorForSession: (sessionId: string) => string;
}) {
  const alongX = segment.size[0] > segment.size[2];
  // Extend the drawing surface by one post-width (half over each corner post) so
  // adjacent walls' surfaces meet at post centers - you can draw across junctions
  const faceLength = (alongX ? segment.size[0] : segment.size[2]) + WALL_THICKNESS;
  const faceHeight = segment.size[1];
  const faceOffset = (alongX ? segment.size[2] : segment.size[0]) / 2 + 0.018;
  // -PI/2 (not +PI/2) so the canvas "u" axis lines up with world +z on north-south walls
  const rotY = alongX ? 0 : -Math.PI / 2;

  // One canvas per wall FACE, so drawing on one side never shows on the other.
  // Keyed on stable primitives (not array identity) so canvases survive parent re-renders.
  const faces = useMemo(() => {
    return [1, -1].map((side) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(faceLength * GRAFFITI_CANVAS_PX_PER_UNIT);
      canvas.height = Math.round(faceHeight * GRAFFITI_CANVAS_PX_PER_UNIT);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return { side, canvas, texture };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment.key, faceLength, faceHeight]);

  useEffect(() => () => faces.forEach((face) => face.texture.dispose()), [faces]);

  useEffect(() => {
    // previewStroke is only non-null for the ONE wall currently being drawn on, so this
    // effect re-fires on every mouse-move sample only for that wall - every other wall's
    // `strokes` stays referentially stable (see confirmedStrokesByWall below) and never
    // redraws just because someone is drawing elsewhere in the maze.
    const allStrokes = previewStroke && previewStroke.points.length >= 2
      ? [...strokes, previewStroke]
      : strokes;
    for (const face of faces) {
      const ctx = face.canvas.getContext("2d");
      if (!ctx) continue;
      drawStrokesToCanvas(ctx, allStrokes.filter((stroke) => stroke.side === face.side), colorForSession);
      face.texture.needsUpdate = true;
    }
  }, [colorForSession, faces, strokes, previewStroke]);

  return (
    <group position={[segment.position[0], segment.position[1], segment.position[2]]} rotation={[0, rotY, 0]}>
      {faces.map((face) => (
        <mesh
          key={face.side}
          position={[0, 0, face.side * faceOffset]}
          rotation={[0, face.side === 1 ? 0 : Math.PI, 0]}
        >
          <planeGeometry args={[faceLength, faceHeight]} />
          <meshBasicMaterial map={face.texture} transparent opacity={GRAFFITI_OPACITY} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function TexturedMazeFloor({ width, depth }: { width: number; depth: number }) {
  const texture = useTexture(FLOOR_TEXTURE_URL) as THREE.Texture;
  const { gl } = useThree();

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(
      Math.max(1, width / FLOOR_TEXTURE_REPEAT_UNITS),
      Math.max(1, depth / FLOOR_TEXTURE_REPEAT_UNITS),
    );
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
  }, [depth, gl, texture, width]);

  return (
    <mesh receiveShadow position={[0, -0.08, 0]}>
      <boxGeometry args={[width, 0.12, depth]} />
      <meshStandardMaterial map={texture} roughness={0.88} metalness={0.03} />
    </mesh>
  );
}

function MazeFloor({ width, depth }: { width: number; depth: number }) {
  if (FLOOR_TEXTURE_URL) {
    return <TexturedMazeFloor width={width} depth={depth} />;
  }

  return (
    <mesh receiveShadow position={[0, -0.08, 0]}>
      <boxGeometry args={[width, 0.12, depth]} />
      <meshStandardMaterial color="#111827" roughness={0.92} metalness={0.02} />
    </mesh>
  );
}

function TexturedSkySphere({ radius }: { radius: number }) {
  const texture = useTexture(SKY_TEXTURE_URL) as THREE.Texture;

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <mesh frustumCulled={false} renderOrder={-1000} rotation={SKY_ROTATION}>
      <sphereGeometry args={[radius, 64, 32]} />
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        fog={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function MazeSky({ radius }: { radius: number }) {
  if (!SKY_TEXTURE_URL) return null;
  return <TexturedSkySphere radius={radius} />;
}

// Small white aiming dot shown only in first person, so you can see where the
// spray can (and your view) is pointed
function FpCrosshair({ firstPersonRef }: { firstPersonRef: MutableRefObject<boolean> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const direction = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.visible = firstPersonRef.current;
    if (!mesh.visible) return;
    camera.getWorldDirection(direction);
    mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
    mesh.quaternion.copy(camera.quaternion);
  });

  return (
    <mesh ref={meshRef} renderOrder={999} visible={false}>
      <circleGeometry args={[0.0045, 12]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

function PlayerFlashlight({
  isMe,
  firstPersonRef,
  fpPitchRef,
}: {
  isMe: boolean;
  firstPersonRef?: MutableRefObject<boolean>;
  fpPitchRef?: MutableRefObject<number>;
}) {
  const aimRef = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Object3D(), []);

  useFrame((_state, delta) => {
    const aim = aimRef.current;
    if (!aim) return;

    const targetPitch = isMe && firstPersonRef?.current ? -(fpPitchRef?.current ?? 0) : -0.06;
    aim.rotation.x = THREE.MathUtils.damp(aim.rotation.x, targetPitch, 18, delta);
  });

  return (
    <group position={FLASHLIGHT_POSITION}>
      <group ref={aimRef}>
        <FlashlightProp />
        <spotLight
          position={[0, 0, 0.12]}
          target={target}
          color={FLASHLIGHT_COLOR}
          intensity={FLASHLIGHT_BEAM_INTENSITY}
          distance={FLASHLIGHT_BEAM_DISTANCE}
          angle={0.36}
          penumbra={0.58}
          decay={1.55}
          castShadow
        />
        <pointLight
          position={[0, 0, 0.16]}
          color={FLASHLIGHT_COLOR}
          intensity={FLASHLIGHT_LOCAL_GLOW_INTENSITY}
          distance={FLASHLIGHT_LOCAL_GLOW_DISTANCE}
          decay={2}
        />
        <primitive object={target} position={[0, 0, FLASHLIGHT_BEAM_DISTANCE]} />
      </group>
    </group>
  );
}

function PlayerToken({
  player,
  index,
  isMe,
  gridWidth,
  gridHeight,
  localPositionRef,
  firstPersonRef,
  fpYawRef,
  fpPitchRef,
}: {
  player: MazePlayer;
  index: number;
  isMe: boolean;
  gridWidth: number;
  gridHeight: number;
  localPositionRef?: MutableRefObject<LocalPosition>;
  firstPersonRef?: MutableRefObject<boolean>;
  fpYawRef?: MutableRefObject<number>;
  fpPitchRef?: MutableRefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const avatarRef = useRef<THREE.Group>(null);
  const desiredPosition = useRef(new THREE.Vector3());
  const color = PLAYER_COLORS[index % PLAYER_COLORS.length];

  const getVisualTarget = () => {
    const source = localPositionRef?.current ?? player;
    const [x, z] = cellToWorld(gridWidth, gridHeight, source.x, source.y);
    return new THREE.Vector3(x, 0.02, z);
  };

  const target = useMemo(getVisualTarget, [gridHeight, gridWidth, localPositionRef, player.x, player.y]);

  useEffect(() => {
    if (!groupRef.current) return;

    const jumpDistance = groupRef.current.position.distanceTo(target);
    if (jumpDistance > CELL_SIZE * 2.4) {
      groupRef.current.position.copy(target);
    }
  }, [target]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    const visualTarget = getVisualTarget();
    desiredPosition.current.set(visualTarget.x, visualTarget.y, visualTarget.z);

    // Hide your own avatar in first person so the camera isn't inside the model,
    // but keep the flashlight/light rig active.
    if (avatarRef.current) {
      avatarRef.current.visible = !(isMe && firstPersonRef?.current);
    }

    const moveX = visualTarget.x - groupRef.current.position.x;
    const moveZ = visualTarget.z - groupRef.current.position.z;
    const moving = Math.hypot(moveX, moveZ) > 0.006;

    if (localPositionRef) {
      groupRef.current.position.copy(desiredPosition.current);
    } else {
      groupRef.current.position.x = THREE.MathUtils.damp(
        groupRef.current.position.x,
        desiredPosition.current.x,
        PLAYER_VISUAL_DAMPING,
        delta,
      );
      groupRef.current.position.y = THREE.MathUtils.damp(
        groupRef.current.position.y,
        desiredPosition.current.y,
        PLAYER_VISUAL_DAMPING,
        delta,
      );
      groupRef.current.position.z = THREE.MathUtils.damp(
        groupRef.current.position.z,
        desiredPosition.current.z,
        PLAYER_VISUAL_DAMPING,
        delta,
      );
    }

    if (isMe && firstPersonRef?.current && fpYawRef) {
      groupRef.current.rotation.y = fpYawRef.current;
    } else if (moving) {
      const targetYaw = Math.atan2(moveX, moveZ);
      let deltaYaw = targetYaw - groupRef.current.rotation.y;
      while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      groupRef.current.rotation.y += deltaYaw * Math.min(1, 14 * delta);
    }
  });

  return (
    <group ref={groupRef} position={[target.x, target.y, target.z]}>
      <group ref={avatarRef}>
        <MazePlayerAvatar color={color} isMe={isMe} />
      </group>
      <PlayerFlashlight isMe={isMe} firstPersonRef={firstPersonRef} fpPitchRef={fpPitchRef} />
    </group>
  );
}

export function MazeBoard({
  gridWidth,
  gridHeight,
  mazeWalls,
  startX,
  startY,
  exitX,
  exitY,
  exitUnlocked,
  seed,
  collectibles,
  players,
  room,
  countdown,
  currentSessionId,
  viewToggleEnabled,

  pressurePlatesRequired,
  plate0X,
  plate0Y,
  plate1X,
  plate1Y,
  plate2X,
  plate2Y,

  keysRequired,
  key0X,
  key0Y,
  key1X,
  key1Y,
  key2X,
  key2Y,
  allKeysCollected,
  keysCollectedMask,

  obstacleType,
  playersAtExit,
  leversTotal,
  leversPulledInOrder,
  leverCellX,
  leverCellY,
  leverWallDir,
  onWrongPull,

  compassYawRef,
  leverInRangeRef,
  disabled = false,
}: MazeBoardProps) {
  const disabledRef = useRef(disabled);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const hasMaze = gridWidth > 0 && gridHeight > 0 && mazeWalls.length === gridWidth * gridHeight;
  const boardWidth = gridWidth * CELL_SIZE;
  const boardDepth = gridHeight * CELL_SIZE;
  const gridSpan = Math.max(boardWidth, boardDepth);
  const [startWorldX, startWorldZ] = cellToWorld(gridWidth, gridHeight, startX, startY);
  const [exitWorldX, exitWorldZ] = cellToWorld(gridWidth, gridHeight, exitX, exitY);
  const { gl, camera } = useThree();
  const currentPlayer = currentSessionId ? players.get(currentSessionId) : undefined;
  const localPositionRef = useRef<LocalPosition>({
    x: currentPlayer?.x ?? startX,
    y: currentPlayer?.y ?? startY,
  });
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const [leverWrongPullKey, setLeverWrongPullKey] = useState(0);
  const firstPersonRef = useRef(true); // toggled with the V key
  const noclipRef = useRef(false); // dev-only: N key - walk through walls
  const fpYawRef = useRef(0); // horizontal facing while in first person
  const fpPitchRef = useRef(0); // vertical look while in first person
  const lastSentAtRef = useRef(0);
  const lastSentPositionRef = useRef<LocalPosition>({ x: Number.NaN, y: Number.NaN });
  const lastMazeSignatureRef = useRef("");

  const [graffiti, setGraffiti] = useState<Array<GraffitiStrokeData & { wallKey: string }>>([]);
  // Your stroke while still dragging - previewed locally before it's sent
  const [preview, setPreview] = useState<(GraffitiStrokeData & { wallKey: string }) | null>(null);
  // Just-released strokes kept visible until the server echoes them back (prevents blink)
  const [pendingStrokes, setPendingStrokes] = useState<Array<GraffitiStrokeData & { wallKey: string }>>([]);
  const drawingRef = useRef<{ wallKey: string; side: number; eraser: boolean; points: number[] } | null>(null);
  const pendingCounterRef = useRef(0);

  const prevLeversPulledInOrderRef = useRef(leversPulledInOrder);
  const drawSoundRef = useRef<HTMLAudioElement | null>(null);

  // Kept in sync every render (not inside an effect) so the long-lived keydown listener
  // below can always read this level's actual lever positions through the ref, instead of
  // closing over the leverCellX/leverCellY props directly and going stale after a level change.
  const leverPositionsRef = useRef({ cellX: leverCellX, cellY: leverCellY, wallDir: leverWallDir });
  leverPositionsRef.current = { cellX: leverCellX, cellY: leverCellY, wallDir: leverWallDir };

  // Wipe local-only, not-yet-confirmed graffiti state on every level change. Without this,
  // a stroke drawn in the last ~1.5s before the level advances stays in pendingStrokes (or
  // preview) after the new maze loads, and since wall keys are just grid coordinates + side,
  // the new maze can easily have a wall reusing that same key - so old (possibly erased)
  // graffiti could reappear on an unrelated wall in the new level.
  useEffect(() => {
    setPendingStrokes([]);
    setPreview(null);
    drawingRef.current = null;
  }, [seed]);

  const { play: playSound, playLoop, stopLoop, sfxVolume, setSfxVolume } = useSounds();

  // fires light switch pull sound only when correct lever is pulled
  useEffect(() =>  {
    if (leversPulledInOrder > prevLeversPulledInOrderRef.current) {
      // playSound(l)
      playSound("lightSwitch");
    }
    prevLeversPulledInOrderRef.current = leversPulledInOrder;
  }, [leversPulledInOrder]);


  // Mirror the server's graffiti strokes into local state whenever the room state changes
  useEffect(() => {
    if (!room) return;

    const readGraffiti = () => {
      const map = (room.state as {
        graffiti?: {
          forEach: (
            cb: (stroke: { wallKey?: string; sessionId?: string; eraser?: boolean; points?: { toArray?: () => number[] } | number[] }, key: string) => void,
          ) => void;
        };
      }).graffiti;
      if (!map) return;

      const next: Array<GraffitiStrokeData & { wallKey: string }> = [];
      map.forEach((stroke, key) => {
        const rawPoints = stroke?.points;
        const points = Array.isArray(rawPoints)
          ? rawPoints.slice()
          : rawPoints && typeof rawPoints.toArray === "function"
            ? rawPoints.toArray()
            : Array.from((rawPoints as unknown as Iterable<number>) ?? []);
        next.push({
          id: key,
          wallKey: stroke?.wallKey ?? "",
          sessionId: stroke?.sessionId ?? "",
          eraser: stroke?.eraser === true,
          side: (stroke as { side?: number })?.side === -1 ? -1 : 1,
          points,
        });
      });
      // Sort by the stroke counter NUMERICALLY (ids are "s1", "s2", ... "s10"), so
      // strokes render in the order they were drawn. Alphabetical sorting put "s10"
      // before "s2", letting old strokes repaint OVER later eraser strokes - erased
      // graffiti would "pop back up".
      const strokeNumber = (id: string) => Number(id.slice(1)) || 0;
      next.sort((a, b) => strokeNumber(a.id) - strokeNumber(b.id));

      setGraffiti((prev) => {
        if (
          prev.length === next.length &&
          prev.every((p, k) => p.id === next[k].id && p.points.length === next[k].points.length)
        ) {
          return prev;
        }
        return next;
      });
    };

    readGraffiti();
    room.onStateChange(readGraffiti);
    return () => {
      room.onStateChange.remove(readGraffiti);
    };
  }, [room]);

  const wallSegments = useMemo<WallSegment[]>(() => {
    if (!hasMaze) return [];

    const segments: WallSegment[] = [];
    const wallLength = USE_CUSTOM_WALL_MODELS ? CELL_SIZE : CELL_SIZE + WALL_THICKNESS;

    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const mask = mazeWalls[mazeIndex(gridWidth, x, y)] ?? ALL_WALLS;
        const [worldX, worldZ] = cellToWorld(gridWidth, gridHeight, x, y);

        if ((mask & WALL_NORTH) !== 0) {
          segments.push({
            key: `${x}-${y}-n`,
            position: [worldX, WALL_HEIGHT / 2, worldZ - CELL_SIZE / 2],
            size: [wallLength, WALL_HEIGHT, WALL_THICKNESS],
          });
        }

        if ((mask & WALL_WEST) !== 0) {
          segments.push({
            key: `${x}-${y}-w`,
            position: [worldX - CELL_SIZE / 2, WALL_HEIGHT / 2, worldZ],
            size: [WALL_THICKNESS, WALL_HEIGHT, wallLength],
          });
        }

        if (x === gridWidth - 1 && (mask & WALL_EAST) !== 0) {
          segments.push({
            key: `${x}-${y}-e`,
            position: [worldX + CELL_SIZE / 2, WALL_HEIGHT / 2, worldZ],
            size: [WALL_THICKNESS, WALL_HEIGHT, wallLength],
          });
        }

        if (y === gridHeight - 1 && (mask & WALL_SOUTH) !== 0) {
          segments.push({
            key: `${x}-${y}-s`,
            position: [worldX, WALL_HEIGHT / 2, worldZ + CELL_SIZE / 2],
            size: [wallLength, WALL_HEIGHT, WALL_THICKNESS],
          });
        }
      }
    }

    return segments;
    // seed + dimensions uniquely identify a maze, so this stays stable across
    // re-renders even when the parent passes a fresh mazeWalls array each patch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridHeight, gridWidth, hasMaze, seed, mazeWalls.length]);

  // One shared material per quadrant for every wall and post in it
  const quadrantMaterials = useMemo(
    () =>
      QUADRANT_WALL_COLORS.map(
        ([color, emissive]) =>
          new THREE.MeshStandardMaterial({
            color,
            emissive,
            emissiveIntensity: 0.16,
            roughness: 0.42,
            metalness: 0.22,
          }),
      ),
    [],
  );
  useEffect(() => () => quadrantMaterials.forEach((m) => m.dispose()), [quadrantMaterials]);

  const orderedPlayers = useMemo(
    () => Array.from(players.entries()).sort(([a], [b]) => a.localeCompare(b)),
    [players],
  );
  const colorForSession = useMemo(() => {
    // each player's color is their own permanent slot, not their position in a live sorted
    // list — so one player leaving can never reassign another player's color
    const colorBySession = new Map(
      Array.from(players.values()).map((p) => [p.sessionId, GRAFFITI_COLORS[p.slot % GRAFFITI_COLORS.length]]),
    );
    return (sessionId: string) => colorBySession.get(sessionId) ?? GRAFFITI_FALLBACK_COLOR;
  }, [players]);

  // Confirmed + just-sent strokes only - deliberately excludes the live in-progress
  // preview, so this only changes when a stroke actually completes (rare) rather than on
  // every mouse-move sample. That keeps every wall EXCEPT the one currently being drawn on
  // from redrawing at all while someone drags out a stroke anywhere in the maze.
  const confirmedStrokesByWall = useMemo(() => {
    const byWall = new Map<string, GraffitiStrokeData[]>();
    const add = (stroke: GraffitiStrokeData & { wallKey: string }) => {
      const list = byWall.get(stroke.wallKey);
      if (list) list.push(stroke);
      else byWall.set(stroke.wallKey, [stroke]);
    };
    graffiti.forEach(add);
    pendingStrokes.forEach(add);
    return byWall;
  }, [graffiti, pendingStrokes]);

  const wallSegmentByKey = useMemo(
    () => new Map(wallSegments.map((segment) => [segment.key, segment])),
    [wallSegments],
  );

  // Corner posts: a small pillar at every grid corner that has at least one wall
  // meeting it. Walls now end exactly at post faces, so no two surfaces ever
  // overlap in the same plane - this removes the corner z-fighting at the source.
  const cornerPosts = useMemo(() => {
    if (!hasMaze) return [] as Array<{ key: string; position: [number, number, number] }>;

    const wallBits = (cx: number, cy: number) =>
      cx >= 0 && cy >= 0 && cx < gridWidth && cy < gridHeight
        ? mazeWalls[mazeIndex(gridWidth, cx, cy)] ?? ALL_WALLS
        : 0;

    const posts: Array<{ key: string; position: [number, number, number] }> = [];
    for (let cy = 0; cy <= gridHeight; cy++) {
      for (let cx = 0; cx <= gridWidth; cx++) {
        // The four wall edges meeting at corner (cx, cy), each readable from a
        // cell that touches it (falling back to the twin cell for border edges)
        const northOfBelow = (wallBits(cx, cy) & WALL_NORTH) !== 0 || (wallBits(cx, cy - 1) & WALL_SOUTH) !== 0;
        const northOfBelowLeft = (wallBits(cx - 1, cy) & WALL_NORTH) !== 0 || (wallBits(cx - 1, cy - 1) & WALL_SOUTH) !== 0;
        const westOfRight = (wallBits(cx, cy) & WALL_WEST) !== 0 || (wallBits(cx - 1, cy) & WALL_EAST) !== 0;
        const westOfRightAbove = (wallBits(cx, cy - 1) & WALL_WEST) !== 0 || (wallBits(cx - 1, cy - 1) & WALL_EAST) !== 0;

        if (!(northOfBelow || northOfBelowLeft || westOfRight || westOfRightAbove)) continue;

        const worldX = (cx - 0.5 - (gridWidth - 1) / 2) * CELL_SIZE;
        const worldZ = (cy - 0.5 - (gridHeight - 1) / 2) * CELL_SIZE;
        posts.push({ key: `post-${cx}-${cy}`, position: [worldX, WALL_HEIGHT / 2, worldZ] });
      }
    }
    return posts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridHeight, gridWidth, hasMaze, seed, mazeWalls.length]);

  const followedPlayer = currentPlayer ?? orderedPlayers[0]?.[1];
  const [followWorldX, followWorldZ] = cellToWorld(
    gridWidth,
    gridHeight,
    followedPlayer?.x ?? startX,
    followedPlayer?.y ?? startY,
  );

  const canOccupy = (x: number, y: number) => {
    const minX = -0.5 + PLAYER_RADIUS;
    const minY = -0.5 + PLAYER_RADIUS;
    const maxX = gridWidth - 0.5 - PLAYER_RADIUS;
    const maxY = gridHeight - 0.5 - PLAYER_RADIUS;

    if (!hasMaze) return false;
    if (x < minX || y < minY || x > maxX || y > maxY) return false;

    const cellX = Math.max(0, Math.min(gridWidth - 1, Math.round(x)));
    const cellY = Math.max(0, Math.min(gridHeight - 1, Math.round(y)));
    const walls = mazeWalls[mazeIndex(gridWidth, cellX, cellY)] ?? ALL_WALLS;
    const localX = x - cellX;
    const localY = y - cellY;
    const edge = 0.5 - PLAYER_RADIUS;

    if (localX > edge && (walls & wallForDirection("right")) !== 0) return false;
    if (localX < -edge && (walls & wallForDirection("left")) !== 0) return false;
    if (localY > edge && (walls & wallForDirection("down")) !== 0) return false;
    if (localY < -edge && (walls & wallForDirection("up")) !== 0) return false;

    // Corner test: when in a cell's corner zone, walls of the NEIGHBORING cells
    // that meet at that corner also block. Without this, wall ends (corner posts)
    // had no collision - players could clip into them, which in first person put
    // the camera inside the wall geometry.
    if (Math.abs(localX) > edge && Math.abs(localY) > edge) {
      const sx = localX > 0 ? 1 : -1;
      const sy = localY > 0 ? 1 : -1;
      const bits = (cx: number, cy: number) =>
        cx >= 0 && cy >= 0 && cx < gridWidth && cy < gridHeight
          ? mazeWalls[mazeIndex(gridWidth, cx, cy)] ?? ALL_WALLS
          : ALL_WALLS;
      const xNeighborWallY = bits(cellX + sx, cellY) & wallForDirection(sy > 0 ? "down" : "up");
      const yNeighborWallX = bits(cellX, cellY + sy) & wallForDirection(sx > 0 ? "right" : "left");
      if (xNeighborWallY !== 0 || yNeighborWallX !== 0) return false;
    }

    if (!exitUnlocked && Math.hypot(x - exitX, y - exitY) < 0.5) return false;

    return true;
  };

  useEffect(() => {
    const isControlKey = (event: KeyboardEvent) =>
      Object.values(CONTROL_CODES).some((codes) => codes.includes(event.code)) ||
      event.code === "ShiftLeft" ||
      event.code === "ShiftRight";

    const canvas = gl.domElement;

    const requestLock = () => {
      try {
        const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch {
        // pointer lock unavailable (e.g. iframe permissions) - FP still works, mouse just isn't captured
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyN") {
        if (!viewToggleEnabled) return; // noclip is a dev-mode feature
        noclipRef.current = !noclipRef.current;
        return;
      }
      if (event.code === "KeyV") {
        if (!viewToggleEnabled) return; // camera toggle is a dev-mode feature
        firstPersonRef.current = !firstPersonRef.current;
        if (firstPersonRef.current) {
          requestLock();
        } else if (document.pointerLockElement === canvas) {
          document.exitPointerLock();
        }
        return;
      }
      if (event.code === "KeyE") {
        if (disabledRef.current) return;
        if (!event.repeat) {
          const { cellX, cellY, wallDir } = leverPositionsRef.current;
          const leverIndex = findFacingLeverIndex(
            localPositionRef.current.x,
            localPositionRef.current.y,
            fpYawRef.current,
            cellX,
            cellY,
            wallDir,
          );

          if (leverIndex === -1) return;

          room?.send("pullLever");
        }
        return;
      }
      if (!isControlKey(event)) return;
      event.preventDefault();
      pressedKeysRef.current.add(event.code);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (disabledRef.current) return;
      if (!firstPersonRef.current) return;
      if (document.pointerLockElement !== canvas) return;
      fpYawRef.current -= event.movementX * FP_MOUSE_SENSITIVITY;
      fpPitchRef.current = Math.max(
        -FP_PITCH_LIMIT,
        Math.min(FP_PITCH_LIMIT, fpPitchRef.current - event.movementY * FP_MOUSE_SENSITIVITY),
      );
    };

    const handleCanvasClick = () => {
      // Esc releases the mouse; clicking the game re-captures it while in first person
      if (firstPersonRef.current && document.pointerLockElement !== canvas) {
        requestLock();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isControlKey(event)) return;
      event.preventDefault();
      pressedKeysRef.current.delete(event.code);
    };

    const handleBlur = () => pressedKeysRef.current.clear();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("click", handleCanvasClick);

    return () => {
      pressedKeysRef.current.clear();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleCanvasClick);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [gl, room, viewToggleEnabled]);

  // Graffiti drawing: hold left-click to draw on a nearby wall, right-click to erase.
  // In first person (mouse captured) you paint with the crosshair like a spray can;
  // in overhead you draw with the cursor like MS Paint.
  useEffect(() => {
    if (!room) return;
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const box = new THREE.Box3();
    const boxCenter = new THREE.Vector3();
    const boxSize = new THREE.Vector3();
    const hitPoint = new THREE.Vector3();
    const lookDirection = new THREE.Vector3();

    // Convert a wall hit into canvas coordinates (u, v in 0..1) plus which face was
    // hit: 1 = the face the canvas maps to directly, -1 = the mirrored back face
    // (strokes drawn there get u flipped so they land exactly where you aimed)
    const hitToWallUv = (segment: WallSegment, hit: THREE.Vector3): [number, number, number] => {
      const alongX = segment.size[0] > segment.size[2];
      // Match the extended drawing surface (covers half a post at each end)
      const length = (alongX ? segment.size[0] : segment.size[2]) + WALL_THICKNESS;
      const along = alongX
        ? hit.x - (segment.position[0] - length / 2)
        : hit.z - (segment.position[2] - length / 2);
      const u = Math.min(1, Math.max(0, along / length));
      const heightFromTop = segment.position[1] + segment.size[1] / 2 - hit.y;
      const v = Math.min(1, Math.max(0, heightFromTop / segment.size[1]));
      const side = alongX
        ? (hit.z >= segment.position[2] ? 1 : -1)
        : (hit.x <= segment.position[0] ? 1 : -1);
      return [u, v, side];
    };

    const castAtWalls = (event?: MouseEvent): { key: string; u: number; v: number; side: number } | null => {
      const locked = document.pointerLockElement === canvas;

      if (firstPersonRef.current && locked) {
        camera.getWorldDirection(lookDirection);
        raycaster.set(camera.position, lookDirection);
      } else if (firstPersonRef.current && !locked) {
        return null; // click is re-capturing the mouse, not drawing
      } else {
        if (!event) return null;
        const rect = canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
      }

      const [playerWorldX, playerWorldZ] = cellToWorld(
        gridWidth,
        gridHeight,
        localPositionRef.current.x,
        localPositionRef.current.y,
      );

      let best: { key: string; u: number; v: number; side: number } | null = null;
      let bestDistance = Infinity;

      for (const segment of wallSegments) {
        const nearDx = segment.position[0] - playerWorldX;
        const nearDz = segment.position[2] - playerWorldZ;
        if (Math.hypot(nearDx, nearDz) > CELL_SIZE * GRAFFITI_RANGE) continue;

        boxCenter.set(segment.position[0], segment.position[1], segment.position[2]);
        const segAlongX = segment.size[0] > segment.size[2];
        boxSize.set(
          segment.size[0] + (segAlongX ? WALL_THICKNESS : 0),
          segment.size[1],
          segment.size[2] + (segAlongX ? 0 : WALL_THICKNESS),
        );
        box.setFromCenterAndSize(boxCenter, boxSize);

        if (raycaster.ray.intersectBox(box, hitPoint)) {
          const distance = hitPoint.distanceTo(raycaster.ray.origin);
          if (distance < bestDistance) {
            bestDistance = distance;
            const [u, v, side] = hitToWallUv(segment, hitPoint);
            best = { key: segment.key, u, v, side };
          }
        }
      }

      return best;
    };

    const publishPreview = () => {
      const active = drawingRef.current;
      setPreview(
        active
          ? {
              id: "__preview__",
              wallKey: active.wallKey,
              sessionId: currentSessionId ?? "",
              eraser: active.eraser,
              side: active.side,
              points: active.points.slice(),
            }
          : null,
      );
    };

    const finalizeStroke = () => {
      const active = drawingRef.current;
      drawingRef.current = null;
      publishPreview();
      if (!active || active.points.length < 2) return;

      room.send("drawStroke", {
        wallKey: active.wallKey,
        points: active.points,
        eraser: active.eraser,
        side: active.side,
      });

      // playSound("spray");

      // Keep it visible locally until the server echoes it back, so it doesn't blink
      pendingCounterRef.current += 1;
      const pendingId = `pending-${pendingCounterRef.current}`;
      setPendingStrokes((prev) => [
        ...prev,
        {
          id: pendingId,
          wallKey: active.wallKey,
          sessionId: currentSessionId ?? "",
          eraser: active.eraser,
          side: active.side,
          points: active.points.slice(),
        },
      ]);
      window.setTimeout(() => {
        setPendingStrokes((prev) => prev.filter((stroke) => stroke.id !== pendingId));
      }, GRAFFITI_PENDING_MS);
    };

    // The mirrored back face needs its u flipped so strokes land where you aim
    const storedU = (u: number, side: number) => (side === -1 ? 1 - u : u);

    const appendPoint = (hit: { key: string; u: number; v: number; side: number }) => {
      const active = drawingRef.current;
      if (!active) return;

      if (active.wallKey !== hit.key || active.side !== hit.side) {
        // dragged onto a different wall or around to the other face -
        // finish this stroke and start a new one there
        const eraser = active.eraser;
        finalizeStroke();
        drawingRef.current = {
          wallKey: hit.key,
          side: hit.side,
          eraser,
          points: [storedU(hit.u, hit.side), hit.v],
        };
        publishPreview();
        return;
      }

      const u = storedU(hit.u, active.side);
      const count = active.points.length;
      const du = u - active.points[count - 2];
      const dv = hit.v - active.points[count - 1];
      if (Math.hypot(du, dv) < GRAFFITI_MIN_POINT_DISTANCE) return;

      active.points.push(u, hit.v);
      if (active.points.length >= GRAFFITI_MAX_POINTS * 2) {
        // long drag - send this chunk and keep drawing seamlessly from the same point
        const eraser = active.eraser;
        const wall = active.wallKey;
        const side = active.side;
        finalizeStroke();
        drawingRef.current = { wallKey: wall, side, eraser, points: [u, hit.v] };
      }
      publishPreview();
    };

    const handleMouseDown = (event: MouseEvent) => {
      const draw = event.button === 0;
      const erase = event.button === 2;
      if (!draw && !erase) return;

      const hit = castAtWalls(event);
      if (!hit) return;

      drawingRef.current = {
        wallKey: hit.key,
        side: hit.side,
        eraser: erase,
        points: [storedU(hit.u, hit.side), hit.v],
      };
      publishPreview();
      playLoop("draw");
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!drawingRef.current) return;
      if (firstPersonRef.current && document.pointerLockElement === canvas) return; // FP samples per-frame instead
      const hit = castAtWalls(event);
      if (hit) appendPoint(hit);
    };

    const handleMouseUp = () => {
      stopLoop("draw");
      finalizeStroke();
    }
    const handleContextMenu = (event: Event) => event.preventDefault();

    // In first person the crosshair is fixed at screen center, so sample the aim
    // point continuously while the button is held (the view moves, not the cursor)
    let frameId = 0;
    const sampleWhileDrawingFp = () => {
      frameId = requestAnimationFrame(sampleWhileDrawingFp);
      if (!drawingRef.current) return;
      if (!firstPersonRef.current || document.pointerLockElement !== canvas) return;
      const hit = castAtWalls();
      if (hit) appendPoint(hit);
    };
    frameId = requestAnimationFrame(sampleWhileDrawingFp);

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("contextmenu", handleContextMenu);
    return () => {
      cancelAnimationFrame(frameId);
      drawingRef.current = null;
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [camera, currentSessionId, gl, gridHeight, gridWidth, room, wallSegments]);

  useEffect(() => {
    if (!room) return;

    const unsubscribe = room.onMessage<{ x: number; y: number }>("positionRejected", (position) => {
      if (typeof position.x !== "number" || typeof position.y !== "number") return;

      localPositionRef.current.x = position.x;
      localPositionRef.current.y = position.y;
      lastSentPositionRef.current.x = position.x;
      lastSentPositionRef.current.y = position.y;
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [room]);

  useEffect(() => {
    if (!room) return;

    const unsubscribe = room.onMessage("leverWrongPull", () => {
      setLeverWrongPullKey((key) => key + 1);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [room]);

  useEffect(() => {
    if (!currentPlayer) return;

    const mazeSignature = `${seed}:${gridWidth}:${gridHeight}:${startX}:${startY}:${exitX}:${exitY}:${mazeWalls.length}`;
    const mazeChanged = mazeSignature !== lastMazeSignatureRef.current;

    if (mazeChanged) {
      localPositionRef.current.x = currentPlayer.x;
      localPositionRef.current.y = currentPlayer.y;
      lastSentPositionRef.current.x = currentPlayer.x;
      lastSentPositionRef.current.y = currentPlayer.y;
    }

    lastMazeSignatureRef.current = mazeSignature;
  }, [
    currentPlayer?.x,
    currentPlayer?.y,
    exitX,
    exitY,
    gridHeight,
    gridWidth,
    mazeWalls.length,
    seed,
    startX,
    startY,
  ]);

  useFrame((state, delta) => {
    if (disabledRef.current) return;

    compassYawRef.current = firstPersonRef.current ? fpYawRef.current : null;

    if (leverInRangeRef) {
      const { x: px, y: py } = localPositionRef.current;
      const { cellX, cellY, wallDir } = leverPositionsRef.current;
      leverInRangeRef.current =
        obstacleType === "levers" &&
        findFacingLeverIndex(px, py, fpYawRef.current, cellX, cellY, wallDir) !== -1;
    }

    if (!room || !currentPlayer || !hasMaze || countdown > 0) return;

    const pressed = pressedKeysRef.current;
    const forward =
      (CONTROL_CODES.up.some((code) => pressed.has(code)) ? 1 : 0) +
      (CONTROL_CODES.down.some((code) => pressed.has(code)) ? -1 : 0);
    const right =
      (CONTROL_CODES.right.some((code) => pressed.has(code)) ? 1 : 0) +
      (CONTROL_CODES.left.some((code) => pressed.has(code)) ? -1 : 0);
    const moving = forward !== 0 || right !== 0;

    if (moving) {
      let moveX = 0;
      let moveY = 0;

      if (firstPersonRef.current) {
        // First person: mouse looks, W/S move along facing, A/D strafe
        const sinYaw = Math.sin(fpYawRef.current);
        const cosYaw = Math.cos(fpYawRef.current);
        moveX = sinYaw * forward - cosYaw * right;
        moveY = cosYaw * forward + sinYaw * right;
      } else {
        // Overhead: move relative to the fixed camera angle (original behavior)
        const forwardX = -Math.sin(CAM_ANGLE);
        const forwardY = -Math.cos(CAM_ANGLE);
        const rightX = -forwardY;
        const rightY = forwardX;
        moveX = forwardX * forward + rightX * right;
        moveY = forwardY * forward + rightY * right;
      }
      const length = Math.hypot(moveX, moveY);

      if (length > 0) {
        moveX /= length;
        moveY /= length;

        const sprinting = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
        const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
        const stepX = moveX * speed * Math.min(delta, 0.05);
        const stepY = moveY * speed * Math.min(delta, 0.05);
        const nextX = localPositionRef.current.x + stepX;
        const nextY = localPositionRef.current.y + stepY;

        if (noclipRef.current) {
          // Dev noclip: ignore walls, just stay inside the board
          const pad = -0.5 + PLAYER_RADIUS;
          localPositionRef.current.x = Math.max(pad, Math.min(gridWidth - 0.5 - PLAYER_RADIUS, nextX));
          localPositionRef.current.y = Math.max(pad, Math.min(gridHeight - 0.5 - PLAYER_RADIUS, nextY));
        } else {
          if (canOccupy(nextX, localPositionRef.current.y)) {
            localPositionRef.current.x = nextX;
          }
          if (canOccupy(localPositionRef.current.x, nextY)) {
            localPositionRef.current.y = nextY;
          }
        }
      }
    }

    const elapsedSinceSend = state.clock.elapsedTime - lastSentAtRef.current;
    const movedSinceSend = Math.hypot(
      localPositionRef.current.x - lastSentPositionRef.current.x,
      localPositionRef.current.y - lastSentPositionRef.current.y,
    );

    if (elapsedSinceSend >= POSITION_SEND_INTERVAL && (moving || movedSinceSend > 0.01)) {
      const x = Math.round(localPositionRef.current.x * 1000) / 1000;
      const y = Math.round(localPositionRef.current.y * 1000) / 1000;

      room.send("position", { x, y });
      lastSentAtRef.current = state.clock.elapsedTime;
      lastSentPositionRef.current.x = localPositionRef.current.x;
      lastSentPositionRef.current.y = localPositionRef.current.y;
    }
  });

  if (!hasMaze) return null;

  return (
    <>
      <MazeCamera
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        target={[followWorldX, followWorldZ]}
        targetRef={currentPlayer ? localPositionRef : undefined}
        firstPersonRef={firstPersonRef}
        fpYawRef={fpYawRef}
        fpPitchRef={fpPitchRef}
      />
      <FpCrosshair firstPersonRef={firstPersonRef} />
      <MazeSky radius={Math.max(60, gridSpan * 2.6)} />
      <fog attach="fog" args={["#030712", 20, 62]} />

      <hemisphereLight args={["#6d94de", "#01030a", 0.13]} />
      <ambientLight color="#496aa8" intensity={0.035} />
      <directionalLight
        position={[-8, 12, -10]}
        color="#6f96dc"
        intensity={0.12}
        castShadow
      />
      {exitUnlocked && (
        <pointLight position={[exitWorldX, 2.4, exitWorldZ]} color="#facc15" intensity={2.2 + playersAtExit * 1.5} distance={8 + playersAtExit * 2} />
      )}

      <group>
        <MazeFloor width={boardWidth + WALL_THICKNESS} depth={boardDepth + WALL_THICKNESS} />

        <gridHelper args={[gridSpan, Math.max(gridWidth, gridHeight), "#1f9af0", "#172033"]} position={[0, 0.02, 0]} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[startWorldX, 0.04, startWorldZ]}>
          <ringGeometry args={[0.28, 0.54, 36]} />
          <meshBasicMaterial color="#38f8b6" transparent opacity={0.72} side={THREE.DoubleSide} />
        </mesh>

        {/* barrier wall — sits at the exit and blocks it until the obstacle is solved */}
        {!exitUnlocked && (
          <ExitBarrier
            exitWorldX={exitWorldX}
            exitWorldZ={exitWorldZ}
            wallHeight={WALL_HEIGHT}
            cellSize={CELL_SIZE}
          />
        )}

        {exitUnlocked && (
          <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[exitWorldX, 0.05, exitWorldZ]}>
              <ringGeometry args={[0.32, 0.7, 44]} />
              <meshBasicMaterial color="#facc15" transparent opacity={0.88} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[exitWorldX, 0.28, exitWorldZ]}>
              <octahedronGeometry args={[0.38, 0]} />
              <meshStandardMaterial color="#facc15" emissive="#f59e0b" emissiveIntensity={0.7} roughness={0.28} />
            </mesh>
          </>
        )}

        {wallSegments.map((wall) => {
          const quadrant = (wall.position[0] >= 0 ? 1 : 0) + (wall.position[2] >= 0 ? 2 : 0);
          const [wallColor, wallEmissive] = QUADRANT_WALL_COLORS[quadrant];
          // Collinear neighbor walls overlap slightly at corners; where two quadrant
          // colors meet, their coplanar faces z-fight. A tiny per-quadrant thickness
          // difference (up to ~12mm in game units) separates the faces invisibly.
          const alongX = wall.size[0] > wall.size[2];
          const thickness = (alongX ? wall.size[2] : wall.size[0]) + (USE_CUSTOM_WALL_MODELS ? 0 : quadrant * 0.004);
          const adjustedSize: [number, number, number] = alongX
            ? [wall.size[0], wall.size[1], thickness]
            : [thickness, wall.size[1], wall.size[2]];
          return (
            <MazeWallPiece
              key={wall.key}
              position={wall.position}
              size={adjustedSize}
              wallVariant={quadrant}
              color={wallColor}
              emissive={wallEmissive}
            />
          );
        })}

        {/* Shared freeform graffiti, one drawing surface per wall that has strokes (or that
            the local player is actively drawing the very first mark on) */}
        {Array.from(
          new Set([
            ...confirmedStrokesByWall.keys(),
            ...(preview ? [preview.wallKey] : []),
          ]),
        ).map((wallKey) => {
          const segment = wallSegmentByKey.get(wallKey);
          if (!segment) return null;
          return (
            <GraffitiWall
              key={wallKey}
              segment={segment}
              strokes={confirmedStrokesByWall.get(wallKey) ?? []}
              previewStroke={preview && preview.wallKey === wallKey ? preview : null}
              colorForSession={colorForSession}
            />
          );
        })}

        <MazeCollectibles
          collectibles={collectibles}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          localPositionRef={localPositionRef}
          room={room}
          onCollection={() => playSound("collect")}
          seed={seed}
        />

        {orderedPlayers.map(([sessionId, player]) => (
          <PlayerToken
            key={sessionId}
            player={player}
            index={player.slot}
            isMe={sessionId === currentSessionId}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            localPositionRef={sessionId === currentSessionId ? localPositionRef : undefined}
            firstPersonRef={firstPersonRef}
            fpYawRef={sessionId === currentSessionId ? fpYawRef : undefined}
            fpPitchRef={sessionId === currentSessionId ? fpPitchRef : undefined}
          />
        ))}

        {(obstacleType === "pressurePlates" || obstacleType === "keys") && (
          <PressurePlates
            plates={[
              { gridX: plate0X, gridY: plate0Y },
              { gridX: plate1X, gridY: plate1Y },
              { gridX: plate2X, gridY: plate2Y },
            ].filter(p => p.gridX >= 0)}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            players={players}
            pressurePlatesRequired={pressurePlatesRequired}
            obstacleType={obstacleType}
            keysCollectedMask={keysCollectedMask}
            onPlateActivated = {() => playSound("plate")}
          />
        )}

        {obstacleType === "levers" && (
          <Levers
            leverCellX={leverCellX}
            leverCellY={leverCellY}
            leverWallDir={leverWallDir}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            leversPulledInOrder={leversPulledInOrder}
            wrongPullKey={leverWrongPullKey}
            onWrongPull={() => playSound("error")}
          />
        )}

        {obstacleType === "keys" && (
          <Keys
            keys={[
              {gridX: key0X, gridY: key0Y},
              {gridX: key1X, gridY: key1Y},
              {gridX: key2X, gridY: key2Y},
            ]}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            players={players}
            localSessionId={currentSessionId ?? ""}
            keysRequired={keysRequired}
            keysCollectedMask={keysCollectedMask}
            onKeyCollected={(index) => room?.send("collectKey", {index})}
            onCollection={()=>playSound("key")}
          />
        )}
      </group>
    </>
  );
}