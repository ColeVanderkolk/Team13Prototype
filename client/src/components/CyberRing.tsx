import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function CyberRing({
  color = "#00ffcc",
  radius = 1,
  innerOnly = false,
  glowBoost = 1,
  ...props
}: { color?: string; radius?: number; innerOnly?: boolean; glowBoost?: number } & any) {
    const groupRef = useRef<THREE.Group>(null);

    // Outer Ring Lines
    // We'll use a custom shader to make a segmented, rotating ring
    const ringMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(color) },
                uTime: { value: 0 },
                uRadius: { value: 0.5 }, // UV-space radius base
                uInnerOnly: { value: innerOnly ? 1.0 : 0.0 },
                uGlowBoost: { value: glowBoost },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uInnerOnly;
        uniform float uGlowBoost;
        varying vec2 vUv;

        #define PI 3.14159265

        void main() {
            // Convert UV (0..1) to centered coords (-0.5 .. 0.5)
            vec2 center = vUv - 0.5;
            float dist = length(center);
            float angle = atan(center.y, center.x);

            // Ring width
            float ringWidth = 0.02;

            // Inner ring (always rendered)
            float r2 = 0.38;
            float alpha2 = 1.0 - smoothstep(ringWidth * 0.5, ringWidth * 0.5 + 0.01, abs(dist - r2));
            float segments2 = 4.0;
            float rot2 = angle - uTime * 0.8;
            float gap2 = smoothstep(0.0, 0.1, sin(rot2 * segments2));
            float ring2 = alpha2 * gap2;

            // Outer ring + scanner (only for full ring)
            float ring1 = 0.0;
            float scan = 0.0;
            if (uInnerOnly < 0.5) {
                float r = 0.45;
                float alpha = 1.0 - smoothstep(ringWidth, ringWidth + 0.01, abs(dist - r));
                float segments = 8.0;
                float rot = angle + uTime * 0.5;
                float gap = smoothstep(0.4, 0.5, sin(rot * segments));
                ring1 = alpha * gap;
                scan = smoothstep(0.0, 1.0, sin(angle + uTime * 0.75));
            }

            float finalAlpha = ring1 + ring2;
            vec3 finalColor = uColor * (1.0 + scan * 2.0) * uGlowBoost;

            if (finalAlpha < 0.01) discard;

            gl_FragColor = vec4(finalColor, finalAlpha * 0.8 * min(uGlowBoost, 1.35));
        }
      `
        });
    }, [color, innerOnly, glowBoost]);

    useFrame((state) => {
        if (ringMaterial) {
            ringMaterial.uniforms.uTime.value = state.clock.elapsedTime;
            ringMaterial.uniforms.uGlowBoost.value = glowBoost;
        }
        // Slight overall wobble
        if (groupRef.current) {
            groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
            groupRef.current.rotation.x = Math.PI / 2; // Lay flat on ground usually
        }
    });

    return (
        <group ref={groupRef} {...props}>
            {/* The Plane that holds the ring shader */}
            {/* Size is 2*radius because Plane is 1x1 by default but scaled up? No, provide size args. */}
            {/* We want the shader to cover the whole square area where the ring lives. */}
            <mesh rotation={[0, 0, 0]}>
                <planeGeometry args={[radius * 2, radius * 2]} />
                <primitive object={ringMaterial} attach="material" />
            </mesh>
        </group>
    );
}
