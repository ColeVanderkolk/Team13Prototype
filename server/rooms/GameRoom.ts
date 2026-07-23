import { Room, Client } from "colyseus";
import { ArraySchema } from "@colyseus/schema";
import { Collectible, GameState, GraffitiStroke, Player } from "../schema/GameState";
import {
    ALL_WALLS,
    generateMaze,
    getMazeSizeForStage,
    isDeadEndCell,
    mazeIndex,
    wallForDirection,
} from "../maze/generateMaze";

const WALL_DIRECTIONS = [
    wallForDirection("up"),
    wallForDirection("right"),
    wallForDirection("down"),
    wallForDirection("left"),
];

interface PositionMessage {
    x?: number;
    y?: number;
}

interface DrawStrokeMessage {
    wallKey?: string;
    points?: number[];
    eraser?: boolean;
    side?: number;
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
    // Streak scoring: base points for clearing a level (x stage, x streak multiplier),
    // the fraction of collectibles needed to keep the streak alive, and the streak cap
    // so late levels can't completely dwarf early ones.
    private readonly LEVEL_CLEAR_SCORE = 100;
    private readonly STREAK_COLLECT_FRACTION = 0.5;
    private readonly STREAK_CAP = 5;
    private readonly COLLECTIBLE_PICKUP_RADIUS = 0.7; // used for key pickup — leave as-is
    private readonly SCORE_COLLECTIBLE_RADIUS = 0.4; // tighter radius, score collectibles only
    private isSoloMode: boolean = false; 
    private isDevMode: boolean = false;
    private gameStartTime: number = 0;
    private lastAcceptedAt = new Map<string, number>();
    private countdownTimer: ReturnType<typeof setInterval> | null = null;
    private readonly PLATE_RADIUS = 0.2;
    // Registry of party codes currently in use, shared across rooms via presence
    private static readonly PARTY_CODE_CHANNEL = "$fyw-party-codes";
    // No 0/O or 1/I/L, so codes are unambiguous when shared out loud or handwritten
    private static readonly PARTY_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private readonly LEVER_RADIUS = 0.55;
    private strokeCounter = 0;
    private readonly STROKE_MAX_POINTS = 64;
    private readonly STROKE_MAX_PER_WALL = 24;
    private readonly STROKE_MAX_TOTAL = 600;
    private abandonGameVotes: Map<string, {sessionId: string; timestamp: number}> = new Map();
    private abandonGameVoteTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly ABANDON_GAME_VOTE_WINDOW = 10000;
    private abandonTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly ABANDON_TIMEOUT = 2 * 60 * 1000;

    async onCreate(options: any) {
        // Replace Colyseus's default long, case-sensitive room id with a short
        // shareable party code that matches the main menu's 5-character input
        this.roomId = await this.generatePartyCode();
        console.log("GameRoom created with options:", options, "| Room ID:", this.roomId);
        
        this.setState(new GameState());
        this.isSoloMode = options?.soloMode === true;
        this.isDevMode = options?.devMode === true;
        // the game is designed around exactly 1 (solo) or 3 (multiplayer) players — nothing
        // else in the room actually enforced this, so a 4th+ person could freely join
        this.maxClients = this.isSoloMode ? 1 : 3;
        // 20Hz matches the client's position send rate; remote players are already
        // visually smoothed, and 3x fewer patches means far fewer client re-renders
        this.setPatchRate(1000 / 20);

        this.onMessage("position", (client, message: PositionMessage) => {
            this.handlePosition(client, message);
        });

        this.onMessage("drawStroke", (client, message: DrawStrokeMessage) => {
            this.handleDrawStroke(client, message);
        });

        this.onMessage("collect", (client, message: CollectMessage) => {
            this.handleCollect(client, message);
        });

        this.onMessage("pullLever", (client) => {
            this.handlePullLever(client);
        });

        this.onMessage("collectKey", (client, message: {index?: number}) => {
            this.handleCollectKey(client, message);
        });

        this.onMessage("devStageUp", (client) => {
            if (!this.isDevMode) return;
            if (!this.state.players.has(client.sessionId)) return;
            this.advanceLevel();
        });

        // handle abandon game vote
        this.onMessage("abandonGame", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !this.state.gameStarted || this.state.isGameOver) return;

            // In solo mode, immediately abandon
            if (this.isSoloMode) {
                this.executeAbandonGame();
                return;
            }

            // Check if this player already voted
            if (this.abandonGameVotes.has(client.sessionId)) return;

            const isFirstVote = this.abandonGameVotes.size === 0;

            // Record this player's vote
            this.abandonGameVotes.set(client.sessionId, {
                sessionId: client.sessionId,
                timestamp: Date.now()
            });

            // Count active (non-spectator) players
            // const activePlayers = this.state.players.keys();
            const requiredVotes = this.state.players.size;

            // If first vote, start the timer and notify all players
            if (isFirstVote) {
                this.startAbandonGameVoteTimer();

                this.broadcast("abandonGameVoteStarted", {
                // initiatorColor: player.color,
                expiresAt: Date.now() + this.ABANDON_GAME_VOTE_WINDOW
                });
            }

            // Broadcast updated vote count
            this.broadcast("abandonGameVoteUpdate", {
                voterColor: player.sessionId,
                voteCount: this.abandonGameVotes.size,
                requiredVotes
            });

            // Check if all active players have voted
            if (this.abandonGameVotes.size >= requiredVotes) {
                this.executeAbandonGame();
            }
            });
    }

    async onJoin(client: Client, options: any) {
        const player = new Player();
        player.sessionId = client.sessionId;
        player.name = options?.playerName || `Player ${this.state.players.size + 1}`;
        player.x = this.state.startX;
        player.y = this.state.startY;
        player.slot = this.assignSlot();
        this.state.players.set(client.sessionId, player);
        this.lastAcceptedAt.set(client.sessionId, Date.now());

        if (this.isSoloMode && this.state.players.size === 1 && !this.state.gameStarted) {
            this.initializeGame();
            this.startGameplay();
        }

        if (this.state.players.size == 3 && !this.state.gameStarted) {  
            this.initializeGame();
            this.startGameplay();
        } 

        if (!this.isSoloMode) {
            this.broadcast("playerCountUpdate", {
                count: this.state.players.size,
                required: 3,
            });
        }
    }

    // lowest slot number not currently held by anyone — assigned once per player at join,
    // never recalculated later, so one player leaving can't reassign anyone else's color
    private assignSlot(): number {
        const usedSlots = new Set<number>();
        this.state.players.forEach((p) => usedSlots.add(p.slot));

        let slot = 0;
        while (usedSlots.has(slot)) slot++;
        return slot;
    }

    onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left!", consented ? "(consented)" : "(disconnected)") 
        this.state.players.delete(client.sessionId);
        this.lastAcceptedAt.delete(client.sessionId);

        if (!this.isSoloMode) {
            this.broadcast("playerCountUpdate", {
                count: this.state.players.size,
                required: 3,
            });
        }
    }

    async onDispose() {
        await this.presence.srem(GameRoom.PARTY_CODE_CHANNEL, this.roomId);
        console.log("room", this.roomId, "disposing...");
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
    }

    private startAbandonGameVoteTimer() {
        if (this.abandonGameVoteTimer) {
            clearTimeout(this.abandonGameVoteTimer);
        }

        this.abandonGameVoteTimer = setTimeout(() => {
        this.abandonGameVotes.clear();
        this.abandonGameVoteTimer = null;

        this.broadcast("abandonGameVoteExpired", {});
        console.log("Abandon game vote expired - not enough votes");
        }, this.ABANDON_GAME_VOTE_WINDOW);
    }

    private async executeAbandonGame() {
        // Clear the timer
        if (this.abandonGameVoteTimer) {
        clearTimeout(this.abandonGameVoteTimer);
        this.abandonGameVoteTimer = null;
        }

        // Reset votes
        this.abandonGameVotes.clear();

        console.log("Game abandoned by unanimous vote!");

        if (this.gameTimer) {
        clearInterval(this.gameTimer);
        this.gameTimer = null;
        }

        // Notify all players — clients will call room.leave() on receiving this
        this.broadcast("gameAbandoned", {});

        // End the game as abandoned
        this.state.isGameOver = true;
        this.disconnect();
    }

    private async generatePartyCode(): Promise<string> {
        const inUse = await this.presence.smembers(GameRoom.PARTY_CODE_CHANNEL);
        let code = "";
        do {
            code = Array.from(
                { length: 5 },
                () => GameRoom.PARTY_CODE_CHARS[Math.floor(Math.random() * GameRoom.PARTY_CODE_CHARS.length)],
            ).join("");
        } while (inUse.includes(code));
        await this.presence.sadd(GameRoom.PARTY_CODE_CHANNEL, code);
        return code;
    }

    private startGameplay() {
        console.log("Starting countdown...");

        this.state.countdown = 10;
        this.countdownTimer = setInterval(() => {
            // Explicit assignment so @colyseus/schema always encodes a patch (postfix -- can miss updates in some builds).
            const next = this.state.countdown - 1;
            this.state.countdown = next;
            if (next <= 0) {
                if (this.countdownTimer) {
                    clearInterval(this.countdownTimer);
                    this.countdownTimer = null;
                }
                this.state.timeRemaining = this.GAME_DURATION;
                this.gameStartTime = Date.now();
                this.startGameTimer();
                console.log("Countdown complete — game timer started!");
            }
        }   , 1000);
    }

    private async initializeGame() {
        this.state.gameStarted = true;
        this.buildMazeForStage(this.state.stage || 1, this.state.seed || undefined);
        this.resetPlayersToStart();
        this.generateInitialCollectibles();
        this.calculateScores(); 

    }

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

        // give the isGameOver patch time to actually reach every client before the connection
        // closes — disconnecting immediately can race the state broadcast, leaving a client
        // stuck on a frozen screen that never learns the game ended
        await new Promise((resolve) => setTimeout(resolve, 500));

        this.disconnect();
    }

    // this level's actual obstacle positions (whichever type is active), so collectibles can
    // be kept clear of them — interacting with a collectible and an obstacle almost
    // simultaneously was causing bugs
    private getObstaclePositions(): { x: number; y: number }[] {
        const positions: { x: number; y: number }[] = [];

        if (this.state.obstacleType === "pressurePlates" || this.state.obstacleType === "keys") {
            const plates = [
                { x: this.state.plate0X, y: this.state.plate0Y },
                { x: this.state.plate1X, y: this.state.plate1Y },
                { x: this.state.plate2X, y: this.state.plate2Y },
            ];
            for (const p of plates) if (p.x >= 0) positions.push(p);
        }

        if (this.state.obstacleType === "keys") {
            const keys = [
                { x: this.state.key0X, y: this.state.key0Y },
                { x: this.state.key1X, y: this.state.key1Y },
                { x: this.state.key2X, y: this.state.key2Y },
            ];
            for (const k of keys) if (k.x >= 0) positions.push(k);
        }

        if (this.state.obstacleType === "levers") {
            for (let i = 0; i < this.state.leverCellX.length; i++) {
                positions.push({ x: this.state.leverCellX[i], y: this.state.leverCellY[i] });
            }
        }

        return positions;
    }

    private generateInitialCollectibles() {
        const MIN_DIST_FROM_OBSTACLE = 2;
        const collectibles = new ArraySchema<Collectible>();
        const candidates: Array<{ x: number; y: number; rank: number }> = [];
        const mazeWalls = Array.from(this.state.mazeWalls);
        const obstaclePositions = this.getObstaclePositions();

        for (let y = 0; y < this.state.gridHeight; y++) {
            for (let x = 0; x < this.state.gridWidth; x++) {
                const distanceFromStart = Math.abs(x - this.state.startX) + Math.abs(y - this.state.startY);
                const distanceFromExit = Math.abs(x - this.state.exitX) + Math.abs(y - this.state.exitY);

                // Tunnel ends are reserved for the exit, so pickups never appear past the level beacon.
                if (isDeadEndCell(this.state.gridWidth, this.state.gridHeight, mazeWalls, x, y)) continue;
                if (distanceFromStart < 3 || distanceFromExit < 2) continue;

                const tooCloseToObstacle = obstaclePositions.some(
                    (o) => Math.abs(x - o.x) + Math.abs(y - o.y) < MIN_DIST_FROM_OBSTACLE,
                );
                if (tooCloseToObstacle) continue;

                candidates.push({
                    x,
                    y,
                    rank: this.hashCell(x, y),
                });
            }
        }

        candidates.sort((a, b) => a.rank - b.rank);

        const count = Math.min(candidates.length, Math.max(4, Math.min(10, this.state.stage + 4)));

        // pick candidates spread out from each other (at least 3 cells apart), so a player
        // can't just sweep several of them in one straight run down a single path
        const picks: { x: number; y: number }[] = [];
        for (const c of candidates) {
            if (picks.every(p => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) >= 3)) {
                picks.push(c);
                if (picks.length === count) break;
            }
        }
        // fallback if the maze is too small to find enough spread-out candidates
        for (let i = 0; i < candidates.length && picks.length < count; i++) {
            const c = candidates[i];
            if (picks.some(p => p.x === c.x && p.y === c.y)) continue;
            picks.push(c);
        }

        for (let i = 0; i < picks.length; i++) {
            const cell = picks[i];
            const collectible = new Collectible();
            collectible.id = `stage-${this.state.stage}-collectible-${i}-${cell.x}-${cell.y}`;
            collectible.x = cell.x;
            collectible.y = cell.y;
            collectible.score = this.COLLECTIBLE_SCORE;
            collectibles.push(collectible);
        }

        this.state.collectibles = collectibles;
        this.state.collectiblesSpawnedThisLevel = collectibles.length;
        this.state.collectiblesCollectedThisLevel = 0;
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
        if (distance > this.SCORE_COLLECTIBLE_RADIUS) return;

        this.state.collectiblesCollectedThisLevel += 1;
        this.state.totalScore += (collectible.score || this.COLLECTIBLE_SCORE) * this.state.scoreMultiplier;
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
        this.checkPressurePlates();
        this.checkExitAdvance();
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
        this.state.graffiti.clear();
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
        // small fixed offsets so players spawn spread around the start cell instead of stacked
        // on top of each other — kept well under the 0.27 wall-safety margin used in canOccupy,
        // so this is safe regardless of which walls the maze generator put around the start cell
        const SPAWN_OFFSETS: Array<{ x: number; y: number }> = [
            { x: -0.2, y: -0.12 },
            { x: 0.2, y: -0.12 },
            { x: 0, y: 0.2 },
        ];

        // each player's spawn spot is their own permanent slot, so it stays consistent with
        // their assigned color every level regardless of who else joins or leaves
        this.state.players.forEach((player) => {
            const offset = this.isSoloMode ? { x: 0, y: 0 } : (SPAWN_OFFSETS[player.slot] ?? { x: 0, y: 0 });
            player.x = this.state.startX + offset.x;
            player.y = this.state.startY + offset.y;
        });

        const now = Date.now();
        this.state.players.forEach((_player, sessionId) => {
            this.lastAcceptedAt.set(sessionId, now);
        });
    }

    private canAcceptPosition(sessionId: string, player: Player, x: number, y: number) {
        if (this.isDevMode) {
            // Dev rooms allow noclip: skip wall checks but stay inside the board
            const min = -0.5 + this.PLAYER_RADIUS;
            if (x < min || y < min) return false;
            if (x > this.state.gridWidth - 0.5 - this.PLAYER_RADIUS) return false;
            if (y > this.state.gridHeight - 0.5 - this.PLAYER_RADIUS) return false;
        } else if (!this.canOccupy(x, y)) {
            return false;
        }

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

        // Corner test (mirrors the client): neighbor-cell walls meeting at this
        // corner also block, so wall ends can't be clipped into or cut around
        if (Math.abs(localX) > edge && Math.abs(localY) > edge) {
            const sx = localX > 0 ? 1 : -1;
            const sy = localY > 0 ? 1 : -1;
            const bits = (cx: number, cy: number) =>
                cx >= 0 && cy >= 0 && cx < this.state.gridWidth && cy < this.state.gridHeight
                    ? this.state.mazeWalls[mazeIndex(this.state.gridWidth, cx, cy)]
                    : 0xf;
            const xNeighborWallY = bits(cellX + sx, cellY) & wallForDirection(sy > 0 ? "down" : "up");
            const yNeighborWallX = bits(cellX, cellY + sy) & wallForDirection(sx > 0 ? "right" : "left");
            if (xNeighborWallY !== 0 || yNeighborWallX !== 0) return false;
        }

        // treat the exit cell as a solid wall until the obstacle is solved
        if (!this.state.exitUnlocked && Math.hypot(x - this.state.exitX, y - this.state.exitY) < 0.5) {
            return false;
        }

        return true;
    }

    private isAtExit(player: Player) {
        return Math.hypot(player.x - this.state.exitX, player.y - this.state.exitY) < 0.35;
    }

    private checkExitAdvance() {
        if (!this.state.exitUnlocked) {
            if (this.state.obstacleType === "keys") {
                if (!this.state.allKeysCollected) {
                    this.state.playersAtExit = 0;
                    return;
                }

                const players = Array.from(this.state.players.values());
                if (players.length === 0) return;
                this.state.playersAtExit = players.filter(p => this.isAtExit(p)).length;
                if (this.state.playersAtExit >= players.length) {
                    this.state.exitUnlocked = true;
                }
            return;

            }


            this.state.playersAtExit = 0;
            return;
        }

        // exit already unlocked - if all players there, advance
        const players = Array.from(this.state.players.values());
        if (players.length === 0) return;

        this.state.playersAtExit = players.filter(p => this.isAtExit(p)).length;

        if (this.state.playersAtExit >= players.length) {
            this.advanceLevel();
        }
    }

    private configureLevelObjective() {
        // reset every obstacle type's state so switching type between levels never leaves stale data
        this.state.pressurePlatesRequired = 0;
        this.state.pressurePlatesActivated = 0;
        this.state.plate0X = -1; this.state.plate0Y = -1;
        this.state.plate1X = -1; this.state.plate1Y = -1;
        this.state.plate2X = -1; this.state.plate2Y = -1;

        this.state.keysRequired = 0;
        this.state.allKeysCollected = false;
        this.state.keysCollectedMask = 0;
        this.state.key0X = -1; this.state.key0Y = -1;
        this.state.key1X = -1; this.state.key1Y = -1;
        this.state.key2X = -1; this.state.key2Y = -1;

        this.state.leversTotal = 0;
        this.state.leversPulledInOrder = 0;
        this.state.leverCellX = new ArraySchema<number>();
        this.state.leverCellY = new ArraySchema<number>();
        this.state.leverWallDir = new ArraySchema<number>();

        this.state.exitUnlocked = false;
        this.state.playersAtExit = 0;

        // pick one obstacle type randomly from the pool each level
        // add more strings here later when new obstacle types are built
        const OBSTACLE_POOL = ["pressurePlates", "keys", "levers"];
        this.state.obstacleType = OBSTACLE_POOL[Math.floor(Math.random() * OBSTACLE_POOL.length)];
        console.log("obstacleType set to:", this.state.obstacleType);

        if (this.state.obstacleType === "pressurePlates") {
            this.configurePressurePlates();
        } else if (this.state.obstacleType === "keys") {
            this.configureKeys();
        } else if (this.state.obstacleType === "levers") {
            this.configureLevers();
        }
    }

    private configurePressurePlates() {
        const needed = this.isSoloMode ? 1 : 3;
        this.state.pressurePlatesRequired = needed;
        const picks = this.pickSpreadCells(needed);

        this.state.plate0X = picks[0]?.x ?? this.state.exitX; this.state.plate0Y = picks[0]?.y ?? this.state.exitY;
        this.state.plate1X = picks[1]?.x ?? -1; this.state.plate1Y = picks[1]?.y ?? -1;
        this.state.plate2X = picks[2]?.x ?? -1; this.state.plate2Y = picks[2]?.y ?? -1;
    }

    private configureKeys() {
        const needed = this.isSoloMode ? 1 : 3;
        this.state.keysRequired = needed;
        this.state.pressurePlatesRequired = needed;

        const picks = this.pickSpreadCells(needed * 2);

        if (picks.length < needed) {
            console.warn("Not enough maze cells to place obstacles - skipping");
            this.state.exitUnlocked = true;
            return;
        }

        const keyPicks = picks.slice(0, needed);
        const platePicks = picks.slice(needed);

        this.state.key0X = keyPicks[0]?.x ?? -1; this.state.key0Y = keyPicks[0]?.y ?? -1;
        this.state.key1X = keyPicks[1]?.x ?? -1; this.state.key1Y = keyPicks[1]?.y ?? -1;
        this.state.key2X = keyPicks[2]?.x ?? -1; this.state.key2Y = keyPicks[2]?.y ?? -1;

        this.state.plate0X = platePicks[0]?.x ?? -1; this.state.plate0Y = platePicks[0]?.y ?? -1;
        this.state.plate1X = platePicks[1]?.x ?? -1; this.state.plate1Y = platePicks[1]?.y ?? -1;
        this.state.plate2X = platePicks[2]?.x ?? -1; this.state.plate2Y = platePicks[2]?.y ?? -1;
    }

    private pickSpreadCells(count: number): { x: number; y: number }[] {
        // checks if maze is built before being called
        if (!this.state.mazeWalls || this.state.mazeWalls.length === 0) {
            console.warn("pickSpreadCells called before maze was built");
            return [];
        }

        const candidates: { x: number; y: number }[] = [];
        // collect all cells that are far enough from start and exit to be candidates
        for (let y = 0; y < this.state.gridHeight; y++) {
            for (let x = 0; x < this.state.gridWidth; x++) {
                const distFromStart = Math.abs(x - this.state.startX) + Math.abs(y - this.state.startY);
                const distFromExit = Math.abs(x - this.state.exitX) + Math.abs(y - this.state.exitY);

                if (distFromStart < 3 || distFromExit < 3) continue;
                candidates.push({ x, y });
            }
        }

        // shuffle so object positions are random each level
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        // pick objects that are spread out from each other (at least 3 cells apart)
        const picks: { x: number; y: number }[] = [];
        for (const c of candidates) {
            if (picks.every(p => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) >= 3)) {
                picks.push(c);
                if (picks.length === count) break;
            }
        }

        // fallback if maze is too small to find spread candidates
        for (let i = picks.length; i < count && i < candidates.length; i++) {
            const fallback = candidates[i];
            if (!fallback) break;
            picks.push(fallback);
        }

        return picks;
    }

    // levers are placed on whatever wall the maze generator already put there — never touches wall generation itself.
    // lever count is capped lower on bigger mazes so search difficulty doesn't stack with maze size.
    private configureLevers() {
        const mazeSize = Math.max(this.state.gridWidth, this.state.gridHeight);
        const maxForSize = mazeSize <= 14 ? 5 : 3;
        const needed = 3 + Math.floor(Math.random() * (maxForSize - 3 + 1));

        // collect cells that are far enough from start/exit and have at least one wall to mount a lever on
        const candidates: { x: number; y: number; walls: number[] }[] = [];
        for (let y = 0; y < this.state.gridHeight; y++) {
            for (let x = 0; x < this.state.gridWidth; x++) {
                const distFromStart = Math.abs(x - this.state.startX) + Math.abs(y - this.state.startY);
                const distFromExit = Math.abs(x - this.state.exitX) + Math.abs(y - this.state.exitY);
                if (distFromStart < 3 || distFromExit < 3) continue;

                const mask = this.state.mazeWalls[mazeIndex(this.state.gridWidth, x, y)] ?? ALL_WALLS;
                const availableWalls = WALL_DIRECTIONS.filter((dir) => (mask & dir) !== 0);
                if (availableWalls.length === 0) continue;

                candidates.push({ x, y, walls: availableWalls });
            }
        }

        // shuffle so lever positions are random each level
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        // pick cells spread out from each other (at least 3 cells apart), same spirit as plate placement
        const picks: { x: number; y: number; wallDir: number }[] = [];
        for (const c of candidates) {
            if (picks.every(p => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) >= 3)) {
                const wallDir = c.walls[Math.floor(Math.random() * c.walls.length)];
                picks.push({ x: c.x, y: c.y, wallDir });
                if (picks.length === needed) break;
            }
        }
        // fallback if maze is too small to find spread candidates
        for (let i = picks.length; i < needed && i < candidates.length; i++) {
            const c = candidates[i];
            if (picks.some(p => p.x === c.x && p.y === c.y)) continue;
            const wallDir = c.walls[Math.floor(Math.random() * c.walls.length)];
            picks.push({ x: c.x, y: c.y, wallDir });
        }

        this.state.leversTotal = picks.length;
        const leverCellX = new ArraySchema<number>();
        const leverCellY = new ArraySchema<number>();
        const leverWallDir = new ArraySchema<number>();
        picks.forEach((p) => {
            leverCellX.push(p.x);
            leverCellY.push(p.y);
            leverWallDir.push(p.wallDir);
        });
        this.state.leverCellX = leverCellX;
        this.state.leverCellY = leverCellY;
        this.state.leverWallDir = leverWallDir;
    }

    // the trigger point sits just inside the cell, against the wall the lever is mounted on
    private leverTriggerPosition(index: number) {
        const cellX = this.state.leverCellX[index];
        const cellY = this.state.leverCellY[index];
        const wallDir = this.state.leverWallDir[index];
        const inset = 0.35;

        let offsetX = 0;
        let offsetY = 0;
        if (wallDir === wallForDirection("up")) offsetY = -inset;
        else if (wallDir === wallForDirection("down")) offsetY = inset;
        else if (wallDir === wallForDirection("left")) offsetX = -inset;
        else if (wallDir === wallForDirection("right")) offsetX = inset;

        return { x: cellX + offsetX, y: cellY + offsetY };
    }

    // interact-key driven — walking near a lever does nothing by itself, so players can safely
    // explore near several of them to read their shapes before committing to a pull order.
    private handlePullLever(client: Client) {
        if (!this.state.gameStarted || this.state.countdown > 0 || this.state.isGameOver) return;
        if (this.state.obstacleType !== "levers") return;
        if (this.state.exitUnlocked) return;
        if (this.state.leversTotal === 0) return;

        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        // find whichever lever is closest and within reach — must be standing in the same cell
        // the lever is mounted in, not just geometrically close (a wall may separate two cells
        // whose trigger points are within radius of each other)
        const playerCellX = Math.round(player.x);
        const playerCellY = Math.round(player.y);
        let nearestIndex = -1;
        let nearestDistance = this.LEVER_RADIUS;
        for (let i = 0; i < this.state.leversTotal; i++) {
            if (this.state.leverCellX[i] !== playerCellX || this.state.leverCellY[i] !== playerCellY) continue;

            const { x, y } = this.leverTriggerPosition(i);
            const distance = Math.hypot(player.x - x, player.y - y);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }
        if (nearestIndex === -1) return; // nothing in reach

        if (nearestIndex === this.state.leversPulledInOrder) {
            // the correct next lever — turn it on
            this.state.leversPulledInOrder += 1;
        } else if (nearestIndex < this.state.leversPulledInOrder) {
            // already on — pulling it again turns it back off, along with everything after it
            // (later levers in the sequence depended on this one being on)
            this.state.leversPulledInOrder = nearestIndex;
        } else {
            // a lever ahead of the correct one — wrong order, reset progress
            this.state.leversPulledInOrder = 0;
            this.broadcast("leverWrongPull");
        }

        if (this.state.leversPulledInOrder >= this.state.leversTotal) {
            this.state.exitUnlocked = true;
        }
    }

    private checkPressurePlates() {
        if (this.state.exitUnlocked) return;
        if (this.state.pressurePlatesRequired === 0) return;

        // build the list of active plate positions from state
        const platePositions = [
            { x: this.state.plate0X, y: this.state.plate0Y },
            { x: this.state.plate1X, y: this.state.plate1Y },
            { x: this.state.plate2X, y: this.state.plate2Y },
        ].slice(0, this.state.pressurePlatesRequired);

        let activated = 0;

        // each player's plate is their own permanent slot — player 0 = teal plate, etc.
        // never re-derived from a live sort, so one player leaving can't reassign another's plate
        const playersBySlot = new Map<number, Player>();
        this.state.players.forEach((p) => playersBySlot.set(p.slot, p));

        for (let i = 0; i < platePositions.length; i++) {
            const player = playersBySlot.get(i);
            if (!player) continue;

            const { x: plateX, y: plateY } = platePositions[i];
            const playerOnPlate = Math.hypot(player.x - plateX, player.y - plateY) < this.PLATE_RADIUS;

            // for keys - player must have collected their key first
            const hasKey = this.state.obstacleType === "keys"
                ? (this.state.keysCollectedMask & (1 << i)) !== 0
                : true;

            if (playerOnPlate && hasKey) activated++;
        }

        this.state.pressurePlatesActivated = activated;
        if (activated >= this.state.pressurePlatesRequired) {
            this.state.exitUnlocked = true;
        }
    }

    private parseWallKey(wallKey: unknown): { x: number; y: number } | null {
        if (typeof wallKey !== "string") return null;
        const match = wallKey.match(/^(\d+)-(\d+)-(n|w|e|s)$/);
        if (!match) return null;

        const x = Number(match[1]);
        const y = Number(match[2]);
        if (x < 0 || y < 0 || x >= this.state.gridWidth || y >= this.state.gridHeight) return null;

        return { x, y };
    }

    private handleDrawStroke(client: Client, message: DrawStrokeMessage) {
        const player = this.state.players.get(client.sessionId);
        if (!player || this.state.isGameOver) return;

        const cell = this.parseWallKey(message?.wallKey);
        if (!cell) return;

        // Only allow drawing on walls near the player (no tagging across the map)
        if (Math.abs(player.x - cell.x) + Math.abs(player.y - cell.y) > 2.5) return;

        // Validate the stroke: a flat, even-length list of finite 0..1 coordinates
        const raw = message?.points;
        if (!Array.isArray(raw)) return;
        if (raw.length < 2 || raw.length > this.STROKE_MAX_POINTS * 2) return;
        if (raw.length % 2 !== 0) return;
        if (!raw.every((n) => typeof n === "number" && Number.isFinite(n))) return;

        // Cap strokes per wall and in total so game state can't be flooded.
        // ERASER strokes are exempt: the caps exist to stop spam, but blocking
        // erasers meant busy walls could never be cleaned - erasing silently
        // failed once a wall hit the cap.
        if (message.eraser !== true) {
            let total = 0;
            let onThisWall = 0;
            this.state.graffiti.forEach((stroke) => {
                total++;
                if (stroke.wallKey === message.wallKey) onThisWall++;
            });
            if (total >= this.STROKE_MAX_TOTAL) return;
            if (onThisWall >= this.STROKE_MAX_PER_WALL) return;
        }

        const stroke = new GraffitiStroke();
        stroke.wallKey = message.wallKey as string;
        stroke.sessionId = client.sessionId;
        stroke.eraser = message.eraser === true;
        stroke.side = message.side === -1 ? -1 : 1;
        const points = new ArraySchema<number>();
        raw.forEach((n) => points.push(Math.min(1, Math.max(0, n))));
        stroke.points = points;

        this.strokeCounter += 1;
        this.state.graffiti.set(`s${this.strokeCounter}`, stroke);
    }

    private advanceLevel() {
        console.log("Advancing to stage", this.state.stage + 1);

        // Clearing a level is worth points (x stage, x current streak multiplier) -
        // previously levels paid nothing, so score only measured collectible farming
        this.state.totalScore += this.LEVEL_CLEAR_SCORE * this.state.stage * this.state.scoreMultiplier;

        // Streak check: at least half this level's collectibles keeps the streak
        // climbing (capped); anything less resets it to x1. Obstacles aren't part of
        // the check because they already gate the exit - you can't skip them.
        const spawned = this.state.collectiblesSpawnedThisLevel;
        const keptStreak =
            spawned === 0 ||
            this.state.collectiblesCollectedThisLevel / spawned >= this.STREAK_COLLECT_FRACTION;
        this.state.scoreMultiplier = keptStreak
            ? Math.min(this.STREAK_CAP, this.state.scoreMultiplier + 1)
            : 1;

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

    private handleCollectKey(client: Client, message: { index?: number}) {
        if (!this.state.gameStarted || this.state.isGameOver) return;
        if (this.state.obstacleType !== "keys") return;

        const player = this.state.players.get(client.sessionId);
        const index = typeof message.index === "number" ? message.index : -1;

        if (!player || index < 0) return; 

        // verify the player is close enough to the key
        const keyPositions = [
            {x: this.state.key0X, y: this.state.key0Y},
            {x: this.state.key1X, y: this.state.key1Y},
            {x: this.state.key2X, y: this.state.key2Y}
        ];

        const key = keyPositions[index];
        if (!key || key.x < 0) return;
        
        const dist = Math.hypot(player.x - key.x, player.y - key.y);
        if (dist > this.COLLECTIBLE_PICKUP_RADIUS) return;

        // remove the key by setting it to -1
        if (index === 0) { this.state.key0X = -1; this.state.key0Y = -1; }
        if (index === 1) { this.state.key1X = -1; this.state.key1Y = -1; }
        if (index === 2) { this.state.key2X = -1; this.state.key2Y = -1; }

        // track which player collected their key via bitmask
        this.state.keysCollectedMask |= (1 << index);

        const remaining = [
            this.state.key0X, this.state.key1X, this.state.key2X
        ].slice(0, this.state.keysRequired).filter(x => x>= 0).length;

        if (remaining === 0) {
            this.state.allKeysCollected = true;
            this.broadcast("allKeysCollected");
        }
    }
}