import { describe, expect, it } from "vitest";
import {
  CHAIN_HOP_MS,
  CHAIN_RADIUS_TILES,
  catchChance,
  chainDepth,
  chainDetonations,
  type ChainTarget,
} from "./chain";

/** Every neighbour catches: isolates topology from the decay roll. */
const ALWAYS = (): number => 0;

/** Nothing past hop 1 catches. */
const NEVER = (): number => 1;

function blast(seed: number, targets: readonly ChainTarget[], rand = ALWAYS) {
  return chainDetonations(seed, targets, CHAIN_HOP_MS, CHAIN_RADIUS_TILES, rand);
}

function line(n: number): ChainTarget[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, tx: i, ty: 0 }));
}

function block(side: number): ChainTarget[] {
  const out: ChainTarget[] = [];
  let id = 1;
  for (let x = 0; x < side; x += 1) {
    for (let y = 0; y < side; y += 1) {
      out.push({ id: id++, tx: x, ty: y });
    }
  }
  return out;
}

describe("chainDetonations", () => {
  it("returns nothing when the shot bird is not in the flock", () => {
    expect(blast(99, line(4))).toEqual([]);
  });

  it("pops a lone bird with no chain", () => {
    expect(blast(1, [{ id: 1, tx: 0, ty: 0 }])).toEqual([{ id: 1, delayMs: 0, hop: 0 }]);
  });

  it("leaves birds more than a tile away alone", () => {
    const chain = blast(1, [
      { id: 1, tx: 0, ty: 0 },
      { id: 2, tx: 5, ty: 5 },
    ]);
    expect(chain.map((d) => d.id)).toEqual([1]);
  });

  it("travels one tile per hop and stays staggered in time", () => {
    expect(blast(1, line(4))).toEqual([
      { id: 1, delayMs: 0, hop: 0 },
      { id: 2, delayMs: CHAIN_HOP_MS, hop: 1 },
      { id: 3, delayMs: CHAIN_HOP_MS * 2, hop: 2 },
      { id: 4, delayMs: CHAIN_HOP_MS * 3, hop: 3 },
    ]);
  });

  it("dead-ends where the street does", () => {
    // A three-tile run, a two-tile gap, then two more: the cascade stops.
    const chain = blast(1, [
      { id: 1, tx: 0, ty: 0 },
      { id: 2, tx: 1, ty: 0 },
      { id: 3, tx: 2, ty: 0 },
      { id: 4, tx: 5, ty: 0 },
      { id: 5, tx: 6, ty: 0 },
    ]);
    expect(chain.map((d) => d.id).sort()).toEqual([1, 2, 3]);
  });

  it("spreads diagonally as well as along the street", () => {
    const chain = blast(1, [
      { id: 1, tx: 0, ty: 0 },
      { id: 2, tx: 1, ty: 1 },
    ]);
    expect(chain.map((d) => d.hop)).toEqual([0, 1]);
  });

  it("counts a bird exactly once no matter how many neighbours reach it", () => {
    const chain = blast(5, block(3));
    expect(chain).toHaveLength(9);
    expect(new Set(chain.map((d) => d.id)).size).toBe(9);
  });

  it("pops a whole dense block on one hop when they all touch the seed", () => {
    const chain = blast(1, [
      { id: 1, tx: 1, ty: 1 },
      { id: 2, tx: 0, ty: 0 },
      { id: 3, tx: 1, ty: 0 },
      { id: 4, tx: 2, ty: 2 },
    ]);
    expect(chain.every((d) => d.hop <= 1)).toBe(true);
    expect(chainDepth(chain)).toBe(1);
  });

  it("scales to a street full of birds without quadratic blowup", () => {
    const chain = blast(1, line(400));
    expect(chain).toHaveLength(400);
    expect(chainDepth(chain)).toBe(399);
  });
});

describe("blast decay", () => {
  it("always lights the birds standing right next to the one you shot", () => {
    expect(catchChance(1)).toBe(1);
  });

  it("runs out of steam the further it travels", () => {
    expect(catchChance(5)).toBeLessThan(catchChance(2));
    expect(catchChance(12)).toBeLessThan(catchChance(5));
  });

  it("never falls to zero, so a long chain thins instead of stopping dead", () => {
    expect(catchChance(500)).toBeGreaterThan(0);
  });

  it("stops one shot from clearing a packed street every single time", () => {
    // The wave-12 failure: 96 birds so densely connected that a single
    // bullet took all of them. With decay the same flock keeps survivors.
    const flock = block(10);
    const chain = blast(45, flock, NEVER);
    expect(chain.length).toBeLessThan(flock.length);
  });

  it("still reaches past the first ring when the rolls go your way", () => {
    expect(chainDepth(blast(1, line(30)))).toBeGreaterThan(3);
  });

  it("gives a bird the blast skipped another chance from a later hop", () => {
    // Two parallel rows. On hop 2 the roll lights the upper bird and
    // misses the lower one; because a miss leaves that bird in the pool,
    // hop 3 comes at it sideways from the bird that did catch.
    const targets: ChainTarget[] = [
      { id: 1, tx: 0, ty: 0 },
      { id: 2, tx: 1, ty: 0 },
      { id: 3, tx: 1, ty: 1 },
      { id: 4, tx: 2, ty: 0 },
      { id: 5, tx: 2, ty: 1 },
    ];
    // Hop 1 never rolls. Then: catch 5, miss 4, catch 4 on the way back.
    const rolls = [0, 1, 0];
    let at = 0;
    const scripted = (): number => rolls[at++] ?? 0;
    const chain = blast(1, targets, scripted);
    expect(chain.map((d) => d.id).sort()).toEqual([1, 2, 3, 4, 5]);
    // The skipped bird went up a hop later than its neighbour.
    expect(chain.find((d) => d.id === 4)!.hop).toBeGreaterThan(
      chain.find((d) => d.id === 5)!.hop,
    );
  });
});

describe("chainDepth", () => {
  it("is zero for a single pop", () => {
    expect(chainDepth([{ id: 1, delayMs: 0, hop: 0 }])).toBe(0);
  });

  it("reports the furthest hop reached", () => {
    expect(chainDepth(blast(1, line(6)))).toBe(5);
  });
});
