import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { getPlayerPalette, toUpperId, type PlayerColorLower } from "@/constants/playerColors";
import { CyberRing } from "./CyberRing";

type PlayerProps = {
    color?: PlayerColorLower;
    position?: [number, number, number];
    rotation?: number; // Y-axis rotation in radians
    isMe?: boolean;
    /** Multiplier for the floor CyberRing glow (e.g. tutorial spotlight). */
    ringGlowBoost?: number;
};

export function Player({ color = "green", position = [0, 0, 0], rotation = 0, isMe = false, ringGlowBoost = 1 }: PlayerProps) {
    const groupRef = useRef<THREE.Group>(null);
    const meshRef = useRef<THREE.Mesh>(null);
    const isFirstFrame = useRef(true);

    const paletteHex = useMemo(() => {
        const p = getPlayerPalette(toUpperId(color));
        return { main: p.main, glow: p.glow, rim: p.rim };
    }, [color]);

    const colorPalette = useMemo(
        () => ({
            main: new THREE.Color(paletteHex.main),
            glow: new THREE.Color(paletteHex.glow),
            rim: new THREE.Color(paletteHex.rim),
        }),
        [paletteHex],
    );

    // Glass Shader for the Rounded Cube
    const glassMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: colorPalette.main },
                uRimColor: { value: colorPalette.rim },
                uTime: { value: 0 },
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform vec3 uRimColor;
                uniform float uTime;

                varying vec3 vNormal;
                varying vec3 vViewPosition;
                varying vec2 vUv;

                void main() {
                    vec3 normal = normalize(vNormal);
                    vec3 viewDir = normalize(vViewPosition);

                    // Fresnel effect
                    float fresnel = 1.0 - max(0.0, dot(normal, viewDir));
                    fresnel = pow(fresnel, 4.0);

                    vec3 col = mix(uColor * 0.4, uRimColor, fresnel);
                    float alpha = 0.7 + fresnel * 0.3;

                    gl_FragColor = vec4(col, alpha);
                }
            `,
            transparent: true,
            side: THREE.FrontSide,
            blending: THREE.NormalBlending,
            depthWrite: true,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
        });
    }, [colorPalette]);

    useFrame((state) => {
        const bobOffset = Math.sin(state.clock.elapsedTime * 0.5) * 0.15;

        // Smoothly lerp to target position and rotation
        if (groupRef.current) {
            if (isFirstFrame.current) {
                groupRef.current.position.set(position[0], position[1], position[2]);
                groupRef.current.rotation.y = rotation;
                isFirstFrame.current = false;
            } else {
                const lerpSpeed = 0.6;
                groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, position[0], lerpSpeed);
                groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, position[1], lerpSpeed);
                groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, position[2], lerpSpeed);

                // Smooth rotation lerp
                groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, rotation, lerpSpeed);
            }
        }

        if (meshRef.current) {
            meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
            meshRef.current.position.y = bobOffset;
            (meshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime;
        }
    });

    const geometry = useMemo(() => {
        if (color === "red") {
            return <sphereGeometry args={[0.6, 32, 32]} />;
        } else if (color === "blue") {
            // Tetrahedron rotated so one face is parallel to floor
            const tetraGeo = new THREE.TetrahedronGeometry(0.8, 0);
            tetraGeo.rotateY(Math.PI / 4);
            tetraGeo.rotateZ(Math.atan(Math.sqrt(2)));
            return <primitive object={tetraGeo} attach="geometry" />;
        } else {
            return <RoundedBox args={[1, 1, 1]} radius={0.25} smoothness={8} ref={meshRef as any}>
                <primitive object={glassMaterial} attach="material" />
            </RoundedBox>;
        }
    }, [color, glassMaterial]);

    return (
        <group ref={groupRef}>
            {color === "green" ? (
                geometry
            ) : (
                <mesh ref={meshRef} renderOrder={1}>
                    {geometry}
                    <primitive object={glassMaterial} attach="material" />
                </mesh>
            )}

            <CyberRing
                color={paletteHex.glow}
                radius={1.2}
                innerOnly={!isMe}
                glowBoost={ringGlowBoost}
                position={[0, -0.8, 0]}
                rotation={[-Math.PI / 2, 0, 0]} // Rotate to lay flat
            />
        </group >
    );
}
