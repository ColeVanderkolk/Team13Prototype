export class Score {
    //tracks the score and displays it on the screen
    private points: number
    private display: HTMLDivElement

    constructor() {
        // Initialize score to 0
        this.points = 0
        
        //creates score box
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

    //call this when a collectible is collected to add points to the score
    add(points: number): void {
        this.points += points
        this.updateDisplay()
    }   

    //call this to get the current score
    getScore(): number {
        return this.points
    }

    //updates the score display on the screen
    private updateDisplay(): void {
        this.display.textContent = `Score: ${this.points}`
    }
}