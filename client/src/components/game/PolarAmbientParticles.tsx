import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface PolarAmbientParticlesProps {
  /** Number of radial “lanes” in the loop (original 200). Lower = faster GPU. */
  particleCount?: number;
  /** Scales final brightness (typical 0.001–0.006). */
  intensity?: number;
  /** Speed divisor for time (original `particleLifetime` = 10). */
  particleLifetime?: number;
}

const vertexShader = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function buildFragmentShader(particles: number) {
  const n = Math.max(40, Math.min(256, Math.floor(particles)));
  return `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uIntensity;
uniform float uParticleLifetime;

#define BANDPASS 720.0
#define ANGLEDISP (6.28318530718 / (BANDPASS + 1.0))
#define PARTICLE_MAX_SIZE 7.5
#define POLAR_RADIUS_CLIP 0.05
#define POLAR_RADIUS_MAX 0.75
#define POLAR_RADIUS_DELTA (POLAR_RADIUS_MAX - POLAR_RADIUS_CLIP)
#define TIME_DELTA BANDPASS
#define PARTICLES ${n}.0

vec2 polar(vec2 P) {
  return vec2(length(P), atan(P.y, P.x));
}

vec2 cart(vec2 P) {
  return P.x * vec2(cos(P.y), sin(P.y));
}

float rand(float x) {
  return fract(sin(x * 78.045) * 10000.0);
}

void main() {
  vec2 R = uResolution.xy;
  vec2 frag = gl_FragCoord.xy - 0.5 * R;
  vec2 fragPolar = polar(frag);

  float lenCenter = length(0.5 * R);
  float globTime = uTime / max(uParticleLifetime, 0.001);
  float c = 0.0;

  for (float i = 0.0; i < PARTICLES; i += 1.0) {
    float a = i / max(PARTICLES - 1.0, 1.0);

    float localTime = globTime + TIME_DELTA * (2.0 * a - 1.0) + a;
    float particleTime = fract(localTime);
    float spaceTransform = pow(particleTime, 8.0);

    vec2 P;
    P.x = lenCenter * (POLAR_RADIUS_CLIP + POLAR_RADIUS_DELTA * a + spaceTransform);

    if (abs(P.x - fragPolar.x) <= PARTICLE_MAX_SIZE) {
      P.y = floor(particleTime + BANDPASS * rand(floor(localTime))) * ANGLEDISP;
      float contrib =
        PARTICLE_MAX_SIZE * spaceTransform * clamp(1.0 - length(cart(P) - frag), 0.0, 1.0);
      c += contrib;
    }
  }

  vec3 tint = vec3(0.52, 0.82, 0.98);
  vec3 col = tint * c * uIntensity;
  float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;
}

function AmbientPlane({
  particleCount = 160,
  intensity = 0.0028,
  particleLifetime = 10,
}: PolarAmbientParticlesProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const fragmentShader = useMemo(() => buildFragmentShader(particleCount), [particleCount]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uIntensity: { value: intensity },
      uParticleLifetime: { value: particleLifetime },
    }),
    [intensity, particleLifetime],
  );

  useFrame((state, delta) => {
    const mat = materialRef.current;
    const { gl } = state;
    if (!mat) return;
    mat.uniforms.uTime.value += delta;
    mat.uniforms.uResolution.value.set(gl.drawingBufferWidth, gl.drawingBufferHeight);
    mat.uniforms.uIntensity.value = intensity;
    mat.uniforms.uParticleLifetime.value = particleLifetime;
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

function Scene(props: PolarAmbientParticlesProps) {
  return (
    <>
      <OrthographicCamera makeDefault position={[0, 0, 1]} zoom={1} left={-1} right={1} top={1} bottom={-1} near={0.01} far={2} />
      <AmbientPlane {...props} />
    </>
  );
}

/**
 * Polar-coordinate drifting specks (ring / band-pass style), additive over whatever is behind.
 * Full-viewport WebGL; parent should be `absolute inset-0` with pointer-events none.
 */
export function PolarAmbientParticlesCanvas(props: PolarAmbientParticlesProps) {
  return (
    <Canvas
      className="h-full w-full touch-none bg-transparent"
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
        premultipliedAlpha: false,
      }}
      frameloop="always"
      style={{ background: "transparent" }}
      onCreated={({ gl, scene }) => {
        // Opaque scene.background would paint over the clear color and block the lobby photo.
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
