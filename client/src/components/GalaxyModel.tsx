import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { getPlayerHex } from "@/constants/playerColors";

export function GalaxyModel({
    color = getPlayerHex("RED"),
    scale = 1,
    connected = false,
    ...props
}: {
    color?: string;
    scale?: number;
    connected?: boolean;
} & any) {
    const meshRef = useRef<THREE.Mesh>(null);

    const geometry = useMemo(() => {
        const shape = new THREE.Shape();

        // Parameters for the shuriken/galaxy shape
        const innerR = 0.18; // Hole radius
        const midR = 0.25;   // Hub radius
        const outerR = 0.75;  // Arm tip radius

        // Start at the first arm base
        shape.moveTo(midR, 0.1);

        // Loop 4 times for 4 arms
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2;
            const nextAngle = ((i + 1) * Math.PI) / 2;

            // Rotate coordinates for current arm
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // Tip of the arm
            const tipX = Math.cos(angle + 0.8) * outerR;
            const tipY = Math.sin(angle + 0.8) * outerR;

            // Control points for the outer curve
            const cp1X = Math.cos(angle + 0.4) * outerR * 0.8;
            const cp1Y = Math.sin(angle + 0.4) * outerR * 0.8;

            shape.quadraticCurveTo(cp1X, cp1Y, tipX, tipY);

            // Return to hub (next arm's base)
            const nextBaseX = Math.cos(nextAngle) * midR;
            const nextBaseY = Math.sin(nextAngle) * midR;

            const cp2X = Math.cos(angle + 0.6) * midR * 1.5;
            const cp2Y = Math.sin(angle + 0.6) * midR * 1.5;

            shape.quadraticCurveTo(cp2X, cp2Y, nextBaseX, nextBaseY);
        }

        // Add the central hole
        const hole = new THREE.Path();
        hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
        shape.holes.push(hole);

        const extrudeSettings = {
            depth: 0.15,
            bevelEnabled: true,
            bevelThickness: 0.04,
            bevelSize: 0.03,
            bevelSegments: 5
        };

        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.center(); // Center the geometry
        return geo;
    }, []);

    useFrame((state) => {
        if (meshRef.current) {
            // Subtle hover effect
            meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.05;
        }
    });

    const materialProps = {
        color: color,
        roughness: 0.2,
        metalness: 0.8,
        emissive: color,
        emissiveIntensity: connected ? 1.5 : 0.4
    };

    return (
        <group {...props} scale={scale}>
            <mesh ref={meshRef} geometry={geometry}>
                <meshStandardMaterial {...materialProps} />
            </mesh>

            {/* Inner core glow if connected */}
            {connected && (
                <mesh scale={0.4}>
                    <sphereGeometry args={[1, 32, 32]} />
                    <meshStandardMaterial
                        color={color}
                        emissive={color}
                        emissiveIntensity={2}
                        transparent
                        opacity={0.3}
                    />
                </mesh>
            )}
        </group>
    );
}
