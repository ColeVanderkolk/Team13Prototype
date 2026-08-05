import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const COLLECTIBLE_MODEL_URL = (import.meta.env.VITE_COLLECTIBLE_MODEL_URL || "").trim();
const gltfLoader = new GLTFLoader();

export class CollectibleSimple {

    //container that holds the collectible and handles spin and float
    private spinGroup: THREE.Group
    // Y position to calculate float
    private spawnY: number
    //tracks how long the collectible has been floating, used to calculate float
    private floatTime: number
    // the light that makes it glow — kept in the scene even after collecting (just dimmed to
    // zero), since removing a light from the scene forces Three.js to recompile shaders for
    // every other lit material in view, which is what was causing a stutter on pickup
    private glow!: THREE.PointLight
    // the visible mesh/model — hidden on collect instead of removed, cheap and instant
    private visual: THREE.Object3D | null = null
    //whether this collectible has been collected or not
    isCollected: boolean

    constructor(x: number, y: number, z: number) {
        this.isCollected = false
        this.spawnY = y
        this.floatTime = 0

        this.spinGroup = new THREE.Group()
        this.spinGroup.position.set(x, y, z)

        if (COLLECTIBLE_MODEL_URL) {
            gltfLoader.load(COLLECTIBLE_MODEL_URL, (gltf) => {
                const model = gltf.scene
                model.traverse((object) => {
                    if (object instanceof THREE.Mesh) {
                        object.castShadow = true
                        object.receiveShadow = true
                    }
                })
                this.visual = model
                this.spinGroup.add(model)
            })
        } else {
            // placeholder box — swap this out later for the real compass visuals
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.4, 0.4),
                new THREE.MeshStandardMaterial({ color: 0xffd700 })
            )
            this.visual = box
            this.spinGroup.add(box)
        }

        // glow so it's easy to spot in the maze
        this.glow = new THREE.PointLight(0xffd700, 1.0, 3)
        this.glow.position.y = 0.2
        this.spinGroup.add(this.glow)
    }

    //call this to add the collectible to the scene
    addToScene(scene: THREE.Scene): void {
        scene.add(this.spinGroup)
    }

    //proximity check for the player to see if they are close enough to collect this item
    getObject(): THREE.Object3D {
        return this.spinGroup
    }

    //call this every frame to animate floating and spinning
    update(deltaTime: number): void {
        if (this.isCollected) return

        this.floatTime += deltaTime
        this.spinGroup.position.y = this.spawnY + Math.sin(this.floatTime * 1.5) * 0.08
        this.spinGroup.rotation.y += deltaTime * 1.5
    }

    // call this when a player picks it up — hides it and turns its light off without touching
    // the scene graph, so it disappears instantly with no shader-recompile stutter
    collect(_scene: THREE.Scene): void {
        if (this.isCollected) return
        this.isCollected = true
        this.glow.intensity = 0
        if (this.visual) this.visual.visible = false
    }

    // full teardown — actually removes it from the scene. Only call this once it's really
    // going away for good (e.g. the level changed), not on a normal in-round pickup.
    dispose(scene: THREE.Scene): void {
        scene.remove(this.spinGroup)
    }
}
