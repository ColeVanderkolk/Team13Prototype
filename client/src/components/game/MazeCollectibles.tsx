import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as Client from "colyseus.js";
// Reuse the teammate-built prototype class directly so its current spin/float/collect behavior stays intact.
import { CollectibleSimple } from "../../../../server/collectibles/CollectibleSimple.ts";

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
