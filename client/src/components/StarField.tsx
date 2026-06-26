import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const StarField = () => {
  const pointsRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const count = 800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Random positions in a large volume, keeping them away from camera
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = -Math.random() * 15; // Z position between -5 and -20 (away from camera)

      // Random velocities for each particle
      velocities[i * 3] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.001;

      // Cyan/blue colors - brighter
      const brightness = Math.random() * 0.3 + 0.7;
      colors[i * 3] = brightness * 0.5; // R
      colors[i * 3 + 1] = brightness * 0.9; // G
      colors[i * 3 + 2] = brightness * 1.0; // B
    }

    return { positions, colors, velocities };
  }, []);

  useFrame(() => {
    if (pointsRef.current) {
      const posArray = pointsRef.current.geometry.attributes.position.array as Float32Array;

      for (let i = 0; i < particles.velocities.length / 3; i++) {
        // Update positions with velocities
        posArray[i * 3] += particles.velocities[i * 3];
        posArray[i * 3 + 1] += particles.velocities[i * 3 + 1];
        posArray[i * 3 + 2] += particles.velocities[i * 3 + 2];

        // Wrap around bounds
        if (Math.abs(posArray[i * 3]) > 10) posArray[i * 3] *= -1;
        if (Math.abs(posArray[i * 3 + 1]) > 10) posArray[i * 3 + 1] *= -1;
        if (posArray[i * 3 + 2] > -5 || posArray[i * 3 + 2] < -20) particles.velocities[i * 3 + 2] *= -1;
      }

      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.positions.length / 3}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particles.colors.length / 3}
          array={particles.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.075}
        vertexColors
        transparent
        opacity={1.0}
        sizeAttenuation={true}
        map={(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d')!;
          const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
          gradient.addColorStop(0, 'rgba(100, 200, 255, 1)');
          gradient.addColorStop(0.7, 'rgba(100, 200, 255, 1)');
          gradient.addColorStop(0.85, 'rgba(50, 150, 255, 0.5)');
          gradient.addColorStop(1, 'rgba(0, 100, 200, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 32, 32);
          const texture = new THREE.CanvasTexture(canvas);
          return texture;
        })()}
      />
    </points>
  );
};
