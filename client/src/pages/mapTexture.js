// Draws the flat 2D map (rooms + corridors) onto an offscreen canvas and
// returns it as a THREE.CanvasTexture to put on the ground plane.
// Later you can swap this for a real map image loaded with THREE.TextureLoader.

import * as THREE from 'three';
import { MAP_W, MAP_H, rooms, corridors } from './mapData';

const PX_PER_UNIT = 24;

export function createMapTexture() {
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = MAP_W * PX_PER_UNIT;
  mapCanvas.height = MAP_H * PX_PER_UNIT;
  const mctx = mapCanvas.getContext('2d');

  // World (x,y in map units, origin at center) -> canvas pixels
  const toPx = (x) => (x + MAP_W / 2) * PX_PER_UNIT;
  const toPy = (y) => (y + MAP_H / 2) * PX_PER_UNIT;

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
  return mapTexture;
}

// Builds the flat ground plane mesh carrying the map texture.
export function createGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W, MAP_H),
    new THREE.MeshStandardMaterial({
      map: createMapTexture(),
      roughness: 1.0,
      metalness: 0.0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}
