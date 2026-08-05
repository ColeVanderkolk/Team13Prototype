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
  const lastAttemptAtRef = useRef(0);
  const hasNotifiedRef = useRef(false);
  const [worldX, worldZ] = useMemo(
    () => cellToWorld(gridWidth, gridHeight, collectible.x, collectible.y),
    [collectible.x, collectible.y, gridHeight, gridWidth],
  );

  useEffect(() => {
    const instance = new CollectibleSimple(worldX, 0.5, worldZ);
    instance.addToScene(scene as any);
    instanceRef.current = instance;
    lastAttemptAtRef.current = 0;
    hasNotifiedRef.current = false;

    return () => {
      // real teardown — only fires when this component itself unmounts, which now only
      // happens on a level change (the parent keeps a stable per-level list), never on a
      // normal in-round pickup. collect() below never touches the scene graph on its own.
      instance.dispose(scene as any);
      instanceRef.current = null;
    };
  }, [scene, worldX, worldZ]);

  // server-confirmed collection — the ONLY thing that actually hides it. Reporting a pickup
  // and hiding it immediately client-side (instead of waiting for this) used to mean a
  // rejected pickup (e.g. the server's read on the player's position was a hair off from the
  // client's own, right at the pickup radius edge) left the item invisible forever with no
  // points ever awarded — nothing ever told the client its optimistic hide was wrong.
  useEffect(() => {
    if (!isCollected) return;
    instanceRef.current?.collect(scene as any);
    if (!hasNotifiedRef.current) {
      hasNotifiedRef.current = true;
      onCollection();
    }
  }, [isCollected, scene, onCollection]);

  useFrame((_state, delta) => {
    const instance = instanceRef.current;
    if (!instance || isCollected) return;

    instance.update(delta);

    const dx = localPositionRef.current.x - collectible.x;
    const dy = localPositionRef.current.y - collectible.y;
    const now = performance.now();
    // Retries every 250ms while in range and not yet confirmed, instead of a single one-shot
    // attempt - a rejected attempt (the same kind of transient position mismatch) would
    // otherwise never be retried, silently stranding the collectible forever even though
    // nothing hides it anymore. 250ms is frequent enough to feel instant, not so frequent it
    // floods the server with messages the whole time you're standing near an uncollected item.
    if (Math.hypot(dx, dy) < PICKUP_RADIUS && now - lastAttemptAtRef.current > 250) {
      lastAttemptAtRef.current = now;
      room?.send("collect", { id: collectible.id });
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
  const lastAttemptAtRef = useRef(0);
  const hasNotifiedRef = useRef(false);
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
    const now = performance.now();
    // retries every 250ms while in range instead of a single one-shot attempt - see the
    // matching comment in CollectibleSimpleObject above for why a one-shot attempt is risky.
    // onCollection (the pickup sound) only fires once regardless of how many attempts it
    // takes, so a rejected-then-retried pickup can't play the sound twice.
    if (Math.hypot(dx, dy) < PICKUP_RADIUS && now - lastAttemptAtRef.current > 250) {
      lastAttemptAtRef.current = now;
      room?.send("collect", { id: collectible.id });
      if (!hasNotifiedRef.current) {
        hasNotifiedRef.current = true;
        onCollection();
      }
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
