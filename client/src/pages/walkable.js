// Walkable test: is a world (x, z) point on a room or corridor?
// Pass a negative pad (e.g. -CHAR_RADIUS) to shrink the walkable area so
// the character's body edge — not just its center — stops at walls.

import { rooms, corridors } from './mapData';

export function pointInRoom(x, z, pad = 0) {
  for (const r of rooms) {
    if (
      x > r.x - r.w / 2 - pad && x < r.x + r.w / 2 + pad &&
      z > r.y - r.h / 2 - pad && z < r.y + r.h / 2 + pad
    ) return true;
  }
  return false;
}

export function pointInCorridor(x, z, pad = 0) {
  for (const c of corridors) {
    const hw = c.width / 2 + pad;
    // horizontal segment (along x at y=ay)
    if (
      x > Math.min(c.ax, c.bx) - hw && x < Math.max(c.ax, c.bx) + hw &&
      z > c.ay - hw && z < c.ay + hw
    ) return true;
    // vertical segment (along y at x=bx)
    if (
      z > Math.min(c.ay, c.by) - hw && z < Math.max(c.ay, c.by) + hw &&
      x > c.bx - hw && x < c.bx + hw
    ) return true;
  }
  return false;
}

export function isWalkable(x, z, pad = 0) {
  return pointInRoom(x, z, pad) || pointInCorridor(x, z, pad);
}
