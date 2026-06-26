import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Galaxy({
    color = "#8e44ad",
    scale = 1,
    connected = false,
    ...props
}: {
    color?: string;
    scale?: number;
    connected?: boolean;
} & any) {
    // Create particles that spiral outward from cardinal directions
    // More particles when activated
    const particles = useMemo(() => {
        const count = connected ? 80 : 40;
        const items = [];
        const cardinalDirections = [
            { angle: 0, name: 'East' },           // +X
            { angle: Math.PI / 2, name: 'North' }, // +Z
            { angle: Math.PI, name: 'West' },      // -X
            { angle: Math.PI * 1.5, name: 'South' } // -Z
        ];

        for (let i = 0; i < count; i++) {
            // Pick a random cardinal direction
            const direction = cardinalDirections[Math.floor(Math.random() * 4)];
            const startAngle = direction.angle + (Math.random() - 0.5) * 0.3; // Small variation
            const startRadius = 0.25 + Math.random() * 0.1; // Start near the sphere
            const driftSpeed = 0.15 + Math.random() * 0.15; // How fast it drifts outward
            const spiralSpeed = 0.8 + Math.random() * 0.8; // How fast it spirals
            const size = 0.04 + Math.random() * 0.04;
            // Distribute spawn delays evenly across the lifetime for continuous generation
            const spawnDelay = -(i / count) * 1.0 + Math.random() * 0.1;

            items.push({
                startAngle,
                startRadius,
                driftSpeed,
                spiralSpeed,
                size,
                spawnDelay
            });
        }
        return items;
    }, [connected]);

    const particleRefs = useRef<(THREE.Mesh | null)[]>([]);

    // Multipliers when activated
    const driftScale = connected ? 1.5 : 1.0;
    const speedScale = connected ? 2.0 : 1.0;

    useFrame((state) => {
        const t = state.clock.elapsedTime;

        particles.forEach((p, i) => {
            const mesh = particleRefs.current[i];
            if (mesh) {
                const effectiveTime = Math.max(0, t - p.spawnDelay);

                // Distance increases over time (drift outward)
                const distance = p.startRadius + effectiveTime * p.driftSpeed * driftScale;

                // Angle changes over time (spiral)
                const currentAngle = p.startAngle + effectiveTime * p.spiralSpeed * speedScale;

                // Calculate position
                mesh.position.x = Math.cos(currentAngle) * distance;
                mesh.position.z = Math.sin(currentAngle) * distance;
                mesh.position.y = 0; // Flat spiral parallel to floor

                // Reset particles after 1 second
                const maxLifetime = 1.0;
                if (effectiveTime > maxLifetime) {
                    // Reset particle to start
                    p.spawnDelay = t;
                }

                // Gradually shrink particles over their lifetime
                const lifetimeProgress = Math.min(effectiveTime / maxLifetime, 1.0);
                const sizeScale = 1.0 - lifetimeProgress; // Goes from 1.0 to 0.0
                mesh.scale.setScalar(sizeScale);
            }
        });
    });

    const materialProps = {
        color: color,
        roughness: 0.3,
        metalness: 0.7,
        emissive: color,
        emissiveIntensity: connected ? 1 : 0.1
    };

    return (
        <group {...props} scale={scale}>
            <group>
                {/* Central sphere */}
                <mesh>
                    <sphereGeometry args={[0.2, 16, 16]} />
                    <meshStandardMaterial {...materialProps} emissiveIntensity={connected ? 1.2 : 0.2} />
                </mesh>

                {/* Orbiting particles */}
                {particles.map((p, i) => (
                    <mesh
                        key={i}
                        ref={(el) => { particleRefs.current[i] = el; }}
                    >
                        <sphereGeometry args={[p.size, 8, 8]} />
                        <meshStandardMaterial {...materialProps} />
                    </mesh>
                ))}
            </group>
        </group>
    );
}
