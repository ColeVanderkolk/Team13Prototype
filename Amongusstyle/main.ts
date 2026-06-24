import * as THREE from 'three';
import { Timer } from './Timer';
import { CollectibleSimple } from './CollectibleSimple';

// ─── Renderer ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const canvasEl = renderer.domElement;
canvasEl.style.position = 'fixed';
canvasEl.style.inset = '0';
canvasEl.style.zIndex = '0';
document.body.appendChild(canvasEl);

// ─── Scene ─────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0f13);

// ─── Camera ───────────────────────────
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
const CAM_ANGLE = Math.PI * 0.25; // diagonal offset direction
const CAM_PITCH = 1.05;           // tilted overhead (radians); lower = more side-on
let camDist = 22;
const camLookAt = new THREE.Vector3(0, 0, 0);

// ─── Lights ────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x8088a0, 1.3));

const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(14, 26, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  near: 1, far: 120, left: -50, right: 50, top: 50, bottom: -50,
});
scene.add(sun);

// ─── The flat 2D MAP (drawn rooms + paths on a canvas texture) ─────────────
// Map is defined in "map units". 1 map unit = 1 world unit on the ground plane.
const MAP_W = 60;
const MAP_H = 40;

interface Room {
  x: number; // center
  y: number;
  w: number;
  h: number;
  name: string;
}

// Simple room layout — edit these to redesign the map later.
const rooms: Room[] = [
  { x: -18, y: -10, w: 16, h: 12, name: '' },
  { x: 10, y: -12, w: 14, h: 10, name: '' },
  { x: 20, y: 6, w: 12, h: 12, name: '' },
  { x: -2, y: 8, w: 16, h: 10, name: '' },
  { x: -22, y: 10, w: 12, h: 10, name: '' },
];

interface Corridor { ax: number; ay: number; bx: number; by: number; width: number; }
// Corridors connect room centers (axis-aligned, drawn as thick lines).
const corridors: Corridor[] = [
  { ax: -18, ay: -10, bx: 10, by: -12, width: 3 },
  { ax: 10, ay: -12, bx: 20, by: 6, width: 3 },
  { ax: 20, ay: 6, bx: -2, by: 8, width: 3 },
  { ax: -2, ay: 8, bx: -22, by: 10, width: 3 },
  { ax: -18, ay: -10, bx: -2, by: 8, width: 3 },
];

// ── Build the map texture by drawing to an offscreen canvas ──
const PX_PER_UNIT = 24;
const mapCanvas = document.createElement('canvas');
mapCanvas.width = MAP_W * PX_PER_UNIT;
mapCanvas.height = MAP_H * PX_PER_UNIT;
const mctx = mapCanvas.getContext('2d')!;

// World (x,y in map units, origin at center) -> canvas pixels
function toPx(x: number): number { return (x + MAP_W / 2) * PX_PER_UNIT; }
function toPy(y: number): number { return (y + MAP_H / 2) * PX_PER_UNIT; }

// Background (the "void" outside rooms)
mctx.fillStyle = '#0e0f13';
mctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

// Draw corridors first (so rooms sit on top of them)
mctx.fillStyle = '#3a3f4b';
for (const c of corridors) {
  const x1 = toPx(c.ax), y1 = toPy(c.ay);
  const x2 = toPx(c.bx), y2 = toPy(c.by);
  const halfW = (c.width / 2) * PX_PER_UNIT;
  // L-shaped: horizontal segment then vertical segment
  mctx.fillRect(Math.min(x1, x2) - halfW, y1 - halfW, Math.abs(x2 - x1) + halfW * 2, halfW * 2);
  mctx.fillRect(x2 - halfW, Math.min(y1, y2) - halfW, halfW * 2, Math.abs(y2 - y1) + halfW * 2);
}

// Draw rooms
for (const r of rooms) {
  const px = toPx(r.x - r.w / 2);
  const py = toPy(r.y - r.h / 2);
  const pw = r.w * PX_PER_UNIT;
  const ph = r.h * PX_PER_UNIT;
  // floor
  mctx.fillStyle = '#4a5160';
  mctx.fillRect(px, py, pw, ph);
  // inner floor tint
  mctx.fillStyle = '#525a6b';
  mctx.fillRect(px + 6, py + 6, pw - 12, ph - 12);
  // wall outline
  mctx.strokeStyle = '#23262e';
  mctx.lineWidth = 6;
  mctx.strokeRect(px, py, pw, ph);
  // room label
  mctx.fillStyle = 'rgba(255,255,255,0.45)';
  mctx.font = `${Math.floor(PX_PER_UNIT * 1.1)}px sans-serif`;
  mctx.textAlign = 'center';
  mctx.fillText(r.name.toUpperCase(), toPx(r.x), toPy(r.y));
}

const mapTexture = new THREE.CanvasTexture(mapCanvas);
mapTexture.colorSpace = THREE.SRGBColorSpace;
mapTexture.anisotropy = 4;

// ── The flat ground plane carrying the map ──
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_W, MAP_H),
  new THREE.MeshStandardMaterial({ map: mapTexture, roughness: 1.0, metalness: 0.0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ─── Walkable test: is a world (x,z) point on a room or corridor? ───────────
function pointInRoom(x: number, z: number, pad = 0): boolean {
  for (const r of rooms) {
    if (
      x > r.x - r.w / 2 - pad && x < r.x + r.w / 2 + pad &&
      z > r.y - r.h / 2 - pad && z < r.y + r.h / 2 + pad
    ) return true;
  }
  return false;
}
function pointInCorridor(x: number, z: number, pad = 0): boolean {
  for (const c of corridors) {
    const hw = c.width / 2 + pad;
    // horizontal segment (along x at y=ay)
    if (
      x > Math.min(c.ax, c.bx) - hw && x < Math.max(c.ax, c.bx) + hw &&
      z > c.ay - hw && z < c.ay + hw
    ) return true;
    // vertical segment (along y at x=bx)
    if (
      z > Math.min(c.ay, c.by) - hw && z < Math.max(c.ay, c.by) + hw &&
      x > c.bx - hw && x < c.bx + hw
    ) return true;
  }
  return false;
}
function isWalkable(x: number, z: number, pad = 0): boolean {
  return pointInRoom(x, z, pad) || pointInCorridor(x, z, pad);
}

// ─── Character (real 3D model) ──────────────────────────────────────────────
const M = {
  body: new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.5, metalness: 0.1 }),
  dark: new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6, metalness: 0.1 }),
};

function box(
  w: number, h: number, d: number,
  mat: THREE.Material,
  px: number, py: number, pz: number,
  parent: THREE.Object3D,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(px, py, pz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function pivot(px: number, py: number, pz: number, parent: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.position.set(px, py, pz);
  parent.add(g);
  return g;
}

const charRoot = new THREE.Group();
charRoot.position.set(-18, 0, -10); // start in the Cafeteria
scene.add(charRoot);

// A little bean: rounded body + two legs
const bodyMain = box(0.9, 1.1, 0.7, M.body, 0, 0.85, 0, charRoot);
const lLegPiv = pivot(-0.22, 0.35, 0, charRoot);
const rLegPiv = pivot(0.22, 0.35, 0, charRoot);
box(0.28, 0.4, 0.32, M.dark, 0, -0.2, 0, lLegPiv);
box(0.28, 0.4, 0.32, M.dark, 0, -0.2, 0, rLegPiv);

// ─── Timer & Collectibles ───────────────────────────────────────────────────
const timer = new Timer(30 * 60, () => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        color: white;
        font-size: 48px;
        font-family: monospace;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `
    overlay.textContent = 'Time is up! Game Over.';
    document.body.appendChild(overlay);
});
timer.start();

const collectibles = [
  new CollectibleSimple(-18, 1, -10),
  new CollectibleSimple(10,  1, -12),
  new CollectibleSimple(20,  1,   6),
  new CollectibleSimple(-2,  1,   8),
  new CollectibleSimple(-22, 1,  10),
];
collectibles.forEach(c => c.addToScene(scene));

// ─── Input ─────────────────────────────────────────────────────────────────
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

renderer.domElement.addEventListener('wheel', (e) => {
  camDist = Math.max(12, Math.min(40, camDist + e.deltaY * 0.02));
}, { passive: true });

// ─── State ──────────────────────────────────────────────────────────────────
const WALK_SPEED = 6.0;
const SPRINT_SPEED = 10.5;
let targetYaw = 0;
let animClock = 0;
let walkBlend = 0;
const CHAR_RADIUS = 0.45;

// ─── Resize ────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Update ────────────────────────────────────────────────────────────────
function update(dt: number): void {
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
    // Negative pad shrinks the walkable area by the character's radius so the
    // body edge (not just the center) stops at walls.
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

  timer.update();
  collectibles.forEach(c => {
    c.update(dt);
    if (!c.isCollected) {
      if (charRoot.position.distanceTo(c.getObject().position) < 0.6) {
        c.collect(scene);
      }
    }
  });

  // ── Among Us-style follow camera (fixed angle, follows position) ──
  camLookAt.lerp(charRoot.position, 0.15);
  const offset = new THREE.Vector3(
    Math.sin(CAM_ANGLE) * Math.cos(CAM_PITCH) * camDist,
    Math.sin(CAM_PITCH) * camDist,
    Math.cos(CAM_ANGLE) * Math.cos(CAM_PITCH) * camDist,
  );
  camera.position.copy(camLookAt).add(offset);
  camera.lookAt(camLookAt);
}

// ─── Loop ──────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
function animate(): void {
  requestAnimationFrame(animate);
  update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
}
animate();
