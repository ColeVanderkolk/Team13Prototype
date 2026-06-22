// Character Movement Demo
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.insertBefore(renderer.domElement, document.body.firstChild);

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1120);
scene.fog = new THREE.FogExp2(0x0b1120, 0.018);

// Camera Setup
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

// Lighting Setup
scene.add(new THREE.AmbientLight(0x2a4060, 1.2));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.8);
sun.position.set(20, 35, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near: 1, far: 120, left: -40, right: 40, top: 40, bottom: -40 });
scene.add(sun);

// Rim light for character
const rimLight = new THREE.DirectionalLight(0x3366ff, 0.6);
rimLight.position.set(-15, 8, -15);
scene.add(rimLight);

// Ground and Grid
const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.95, metalness: 0.03 })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Grid Helper
const grid = new THREE.GridHelper(120, 60, 0x162033, 0x0f1727);
grid.position.y = 0.01;
scene.add(grid);

// Props
const propColors = [0x3c4f63, 0x304059, 0x4f6279, 0x223045];
const collisionBoxes = [];
for (let i = 0; i < 30; i++) {
  const h = 0.4 + Math.random() * 2.5;
  const w = 0.6 + Math.random() * 0.8;
  const d = w * (0.7 + Math.random() * 0.6);
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color: propColors[i % propColors.length],
      roughness: 0.5,
      metalness: 0.3
    })
  );
  const angle = Math.random() * Math.PI * 2;
  const dist = 10 + Math.random() * 25;
  box.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
  box.rotation.y = Math.random() * Math.PI;
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
  collisionBoxes.push({ mesh: box, halfWidth: w / 2, halfHeight: h / 2, halfDepth: d / 2 });
}

// Character Setup
const M = {
  body: new THREE.MeshStandardMaterial({ color: 0x6ee7f7, roughness: 0.4, metalness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1a3a50, roughness: 0.65, metalness: 0.2 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.4, emissive: 0xff2222, emissiveIntensity: 0.25 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x000a12 }),
};

// Helper functions to create boxes and pivots
function box(w, h, d, mat, px, py, pz, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(px, py, pz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function pivot(px, py, pz, parent) {
  const g = new THREE.Group();
  g.position.set(px, py, pz);
  parent.add(g);
  return g;
}

// Character Model
const charRoot = new THREE.Group();
scene.add(charRoot);

const torso = box(0.62, 0.72, 0.36, M.body, 0, 1.16, 0, charRoot);
const stripe = box(0.10, 0.52, 0.37, M.accent, 0, 1.14, 0, charRoot);
const hips = box(0.68, 0.26, 0.38, M.dark, 0, 0.78, 0, charRoot);
const head = box(0.44, 0.44, 0.44, M.body, 0, 1.74, 0, charRoot);
box(0.09, 0.09, 0.06, M.eye, -0.10, 1.77, 0.23, charRoot);
box(0.09, 0.09, 0.06, M.eye, 0.10, 1.77, 0.23, charRoot);

const lArmPiv = pivot(-0.41, 1.44, 0, charRoot);
const rArmPiv = pivot(0.41, 1.44, 0, charRoot);
const lArm = box(0.18, 0.56, 0.18, M.dark, 0, -0.28, 0, lArmPiv);
const rArm = box(0.18, 0.56, 0.18, M.dark, 0, -0.28, 0, rArmPiv);
box(0.14, 0.38, 0.14, M.body, 0, -0.48, 0, lArm);
box(0.14, 0.38, 0.14, M.body, 0, -0.48, 0, rArm);

const lLegPiv = pivot(-0.17, 0.65, 0, charRoot);
const rLegPiv = pivot(0.17, 0.65, 0, charRoot);
const lLeg = box(0.22, 0.60, 0.22, M.dark, 0, -0.30, 0, lLegPiv);
const rLeg = box(0.22, 0.60, 0.22, M.dark, 0, -0.30, 0, rLegPiv);
box(0.25, 0.10, 0.34, M.body, 0, -0.30, 0.05, lLeg);
box(0.25, 0.10, 0.34, M.body, 0, -0.30, 0.05, rLeg);

// Character Lighting
const charLight = new THREE.PointLight(0x6ee7f7, 0.6, 4);
charLight.position.y = 1.5;
charRoot.add(charLight);

// Input Handling
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('keydown', e => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});

// Camera Control Variables
let camYaw = Math.PI;
let camPitch = 0.38;
let camDist = 8;
let camYawVel = 0;
let camPitchVel = 0;
let isDragging = false;
let lastMX = 0, lastMY = 0;
const PITCH_MIN = -0.35;
const PITCH_MAX = 0.75;
const FP_THRESHOLD = 1.8;
const CAM_DAMPING = 0.88;
const domEl = renderer.domElement;
domEl.style.cursor = 'grab';
domEl.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  domEl.requestPointerLock();
});

// Pointer Lock and Mouse Movement Handling
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === domEl;
  isDragging = locked;
  domEl.style.cursor = locked ? 'none' : 'grab';
});

// Touch and Mouse Movement Handling
document.addEventListener('pointerlockerror', () => {
  isDragging = false;
  domEl.style.cursor = 'auto';
});

// Mouse and Touch Movement Handling
document.addEventListener('mouseup', () => {
  if (!document.pointerLockElement) isDragging = false;
});

// Mouse Movement Handling
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== domEl) return;
  const deltaX = e.movementX || 0;
  const deltaY = e.movementY || 0;
  camYawVel   -= deltaX * 0.0005;
  camPitchVel -= deltaY * 0.0005;
});
domEl.addEventListener('wheel', e => {
  camDist = Math.max(0, Math.min(20, camDist + e.deltaY * 0.02));
}, { passive: true });

domEl.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    isDragging = true;
    lastMX = e.touches[0].clientX;
    lastMY = e.touches[0].clientY;
  }
}, { passive: true });
domEl.addEventListener('touchend', () => { isDragging = false; });
domEl.addEventListener('touchmove', e => {
  if (!isDragging || e.touches.length !== 1) return;
  const deltaX = e.touches[0].clientX - lastMX;
  const deltaY = e.touches[0].clientY - lastMY;
  camYawVel   -= deltaX * 0.0006;
  camPitchVel -= deltaY * 0.0006;
  lastMX = e.touches[0].clientX; lastMY = e.touches[0].clientY;
}, { passive: true });

// Character Movement Variables
const WALK_SPEED = 4.5;
const SPRINT_SPEED = 8.5;
const JUMP_VEL = 8.0;
const GRAVITY = 20.0;
const FRICTION = 0.0;
const vel = new THREE.Vector3();
let onGround = true;
let targetYaw = 0;
let animClock = 0;
let walkBlend = 0;
const camLookAt = new THREE.Vector3(0, 1.2, 0);

// Collision Detection Constants
const CHAR_RADIUS = 0.35;
const FLOOR_Y = 0;
const STEP_HEIGHT = 0.75;
// Collision Detection Function
function checkCollisions() {
  let supportY = FLOOR_Y;

  for (const box of collisionBoxes) {
    const dx = charRoot.position.x - box.mesh.position.x;
    const dz = charRoot.position.z - box.mesh.position.z;
    const absX = Math.abs(dx);
    const absZ = Math.abs(dz);

    if (absX < box.halfWidth + CHAR_RADIUS && absZ < box.halfDepth + CHAR_RADIUS) {
      const boxTop = box.mesh.position.y + box.halfHeight;
      const footY = charRoot.position.y - 0.1;

      if (footY <= boxTop && footY >= boxTop - STEP_HEIGHT) {
        supportY = Math.max(supportY, boxTop);
      } else if (footY < boxTop) {
        const horDist = Math.sqrt(dx * dx + dz * dz);
        if (horDist > 0) {
          const boxRadius = Math.sqrt(box.halfWidth * box.halfWidth + box.halfDepth * box.halfDepth);
          const minDist = CHAR_RADIUS + boxRadius;
          const pushDist = minDist - horDist + 0.02;
          if (pushDist > 0) {
            charRoot.position.x += (dx / horDist) * pushDist;
            charRoot.position.z += (dz / horDist) * pushDist;
          }
        }
      }
    }
  }

  return supportY;
}

// Handle Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Update Function
function update(dt) {
  const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

  const forwardX = -Math.sin(camYaw);
  const forwardZ = -Math.cos(camYaw);
  const rightX = -forwardZ;
  const rightZ = forwardX;

  let inF = 0, inR = 0;
  if (keys['KeyW'] || keys['ArrowUp']) inF += 1;
  if (keys['KeyS'] || keys['ArrowDown']) inF -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) inR += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) inR -= 1;
  const moving = (inF !== 0 || inR !== 0);

  if (moving) {
    let wx = forwardX * inF + rightX * inR;
    let wz = forwardZ * inF + rightZ * inR;
    const len = Math.hypot(wx, wz);
    wx /= len; wz /= len;
    vel.x = wx * speed;
    vel.z = wz * speed;
    targetYaw = Math.atan2(wx, wz);
  } else {
    vel.x = 0;
    vel.z = 0;
  }

  if (keys['Space'] && onGround) {
    vel.y = JUMP_VEL;
    onGround = false;
  }

  if (!onGround) vel.y -= GRAVITY * dt;

  charRoot.position.x += vel.x * dt;
  charRoot.position.y += vel.y * dt;
  charRoot.position.z += vel.z * dt;
// Collision Detection and Ground Support
  const supportY = checkCollisions();
  if (charRoot.position.y <= supportY) {
    charRoot.position.y = supportY;
    vel.y = 0;
    onGround = true;
  } else {
    onGround = false;
  }
// Character Rotation
  let dy = targetYaw - charRoot.rotation.y;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const turnRate = (camDist < FP_THRESHOLD) ? 30 : 14;
  charRoot.rotation.y += dy * Math.min(1, turnRate * dt);
  // Camera Update
  camYaw += camYawVel;
  camPitch += camPitchVel;
  camPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, camPitch));
  camYawVel *= CAM_DAMPING;
  camPitchVel *= CAM_DAMPING;
// Character Animation
  walkBlend += ((moving ? 1 : 0) - walkBlend) * Math.min(1, 9 * dt);
  animClock += dt * (sprinting ? 10 : 6) * walkBlend;
  const sw = Math.sin(animClock);
  const leg = 0.58;
  const arm = 0.48;
// Apply Animation to Limbs
  lLegPiv.rotation.x = sw * leg * walkBlend;
  rLegPiv.rotation.x = -sw * leg * walkBlend;
  lArmPiv.rotation.x = -sw * arm * walkBlend;
  rArmPiv.rotation.x = sw * arm * walkBlend;
// Apply Breathing and Bobbing
  const breath = Math.sin(Date.now() * 0.0009) * 0.016 * (1 - walkBlend);
  const bob = Math.abs(sw) * 0.035 * walkBlend;
  const lift = breath + bob;
  torso.position.y = 1.16 + lift;
  head.position.y = 1.74 + lift;
// Apply Scaling for Jumping and Landing
  const scaleY = onGround ? 1.0 : (vel.y > 0 ? 1.08 : 0.95);
  const scaleXZ = onGround ? 1.0 : (vel.y > 0 ? 0.93 : 1.04);
  charRoot.scale.set(scaleXZ, scaleY, scaleXZ);
// Camera Positioning
  const headPos = charRoot.position.clone().add(new THREE.Vector3(0, 1.75, 0));
  const firstPerson = camDist < FP_THRESHOLD;
// Update Camera Position and Orientation
  if (firstPerson) {
    camLookAt.lerp(headPos, 0.4);
    camera.position.copy(camLookAt);
    const fy = charRoot.rotation.y;
    const lookDir = new THREE.Vector3(
      Math.sin(fy) * Math.cos(camPitch),
      -Math.sin(camPitch) + 0.1,
      Math.cos(fy) * Math.cos(camPitch)
    );
    camera.lookAt(camLookAt.clone().add(lookDir));
    head.visible = false;
    torso.visible = false;
  } else {
    head.visible = true;
    torso.visible = true;
// Update Camera Position and Orientation for Third-Person View
    const lookTarget = charRoot.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    camLookAt.lerp(lookTarget, 0.12);
// Calculate Desired Camera Position Based on Yaw, Pitch, and Distance
    let desired = new THREE.Vector3(
      Math.sin(camYaw) * Math.cos(camPitch) * camDist,
      Math.sin(camPitch) * camDist + 0.5,
      Math.cos(camYaw) * Math.cos(camPitch) * camDist
    );
    let camPos = camLookAt.clone().add(desired);

    const MIN_Y = 0.4;
    if (camPos.y < MIN_Y) camPos.y = MIN_Y;

    camera.position.copy(camPos);
    camera.lookAt(camLookAt);
  }
}
// Animation Loop
const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);
  update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
})();
