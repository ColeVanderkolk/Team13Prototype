import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") sessionId: string = "";
    @type("string") name: string = "";
    // permanent color/plate/key slot, assigned once at join — never recalculated from a live
    // sorted list, so one player leaving can't reassign another player's color
    @type("number") slot: number = -1;
}

export class Collectible extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") id: string = "";
    @type("number") score: number = 0; 
}

export class GraffitiStroke extends Schema {
    @type("string") wallKey: string = "";
    @type("string") sessionId: string = "";
    @type("boolean") eraser: boolean = false;
    // Which wall face the stroke lives on: 1 or -1
    @type("number") side: number = 1;
    // Flat [u0, v0, u1, v1, ...] pairs in wall-face coordinates (0..1)
    @type(["number"]) points = new ArraySchema<number>();
}

export class GameState extends Schema {
    // TODO: fill this out
    @type({ map : Player }) players = new MapSchema<Player>();

    @type("number") gridWidth: number = 9;

    @type("number") gridHeight: number = 9;

    @type(["number"]) mazeWalls = new ArraySchema<number>();

    @type("number") startX: number = 0;

    @type("number") startY: number = 0;

    @type("number") exitX: number = 8;

    @type("number") exitY: number = 8;

    @type("boolean") exitUnlocked: boolean = true;

    // pressure plates
    @type("number") pressurePlatesRequired: number = 0;

    @type("number") pressurePlatesActivated: number = 0;

    @type("number") plate0X: number = -1;
    @type("number") plate0Y: number = -1;
    @type("number") plate1X: number = -1;
    @type("number") plate1Y: number = -1;
    @type("number") plate2X: number = -1;
    @type("number") plate2Y: number = -1;

    @type("string") obstacleType: string = "pressurePlates";

    // keys
    @type("number") keysRequired: number = 0;

    @type("boolean") allKeysCollected: boolean = false;
    @type("number") keysCollectedMask: number = 0; 

    @type("number") key0X: number = -1;
    @type("number") key0Y: number = -1;
    @type("number") key1X: number = -1;
    @type("number") key1Y: number = -1;
    @type("number") key2X: number = -1;
    @type("number") key2Y: number = -1;


    @type("number") playersAtExit: number = 0;

    @type("number") leversTotal: number = 0;

    @type("number") leversPulledInOrder: number = 0;

    @type(["number"]) leverCellX = new ArraySchema<number>();
    @type(["number"]) leverCellY = new ArraySchema<number>();
    @type(["number"]) leverWallDir = new ArraySchema<number>();

    @type([Collectible]) collectibles = new ArraySchema<Collectible>();

    @type("number") totalScore: number = 0;

    @type("boolean") gameStarted: boolean = false;
    
    @type("number") countdown: number = 0;

    @type("boolean") isGameOver: boolean = false;

    @type("number") timeRemaining: number = 30 * 60; // 30 minutes in seconds

    @type("number") stage: number = 1;

    @type(["number"]) stageThresholds = new ArraySchema<number>(); // unsure if this is needed

    @type("number") seed: number = 0;

    // Streak scoring: all points multiply by this. It climbs by 1 each level the team
    // collects at least half the collectibles, and resets to 1 when they don't.
    @type("number") scoreMultiplier: number = 1;
    @type("number") collectiblesSpawnedThisLevel: number = 0;
    @type("number") collectiblesCollectedThisLevel: number = 0;

    // Shared freeform wall graffiti, keyed by stroke id
    @type({ map: GraffitiStroke }) graffiti = new MapSchema<GraffitiStroke>();
}