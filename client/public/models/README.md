# Game Model Overrides

Drop Blender exports in this folder as `.glb` files when you are ready to replace the fallback maze art.

Recommended files:

- `maze-wall.glb`: centered on the origin and authored at the final game size: `1.8` wide, `1.35` tall, `0.18` thick. The game does not scale this model; it only places it and rotates east/west wall segments.
- `maze-wall-1.glb` through `maze-wall-4.glb`: optional per-quadrant wall styles. Use the same dimensions and origin as `maze-wall.glb`.
- `player.glb`: centered on the origin with feet near ground level.
- `flashlight.glb`: optional player-held flashlight prop. Center it on the origin, point its beam direction down local `+Z`, and keep it small enough to sit in front of/right of the player camera.
- `exit-barrier.glb`: centered on the origin. The game scales it to the locked-exit block.

For `maze-wall.glb`, use these dimensions in Blender:

- `X`: wall length, `1.8`
- `Y`: wall thickness, `0.18`
- `Z`: wall height, `1.35`

After export, Three.js uses Y-up coordinates, so that Blender `Z` height becomes the in-game vertical axis.

Apply transforms before exporting:

```txt
Ctrl+A -> Rotation & Scale
```

## Local Setup

The repo commits `client/.env.example` as a template. Your real local env file is `client/.env`, and it is ignored by git.

From the `client` folder:

```sh
cp .env.example .env
```

Then make sure the model paths you want are enabled in `client/.env`:

```sh
VITE_SERVER_URL=ws://localhost:2567
VITE_MAZE_WALL_MODEL_URL=/models/maze-wall.glb

# Optional: override each quadrant with a different wall model.
VITE_MAZE_WALL_MODEL_URL_1=/models/maze-wall-1.glb
VITE_MAZE_WALL_MODEL_URL_2=/models/maze-wall-2.glb
VITE_MAZE_WALL_MODEL_URL_3=/models/maze-wall-3.glb
VITE_MAZE_WALL_MODEL_URL_4=/models/maze-wall-4.glb

VITE_MAZE_PLAYER_MODEL_URL=/models/player.glb
VITE_MAZE_FLASHLIGHT_MODEL_URL=/models/flashlight.glb
VITE_EXIT_BARRIER_MODEL_URL=/models/exit-barrier.glb
```

Only set a variable when the matching file exists. If a per-quadrant wall variable is empty or missing, the game falls back to `VITE_MAZE_WALL_MODEL_URL`. If no wall model URL is set, the game uses its built-in fallback mesh.

The four wall variants follow the same quadrant order as the old wall colors:

- `VITE_MAZE_WALL_MODEL_URL_1`: northwest quadrant
- `VITE_MAZE_WALL_MODEL_URL_2`: northeast quadrant
- `VITE_MAZE_WALL_MODEL_URL_3`: southwest quadrant
- `VITE_MAZE_WALL_MODEL_URL_4`: southeast quadrant

After changing `client/.env`, restart the Vite dev server. Vite reads these values when the server starts.

## Path Rules

Anything inside `client/public` is served from the site root:

- `client/public/models/maze-wall.glb` is loaded as `/models/maze-wall.glb`
- `client/public/models/maze-wall-1.glb` is loaded as `/models/maze-wall-1.glb`
- `client/public/models/player.glb` is loaded as `/models/player.glb`
- `client/public/models/flashlight.glb` is loaded as `/models/flashlight.glb`

Do not use `client/public/...` in the env var value.

## GitHub And Deployment

Commit the model file if everyone should have it:

```sh
git add client/public/models/maze-wall.glb client/.env.example client/public/models/README.md
```

Do not commit `client/.env`. For a deployed build, set the same `VITE_*` variables in the hosting provider's environment settings, or provide another committed/default config path.
