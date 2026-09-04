import { describe, expect, it } from "vitest";
import { worldToTile } from "../../world/set/path";
import {
  BIRD_DRIFT,
  birdTile,
  neighbourTiles,
  parseTileKey,
  retarget,
  seedFlock,
  stepFlock,
  walkableTiles,
  type TileXY,
} from "./flock";
import { MAX_BIRDS_PER_TILE } from "./waves";

/** Deterministic stand-in for Math.random. */
function seeded(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const STREET: TileXY[] = [
  { x: 6, y: 14 },
  { x: 6, y: 13 },
  { x: 6, y: 12 },
  { x: 6, y: 11 },
  { x: 7, y: 11 },
];

describe("tile helpers", () => {
  it("parses the graph's tile keys", () => {
    expect(parseTileKey("6,14")).toEqual({ x: 6, y: 14 });
    expect(parseTileKey("nonsense")).toBeNull();
  });

  it("turns camera tiles into a stable ordered list", () => {
    const tiles = walkableTiles(["7,11", "6,14", "6,11"]);
    expect(tiles).toEqual([
      { x: 6, y: 11 },
      { x: 7, y: 11 },
      { x: 6, y: 14 },
    ]);
  });

  it("skips keys that are not tiles", () => {
    expect(walkableTiles(["6,14", "bad"])).toEqual([{ x: 6, y: 14 }]);
  });

  it("finds touching tiles and excludes the tile itself", () => {
    const near = neighbourTiles({ x: 6, y: 12 }, STREET);
    expect(near).toContainEqual({ x: 6, y: 11 });
    expect(near).toContainEqual({ x: 6, y: 13 });
    expect(near).toContainEqual({ x: 7, y: 11 });
    expect(near).not.toContainEqual({ x: 6, y: 12 });
    expect(near).not.toContainEqual({ x: 6, y: 14 });
  });
});

describe("seedFlock", () => {
  it("seeds nothing with nowhere to stand", () => {
    expect(seedFlock(20, [], seeded())).toEqual([]);
  });

  it("gives every bird a unique id from the requested start", () => {
    const birds = seedFlock(10, STREET, seeded(), 100);
    expect(new Set(birds.map((b) => b.id)).size).toBe(birds.length);
    expect(Math.min(...birds.map((b) => b.id))).toBe(100);
  });

  it("only puts birds on tiles the film can see", () => {
    const birds = seedFlock(20, STREET, seeded());
    const walkable = new Set(STREET.map((t) => `${t.x},${t.y}`));
    for (const bird of birds) {
      const tile = birdTile(bird);
      expect(walkable.has(`${tile.x},${tile.y}`)).toBe(true);
    }
  });

  it("never piles more than the density cap onto one tile", () => {
    const birds = seedFlock(200, STREET, seeded(7));
    const perTile = new Map<string, number>();
    for (const bird of birds) {
      const tile = birdTile(bird);
      const key = `${tile.x},${tile.y}`;
      perTile.set(key, (perTile.get(key) ?? 0) + 1);
    }
    for (const count of perTile.values()) {
      expect(count).toBeLessThanOrEqual(MAX_BIRDS_PER_TILE);
    }
  });

  it("stops asking for room that does not exist instead of hanging", () => {
    // Five tiles at six birds each is thirty; asking for 500 must return.
    const birds = seedFlock(500, STREET, seeded(3));
    expect(birds.length).toBeLessThanOrEqual(STREET.length * MAX_BIRDS_PER_TILE);
  });
});

describe("stepFlock", () => {
  it("walks a bird toward its target", () => {
    const birds = seedFlock(1, STREET, seeded(11));
    const bird = birds[0]!;
    bird.x = 1000;
    bird.y = 1000;
    bird.toX = 2000;
    bird.toY = 1000;
    stepFlock(birds, 1, STREET, seeded(2));
    expect(bird.x).toBeGreaterThan(1000);
    expect(bird.y).toBeCloseTo(1000, 5);
  });

  it("never overshoots the spot it was walking to", () => {
    const birds = seedFlock(1, STREET, seeded(5));
    const bird = birds[0]!;
    bird.x = 0;
    bird.y = 0;
    bird.toX = 3;
    bird.toY = 0;
    stepFlock(birds, 10, STREET, seeded(2));
    expect(bird.x).toBeLessThanOrEqual(3.0001);
  });

  it("holds the walk cycle still for a bird that has arrived", () => {
    const birds = seedFlock(1, STREET, seeded(9));
    const bird = birds[0]!;
    bird.x = 500;
    bird.y = 500;
    bird.toX = 500;
    bird.toY = 500;
    const step = bird.step;
    // A random that never fires the retarget roll.
    stepFlock(birds, 0.5, STREET, () => 0.99, 1);
    expect(bird.step).toBe(step);
  });

  it("advances the walk cycle on Dust game frames, not on rendered frames", () => {
    const birds = seedFlock(1, STREET, seeded(21));
    const bird = birds[0]!;
    bird.x = 0;
    bird.y = 0;
    bird.toX = 100000;
    bird.toY = 0;
    const step = bird.step;
    // Three rendered frames inside one 20 Hz game frame: the bird moves
    // three times but the two-plate walk cycle advances exactly once.
    stepFlock(birds, 1 / 60, STREET, () => 0.99, 0);
    stepFlock(birds, 1 / 60, STREET, () => 0.99, 0);
    stepFlock(birds, 1 / 60, STREET, () => 0.99, 1);
    expect(bird.x).toBeGreaterThan(0);
    expect(bird.step).toBe(step + 1);
  });

  it("keeps the flock inside the world it was seeded into", () => {
    const birds = seedFlock(20, STREET, seeded(13));
    for (let i = 0; i < 200; i += 1) {
      stepFlock(birds, 1 / 60, STREET, seeded(i + 1));
    }
    for (const bird of birds) {
      const tile = worldToTile(bird.x, bird.y);
      expect(tile.x).toBeGreaterThanOrEqual(5);
      expect(tile.x).toBeLessThanOrEqual(8);
      expect(tile.y).toBeGreaterThanOrEqual(10);
      expect(tile.y).toBeLessThanOrEqual(15);
    }
  });
});

describe("drift toward the player", () => {
  const line: TileXY[] = Array.from({ length: 8 }, (_, i) => ({ x: 6, y: 7 + i }));

  it("is on, but not a beeline", () => {
    // 0 would be pure milling; 1 would read as a zombie horde.
    expect(BIRD_DRIFT).toBeGreaterThan(0);
    expect(BIRD_DRIFT).toBeLessThan(1);
  });

  it("steps toward the player when the roll says to close in", () => {
    const birds = seedFlock(1, line, seeded(4));
    const bird = birds[0]!;
    bird.x = 6 * 256 + 128;
    bird.y = 14 * 256 + 128;
    // drift 1 forces the closing branch; the player is north up the line.
    retarget(bird, line, () => 0, { x: 6, y: 7 }, 1);
    expect(bird.toY).toBeLessThan(bird.y);
  });

  it("still wanders when the roll says not to", () => {
    const birds = seedFlock(1, line, seeded(6));
    const bird = birds[0]!;
    bird.x = 6 * 256 + 128;
    bird.y = 14 * 256 + 128;
    const before = { x: bird.toX, y: bird.toY };
    // drift 0 never takes the closing branch.
    retarget(bird, line, seeded(2), { x: 6, y: 7 }, 0);
    expect({ x: bird.toX, y: bird.toY }).not.toEqual(before);
  });

  it("does not jitter a bird already standing on the player", () => {
    const birds = seedFlock(1, line, seeded(8));
    const bird = birds[0]!;
    bird.x = 6 * 256 + 128;
    bird.y = 7 * 256 + 128;
    // No neighbour is nearer than standing still, so it falls through to
    // an ordinary wander rather than picking itself forever.
    retarget(bird, line, () => 0, { x: 6, y: 7 }, 1);
    expect(Number.isFinite(bird.toX)).toBe(true);
    expect(Number.isFinite(bird.toY)).toBe(true);
  });

  it("brings a distant flock in over time", () => {
    const birds = seedFlock(12, line, seeded(15));
    const player = { x: 6, y: 7 };
    const far = (b: { x: number; y: number }) =>
      Math.hypot(b.x / 256 - player.x, b.y / 256 - player.y);
    const before = birds.reduce((sum, b) => sum + far(b), 0) / birds.length;
    const rand = seeded(21);
    for (let i = 0; i < 4000; i += 1) {
      stepFlock(birds, 1 / 30, line, rand, 1, player);
    }
    const after = birds.reduce((sum, b) => sum + far(b), 0) / birds.length;
    expect(after).toBeLessThan(before);
  });
});
