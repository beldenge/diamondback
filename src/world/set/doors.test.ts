import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSetGraph, sceneByName } from "./graph";
import type { SceneRecord, TransitionRecord } from "./types";
import {
  DOORS,
  closeSfx,
  doorAt,
  doorMatchesPose,
  goWorld,
  hitTest,
  oppositeFacadePairs,
  overlaySprite,
  type DoorLockCtx,
} from "./doors";
import { stillClickPixel } from "./walker";

const day1pm: DoorLockCtx = { day: 1, clock: 2, phase: 1, fightOn: false };
const night: DoorLockCtx = { day: 1, clock: 3, phase: 1, fightOn: false };

function townDoor(id: string) {
  const door = DOORS.find((item) => item.id === id);
  if (!door) {
    throw new Error(`missing ${id}`);
  }
  return door;
}

describe("door hitboxes", () => {
  it("uses Dust exclusive pointin bounds", () => {
    const box = { x0: 218, y0: 94, x1: 286, y1: 205 };
    expect(hitTest(box, 218, 150)).toBe(false);
    expect(hitTest(box, 250, 150)).toBe(true);
    expect(hitTest(box, 286, 150)).toBe(false);
  });

  it("finds the apoth door on I7 east (the facade still)", () => {
    const door = doorAt("town", "Scene I7", "E", 250, 150);
    expect(door?.id).toBe("town-apoth");
    expect(door?.go).toEqual({
      kind: "set",
      world: "_APOTH",
      scene: "scene c2",
      facing: "W",
    });
  });

  it("does not treat a turn-region click as a door", () => {
    expect(doorAt("town", "Scene I7", "E", 20, 150)).toBeUndefined();
  });

  it("does not put shop doors on G-row street views", () => {
    expect(doorAt("town", "Scene G9", "E", 250, 150)).toBeUndefined();
  });

  it("lists every opposite-facade pair on the street", () => {
    const pairs = oppositeFacadePairs().map((pair) => ({
      scene: pair.scene,
      a: `${pair.a.id}:${pair.a.facing}`,
      b: `${pair.b.id}:${pair.b.facing}`,
    }));
    expect(pairs).toEqual(
      expect.arrayContaining([
        { scene: "scene l7", a: "town-jail:W", b: "town-chin:E" },
        { scene: "scene e7", a: "town-hotel:E", b: "town-doctor:W" },
        { scene: "scene h7", a: "town-saloon:W", b: "town-stage:E" },
      ]),
    );
    expect(pairs).toHaveLength(3);
  });

  it("maps open creaks to matching close sounds", () => {
    expect(closeSfx(townDoor("town-saloon"))).toBe("doorclose1");
    expect(closeSfx(townDoor("town-hotel"))).toBe("doorclose2");
    expect(closeSfx(townDoor("town-apoth"))).toBe("doorclose3");
  });

  it("maps still clicks into 512×264 point space", () => {
    expect(stillClickPixel(250 / 512, 150 / 264, 512, 264)).toEqual({ x: 250, y: 150 });
    expect(stillClickPixel(-0.1, 0.5, 512, 264)).toBeNull();
  });
});

describe("sandbox doors", () => {
  it("leaves every catalog door unlocked", () => {
    for (const door of DOORS) {
      expect(door.locked(day1pm), door.id).toBe(false);
      expect(door.locked(night), door.id).toBe(false);
    }
  });

  it("keeps an open door bound to its pose until you leave the tile", () => {
    const door = townDoor("town-apoth");
    expect(doorMatchesPose(door, "town", "Scene I7", "E")).toBe(true);
    expect(doorMatchesPose(door, "town", "Scene I7", "N")).toBe(false);
    expect(doorMatchesPose(door, "town", "Scene G9", "E")).toBe(false);
  });
});

describe("catalog", () => {
  it("pairs every street enter with an interior exit", () => {
    const enters = DOORS.filter((door) => door.world === "town" && door.go.kind === "set");
    for (const enter of enters) {
      if (enter.go.kind !== "set") {
        continue;
      }
      const dest = goWorld(enter.go, false);
      const exit = DOORS.find((door) => door.world === dest && door.go.kind === "town");
      expect(exit, `${enter.id} -> ${dest} has no gototown`).toBeDefined();
    }
  });

  it("has overlay art for street doors and skips missing interior states", () => {
    expect(overlaySprite(townDoor("town-apoth"), false)).toContain("/door/apoth/");
    expect(overlaySprite(townDoor("apoth-out"), false)).toBeUndefined();
    expect(overlaySprite(townDoor("town-court"), true)).toContain("/door/courtinnite/");
  });

  it("sends court to NITECOUR at night", () => {
    const court = townDoor("town-court");
    expect(goWorld(court.go, false)).toBe("_COURT");
    expect(goWorld(court.go, true)).toBe("_NITECOUR");
  });

  it("lands every SET hop on a filmed tile when the extract is present", () => {
    const hops = DOORS.filter((door) => door.go.kind === "set");
    for (const door of hops) {
      if (door.go.kind !== "set") {
        continue;
      }
      const world = door.go.world;
      const scenesPath = resolve(`dfextract/out/SET/${world}/scenes.json`);
      const transPath = resolve(`dfextract/out/SET/${world}/transitions.json`);
      if (!existsSync(scenesPath) || !existsSync(transPath)) {
        continue;
      }
      const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
      const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
      const graph = buildSetGraph(scenes, records);
      const dest = sceneByName(graph, door.go.scene);
      expect(dest, `${door.id} ${world} ${door.go.scene}`).toBeDefined();
      expect(graph.cameraTiles.has(`${dest!.x},${dest!.y}`), `${door.id} not filmed`).toBe(
        true,
      );
    }
  });
});
