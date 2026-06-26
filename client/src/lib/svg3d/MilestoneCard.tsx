import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { SVG3D } from "3dsvg";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { AdditiveBlending } from "three";
import type { Group, Points } from "three";

const PRESET = {
  material: "chrome" as const,
  color: "#f6efe1",
  metalness: 0.95,
  roughness: 0.35,
  depth: 1.0,
  zoom: 8.4,
  animate: "spinFloat" as const,
  animateSpeed: 0.7,
  lightIntensity: 1.72,
  ambientIntensity: 0.34,
  rimIntensity: 0.6,
  particleCount: 200,
  particleColor: "#f4efe4",
  particleOpacity: 0.28,
  particleSize: 0.018,
  particleSpeed: 0.18,
  particleSpread: 5.4,
  particleCoreGap: 1.95,
  particleVerticalSpread: 1.1,
  bloomIntensity: 0.4,
  vignetteStrength: 0.48,
  grainAmount: 0.016,
};

function hashNoise(seed: number) {
  return (((Math.sin(seed * 12.9898) * 43758.5453) % 1) + 1) % 1;
}

function buildOrbitPositions(count: number): Float32Array {
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = PRESET.particleCoreGap + Math.pow(hashNoise(i + 1), 0.58) * PRESET.particleSpread;
    const theta = hashNoise(i + 101) * Math.PI * 2;
    const phi = Math.acos(hashNoise(i + 211) * 2 - 1);
    const sinPhi = Math.sin(phi);
    data[i * 3] = Math.cos(theta) * sinPhi * radius;
    data[i * 3 + 1] = Math.cos(phi) * radius * PRESET.particleVerticalSpread;
    data[i * 3 + 2] = Math.sin(theta) * sinPhi * radius;
  }
  return data;
}

function buildOrbitSeeds(count: number): Float32Array {
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const stride = i * 4;
    seeds[stride] = hashNoise(i + 21) * Math.PI * 2;
    seeds[stride + 1] = 0.18 + hashNoise(i + 121) * 0.42;
    seeds[stride + 2] = 0.12 + hashNoise(i + 231) * 0.32;
    seeds[stride + 3] = hashNoise(i + 341);
  }
  return seeds;
}

interface HoverState {
  active: boolean;
  x: number;
  y: number;
}

function DustField({ hover }: { hover: HoverState }) {
  const pointsRef = useRef<Points>(null);
  const groupRef = useRef<Group>(null);
  const hoverMixRef = useRef(0);
  const hoverXRef = useRef(0);
  const hoverYRef = useRef(0);

  const count = PRESET.particleCount;
  const positions = useMemo(() => buildOrbitPositions(count), [count]);
  const basePositions = useMemo(() => new Float32Array(positions), [positions]);
  const orbitSeeds = useMemo(() => buildOrbitSeeds(count), [count]);

  useFrame((state, delta) => {
    if (!groupRef.current || !pointsRef.current) return;

    const hoverTarget = hover.active ? 1 : 0;
    const easing = Math.min(1, delta * 4.2);
    hoverMixRef.current += (hoverTarget - hoverMixRef.current) * easing;
    hoverXRef.current += (hover.x - hoverXRef.current) * easing;
    hoverYRef.current += (hover.y - hoverYRef.current) * easing;

    const hoverMix = hoverMixRef.current;
    const gapShift = 1 + hoverMix * 0.14;
    groupRef.current.position.x = hoverXRef.current * hoverMix * 0.24;
    groupRef.current.position.y = hoverYRef.current * hoverMix * 0.18;
    groupRef.current.position.z = hoverMix * 0.18;
    groupRef.current.scale.setScalar(1 + hoverMix * 0.028);

    // spinFloat animation
    const t = state.clock.elapsedTime * PRESET.animateSpeed;
    groupRef.current.rotation.y += delta * 0.18 * PRESET.animateSpeed;
    groupRef.current.position.y += Math.sin(t * 0.88) * 0.14;

    const positionAttribute = pointsRef.current.geometry.getAttribute("position");
    const positionArray = positionAttribute.array as Float32Array;

    for (let i = 0; i < count; i += 1) {
      const sourceOffset = i * 3;
      const seedOffset = i * 4;
      const baseX = basePositions[sourceOffset];
      const baseY = basePositions[sourceOffset + 1];
      const baseZ = basePositions[sourceOffset + 2];
      const orbitAngle =
        orbitSeeds[seedOffset] + state.clock.elapsedTime * PRESET.particleSpeed * orbitSeeds[seedOffset + 1];
      const swirl = 0.18 + orbitSeeds[seedOffset + 2] * 0.12;
      const drift = (orbitSeeds[seedOffset + 3] - 0.5) * 0.24;
      const driftAmount = 1 + Math.sin(state.clock.elapsedTime * PRESET.particleSpeed * swirl + drift) * 0.04;
      const radialScale = driftAmount * gapShift;

      positionArray[sourceOffset] = (baseX * Math.cos(orbitAngle) - baseZ * Math.sin(orbitAngle)) * radialScale;
      positionArray[sourceOffset + 2] = (baseX * Math.sin(orbitAngle) + baseZ * Math.cos(orbitAngle)) * radialScale;
      positionArray[sourceOffset + 1] =
        baseY * radialScale + Math.sin(state.clock.elapsedTime * PRESET.particleSpeed * swirl + drift) * 0.08;
    }

    positionAttribute.needsUpdate = true;
    pointsRef.current.rotation.y = Math.sin(state.clock.elapsedTime * PRESET.particleSpeed * 0.08) * 0.05;
    pointsRef.current.rotation.z = Math.sin(state.clock.elapsedTime * PRESET.particleSpeed * 0.11) * 0.03;
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={PRESET.particleColor}
          size={PRESET.particleSize}
          sizeAttenuation
          transparent
          opacity={PRESET.particleOpacity}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
    </group>
  );
}

function RimLights() {
  return (
    <>
      <pointLight position={[0, 1.1, -3.4]} intensity={PRESET.rimIntensity * 0.92} color={PRESET.color} distance={10} decay={2} />
      <pointLight position={[2.35, 0.2, -2.7]} intensity={PRESET.rimIntensity * 0.56} color={PRESET.color} distance={8} decay={2} />
      <pointLight position={[-2.1, -0.15, -2.25]} intensity={PRESET.rimIntensity * 0.24} color="#ffffff" distance={7} decay={2} />
    </>
  );
}

const grainTexture = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.12' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.26 0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.9'/%3E%3C/svg%3E")`;

const grainStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 1,
  opacity: Math.min(0.1, PRESET.grainAmount * 2.1),
  backgroundImage: grainTexture,
  backgroundSize: "170px 170px",
  mixBlendMode: "screen",
};

export interface MilestoneCardProps {
  svg: string;
  name: string;
  subtitle: string;
}

export function MilestoneCard({ svg, name, subtitle }: MilestoneCardProps) {
  const [hover, setHover] = useState<HoverState>({ active: false, x: 0, y: 0 });

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    setHover({ active: true, x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, -y)) });
  }

  return (
    <div
      className={`milestone-card-inner ${hover.active ? "is-hovered" : ""}`}
      onPointerMove={onPointerMove}
      onPointerEnter={() => setHover((h) => ({ ...h, active: true }))}
      onPointerLeave={() => setHover({ active: false, x: 0, y: 0 })}
    >
      <div className="milestone-stage">
        <div className="milestone-canvas">
          <SVG3D
            svg={svg}
            shadow={false}
            width="100%"
            height="100%"
            background="transparent"
            material={PRESET.material}
            metalness={PRESET.metalness}
            roughness={PRESET.roughness}
            color={PRESET.color}
            depth={PRESET.depth}
            zoom={PRESET.zoom}
            animate={PRESET.animate}
            animateSpeed={PRESET.animateSpeed}
            lightIntensity={PRESET.lightIntensity}
            ambientIntensity={PRESET.ambientIntensity}
            cursorOrbit
            orbitStrength={0.18}
          >
            <RimLights />
            <DustField hover={hover} />
            <EffectComposer>
              <Bloom intensity={PRESET.bloomIntensity} luminanceThreshold={0.58} luminanceSmoothing={0.2} />
              <Vignette eskil={false} offset={0.14} darkness={PRESET.vignetteStrength} />
            </EffectComposer>
          </SVG3D>
        </div>
        <div aria-hidden="true" style={grainStyle} />
      </div>
      <div className="milestone-copy">
        <p className="milestone-eyebrow">Milestone</p>
        <h3 className="milestone-name">{name}</h3>
        <p className="milestone-desc">{subtitle}</p>
      </div>
    </div>
  );
}
