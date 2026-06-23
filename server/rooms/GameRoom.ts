import { Room, Client } from "colyseus";
import { GameState } from "../schema/GameState";
import jwt from "jsonwebtoken";


export class GameRoom extends Room<GameState> {

}