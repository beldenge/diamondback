import { FACING_YAW, TILE, parseFacing, parseScene, tileCenter } from "./coords";

export interface SpawnPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * Default spawn: the south gate, SET tile O7 (6,14), facing north into
 * Main Street. The film's draw lens sits 64 units (2 m) behind the
 * walker's feet, so the pose stands that far south of the tile centre
 * and the first frame matches the O7 N still. Never the world origin.
 */
export const LENS_SETBACK = (64 / 256) * TILE;

export const DEFAULT_SPAWN: SpawnPose = {
  x: tileCenter(6, 14).x,
  y: 0,
  z: tileCenter(6, 14).z + LENS_SETBACK,
  yaw: FACING_YAW.N,
};

function queryOf(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

/**
 * Debug spawn overrides — used ONLY when actually present in the URL.
 * `Number(null) === 0`, so a missing `x`/`z` must never read as
 * "spawn at origin": every param is gated on `has()` + a finite parse.
 *
 * Supported: `tx`/`ty` (tile), `scene` (e.g. `G7`), `facing` (NSEW),
 * `x`/`z` (world units), `y` (height).
 */
export function parseSpawn(search: string): SpawnPose {
  const q = queryOf(search);
  const pose: SpawnPose = { ...DEFAULT_SPAWN };

  const scene = q.get("scene");
  if (scene !== null) {
    const tile = parseScene(scene);
    if (tile) {
      const c = tileCenter(tile.x, tile.y);
      pose.x = c.x;
      pose.z = c.z;
    }
  }

  const tx = q.get("tx");
  const ty = q.get("ty");
  if (tx !== null && ty !== null) {
    const ix = Number(tx);
    const iy = Number(ty);
    if (Number.isInteger(ix) && Number.isInteger(iy)) {
      const c = tileCenter(ix, iy);
      pose.x = c.x;
      pose.z = c.z;
    }
  }

  const wx = q.get("x");
  if (wx !== null && Number.isFinite(Number(wx)) && wx.trim() !== "") {
    pose.x = Number(wx);
  }
  const wz = q.get("z");
  if (wz !== null && Number.isFinite(Number(wz)) && wz.trim() !== "") {
    pose.z = Number(wz);
  }
  const wy = q.get("y");
  if (wy !== null && Number.isFinite(Number(wy)) && wy.trim() !== "") {
    pose.y = Math.max(0, Number(wy));
  }

  const facing = q.get("facing");
  if (facing !== null) {
    const f = parseFacing(facing);
    if (f) {
      pose.yaw = FACING_YAW[f];
    }
  }

  return pose;
}

/** Sanity used by tests: a pose is inside the built world, not origin. */
export function isTownPose(pose: SpawnPose): boolean {
  return (
    pose.x > -2 * TILE &&
    pose.x < 15 * TILE &&
    pose.z > -3 * TILE &&
    pose.z < 17 * TILE &&
    !(Math.abs(pose.x) < 1 && Math.abs(pose.z) < 1)
  );
}
