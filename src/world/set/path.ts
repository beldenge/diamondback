/** Same span as `playerxyz`: tile * 256 + 128. DF.EXE `shl ax,8; add ax,0x80`. */
export const TILE_SPAN = 256;
export const TILE_ORIGIN = 128;

export function worldToTile(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round((x - TILE_ORIGIN) / TILE_SPAN),
    y: Math.round((y - TILE_ORIGIN) / TILE_SPAN),
  };
}

export function tileWorld(x: number, y: number): { x: number; y: number } {
  return { x: x * TILE_SPAN + TILE_ORIGIN, y: y * TILE_SPAN + TILE_ORIGIN };
}

export interface RoutePoint {
  x: number;
  y: number;
  z: number;
}

/** SET waypoint-pair polyline (container at record +0x18). Points run A→B. */
export interface StarPath {
  a: string;
  b: string;
  container?: number;
  length?: number;
  points: RoutePoint[];
}

/**
 * Named `walktostar` follows the SET polyline on that star pair
 * (`DF.EXE` `0x424000` / `0x411f50`), reversing when going B→A.
 * No pair (or explicit `"x,y,z"`) is a beeline to `dest`.
 */
export function routeToStar(
  paths: StarPath[],
  fromStar: string,
  toStar: string,
  fromX: number,
  fromY: number,
  dest: RoutePoint,
): RoutePoint[] {
  const from = fromStar.toLowerCase();
  const to = toStar.toLowerCase();
  if (!from || !to || from === to) {
    return [dest];
  }
  const pair = paths.find(
    (path) =>
      (path.a.toLowerCase() === from && path.b.toLowerCase() === to) ||
      (path.a.toLowerCase() === to && path.b.toLowerCase() === from),
  );
  if (!pair || pair.points.length < 2) {
    return [dest];
  }
  const stored = pair.points.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
  const points = pair.a.toLowerCase() === from ? stored : stored.slice().reverse();
  points[points.length - 1] = dest;
  return dedupeRoute(fromX, fromY, points);
}

function dedupeRoute(fromX: number, fromY: number, points: RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  let px = fromX;
  let py = fromY;
  for (const p of points) {
    if (Math.hypot(p.x - px, p.y - py) < 2) {
      continue;
    }
    out.push(p);
    px = p.x;
    py = p.y;
  }
  return out.length ? out : points.slice(-1);
}
