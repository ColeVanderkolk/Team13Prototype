import { useMemo } from 'react';
import * as THREE from 'three';

export function Compass({
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
        const shapes = [];

        // --- 1. The Central Star (8-pointed) ---
        const starShape = new THREE.Shape();
        const numPoints = 16; // 8 peaks + 8 valleys
        const step = (Math.PI * 2) / numPoints;

        const R_cardinal = 1.0;
        const R_inter = 0.45;
        const R_valley = 0.2;
        const R_hole = 0.15;

        // Start from North (Angle PI/2)
        // In loop: angle starts at 0 (East).
        // i=0 -> East (Cardinal)
        // i=1 -> Valley
        // i=2 -> NE (Inter)
        // ...

        for (let i = 0; i < numPoints; i++) {
            const angle = i * step;
            let r = R_valley;

            if (i % 4 === 0) {
                r = R_cardinal; // N, E, S, W
            } else if (i % 4 === 2) {
                r = R_inter;    // NE, SE, SW, NW
            }

            const x = r * Math.cos(angle);
            const y = r * Math.sin(angle);

            if (i === 0) {
                starShape.moveTo(x, y);
            } else {
                starShape.lineTo(x, y);
            }
        }
        starShape.closePath();

        // Central Hole
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, R_hole, 0, Math.PI * 2, true);
        starShape.holes.push(holePath);

        shapes.push(starShape);

        // --- 2. The Outer Ring Segments ---
        // 4 Segments, interrupted by Cardinal points.
        // Cardinal points are at 0, PI/2, PI, 3PI/2.
        // Gap size in radians.
        const gap = 0.25; // ~14 degrees half-width? total gap 0.5 rad (~28 deg)
        // Actually looking at image, gap is where the cardinal spike passes through.
        // The cardinal spike width at Ring Radius (0.7) is width/0.7.
        // Let's stick with a fixed angle gap.

        const R_ring_inner = 0.6;
        const R_ring_outer = 0.75;

        // We generate 4 arc shapes.
        // Quadrant 1 (NE): 0 to PI/2. Gap at ends.
        // Start: 0 + gap
        // End: PI/2 - gap

        const quadrants = [0, 1, 2, 3]; // E, N, W, S sectors? 
        // 0: East to North (0 to PI/2)
        // 1: North to West (PI/2 to PI)
        // 2: West to South (PI to 3PI/2)
        // 3: South to East (3PI/2 to 2PI)

        quadrants.forEach(q => {
            const startAngle = (q * Math.PI / 2) + gap;
            const endAngle = ((q + 1) * Math.PI / 2) - gap;

            const ringShape = new THREE.Shape();

            // Outer Arc
            ringShape.absarc(0, 0, R_ring_outer, startAngle, endAngle, false);

            // Line in (automatically handled by absarc if we move?)
            // We need to trace back on inner arc reversed

            // Inner Arc (drawn backwards)
            ringShape.absarc(0, 0, R_ring_inner, endAngle, startAngle, true);

            ringShape.closePath();
            shapes.push(ringShape);
        });

        // Extrude ALL shapes
        const extrudeSettings = {
            depth: 0.15,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.01,
            bevelSegments: 3
        };

        const geo = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
        geo.center(); // Center the geometry bounding box
        return geo;

    }, []);

    return (
        <group {...props} scale={scale}>
            {/* Orient upright if needed, but usually these lay flat on ground or spin upright 
                If we want it facing the camera (Z+), we should rotate it? 
                The shape is drawn in XY plane.
                If it spawns flat on floor, that's XZ plane.
                Existing collectibles seem to stand up.
                Let's rotate X by -PI/2? Or leave as is if they spin in Y.
                Actually, most shapes were XY. 
                Let's double check alignment.
            */}
            <mesh geometry={geometry}>
                <meshStandardMaterial
                    color={color}
                    roughness={0.25}
                    metalness={0.75}
                    emissive={color}
                    emissiveIntensity={connected ? 0.8 : 0.1}
                />
            </mesh>
        </group>
    );
}
