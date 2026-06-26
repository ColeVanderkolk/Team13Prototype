import { useMemo } from 'react';
import * as THREE from 'three';
import { ThickEdges } from './OutlineMaterial';

export function EquilibriumCube({
    color = "#8e44ad",
    scale = 1,
    connected = false,
    ...props
}: {
    color?: string;
    scale?: number;
    connected?: boolean;
} & any) {
    const geometry = useMemo(() => new THREE.BoxGeometry(0.6, 0.6, 0.6), []);

    return (
        <group {...props} scale={scale}>
            {/* Main mesh */}
            <mesh geometry={geometry}>
                <meshStandardMaterial
                    color={color}
                    roughness={0.3}
                    metalness={0.6}
                    emissive={color}
                    emissiveIntensity={connected ? 1 : 0}
                />
            </mesh>
            {/* Thick edge outline */}
            <ThickEdges geometry={geometry} />
        </group>
    );
}
