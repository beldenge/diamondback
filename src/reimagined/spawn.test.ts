import { describe, expect, it } from "vitest";
import { FACING_YAW, tileCenter } from "./coords";
import { DEFAULT_SPAWN, isTownPose, parseSpawn } from "./spawn";

describe("default spawn", () => {
  it("is the south gate: tile O7, facing north, never the origin", () => {
    const o7 = tileCenter(6, 14);
    for (const search of ["", "?", "?mode=reimagined", "?mode=reimagined&foo=1"]) {
      const pose = parseSpawn(search);
      expect(pose.x).toBe(o7.x);
      // a few metres south of the hanging sign (south of tile centre)
      expect(pose.z).toBeGreaterThanOrEqual(o7.z);
      expect(pose.z).toBeLessThan(o7.z + 4);
      expect(pose.yaw).toBe(FACING_YAW.N);
      expect(isTownPose(pose)).toBe(true);
      expect(Math.hypot(pose.x, pose.z)).toBeGreaterThan(10);
    }
  });

  it("never reads a missing x/z as zero (Number(null) trap)", () => {
    // no x/z in the query: must stay at the gate, not (0,0,0)
    const pose = parseSpawn("?mode=reimagined&facing=N");
    expect(pose.x).not.toBe(0);
    expect(pose.z).not.toBe(0);
    expect(pose).toMatchObject({ x: DEFAULT_SPAWN.x, z: DEFAULT_SPAWN.z });
    // empty-string params must not become zero either
    const empty = parseSpawn("?mode=reimagined&x=&z=");
    expect(empty.x).toBe(DEFAULT_SPAWN.x);
    expect(empty.z).toBe(DEFAULT_SPAWN.z);
  });
});

describe("debug overrides (only when actually present)", () => {
  it("tx/ty pick a tile centre", () => {
    const pose = parseSpawn("?mode=reimagined&tx=6&ty=6");
    expect(pose).toMatchObject({ x: 52, z: 52 });
  });

  it("scene names work", () => {
    const pose = parseSpawn("?mode=reimagined&scene=G7");
    expect(pose).toMatchObject({ x: 52, z: 52 });
  });

  it("facing sets yaw", () => {
    expect(parseSpawn("?facing=S").yaw).toBe(FACING_YAW.S);
    expect(parseSpawn("?facing=w").yaw).toBe(FACING_YAW.W);
    expect(parseSpawn("?facing=banana").yaw).toBe(FACING_YAW.N);
  });

  it("explicit world x/z/y override", () => {
    const pose = parseSpawn("?x=44.5&z=60&y=2");
    expect(pose.x).toBe(44.5);
    expect(pose.z).toBe(60);
    expect(pose.y).toBe(2);
  });

  it("partial override keeps the other default axis", () => {
    const pose = parseSpawn("?x=44.5");
    expect(pose.x).toBe(44.5);
    expect(pose.z).toBe(DEFAULT_SPAWN.z);
  });

  it("garbage numbers are ignored", () => {
    const pose = parseSpawn("?x=abc&tx=1.5&ty=2");
    expect(pose.x).toBe(DEFAULT_SPAWN.x);
    expect(pose.z).toBe(DEFAULT_SPAWN.z);
  });
});
