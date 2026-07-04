// Builds the 3D "bean" character (body + two animated legs).
// Returns the pieces the game loop needs to move and animate it.

import * as THREE from 'three';
import { SPAWN } from './mapData';

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

export function createCharacter() {
  const M = {
    body: new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.5, metalness: 0.1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6, metalness: 0.1 }),
  };

  const charRoot = new THREE.Group();
  charRoot.position.set(SPAWN.x, 0, SPAWN.z);

  // A little bean: rounded body + two legs
  const bodyMain = box(0.9, 1.1, 0.7, M.body, 0, 0.85, 0, charRoot);
  const lLegPiv = pivot(-0.22, 0.35, 0, charRoot);
  const rLegPiv = pivot(0.22, 0.35, 0, charRoot);
  box(0.28, 0.4, 0.32, M.dark, 0, -0.2, 0, lLegPiv);
  box(0.28, 0.4, 0.32, M.dark, 0, -0.2, 0, rLegPiv);

  return { charRoot, bodyMain, lLegPiv, rLegPiv };
}
