import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface PingEffectProps {
  position: [number, number, number];
  timestamp: number;
  color: string;
  onComplete: () => void;
}

export const PingEffect = ({ position, timestamp, color, onComplete }: PingEffectProps) => {
  const group = useRef<THREE.Group>(null);
  const hasCompleted = useRef(false);
  const duration = 2000; // 2 seconds

  useFrame(() => {
    if (!group.current || hasCompleted.current) return;

    const elapsed = Date.now() - timestamp;
    const progress = Math.min(elapsed / duration, 1);

    if (progress >= 1) {
      hasCompleted.current = true;
      onComplete();
      return;
    }

    // Update all three circles
    group.current.children.forEach((child, index) => {
      if (child instanceof THREE.Mesh) {
        const delay = index * 0.15; // Stagger each circle by 0.15s
        const adjustedProgress = Math.max(0, Math.min((progress - delay) / (1 - delay), 1));

        // Use lerp for smooth scale animation from 0.3 to 2.5
        const startScale = 0.3;
        const endScale = 2.5;
        const scale = THREE.MathUtils.lerp(startScale, endScale, adjustedProgress);
        child.scale.set(scale, scale, 1);

        // Use lerp for smooth opacity fade from 1 to 0
        if (child.material instanceof THREE.MeshBasicMaterial) {
          child.material.opacity = THREE.MathUtils.lerp(1, 0, adjustedProgress);
        }
      }
    });
  });

  return (
    <group ref={group} position={position}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 0.95, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={1}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};
