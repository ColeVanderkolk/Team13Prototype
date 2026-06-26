import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function GoldAura({
    children,
    isGold = false,
    radius = 0.7,
    color = "#333333", // Default to dark grey if not provided
}: {
    children: React.ReactNode;
    isGold?: boolean;
    radius?: number;
    color?: string;
}) {
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    const shaderMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(color) },
            },
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor;
                varying vec2 vUv;

                #define PI 3.14159265359

                void main() {
                    vec2 center = vec2(0.5);
                    vec2 pos = vUv - center;
                    float dist = length(pos) * 2.0;

                    // Angle calc
                    float angle = atan(pos.y, pos.x); // -PI to PI
                    
                    float numLines = 42.0;
                    float segmentRad = (2.0 * PI) / numLines;
                    
                    // Normalize angle
                    float normAngle = angle + PI;
                    float currentSegment = floor(normAngle / segmentRad);
                    float localAngle = mod(normAngle, segmentRad);
                    
                    // Constant Thickness Logic
                    // Calculate distance from the center of the segment line
                    float segmentCenter = segmentRad * 0.5;
                    float angularDist = abs(localAngle - segmentCenter);
                    // Arc length = theta * radius. Radius here is distance from center (length(pos))
                    // We use length(pos) because 'pos' is the UV vector from center.
                    float distFromLine = angularDist * length(pos);
                    
                    // Thickness same as particle floor lines
                    float halfWidth = 0.008; 
                    
                    float inLine = 1.0 - step(halfWidth, distFromLine);
                    
                    // Wave Logic
                    float n = currentSegment / numLines;
                    float t = uTime * 0.125;
                    float saw = fract(n - t); // goes 1.0 -> 0.0 over time
                    
                    // Shape Logic: 
                    // 1.0 -> 0.98 (2%): Rise (0 -> 1)
                    // 0.98 -> 0.48 (50%): Decay (1 -> 0)
                    // 0.48 -> 0.0 (48%): Rest (0)
                    
                    float shape = 0.0;
                    float tRise = 0.98;
                    float tDecayEnd = 0.48;
                    
                    if (saw > tRise) {
                        // Rise Phase (saw: 1.0 -> 0.98) mapped to (0.0 -> 1.0)
                        shape = (1.0 - saw) / (1.0 - tRise);
                    } else if (saw > tDecayEnd) {
                        // Decay Phase (saw: 0.98 -> 0.48) mapped to (1.0 -> 0.0)
                        float decayProgress = (saw - tDecayEnd) / (tRise - tDecayEnd);
                        shape = pow(decayProgress, 1.5);
                    } else {
                        // Rest Phase (saw: 0.48 -> 0.0) -> 0.0
                        shape = 0.0;
                    }
                    
                    // Dimensions calculation
                    float baseInner = 0.3;
                    float maxAddedLength = 0.255; 
                    float currentLength = 0.08 + maxAddedLength * shape;
                    
                    float outerRadius = baseInner + currentLength;
                    
                    // Radius Mask
                    float inRadius = step(baseInner, dist) * step(dist, outerRadius);
                    
                    // Final Alpha
                    float alpha = inLine * inRadius;
                    
                    // Brightness highest at peak
                    float brightness = 0.2 + 1.1 * shape;
                    
                    if (alpha < 0.01) discard;
                    
                    gl_FragColor = vec4(uColor * brightness, alpha);
                }
            `
        });
    }, [color]);

    useFrame((state) => {
        if (materialRef.current && isGold) {
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            // Ensure color updates if prop changes
            materialRef.current.uniforms.uColor.value.set(color);
        }
    });

    return (
        <group>
            {children}
            {isGold && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]}>
                    <planeGeometry args={[radius * 4, radius * 4]} />
                    <primitive object={shaderMaterial} attach="material" ref={materialRef} />
                </mesh>
            )}
        </group>
    );
}
