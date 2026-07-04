// Map layout in "map units" (origin at the center of the map).
// Edit rooms/corridors to redesign the map — both the drawing and the
// collision read from these same arrays, so changes update the look
// AND where you can walk.

export const MAP_W = 60;
export const MAP_H = 40;

// Each room: { x, y, w, h, name } where x,y is the room center
export const rooms = [
  { x: -18, y: -10, w: 16, h: 12, name: '' },
  { x: 10, y: -12, w: 14, h: 10, name: '' },
  { x: 20, y: 6, w: 12, h: 12, name: '' },
  { x: -2, y: 8, w: 16, h: 10, name: '' },
  { x: -22, y: 10, w: 12, h: 10, name: '' },
];

// Corridors connect two points with a width: { ax, ay, bx, by, width }
export const corridors = [
  { ax: -18, ay: -10, bx: 10, by: -12, width: 3 },
  { ax: 10, ay: -12, bx: 20, by: 6, width: 3 },
  { ax: 20, ay: 6, bx: -2, by: 8, width: 3 },
  { ax: -2, ay: 8, bx: -22, by: 10, width: 3 },
  { ax: -18, ay: -10, bx: -2, by: 8, width: 3 },
];

// Where the player spawns
export const SPAWN = { x: -18, z: -10 };

// Collectible spawn points (x, y, z) in world space
export const COLLECTIBLE_SPAWNS = [
  [-18, 1, -10],
  [10, 1, -12],
  [20, 1, 6],
  [-2, 1, 8],
  [-22, 1, 10],
];
