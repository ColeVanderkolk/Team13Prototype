import { useMemo } from 'react';
import * as THREE from 'three';

// Outline color and thickness
export const OUTLINE_COLOR = '#000000';
export const OUTLINE_THICKNESS = 0.15;

// Shader material for inverted hull outline using uniform scaling
// This works better for angular shapes (boxes) viewed from specific angles
const createOutlineMaterial = (color: string, thickness: number, side: THREE.Side) => {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uThickness: { value: thickness },
        },
        vertexShader: `
            uniform float uThickness;
            void main() {
                // Scale uniformly from center - works better for angular shapes
                vec3 pos = position * (1.0 + uThickness);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            void main() {
                gl_FragColor = vec4(uColor, 1.0);
            }
        `,
        side: side,
    });
};

// React component for outline using inverted hull technique
// Renders both inner (-thickness) and outer (+thickness) for a solid outline
export function ThickEdges({
    geometry,
    color = OUTLINE_COLOR,
    thickness = OUTLINE_THICKNESS,
}: {
    geometry: THREE.BufferGeometry;
    color?: string;
    thickness?: number;
}) {
    const outerMaterial = useMemo(() => createOutlineMaterial(color, thickness, THREE.BackSide), [color, thickness]);
    const innerMaterial = useMemo(() => createOutlineMaterial(color, -thickness, THREE.FrontSide), [color, thickness]);

    return (
        <>
            <mesh geometry={geometry} material={outerMaterial} />
            <mesh geometry={geometry} material={innerMaterial} />
        </>
    );
}
