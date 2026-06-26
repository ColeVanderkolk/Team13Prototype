import { useMemo } from 'react';
import * as THREE from 'three';
import { ThickEdges } from './OutlineMaterial';

export function LambdaSymbol({
    color = "#FFA500",
    scale = 1,
    connected = false,
    ...props
}: {
    color?: string;
    scale?: number;
    connected?: boolean;
} & any) {

    const geometry = useMemo(() => {
        const shape = new THREE.Shape();

        // Lambda Symbol (Λ) construction
        // Centered around Y axis

        // 1. Top Point
        shape.moveTo(0, 0.6);

        // 2. Bottom Right Outer
        shape.lineTo(0.45, -0.4);

        // 3. Bottom Right Inner (The leg thickness)
        shape.lineTo(0.3, -0.4);

        // 4. Inner Apex (The "crotch" of the lambda)
        shape.lineTo(0, 0.3);

        // 5. Bottom Left Inner
        shape.lineTo(-0.3, -0.4);

        // 6. Bottom Left Outer
        shape.lineTo(-0.45, -0.4);

        // Close the shape (back to Top Point)
        shape.lineTo(0, 0.6);

        const extrudeSettings = {
            depth: 0.15,
            bevelEnabled: true,
            bevelThickness: 0.03,
            bevelSize: 0.02,
            bevelOffset: 0,
            bevelSegments: 5
        };

        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // Center geometry on Z-axis specifically, and adjust Y if needed
        // The shape is roughly centered on X. Y is from -0.4 to 0.6 (height 1.0). Center Y is 0.1.
        // Let's center it perfectly.
        geo.center();

        return geo;
    }, []);

    return (
        <group {...props} scale={scale}>
            <group rotation={[-Math.PI / 2, 0, 0]}>
                {/* Main mesh */}
                <mesh geometry={geometry}>
                    <meshStandardMaterial
                        color={color}
                        roughness={0.2}
                        metalness={0.8}
                        emissive={color}
                        emissiveIntensity={connected ? 0.8 : 0.2}
                    />
                </mesh>
                {/* Thick edge outline */}
                <ThickEdges geometry={geometry} thresholdAngle={15} />
            </group>
        </group>
    );
}
