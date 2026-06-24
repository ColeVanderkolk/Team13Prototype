export class Score {
    private points: number
    private display: HTMLDivElement

    constructor() {
        this.points = 0

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

    add(points: number): void {
        this.points += points
        this.updateDisplay()
    }   

    getScore(): number {
        return this.points
    }

    private updateDisplay(): void {
        this.display.textContent = `Score: ${this.points}`
    }
}