import { useEffect, useRef, type MutableRefObject } from 'react';

type CompassProps = {
    compassYawRef: MutableRefObject<number | null>;
};

export function Compass({ compassYawRef }: CompassProps) {
    const needleRef = useRef<SVGGElement | null>(null);

    useEffect(() => {
        let rafId: number;
        const update = () => {
            if (needleRef.current) {
                const yaw = compassYawRef.current;
                // null = overhead mode — north (grid -Y) always appears at upper-right due to 45° camera, so needle sits at 45°
                // fp mode: (π + yaw) keeps the needle locked on absolute north as you look around
                // when facing north (yaw=π) → 0° (up), facing east (yaw=π/2) → 270° (left), facing south (yaw=0) → 180° (down)
                const angleDeg = yaw === null ? 45 : (Math.PI + yaw) * (180 / Math.PI);
                needleRef.current.setAttribute('transform', `rotate(${angleDeg}, 65, 65)`);
            }
            rafId = requestAnimationFrame(update);
        };
        rafId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(rafId);
    }, [compassYawRef]);

    return (
        <svg width="130" height="130" viewBox="0 0 130 130" style={{ display: 'block' }}>
            <polygon
                points="65,29 72,58 101,65 72,72 65,101 58,72 29,65 58,58"
                fill="#313c4d"
            />
            <text x="65" y="21" textAnchor="middle" dominantBaseline="middle" fill="#5a6880" fontSize={10} fontFamily="monospace" fontWeight="bold">N</text>
            <text x="65" y="109" textAnchor="middle" dominantBaseline="middle" fill="#5a6880" fontSize={10} fontFamily="monospace">S</text>
            <text x="110" y="66" textAnchor="middle" dominantBaseline="middle" fill="#5a6880" fontSize={10} fontFamily="monospace">E</text>
            <text x="20" y="66" textAnchor="middle" dominantBaseline="middle" fill="#5a6880" fontSize={10} fontFamily="monospace">W</text>
            <g ref={needleRef}>
                <polygon points="65,33 60,63 70,63" fill="#e53e3e" opacity={0.92} />
                <polygon points="65,97 60,67 70,67" fill="#3b7dd8" opacity={0.88} />
                <circle cx="65" cy="65" r="3.5" fill="#bfc9d6" />
            </g>
        </svg>
    );
}
