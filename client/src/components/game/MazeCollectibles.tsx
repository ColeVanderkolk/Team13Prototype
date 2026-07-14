import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as Client from "colyseus.js";
// Reuse the teammate-built prototype class directly so its current spin/float/collect behavior stays intact.
import { CollectibleSimple } from "../../../../server/collectibles/CollectibleSimple.ts";
import { useSounds } from "@/hooks/use-sounds";

const CELL_SIZE = 1.8;
const PICKUP_RADIUS = 0.5;

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
}: {
  collectible: MazeCollectible;
  gridWidth: number;
  gridHeight: number;
  localPositionRef: MutableRefObject<LocalPosition>;
  room: Client.Room | null;
}) {
  const { scene } = useThree();
  const { play: playSound } = useSounds();
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
      // Cleanup uses the prototype collect method so the object is removed the same way as in Amongusstyle.
      instance.collect(scene as any);
      instanceRef.current = null;
    };
  }, [scene, worldX, worldZ]);

  useFrame((_state, delta) => {
    const instance = instanceRef.current;
    if (!instance || instance.isCollected) return;

    instance.update(delta);

    const dx = localPositionRef.current.x - collectible.x;
    const dy = localPositionRef.current.y - collectible.y;
    if (!hasReportedRef.current && Math.hypot(dx, dy) < PICKUP_RADIUS) {
      // Algorithm: if the player enters the collectible pickup radius, trigger the reward sound once
      // and mark the collectible as collected so the event does not repeat on later frames.
      hasReportedRef.current = true;
      playSound("collectible");
      instance.collect(scene as any);
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
}: {
  collectibles: MazeCollectible[];
  gridWidth: number;
  gridHeight: number;
  localPositionRef: MutableRefObject<LocalPosition>;
  room: Client.Room | null;
}) {
  return (
    <>
      {collectibles.map((collectible) => (
        <CollectibleSimpleObject
          key={collectible.id}
          collectible={collectible}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          localPositionRef={localPositionRef}
          room={room}
        />
      ))}
    </>
  );
}
