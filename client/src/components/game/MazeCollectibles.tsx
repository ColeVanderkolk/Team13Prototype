import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type * as Client from "colyseus.js";
import { CollectibleSimple } from "./CollectibleSimple";

const CELL_SIZE = 1.8;
const PICKUP_RADIUS = 0.35; // tightened — matches SCORE_COLLECTIBLE_RADIUS on the server

interface MazeCollectible {
  x: number;
  y: number;
  id: string;
  score: number;
}

interface LocalPosition {
  x: number;
  y: number;
}

function cellToWorld(gridWidth: number, gridHeight: number, x: number, y: number): [number, number] {
  return [
    (x - (gridWidth - 1) / 2) * CELL_SIZE,
    (y - (gridHeight - 1) / 2) * CELL_SIZE,
  ];
}

function CollectibleSimpleObject({
  collectible,
  gridWidth,
  gridHeight,
  localPositionRef,
  room,
  onCollection,
  isCollected,
}: {
  collectible: MazeCollectible;
  gridWidth: number;
  gridHeight: number;
  localPositionRef: MutableRefObject<LocalPosition>;
  room: Client.Room | null;
  onCollection: () => void;
  isCollected: boolean; // server-confirmed — true once it's gone from the live list
}) {
  const { scene } = useThree();
  const instanceRef = useRef<CollectibleSimple | null>(null);
  const hasReportedRef = useRef(false);
  const [worldX, worldZ] = useMemo(
    () => cellToWorld(gridWidth, gridHeight, collectible.x, collectible.y),
    [collectible.x, collectible.y, gridHeight, gridWidth],
  );

  useEffect(() => {
    const instance = new CollectibleSimple(worldX, 0.5, worldZ);
    instance.addToScene(scene as any);
    instanceRef.current = instance;
    hasReportedRef.current = false;

    return () => {
      // real teardown — only fires when this component itself unmounts, which now only
      // happens on a level change (the parent keeps a stable per-level list), never on a
      // normal in-round pickup. collect() below never touches the scene graph on its own.
      instance.dispose(scene as any);
      instanceRef.current = null;
    };
  }, [scene, worldX, worldZ]);

  // server-confirmed collection — covers another player picking it up first, and is also
  // what actually lands our own pickup (the useFrame below already soft-collects it locally
  // for instant feedback, so this is mostly a no-op safety net for our own pickups)
  useEffect(() => {
    if (isCollected) instanceRef.current?.collect(scene as any);
  }, [isCollected, scene]);

  useFrame((_state, delta) => {
    const instance = instanceRef.current;
    if (!instance || instance.isCollected) return;

    instance.update(delta);

    const dx = localPositionRef.current.x - collectible.x;
    const dy = localPositionRef.current.y - collectible.y;
    if (!hasReportedRef.current && Math.hypot(dx, dy) < PICKUP_RADIUS) {
      hasReportedRef.current = true;
      instance.collect(scene as any);
      room?.send("collect", { id: collectible.id });
      onCollection();
    }
  });

  return null;
}

export function MazeCollectibles({
  collectibles,
  gridWidth,
  gridHeight,
  localPositionRef,
  room,
  onCollection,
  seed,
}: {
  collectibles: MazeCollectible[];
  gridWidth: number;
  gridHeight: number;
  localPositionRef: MutableRefObject<LocalPosition>;
  room: Client.Room | null;
  onCollection: () => void;
  seed: number;
}) {
  // The server sends this level's full collectible list, then shrinks it as things get
  // picked up. If we rendered directly off that shrinking list, a picked-up item's component
  // would unmount immediately — which forces a real scene.remove() (see dispose() above) and
  // the shader-recompile stutter that comes with it. Instead we snapshot the full per-level
  // list once (reset only when the level's seed changes) and keep every item's component
  // mounted for the whole level; collected items just sit there hidden and dark.
  const snapshotSeedRef = useRef<number | null>(null);
  const snapshotRef = useRef<MazeCollectible[]>([]);

  if (snapshotSeedRef.current !== seed) {
    snapshotSeedRef.current = seed;
    snapshotRef.current = collectibles;
  } else {
    for (const c of collectibles) {
      if (!snapshotRef.current.some((s) => s.id === c.id)) {
        snapshotRef.current = [...snapshotRef.current, c];
      }
    }
  }

  const liveIds = useMemo(() => new Set(collectibles.map((c) => c.id)), [collectibles]);

  return (
    <>
      {snapshotRef.current.map((collectible) => (
        <CollectibleSimpleObject
          key={collectible.id}
          collectible={collectible}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          localPositionRef={localPositionRef}
          room={room}
          onCollection={onCollection}
          isCollected={!liveIds.has(collectible.id)}
        />
      ))}
    </>
  );
}

// The secret bonus collectible - a light blue diamond, deliberately distinct from the gold
// box regular collectibles use so it reads as something different the moment you see it.
// Only ever 0 or 1 of these exist at a time (see superCollectibles on the server), so unlike
// MazeCollectibles above there's no need for the snapshot/hide-but-stay-mounted trick that
// avoids shader-recompile stutter - that only matters when many objects disappear often.
function SuperCollectibleObject({
  collectible,
  gridWidth,
  gridHeight,
  localPositionRef,
  room,
  onCollection,
}: {
  collectible: MazeCollectible;
  gridWidth: number;
  gridHeight: number;
  localPositionRef: MutableRefObject<LocalPosition>;
  room: Client.Room | null;
  onCollection: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const hasReportedRef = useRef(false);
  const floatTime = useRef(0);
  const [worldX, worldZ] = useMemo(
    () => cellToWorld(gridWidth, gridHeight, collectible.x, collectible.y),
    [collectible.x, collectible.y, gridHeight, gridWidth],
  );

  // shared base shape for both the transparent solid and its glowing outline below, so the
  // two can never drift out of sync with each other
  const geometry = useMemo(() => new THREE.OctahedronGeometry(0.32, 0), []);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  useEffect(
    () => () => {
      geometry.dispose();
      edgesGeometry.dispose();
    },
    [geometry, edgesGeometry],
  );

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    floatTime.current += delta;
    group.position.y = 0.55 + Math.sin(floatTime.current * 1.5) * 0.1;
    group.rotation.y += delta * 1.6;

    const dx = localPositionRef.current.x - collectible.x;
    const dy = localPositionRef.current.y - collectible.y;
    if (!hasReportedRef.current && Math.hypot(dx, dy) < PICKUP_RADIUS) {
      hasReportedRef.current = true;
      room?.send("collect", { id: collectible.id });
      onCollection();
    }
  });

  return (
    // narrower and taller than a plain octahedron - stretched vertically, pinched inward
    // horizontally, for a slimmer gem silhouette instead of the default symmetric shape
    <group ref={groupRef} position={[worldX, 0.55, worldZ]} scale={[0.65, 1.5, 0.65]}>
      {/* transparent glassy interior */}
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* bright outline traced along just the shape's real edges (not every internal
          triangle seam, which is what three.js's built-in wireframe mode draws) - combined
          with this scene's existing Bloom effect, that's what gives the glowing "Tron" look */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color="#bae6fd" />
      </lineSegments>
      <pointLight color="#7dd3fc" intensity={2.2} distance={3} />
    </group>
  );
}

export function SuperMazeCollectible({
  superCollectibles,
  gridWidth,
  gridHeight,
  localPositionRef,
  room,
  onCollection,
}: {
  superCollectibles: MazeCollectible[];
  gridWidth: number;
  gridHeight: number;
  localPositionRef: MutableRefObject<LocalPosition>;
  room: Client.Room | null;
  onCollection: () => void;
}) {
  return (
    <>
      {superCollectibles.map((collectible) => (
        <SuperCollectibleObject
          key={collectible.id}
          collectible={collectible}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          localPositionRef={localPositionRef}
          room={room}
          onCollection={onCollection}
        />
      ))}
    </>
  );
}
