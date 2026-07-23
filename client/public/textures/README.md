# Game Textures

Drop floor and sky images here when you are ready to replace the fallback maze environment.

Recommended files:

- `floor.png` or `floor.jpg`: a seamless/tileable square texture. The game repeats it across the maze floor.
- `sky.jpg`: ideally a `2:1` equirectangular/panoramic image such as `4096x2048` or `2048x1024`. The game maps it onto a large inside-out sphere around the maze.

Regular photos or AI images can work for the sky, but they will stretch or pinch near the sphere poles. By default, the game rotates the sphere so that pinch moves to the horizon instead of directly above/below the maze.

## Local Setup

Enable texture overrides in `client/.env`:

```sh
VITE_MAZE_FLOOR_TEXTURE_URL=/textures/floor.png
VITE_MAZE_FLOOR_TEXTURE_REPEAT_UNITS=1.8
VITE_MAZE_SKY_TEXTURE_URL=/textures/sky.jpg
VITE_MAZE_SKY_ROTATION_X_DEG=90
VITE_MAZE_SKY_ROTATION_Y_DEG=0
VITE_MAZE_SKY_ROTATION_Z_DEG=0
```

`VITE_MAZE_FLOOR_TEXTURE_REPEAT_UNITS` controls how many world units each floor texture tile covers. The default is `1.8`, which matches one maze cell.

The sky rotation values are degrees. Adjust `VITE_MAZE_SKY_ROTATION_Y_DEG` first if the vertical seam is visible in the main camera view; adjust `VITE_MAZE_SKY_ROTATION_X_DEG` if the pole stretching is still too visible above the maze.

After changing `client/.env`, restart the Vite dev server.

## Path Rules

Anything inside `client/public` is served from the site root:

- `client/public/textures/floor.png` is loaded as `/textures/floor.png`
- `client/public/textures/floor.jpg` is loaded as `/textures/floor.jpg`
- `client/public/textures/sky.jpg` is loaded as `/textures/sky.jpg`

Do not use `client/public/...` in the env var value.
