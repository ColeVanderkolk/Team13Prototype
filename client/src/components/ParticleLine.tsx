import { useMemo, useRef, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type ParticleLineProps = {
    p1: [number, number, number];
    p2: [number, number, number];
    color: string;
    particleCount?: number; // Kept for compatibility but unused
};

export function ParticleLine({ p1, p2, color }: ParticleLineProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const colorRef = useRef(color);
    colorRef.current = color;

    const { height, position, quaternion } = useMemo(() => {
        const start = new THREE.Vector3(...p1);
        const end = new THREE.Vector3(...p2);
        const dist = start.distanceTo(end);
        const pos = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

        // Cylinder default is Y-aligned. We rotate it to point from start to end.
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, direction);

        return { height: dist, position: pos, quaternion: quat };
    }, [p1, p2]);

    // Create uniforms once — color is synced every frame via useFrame
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uRepeats: { value: 1.0 },
        uDashSize: { value: 0.5 }
    }), []);

    // Update repeats based on height (length) to maintain consistent dash density
    useLayoutEffect(() => {
        uniforms.uRepeats.value = height * 4.0;
    }, [height, uniforms]);

    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uRepeats;
        varying vec2 vUv;

        void main() {
            // "Marching Ants" Effect
            // vUv.y corresponds to the length of the cylinder (0 to 1)
            
            // 1. Create a moving coordinate
            // Negative speed to move "forward" from p1 to p2? depends on rotation.
            float t = -uTime * 1.0; 
            
            // 2. Generate repeating pattern
            float progress = vUv.y * uRepeats + t;
            
            // 3. Hard edges for marching ants
            // fract(progress) goes 0..1
            // step(0.5, ...) makes it 0 or 1
            float dash = step(0.5, fract(progress));
            
            // 4. Alpha cut
            if (dash < 0.5) discard;
            
            // 5. Output Color
            // Add a slight emissive boost
            gl_FragColor = vec4(uColor * 0.4, 1.0);
        }
    `;

    useFrame((state) => {
        if (meshRef.current) {
            const mat = meshRef.current.material as THREE.ShaderMaterial;
            mat.uniforms.uTime.value = state.clock.elapsedTime;
            mat.uniforms.uColor.value.set(colorRef.current);
        }
    });

    return (
        <mesh
            ref={meshRef}
            position={position}
            quaternion={quaternion}
        >
            {/* Thin cylinder */}
            <cylinderGeometry args={[0.04, 0.04, height, 6]} />
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}
