import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getPlayerHex } from "@/constants/playerColors";

type EnemyPersonality = "red-avoiding" | "green-avoiding" | "blue-avoiding" | "same-color-avoiding" | "prismatic";

type EnemyEntityProps = {
    position?: [number, number, number];
    personality?: EnemyPersonality;
};

const INNER_SPHERE_COLOR: Partial<Record<EnemyPersonality, string>> = {
    "red-avoiding": getPlayerHex("RED"),
    "green-avoiding": getPlayerHex("GREEN"),
    "blue-avoiding": getPlayerHex("BLUE"),
    "prismatic": "#ffffff",
};

export function EnemyEntity({ position = [0, 0, 0], personality }: EnemyEntityProps) {
    const pointsRef = useRef<THREE.Points>(null);
    const sphereRef = useRef<THREE.Mesh>(null);
    const isFirstFrame = useRef(true);
    const innerColorHex = personality ? INNER_SPHERE_COLOR[personality] : undefined;
    // Track current and previous target for per-particle staggered lerp
    const currentTarget = useRef(new THREE.Vector3(...position));
    const prevTarget = useRef(new THREE.Vector3(...position));
    const moveStartTime = useRef(0);
    const moveDuration = 0.5; // seconds for full transition

    // Generate particles in a spherical distribution
    const particles = useMemo(() => {
        const count = 1000;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const randoms = new Float32Array(count * 3);
        const color1 = new THREE.Color("#cc0000");
        const color2 = new THREE.Color("#990022");
        const color3 = new THREE.Color("#bb2200");

        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 0.6 + (Math.random() * 0.15);

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            const mixRatio = Math.random();
            const finalColor = new THREE.Color().lerpColors(color1, color2, mixRatio);
            if (Math.random() > 0.8) finalColor.lerp(color3, 0.5);

            colors[i * 3] = finalColor.r;
            colors[i * 3 + 1] = finalColor.g;
            colors[i * 3 + 2] = finalColor.b;

            randoms[i * 3] = Math.random();
            randoms[i * 3 + 1] = Math.random();
            randoms[i * 3 + 2] = Math.random();

        }

        return { positions, colors, randoms };
    }, [personality]);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uPrevTarget: { value: new THREE.Vector3() },
        uCurrentTarget: { value: new THREE.Vector3() },
        uMoveStartTime: { value: 0 },
        uMoveDuration: { value: moveDuration },
    }), []);

    const vertexShader = `
    uniform float uTime;
    uniform float uPixelRatio;
    uniform vec3 uPrevTarget;
    uniform vec3 uCurrentTarget;
    uniform float uMoveStartTime;
    uniform float uMoveDuration;
    attribute vec3 aRandom;
    varying vec3 vColor;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 105.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
        vColor = color;
        // Spin local position around Y axis
        float angle = uTime * 0.3;
        float s = sin(angle);
        float c = cos(angle);
        vec3 newPos = vec3(
            position.x * c + position.z * s,
            position.y,
            -position.x * s + position.z * c
        );
        // Per-particle vertical oscillation
        newPos.y += sin(uTime * 4.0 + aRandom.x * 6.28) * 0.15;

        // Movement to new target
        float elapsed = uTime - uMoveStartTime;
        float t = clamp(elapsed / uMoveDuration, 0.0, 1.0);
        // Ease in-out cubic
        t = t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
        vec3 center = mix(uPrevTarget, uCurrentTarget, t);

        vec3 worldPos = newPos + center;

        vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = (150.0 * 0.55) / -mvPosition.z * uPixelRatio;
    }
    `;

    const fragmentShader = `
    varying vec3 vColor;

    void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha * 0.8);
    }
    `;

    useFrame((state) => {
        // Detect position change
        const targetVec = new THREE.Vector3(...position);
        if (!targetVec.equals(currentTarget.current)) {
            prevTarget.current.copy(currentTarget.current);
            currentTarget.current.copy(targetVec);
            moveStartTime.current = state.clock.elapsedTime;
        }

        // On first frame, snap everything
        if (isFirstFrame.current) {
            prevTarget.current.copy(targetVec);
            currentTarget.current.copy(targetVec);
            moveStartTime.current = state.clock.elapsedTime - moveDuration - 1;
            isFirstFrame.current = false;
        }

        if (pointsRef.current) {
            const material = pointsRef.current.material as THREE.ShaderMaterial;
            material.uniforms.uTime.value = state.clock.elapsedTime;
            material.uniforms.uPrevTarget.value.copy(prevTarget.current);
            material.uniforms.uCurrentTarget.value.copy(currentTarget.current);
            material.uniforms.uMoveStartTime.value = moveStartTime.current;
        }

        if (sphereRef.current) {
            const elapsed = state.clock.elapsedTime - moveStartTime.current;
            let t = Math.min(Math.max(elapsed / moveDuration, 0), 1);
            t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            sphereRef.current.position.lerpVectors(prevTarget.current, currentTarget.current, t);
        }
    });

    return (
        <>
            <points ref={pointsRef}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        count={particles.positions.length / 3}
                        array={particles.positions}
                        itemSize={3}
                    />
                    <bufferAttribute
                        attach="attributes-color"
                        count={particles.colors.length / 3}
                        array={particles.colors}
                        itemSize={3}
                    />
                    <bufferAttribute
                        attach="attributes-aRandom"
                        count={particles.randoms.length / 3}
                        array={particles.randoms}
                        itemSize={3}
                    />
                </bufferGeometry>
                <shaderMaterial
                    vertexShader={vertexShader}
                    fragmentShader={fragmentShader}
                    uniforms={uniforms}
                    vertexColors
                    transparent
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                />
            </points>
            {innerColorHex && (
                <mesh ref={sphereRef}>
                    <sphereGeometry args={[0.2, 16, 16]} />
                    <meshBasicMaterial color={innerColorHex} />
                </mesh>
            )}
        </>
    );
}
