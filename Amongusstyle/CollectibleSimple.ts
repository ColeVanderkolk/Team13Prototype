import * as THREE from 'three'

export class CollectibleSimple {
    private spinGroup: THREE.Group
    private spawnY: number
    private floatTime: number
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

    addToScene(scene: THREE.Scene): void {
        scene.add(this.spinGroup)
    }

    getObject(): THREE.Object3D {
        return this.spinGroup
    }

    update(deltaTime: number): void {
        if (this.isCollected) return

        this.floatTime += deltaTime
        this.spinGroup.position.y = this.spawnY + Math.sin(this.floatTime * 1.5) * 0.08
        this.spinGroup.rotation.y += deltaTime * 1.5
    }

    collect(scene: THREE.Scene): void {
        if (this.isCollected) return
        this.isCollected = true
        scene.remove(this.spinGroup)
    }

    respawn(scene: THREE.Scene): void {
        this.isCollected = false
        this.floatTime = 0
        scene.add(this.spinGroup)
    }
}
