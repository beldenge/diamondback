/**
 * Dust: Reimagined world space.
 *
 * Three.js Y-up. +X is east, +Z is south (SET +y). One Dust tile
 * (256 units in DF.EXE) is TILE world units here. Scene names follow
 * the SET grid: letter = row (`chr(65+y)`), number = column (`x+1`),
 * so G7 = (6,6), L7 = (6,11), O7 = (6,14).
 *
 * The filmed outdoor graph is the 52 camera tiles of
 * `dfextract/out/SET/_TOWN/transitions.json` (a framelist `from`/`to`
 * appearance), NOT the 225-cell blocked table. The data below is that
 * dump, hand-carried so the 3D town needs no extract fetch at runtime.
 */

export const TILE = 8;

export type Facing = "N" | "S" | "E" | "W";

export interface TilePos {
  x: number;
  y: number;
}

/** Filmed street poses, sorted row-major. 52 entries. */
export const CAMERA_TILES: readonly (readonly [number, number])[] = [
  [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3],
  [2, 4], [3, 4], [6, 4], [9, 4],
  [3, 5], [6, 5], [9, 5],
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
  [3, 7], [6, 7], [9, 7],
  [3, 8], [6, 8], [9, 8],
  [3, 9], [6, 9], [9, 9],
  [1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10],
  [2, 11], [4, 11],
  [6, 11], [6, 12], [6, 13],
  [5, 14], [6, 14], [7, 14],
];

/** Filmed walks between distinct tiles, undirected, [xa, ya, xb, yb]. */
export const WALK_EDGES: readonly (readonly [number, number, number, number])[] = [
  [0, 6, 1, 6], [1, 6, 2, 6], [1, 10, 2, 10], [2, 4, 3, 4], [2, 6, 3, 6],
  [2, 10, 2, 11], [2, 10, 3, 10], [3, 3, 3, 4], [3, 3, 4, 3], [3, 4, 3, 5],
  [3, 5, 3, 6], [3, 6, 3, 7], [3, 6, 4, 6], [3, 7, 3, 8], [3, 8, 3, 9],
  [3, 9, 3, 10], [3, 10, 4, 10], [4, 3, 5, 3], [4, 6, 5, 6], [4, 10, 4, 11],
  [4, 10, 5, 10], [5, 3, 6, 3], [5, 6, 6, 6], [5, 10, 6, 10], [5, 14, 6, 14],
  [6, 3, 6, 4], [6, 3, 7, 3], [6, 4, 6, 5], [6, 5, 6, 6], [6, 6, 6, 7],
  [6, 6, 7, 6], [6, 7, 6, 8], [6, 8, 6, 9], [6, 9, 6, 10], [6, 10, 6, 11],
  [6, 10, 7, 10], [6, 11, 6, 12], [6, 12, 6, 13], [6, 13, 6, 14], [6, 14, 7, 14],
  [7, 3, 8, 3], [7, 6, 8, 6], [7, 10, 8, 10], [8, 3, 9, 3], [8, 6, 9, 6],
  [8, 10, 9, 10], [9, 3, 9, 4], [9, 4, 9, 5], [9, 5, 9, 6], [9, 6, 9, 7],
  [9, 6, 10, 6], [9, 7, 9, 8], [9, 8, 9, 9], [9, 9, 9, 10], [9, 10, 10, 10],
];

export function sceneName(x: number, y: number): string {
  return `${String.fromCharCode(65 + y)}${x + 1}`;
}

/** "O7" → {x:6, y:14}. Case-insensitive; null when not a grid name. */
export function parseScene(name: string): TilePos | null {
  const m = /^([A-Oa-o])([1-9]|1[0-5])$/.exec(name.trim());
  if (!m) {
    return null;
  }
  return { x: Number(m[2]) - 1, y: m[1].toUpperCase().charCodeAt(0) - 65 };
}

/** World-space centre of a tile. Tile (x,y) spans [x*T, (x+1)*T]. */
export function tileCenter(x: number, y: number): { x: number; z: number } {
  return { x: (x + 0.5) * TILE, z: (y + 0.5) * TILE };
}

export function tileOf(worldX: number, worldZ: number): TilePos {
  return { x: Math.floor(worldX / TILE), y: Math.floor(worldZ / TILE) };
}

export function isCameraTile(x: number, y: number): boolean {
  return CAMERA_TILES.some(([tx, ty]) => tx === x && ty === y);
}

/**
 * Yaw 0 looks north (−Z); positive yaw turns left (west), matching
 * three.js `rotation.y`. Facing → the yaw that looks that way.
 */
export const FACING_YAW: Record<Facing, number> = {
  N: 0,
  W: Math.PI / 2,
  S: Math.PI,
  E: -Math.PI / 2,
};

export function parseFacing(value: string): Facing | null {
  const v = value.trim().toUpperCase();
  return v === "N" || v === "S" || v === "E" || v === "W" ? v : null;
}

/**
 * Move basis for a yaw. `forward` is the ground direction the camera
 * looks along; `right` is strafe-right. WASD must match the camera:
 * forward is (−sin yaw, −cos yaw), so at yaw 0 W walks north (−Z).
 */
export function wishXZ(
  yaw: number,
  moveForward: number,
  moveRight: number,
): { x: number; z: number } {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  // right = forward rotated 90° clockwise seen from above (+Y).
  const rx = -fz;
  const rz = fx;
  return {
    x: fx * moveForward + rx * moveRight,
    z: fz * moveForward + rz * moveRight,
  };
}
