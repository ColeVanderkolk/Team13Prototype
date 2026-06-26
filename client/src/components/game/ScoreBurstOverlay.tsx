import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";

/**
 * ScoreBurstOverlay — Full-screen WebGL2 particle explosion overlay.
 *
 * Ported directly from user's Shadertoy "Particle Explosion - Impact Style".
 * Uses mix-blend-mode: screen so black = transparent (no alpha issues).
 *
 * Usage:
 *   const burstRef = useRef<ScoreBurstHandle>(null);
 *   <ScoreBurstOverlay ref={burstRef} />
 *   burstRef.current?.burst({ x: 0.5, y: 0.5, color: [1, 0.6, 0.2] });
 */

export interface BurstParams {
  /** Normalised x position (0 = left, 1 = right). */
  x: number;
  /** Normalised y position (0 = top, 1 = bottom). */
  y: number;
  /** RGB colour [0–1]. Defaults to white. */
  color?: [number, number, number];
  /** Intensity multiplier (default 1). */
  intensity?: number;
}

export interface ScoreBurstHandle {
  burst: (params: BurstParams) => void;
}

/* ── Shader sources ─────────────────────────────────────────────────────────── */

const VERT = `#version 300 es
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const MAX_BURSTS = 8;

/**
 * Fragment shader — user's original Shadertoy code adapted for multi-burst.
 * Original used spherical mapping; this version uses 2D screen-space with
 * the same Hash, expand, fade, and 1/d brightness math.
 */
const FRAG = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;

uniform int u_burstCount;
uniform vec2 u_burstPos[${MAX_BURSTS}];
uniform float u_burstStart[${MAX_BURSTS}];
uniform vec3 u_burstColor[${MAX_BURSTS}];
uniform float u_burstIntensity[${MAX_BURSTS}];
uniform float u_burstSeed[${MAX_BURSTS}]; // stable random seed per burst

out vec4 fragColor;

// Original Hash123 from user's shader
vec3 Hash123(float t) {
  float x = fract(sin(t * 456.51) * 195.23);
  float y = fract(sin((t + x) * 951.2) * 462.1);
  float z = fract(sin((t + x + y) * 375.2) * 108.1);
  return normalize((vec3(x, y, z) - 0.5) * 2.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  vec3 col = vec3(0.0);

  for (int b = 0; b < ${MAX_BURSTS}; b++) {
    if (b >= u_burstCount) break;

    float age = u_time - u_burstStart[b];
    if (age < 0.0 || age > 1.5) continue;

    float t = age / 1.5; // normalised 0–1 over 1.5s
    float burstSeed = u_burstSeed[b];

    // Fluid easing: fast burst out, smooth deceleration
    float expandT = 1.0 - pow(1.0 - t, 3.0);

    // Smooth fade with a softer tail
    float fade = smoothstep(1.0, 0.0, t) * (1.0 - t * t * 0.3);

    // Burst center in UV space
    vec2 center = u_burstPos[b];

    for (float i = 0.0; i < 12.0; i++) {
      vec3 dir3 = Hash123(burstSeed + i) * 1.5;
      // Project 3D direction to 2D, aspect-correct
      vec2 dir2 = vec2(dir3.x / aspect, dir3.y);

      // Slightly varied speed per particle for organic feel
      float speed = 0.07 + length(dir3.xy) * 0.03;
      vec2 particlePos = center + dir2 * expandT * speed;
      vec2 diff = uv - particlePos;
      diff.x *= aspect;
      float d = length(diff);
      d = max(d, 0.001);

      // Original brightness / d with fade
      float brightness = 0.00025 * u_burstIntensity[b] * fade;
      col += (brightness / d) * u_burstColor[b];
    }
  }

  // Output on black — mix-blend-mode: screen makes black transparent
  fragColor = vec4(col, 1.0);
}
`;

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[ScoreBurstOverlay]", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

type Burst = {
  x: number;
  y: number;
  color: [number, number, number];
  intensity: number;
  startTime: number;
  seed: number; // stable random seed — avoids float precision drift over time
};

/* ── Component ───────────────────────────────────────────────────────────────── */

export const ScoreBurstOverlay = forwardRef<ScoreBurstHandle, { className?: string }>(
  function ScoreBurstOverlay({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGL2RenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const locsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
    const burstsRef = useRef<Burst[]>([]);
    const rafRef = useRef(0);
    const startRef = useRef(performance.now() / 1000);
    const activeRef = useRef(false);
    const suppressedRef = useRef(false);

    const drawRef = useRef<(now: number) => void>();
    function draw(now: number) { drawRef.current?.(now); }

    const burst = useCallback((params: BurstParams) => {
      if (suppressedRef.current) return;
      const now = (performance.now() / 1000) - startRef.current;
      burstsRef.current.push({
        x: params.x,
        y: 1.0 - params.y, // flip: input top-left → shader bottom-left
        color: params.color ?? [1, 1, 1],
        intensity: params.intensity ?? 1,
        startTime: now,
        seed: Math.random() * 1000, // small stable number — no float precision issues
      });
      if (burstsRef.current.length > MAX_BURSTS) {
        burstsRef.current = burstsRef.current.slice(-MAX_BURSTS);
      }
      if (!activeRef.current) {
        activeRef.current = true;
        rafRef.current = requestAnimationFrame(draw);
      }
    }, []);

    useImperativeHandle(ref, () => ({ burst }), [burst]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        suppressedRef.current = true;
        return;
      }

      const gl = canvas.getContext("webgl2", {
        alpha: false, // opaque — we use mix-blend-mode: screen
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
      if (!gl) { suppressedRef.current = true; return; }
      glRef.current = gl;

      const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) { suppressedRef.current = true; return; }

      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn("[ScoreBurstOverlay]", gl.getProgramInfoLog(program));
        suppressedRef.current = true;
        return;
      }
      programRef.current = program;
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      const loc = (name: string) => gl.getUniformLocation(program, name);
      const locs: Record<string, WebGLUniformLocation | null> = {
        u_resolution: loc("u_resolution"),
        u_time: loc("u_time"),
        u_burstCount: loc("u_burstCount"),
      };
      for (let i = 0; i < MAX_BURSTS; i++) {
        locs[`u_burstPos_${i}`] = loc(`u_burstPos[${i}]`);
        locs[`u_burstStart_${i}`] = loc(`u_burstStart[${i}]`);
        locs[`u_burstColor_${i}`] = loc(`u_burstColor[${i}]`);
        locs[`u_burstIntensity_${i}`] = loc(`u_burstIntensity[${i}]`);
        locs[`u_burstSeed_${i}`] = loc(`u_burstSeed[${i}]`);
      }
      locsRef.current = locs;

      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      startRef.current = performance.now() / 1000;

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      resize();

      drawRef.current = () => {
        const g = glRef.current;
        const prog = programRef.current;
        if (!g || !prog) return;

        const t = performance.now() / 1000 - startRef.current;

        burstsRef.current = burstsRef.current.filter(b => (t - b.startTime) < 1.5);

        const bursts = burstsRef.current;
        if (bursts.length === 0) {
          g.clearColor(0, 0, 0, 1);
          g.clear(g.COLOR_BUFFER_BIT);
          activeRef.current = false;
          return;
        }

        rafRef.current = requestAnimationFrame(draw);

        g.useProgram(prog);
        g.uniform2f(locs.u_resolution!, canvas.width, canvas.height);
        g.uniform1f(locs.u_time!, t);
        g.uniform1i(locs.u_burstCount!, bursts.length);

        for (let i = 0; i < MAX_BURSTS; i++) {
          const b = bursts[i];
          if (b) {
            g.uniform2f(locs[`u_burstPos_${i}`]!, b.x, b.y);
            g.uniform1f(locs[`u_burstStart_${i}`]!, b.startTime);
            g.uniform3f(locs[`u_burstColor_${i}`]!, b.color[0], b.color[1], b.color[2]);
            g.uniform1f(locs[`u_burstIntensity_${i}`]!, b.intensity);
            g.uniform1f(locs[`u_burstSeed_${i}`]!, b.seed);
          } else {
            g.uniform1f(locs[`u_burstStart_${i}`]!, -10.0);
            g.uniform1f(locs[`u_burstSeed_${i}`]!, 0.0);
          }
        }

        g.clearColor(0, 0, 0, 1);
        g.clear(g.COLOR_BUFFER_BIT);
        g.drawArrays(g.TRIANGLES, 0, 3);
      };

      return () => {
        cancelAnimationFrame(rafRef.current);
        ro.disconnect();
        gl.deleteProgram(program);
        glRef.current = null;
        programRef.current = null;
        activeRef.current = false;
      };
    }, []);

    if (suppressedRef.current) return null;

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 55,
          mixBlendMode: "screen", // black = transparent, light adds
        }}
        aria-hidden
      />
    );
  },
);
