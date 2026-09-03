import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { routeToStar, splicePathAt, TILE_SPAN, worldToTile, type StarPath } from "./path";

const LEROY_PATH: StarPath = {
  a: "town.leroy2",
  b: "town.leroy1",
  container: 262,
  length: 1795,
  points: [
    { x: 2656, y: 2720, z: 0 },
    { x: 2020, y: 2696, z: 0 },
    { x: 1832, y: 2700, z: 0 },
    { x: 1744, y: 2728, z: 0 },
    { x: 1692, y: 2788, z: 0 },
    { x: 1652, y: 2856, z: 0 },
    { x: 1632, y: 2956, z: 0 },
    { x: 1632, y: 3388, z: 0 },
    { x: 1664, y: 3476, z: 0 },
    { x: 1740, y: 3536, z: 0 },
  ],
};

describe("world tiles", () => {
  it("maps town.leroy1/2 onto N7 and K11", () => {
    expect(worldToTile(1740, 3536)).toEqual({ x: 6, y: 13 });
    expect(worldToTile(2656, 2720)).toEqual({ x: 10, y: 10 });
    expect(worldToTile(6 * TILE_SPAN + 128, 14 * TILE_SPAN + 128)).toEqual({
      x: 6,
      y: 14,
    });
  });
});

describe("SET star paths", () => {
  it("reverses the leroy2→leroy1 polyline for walkout", () => {
    const path = routeToStar(
      [LEROY_PATH],
      "town.leroy1",
      "town.leroy2",
      1740,
      3536,
      { x: 2656, y: 2720, z: 0 },
    );
    expect(path[0]).toEqual({ x: 1664, y: 3476, z: 0 });
    expect(path[1]).toEqual({ x: 1632, y: 3388, z: 0 });
    expect(path.at(-1)).toEqual({ x: 2656, y: 2720, z: 0 });
    // Stays west of the east-side shops, not through the cemetery.
    expect(Math.max(...path.map((p) => p.x))).toBe(2656);
    expect(path[0].y).toBeLessThan(3536);
  });

  it("beelines when the stars are not a path pair", () => {
    const path = routeToStar([LEROY_PATH], "town.leroy1", "town.help", 1740, 3536, {
      x: 1760,
      y: 3034,
      z: 0,
    });
    expect(path).toEqual([{ x: 1760, y: 3034, z: 0 }]);
  });

  it("follows town.blood1→blood2 from extracted NITE paths", () => {
    const rel = resolve("dfextract/out/SET/_NITE/paths.json");
    if (!existsSync(rel)) {
      return;
    }
    const paths = JSON.parse(readFileSync(rel, "utf8")) as StarPath[];
    const hops = routeToStar(paths, "town.blood1", "town.blood2", 2436, 1132, {
      x: 2482,
      y: 1670,
      z: 0,
    });
    expect(hops.at(-1)).toEqual({ x: 2482, y: 1670, z: 0 });
    expect(hops.length).toBeGreaterThan(3);
    expect(hops[0].y).toBeLessThan(1132);
  });

  it("matches extracted NITE paths.json", () => {
    const rel = resolve("dfextract/out/SET/_NITE/paths.json");
    if (!existsSync(rel)) {
      return;
    }
    const paths = JSON.parse(readFileSync(rel, "utf8")) as StarPath[];
    const hops = routeToStar(paths, "town.leroy1", "town.leroy2", 1740, 3536, {
      x: 2656,
      y: 2720,
      z: 0,
    });
    expect(hops[0]).toEqual({ x: 1664, y: 3476, z: 0 });
    expect(hops.at(-1)).toEqual({ x: 2656, y: 2720, z: 0 });
  });
});

describe("resume splice (DF.EXE 0x424250)", () => {
  const line = [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 200, y: 0, z: 0 },
    { x: 300, y: 0, z: 0 },
  ];

  it("keeps the whole path when standing on the first vertex", () => {
    expect(splicePathAt(line, 0, 0)).toEqual(line.slice(1));
  });

  it("drops vertices already passed instead of walking back", () => {
    // Two thirds along: carry on to the last vertex, do not return to 0.
    expect(splicePathAt(line, 205, 0)).toEqual([{ x: 300, y: 0, z: 0 }]);
  });

  it("never splices onto the last vertex, so a segment always remains", () => {
    expect(splicePathAt(line, 300, 0)).toEqual([{ x: 300, y: 0, z: 0 }]);
  });

  it("leaves a two-point path alone", () => {
    const pair = line.slice(0, 2);
    expect(splicePathAt(pair, 99, 0)).toEqual([{ x: 100, y: 0, z: 0 }]);
  });
});
