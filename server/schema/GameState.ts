import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
}

export class Collectible extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") id: string = "";
    @type("number") score: number = 0; 
}

export class GameState extends Schema {
    // TODO: fill this out
    @type({ map : Player }) players = new MapSchema<Player>();

    @type([Collectible]) collectibles = new ArraySchema<Collectible>();

    @type("number") totalScore: number = 0;

    @type("boolean") gameStarted: boolean = false;
    
    @type("number") countdown: number = 0;

    @type("boolean") isGameOver: boolean = false;

    @type("number") timeRemaining: number = 30 * 60; // 30 minutes in seconds

    @type("number") stage: number = 1;

    @type(["number"]) stageThresholds = new ArraySchema<number>(); // unsure if this is needed

    @type("number") seed: number = 0;
}