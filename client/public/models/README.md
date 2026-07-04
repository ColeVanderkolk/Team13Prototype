Drop Blender exports here as `.glb` files when you are ready to replace the fallback maze art.

Suggested first pass:

- `maze-wall.glb`: centered on origin, roughly one unit wide/tall/deep. The game scales it to each generated wall segment.
- `player.glb`: centered on origin with feet near ground level.

Then set these in `client/.env`:

```sh
VITE_MAZE_WALL_MODEL_URL=/models/maze-wall.glb
VITE_MAZE_PLAYER_MODEL_URL=/models/player.glb
```
