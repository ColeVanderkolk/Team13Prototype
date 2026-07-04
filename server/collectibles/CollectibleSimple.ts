import * as THREE from 'three';

export class CollectibleSimple {

    //container that holds the collectible and handles spin and float
    private spinGroup: THREE.Group
    // Y position to calculate float
    private spawnY: number
    //tracks how long the collectible has been floating, used to calculate float
    private floatTime: number
    //whether this collectible has been collected or not
    isCollected: boolean

    constructor(x: number, y: number, z: number) {
        this.isCollected = false
        this.spawnY = y
        this.floatTime = 0

        this.spinGroup = new THREE.Group()
        this.spinGroup.position.set(x, y, z)

        // placeholder box — swap this out later for the real compass visuals
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.4, 0.4),
            new THREE.MeshStandardMaterial({ color: 0xffd700 })
        )
        this.spinGroup.add(box)

        // glow so it's easy to spot in the maze
        const glow = new THREE.PointLight(0xffd700, 1.0, 3)
        glow.position.y = 0.2
        this.spinGroup.add(glow)
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

    //call this when player collects the item to remove it from the scene and mark it as collected
    collect(scene: THREE.Scene): void {
        if (this.isCollected) return
        this.isCollected = true
        scene.remove(this.spinGroup)
    }
}
