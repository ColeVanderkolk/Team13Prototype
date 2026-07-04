// PrototypeV1.jsx — prototype v1.0 (the old Amongusstyle build) as a React page.
// Route it in App.tsx:
//   import PrototypeV1 from "./pages/PrototypeV1";
//   <Route path="/prototype" element={<PrototypeV1 />} />
//
// This file owns the renderer, camera, input, and game loop.
// The building blocks live in their own modules:
//   constants.js          tuning knobs (speeds, camera, duration)
//   mapData.js            rooms/corridors layout + spawn points
//   walkable.js           collision test
//   mapTexture.js         flat map drawing -> ground plane
//   character.js          the 3D bean model
//   CollectibleSimple.js  collectible class

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import {
  GAME_DURATION, WALK_SPEED, SPRINT_SPEED, CHAR_RADIUS,
  CAM_ANGLE, CAM_PITCH, CAM_DIST_MIN, CAM_DIST_MAX, CAM_DIST_DEFAULT,
} from './constants';
import { COLLECTIBLE_SPAWNS } from './mapData';
import { isWalkable } from './walkable';
import { createGround } from './mapTexture';
import { createCharacter } from './character';
import { CollectibleSimple } from './CollectibleSimple';

export default function PrototypeV1() {
  const mountRef = useRef(null);

  // HUD state
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0f13);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(
      45, mount.clientWidth / mount.clientHeight, 0.1, 500,
    );
    let camDist = CAM_DIST_DEFAULT;
    const camLookAt = new THREE.Vector3(0, 0, 0);

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0x8088a0, 1.3));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(14, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      near: 1, far: 120, left: -50, right: 50, top: 50, bottom: -50,
    });
    scene.add(sun);

    // ── Map + character ──
    scene.add(createGround());
    const { charRoot, bodyMain, lLegPiv, rLegPiv } = createCharacter();
    scene.add(charRoot);

    // ── Collectibles ──
    let points = 0;
    const collectibles = COLLECTIBLE_SPAWNS.map(
      ([x, y, z]) => new CollectibleSimple(x, y, z),
    );
    collectibles.forEach((c) => c.addToScene(scene));

    // ── Timer ──
    let remaining = GAME_DURATION;
    let over = false;

    // ── Input ──
    const keys = {};
    const onKeyDown = (e) => {
      keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    const onKeyUp = (e) => { keys[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onWheel = (e) => {
      camDist = Math.max(CAM_DIST_MIN, Math.min(CAM_DIST_MAX, camDist + e.deltaY * 0.02));
    };
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // ── Animation state ──
    let targetYaw = 0;
    let animClock = 0;
    let walkBlend = 0;

    // ── Update (runs every frame) ──
    function update(dt) {
      if (over) return;

      // timer
      remaining -= dt;
      if (remaining <= 0) {
        remaining = 0;
        over = true;
        setGameOver(true);
      }
      setTimeLeft(remaining);

      const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
      const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

      // Move relative to the fixed camera angle so controls stay consistent.
      const forwardX = -Math.sin(CAM_ANGLE);
      const forwardZ = -Math.cos(CAM_ANGLE);
      const rightX = -forwardZ;
      const rightZ = forwardX;

      let inF = 0, inR = 0;
      if (keys['KeyW'] || keys['ArrowUp']) inF += 1;
      if (keys['KeyS'] || keys['ArrowDown']) inF -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) inR += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) inR -= 1;
      const moving = inF !== 0 || inR !== 0;

      if (moving) {
        let wx = forwardX * inF + rightX * inR;
        let wz = forwardZ * inF + rightZ * inR;
        const len = Math.hypot(wx, wz);
        wx /= len; wz /= len;

        // Try to move; slide along walls by testing X and Z independently.
        const stepX = wx * speed * dt;
        const stepZ = wz * speed * dt;
        if (isWalkable(charRoot.position.x + stepX, charRoot.position.z, -CHAR_RADIUS)) {
          charRoot.position.x += stepX;
        }
        if (isWalkable(charRoot.position.x, charRoot.position.z + stepZ, -CHAR_RADIUS)) {
          charRoot.position.z += stepZ;
        }
        targetYaw = Math.atan2(wx, wz);
      }

      // Face movement direction
      let dy = targetYaw - charRoot.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      charRoot.rotation.y += dy * Math.min(1, 16 * dt);

      // Walk cycle + a little bob
      walkBlend += ((moving ? 1 : 0) - walkBlend) * Math.min(1, 10 * dt);
      animClock += dt * (sprinting ? 13 : 9) * walkBlend;
      const sw = Math.sin(animClock);
      lLegPiv.rotation.x = sw * 0.7 * walkBlend;
      rLegPiv.rotation.x = -sw * 0.7 * walkBlend;
      bodyMain.position.y = 0.85 + Math.abs(sw) * 0.06 * walkBlend;

      // Collectibles: animate + proximity pickup
      collectibles.forEach((c) => {
        c.update(dt);
        if (!c.isCollected) {
          const dx = charRoot.position.x - c.getObject().position.x;
          const dz = charRoot.position.z - c.getObject().position.z;
          if (Math.sqrt(dx * dx + dz * dz) < 0.5) {
            c.collect(scene);
            points += 10;
            setScore(points);
          }
        }
      });

      // Among Us-style follow camera (fixed angle, follows position)
      camLookAt.lerp(charRoot.position, 0.15);
      const offset = new THREE.Vector3(
        Math.sin(CAM_ANGLE) * Math.cos(CAM_PITCH) * camDist,
        Math.sin(CAM_PITCH) * camDist,
        Math.cos(CAM_ANGLE) * Math.cos(CAM_PITCH) * camDist,
      );
      camera.position.copy(camLookAt).add(offset);
      camera.lookAt(camLookAt);
    }

    // ── Loop ──
    const clock = new THREE.Clock();
    let frameId = 0;
    function animate() {
      frameId = requestAnimationFrame(animate);
      update(Math.min(clock.getDelta(), 0.05));
      renderer.render(scene, camera);
    }
    animate();

    // ── Cleanup on unmount ──
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('wheel', onWheel);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
    };
  }, []);

  // format mm:ss for the timer HUD
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(Math.floor(timeLeft % 60)).padStart(2, '0');

  return (
    <div ref={mountRef} style={{ position: 'fixed', inset: 0 }}>
      {/* Score HUD */}
      <div
        style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          color: 'white', fontSize: 36, fontFamily: "'Arial Black', sans-serif",
          background: 'rgba(0,0,0,0.5)', padding: '8px 20px', borderRadius: 8, zIndex: 999,
        }}
      >
        Score: {score}
      </div>

      {/* Timer HUD — turns red under 5 minutes */}
      <div
        style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          color: timeLeft < 300 ? '#ff4444' : 'white', fontSize: 36,
          fontFamily: "'Arial Black', sans-serif", background: 'rgba(0,0,0,0.5)',
          padding: '8px 20px', borderRadius: 8, zIndex: 999,
        }}
      >
        {mins}:{secs}
      </div>

      {/* Game over overlay */}
      {gameOver && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', color: 'white',
            fontSize: 48, fontFamily: 'monospace', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          Time is up! Game Over.
        </div>
      )}
    </div>
  );
}
