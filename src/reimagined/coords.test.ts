import { describe, expect, it } from "vitest";
import {
  CAMERA_TILES,
  FACING_YAW,
  TILE,
  WALK_EDGES,
  isCameraTile,
  parseScene,
  sceneName,
  tileCenter,
  tileOf,
  wishXZ,
} from "./coords";

describe("camera-tile graph", () => {
  it("carries the 52 filmed tiles from _TOWN/transitions.json", () => {
    expect(CAMERA_TILES.length).toBe(52);
    const names = CAMERA_TILES.map(([x, y]) => sceneName(x, y));
    expect(new Set(names).size).toBe(52);
    // spot checks against the extract
    for (const name of ["O7", "N7", "M7", "G7", "D7", "G1", "G11", "K2", "K11", "L3", "L5", "E3", "I10", "F10", "H4", "J4"]) {
      expect(names).toContain(name);
    }
    expect(names).not.toContain("A1");
    expect(names).not.toContain("O15");
  });

  it("keeps every walk edge between camera tiles, one tile apart", () => {
    expect(WALK_EDGES.length).toBe(55);
    for (const [xa, ya, xb, yb] of WALK_EDGES) {
      expect(isCameraTile(xa, ya)).toBe(true);
      expect(isCameraTile(xb, yb)).toBe(true);
      expect(Math.abs(xa - xb) + Math.abs(ya - yb)).toBe(1);
    }
  });
});

describe("scene naming", () => {
  it("matches the SET grid: letter row, number column", () => {
    expect(sceneName(6, 6)).toBe("G7");
    expect(sceneName(6, 11)).toBe("L7");
    expect(sceneName(6, 14)).toBe("O7");
    expect(sceneName(0, 6)).toBe("G1");
    expect(sceneName(9, 8)).toBe("I10");
  });

  it("parses back", () => {
    expect(parseScene("G7")).toEqual({ x: 6, y: 6 });
    expect(parseScene("o7")).toEqual({ x: 6, y: 14 });
    expect(parseScene("F10")).toEqual({ x: 9, y: 5 });
    expect(parseScene("Z9")).toBeNull();
    expect(parseScene("G0")).toBeNull();
    expect(parseScene("")).toBeNull();
  });
});

describe("world space", () => {
  it("is +X east, +Z south, TILE world units per SET tile", () => {
    expect(TILE).toBe(8);
    expect(tileCenter(6, 14)).toEqual({ x: 52, z: 116 });
    expect(tileOf(52, 116)).toEqual({ x: 6, y: 14 });
    // south of O7 is a bigger z
    expect(tileCenter(6, 14).z).toBeGreaterThan(tileCenter(6, 6).z);
    // east of G1 is a bigger x
    expect(tileCenter(9, 6).x).toBeGreaterThan(tileCenter(0, 6).x);
  });

  it("yaw 0 looks north; WASD matches the camera basis", () => {
    expect(FACING_YAW.N).toBe(0);
    const north = wishXZ(0, 1, 0);
    expect(north.x).toBeCloseTo(0);
    expect(north.z).toBeCloseTo(-1); // forward at yaw 0 is −Z (north)
    const east = wishXZ(0, 0, 1);
    expect(east.x).toBeCloseTo(1);
    expect(east.z).toBeCloseTo(0);
    // positive yaw turns left: quarter turn left faces west
    const west = wishXZ(Math.PI / 2, 1, 0);
    expect(west.x).toBeCloseTo(-1);
    expect(west.z).toBeCloseTo(0);
    // facing yaws agree with wishXZ
    const south = wishXZ(FACING_YAW.S, 1, 0);
    expect(south.z).toBeCloseTo(1);
    const eastF = wishXZ(FACING_YAW.E, 1, 0);
    expect(eastF.x).toBeCloseTo(1);
  });
});
