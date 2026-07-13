/**
 * Connects to Colyseus, batches state → React, voice setup
 */
import { useEffect, useState, useRef, useCallback, useReducer, CSSProperties } from "react"; 
import { useLocation, useNavigate } from "react-router-dom";
import { saveReturnUrl, loadReturnUrl, type GameInitPayload } from "@/lib/session-storage";
import * as Client from "colyseus.js";
import { toast } from "sonner";
import { GameScreen } from "@/screens/GameScreen";
import { useSounds } from "@/hooks/use-sounds";
import { ResultsOverlay } from "@/components/game/ResultsOverlay";

// const connect = async () => {
//   console.log("soloMode from initPayload:", initPayload.soloMode);
// }

/** Build a redirect URL back to the platform with query params */
function buildReturnUrl(returnUrl: string, params: Record<string, string | number>): string {
  const url = new URL(returnUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

interface UnlockedMilestone {
    type: string;
    name: string | null;
    description: string | null;
}

interface PlayerState {
    x: number;
    y: number;
    sessionId: string;
    name: string; 
}

interface Collectible {
    x: number;
    y: number;
    id: string;
    score: number;
}

interface ServerGameState {
    players: Map<string, PlayerState>;
    gridWidth: number;
    gridHeight: number;
    mazeWalls: { forEach: (callback: (wallMask: number) => void) => void };
    startX: number;
    startY: number;
    exitX: number;
    exitY: number;
    exitUnlocked: boolean;
    pressurePlatesRequired: number;
    pressurePlatesActivated: number;
    plate0X: number;
    plate0Y: number;
    plate1X: number;
    plate1Y: number;
    plate2X: number;
    plate2Y: number;

    keysRequired: number;
    key0X: number;
    key0Y: number;
    key1X: number;
    key1Y: number;
    key2X: number;
    key2Y: number;
    allKeysCollected: boolean;
    keysCollectedMask: number;

    obstacleType: string;
    playersAtExit: number;
    leversTotal: number;
    leversPulledInOrder: number;
    leverCellX: { forEach: (callback: (value: number) => void) => void };
    leverCellY: { forEach: (callback: (value: number) => void) => void };
    leverWallDir: { forEach: (callback: (value: number) => void) => void };
    totalScore: number;
    gameStarted: boolean;
    countdown: number;
    isGameOver: boolean;
    timeRemaining: number;
    collectibles: Map<string, Collectible>;
    stage: number;
    seed: number;
    playerCount: number;
    requiredPlayers: number;
}

// Batched game state — updated atomically via reducer
interface GameStateLocal {
  gridWidth: number;
  gridHeight: number;
  mazeWalls: number[];
  startX: number;
  startY: number;
  exitX: number;
  exitY: number;
  exitUnlocked: boolean;

  // pressure plates
  pressurePlatesRequired: number;
  pressurePlatesActivated: number;
  plate0X: number;
  plate0Y: number;
  plate1X: number;
  plate1Y: number;
  plate2X: number;
  plate2Y: number;

  // keys
  keysRequired: number;
  key0X: number;
  key0Y: number;
  key1X: number;
  key1Y: number;
  key2X: number;
  key2Y: number;
  allKeysCollected: boolean;
  keysCollectedMask: number; 

  obstacleType: string;
  playersAtExit: number;
  leversTotal: number;
  leversPulledInOrder: number;
  leverCellX: number[];
  leverCellY: number[];
  leverWallDir: number[];
  players: Map<string, PlayerState>;
  collectibles: Collectible[];
  totalScore: number;
  gameStarted: boolean;
  stage: number;
  stageThresholds: number[];
  timeRemaining: number;
  countdown: number;
  isGameOver: boolean;
  seed: number;
  playerCount: number;
  requiredPlayers: number;
}

type GameAction = 
| { type:"SYNC_STATE"; payload: GameStateLocal }
| { type: "SET_PLAYER_COUNT"; payload: { count: number; required: number }};

const initialGameState: GameStateLocal = {
    gridWidth: 10,
    gridHeight: 8,
    mazeWalls: [],
    startX: 0,
    startY: 0,
    exitX: 9,
    exitY: 7,
    exitUnlocked: true,

    pressurePlatesRequired: 0,
    pressurePlatesActivated: 0,
    plate0X: -1,
    plate0Y: -1,
    plate1X: -1,
    plate1Y: -1,
    plate2X: -1,
    plate2Y: -1,

    keysRequired: 0,
    key0X: -1,
    key0Y: -1,
    key1X: -1,
    key1Y: -1,
    key2X: -1,
    key2Y: -1,
    allKeysCollected: false,
    keysCollectedMask: 0,

    obstacleType: "pressurePlates",
    playersAtExit: 0,
    leversTotal: 0,
    leversPulledInOrder: 0,
    leverCellX: [],
    leverCellY: [],
    leverWallDir: [],
    players: new Map(),
    collectibles: [],
    totalScore: 0,
    gameStarted: false,
    stage: 1,
    stageThresholds: [],
    timeRemaining: 30 * 60,
    countdown: 0,
    isGameOver: false,
    seed: 0,
    playerCount: 0,
    requiredPlayers: 3
};

function gameReducer(_state: GameStateLocal, action: GameAction): GameStateLocal {
  switch (action.type) {
    case "SYNC_STATE":
      return action.payload;
    case "SET_PLAYER_COUNT":
      return {
        ..._state,
        playerCount: action.payload.count,
        requiredPlayers: action.payload.required,
      }
    default:
      return _state;
  }
}

type Phase = "connecting" | "waiting" | "game";

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("connecting");

  // Init payload comes from router state (Lobby/Intro navigation)
  const routerState = location.state as { initPayload?: GameInitPayload; returnUrl?: string } | null;
  const [initPayload] = useState<GameInitPayload | null>(routerState?.initPayload ?? null);

  // Return URL for redirecting back to the platform
  // Persisted in sessionStorage so it survives page reloads
  const returnUrl = routerState?.returnUrl ?? loadReturnUrl();

  // Persist returnUrl when it comes from router state
  useEffect(() => {
    if (routerState?.returnUrl) {
      saveReturnUrl(routerState.returnUrl);
    }
  }, [routerState?.returnUrl]);


  // Connection state
  const [room, setRoom] = useState<Client.Room<ServerGameState> | null>(null);
  const clientRef = useRef<Client.Client | null>(null);
  const roomRef = useRef<Client.Room<ServerGameState> | null>(null);
  /** Resolved Colyseus room id — known after the initial join (joinOrCreate may
   * create a fresh room). Used so reconnects target the same room. */
  const connectedRoomIdRef = useRef<string | null>(routerState?.initPayload?.roomId ?? null);
  /** Coalesce Colyseus onStateChange bursts into one React update per frame (reduces move jank). */

  // Batched game state — single dispatch = single re-render
  const [gameState, dispatch] = useReducer(gameReducer, initialGameState);

  // UI-only state (not server-synced)
  const [showGo, setShowGo] = useState(false);
  const prevCountdownRef = useRef(0);
  const prevExitUnlockedRef = useRef(initialGameState.exitUnlocked);
  const prevStageRef = useRef(initialGameState.stage);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const resultsReasonRef = useRef<"gameover" | "abandoned">("gameover");
  const { play: playSound } = useSounds();


  // Show results overlay when game ends (stay on /play so LiveKit voice persists)
  useEffect(() => {
    if (!gameState.isGameOver) return;

    room?.leave();
    resultsReasonRef.current = "gameover";
    setShowResults(true);
  }, [gameState.isGameOver]);

  // Show "GO" briefly when countdown transitions from >0 to 0,
  // and play the movement SFX on each tick from 10 down through GO (0).
  useEffect(() => {
    const prev = prevCountdownRef.current;
    const current = gameState.countdown;
    prevCountdownRef.current = current;

    if (current !== prev && current >= 0 && current <= 10) {
      playSound("move");
    }

    if (prev > 0 && current === 0) {
      setShowGo(true);
      const timer = setTimeout(() => setShowGo(false), 600);
      return () => clearTimeout(timer);
    }
  }, [gameState.countdown, playSound]);

  useEffect(() => {
    // Algorithm: the server unlocks the door once the objective is solved.
    // The client listens for the transition from locked to unlocked and plays the unlock fanfare once.
    if (!prevExitUnlockedRef.current && gameState.exitUnlocked) {
      playSound("unlock");
    }
    prevExitUnlockedRef.current = gameState.exitUnlocked;
  }, [gameState.exitUnlocked, playSound]);

  useEffect(() => {
    // Algorithm: when the stage counter increases, treat it as a new level start and play the portal sound once.
    if (gameState.stage > prevStageRef.current) {
      playSound("portal");
    }
    prevStageRef.current = gameState.stage;
  }, [gameState.stage, playSound]);

  const createStateUpdater = useCallback((gameRoom: Client.Room<ServerGameState>) => () => {
    if (!gameRoom.state) return;

    const newPlayers = new Map<string, PlayerState>();
    gameRoom.state.players?.forEach((p, id) => {
      newPlayers.set(id, { x: p.x, y: p.y, sessionId: p.sessionId, name: p.name || ""});
    });

    const newCollectibles: Collectible[] = [];
    gameRoom.state.collectibles?.forEach((collectible) => {
      newCollectibles.push({
          x: collectible.x,
          y: collectible.y,
          id: collectible.id,
          score: collectible.score || 0,
      });
    });

    const mazeWalls: number[] = [];
    gameRoom.state.mazeWalls?.forEach((wallMask) => mazeWalls.push(wallMask));

    const leverCellX: number[] = [];
    gameRoom.state.leverCellX?.forEach((value) => leverCellX.push(value));
    const leverCellY: number[] = [];
    gameRoom.state.leverCellY?.forEach((value) => leverCellY.push(value));
    const leverWallDir: number[] = [];
    gameRoom.state.leverWallDir?.forEach((value) => leverWallDir.push(value));

    dispatch({
      type: "SYNC_STATE",
      payload: {
          gridWidth: gameRoom.state.gridWidth || 10,
          gridHeight: gameRoom.state.gridHeight || 8,
          mazeWalls,
          startX: gameRoom.state.startX || 0,
          startY: gameRoom.state.startY || 0,
          exitX: gameRoom.state.exitX ?? Math.max(0, (gameRoom.state.gridWidth || 10) - 1),
          exitY: gameRoom.state.exitY ?? Math.max(0, (gameRoom.state.gridHeight || 8) - 1),
          exitUnlocked: gameRoom.state.exitUnlocked ?? true,
          pressurePlatesRequired: gameRoom.state.pressurePlatesRequired || 0,
          pressurePlatesActivated: gameRoom.state.pressurePlatesActivated || 0,
          plate0X: gameRoom.state.plate0X ?? -1,
          plate0Y: gameRoom.state.plate0Y ?? -1,
          plate1X: gameRoom.state.plate1X ?? -1,
          plate1Y: gameRoom.state.plate1Y ?? -1,
          plate2X: gameRoom.state.plate2X ?? -1,
          plate2Y: gameRoom.state.plate2Y ?? -1,

          keysRequired: gameRoom.state.keysRequired || 0,
          key0X: gameRoom.state.key0X ?? -1,
          key0Y: gameRoom.state.key0Y ?? -1,
          key1X: gameRoom.state.key1X ?? -1,
          key1Y: gameRoom.state.key1Y ?? -1,
          key2X: gameRoom.state.key2X ?? -1,
          key2Y: gameRoom.state.key2Y ?? -1,

          allKeysCollected: gameRoom.state.allKeysCollected || false,
          keysCollectedMask: gameRoom.state.keysCollectedMask || 0,

          obstacleType: gameRoom.state.obstacleType || "pressurePlates",
          playersAtExit: gameRoom.state.playersAtExit || 0,
          leversTotal: gameRoom.state.leversTotal || 0,
          leversPulledInOrder: gameRoom.state.leversPulledInOrder || 0,
          leverCellX,
          leverCellY,
          leverWallDir,
          totalScore: gameRoom.state.totalScore || 0,
          gameStarted: gameRoom.state.gameStarted || false,
          stage: gameRoom.state.stage || 1,
          seed: gameRoom.state.seed || 0,
          players: newPlayers,
          collectibles: newCollectibles,
          isGameOver: gameRoom.state.isGameOver || false,
          timeRemaining: gameRoom.state.timeRemaining ?? 30 * 60,
          stageThresholds: [],
          countdown: gameRoom.state.countdown || 0,
          playerCount: 0,
          requiredPlayers: 3
      },
    });
  }, []);

  const createStateUpdaterRef = useRef(createStateUpdater);
  createStateUpdaterRef.current = createStateUpdater;

  // Connect to the Colyseus room
  useEffect(() => {
    if (!initPayload || room) return;
    let aborted = false;

    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_BASE_DELAY = 1500;

    function setupRoom(gameRoom: Client.Room<ServerGameState>) {
      const runSync = () => createStateUpdaterRef.current(gameRoom)();
      // Sync immediately on every patch so countdown (and other fields) never sit one frame behind or coalesce wrong.
      gameRoom.onStateChange(runSync);

      gameRoom.onError((code, message) => {
        console.error(`Connection error [${code}]: ${message}`);
      });

      gameRoom.onLeave((code) => {
        console.log(`Disconnected from room (code: ${code})`);
        if (code === 1006) {
          attemptReconnect();
        } else if (code !== 1000 && code !== 1001 && code !== 4000) {
          toast.error("Disconnected from the game.");
          if (returnUrl) {
            window.location.href = buildReturnUrl(returnUrl, { reason: "disconnected", disconnectReason: "unexpected" });
          }
        }
      });

      gameRoom.onMessage("boardCleared", () => {
        toast.success("Board cleared!");
      });


      gameRoom.onMessage("playerCountUpdate", (data: { count: number, required: number }) => {
        dispatch({ type: "SET_PLAYER_COUNT", payload: data });
      });
      return runSync;
    }

    async function attemptReconnect() {
      if (aborted) return;
      setIsReconnecting(true);
      setRoom(null);

      for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
        if (aborted) break;
        const delay = RECONNECT_BASE_DELAY * Math.pow(2, attempt - 1);
        console.log(`Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        if (aborted) break;

        try {
          const client = new Client.Client(initPayload.serverUrl);
          clientRef.current = client;

          // Reconnect to the same room by id (the server restores the player's
          // color from userId). Without a known room id we cannot reconnect.
          const roomId = connectedRoomIdRef.current;
          if (!roomId) {
            console.error("No room id available to reconnect to");
            break;
          }
          const gameRoom = await client.joinById<ServerGameState>(roomId, {
            soloMode: initPayload.soloMode,
            gameToken: initPayload.gameToken,
            userId: initPayload.userId,
            playerName: initPayload.playerName,
            spectator: initPayload.spectator,
            sessionId: initPayload.sessionId,
          });


          const updateState = setupRoom(gameRoom);
          updateState();
          roomRef.current = gameRoom;
          setRoom(gameRoom);
          setIsReconnecting(false);

          console.log("Reconnected successfully!");
          return;
        } catch (e) {
          console.error(`Reconnect attempt ${attempt} failed:`, e);
        }
      }

      // All attempts failed
      setIsReconnecting(false);
      toast.error("Could not reconnect to the game.");
      if (returnUrl) {
        window.location.href = buildReturnUrl(returnUrl, { reason: "disconnected", disconnectReason: "reconnect_failed" });
      }
    }

    const connect = async () => {
      try {
        const client = new Client.Client(initPayload.serverUrl);
        clientRef.current = client;

        // Joining/spectating/reconnecting target an explicit Colyseus room id
        // (joinById). Standalone solo/multiplayer always create a fresh room; its
        // server-assigned room id is the shareable code others join by.
        const gameRoom = initPayload.roomId
          ? await client.joinById<ServerGameState>(initPayload.roomId, {
              soloMode: initPayload.soloMode,
              gameToken: initPayload.gameToken,
              userId: initPayload.userId,
              playerName: initPayload.playerName,
              spectator: initPayload.spectator,
              sessionId: initPayload.sessionId,
            })
          : await client.create<ServerGameState>("game_room", {
              soloMode: initPayload.soloMode,
              userId: initPayload.userId,
              playerName: initPayload.playerName,
              devMode: initPayload.devMode,
            });

            
          console.log("roomId:", initPayload.roomId, "| soloMode:", initPayload.soloMode);

        connectedRoomIdRef.current = gameRoom.roomId;

        setupRoom(gameRoom);
        /* Hydrate from room.state immediately (reconnect path already calls this).
           Some Colyseus builds may not emit onStateChange until the next patch — without this,
           React can sit on empty initialGameState and show a blank board / wrong zoom. */
        createStateUpdaterRef.current(gameRoom)();

        roomRef.current = gameRoom;
        setRoom(gameRoom);

        // Wait for the first real state patch from Colyseus before showing
        // the game scene. This guarantees gridWidth/gridHeight are non-zero
        // so SmoothZoom initialises with a finite camera zoom.
        let initialised = false;
        gameRoom.onStateChange(() => {
          if (!initialised) {
            initialised = true;
            setPhase(initPayload?.soloMode ? "game" : "waiting");
          }
        });
      } catch (e) {
        console.error("Failed to join game room:", e);
        toast.error("Failed to connect to game server.");
      }
    };

    connect();

    return () => {
      aborted = true;
      if (room) room.leave();
    };
  }, [initPayload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Transition from connecting to game when gameStarted
  useEffect(() => {
    if (gameState.gameStarted && phase === "connecting" && room) {
      setPhase(initPayload?.soloMode ? "game" : "waiting");
    }

    if (gameState.gameStarted && phase === "waiting") {
      setPhase("game")
    }
  }, [gameState.gameStarted, phase, room]);


  if (!initPayload) {
    return (
      <div className="w-full h-screen bg-canvas flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-slate-300 text-lg mb-2">Session expired</p>
          <p className="text-slate-500 text-sm mb-6">Rejoin your game from the platform.</p>
          {returnUrl ? (
            <a href={returnUrl} className="text-sky-400 hover:text-sky-300 underline text-sm">
              Back to platform
            </a>
          ) : (
            <button onClick={() => navigate("/boot", { replace: true })} className="text-sky-400 hover:text-sky-300 underline text-sm">
              Back to main menu
            </button>
          )}
        </div>
      </div>
    );
  }

  console.log("Current phase", phase);
  
  if (phase === "waiting") {
    return (
        <div className="w-full h-screen bg-canvas flex items-center justify-center">
            <div className="flex flex-col items-center gap-6 text-center">
                <div
                    className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
                    style={{ borderColor: "rgba(0, 149, 255, 0.3)", borderTopColor: "transparent" }}
                />
                <p className="font-montreal text-[0.6875rem] uppercase tracking-[0.06em] text-sky-200/90">
                    Waiting for players...
                </p>
                <p className="text-white text-2xl font-bold">
                    {gameState.playerCount} / {gameState.requiredPlayers}
                </p>
                <div className="text-slate-400 text-sm">
                    <p>Room code</p>
                    <p className="text-white font-mono text-lg">{room?.roomId}</p>
                </div>
            </div>
        </div>
    );
  }

  if (phase === "connecting") {
    return (
      <div className="w-full h-screen bg-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-4" role="status" aria-live="polite" aria-label="Connecting to game…">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "rgba(0, 149, 255, 0.3)", borderTopColor: "transparent" }}
            aria-hidden
          />
          <p className="font-montreal text-[0.6875rem] uppercase tracking-[0.06em] text-sky-200/90">
            Connecting to game…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh w-full bg-canvas text-foreground">
      <GameScreen
        room={room}
        players={gameState.players}
        gridWidth={gameState.gridWidth}
        gridHeight={gameState.gridHeight}
        mazeWalls={gameState.mazeWalls}
        startX={gameState.startX}
        startY={gameState.startY}
        exitX={gameState.exitX}
        exitY={gameState.exitY}
        exitUnlocked={gameState.exitUnlocked}
        collectibles={gameState.collectibles}
        totalScore={gameState.totalScore}
        stage={gameState.stage}
        timeRemaining={gameState.timeRemaining}
        isDevMode={initPayload?.devMode || false}
        seed={gameState.seed}
        countdown={gameState.countdown}
        showResults={showResults}
        onGameAbandoned={() => {
          room?.leave();
          resultsReasonRef.current = "abandoned";
          setShowResults(true);
        } } isSoloMode={initPayload?.soloMode || false}
        pressurePlatesRequired={gameState.pressurePlatesRequired}
        plate0X={gameState.plate0X}
        plate0Y={gameState.plate0Y}
        plate1X={gameState.plate1X}
        plate1Y={gameState.plate1Y}
        plate2X={gameState.plate2X}
        plate2Y={gameState.plate2Y}
        obstacleType={gameState.obstacleType}
        playersAtExit={gameState.playersAtExit}
        leversTotal={gameState.leversTotal}
        leversPulledInOrder={gameState.leversPulledInOrder}
        leverCellX={gameState.leverCellX}
        leverCellY={gameState.leverCellY}
        leverWallDir={gameState.leverWallDir}
        keysRequired={gameState.keysRequired}
        key0X={gameState.key0X}
        key0Y={gameState.key0Y}
        key1X={gameState.key1X}
        key1Y={gameState.key1Y}
        key2X={gameState.key2X}
        key2Y={gameState.key2Y}
        allKeysCollected={gameState.allKeysCollected}
        keysCollectedMask={gameState.keysCollectedMask}
        />
      {/* TODO: revert — temporarily showing overlay in solo mode */}
      {(gameState.countdown > 0 || showGo) && (() => {
        const from = 10;
        const glowIntensity = showGo ? 0.5 : Math.max(0, (from - gameState.countdown) / from) * 0.35;
        const glowSize = showGo ? 70 : 30 + ((from - gameState.countdown) / from) * 30;

        const getCountStyle = (): CSSProperties => {
          if (showGo) {
            return {
              fontSize: "clamp(6rem, 20vw, 12rem)",
              color: "rgba(173, 234, 255, 1)",
              textShadow:
                "0 0 40px rgba(0, 149, 255, 0.8), 0 0 80px rgba(0, 149, 255, 0.6), 0 0 120px rgba(0, 149, 255, 0.4), 0 0 200px rgba(0, 149, 255, 0.2)",
              transform: "scale(1.2)",
              transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            };
          }
          if (gameState.countdown <= 3) {
            return {
              fontSize: "clamp(5rem, 16vw, 10rem)",
              color: "rgba(255, 255, 255, 1)",
              textShadow:
                "0 0 30px rgba(0, 149, 255, 0.7), 0 0 60px rgba(0, 149, 255, 0.5), 0 0 100px rgba(0, 149, 255, 0.3)",
              transform: `scale(${1 + (4 - gameState.countdown) * 0.05})`,
              transition: "all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)",
            };
          }
          if (gameState.countdown <= 6) {
            return {
              fontSize: "clamp(4rem, 12vw, 8rem)",
              color: "rgba(255, 255, 255, 0.9)",
              textShadow: "0 0 20px rgba(0, 149, 255, 0.4), 0 0 40px rgba(0, 149, 255, 0.2)",
              transform: "scale(1)",
              transition: "all 0.2s ease-out",
            };
          }
          return {
            fontSize: "clamp(3.5rem, 10vw, 7rem)",
            color: "rgba(255, 255, 255, 0.75)",
            textShadow: "0 0 10px rgba(0, 149, 255, 0.15)",
            transform: "scale(1)",
            transition: "all 0.25s ease-out",
          };
        };

        return (
          <div
            className="fixed inset-0 flex items-center justify-center z-40 pointer-events-none bg-black"
            style={{
              background: `radial-gradient(circle at 50% 50%, rgba(0, 149, 255, ${glowIntensity}) 0%, rgba(0, 60, 120, ${glowIntensity * 0.4}) ${glowSize}%, transparent ${glowSize + 30}%)`,
              transition: "background 0.3s ease",
            }}
          >
            <div
              className="font-extrabold select-none"
              style={{
                ...getCountStyle(),
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
              key={showGo ? "go" : gameState.countdown}
            >
              {showGo ? "GO" : gameState.countdown}
            </div>

            {!showGo && (
              <div
                className="absolute"
                style={{
                  width: "clamp(120px, 30vw, 240px)",
                  height: "clamp(120px, 30vw, 240px)",
                  border: `2px solid rgba(0, 149, 255, ${0.1 + ((from - gameState.countdown) / from) * 0.3})`,
                  borderRadius: "50%",
                  animation: "countdownPulse 1s ease-out infinite",
                }}
              />
            )}

            {showGo && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "radial-gradient(circle at 50% 50%, rgba(173, 234, 255, 0.15) 0%, transparent 60%)",
                  animation: "countdownGoFlash 0.6s ease-out forwards",
                }}
              />
            )}

            <style>{`
              @keyframes countdownPulse {
                0% { transform: scale(0.9); opacity: 0.6; }
                50% { transform: scale(1.1); opacity: 0.3; }
                100% { transform: scale(1.3); opacity: 0; }
              }
              @keyframes countdownGoFlash {
                0% { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(2); }
              }
            `}</style>
          </div>
        );
      })()}
      {isReconnecting && (
        <div className="fixed inset-0 bg-canvas/85 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "rgba(0, 149, 255, 0.3)", borderTopColor: "transparent" }}
              aria-hidden
            />
            <div className="flex flex-col items-center gap-1">
              <p className="font-montreal text-[0.6875rem] uppercase tracking-[0.06em] text-sky-100">Server disconnected.</p>
              <p className="font-montreal text-[0.6875rem] uppercase tracking-[0.06em] text-sky-300/90">Reconnecting…</p>
            </div>
          </div>
        </div>
      )}
      {showResults && (
        <ResultsOverlay
          totalScore={gameState.totalScore}
          stage={gameState.stage}
          reason={resultsReasonRef.current}
          returnUrl={returnUrl}
          onBack={() => {
            if (returnUrl) {
              window.location.href = returnUrl;
            } else {
              navigate("/", { replace: true });
            }
          }}
        />
      )}
    </div>
  );
};


export default Index;
