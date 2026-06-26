/**
 * NebulaBackdrop — subtle nebula-ridge plasma effect around the edges of
 * the game viewport. Ported visually from the `nebula-deconstruct` step 4
 * ("Ridge (plasma)") experiment, but re-implemented as a cheap 2D
 * screen-space effect instead of a 3D raymarch so it costs almost nothing
 * on older GPUs.
 *
 * Design constraints (from product):
 *   • Must NOT be distracting in the center — keep gameplay visual focus
 *     clean. Achieved via a radial center-discard mask (shader returns
 *     early for inner ~35% of the screen), so there's literally no pixel
 *     there.
 *   • Effect lives around the screen EDGES, fading in toward the corners.
 *   • Must stay cheap on low-end / integrated GPUs:
 *       - No 3D raymarch — screen-space 2D ridge noise (4 octaves).
 *       - No bloom pass specifically for the backdrop (the game scene's
 *         existing Bloom will naturally pick up any bright pixels).
 *       - Fullscreen quad drawn via NDC trick (no model/view matrix work).
 *       - 150 screen-space particles with per-point alpha mask, additive
 *         blend, no velocity buffer.
 *   • Mounts as a scene child inside the existing game <Canvas> so there
 *     is one GL context, one composer, one render loop — no second canvas
 *     to coordinate.
 *
 * Usage:
 *     <Canvas>
 *       <NebulaBackdrop />
 *       ... game content ...
 *     </Canvas>
 */

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getQualityMul } from "@/lib/perfTier";

// ── Tuning knobs ──────────────────────────────────────────────────────────
// Keep everything here so it's easy to dial the look without diving into
// shader code. Particle count scales by perf tier so weaker devices
// don't pay for 150 additive points they can't see clearly anyway.
const PARTICLE_COUNT = Math.round(150 * getQualityMul());
// Rectangular feather — distance from the nearest viewport edge (uv
// 0..1). Smaller values push the effect tighter to the edges.
const EDGE_FEATHER = 0.32;
// Global brightness multiplier. Kept under the scene Bloom threshold
// (0.5) so it never bloom-pops, but raised above the near-invisible
// first pass so the cloud tendrils actually READ.
const INTENSITY = 0.55;
// Cloud field spatial scale in screen units. ~1.8 gives big billowy
// structures; raise for tighter wisps, lower for sparser larger puffs.
const NOISE_SCALE = 1.8;

// Palette: near-monochrome. Outer is near-black; mid is a lifted dim
// grey with only the faintest cool cast — we want the cloud bodies to
// actually be visible against the void, not invisible. Stays under the
// Bloom threshold (0.5) so it never blooms.
const COLOR_OUTER = new THREE.Color("#14161c");
const COLOR_MID = new THREE.Color("#5a5e68");

// ── Ridge-plasma fullscreen quad ──────────────────────────────────────────
// Uses the NDC-output trick in the vertex shader so the plane always covers
// the viewport regardless of camera position. No matrix multiplies.

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Draw at the far plane (z=0.999 in NDC) with full NDC coords — this
    // bypasses the camera matrices entirely, making the plane a true
    // fullscreen quad regardless of what the scene camera is doing.
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`;

const quadFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAspect;
  uniform vec3  uColorOuter;
  uniform vec3  uColorMid;
  uniform float uEdgeFeather;
  uniform float uIntensity;
  uniform float uNoiseScale;

  varying vec2 vUv;

  // ── 2D cloud noise — FBM + domain warp ────────────────────────────────
  // This produces curdled, billowy cloud structure (classic IQ-style
  // warped FBM) rather than the straight ridges of the reference step 4.
  // Curdled FBM reads as smoke clouds; straight ridges read as fibers.
  // The two-level domain warp is what gives cloud edges their swirly,
  // fluid feel — plain FBM would look blobby and static.

  vec2 hash2(vec2 p) {
    p = vec2(
      dot(p, vec2(127.1, 311.7)),
      dot(p, vec2(269.5, 183.3))
    );
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
    float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    float xy = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    return 0.5 + 0.5 * xy;
  }

  // Three-octave FBM — smooth cloud body. Dropped from 5 octaves to 3
  // because cloudField below calls fbm2 five times per pixel, so every
  // octave is 5× as expensive as one would naively think. Three octaves
  // produces essentially identical low-frequency cloud shapes for a
  // backdrop layer this subtle, at ~40% the total noise cost.
  float fbm2(vec2 p) {
    float f = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 3; i++) {
      f += amp * noise2(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return f;
  }

  // Domain-warped FBM — the classic 2-level displacement gives us the
  // sweeping, swirly structure that reads as "smoke" rather than "blobs".
  // Time advances each warp layer at a different rate so the cloud never
  // sits still and different scales of motion read simultaneously.
  float cloudField(vec2 p, float t) {
    vec2 q = vec2(
      fbm2(p + vec2(0.0, t * 0.20)),
      fbm2(p + vec2(5.2, 1.3) + vec2(t * 0.13, 0.0))
    );
    vec2 r = vec2(
      fbm2(p + 3.0 * q + vec2(1.7, 9.2) + vec2(t * 0.07, 0.0)),
      fbm2(p + 3.0 * q + vec2(8.3, 2.8) + vec2(0.0, t * 0.09))
    );
    return fbm2(p + 3.5 * r);
  }

  void main() {
    // ── Rectangular bias toward the frame ─────────────────────────────
    // Per-pixel weight for "how likely a cloud is to appear here".
    float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float frameBias = 1.0 - smoothstep(0.0, uEdgeFeather, edgeDist);

    // ── Early discard BEFORE expensive cloud work ─────────────────────
    // Center pixels (low frameBias) skip cloudField entirely. Since
    // cloudField calls fbm2 five times (3 octaves each = 15 noise2 calls
    // per pixel per frame), early-discard of the inner ~45% of the
    // screen buys back most of the backdrop's GPU cost.
    if (frameBias < 0.02) discard;

    // ── Domain-warped cloud field ─────────────────────────────────────
    // Evaluate the cloud density at this pixel. uNoiseScale controls
    // the feature size; uTime drives the motion. Two time scales are
    // injected inside cloudField so you see fast local turbulence and
    // slow bulk drift simultaneously — that is what makes clouds feel
    // alive instead of scrolling uniformly.
    vec2 cp = vUv * uNoiseScale;
    float cloud = cloudField(cp, uTime);

    // Map the raw FBM output (which clusters around 0.3..0.7 for smooth
    // noise) to a wider 0..1 cloud-shape signal. Too-tight a window and
    // everything below 0.5 disappears and the nebula looks non-existent;
    // this range lets the denser half of the field produce visible
    // tendrils while keeping void thin regions dark.
    float shape = smoothstep(0.28, 0.70, cloud);

    // Cloud density = frame-bias × shape. Near the edges shape values
    // of ~0.2–0.8 produce a legible cloud; near center the 0.10 frame
    // floor still admits only faint wisps of the densest cores.
    float density = frameBias * shape;
    if (density < 0.003) discard;

    // ── Color ─────────────────────────────────────────────────────────
    // Near-monochrome: outer ≈ near-black, mid ≈ dim grey with only a
    // whisper of cool. Grading is driven by the cloud field itself so
    // the densest cloud cores read slightly lighter.
    vec3 col = mix(uColorOuter, uColorMid, shape);
    col *= uIntensity;

    // Alpha scales with density but with a lifted floor so weak clouds
    // still show up as faint haze rather than vanishing. Softly eased so
    // tendrils taper off instead of cutting at the threshold.
    float alpha = density;
    alpha = alpha * alpha * (3.0 - 2.0 * alpha); // smoothstep ease
    alpha *= 0.95;
    gl_FragColor = vec4(col, alpha);
  }
`;

function NebulaQuad({ intensity = INTENSITY }: { intensity?: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();
  const targetIntensity = useRef(intensity);
  targetIntensity.current = intensity;

  const uniforms = useMemo<Record<string, THREE.IUniform>>(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uColorOuter: { value: COLOR_OUTER.clone() },
      uColorMid: { value: COLOR_MID.clone() },
      uEdgeFeather: { value: EDGE_FEATHER },
      uIntensity: { value: intensity },
      uNoiseScale: { value: NOISE_SCALE },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Keep aspect in sync with canvas resize.
  useFrame(() => {
    uniforms.uAspect.value = size.width / Math.max(1, size.height);
  });
  // Tick time + smoothly lerp intensity toward the prop value so external
  // updates (e.g. timer-driven brightness) don't snap.
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    const cur = uniforms.uIntensity.value as number;
    // ~0.6s settling time at 60fps for a 1.0 step.
    const k = 1 - Math.exp(-delta * 5);
    uniforms.uIntensity.value = cur + (targetIntensity.current - cur) * k;
  });

  return (
    <mesh
      // Very negative renderOrder so this paints first, before any other
      // transparent object in the scene.
      renderOrder={-1000}
      frustumCulled={false}
    >
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={quadVertex}
        fragmentShader={quadFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

// ── Screen-space particle layer ──────────────────────────────────────────
// Uses the NDC-output trick too. Each point carries its NDC XY in the
// position attribute; the vertex shader forwards it directly to gl_Position.
// Center avoidance is applied at generation time (rejection sampling).

const particleVertex = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  varying float vAlpha;
  varying float vSeed;

  uniform float uTime;

  void main() {
    // Slow continuous drift with NDC wrap. Previous pass at speeds
    // 0.02–0.06 NDC/s read as "stars streaming past" — too busy for a
    // subtle backdrop. Dialed to 0.004–0.015 so drift is perceptible
    // over ~2 minutes per screen crossing rather than ~15 seconds.
    float speedX = 0.004 + fract(aSeed * 11.3) * 0.012;
    float speedY = 0.002 + fract(aSeed *  7.7) * 0.006;
    float dirY   = (fract(aSeed * 3.1) > 0.5) ? 1.0 : -1.0;

    float x = position.x + uTime * speedX;
    float y = position.y + uTime * speedY * dirY;
    x = mod(x + 1.0, 2.0) - 1.0;
    y = mod(y + 1.0, 2.0) - 1.0;

    // Gentler twinkle (lower amplitude) so particles don't pulse too
    // noticeably — the goal is "ambient dust", not "active starfield".
    vAlpha = 0.55 + 0.20 * sin(uTime * 0.9 + aSeed * 20.0);

    vSeed = aSeed;
    gl_Position = vec4(x, y, 0.998, 1.0);
    gl_PointSize = aSize;
  }
`;

const particleFragment = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // Soft disc with a tight core.
    float fall = smoothstep(0.5, 0.0, d);
    // De-saturated tint: neutral warm-white with only a whisper of cool
    // on ~half the particles. Brightness and alpha tuned for visible
    // but unobtrusive ambient dust.
    vec3 cool = vec3(0.85, 0.88, 0.95);
    vec3 warm = vec3(0.95, 0.92, 0.86);
    vec3 col = mix(cool, warm, fract(vSeed * 3.17));
    gl_FragColor = vec4(col * fall * 0.55, fall * vAlpha * 0.55);
  }
`;

function NebulaParticlesBackdrop() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  // Build screen-space NDC positions — uniform random across the entire
  // canvas. Particles are intentionally NOT restricted to the edge band;
  // they're their own layer, evenly scattered, so the viewer still gets
  // a subtle sense of depth/space across the whole viewport.
  const geometry = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const seeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3 + 0] = Math.random() * 2 - 1;
      positions[i * 3 + 1] = Math.random() * 2 - 1;
      positions[i * 3 + 2] = 0;
      // Size range tuned to be visible without dominating the scene.
      sizes[i] = 0.5 + Math.random() * 1.4;
      seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    // Manual bounds so Three doesn't try to compute from NDC coords.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10);
    return geo;
  }, []);

  const uniforms = useMemo<Record<string, THREE.IUniform>>(
    () => ({
      uTime: { value: 0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  return (
    <points renderOrder={-999} frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      <shaderMaterial
        ref={matRef}
        vertexShader={particleVertex}
        fragmentShader={particleFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/**
 * Composite: ridge-plasma quad + screen-space particle starfield.
 * Both are mounted as scene children inside an existing R3F <Canvas>.
 *
 * `intensity` is an optional override for the cloud layer's global
 * brightness multiplier. Useful for tying the backdrop to game state
 * — e.g. the timer-pressure ramp wired up from GameScreen, where it
 * climbs from a baseline at game start toward a brighter value as
 * time runs out. Defaults to the file-level `INTENSITY` constant.
 */
export function NebulaBackdrop({ intensity }: { intensity?: number } = {}) {
  return (
    <>
      <NebulaQuad intensity={intensity} />
      <NebulaParticlesBackdrop />
    </>
  );
}
