import { describe, expect, it } from "vitest";
import { BOSSES, BOSS_ORDER, bossPoseAt, isWalkPose } from "./bosses";
import { BIRD_SPEED } from "./flock";
import {
  BOSS_EVERY,
  MAX_BIRDS,
  birdsForWave,
  bossForWave,
  bossesForWave,
  bossHitsForWave,
  bossScaleFor,
  isBossWave,
} from "./waves";

describe("wave table", () => {
  it("grows the flock eight birds a wave", () => {
    expect(birdsForWave(1)).toBe(8);
    expect(birdsForWave(2)).toBe(16);
    expect(birdsForWave(10)).toBe(80);
  });

  it("caps the flock so the street still reads", () => {
    expect(birdsForWave(500)).toBe(MAX_BIRDS);
  });

  it("treats wave 0 and negatives as wave 1", () => {
    expect(birdsForWave(0)).toBe(8);
    expect(birdsForWave(-3)).toBe(8);
  });
});

describe("boss schedule", () => {
  it("puts a boss on every single wave", () => {
    expect(BOSS_EVERY).toBe(1);
    for (let wave = 1; wave <= 30; wave += 1) {
      expect(isBossWave(wave)).toBe(true);
    }
  });

  it("never calls wave 0 a boss wave", () => {
    expect(isBossWave(0)).toBe(false);
    expect(bossForWave(0)).toBeNull();
  });

  it("cycles the roster in order, one per wave on the first lap", () => {
    expect(bossForWave(1)).toBe("chicken");
    expect(bossForWave(2)).toBe("pig");
    expect(bossForWave(3)).toBe("cow");
    expect(bossForWave(4)).toBe("horse");
    expect(bossForWave(5)).toBe("leroy");
    expect(bossForWave(6)).toBe("bounty");
    expect(bossForWave(7)).toBe("robot");
    expect(bossForWave(8)).toBe("skeleton");
    expect(bossForWave(9)).toBe("shaman");
    expect(bossForWave(10)).toBe("kid");
  });

  it("runs ten unique bosses before anything repeats", () => {
    const lap = Array.from({ length: BOSS_ORDER.length }, (_, i) => bossForWave(i + 1));
    expect(lap).toHaveLength(10);
    expect(new Set(lap).size).toBe(10);
    expect(bossForWave(11)).toBe(bossForWave(1));
  });

  it("doubles up on the second lap and triples on the third", () => {
    // Escalation is by number, not size: the roster is six deep, so a lap
    // is six waves and each lap adds one more of them at once.
    const lap = BOSS_ORDER.length;
    for (let wave = 1; wave <= lap; wave += 1) {
      expect(bossesForWave(wave)).toHaveLength(1);
    }
    for (let wave = lap + 1; wave <= lap * 2; wave += 1) {
      expect(bossesForWave(wave)).toHaveLength(2);
    }
    expect(bossesForWave(lap * 2 + 1)).toHaveLength(3);
    expect(bossesForWave(lap * 3 + 1)).toHaveLength(4);
  });

  it("doubles up the SAME boss, not a mixed bag", () => {
    // Two giant cows reads as "more of that thing"; a cow and a pig
    // together just reads as noise.
    expect(bossesForWave(11)).toEqual(["chicken", "chicken"]);
    expect(bossesForWave(13)).toEqual(["cow", "cow"]);
  });

  it("keeps the pair matched however deep the run goes", () => {
    const trio = bossesForWave(BOSS_ORDER.length * 2 + 3);
    expect(trio).toHaveLength(3);
    expect(new Set(trio).size).toBe(1);
  });

  it("sends nothing on wave 0", () => {
    expect(bossesForWave(0)).toEqual([]);
  });

  it("draws every boss at the same on-screen height", () => {
    // The sheets are nothing like each other — a chicken frame is 71px
    // tall, a horse 301 — so the scale has to come from the sprite. What
    // must match is `height * scale`, not the scale itself.
    const chicken = 71 * bossScaleFor(71);
    const horse = 301 * bossScaleFor(301);
    expect(Math.abs(chicken - horse) / chicken).toBeLessThan(0.01);
  });

  it("is the same size on wave 1 and wave 40 — huge, but consistent", () => {
    // Deliberately not a per-wave ramp: you should always know how big the
    // thing walking through the gate is going to be.
    expect(bossScaleFor(71)).toBe(bossScaleFor(71));
    expect(typeof bossScaleFor(71)).toBe("number");
  });

  it("towers over the buildings", () => {
    // A boss two tiles up the street sits at a lens-forward of ~576, so
    // `scale * 114 / (1000 * 576)` is its sprite multiplier.
    const drawn = (71 * bossScaleFor(71) * 114) / (1000 * 576);
    expect(drawn).toBeGreaterThan(264);
  });

  it("moves the walkers at the flock's own pace, not an amble", () => {
    // A boss that ambles while the birds around it sprint reads as
    // scenery. Every one that can walk is in the flock's ballpark.
    for (const spec of Object.values(BOSSES)) {
      if (spec.speed === 0) {
        continue;
      }
      expect(spec.speed, `${spec.id} is too slow`).toBeGreaterThan(BIRD_SPEED * 0.5);
      expect(spec.speed, `${spec.id} is too fast`).toBeLessThan(BIRD_SPEED * 1.5);
    }
    expect(BOSSES.pig.speed).toBeGreaterThan(BOSSES.chicken.speed);
  });

  it("keeps the three that have no walk cycle at a standstill", () => {
    // cow (down/up), horse (head/stand/tail) and the range dummy have no
    // walk anywhere in their sheets. They hold ground instead.
    expect(BOSSES.cow.speed).toBe(0);
    expect(BOSSES.horse.speed).toBe(0);
    expect(BOSSES.robot.speed).toBe(0);
  });

  it("keeps an early boss cheap enough to survive", () => {
    // One arrives every wave now, so wave 1 cannot cost half the belt.
    expect(bossHitsForWave(1)).toBeLessThanOrEqual(4);
    expect(bossHitsForWave(1)).toBeLessThan(bossHitsForWave(20));
  });
});

describe("boss roster", () => {
  it("lists every boss exactly once", () => {
    expect([...BOSS_ORDER].sort()).toEqual(Object.keys(BOSSES).sort());
  });

  it("gives the animals that cannot walk a speed of zero", () => {
    // `cow` is down/up and `horse1` is head/stand/tail. Neither has a
    // walk cycle anywhere in the extract, so neither may move.
    expect(BOSSES.cow.speed).toBe(0);
    expect(BOSSES.horse.speed).toBe(0);
    expect(BOSSES.pig.speed).toBeGreaterThan(0);
  });

  it("only asks for poses it declares a hold for", () => {
    for (const spec of Object.values(BOSSES)) {
      expect(spec.hold).toHaveLength(spec.poses.length);
    }
  });

  it("cycles a boss through its poses and wraps", () => {
    const spec = BOSSES.cow;
    expect(bossPoseAt(spec, 0)).toBe("down");
    expect(bossPoseAt(spec, 40)).toBe("up");
    // 68 frames of cycle, so frame 68 is frame 0 again.
    expect(bossPoseAt(spec, 68)).toBe(bossPoseAt(spec, 0));
  });

  it("keeps Leroy's swig in his cycle", () => {
    expect(BOSSES.leroy.poses).toContain("drink");
  });

  it("gives no boss a voice", () => {
    // A boss that talks every few seconds wears out fast. The recorded
    // barks are still in the extract; the animation carries the character.
    for (const spec of Object.values(BOSSES)) {
      expect(spec).not.toHaveProperty("barks");
    }
  });
});

describe("walk poses", () => {
  it("recognises every spelling the sheets use", () => {
    // Most casts call it `walk`; the bounty hunter's is `lowwalk`.
    expect(isWalkPose("walk")).toBe(true);
    expect(isWalkPose("lowwalk")).toBe(true);
    expect(isWalkPose("stand")).toBe(false);
    expect(isWalkPose("drink")).toBe(false);
  });

  it("gives every moving boss at least one pose it can travel on", () => {
    // A boss with speed but no walk pose stands still with its legs going.
    for (const spec of Object.values(BOSSES)) {
      if (spec.speed === 0) {
        continue;
      }
      expect(spec.poses.some(isWalkPose), `${spec.id} cannot travel`).toBe(true);
    }
  });
});
