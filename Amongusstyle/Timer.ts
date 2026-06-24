export class Timer {
    private remainingSeconds: number
    private running: boolean
    private lastTime: number
    private onExpire: () => void
    private display: HTMLDivElement

    constructor(durationSeconds: number, onExpire: () => void) {
        this.remainingSeconds = durationSeconds
        this.running = false
        this.lastTime = 0
        this.onExpire = onExpire

        this.display = document.createElement('div')
        this.display.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            color: white;
            font-size: 36px;
            font-family: 'Arial Black', sans-serif;
            background: rgba(0,0,0,0.5);
            padding: 8px 20px;
            border-radius: 8px;
            z-index: 999;
        `
        document.body.appendChild(this.display)
        this.updateDisplay()
    }

    start(): void {
        this.running = true
        this.lastTime = performance.now() // performance.now() gives us a precise timestamp in milliseconds
    }

    update(): void {
        if (!this.running) return

        const now = performance.now()
        // delta is how many seconds passed since the last frame, dividing by 1000 converts ms to seconds
        const delta = (now - this.lastTime) / 1000
        this.lastTime = now

        this.remainingSeconds -= delta

        if (this.remainingSeconds <= 0) {
            this.remainingSeconds = 0
            this.running = false
            this.updateDisplay()
            this.onExpire()
            return
        }

        this.updateDisplay()
    }

    private updateDisplay(): void {
        // split total seconds into minutes and leftover seconds
        const mins = Math.floor(this.remainingSeconds / 60)
        const secs = Math.floor(this.remainingSeconds % 60)

        // padStart adds a leading zero so it shows "09" instead of "9"
        const minStr = String(mins).padStart(2, '0')
        const secStr = String(secs).padStart(2, '0')

        this.display.textContent = `${minStr}:${secStr}`
        // turns red under 5 minutes
        this.display.style.color = this.remainingSeconds < 300 ? '#ff4444' : 'white'
    }
}
