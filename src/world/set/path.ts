import type { SetGraph } from "./types";
import { tileKey } from "./graph";

/** Same span as `playerxyz`: tile * 255 + 128. */
export const TILE_SPAN = 255;
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

/**
 * Dust scripts only call `walktostar`. DF.EXE walks the SET road graph
 * (`walkonroad` exists as an opcode but Dust never invokes it). The
 * filmed town is 52 camera tiles; walks that change x/y are the streets.
 * BFS those, then the named star. Beeline if the graph has no path.
 */
export function roadRoute(
  graph: SetGraph,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  toZ = 0,
): RoutePoint[] {
  const dest: RoutePoint = { x: toX, y: toY, z: toZ };
  if (graph.cameraTiles.size === 0) {
    return [dest];
  }
  const start = nearestCameraTile(graph, fromX, fromY);
  const goal = nearestCameraTile(graph, toX, toY);
  if (!start || !goal) {
    return [dest];
  }
  const tiles = bfsTiles(graph, start, goal);
  if (!tiles || tiles.length === 0) {
    return [dest];
  }
  const points: RoutePoint[] = [];
  // Snap onto a walk *edge* (the filmed street), not the nearest tile
  // center. town.leroy1 rounds to N7; N7's center is northwest of the
  // sign, so that hop cut across the dirt (looked like the cemetery).
  const onRoad = nearestOnWalkEdge(graph, fromX, fromY, tiles[0]);
  if (Math.hypot(fromX - onRoad.x, fromY - onRoad.y) > 32) {
    points.push({ ...onRoad, z: toZ });
  }
  for (let i = 1; i < tiles.length - 1; i++) {
    const at = tileWorld(tiles[i].x, tiles[i].y);
    points.push({ ...at, z: toZ });
  }
  points.push(dest);
  return dedupeRoute(fromX, fromY, points);
}

/** Closest point on a SET walk segment leaving `tile` (axis-aligned streets). */
function nearestOnWalkEdge(
  graph: SetGraph,
  x: number,
  y: number,
  tile: { x: number; y: number },
): { x: number; y: number } {
  const center = tileWorld(tile.x, tile.y);
  let best = center;
  let bestD = Math.hypot(x - center.x, y - center.y);
  for (const n of walkNeighbors(graph, tile.x, tile.y)) {
    const other = tileWorld(n.x, n.y);
    const p = closestOnSegment(x, y, center, other);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function closestOnSegment(
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) {
    return a;
  }
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function nearestCameraTile(
  graph: SetGraph,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const guess = worldToTile(x, y);
  if (graph.cameraTiles.has(tileKey(guess.x, guess.y))) {
    return guess;
  }
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const key of graph.cameraTiles) {
    const [tx, ty] = key.split(",").map(Number);
    const at = tileWorld(tx, ty);
    const d = Math.hypot(x - at.x, y - at.y);
    if (d < bestD) {
      bestD = d;
      best = { x: tx, y: ty };
    }
  }
  return best;
}

function walkNeighbors(graph: SetGraph, x: number, y: number): { x: number; y: number }[] {
  const seen = new Set<string>();
  const out: { x: number; y: number }[] = [];
  for (const tr of graph.byFrom.get(tileKey(x, y)) ?? []) {
    if (tr.xTo === x && tr.yTo === y) {
      continue;
    }
    const key = tileKey(tr.xTo, tr.yTo);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ x: tr.xTo, y: tr.yTo });
  }
  return out;
}

function bfsTiles(
  graph: SetGraph,
  start: { x: number; y: number },
  goal: { x: number; y: number },
): { x: number; y: number }[] | null {
  if (start.x === goal.x && start.y === goal.y) {
    return [start];
  }
  const startKey = tileKey(start.x, start.y);
  const goalKey = tileKey(goal.x, goal.y);
  const prev = new Map<string, string | null>([[startKey, null]]);
  const q = [startKey];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    if (cur === goalKey) {
      const keys: string[] = [];
      let at: string | null = cur;
      while (at) {
        keys.push(at);
        at = prev.get(at) ?? null;
      }
      keys.reverse();
      return keys.map((key) => {
        const [x, y] = key.split(",").map(Number);
        return { x, y };
      });
    }
    const [x, y] = cur.split(",").map(Number);
    for (const n of walkNeighbors(graph, x, y)) {
      const key = tileKey(n.x, n.y);
      if (prev.has(key)) {
        continue;
      }
      prev.set(key, cur);
      q.push(key);
    }
  }
  return null;
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
