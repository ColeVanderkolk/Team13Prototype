// Tuning knobs for the prototype — tweak these to change the game feel.

export const GAME_DURATION = 30 * 60; // seconds (30 minutes)

export const WALK_SPEED = 6.0;
export const SPRINT_SPEED = 10.5;
export const CHAR_RADIUS = 0.45; // body radius used for wall collision

export const CAM_ANGLE = Math.PI * 0.25; // diagonal offset direction
export const CAM_PITCH = 1.05;           // overhead tilt; lower = more side-on
export const CAM_DIST_MIN = 12;
export const CAM_DIST_MAX = 40;
export const CAM_DIST_DEFAULT = 22;
