import { describe, expect, it } from "vitest";
import { tileWorld } from "../../world/set/path";
import { STILL_HEIGHT } from "../../world/set/types";
import {
  MAP_CELL,
  MAP_INSET,
  MAP_ORIGIN,
  MAP_SIZE,
  TOWN_SPAN,
  facingVector,
  hitsRect,
  mapToggleRect,
  minimapRect,
  tileToMap,
  tileToPanel,
  worldToPanel,
} from "./minimap";

const rect = minimapRect(STILL_HEIGHT);

describe("minimap panel", () => {
  it("sits in the bottom-left, clear of the gun hand", () => {
    // The hand rises through the bottom centre and right, so the left
    // corner is the only one it never covers.
    expect(rect.x).toBe(MAP_INSET);
    expect(rect.y + rect.h).toBe(STILL_HEIGHT - MAP_INSET);
    expect(rect.w).toBe(MAP_SIZE);
  });

  it("fits inside the still", () => {
    expect(rect.y).toBeGreaterThan(0);
    expect(rect.y + rect.h).toBeLessThanOrEqual(STILL_HEIGHT);
  });
});

describe("tile to panel", () => {
  it("keeps every town tile inside the panel", () => {
    for (let x = 0; x < TOWN_SPAN; x += 1) {
      for (let y = 0; y < TOWN_SPAN; y += 1) {
        const p = tileToPanel(x, y, rect);
        expect(p.x).toBeGreaterThan(rect.x);
        expect(p.x).toBeLessThan(rect.x + rect.w);
        expect(p.y).toBeGreaterThan(rect.y);
        expect(p.y).toBeLessThan(rect.y + rect.h);
      }
    }
  });

  it("uses the engine's own grid origin, so tiles land on the real plan", () => {
    // NEW.FLT `openflat`: cross at `scenecol * 20 + 222`, `scenerow * 20 + 93`.
    expect(MAP_ORIGIN).toEqual({ x: 222, y: 93 });
    expect(MAP_CELL).toBe(20);
    expect(tileToMap(0, 0)).toEqual({ x: 222, y: 93 });
    // The south gate is `scene o7` = tile (6, 14), bottom-centre of town.
    expect(tileToMap(6, 14)).toEqual({ x: 342, y: 373 });
  });

  it("puts the mission above the gate on Main Street, as the plan draws it", () => {
    // Both sit on Main St. (column 6); the mission is at the north end.
    const mission = tileToMap(6, 3);
    const gate = tileToMap(6, 14);
    expect(mission.x).toBe(gate.x);
    expect(mission.y).toBeLessThan(gate.y);
  });

  it("does not flip either axis — tile space and panel space agree", () => {
    const west = tileToPanel(0, 7, rect);
    const east = tileToPanel(14, 7, rect);
    const north = tileToPanel(7, 0, rect);
    const south = tileToPanel(7, 14, rect);
    expect(east.x).toBeGreaterThan(west.x);
    // +y is south in tile space and down on the panel.
    expect(south.y).toBeGreaterThan(north.y);
  });

  it("puts the south gate near the bottom of the panel", () => {
    // Spawn is O7: tile (6, 14), the southern edge of the grid.
    const gate = tileToPanel(6, 14, rect);
    expect(gate.y).toBeGreaterThan(rect.y + rect.h * 0.8);
  });
});

describe("world to panel", () => {
  it("agrees with the tile mapping for a tile centre", () => {
    const world = tileWorld(6, 14);
    const fromWorld = worldToPanel(world.x, world.y, rect);
    const fromTile = tileToPanel(6, 14, rect);
    expect(fromWorld.x).toBeCloseTo(fromTile.x, 6);
    expect(fromWorld.y).toBeCloseTo(fromTile.y, 6);
  });

  it("moves a bird across the panel as it walks east", () => {
    const a = worldToPanel(tileWorld(3, 7).x, tileWorld(3, 7).y, rect);
    const b = worldToPanel(tileWorld(11, 7).x, tileWorld(11, 7).y, rect);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeCloseTo(a.y, 6);
  });
});

describe("facing arrow", () => {
  it("points up the panel when you face north", () => {
    expect(facingVector("N")).toEqual({ x: 0, y: -1 });
    expect(facingVector("S")).toEqual({ x: 0, y: 1 });
    expect(facingVector("E")).toEqual({ x: 1, y: 0 });
    expect(facingVector("W")).toEqual({ x: -1, y: 0 });
  });

  it("is a unit vector in every direction", () => {
    for (const dir of ["N", "S", "E", "W"] as const) {
      const v = facingVector(dir);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
    }
  });
});

describe("the map toggle", () => {
  it("sits in the panel's top-right corner while open", () => {
    const box = mapToggleRect(rect, true);
    expect(box.x + box.w).toBe(rect.x + rect.w);
    expect(box.y).toBe(rect.y);
  });

  it("leaves a chip in the same screen corner once hidden", () => {
    const chip = mapToggleRect(rect, false);
    expect(chip.x).toBe(rect.x);
    expect(chip.y + chip.h).toBe(rect.y + rect.h);
    expect(chip.w).toBeLessThan(rect.w);
  });

  it("is hittable in both states", () => {
    for (const open of [true, false]) {
      const box = mapToggleRect(rect, open);
      const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      expect(hitsRect(centre, box)).toBe(true);
    }
  });

  it("does not swallow a click aimed at the street", () => {
    const open = mapToggleRect(rect, true);
    // Middle of the frame, nowhere near the bottom-left corner.
    expect(hitsRect({ x: 300, y: 120 }, open)).toBe(false);
  });

  it("keeps the closed chip clear of where the panel drew the player", () => {
    // Hiding the map must not leave the chip on top of a live target area
    // any larger than it needs: it is strictly smaller than the panel.
    const chip = mapToggleRect(rect, false);
    expect(chip.w * chip.h).toBeLessThan(rect.w * rect.h * 0.1);
  });
});

