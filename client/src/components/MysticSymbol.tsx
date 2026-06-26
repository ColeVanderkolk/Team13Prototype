import { useMemo } from 'react';
import * as THREE from 'three';

export function MysticSymbol({
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
        const extrudeSettings = {
            depth: 0.2,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.02,
            bevelSegments: 3
        };

        // 1. Central Spiral (The "Question Mark" / Swirl)
        const spiralShape = new THREE.Shape();
        // Start slightly above bottom center
        spiralShape.moveTo(0.0, 0.2);
        // Stem going up
        spiralShape.quadraticCurveTo(0.05, 0.4, 0.0, 0.5);
        // Spiral head
        spiralShape.absarc(0.0, 0.6, 0.15, -Math.PI / 2, Math.PI * 1.2, false);
        // Inner line of spiral (simulated by making it a thick stroke? No, ExtrudeShape fills the shape. 
        // We need a closed shape representing the "ink".
        // Let's re-do: Define the OUTLINE of the spiral stroke.

        // Better Strategy: Composed of outlines.

        // SHAPE 1: Central Spiral Stroke
        const center = new THREE.Shape();
        center.moveTo(0, 0.2); // Bottom tip of center
        center.quadraticCurveTo(0.1, 0.5, 0, 0.7); // Up curve
        center.bezierCurveTo(-0.2, 0.8, -0.2, 0.5, 0, 0.5); // Loop head
        center.bezierCurveTo(0.05, 0.5, 0.05, 0.6, 0, 0.62); // Inner curl
        // Trace back down for thickness
        center.bezierCurveTo(-0.1, 0.6, -0.1, 0.75, 0, 0.82); // Outer head
        center.bezierCurveTo(0.3, 0.8, 0.3, 0.4, 0.15, 0.2); // Down curve thickness
        center.lineTo(0, 0.2); // Close

        // SHAPE 2: The Enclosing Petals (Diamond-ish)
        // Left Petal
        const leftPetal = new THREE.Shape();
        leftPetal.moveTo(0, 0.1); // Bottom center
        leftPetal.quadraticCurveTo(-0.4, 0.4, -0.1, 0.9); // Top tip (Inner curve)
        // Thickness
        leftPetal.lineTo(0.0, 1.0); // Top Peak
        leftPetal.quadraticCurveTo(-0.6, 0.4, -0.1, 0.05); // Outer curve to bottom
        leftPetal.lineTo(0, 0.1); // Close

        // Right Petal (Mirror of Left)
        const rightPetal = new THREE.Shape();
        rightPetal.moveTo(0, 0.1);
        rightPetal.quadraticCurveTo(0.4, 0.4, 0.1, 0.9);
        rightPetal.lineTo(0.0, 1.0);
        rightPetal.quadraticCurveTo(0.6, 0.4, 0.1, 0.05);
        rightPetal.lineTo(0, 0.1);

        // SHAPE 3: The Bottom Scrolls (Mustache)
        const leftScroll = new THREE.Shape();
        leftScroll.moveTo(-0.1, 0.15); // Connect to main body
        leftScroll.quadraticCurveTo(-0.4, 0.0, -0.5, 0.3); // Out and Up
        leftScroll.absarc(-0.55, 0.3, 0.1, 0, Math.PI * 2, false); // A little circle tip? Or just a curve
        // Let's try a thick curve
        const lsPath = new THREE.Shape();
        lsPath.moveTo(0, 0.0); // Extreme bottom tip
        lsPath.quadraticCurveTo(-0.3, 0.2, -0.6, 0.2); // Out
        lsPath.bezierCurveTo(-0.8, 0.2, -0.8, 0.5, -0.6, 0.4); // Curl up/in
        lsPath.quadraticCurveTo(-0.4, 0.3, -0.1, 0.15); // Return
        lsPath.lineTo(0, 0.0);

        const rightScroll = new THREE.Shape();
        rightScroll.moveTo(0, 0.0);
        rightScroll.quadraticCurveTo(0.3, 0.2, 0.6, 0.2);
        rightScroll.bezierCurveTo(0.8, 0.2, 0.8, 0.5, 0.6, 0.4);
        rightScroll.quadraticCurveTo(0.4, 0.3, 0.1, 0.15);
        rightScroll.lineTo(0, 0.0);

        // Create geometries
        const centerGeo = new THREE.ExtrudeGeometry(center, extrudeSettings);
        const petalsGeo = new THREE.ExtrudeGeometry([leftPetal, rightPetal], extrudeSettings);
        const scrollsGeo = new THREE.ExtrudeGeometry([lsPath, rightScroll], extrudeSettings);

        // Center geometry
        centerGeo.translate(0, -0.4, -extrudeSettings.depth / 2);
        petalsGeo.translate(0, -0.4, -extrudeSettings.depth / 2);
        scrollsGeo.translate(0, -0.4, -extrudeSettings.depth / 2);

        return { centerGeo, petalsGeo, scrollsGeo };
    }, []);

    return (
        <group {...props} scale={scale}>
            <mesh geometry={geometry.centerGeo}>
                <meshStandardMaterial
                    color={color}
                    roughness={0.3}
                    metalness={0.6}
                    emissive={color}
                    emissiveIntensity={connected ? 1 : 0}
                />
            </mesh>
            <mesh geometry={geometry.petalsGeo}>
                <meshStandardMaterial
                    color={color}
                    roughness={0.3}
                    metalness={0.6}
                    emissive={color}
                    emissiveIntensity={connected ? 1 : 0}
                />
            </mesh>
            <mesh geometry={geometry.scrollsGeo}>
                <meshStandardMaterial
                    color={color}
                    roughness={0.3}
                    metalness={0.6}
                    emissive={color}
                    emissiveIntensity={connected ? 1 : 0}
                />
            </mesh>
        </group>
    );
}
