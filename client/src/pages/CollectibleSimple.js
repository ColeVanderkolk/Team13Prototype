// Floating, spinning collectible (was Amongusstyle/CollectibleSimple.ts).

import * as THREE from 'three';

export class CollectibleSimple {
  constructor(x, y, z) {
    // whether this collectible has been collected or not
    this.isCollected = false;
    // Y position used to calculate the float bob
    this.spawnY = y;
    // tracks how long the collectible has been floating
    this.floatTime = 0;

    // container that holds the collectible and handles spin and float
    this.spinGroup = new THREE.Group();
    this.spinGroup.position.set(x, y, z);

    // placeholder box — swap this out later for the real compass visuals
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xffd700 }),
    );
    this.spinGroup.add(box);

    // glow so it's easy to spot in the maze
    const glow = new THREE.PointLight(0xffd700, 1.0, 3);
    glow.position.y = 0.2;
    this.spinGroup.add(glow);
  }

  // call this to add the collectible to the scene
  addToScene(scene) {
    scene.add(this.spinGroup);
  }

  // used for the proximity check against the player
  getObject() {
    return this.spinGroup;
  }

  // call this every frame to animate floating and spinning
  update(deltaTime) {
    if (this.isCollected) return;
    this.floatTime += deltaTime;
    this.spinGroup.position.y = this.spawnY + Math.sin(this.floatTime * 1.5) * 0.08;
    this.spinGroup.rotation.y += deltaTime * 1.5;
  }

  // call this when the player collects the item
  collect(scene) {
    if (this.isCollected) return;
    this.isCollected = true;
    scene.remove(this.spinGroup);
  }
}
