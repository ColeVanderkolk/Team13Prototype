import { useMemo } from 'react';
import * as THREE from 'three';

export function CubeFrame({
    color = "#8e44ad",
    scale = 1,
    connected = false,
    ...props
}: {
    color?: string;
    scale?: number;
    connected?: boolean;
} & any) {
    const material = useMemo(() => new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.3,
        metalness: 0.7,
        emissive: color,
        emissiveIntensity: connected ? 1 : 0
    }), [color, connected]);

    const thickness = 0.1;
    const size = 1.0;
    const offset = (size - thickness) / 2;

    return (
        <group {...props} scale={scale}>
            {/* X Axis Bars (Top/Bottom, Front/Back) */}
            {/* MISSING: Top-Front [0, offset, offset] */}
            <mesh position={[0, offset, offset]} material={material}>
                <boxGeometry args={[size, thickness, thickness]} />
            </mesh>
            <mesh position={[0, offset, -offset]} material={material}>
                <boxGeometry args={[size, thickness, thickness]} />
            </mesh>
            <mesh position={[0, -offset, offset]} material={material}>
                <boxGeometry args={[size, thickness, thickness]} />
            </mesh>
            <mesh position={[0, -offset, -offset]} material={material}>
                <boxGeometry args={[size, thickness, thickness]} />
            </mesh>

            {/* Y Axis Bars (Vertical Pillars) */}
            <mesh position={[offset, 0, offset]} material={material}>
                <boxGeometry args={[thickness, size, thickness]} />
            </mesh>
            <mesh position={[offset, 0, -offset]} material={material}>
                <boxGeometry args={[thickness, size, thickness]} />
            </mesh>
            {/* MISSING: Front-Left [-offset, 0, offset] */}
            <mesh position={[-offset, 0, offset]} material={material}>
                <boxGeometry args={[thickness, size, thickness]} />
            </mesh>
            <mesh position={[-offset, 0, -offset]} material={material}>
                <boxGeometry args={[thickness, size, thickness]} />
            </mesh>

            {/* Z Axis Bars (Side Connectors) */}
            <mesh position={[offset, offset, 0]} material={material}>
                <boxGeometry args={[thickness, thickness, size]} />
            </mesh>
            <mesh position={[offset, -offset, 0]} material={material}>
                <boxGeometry args={[thickness, thickness, size]} />
            </mesh>
            {/* MISSING: Top-Left [-offset, offset, 0] */}
            <mesh position={[-offset, offset, 0]} material={material}>
                <boxGeometry args={[thickness, thickness, size]} />
            </mesh>
            <mesh position={[-offset, -offset, 0]} material={material}>
                <boxGeometry args={[thickness, thickness, size]} />
            </mesh>
        </group>
    );
}
