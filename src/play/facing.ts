import { STILL_HEIGHT, STILL_WIDTH, type Dir } from "../world/set/types";
import type { ActorState } from "./host";

/** Dust `actordeg` / `currentdeg`: 256 units per turn, 0 = south, 64 = east. */
export const DEG_SOUTH = 0;
export const DEG_EAST = 64;
export const DEG_NORTH = 128;
export const DEG_WEST = 192;

export const DIR_DEG: Record<Dir, number> = {
  S: DEG_SOUTH,
  E: DEG_EAST,
  N: DEG_NORTH,
  W: DEG_WEST,
};

const OCTANT_DEG = [0, 32, 64, 96, 128, 160, 192, 224];

export function wrapDeg(deg: number): number {
  return ((Math.round(deg) % 256) + 256) % 256;
}

export function dirToDeg(facing: Dir): number {
  return DIR_DEG[facing];
}

/** 0=S, 1=SE, 2=E, 3=NE, 4=N, 5=NW, 6=W, 7=SW — matches CST stand frame order. */
export function degToOctant(deg: number): number {
  return wrapDeg(deg + 16) >> 5;
}

/**
 * Which of the 8 CST stand/walk frames the camera sees.
 * Octant 0 is the front (actor facing the camera).
 */
export function visibleOctant(actorDeg: number, cameraDeg: number): number {
  return (degToOctant(actorDeg) - degToOctant(cameraDeg) + 4) & 7;
}

/** Shortest signed step from `from` to `to` on the 0–255 circle. */
export function degDelta(from: number, to: number): number {
  let d = wrapDeg(to) - wrapDeg(from);
  if (d > 128) {
    d -= 256;
  }
  if (d < -128) {
    d += 256;
  }
  return d;
}

/** Direction from `from` toward `to` (world +x east, +y south). */
export function calcDeg(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return 0;
  }
  const rad = Math.atan2(dx, dy);
  return wrapDeg((rad / (2 * Math.PI)) * 256);
}

export function calcVect(
  deg: number,
  dist: number,
): { x: number; y: number } {
  const rad = (wrapDeg(deg) / 256) * 2 * Math.PI;
  return { x: dist * Math.sin(rad), y: dist * Math.cos(rad) };
}

export function pickCyclic<T>(frames: T[], octant: number): T | undefined {
  if (frames.length === 0) {
    return undefined;
  }
  return frames[octant % frames.length];
}

export function walkFrame<T>(
  frames: T[],
  octant: number,
  step: number,
  perDir = 8,
): T | undefined {
  if (frames.length < perDir) {
    return pickCyclic(frames, octant);
  }
  const dirs = Math.max(1, Math.floor(frames.length / perDir));
  const pose = step % Math.max(1, Math.floor(frames.length / dirs));
  return frames[pose * dirs + (octant % dirs)];
}

/** Project a world-space actor onto the 512×264 still. */
export function worldToStill(
  actor: ActorState,
  pose: { x: number; y: number; facing: string },
): { x: number; y: number; forward: number } | null {
  const px = pose.x * 255 + 128;
  const py = pose.y * 255 + 128;
  let fx = 0;
  let fy = 0;
  if (pose.facing === "N") {
    fy = -1;
  } else if (pose.facing === "S") {
    fy = 1;
  } else if (pose.facing === "E") {
    fx = 1;
  } else {
    fx = -1;
  }
  const dx = actor.x - px;
  const dy = actor.y - py;
  const forward = dx * fx + dy * fy;
  const right = dx * -fy + dy * fx;
  if (forward < -80 || forward > 700) {
    return null;
  }
  return {
    x: STILL_WIDTH / 2 + right * 0.55,
    y: STILL_HEIGHT * 0.94 - Math.min(forward, 520) * 0.28,
    forward,
  };
}

export { OCTANT_DEG };
