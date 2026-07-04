import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const WALL_MODEL_URL = (import.meta.env.VITE_MAZE_WALL_MODEL_URL || "").trim();
const PLAYER_MODEL_URL = (import.meta.env.VITE_MAZE_PLAYER_MODEL_URL || "").trim();

type Vec3 = [number, number, number];

function GltfModel({
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
}: {
  position: Vec3;
  size: Vec3;
}) {
  if (WALL_MODEL_URL) {
    return <GltfModel url={WALL_MODEL_URL} position={position} scale={size} />;
  }

  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color="#7dd3fc"
        emissive="#0ea5e9"
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
    <group>
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
