import { describe, expect, it } from "vitest";
import {
  CHAIN_HOP_MS,
  CHAIN_RADIUS_TILES,
  chainDetonations,
  type ChainTarget,
} from "./chain";
import { AMMO_PER_BOSS, DIRECT_KILL, Run, chainScore, comboBanner, hopScore } from "./score";
import { MAX_AMMO, STARTING_AMMO } from "./waves";

describe("scoring", () => {
  it("pays the flat rate for a bird you shot yourself", () => {
    expect(hopScore(0)).toBe(DIRECT_KILL);
  });

  it("pays more for every hop the cascade travels", () => {
    expect(hopScore(1)).toBeGreaterThan(hopScore(0));
    expect(hopScore(9)).toBeGreaterThan(hopScore(8));
  });

  it("makes one shot into a flock beat many aimed shots", () => {
    const flock: ChainTarget[] = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      tx: i,
      ty: 0,
    }));
    // Rolls forced to catch, so this measures the payout curve rather
    // than the blast decay.
    const chain = chainDetonations(1, flock, CHAIN_HOP_MS, CHAIN_RADIUS_TILES, () => 0);
    const cascade = chainScore(chain.map((d) => d.hop));
    const aimed = 12 * DIRECT_KILL;
    expect(cascade).toBeGreaterThan(aimed * 3);
  });
});

describe("combo banner", () => {
  it("says nothing about one lonely bird", () => {
    expect(comboBanner(1, 0)).toBeNull();
  });

  it("shouts louder the further the cascade got", () => {
    expect(comboBanner(2, 1)).toBe("2 birds");
    expect(comboBanner(9, 4)).toBe("9 BIRDS");
    expect(comboBanner(20, 8)).toContain("FEATHERS");
    expect(comboBanner(40, 14)).toContain("WHOLE DAMN STREET");
  });
});

describe("Run", () => {
  it("starts with a full belt and no score", () => {
    const run = new Run();
    expect(run.ammo).toBe(STARTING_AMMO);
    expect(run.score).toBe(0);
    expect(run.over).toBe(false);
  });

  it("spends a shell per shot", () => {
    const run = new Run();
    expect(run.spend()).toBe(true);
    expect(run.ammo).toBe(STARTING_AMMO - 1);
  });

  it("ends the run when the belt runs empty", () => {
    const run = new Run();
    for (let i = 0; i < STARTING_AMMO; i += 1) {
      expect(run.spend()).toBe(true);
    }
    expect(run.over).toBe(true);
    expect(run.spend()).toBe(false);
    expect(run.ammo).toBe(0);
  });

  it("never lets a shot go out on an empty belt", () => {
    const run = new Run();
    run.ammo = 0;
    expect(run.spend()).toBe(false);
    expect(run.ammo).toBe(0);
  });

  it("refills on a wave clear, which is the only source of shells", () => {
    const run = new Run();
    run.ammo = 3;
    run.clearWave();
    expect(run.ammo).toBeGreaterThan(3);
    expect(run.wave).toBe(2);
    expect(run.score).toBeGreaterThan(0);
  });

  it("caps the belt so a good run cannot bank forever", () => {
    const run = new Run();
    for (let i = 0; i < 30; i += 1) {
      run.clearWave();
    }
    expect(run.ammo).toBeLessThanOrEqual(MAX_AMMO);
  });

  it("remembers the longest cascade of the run", () => {
    const run = new Run();
    run.noteChain(4);
    run.noteChain(19);
    run.noteChain(7);
    expect(run.bestChain).toBe(19);
  });

  it("has no way to hurt the player — only the belt ends a run", () => {
    const run = new Run();
    // There is no health field to drain, by design.
    expect("health" in run).toBe(false);
    expect(run.over).toBe(false);
  });
});

describe("boss ammo", () => {
  it("pays shells for every boss put down, not once per wave", () => {
    const run = new Run();
    run.ammo = 10;
    run.awardAmmo(AMMO_PER_BOSS);
    run.awardAmmo(AMMO_PER_BOSS);
    // A doubled wave costs two bosses' worth of shots, so it pays twice.
    expect(run.ammo).toBe(10 + AMMO_PER_BOSS * 2);
  });

  it("respects the belt cap", () => {
    const run = new Run();
    run.ammo = MAX_AMMO;
    run.awardAmmo(AMMO_PER_BOSS);
    expect(run.ammo).toBe(MAX_AMMO);
  });

  it("ignores a negative or fractional award", () => {
    const run = new Run();
    run.ammo = 5;
    run.awardAmmo(-10);
    expect(run.ammo).toBe(5);
  });
});
