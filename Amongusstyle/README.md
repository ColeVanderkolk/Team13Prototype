# Flat 2D Map + 3D Character (Among Us camera)

A flat, drawn 2D map (rooms + corridors painted onto the ground) with a **real
3D character model** walking around on it, viewed from an Among Us-style tilted
overhead camera. The map reads as 2D; the character has real volume and shadow.

## Setup

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173).

## Controls

| Key | Action |
|-----|--------|
| **W A S D** / Arrows | Move (all directions) |
| **Shift** | Sprint |
| **Scroll** | Zoom in / out |

## How it works

- The **map is a 2D drawing**. Rooms and corridors are painted onto an offscreen
  canvas, which becomes a texture on a single flat ground plane. No 3D walls.
- The character is **kept inside rooms/paths** by a walkable test: it can only
  move to spots that fall on a room or corridor (it slides along edges).
- The **character is a real 3D model** (body, visor, backpack, animated legs)
  with a real shadow — that's what makes it pop against the flat floor.
- The **camera** is fixed at a tilted overhead angle and follows the character,
  like Among Us.

## Redesigning the map

Open `main.ts` and edit the `rooms` and `corridors` arrays near the top of the
map section. Each room is `{ x, y, w, h, name }` in map units (origin at the
center of the map). Corridors connect two points with a width. The drawing and
the collision both read from these same arrays, so changing them updates the
look *and* where you can walk. Later you can swap the whole drawn texture for a
real map image by loading it with `THREE.TextureLoader` instead of the canvas.

## Files

```
index.html      entry HTML + HUD
main.ts         map drawing + 3D character + movement (typed)
styles.css      HUD styling
tsconfig.json   strict TypeScript config
package.json    deps (three + vite + typescript) + scripts
```

## Tuning knobs (in main.ts)

- `CAM_PITCH` — overhead tilt (higher = more top-down, lower = more side-on)
- `camDist` — zoom distance
- `rooms` / `corridors` — the map layout
- `WALK_SPEED` / `SPRINT_SPEED` — movement feel
