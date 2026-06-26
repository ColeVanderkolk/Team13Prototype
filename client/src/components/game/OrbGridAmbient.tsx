import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface OrbGridAmbientProps {
  /** Scales final color before additive blend (typical 0.04–0.18). */
  intensity?: number;
}

const vertexShader = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uIntensity;

const float PI = 3.1415926;

vec3 rround(vec3 x) {
  return sign(x) * floor(abs(x) + 0.5);
}

vec3 rotateX(float a, vec3 v) {
  return vec3(v.x, cos(a) * v.y + sin(a) * v.z, cos(a) * v.z - sin(a) * v.y);
}

vec3 rotateY(float a, vec3 v) {
  return vec3(cos(a) * v.x + sin(a) * v.z, v.y, cos(a) * v.z - sin(a) * v.x);
}

float torusDistance(vec3 p, float inner_radius, float outer_radius) {
  vec3 ring_p = vec3(normalize(p.xy) * outer_radius, 0.0);
  return distance(p, ring_p) - inner_radius;
}

vec2 orbIntensity(vec3 p, float t) {
  vec3 ofs = vec3(0.0);
  float d0 = torusDistance(p - ofs, 0.5, 5.0);
  float d1 = torusDistance(rotateY(PI * 0.5, p) - ofs, 1.3, 8.0);
  float d2 = torusDistance(rotateX(0.2, rotateY(PI, p)) - ofs, 1.5, 20.0);
  float amb = smoothstep(0.8, 1.0, cos(p.x * 10.0) * sin(p.y * 5.0) * cos(p.z * 7.0)) * 0.02;
  float wave = step(abs(p.y + 10.0 + cos(p.z * 0.1) * sin(p.x * 0.1 + t) * 4.0), 1.0) * 0.3;
  return vec2(
    max(max(1.0 - step(4.0, length(p)), step(d0, 0.0)), step(d1, 0.0)) + amb + step(d2, 0.0) * 0.1 + wave,
    step(0.3, wave)
  );
}

vec3 project(vec3 p, vec3 cam_origin, mat3 cam_rotation) {
  mat3 cam_rotation_t = mat3(
    vec3(cam_rotation[0].x, cam_rotation[1].x, cam_rotation[2].x),
    vec3(cam_rotation[0].y, cam_rotation[1].y, cam_rotation[2].y),
    vec3(cam_rotation[0].z, cam_rotation[1].z, cam_rotation[2].z)
  );
  p = cam_rotation_t * (p - cam_origin);
  return vec3(p.xy / p.z, p.z);
}

vec3 orb(float rad, vec3 coord, vec2 frag_coord) {
  return 4.0 * (1.0 - smoothstep(0.0, rad, length(coord.xy - frag_coord))) *
    vec3(1.0, 0.6, 0.3) * clamp(coord.z, 0.0, 1.0);
}

vec3 traverseUniformGrid(
  vec3 ro,
  vec3 rd,
  vec3 cam_origin,
  mat3 cam_rotation,
  vec2 frag_coord,
  float t
) {
  vec3 increment = vec3(1.0) / rd;
  vec3 intersection = ((floor(ro) + rround(rd * 0.5 + vec3(0.5))) - ro) * increment;
  increment = abs(increment);
  ro += rd * 1e-3;

  vec3 orb_accum = vec3(0.0);

  for (int i = 0; i < 50; i += 1) {
    vec3 rp = floor(ro + rd * min(intersection.x, min(intersection.y, intersection.z)));

    vec2 oi = orbIntensity(rp, t);
    vec3 coord = project(rp + vec3(0.5), cam_origin, cam_rotation);

    float rmask = smoothstep(0.0, 0.1, distance(frag_coord, coord.xy));

    float rad = 0.5 / coord.z * (1.0 - smoothstep(0.0, 50.0, length(rp)));
    rad *= 0.5 + 0.5 * sin(rp.x + t * 5.0) * cos(rp.y + t * 10.0) * cos(rp.z);

    orb_accum += orb(rad, coord, frag_coord) * oi.x * mix(1.0, rmask, oi.y);

    intersection += increment * step(intersection.xyz, intersection.yxy) * step(intersection.xyz, intersection.zzx);
  }

  return orb_accum;
}

void main() {
  vec2 R = uResolution.xy;
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = fragCoord / R;
  vec2 frag_coord = uv * 2.0 - vec2(1.0);
  frag_coord.x *= R.x / R.y;
  frag_coord *= 1.5;

  float t = uTime;
  vec3 cam_origin = rotateX(
    t * 0.3,
    rotateY(t * 0.5, vec3(0.0, 0.0, -10.0 + 5.0 * cos(t * 0.1)))
  );

  vec3 cam_w = normalize(vec3(cos(t) * 10.0, 0.0, 0.0) - cam_origin);
  vec3 cam_u = normalize(cross(cam_w, vec3(0.0, 1.0, 0.0)));
  vec3 cam_v = normalize(cross(cam_u, cam_w));
  mat3 cam_rotation = mat3(cam_u, cam_v, cam_w);

  vec3 ro = cam_origin;
  vec3 rd = cam_rotation * vec3(frag_coord, 1.0);

  vec3 col = traverseUniformGrid(ro, rd, cam_origin, cam_rotation, frag_coord, t);
  col = sqrt(col * 0.8) * uIntensity;
  float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

function AmbientPlane({ intensity = 0.09 }: OrbGridAmbientProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uIntensity: { value: intensity },
    }),
    [intensity],
  );

  useFrame((state, delta) => {
    const mat = materialRef.current;
    const { gl } = state;
    if (!mat) return;
    mat.uniforms.uTime.value += delta;
    mat.uniforms.uResolution.value.set(gl.drawingBufferWidth, gl.drawingBufferHeight);
    mat.uniforms.uIntensity.value = intensity;
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

function Scene(props: OrbGridAmbientProps) {
  return (
    <>
      <OrthographicCamera makeDefault position={[0, 0, 1]} zoom={1} left={-1} right={1} top={1} bottom={-1} near={0.01} far={2} />
      <AmbientPlane {...props} />
    </>
  );
}

/**
 * Warm torus / uniform-grid “orbs” with orbiting camera — additive over layers behind.
 * Parent: `absolute inset-0` + `pointer-events-none`.
 */
export function OrbGridAmbientCanvas(props: OrbGridAmbientProps) {
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
      <Scene {...props} />
    </Canvas>
  );
}
