import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSetGraph, hqFrame, sceneByName } from "./graph";
import { FACE_OPPOSITE, type SceneRecord, type TransitionRecord } from "./types";
import {
  DOORS,
  closeSfx,
  doorAt,
  doorMatchesPose,
  doorOnPose,
  exitTownPose,
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

  it("faces away from the building when stepping back onto the street", () => {
    expect(exitTownPose({ x: 6, y: 8, facing: "E" })).toEqual({ x: 6, y: 8, facing: "W" });
    expect(exitTownPose({ x: 6, y: 3, facing: "N" })).toEqual({ x: 6, y: 3, facing: "S" });
    expect(exitTownPose({ x: 6, y: 5, facing: "W" })).toEqual({ x: 6, y: 5, facing: "E" });
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

  it("overlays every catalog door except known-wrong street facades", () => {
    const skipFacade = new Set(["hotel", "chin", "paper", "undertak"]);
    for (const door of DOORS) {
      if (door.autoWalk || !door.sprite) {
        continue;
      }
      const url = overlaySprite(door, false);
      if (skipFacade.has(door.sprite)) {
        expect(url, door.id).toBeUndefined();
        continue;
      }
      expect(url, door.id).toContain(`/door/${door.sprite}/`);
    }
    expect(overlaySprite(townDoor("town-hotel"), false)).toBeUndefined();
    expect(overlaySprite(townDoor("apoth-out"), false)).toContain("/door/pharm/");
    expect(overlaySprite(townDoor("saloon-out"), false)).toContain("/door/salout/");
    expect(overlaySprite(townDoor("hotel-out"), false)).toContain("/door/hotout/");
  });

  it("keeps school A2 west on one night-authored padre overlay", () => {
    // lockpadre is day<4 or clock<3. schoolout has schooloutnite; padre does not.
    const schoolOut = townDoor("school-out");
    const schoolPadre = townDoor("school-padre");
    const nitePadre = townDoor("nitescho-padre");
    const padreOut = townDoor("padre-out");
    expect(schoolOut.sprite).toBe("schoolout");
    expect(schoolOut.spriteNight).toBe("schooloutnite");
    expect(overlaySprite(schoolOut, false)).toContain("/door/schoolout/");
    expect(overlaySprite(schoolOut, true)).toContain("/door/schooloutnite/");
    expect(schoolPadre).toMatchObject({
      world: "_SCHOOL",
      scene: "scene a2",
      facing: "W",
      sprite: "padre",
      go: { kind: "set", world: "_PADRE", scene: "scene a2", facing: "W" },
    });
    expect(schoolPadre.spriteNight).toBeUndefined();
    expect(nitePadre.sprite).toBe("padre");
    expect(nitePadre.spriteNight).toBeUndefined();
    expect(overlaySprite(schoolPadre, false)).toContain("/door/padre/");
    expect(overlaySprite(schoolPadre, true)).toContain("/door/padre/");
    expect(overlaySprite(nitePadre, true)).toContain("/door/padre/");
    expect(padreOut.sprite).toBe("padreout");
    expect(padreOut.spriteNight).toBeUndefined();
    expect(overlaySprite(padreOut, false)).toContain("/door/padreout/");
  });

  it("sends court to NITECOUR at night", () => {
    const court = townDoor("town-court");
    expect(goWorld(court.go, false)).toBe("_COURT");
    expect(goWorld(court.go, true)).toBe("_NITECOUR");
  });

  it("puts street doors on filmed facades, not script tiles", () => {
    expect(townDoor("town-paper")).toMatchObject({
      scene: "scene h4",
      facing: "W",
      go: { kind: "set", world: "_PAPER", scene: "scene b2", facing: "W" },
    });
    expect(townDoor("town-mayor")).toMatchObject({
      scene: "scene i10",
      facing: "E",
      go: { kind: "set", world: "_MAYHALL", scene: "scene c4", facing: "N" },
    });
    expect(townDoor("town-undertak")).toMatchObject({
      scene: "scene g1",
      facing: "S",
      go: { kind: "set", world: "_UNDERTAK", scene: "scene a2", facing: "E" },
    });
    expect(townDoor("town-livery")).toMatchObject({
      scene: "scene f10",
      facing: "E",
      go: { kind: "set", world: "_LIVERY", scene: "scene d2", facing: "W" },
    });
    expect(doorAt("town", "Scene J9", "E", 250, 150)).toBeUndefined();
    expect(doorAt("town", "Scene D8", "W", 250, 150)).toBeUndefined();
    expect(doorAt("town", "Scene I10", "E", 250, 150)?.id).toBe("town-mayor");
    expect(doorAt("town", "Scene I10", "W", 250, 150)).toBeUndefined();
    expect(doorAt("town", "Scene H4", "W", 250, 150)?.id).toBe("town-paper");
    expect(doorAt("town", "Scene G1", "S", 250, 150)?.id).toBe("town-undertak");
    expect(doorAt("town", "Scene F10", "E", 250, 150)?.id).toBe("town-livery");
  });

  it("opens nested mission and doctor rooms", () => {
    expect(doorAt("_COURT", "Scene C3", "N", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_SCHOOL",
      worldNight: "_NITESCHO",
      scene: "scene b2",
      facing: "N",
    });
    expect(doorAt("_SCHOOL", "Scene B2", "S", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_COURT",
      worldNight: "_NITECOUR",
      scene: "scene c3",
      facing: "S",
    });
    expect(doorAt("_SCHOOL", "Scene A2", "W", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_PADRE",
      scene: "scene a2",
      facing: "W",
    });
    expect(doorAt("_DOCTOR1", "Scene B1", "W", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_DOCTOR2",
      scene: "scene a1",
      facing: "W",
    });
    expect(doorAt("_DOCTOR2", "Scene A1", "E", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_DOCTOR1",
      scene: "scene b1",
      facing: "E",
    });
    expect(goWorld(townDoor("court-school").go, true)).toBe("_NITESCHO");
  });

  it("walks saloon, hotel, and mansion stairs without a click", () => {
    expect(townDoor("saloon-up").autoWalk).toBe(true);
    expect(townDoor("hotel-up").autoWalk).toBe(true);
    expect(townDoor("mayor-up").autoWalk).toBe(true);
    expect(doorAt("_SALLOWER", "Scene D6", "W", 250, 150)?.id).toBe("saloon-up");
    expect(doorOnPose("_SALLOWER", "Scene D6", "W")?.id).toBe("saloon-up");
    expect(doorOnPose("_HOTLOWER", "Scene D3", "N")?.id).toBe("hotel-up");
    expect(doorOnPose("_MAYHALL", "Scene C3", "N")?.id).toBe("mayor-up");
  });

  it("opens saloon rooms, hotel playroom, and mansion rooms", () => {
    expect(doorAt("_SALUPPER", "Scene A1", "N", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_SALROOM",
      scene: "scene b1",
      facing: "W",
    });
    expect(doorAt("_SALUPPER", "Scene A3", "E", 250, 150)?.id).toBe("saloon-oona");
    expect(doorAt("_HOTUPPER", "Scene C4", "W", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_HOTROOM",
      scene: "scene b1",
      facing: "W",
    });
    expect(doorAt("_MAYHALL", "Scene C3", "W", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_MAYSTUDY",
      scene: "scene b2",
      facing: "W",
    });
    expect(doorAt("_MAYHALL", "Scene C3", "E", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_MAYDINE",
      scene: "scene d2",
      facing: "E",
    });
    expect(doorAt("_MAYUPPER", "Scene B1", "N", 250, 150)?.go).toEqual({
      kind: "set",
      world: "_MAYROOM",
      scene: "scene a2",
      facing: "N",
    });
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

  it("puts every street door on a filmed town tile when the extract is present", () => {
    const scenesPath = resolve("dfextract/out/SET/_TOWN/scenes.json");
    const transPath = resolve("dfextract/out/SET/_TOWN/transitions.json");
    if (!existsSync(scenesPath) || !existsSync(transPath)) {
      return;
    }
    const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
    const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
    const graph = buildSetGraph(scenes, records);
    const townDoors = DOORS.filter((door) => door.world === "town");
    for (const door of townDoors) {
      const here = sceneByName(graph, door.scene);
      expect(here, `${door.id} ${door.scene}`).toBeDefined();
      expect(
        graph.cameraTiles.has(`${here!.x},${here!.y}`),
        `${door.id} ${door.scene} not filmed`,
      ).toBe(true);
      const leave = exitTownPose({ x: here!.x, y: here!.y, facing: door.facing });
      expect(leave.facing).toBe(FACE_OPPOSITE[door.facing]);
      expect(
        hqFrame(graph, leave),
        `${door.id} exit ${leave.facing} has no HQ`,
      ).toBeDefined();
    }
  });
});
