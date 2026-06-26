import { Room, Client } from "colyseus";
import { GameState, Player } from "../schema/GameState";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SeededRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed |= 0;
    this.seed = this.seed + 0x6D2B79F5 | 0;
    let t = Math.imul(this.seed ^ this.seed >>> 15, 1 | this.seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

interface MoveMessage {
    direction: "up" | "down" | "left" | "right";
    seq?: number;
}

export class GameRoom extends Room<GameState> {
    maxClients = 10;
    private rng: SeededRNG;
    private sessionId: string | null = null;
    private gameTimer: ReturnType<typeof setInterval> | null = null; 
    private readonly GAME_DURATION = 30 * 60; // 30 minutes in seconds
    private isSoloMode: boolean = false; 

    onCreate(options: any) {
        console.log("GameRoom created with options:", options, "| Room ID:", this.roomId);

    }

    async onJoin(client: Client, options: any) {
        const player = new Player();
        this.state = new GameState();
        this.state.players.set(client.sessionId, player);

        if (this.isSoloMode && this.state.players.size === 1 && !this.state.gameStarted) {
            this.initializeGame();
        }

        if (this.state.players.size == 3 && !this.state.gameStarted) {  
            this.initializeGame();
        } 
    }

    onLeave(client: Client, consented: boolean) { 
        console.log(client.sessionId, "left!", consented ? "(consented)" : "(disconnected)") 
        this.state.players.delete(client.sessionId);
    }

    async onDispose() {
        console.log("room", this.roomId, "disposing...");
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
    }

    private async initializeGame() {
        this.generateInitialCollectibles();
        this.calculateScores(); 

        this.startGameTimer();
    }

    private startGameTimer() {
        this.gameTimer = setInterval(() => {
            if (this.state.timeRemaining > 0) {
                this.state.timeRemaining--;
            }

            if (this.state.timeRemaining <= 0 && !this.state.isGameOver /*&& !this.isDevMode*/) {
                this.endGame();
            }
        }, 1000);
    }

    private async endGame() {
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
        this.state.isGameOver = true;

        console.log("Game ended! Final score: ", this.state.totalScore);
        
        this.disconnect(); 
    }

    private generateInitialCollectibles() {
        // TODO 
    }

    private calculateScores() {
        // TODO
    }
}