import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface NoiseBlobFieldProps {
  /** Scales output before additive blend (typical 0.04–0.2 for ambient). */
  intensity?: number;
  /** Multiplier inside shader (original 1.2). */
  brightness?: number;
  /** Falloff exponent (original 0.9). */
  blobiness?: number;
  /** Denominator for `limit = particles / particleLimitDivisor` (original 70). */
  particleLimitDivisor?: number;
  /** Step resolution for field sampling (original 140). */
  particles?: number;
  /** Time scale (original `1.0 * 0.75`). */
  energy?: number;
  /** When false, time stops — useful for demand-driven flashes (invalidate + short burst). */
  active?: boolean;
  /** Polar / ice tint (multiplies scalar field). */
  tint?: THREE.Vector3;
}

export type NoiseBlobFieldCanvasProps = NoiseBlobFieldProps & {
  /** Use `"demand"` + `invalidate()` from `@react-three/fiber` for score flashes; keeps GPU idle when idle. */
  frameloop?: "always" | "demand";
};

const vertexShader = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Matches original loop: i = 0 .. 1 step 0.025 → 41 samples. */
const LOOP_COUNT = 41;
const STEP_I = 1.0 / 40.0;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uIntensity;
uniform float uBrightness;
uniform float uBlobiness;
uniform float uParticles;
uniform float uLimitDivisor;
uniform float uEnergy;
uniform vec3 uTint;

#define LOOP_N ${LOOP_COUNT}

float noise(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float safeTan(float x) {
  return tan(clamp(x, -1.35, 1.35));
}

void main() {
  vec2 R = uResolution.xy;
  vec2 fragCoord = gl_FragCoord.xy;

  vec2 position = fragCoord.xy / R.x;
  vec2 center = vec2(0.5, 0.5 * (R.y / R.x));

  float t = uTime * uEnergy;
  float limit = uParticles / max(uLimitDivisor, 1.0);
  float stepN = 1.0 / max(uParticles, 1.0);
  float n = 0.0;

  float a = 0.0;
  float b = 0.0;
  float c = 0.0;

  for (int j = 0; j < LOOP_N; j++) {
    float i = float(j) * ${STEP_I.toFixed(6)};

    if (i <= limit) {
      vec2 np = vec2(n, 0.0);

      float na = noise(np * 1.1);
      float nb = noise(np * 2.8);
      float nc = noise(np * 0.7);
      float nd = noise(np * 3.2);

      vec2 pos = center;
      pos.x += sin(t * na) * cos(t * nb) * safeTan(t * na * 0.15) * 0.3;
      pos.y += safeTan(t * nc) * sin(t * nd) * 0.1;

      float d = pow(1.6 * na / max(length(pos - position), 1e-5), uBlobiness);

      if (i < limit * 0.3333) {
        a += d;
      } else if (i < limit * 0.5) {
        b += d;
      } else {
        c += d;
      }

      n += stepN;
    }
  }

  float amp = (a * 0.42 + b * 0.28 + c * 0.34) * 0.0001 * uBrightness;
  vec3 col = uTint * amp * uIntensity;
  float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

const DEFAULT_TINT = new THREE.Vector3(0.52, 0.82, 0.98);

function AmbientPlane({
  intensity = 0.09,
  brightness = 1.2,
  blobiness = 0.9,
  particleLimitDivisor = 70,
  particles = 140,
  energy = 0.75,
  active = true,
  tint,
}: NoiseBlobFieldProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uIntensity: { value: intensity },
      uBrightness: { value: brightness },
      uBlobiness: { value: blobiness },
      uParticles: { value: particles },
      uLimitDivisor: { value: particleLimitDivisor },
      uEnergy: { value: energy },
      uTint: { value: DEFAULT_TINT.clone() },
    }),
    [brightness, blobiness, energy, intensity, particleLimitDivisor, particles],
  );

  useFrame((state, delta) => {
    const mat = materialRef.current;
    const { gl } = state;
    if (!mat) return;
    if (active) {
      mat.uniforms.uTime.value += delta;
    }
    mat.uniforms.uResolution.value.set(gl.drawingBufferWidth, gl.drawingBufferHeight);
    mat.uniforms.uIntensity.value = intensity;
    mat.uniforms.uBrightness.value = brightness;
    mat.uniforms.uBlobiness.value = blobiness;
    mat.uniforms.uParticles.value = particles;
    mat.uniforms.uLimitDivisor.value = particleLimitDivisor;
    mat.uniforms.uEnergy.value = energy;
    const tc = tint ?? DEFAULT_TINT;
    mat.uniforms.uTint.value.set(tc.x, tc.y, tc.z);
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

function Scene(props: NoiseBlobFieldProps) {
  return (
    <>
      <OrthographicCamera makeDefault position={[0, 0, 1]} zoom={1} left={-1} right={1} top={1} bottom={-1} near={0.01} far={2} />
      <AmbientPlane {...props} />
    </>
  );
}

/**
 * Soft noise-driven “blob” field (polar-tinted by default). Additive fullscreen layer.
 * Use as ambient (`active`, low `intensity`) or drive `active` + `invalidate()` for short score flashes.
 */
export function NoiseBlobFieldCanvas({ frameloop = "always", ...props }: NoiseBlobFieldCanvasProps) {
  return (
    <Canvas
      className="h-full w-full touch-none bg-transparent"
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
        premultipliedAlpha: false,
      }}
      frameloop={frameloop}
      style={{ background: "transparent" }}
      onCreated={({ gl, scene }) => {
        scene.background = null;
        gl.setClearColor(0x000000, 0);
        gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        gl.toneMapping = THREE.NoToneMapping;
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
