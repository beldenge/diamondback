import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSetGraph } from "./graph";
import { roadRoute, TILE_SPAN, worldToTile } from "./path";
import type { SceneRecord, TransitionRecord } from "./types";

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

describe("SET road route", () => {
  const scenesPath = resolve("dfextract/out/SET/_NITE/scenes.json");
  const transPath = resolve("dfextract/out/SET/_NITE/transitions.json");

  it("walks the main street then east to the range, not through the fence", () => {
    if (!existsSync(scenesPath) || !existsSync(transPath)) {
      return;
    }
    const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
    const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
    const graph = buildSetGraph(scenes, records);
    const path = roadRoute(graph, 1740, 3536, 2656, 2720);
    expect(path.at(-1)).toEqual({ x: 2656, y: 2720, z: 0 });
    const turnEast = path.findIndex((p) => p.x > 1800);
    expect(turnEast).toBeGreaterThan(0);
    for (const p of path.slice(0, turnEast)) {
      expect(p.x).toBeCloseTo(6 * TILE_SPAN + 128, 0);
    }
    // Sign is east of the road; first hop is west onto the N7–O7 street,
    // not northwest to N7's center (that cut toward the cemetery).
    expect(path[0].x).toBeCloseTo(6 * TILE_SPAN + 128, 0);
    expect(path[0].y).toBeCloseTo(3536, 0);
    const ys = path.map((p) => p.y);
    expect(Math.min(...ys)).toBeLessThanOrEqual(10 * TILE_SPAN + 128);
  });

  it("beelines when start and dest share a camera tile", () => {
    const graph = buildSetGraph(
      [],
      [
        {
          x_from: 6,
          y_from: 14,
          dir_from: 1,
          x_to: 6,
          y_to: 13,
          dir_to: 1,
          dir_from_name: "N",
          dir_to_name: "N",
          frame0: 1,
        },
      ],
    );
    const path = roadRoute(graph, 1658, 3698, 1700, 3600);
    expect(path).toEqual([{ x: 1700, y: 3600, z: 0 }]);
  });
});
