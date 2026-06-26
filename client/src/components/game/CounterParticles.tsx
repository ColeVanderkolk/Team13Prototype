import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

export interface CounterParticlesProps {
  /**
   * Change when the digit or GO flips — spikes `uBurst` so the field briefly “explodes” outward.
   */
  burstKey: number;
  /** Fragment loop count (32–128). Lower = faster. Default 88. */
  particleSteps?: number;
}

const vertexShader = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function buildFragmentShader(steps: number) {
  return `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uBurst;
uniform float uPulse;

#define PI 3.14159265358979323
#define STEPS ${steps}.0

float random(vec2 co) {
  highp float dt = dot(co.xy, vec2(12.9898, 78.233));
  highp float sn = mod(dt, 3.14);
  return fract(sin(sn) * 43758.5453);
}

void main() {
  vec3 acc = vec3(0.0);
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uvNorm = fragCoord / uResolution;
  vec2 uv = -0.5 + uvNorm;
  uv.x *= uResolution.x / uResolution.y;

  float burst = clamp(uBurst, 0.0, 1.0);
  float expand = 1.0 + burst * 2.2;

  for (float i = 0.0; i < STEPS; i += 1.0) {
    float fft1 = 0.22 + 0.78 * fract(sin(i * 17.413 + uTime * 0.55 + uPulse * 6.28) * 9134.2);
    fft1 *= 0.65 + 0.55 * burst;

    float r = fft1 * 0.5;
    float r1 = fft1 * 0.125 * random(vec2(uv + i * 0.01));
    float a = random(vec2(i + 0.7, i * 0.31)) * (PI * 2.0);

    vec2 center = vec2(cos(a), sin(a)) * r * expand;
    vec2 center2 = vec2(cos(a), sin(a)) * r1 * expand;

    float dist = length(uv - center);
    float dist2 = length(uv - center - center2);
    float brightness = 1.0 / pow(0.001 + dist * 350.0, 2.0);
    float brightness2 = 1.0 / pow(0.001 + dist2 * 500.0, 2.0);

    vec3 color = vec3(0.12 + fft1 * 0.42, 0.28 + fft1 * 0.38, 0.44 + fft1 * 0.52);
    vec3 col = color * brightness2 * fft1 * 2.0;
    col += color * brightness * fft1 * 1.5;
    acc += col;
  }

  float grid = smoothstep(
    sin(length(uv.y - 0.5) * (800.0 * length(uv.y + 0.5)))
      * sin(length(uv.x + 0.5) * (800.0 * length(uv.x - 0.5))),
    0.0,
    1.0
  );
  acc += acc * vec3(grid) * 0.6;

  acc = min(acc, vec3(4.5));
  gl_FragColor = vec4(acc * 0.55, 1.0);
}
`;
}

function ParticlePlane({ burstKey, particleSteps }: CounterParticlesProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const burstRef = useRef(0);
  const prevKeyRef = useRef<number | null>(null);

  const fragmentShader = useMemo(
    () => buildFragmentShader(Math.max(32, Math.min(128, particleSteps ?? 88))),
    [particleSteps],
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uBurst: { value: 0 },
      uPulse: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    if (prevKeyRef.current === null) {
      prevKeyRef.current = burstKey;
      return;
    }
    if (burstKey !== prevKeyRef.current) {
      prevKeyRef.current = burstKey;
      burstRef.current = 1;
    }
  }, [burstKey]);

  useFrame((state, delta) => {
    const mat = materialRef.current;
    const { gl } = state;
    if (!mat) return;

    mat.uniforms.uTime.value += delta;
    mat.uniforms.uResolution.value.set(gl.drawingBufferWidth, gl.drawingBufferHeight);
    mat.uniforms.uPulse.value = state.clock.elapsedTime * 0.4;

    burstRef.current = Math.max(0, burstRef.current - delta * 0.95);
    mat.uniforms.uBurst.value = burstRef.current;
  });

  return (
    <mesh frustumCulled={false} position={[0, 0, 0]}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function CounterParticlesScene(props: CounterParticlesProps) {
  return (
    <>
      <OrthographicCamera makeDefault position={[0, 0, 1]} zoom={1} left={-1} right={1} top={1} bottom={-1} near={0.01} far={2} />
      <ParticlePlane {...props} />
    </>
  );
}

/**
 * Shadertoy-style additive particle field (radial specks + grid modulation).
 * Transparent WebGL layer; stack HUD/text above with a higher z-index.
 */
export function CounterParticlesCanvas(props: CounterParticlesProps) {
  return (
    <Canvas
      className="h-full w-full touch-none"
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      }}
      frameloop="always"
      style={{ background: "transparent" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      }}
    >
      <CounterParticlesScene {...props} />
    </Canvas>
  );
}

/** Optional wrapper if you prefer a named “system” export. */
export function CounterParticles(props: CounterParticlesProps & { className?: string }): ReactNode {
  const { className, ...rest } = props;
  return (
    <div className={className ?? "pointer-events-none absolute inset-0"}>
      <CounterParticlesCanvas {...rest} />
    </div>
  );
}
