import { describe, expect, it } from "vitest";
import { pointHitsAabb, resolveCircleAabbs } from "./collision";
import {
  buildingAabb,
  collisionAabbs,
  findBuilding,
  findInteractable,
  findLandmark,
  TOWN_LAYOUT,
} from "./layout";

describe("Diamondback graybox", () => {
  it("gives every building a unique id", () => {
    const ids = TOWN_LAYOUT.buildings.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the Day-1 landmarks from walkthroughs", () => {
    for (const id of [
      "saloon",
      "help",
      "mission",
      "jail",
      "livery",
      "stage",
      "bank",
      "newspaper",
      "mayor",
      "undertaker",
      "apothecary",
      "doctor",
      "range",
    ]) {
      expect(findBuilding(id), id).toBeDefined();
    }
    expect(findLandmark("dog")).toBeDefined();
    expect(findLandmark("bone")).toBeDefined();
    expect(findLandmark("well")).toBeDefined();
  });

  it("places spawn south of the dog, bone east of spawn, mission north of the well", () => {
    const dog = findLandmark("dog");
    const bone = findLandmark("bone");
    const well = findLandmark("well");
    const mission = findBuilding("mission");
    expect(dog && bone && well && mission).toBeTruthy();
    if (!dog || !bone || !well || !mission) return;
    expect(TOWN_LAYOUT.spawn.z).toBeLessThan(dog.z);
    expect(dog.z).toBeLessThan(well.z);
    expect(well.z).toBeLessThan(mission.z);
    expect(bone.x).toBeGreaterThan(TOWN_LAYOUT.spawn.x);
  });

  it("keeps the hotel bed inside the hotel footprint", () => {
    const bed = findInteractable("hotel.bed");
    expect(bed?.kind).toBe("sleep");
    const walls = TOWN_LAYOUT.buildings.filter((b) => b.id.startsWith("hotel-") && b.collide);
    const minX = Math.min(...walls.map((w) => w.x - w.sx / 2));
    const maxX = Math.max(...walls.map((w) => w.x + w.sx / 2));
    const minZ = Math.min(...walls.map((w) => w.z - w.sz / 2));
    const maxZ = Math.max(...walls.map((w) => w.z + w.sz / 2));
    expect(bed).toBeDefined();
    if (!bed) return;
    expect(bed.x).toBeGreaterThan(minX);
    expect(bed.x).toBeLessThan(maxX);
    expect(bed.z).toBeGreaterThan(minZ);
    expect(bed.z).toBeLessThan(maxZ);
  });

  it("leaves a south-facing hotel doorway (no solid wall on the door gap)", () => {
    const doorX = -4;
    const doorZ = 18.25;
    const blocking = TOWN_LAYOUT.buildings.filter(
      (b) => b.collide && pointHitsAabb(doorX, doorZ, 0.2, buildingAabb(b)),
    );
    expect(blocking.map((b) => b.id)).toEqual([]);
  });

  it("builds collision boxes for solid buildings and landmarks", () => {
    const boxes = collisionAabbs();
    expect(boxes.length).toBeGreaterThan(15);
    const saloon = findBuilding("saloon");
    expect(saloon).toBeDefined();
    if (!saloon) return;
    expect(boxes.some((box) => pointHitsAabb(saloon.x, saloon.z, 0.1, box))).toBe(true);
  });
});

describe("collision resolve", () => {
  const wall = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };

  it("blocks walking into an AABB on one axis", () => {
    const hit = resolveCircleAabbs(0, 0, 0, -2, 0.4, [wall]);
    expect(hit.z).toBe(-2);
    expect(hit.x).toBe(0);
  });

  it("allows sliding along a wall", () => {
    const hit = resolveCircleAabbs(2, 0, -2, 0, 0.4, [wall]);
    expect(hit.z).toBe(0);
    expect(Math.abs(hit.x)).toBeGreaterThan(1);
  });
});
