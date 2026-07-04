import { Room, Client } from "colyseus";
import { ArraySchema } from "@colyseus/schema";
import { Collectible, GameState, Player } from "../schema/GameState";
import {
    generateMaze,
    getMazeSizeForStage,
    isDeadEndCell,
    mazeIndex,
    wallForDirection,
} from "../maze/generateMaze";

interface PositionMessage {
    x?: number;
    y?: number;
}

interface CollectMessage {
    id?: string;
}

export class GameRoom extends Room<GameState> {
    maxClients = 10;
    private gameTimer: ReturnType<typeof setInterval> | null = null; 
    private readonly GAME_DURATION = 30 * 60; // 30 minutes in seconds
    private readonly SPRINT_SPEED = 4.6;
    private readonly PLAYER_RADIUS = 0.23;
    private readonly POSITION_GRACE = 0.9;
    private readonly COLLECTIBLE_SCORE = 10;
    private readonly COLLECTIBLE_PICKUP_RADIUS = 0.9;
    private isSoloMode: boolean = false; 
    private isDevMode: boolean = false;
    private gameStartTime: number = 0;
    private lastAcceptedAt = new Map<string, number>();

    onCreate(options: any) {
        console.log("GameRoom created with options:", options, "| Room ID:", this.roomId);
        
        this.setState(new GameState());
        this.isSoloMode = options?.soloMode === true;
        this.isDevMode = options?.devMode === true;
        this.setPatchRate(1000 / 60);
        this.buildMazeForStage(1);

        this.onMessage("position", (client, message: PositionMessage) => {
            this.handlePosition(client, message);
        });

        this.onMessage("collect", (client, message: CollectMessage) => {
            this.handleCollect(client, message);
        });

        this.onMessage("devStageUp", (client) => {
            if (!this.isDevMode) return;
            if (!this.state.players.has(client.sessionId)) return;
            this.advanceLevel();
        });

    }

    async onJoin(client: Client, options: any) {
        const player = new Player();
        player.sessionId = client.sessionId;
        player.name = options?.playerName || `Player ${this.state.players.size + 1}`;
        player.x = this.state.startX;
        player.y = this.state.startY;
        this.state.players.set(client.sessionId, player);
        this.lastAcceptedAt.set(client.sessionId, Date.now());

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
        this.lastAcceptedAt.delete(client.sessionId);
    }

    async onDispose() {
        console.log("room", this.roomId, "disposing...");
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
    }

    private async initializeGame() {
        this.state.gameStarted = true;
        this.buildMazeForStage(this.state.stage || 1, this.state.seed || undefined);
        this.resetPlayersToStart();
        this.generateInitialCollectibles();
        this.calculateScores(); 

        this.startGameTimer();
    }

    // TODO: timer does not count down
    private startGameTimer() {
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }

        this.state.timeRemaining = this.GAME_DURATION;
        this.gameStartTime = Date.now();
        
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
        const collectibles = new ArraySchema<Collectible>();
        const candidates: Array<{ x: number; y: number; rank: number }> = [];
        const mazeWalls = Array.from(this.state.mazeWalls);

        for (let y = 0; y < this.state.gridHeight; y++) {
            for (let x = 0; x < this.state.gridWidth; x++) {
                const distanceFromStart = Math.abs(x - this.state.startX) + Math.abs(y - this.state.startY);
                const distanceFromExit = Math.abs(x - this.state.exitX) + Math.abs(y - this.state.exitY);

                // Tunnel ends are reserved for the exit, so pickups never appear past the level beacon.
                if (isDeadEndCell(this.state.gridWidth, this.state.gridHeight, mazeWalls, x, y)) continue;
                if (distanceFromStart < 3 || distanceFromExit < 2) continue;

                candidates.push({
                    x,
                    y,
                    rank: this.hashCell(x, y),
                });
            }
        }

        candidates.sort((a, b) => a.rank - b.rank);

        const count = Math.min(candidates.length, Math.max(4, Math.min(10, this.state.stage + 4)));
        for (let i = 0; i < count; i++) {
            const cell = candidates[i];
            const collectible = new Collectible();
            collectible.id = `stage-${this.state.stage}-collectible-${i}-${cell.x}-${cell.y}`;
            collectible.x = cell.x;
            collectible.y = cell.y;
            collectible.score = this.COLLECTIBLE_SCORE;
            collectibles.push(collectible);
        }

        this.state.collectibles = collectibles;
    }

    private calculateScores() {
        // Score is event-based for now; collectible pickups increment totalScore directly.
    }

    private handleCollect(client: Client, message: CollectMessage) {
        if (!this.state.gameStarted || this.state.isGameOver) return;

        const player = this.state.players.get(client.sessionId);
        const collectibleId = typeof message.id === "string" ? message.id : "";
        if (!player || !collectibleId) return;

        const index = this.state.collectibles.findIndex((collectible) => collectible.id === collectibleId);
        if (index < 0) return;

        const collectible = this.state.collectibles[index];
        const distance = Math.hypot(player.x - collectible.x, player.y - collectible.y);
        if (distance > this.COLLECTIBLE_PICKUP_RADIUS) return;

        this.state.totalScore += collectible.score || this.COLLECTIBLE_SCORE;
        this.state.collectibles.splice(index, 1);
    }

    private handlePosition(client: Client, message: PositionMessage) {
        if (!this.state.gameStarted || this.state.countdown > 0 || this.state.isGameOver) return;

        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        const x = typeof message.x === "number" && Number.isFinite(message.x) ? message.x : NaN;
        const y = typeof message.y === "number" && Number.isFinite(message.y) ? message.y : NaN;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        if (!this.canAcceptPosition(client.sessionId, player, x, y)) {
            client.send("positionRejected", { x: player.x, y: player.y });
            return;
        }

        player.x = x;
        player.y = y;
        this.lastAcceptedAt.set(client.sessionId, Date.now());

        if (this.canAdvanceLevel(player)) {
            this.advanceLevel();
        }
    }

    private buildMazeForStage(stage: number, seed = this.createSeed()) {
        const { width, height } = getMazeSizeForStage(stage);
        const maze = generateMaze(width, height, seed);
        const mazeWalls = new ArraySchema<number>();

        maze.walls.forEach((wallMask) => mazeWalls.push(wallMask));

        this.state.stage = stage;
        this.state.seed = maze.seed;
        this.state.gridWidth = maze.width;
        this.state.gridHeight = maze.height;
        this.state.startX = maze.startX;
        this.state.startY = maze.startY;
        this.state.exitX = maze.exitX;
        this.state.exitY = maze.exitY;
        this.state.mazeWalls = mazeWalls;
        this.configureLevelObjective();
    }

    private createSeed() {
        return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    }

    private hashCell(x: number, y: number) {
        const value = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + this.state.seed * 0.0001) * 43758.5453;
        return value - Math.floor(value);
    }

    private resetPlayersToStart() {
        this.state.players.forEach((player) => {
            player.x = this.state.startX;
            player.y = this.state.startY;
        });
        const now = Date.now();
        this.state.players.forEach((_player, sessionId) => {
            this.lastAcceptedAt.set(sessionId, now);
        });
    }

    private canAcceptPosition(sessionId: string, player: Player, x: number, y: number) {
        if (!this.canOccupy(x, y)) return false;

        const now = Date.now();
        const lastAccepted = this.lastAcceptedAt.get(sessionId) ?? now;
        const elapsedSeconds = Math.max(0.05, Math.min(0.5, (now - lastAccepted) / 1000));
        const maxDistance = this.SPRINT_SPEED * elapsedSeconds + this.POSITION_GRACE;
        const distance = Math.hypot(x - player.x, y - player.y);

        return distance <= maxDistance;
    }

    private canOccupy(x: number, y: number) {
        const minX = -0.5 + this.PLAYER_RADIUS;
        const minY = -0.5 + this.PLAYER_RADIUS;
        const maxX = this.state.gridWidth - 0.5 - this.PLAYER_RADIUS;
        const maxY = this.state.gridHeight - 0.5 - this.PLAYER_RADIUS;

        if (x < minX || y < minY || x > maxX || y > maxY) return false;
        if (this.state.mazeWalls.length !== this.state.gridWidth * this.state.gridHeight) return false;

        const cellX = Math.max(0, Math.min(this.state.gridWidth - 1, Math.round(x)));
        const cellY = Math.max(0, Math.min(this.state.gridHeight - 1, Math.round(y)));
        const walls = this.state.mazeWalls[mazeIndex(this.state.gridWidth, cellX, cellY)];
        const localX = x - cellX;
        const localY = y - cellY;
        const edge = 0.5 - this.PLAYER_RADIUS;

        if (localX > edge && (walls & wallForDirection("right")) !== 0) return false;
        if (localX < -edge && (walls & wallForDirection("left")) !== 0) return false;
        if (localY > edge && (walls & wallForDirection("down")) !== 0) return false;
        if (localY < -edge && (walls & wallForDirection("up")) !== 0) return false;

        return true;
    }

    private isAtExit(player: Player) {
        return Math.hypot(player.x - this.state.exitX, player.y - this.state.exitY) < 0.35;
    }

    private canAdvanceLevel(player: Player) {
        return this.state.exitUnlocked && this.isAtExit(player);
    }

    private configureLevelObjective() {
        // Future pressure plates can set this to 3 and keep exitUnlocked false until all plates are active.
        this.state.pressurePlatesRequired = 0;
        this.state.pressurePlatesActivated = 0;
        this.state.exitUnlocked = true;
    }

    private advanceLevel() {
        const nextStage = this.state.stage + 1;
        this.buildMazeForStage(nextStage);
        this.generateInitialCollectibles();
        this.resetPlayersToStart();
        this.calculateScores();
        this.broadcast("levelComplete", {
            stage: this.state.stage,
            seed: this.state.seed,
        });
    }
}
