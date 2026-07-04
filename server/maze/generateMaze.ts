export const WALL_NORTH = 1;
export const WALL_EAST = 2;
export const WALL_SOUTH = 4;
export const WALL_WEST = 8;
export const ALL_WALLS = WALL_NORTH | WALL_EAST | WALL_SOUTH | WALL_WEST;

export type MazeDirection = "up" | "down" | "left" | "right";

export interface MazeData {
  width: number;
  height: number;
  walls: number[];
  startX: number;
  startY: number;
  exitX: number;
  exitY: number;
  seed: number;
}

interface Neighbor {
  x: number;
  y: number;
  currentWall: number;
  neighborWall: number;
}

interface Cell {
  x: number;
  y: number;
}

function seededRandom(seed: number) {
  let value = seed | 0;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mazeIndex(width: number, x: number, y: number) {
  return y * width + x;
}

export function wallForDirection(direction: MazeDirection) {
  switch (direction) {
    case "up":
      return WALL_NORTH;
    case "right":
      return WALL_EAST;
    case "down":
      return WALL_SOUTH;
    case "left":
      return WALL_WEST;
  }
}

export function getMazeSizeForStage(stage: number) {
  const size = Math.min(23, 9 + Math.max(0, stage - 1) * 2);
  return { width: size, height: size };
}

function getOpenNeighbors(width: number, height: number, walls: readonly number[], cell: Cell): Cell[] {
  const mask = walls[mazeIndex(width, cell.x, cell.y)];
  const neighbors: Cell[] = [];

  if ((mask & WALL_NORTH) === 0 && cell.y > 0) neighbors.push({ x: cell.x, y: cell.y - 1 });
  if ((mask & WALL_EAST) === 0 && cell.x < width - 1) neighbors.push({ x: cell.x + 1, y: cell.y });
  if ((mask & WALL_SOUTH) === 0 && cell.y < height - 1) neighbors.push({ x: cell.x, y: cell.y + 1 });
  if ((mask & WALL_WEST) === 0 && cell.x > 0) neighbors.push({ x: cell.x - 1, y: cell.y });

  return neighbors;
}

export function isDeadEndCell(width: number, height: number, walls: readonly number[], x: number, y: number) {
  return getOpenNeighbors(width, height, walls, { x, y }).length === 1;
}

function getEdgeCells(width: number, height: number): Cell[] {
  const cells: Cell[] = [];

  for (let x = 0; x < width; x++) {
    cells.push({ x, y: 0 });
    cells.push({ x, y: height - 1 });
  }

  for (let y = 1; y < height - 1; y++) {
    cells.push({ x: 0, y });
    cells.push({ x: width - 1, y });
  }

  return cells;
}

function getDistances(width: number, height: number, walls: readonly number[], start: Cell) {
  const distances = Array.from({ length: width * height }, () => -1);
  const queue: Cell[] = [start];
  distances[mazeIndex(width, start.x, start.y)] = 0;

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const currentDistance = distances[mazeIndex(width, current.x, current.y)];

    for (const next of getOpenNeighbors(width, height, walls, current)) {
      const nextIndex = mazeIndex(width, next.x, next.y);
      if (distances[nextIndex] !== -1) continue;

      distances[nextIndex] = currentDistance + 1;
      queue.push(next);
    }
  }

  return distances;
}

function chooseStartAndExit(width: number, height: number, walls: readonly number[], random: () => number) {
  const edgeCells = getEdgeCells(width, height);
  const start = edgeCells[Math.floor(random() * edgeCells.length)];
  const distances = getDistances(width, height, walls, start);
  const maxDistance = Math.max(...distances);
  const oppositeCornerX = start.x < width / 2 ? width - 1 : 0;
  const oppositeCornerY = start.y < height / 2 ? height - 1 : 0;
  const farThreshold = Math.max(4, Math.floor(maxDistance * 0.68));

  let candidates = distances
    .map((distance, index) => ({
      x: index % width,
      y: Math.floor(index / width),
      distance,
    }))
    .filter((cell) => {
      if (cell.distance < farThreshold) return false;
      if (cell.x === start.x && cell.y === start.y) return false;

      const isTooObviousOppositeCorner = cell.x === oppositeCornerX && cell.y === oppositeCornerY;
      return !isTooObviousOppositeCorner && isDeadEndCell(width, height, walls, cell.x, cell.y);
    });

  if (candidates.length === 0) {
    candidates = distances
      .map((distance, index) => ({
        x: index % width,
        y: Math.floor(index / width),
        distance,
      }))
      .filter((cell) => !(cell.x === start.x && cell.y === start.y) && isDeadEndCell(width, height, walls, cell.x, cell.y));
  }

  const exit = candidates[Math.floor(random() * candidates.length)] ?? {
    x: width - 1,
    y: height - 1,
  };

  return {
    startX: start.x,
    startY: start.y,
    exitX: exit.x,
    exitY: exit.y,
  };
}

export function generateMaze(width: number, height: number, seed: number): MazeData {
  const random = seededRandom(seed);
  const walls = Array.from({ length: width * height }, () => ALL_WALLS);
  const visited = Array.from({ length: width * height }, () => false);
  const generationStart = {
    x: Math.floor(random() * width),
    y: Math.floor(random() * height),
  };
  const stack: Cell[] = [generationStart];
  visited[mazeIndex(width, generationStart.x, generationStart.y)] = true;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: Neighbor[] = [];

    if (current.y > 0 && !visited[mazeIndex(width, current.x, current.y - 1)]) {
      neighbors.push({
        x: current.x,
        y: current.y - 1,
        currentWall: WALL_NORTH,
        neighborWall: WALL_SOUTH,
      });
    }
    if (current.x < width - 1 && !visited[mazeIndex(width, current.x + 1, current.y)]) {
      neighbors.push({
        x: current.x + 1,
        y: current.y,
        currentWall: WALL_EAST,
        neighborWall: WALL_WEST,
      });
    }
    if (current.y < height - 1 && !visited[mazeIndex(width, current.x, current.y + 1)]) {
      neighbors.push({
        x: current.x,
        y: current.y + 1,
        currentWall: WALL_SOUTH,
        neighborWall: WALL_NORTH,
      });
    }
    if (current.x > 0 && !visited[mazeIndex(width, current.x - 1, current.y)]) {
      neighbors.push({
        x: current.x - 1,
        y: current.y,
        currentWall: WALL_WEST,
        neighborWall: WALL_EAST,
      });
    }

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = neighbors[Math.floor(random() * neighbors.length)];
    const currentIndex = mazeIndex(width, current.x, current.y);
    const nextIndex = mazeIndex(width, next.x, next.y);

    walls[currentIndex] &= ~next.currentWall;
    walls[nextIndex] &= ~next.neighborWall;
    visited[nextIndex] = true;
    stack.push({ x: next.x, y: next.y });
  }

  const { startX, startY, exitX, exitY } = chooseStartAndExit(width, height, walls, random);

  return {
    width,
    height,
    walls,
    startX,
    startY,
    exitX,
    exitY,
    seed,
  };
}
