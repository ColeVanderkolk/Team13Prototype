import { useMemo } from 'react';
import * as THREE from 'three';

export function EquilateralTriangle({
    color = "#8e44ad",
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

        // Define one segment (the bottom side)
        // We make it a trapezoid to simulate the mitered corners with a gap

        const thickness = 0.12;
        const radius = 0.35; // Distance from center to middle of the segment

        // Y coordinates for the horizontal segment at the bottom
        const yInner = -radius + (thickness / 2);
        const yOuter = -radius - (thickness / 2);

        // X extent
        // For a perfect triangle, tan(60) = sqrt(3).
        // Let's create a pleasing gap.
        const lengthOuter = 0.45;
        const lengthInner = 0.30;

        // Draw Trapezoid centered on Y axis, at bottom
        shape.moveTo(-lengthOuter, yOuter);
        shape.lineTo(lengthOuter, yOuter);
        shape.lineTo(lengthInner, yInner);
        shape.lineTo(-lengthInner, yInner);
        shape.closePath();

        const extrudeSettings = {
            depth: 0.1,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.01,
            bevelSegments: 3
        };

        const segmentGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        segmentGeo.center(); // Center local coords

        // Now place 3 of them
        // We will do this by manipulating the buffer geometry or just returning one and rendering 3 meshes?
        // But the previous pattern (MysticSymbol) returned a dictionary of geometries or a single merged one?
        // Actually, merging is better for performance if we want a single mesh.
        // But rendering 3 meshes in the group is easier for React logic if they don't need to move independently.
        // Wait, 'geometry' in previous components usually returned a complex obj or a single geo.
        // Let's create one merged geometry for simplicity so it acts as one object.

        // Actually, let's keep it simple: return the single segment geometry 
        // and render it 3 times in the JSX with rotations. 
        // This is cheaper on memory (one geometry reused).

        // Adjust the segmentGeo to be in the correct "Bottom" position relative to origin (0,0) BEFORE centering?
        // Wait, if I use geo.center(), it moves the trapezoid to (0,0). I want it at (0, -radius).
        // Let's NOT center it completely, or re-translate it.

        const finalGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // The shape is already defined at the correct Y offset.
        // We just need to center the Z depth.
        finalGeo.translate(0, 0, -extrudeSettings.depth / 2);

        return finalGeo;
    }, []);

    const materialProps = {
        color: color,
        roughness: 0.3,
        metalness: 0.6,
        emissive: color,
        emissiveIntensity: connected ? 1 : 0
    };

    return (
        <group {...props} scale={scale}>
            {/* Segment 1: Bottom (0 deg) */}
            <mesh geometry={geometry}>
                <meshStandardMaterial {...materialProps} />
            </mesh>

            {/* Segment 2: Rotate 120 deg */}
            <mesh geometry={geometry} rotation={[0, 0, (2 * Math.PI) / 3]}>
                <meshStandardMaterial {...materialProps} />
            </mesh>

            {/* Segment 3: Rotate 240 deg */}
            <mesh geometry={geometry} rotation={[0, 0, (4 * Math.PI) / 3]}>
                <meshStandardMaterial {...materialProps} />
            </mesh>
        </group>
    );
}
