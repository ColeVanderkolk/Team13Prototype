import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, DoubleSide, type Mesh, type ShaderMaterial } from "three";

interface PulseRippleProps {
  position: [number, number, number];
  color?: string;
  /** Total on-board lifetime in seconds. */
  duration?: number;
  /** Max on-board radius in world units. */
  maxRadius?: number;
  onComplete: () => void;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Concentric sinusoidal-ring shader (from astraea-rift). Used for in-game
 * and tutorial pings — Bloom-friendly additive pulse.
 */
const fragmentShader = /* glsl */ `
  uniform float uAge;
  uniform float uFade;
  uniform vec3  uColor;
  varying vec2  vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float l = length(p);
    if (l > 1.0) discard;

    float wave = 1.6 * sin(l * 30.0 - 6.0 * uAge) + 0.4 / max(l, 0.001);
    float mask = smoothstep(2.4, 5.4, wave);

    vec3 rgb = uColor * (1.3 + mask * 0.9);
    float alpha = mask * uFade;
    gl_FragColor = vec4(rgb, alpha);
  }
`;

export const PulseRipple = ({
  position,
  color = "#ffffff",
  duration = 1.1,
  maxRadius = 2.4,
  onComplete,
}: PulseRippleProps) => {
  const meshRef = useRef<Mesh>(null);
  const matRef = useRef<ShaderMaterial>(null);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const uniforms = useMemo(
    () => ({
      uAge: { value: 0 },
      uFade: { value: 1 },
      uColor: { value: new Color(color) },
    }),
    [],
  );

  uniforms.uColor.value.set(color);

  useFrame((state) => {
    if (doneRef.current) return;
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const age = state.clock.elapsedTime - startRef.current;
    const t = age / duration;
    if (t >= 1) {
      doneRef.current = true;
      onComplete();
      return;
    }

    uniforms.uAge.value = age;

    const tailStart = 0.55;
    const fade = t < tailStart ? 1 : 1 - Math.pow((t - tailStart) / (1 - tailStart), 1.35);
    uniforms.uFade.value = Math.max(0, fade);

    const eased = 1 - Math.pow(1 - t, 2.6);
    const scale = maxRadius * (0.35 + eased * 1.05);
    mesh.scale.set(scale, scale, 1);
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
      />
    </mesh>
  );
};
