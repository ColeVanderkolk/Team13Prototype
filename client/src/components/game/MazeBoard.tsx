import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as Client from "colyseus.js";
import * as THREE from "three";
import { MazeCollectibles } from "./MazeCollectibles";
import { MazePlayerAvatar, MazeWallPiece } from "./MazeModels";
import { PressurePlates } from "./PressurePlates";

const WALL_NORTH = 1;
const WALL_EAST = 2;
const WALL_SOUTH = 4;
const WALL_WEST = 8;
const ALL_WALLS = WALL_NORTH | WALL_EAST | WALL_SOUTH | WALL_WEST;

const CELL_SIZE = 1.8;
const WALL_THICKNESS = 0.18;
const WALL_HEIGHT = 1.35;
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
  pressurePlatesRequired: number;
  plate0X: number;
  plate0Y: number;
  plate1X: number;
  plate1Y: number;
  plate2X: number;
  plate2Y: number;
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
}: {
  gridWidth: number;
  gridHeight: number;
  target: [number, number];
  targetRef?: MutableRefObject<LocalPosition>;
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

function PlayerToken({
  player,
  index,
  isMe,
  gridWidth,
  gridHeight,
  localPositionRef,
}: {
  player: MazePlayer;
  index: number;
  isMe: boolean;
  gridWidth: number;
  gridHeight: number;
  localPositionRef?: MutableRefObject<LocalPosition>;
}) {
  const groupRef = useRef<THREE.Group>(null);
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

    if (moving) {
      const targetYaw = Math.atan2(moveX, moveZ);
      let deltaYaw = targetYaw - groupRef.current.rotation.y;
      while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      groupRef.current.rotation.y += deltaYaw * Math.min(1, 14 * delta);
    }
  });

  return (
    <group ref={groupRef} position={[target.x, target.y, target.z]}>
      <MazePlayerAvatar color={color} isMe={isMe} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <ringGeometry args={[0.54, 0.68, 40]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isMe ? 0.64 : 0.34}
          side={THREE.DoubleSide}
        />
      </mesh>
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
  pressurePlatesRequired,
  plate0X,
  plate0Y,
  plate1X,
  plate1Y,
  plate2X,
  plate2Y,
}: MazeBoardProps) {
  const hasMaze = gridWidth > 0 && gridHeight > 0 && mazeWalls.length === gridWidth * gridHeight;
  const boardWidth = gridWidth * CELL_SIZE;
  const boardDepth = gridHeight * CELL_SIZE;
  const gridSpan = Math.max(boardWidth, boardDepth);
  const [startWorldX, startWorldZ] = cellToWorld(gridWidth, gridHeight, startX, startY);
  const [exitWorldX, exitWorldZ] = cellToWorld(gridWidth, gridHeight, exitX, exitY);
  const currentPlayer = currentSessionId ? players.get(currentSessionId) : undefined;
  const localPositionRef = useRef<LocalPosition>({
    x: currentPlayer?.x ?? startX,
    y: currentPlayer?.y ?? startY,
  });
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const lastSentAtRef = useRef(0);
  const lastSentPositionRef = useRef<LocalPosition>({ x: Number.NaN, y: Number.NaN });
  const lastMazeSignatureRef = useRef("");

  const wallSegments = useMemo<WallSegment[]>(() => {
    if (!hasMaze) return [];

    const segments: WallSegment[] = [];

    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const mask = mazeWalls[mazeIndex(gridWidth, x, y)] ?? ALL_WALLS;
        const [worldX, worldZ] = cellToWorld(gridWidth, gridHeight, x, y);

        if ((mask & WALL_NORTH) !== 0) {
          segments.push({
            key: `${x}-${y}-n`,
            position: [worldX, WALL_HEIGHT / 2, worldZ - CELL_SIZE / 2],
            size: [CELL_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS],
          });
        }

        if ((mask & WALL_WEST) !== 0) {
          segments.push({
            key: `${x}-${y}-w`,
            position: [worldX - CELL_SIZE / 2, WALL_HEIGHT / 2, worldZ],
            size: [WALL_THICKNESS, WALL_HEIGHT, CELL_SIZE + WALL_THICKNESS],
          });
        }

        if (x === gridWidth - 1 && (mask & WALL_EAST) !== 0) {
          segments.push({
            key: `${x}-${y}-e`,
            position: [worldX + CELL_SIZE / 2, WALL_HEIGHT / 2, worldZ],
            size: [WALL_THICKNESS, WALL_HEIGHT, CELL_SIZE + WALL_THICKNESS],
          });
        }

        if (y === gridHeight - 1 && (mask & WALL_SOUTH) !== 0) {
          segments.push({
            key: `${x}-${y}-s`,
            position: [worldX, WALL_HEIGHT / 2, worldZ + CELL_SIZE / 2],
            size: [CELL_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS],
          });
        }
      }
    }

    return segments;
  }, [gridHeight, gridWidth, hasMaze, mazeWalls]);

  const orderedPlayers = useMemo(
    () => Array.from(players.entries()).sort(([a], [b]) => a.localeCompare(b)),
    [players],
  );
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

    return true;
  };

  useEffect(() => {
    const isControlKey = (event: KeyboardEvent) =>
      Object.values(CONTROL_CODES).some((codes) => codes.includes(event.code)) ||
      event.code === "ShiftLeft" ||
      event.code === "ShiftRight";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isControlKey(event)) return;
      event.preventDefault();
      pressedKeysRef.current.add(event.code);
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

    return () => {
      pressedKeysRef.current.clear();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

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
      const forwardX = -Math.sin(CAM_ANGLE);
      const forwardY = -Math.cos(CAM_ANGLE);
      const rightX = -forwardY;
      const rightY = forwardX;
      let moveX = forwardX * forward + rightX * right;
      let moveY = forwardY * forward + rightY * right;
      const length = Math.hypot(moveX, moveY);

      if (length > 0) {
        moveX /= length;
        moveY /= length;

        const sprinting = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
        const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
        const stepX = moveX * speed * Math.min(delta, 0.05);
        const stepY = moveY * speed * Math.min(delta, 0.05);
        const nextX = localPositionRef.current.x + stepX;

        if (canOccupy(nextX, localPositionRef.current.y)) {
          localPositionRef.current.x = nextX;
        }

        const nextY = localPositionRef.current.y + stepY;
        if (canOccupy(localPositionRef.current.x, nextY)) {
          localPositionRef.current.y = nextY;
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
      />
      <fog attach="fog" args={["#030712", 20, 62]} />

      <ambientLight intensity={0.72} />
      <directionalLight position={[8, 14, 10]} intensity={2.1} castShadow />
      {exitUnlocked && (
        <pointLight position={[exitWorldX, 2.4, exitWorldZ]} color="#facc15" intensity={2.2} distance={8} />
      )}

      <group>
        <mesh receiveShadow position={[0, -0.08, 0]}>
          <boxGeometry args={[boardWidth + WALL_THICKNESS, 0.12, boardDepth + WALL_THICKNESS]} />
          <meshStandardMaterial color="#111827" roughness={0.92} metalness={0.02} />
        </mesh>

        <gridHelper args={[gridSpan, Math.max(gridWidth, gridHeight), "#1f9af0", "#172033"]} position={[0, 0.02, 0]} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[startWorldX, 0.04, startWorldZ]}>
          <ringGeometry args={[0.28, 0.54, 36]} />
          <meshBasicMaterial color="#38f8b6" transparent opacity={0.72} side={THREE.DoubleSide} />
        </mesh>

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

        {wallSegments.map((wall) => <MazeWallPiece key={wall.key} position={wall.position} size={wall.size} />)}

        <MazeCollectibles
          collectibles={collectibles}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          localPositionRef={localPositionRef}
          room={room}
        />

        {orderedPlayers.map(([sessionId, player], index) => (
          <PlayerToken
            key={sessionId}
            player={player}
            index={index}
            isMe={sessionId === currentSessionId}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            localPositionRef={sessionId === currentSessionId ? localPositionRef : undefined}
          />
        ))}

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
        />
      </group>
    </>
  );
}
