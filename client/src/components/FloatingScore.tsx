import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface FloatingScoreProps {
  position: [number, number, number];
  score: number;
  timestamp: number;
  onComplete: () => void;
}

export const FloatingScore = ({ position, score, timestamp, onComplete }: FloatingScoreProps) => {
  const textRef = useRef<any>(null);
  const hasCompleted = useRef(false);
  const duration = 2000; // 2 seconds
  const startPosition = useRef(position);

  useFrame(() => {
    if (!textRef.current || hasCompleted.current) return;

    const elapsed = Date.now() - timestamp;
    const progress = Math.min(elapsed / duration, 1);

    if (progress >= 1) {
      hasCompleted.current = true;
      onComplete();
      return;
    }

    // Drift towards back of board (negative y in top-down view)
    const driftDistance = 2.0;
    const newY = THREE.MathUtils.lerp(startPosition.current[2], startPosition.current[2] - driftDistance, progress);
    textRef.current.position.set(startPosition.current[0], startPosition.current[1], newY);

    // Fade out opacity
    if (textRef.current.material) {
      textRef.current.material.opacity = THREE.MathUtils.lerp(1, 0, progress);
    }
  });

  const displayText = score > 0 ? `+${score}` : `${score}`;
  const textColor = score > 0 ? "white" : "#ff4444";

  return (
    <Text
      ref={textRef}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]} // Rotate to face upward for top-down view
      fontSize={0.5}
      color={textColor}
      anchorX="center"
      anchorY="middle"
      material-transparent={true}
      material-opacity={1}
    >
      {displayText}
    </Text>
  );
};
