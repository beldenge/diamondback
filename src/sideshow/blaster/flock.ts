/**
 * The flock: where chickens stand, and how they mill about.
 *
 * Birds live in Dust world units (`tile * 256 + 128`, +x east, +y south)
 * and are pinned to the 52 filmed camera tiles of `_TOWN`, so anything
 * alive is somewhere the film can actually see. They are not trying to be
 * menacing — volume is the point — but they do leak toward the player as
 * they wander, so a wave arrives rather than having to be hunted down.
 * See `BIRD_DRIFT`.
 */

import { TILE_SPAN, tileWorld, worldToTile } from "../../world/set/path";
import { MAX_BIRDS_PER_TILE } from "./waves";

/**
 * World units per second — a tile is 256, so this is a tile every ~1.7s.
 *
 * Not an amble, and not even a trot. Dust's own chickens bolt when you
 * click them; these come up the street fast enough that standing your
 * ground is a choice rather than the default, and backing off while you
 * keep shooting is often the better one.
 */
export const BIRD_SPEED = 148;

/** How far from a tile centre a bird will stand. */
const SCATTER = TILE_SPAN * 0.36;

/** Ordinary bird sprite scale. Bosses multiply their own base. */
export const BIRD_SCALE = 1000;

export interface Bird {
  id: number;
  x: number;
  y: number;
  /** Facing, Dust degrees (0 = east). */
  deg: number;
  /** Walk-cycle step, advanced on the game frame. */
  step: number;
  /** Where it is ambling. */
  toX: number;
  toY: number;
  /** Set the moment a chain schedules it, so it cannot be re-detonated. */
  doomed: boolean;
}

export interface TileXY {
  x: number;
  y: number;
}

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseTileKey(key: string): TileXY | null {
  const [sx, sy] = key.split(",");
  const x = Number(sx);
  const y = Number(sy);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

/** Camera tiles as coordinates, in a stable order. */
export function walkableTiles(cameraTiles: Iterable<string>): TileXY[] {
  const out: TileXY[] = [];
  for (const key of cameraTiles) {
    const tile = parseTileKey(key);
    if (tile) {
      out.push(tile);
    }
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
}

/** Camera tiles orthogonally or diagonally touching this one. */
export function neighbourTiles(tile: TileXY, walkable: readonly TileXY[]): TileXY[] {
  return walkable.filter(
    (other) =>
      !(other.x === tile.x && other.y === tile.y) &&
      Math.abs(other.x - tile.x) <= 1 &&
      Math.abs(other.y - tile.y) <= 1,
  );
}

export function birdTile(bird: { x: number; y: number }): TileXY {
  return worldToTile(bird.x, bird.y);
}

/**
 * Release a knot of birds at one tile — the town gate.
 *
 * A wave is fed in from here a few at a time rather than dropped onto the
 * map at once: they come up the street as a stream you can see arriving,
 * which is the whole point of calling them waves. They are allowed to
 * overlap at the gate because they spread out within a second of walking.
 */
export function spawnAt(
  count: number,
  origin: TileXY,
  walkable: readonly TileXY[],
  rand: () => number,
  startId = 1,
): Bird[] {
  const centre = tileWorld(origin.x, origin.y);
  const birds: Bird[] = [];
  for (let i = 0; i < count; i += 1) {
    const bird: Bird = {
      id: startId + i,
      x: centre.x + (rand() * 2 - 1) * SCATTER,
      y: centre.y + (rand() * 2 - 1) * SCATTER,
      deg: 192,
      step: Math.floor(rand() * 8),
      toX: 0,
      toY: 0,
      doomed: false,
    };
    retarget(bird, walkable, rand);
    birds.push(bird);
  }
  return birds;
}

/**
 * Seed a wave across the whole map. Birds are dealt round-robin over the
 * walkable tiles so no single tile turns into an unreadable pile, then
 * scattered inside it. Kept for a scattered-start variant; the mode itself
 * feeds waves in through `spawnAt`.
 */
export function seedFlock(
  count: number,
  walkable: readonly TileXY[],
  rand: () => number,
  startId = 1,
): Bird[] {
  if (walkable.length === 0) {
    return [];
  }
  const perTile = new Map<string, number>();
  const birds: Bird[] = [];
  // Deal from a shuffled order so waves do not always fill the same tiles.
  const order = walkable.slice();
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  let cursor = 0;
  let guard = 0;
  while (birds.length < count && guard < count * 8) {
    guard += 1;
    const tile = order[cursor % order.length]!;
    cursor += 1;
    const key = keyOf(tile.x, tile.y);
    const here = perTile.get(key) ?? 0;
    if (here >= MAX_BIRDS_PER_TILE) {
      continue;
    }
    perTile.set(key, here + 1);
    const centre = tileWorld(tile.x, tile.y);
    const bird: Bird = {
      id: startId + birds.length,
      x: centre.x + (rand() * 2 - 1) * SCATTER,
      y: centre.y + (rand() * 2 - 1) * SCATTER,
      deg: Math.floor(rand() * 256),
      step: Math.floor(rand() * 8),
      toX: 0,
      toY: 0,
      doomed: false,
    };
    retarget(bird, walkable, rand);
    birds.push(bird);
  }
  return birds;
}

/**
 * How often a bird picking its next tile chooses the one that closes on
 * the player instead of a random neighbour.
 *
 * 0 is pure milling, where the flock stays where it was seeded and you go
 * and find it; 1 is a dead-straight beeline. High, but not 1: they still
 * wander a little at the edges, which keeps them reading as birds rather
 * than as homing missiles. Set to 0 to back the behaviour out entirely;
 * nothing else has to change.
 */
export const BIRD_DRIFT = 0.9;

function nearestTo(options: readonly TileXY[], toward: TileXY): TileXY | undefined {
  let best: TileXY | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const d = Math.hypot(option.x - toward.x, option.y - toward.y);
    if (d < bestDist) {
      bestDist = d;
      best = option;
    }
  }
  return best;
}

/**
 * Point a bird at a fresh spot on a neighbouring (or its own) tile.
 * With `toward` set, it leans toward the player's tile `BIRD_DRIFT` of
 * the time — see the constant.
 */
export function retarget(
  bird: Bird,
  walkable: readonly TileXY[],
  rand: () => number,
  toward?: TileXY,
  drift: number = BIRD_DRIFT,
): void {
  const here = birdTile(bird);
  const options = neighbourTiles(here, walkable);
  let pick: TileXY | undefined;
  if (toward && options.length > 0 && rand() < drift) {
    // Only close in when a neighbour is actually nearer than standing
    // still, or birds on the player's own tile jitter in place.
    const closer = options.filter(
      (o) =>
        Math.hypot(o.x - toward.x, o.y - toward.y) <
        Math.hypot(here.x - toward.x, here.y - toward.y),
    );
    pick = nearestTo(closer, toward);
  }
  pick ??=
    options.length > 0 && rand() < 0.75
      ? options[Math.floor(rand() * options.length)]!
      : (walkable.find((t) => t.x === here.x && t.y === here.y) ??
        walkable[Math.floor(rand() * walkable.length)]!);
  const centre = tileWorld(pick.x, pick.y);
  bird.toX = centre.x + (rand() * 2 - 1) * SCATTER;
  bird.toY = centre.y + (rand() * 2 - 1) * SCATTER;
}

/**
 * Advance the flock. `dt` is seconds, so movement is smooth at whatever
 * rate the display runs.
 *
 * `frames` is how many **20 Hz Dust game frames** elapsed, and is the only
 * thing that advances the walk cycle. Movement and animation are separate
 * clocks on purpose: stepping the cycle once per rendered frame strobes
 * the two-plate chicken walk at 60 Hz instead of the 20 Hz the sprites
 * were authored for.
 *
 * A bird that has reached its spot stands still rather than moon-walking.
 */
export function stepFlock(
  birds: readonly Bird[],
  dt: number,
  walkable: readonly TileXY[],
  rand: () => number,
  frames = 0,
  toward?: TileXY,
): void {
  const travel = BIRD_SPEED * dt;
  for (const bird of birds) {
    const dx = bird.toX - bird.x;
    const dy = bird.toY - bird.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) {
      if (rand() < 0.02) {
        retarget(bird, walkable, rand, toward);
      }
      continue;
    }
    const move = Math.min(travel, dist);
    bird.x += (dx / dist) * move;
    bird.y += (dy / dist) * move;
    bird.deg = ((Math.atan2(dy, dx) / (2 * Math.PI)) * 256 + 256) % 256;
    bird.step += frames;
  }
}
