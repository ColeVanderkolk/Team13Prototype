import { useMemo } from 'react';
import * as THREE from 'three';
import { ThickEdges } from './OutlineMaterial';

export function Hand({
    color = "#ffd700",
    scale = 1,
    connected = false,
    ...props
}: {
    color?: string;
    scale?: number;
    connected?: boolean;
} & any) {
    // Material that glows when connected
    const material = useMemo(() => new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: connected ? 1 : 0
    }), [color, connected]);

    // Geometries for each part
    const palmGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.9, 0.2), []);
    const thumbGeometry = useMemo(() => new THREE.BoxGeometry(0.3, 0.6, 0.18), []);
    const indexGeometry = useMemo(() => new THREE.BoxGeometry(0.18, 0.7, 0.18), []);
    const middleGeometry = useMemo(() => new THREE.BoxGeometry(0.18, 0.85, 0.18), []);
    const ringGeometry = useMemo(() => new THREE.BoxGeometry(0.18, 0.75, 0.18), []);
    const pinkyGeometry = useMemo(() => new THREE.BoxGeometry(0.16, 0.5, 0.18), []);

    return (
        <group {...props} scale={scale} position={[0, -0.4, 0]}>
            <group rotation={[Math.PI / 2, 0, 0]}>
                {/* Palm: Flattened cube */}
                <group position={[0, 0, 0]}>
                    <mesh geometry={palmGeometry} material={material} />
                    <ThickEdges geometry={palmGeometry} />
                </group>

                {/* Thumb - Angled out to the right (if palm faces forward) */}
                <group position={[0.45, -0.2, 0]} rotation={[0, 0, -0.6]}>
                    <group position={[0.15, 0.2, 0]}>
                        <mesh geometry={thumbGeometry} material={material} />
                        <ThickEdges geometry={thumbGeometry} />
                    </group>
                </group>

                {/* Fingers - Index to Pinky */}
                {/* Index */}
                <group position={[0.3, 0.7, 0]}>
                    <mesh geometry={indexGeometry} material={material} />
                    <ThickEdges geometry={indexGeometry} />
                </group>
                {/* Middle */}
                <group position={[0.1, 0.8, 0]}>
                    <mesh geometry={middleGeometry} material={material} />
                    <ThickEdges geometry={middleGeometry} />
                </group>
                {/* Ring */}
                <group position={[-0.1, 0.75, 0]}>
                    <mesh geometry={ringGeometry} material={material} />
                    <ThickEdges geometry={ringGeometry} />
                </group>
                {/* Pinky */}
                <group position={[-0.3, 0.65, 0]}>
                    <mesh geometry={pinkyGeometry} material={material} />
                    <ThickEdges geometry={pinkyGeometry} />
                </group>
            </group>
        </group>
    );
}
