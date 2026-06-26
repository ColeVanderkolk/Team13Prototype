import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface CameraIntroProps {
  isPlaying: boolean;
  onComplete: () => void;
  onSwitchToOrtho?: (zoom: number) => void;
  gridWidth: number;
  gridHeight: number;
  spacing?: number;
  targetPosition2D?: [number, number, number];
  targetLookAt?: [number, number, number];
}

export const CameraIntro = ({
  isPlaying,
  onComplete,
  onSwitchToOrtho,
  gridWidth,
  gridHeight,
  spacing = 2.5,
  targetPosition2D = [0, 30, 0.01],
  targetLookAt = [0, 0, 0]
}: CameraIntroProps) => {
  const { camera, size } = useThree();
  const animationProgress = useRef(0);
  const hasStarted = useRef(false);
  const hasCompleted = useRef(false);

  const targetPos = useRef(new THREE.Vector3(...targetPosition2D));
  const targetLook = useRef(new THREE.Vector3(...targetLookAt));

  // Starting orbit values
  const startRadius = useRef(0);
  const startHeight = useRef(0);
  const startAngle = useRef(0);

  useEffect(() => {
    if (isPlaying && !hasStarted.current) {
      hasStarted.current = true;
      hasCompleted.current = false;
      animationProgress.current = 0;

      // Start from a lower angled position
      const baseHeight = targetPos.current.y;
      startHeight.current = baseHeight * 0.5;
      startRadius.current = baseHeight * 1.5;
      startAngle.current = 0;

      const startX = Math.cos(startAngle.current) * startRadius.current;
      const startZ = Math.sin(startAngle.current) * startRadius.current;
      camera.position.set(startX, startHeight.current, startZ);
      camera.lookAt(0, 0, 0);
    }
  }, [isPlaying, camera]);

  useFrame((_state, delta) => {
    if (!isPlaying || hasCompleted.current) return;

    const duration = 3.0;
    animationProgress.current += delta / duration;

    if (animationProgress.current >= 1.0) {
      animationProgress.current = 1.0;
      hasCompleted.current = true;

      // Calculate ortho zoom to fit board in viewport
      const boardSize = Math.max(gridWidth, gridHeight) * spacing;
      const padding = 1.3;
      const orthoZoom = size.height / (boardSize * padding);

      camera.position.copy(targetPos.current);
      camera.lookAt(targetLook.current);

      if (onSwitchToOrtho) {
        onSwitchToOrtho(orthoZoom);
      }

      onComplete();
      return;
    }

    // Easing: easeInOutCubic
    const t = animationProgress.current;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Orbit 90 degrees while rising to top-down
    const orbitAmount = Math.PI / 2;
    const currentAngle = startAngle.current + orbitAmount * eased;

    // Radius shrinks to near-zero (top-down)
    const currentRadius = THREE.MathUtils.lerp(startRadius.current, 0.0, eased);
    // Height rises to final top-down height
    const currentHeight = THREE.MathUtils.lerp(startHeight.current, targetPos.current.y, eased);

    const x = Math.cos(currentAngle) * currentRadius;
    const z = Math.sin(currentAngle) * currentRadius + THREE.MathUtils.lerp(0, targetPos.current.z, eased);

    camera.position.set(x, currentHeight, z);
    camera.lookAt(targetLook.current);
  });

  return null;
};
