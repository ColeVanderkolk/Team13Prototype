import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";

/**
 * NoiseFieldOverlay — Raymarched noise tunnel (no orb).
 *
 * NOT always visible — use the imperative `flash()` method to fade in and out
 * on events like stage changes.
 *
 * Fade is driven by a u_opacity uniform INSIDE the shader so that fading
 * moves colors toward black. With mix-blend-mode: screen, black = invisible.
 * CSS opacity is NOT used (it would darken the scene instead of fading out).
 */

export interface NoiseFieldHandle {
  /** Fade in the noise field, hold, then fade out. Duration in seconds, intensity 0–1. */
  flash: (duration?: number, intensity?: number) => void;
}

const VERT = `#version 300 es
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

/* Raymarched noise tunnel — orb removed.
   Clouds from twisted tube geometry + noise octaves.
   Brightness driven by surface proximity. */
const FRAG = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  float d = 0.0, a, s;
  vec3 p;
  vec2 u = gl_FragCoord.xy;
  vec2 R = u_resolution;
  float t = u_time;

  u = (u + u - R) / R.y;
  u += vec2(cos(t * 0.1) * 0.3, cos(t * 0.3) * 0.1);

  float acc = 0.0;

  for (float i = 0.0; i < 64.0; i++) {
    p = vec3(u * d, d + t);

    // Twist the tunnel
    float tw = 0.08 * t + p.z / 10.0;
    p.xy *= mat2(cos(tw), cos(tw + 33.0), cos(tw + 11.0), cos(tw));

    // Tube shape
    s = 4.0 - abs(p.y);

    // Noise octaves — more octaves for smoother clouds
    for (a = 0.8; a < 24.0; a += a) {
      p += cos(0.5 * t + p.yzx) * 0.18;
      s -= abs(dot(sin(0.08 * t + p * a), vec3(0.55))) / a;
    }

    // Finer step size for smoother result
    float stepSize = max(0.03 + 0.2 * abs(s), 0.015);
    d += stepSize;

    // Soft surface glow
    float glow = exp(-abs(s) * 5.0);
    acc += glow * 0.016;
  }

  acc = min(acc, 0.65) * u_opacity;
  // Slightly warmer icy blue with subtle gradient
  vec3 col = acc * mix(vec3(0.45, 0.75, 1.0), vec3(0.6, 0.85, 1.0), acc);

  fragColor = vec4(col, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[NoiseFieldOverlay]", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export interface NoiseFieldOverlayProps {
  className?: string;
  /** Internal resolution scale. Default 0.4. */
  resolutionScale?: number;
}

export const NoiseFieldOverlay = forwardRef<NoiseFieldHandle, NoiseFieldOverlayProps>(
  function NoiseFieldOverlay({
    className,
    resolutionScale = 0.4,
  }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [suppressed, setSuppressed] = useState(false);

    // Opacity animation state (drives u_opacity uniform, NOT css opacity)
    const opacityRef = useRef(0);
    const targetOpacityRef = useRef(0);
    const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const rafRef = useRef(0);
    const activeRef = useRef(false);
    const glStuffRef = useRef<{
      gl: WebGL2RenderingContext;
      program: WebGLProgram;
      u_resolution: WebGLUniformLocation | null;
      u_time: WebGLUniformLocation | null;
      u_opacity: WebGLUniformLocation | null;
      startTime: number;
      canvas: HTMLCanvasElement;
    } | null>(null);

    useImperativeHandle(ref, () => ({
      flash: (duration = 2.5, intensity = 0.55) => {
        if (suppressed) return;
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

        opacityRef.current = Math.max(opacityRef.current, 0.03);
        targetOpacityRef.current = Math.min(1, intensity);

        // Schedule fade out
        fadeTimerRef.current = setTimeout(() => {
          targetOpacityRef.current = 0;
        }, duration * 1000);

        // Start render loop if idle
        if (!activeRef.current) {
          activeRef.current = true;
          rafRef.current = requestAnimationFrame(draw);
        }
      },
    }), [suppressed]);

    function draw(_now: number) {
      const stuff = glStuffRef.current;
      if (!stuff) return;

      const { gl, program, u_resolution, u_time, u_opacity, startTime, canvas } = stuff;

      // Animate opacity
      const target = targetOpacityRef.current;
      const current = opacityRef.current;
      const speed = target > current ? 0.12 : 0.025;
      opacityRef.current = current + (target - current) * speed;

      // If fully faded out, stop rendering (canvas stays in DOM, sized correctly;
      // black output = invisible with mix-blend-mode:screen, zero GPU cost)
      if (opacityRef.current < 0.003 && target === 0) {
        opacityRef.current = 0;
        // Clear to black (invisible in screen blend) and stop loop
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        activeRef.current = false;
        return;
      }

      rafRef.current = requestAnimationFrame(draw);

      const t = performance.now() / 1000 - startTime;
      gl.useProgram(program);
      gl.uniform2f(u_resolution, canvas.width, canvas.height);
      gl.uniform1f(u_time, t);
      gl.uniform1f(u_opacity, opacityRef.current);

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setSuppressed(true);
        return;
      }

      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
      if (!gl) { setSuppressed(true); return; }

      const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) { setSuppressed(true); return; }

      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn("[NoiseFieldOverlay]", gl.getProgramInfoLog(program));
        setSuppressed(true);
        return;
      }
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      glStuffRef.current = {
        gl,
        program,
        u_resolution: gl.getUniformLocation(program, "u_resolution"),
        u_time: gl.getUniformLocation(program, "u_time"),
        u_opacity: gl.getUniformLocation(program, "u_opacity"),
        startTime: performance.now() / 1000,
        canvas,
      };

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = Math.max(1, Math.floor(w * dpr * resolutionScale));
        canvas.height = Math.max(1, Math.floor(h * dpr * resolutionScale));
        gl.viewport(0, 0, canvas.width, canvas.height);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      resize();

      // Clear to black — invisible in screen blend, but canvas stays sized
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return () => {
        cancelAnimationFrame(rafRef.current);
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        ro.disconnect();
        gl.deleteProgram(program);
        glStuffRef.current = null;
        activeRef.current = false;
      };
    }, [resolutionScale]);

    if (suppressed) return null;

    return (
      <canvas
        ref={canvasRef}
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full",
          "mix-blend-screen [transform:translateZ(0)]",
          className,
        )}
        style={{ zIndex: 5 }}
        aria-hidden
      />
    );
  },
);
