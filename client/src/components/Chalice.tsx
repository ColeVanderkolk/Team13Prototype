import { useMemo } from 'react';
import * as THREE from 'three';

export function Chalice({
    color = "#ffd700",
    scale = 1,
    connected = false,
    ...props
}: {
    color?: string;
    scale?: number;
    connected?: boolean;
} & any) {

    const geometry = useMemo(() => {
        // 1. Define the Bowl Shape (Main "U" shape)
        const bowlShape = new THREE.Shape();
        const radius = 0.5;
        const thickness = 0.1;
        const centerY = 0.5;

        // Outer semi-circle (top-right to top-left via bottom)
        // Start at top-right
        bowlShape.moveTo(radius, centerY);
        // Flat top bar
        bowlShape.lineTo(-radius, centerY);
        // Arc down-and-around to right (Counter-Clockwise)
        bowlShape.absarc(0, centerY, radius, Math.PI, 0, false);

        // Inner hollow (Hole)
        const holePath = new THREE.Path();
        const innerRadius = radius - thickness;
        // Start at inner top-right
        holePath.moveTo(innerRadius, centerY);
        // Inner arc down-and-around to left
        holePath.absarc(0, centerY, innerRadius, 0, Math.PI, true);
        // Close top of hole
        holePath.lineTo(innerRadius, centerY);

        bowlShape.holes.push(holePath);

        // 2. Define the Stem
        // Vertical rectangle centered at bottom of bowl
        const stemWidth = 0.1;
        const stemHeight = 0.5;
        const stemTopY = 0.0; // Bottom of bowl (approx 0, since center is 0.5 and radius 0.5)

        const stemShape = new THREE.Shape();
        stemShape.moveTo(-stemWidth / 2, stemTopY);
        stemShape.lineTo(stemWidth / 2, stemTopY);
        stemShape.lineTo(stemWidth / 2, stemTopY - stemHeight);
        stemShape.lineTo(-stemWidth / 2, stemTopY - stemHeight);
        stemShape.lineTo(-stemWidth / 2, stemTopY);

        // 3. Define the Base
        const baseWidth = 0.4;
        const baseHeight = 0.05;
        const baseTopY = stemTopY - stemHeight;

        const baseShape = new THREE.Shape();
        baseShape.moveTo(-baseWidth / 2, baseTopY);
        baseShape.lineTo(baseWidth / 2, baseTopY);
        baseShape.lineTo(baseWidth / 2, baseTopY - baseHeight);
        baseShape.lineTo(-baseWidth / 2, baseTopY - baseHeight);
        baseShape.lineTo(-baseWidth / 2, baseTopY);

        // Extrude Settings
        const extrudeSettings = {
            depth: 0.2, // Thickness of the extrusion
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.02,
            bevelSegments: 3,
            steps: 1
        };

        // Create geometries
        const bowlGeo = new THREE.ExtrudeGeometry(bowlShape, extrudeSettings);
        const stemGeo = new THREE.ExtrudeGeometry(stemShape, extrudeSettings);
        const baseGeo = new THREE.ExtrudeGeometry(baseShape, extrudeSettings);

        // Center geometry on Z-axis
        bowlGeo.translate(0, 0, -extrudeSettings.depth / 2);
        stemGeo.translate(0, 0, -extrudeSettings.depth / 2);
        baseGeo.translate(0, 0, -extrudeSettings.depth / 2);

        return { bowlGeo, stemGeo, baseGeo };
    }, []);

    return (
        <group {...props} scale={scale}>
            <mesh geometry={geometry.bowlGeo}>
                <meshStandardMaterial
                    color={color}
                    roughness={0.7}
                    metalness={0.3}
                    emissive={color}
                    emissiveIntensity={connected ? 1 : 0}
                />
            </mesh>
            <mesh geometry={geometry.stemGeo}>
                <meshStandardMaterial
                    color={color}
                    roughness={0.7}
                    metalness={0.3}
                    emissive={color}
                    emissiveIntensity={connected ? 1 : 0}
                />
            </mesh>
            <mesh geometry={geometry.baseGeo}>
                <meshStandardMaterial
                    color={color}
                    roughness={0.7}
                    metalness={0.3}
                    emissive={color}
                    emissiveIntensity={connected ? 1 : 0}
                />
            </mesh>
        </group>
    );
}
