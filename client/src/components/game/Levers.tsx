import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GltfModel } from "./MazeModels";

// only the body is swappable — the handle and shape marker change color to signal game
// state (idle/solved/wrong-pull), so they stay procedural rather than a static custom model
const LEVER_BODY_MODEL_URL = (import.meta.env.VITE_LEVER_BODY_MODEL_URL || "").trim();

const CELL_SIZE = 1.8;
const WALL_NORTH = 1;
const WALL_EAST = 2;
const WALL_SOUTH = 4;
const WALL_WEST = 8;
const WALL_INSET = 0.8; // how far from the cell center the lever sits, toward the wall it's mounted on — the wall itself sits at 0.9, so this puts the lever flush against its inner face

function cellToWorld(gridWidth: number, gridHeight: number, x: number, y: number): [number, number] {
  return [
    (x - (gridWidth - 1) / 2) * CELL_SIZE,
    (y - (gridHeight - 1) / 2) * CELL_SIZE,
  ];
}

// side count marks a lever's position in the pull sequence: circle is 1st, hexagon is 6th.
// no numerals ever render here — position is read purely from the shape.
function buildShapeGeometry(position: number, radius: number) {
  if (position <= 1) return new THREE.CircleGeometry(radius, 28);

  if (position === 2) {
    // lens/2-sided: two curved edges meeting at sharp points — rotated 90° from a plain
    // vertical lens so it reads as an eye shape (pointed corners left/right, not top/bottom)
    const shape = new THREE.Shape();
    const halfWidth = radius * 0.8;
    shape.moveTo(0, radius);
    shape.quadraticCurveTo(halfWidth, 0, 0, -radius);
    shape.quadraticCurveTo(-halfWidth, 0, 0, radius);
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateZ(Math.PI / 2);
    return geometry;
  }

  if (position === 4) {
    return new THREE.PlaneGeometry(radius * 1.6, radius * 1.6);
  }

  const sides = position === 3 ? 3 : position === 5 ? 5 : 6;
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    // +90° start so the first vertex points up — Three.js's local Y axis points up, unlike SVG's
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / sides;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function directionInfo(wallDir: number) {
  if (wallDir === WALL_NORTH) return { offsetX: 0, offsetZ: -WALL_INSET, rotationY: 0 };
  if (wallDir === WALL_SOUTH) return { offsetX: 0, offsetZ: WALL_INSET, rotationY: Math.PI };
  if (wallDir === WALL_EAST) return { offsetX: WALL_INSET, offsetZ: 0, rotationY: -Math.PI / 2 };
  return { offsetX: -WALL_INSET, offsetZ: 0, rotationY: Math.PI / 2 }; // WALL_WEST
}

function SingleLever({
  worldX,
  worldZ,
  rotationY,
  position,
  isSolved,
  isFlashing,
}: {
  worldX: number;
  worldZ: number;
  rotationY: number;
  position: number; // 1-based required pull order, also the shape's side count
  isSolved: boolean; // already pulled correctly, in order
  isFlashing: boolean; // briefly true right after a wrong-order pull, on every lever at once
}) {
  const shapeGeometry = useMemo(() => buildShapeGeometry(position, 0.16), [position]);

  const shapeColor = isFlashing ? "#ff5a7a" : isSolved ? "#38f8b6" : "#facc15";
  const handleColor = isFlashing ? "#ff5a7a" : isSolved ? "#38f8b6" : "#5b6579";
  const isLit = isFlashing || isSolved;

  return (
    <group position={[worldX, 0, worldZ]} rotation={[0, rotationY, 0]}>
      {/* position shape, mounted above the lever on its own */}
      <mesh position={[0, 1.05, 0.02]} geometry={shapeGeometry}>
        <meshStandardMaterial
          color={shapeColor}
          emissive={shapeColor}
          emissiveIntensity={isFlashing ? 1 : isSolved ? 0.8 : 0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      {isLit && (
        <pointLight position={[0, 1.05, 0.15]} color={shapeColor} intensity={1.2} distance={2} />
      )}

      {/* body: a plain box flush against the wall */}
      {LEVER_BODY_MODEL_URL ? (
        <GltfModel url={LEVER_BODY_MODEL_URL} position={[0, 0.6, 0.045]} scale={[0.18, 0.5, 0.09]} />
      ) : (
        <mesh position={[0, 0.6, 0.045]} castShadow receiveShadow>
          <boxGeometry args={[0.18, 0.5, 0.09]} />
          <meshStandardMaterial color="#262b36" roughness={0.55} metalness={0.2} />
        </mesh>
      )}

      {/* handle: sits high (idle) sticking out past the body's sides, drops flush with the bottom once solved */}
      <mesh position={[0, isSolved ? 0.43 : 0.77, 0.1]} castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.14, 0.13]} />
        <meshStandardMaterial
          color={handleColor}
          emissive={isLit ? handleColor : "#000000"}
          emissiveIntensity={isFlashing ? 0.9 : isSolved ? 0.5 : 0}
          roughness={0.45}
          metalness={0.25}
        />
      </mesh>
    </group>
  );
}

type LeverPlacement = {
  cellX: number;
  cellY: number;
  wallDir: number;
};

type LeversProps = {
  leverCellX: number[];
  leverCellY: number[];
  leverWallDir: number[];
  gridWidth: number;
  gridHeight: number;
  leversPulledInOrder: number;
  wrongPullKey: number; // increments each time the server reports a wrong-order pull
};

// levers spawn scattered through the maze, each mounted on whatever wall the maze generator already placed there.
export function Levers({
  leverCellX,
  leverCellY,
  leverWallDir,
  gridWidth,
  gridHeight,
  leversPulledInOrder,
  wrongPullKey,
}: LeversProps) {
  const [isFlashing, setIsFlashing] = useState(false);
  const prevWrongPullKeyRef = useRef(wrongPullKey);

  useEffect(() => {
    if (wrongPullKey === prevWrongPullKeyRef.current) return;
    prevWrongPullKeyRef.current = wrongPullKey;

    setIsFlashing(true);
    const timeout = setTimeout(() => setIsFlashing(false), 350);
    return () => clearTimeout(timeout);
  }, [wrongPullKey]);

  const levers: LeverPlacement[] = leverCellX.map((cellX, index) => ({
    cellX,
    cellY: leverCellY[index],
    wallDir: leverWallDir[index],
  }));

  if (levers.length === 0) return null;

  return (
    <>
      {levers.map((lever, index) => {
        const [cellWorldX, cellWorldZ] = cellToWorld(gridWidth, gridHeight, lever.cellX, lever.cellY);
        const { offsetX, offsetZ, rotationY } = directionInfo(lever.wallDir);

        return (
          <SingleLever
            key={index}
            worldX={cellWorldX + offsetX}
            worldZ={cellWorldZ + offsetZ}
            rotationY={rotationY}
            position={index + 1}
            isSolved={index < leversPulledInOrder}
            isFlashing={isFlashing}
          />
        );
      })}
    </>
  );
}
