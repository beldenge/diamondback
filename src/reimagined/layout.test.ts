import { describe, expect, it } from "vitest";
import { CAMERA_TILES, TILE, parseScene, tileCenter } from "./coords";
import {
  DECOR_GAP,
  GATE,
  LOTS,
  PALISADE,
  STREET_DOORS,
  WALL_T,
  WINDOWS,
  decorX,
  decorZ,
  placeLabel,
  streetDoor,
  type Rect,
} from "./layout";
import { INTERIOR_DOORS } from "./interiors";

/** The authoritative street-door pose table (src/world/set/doors.ts). */
const EXPECTED_POSES: Record<string, string> = {
  watson: "I7 E",
  bolivar: "J7 E",
  saloon: "H7 W",
  saloonBack: "J4 E",
  stage: "H7 E",
  hotel: "E7 E",
  doctor: "E7 W",
  bank: "F7 W",
  jail: "L7 W",
  curio: "L7 E",
  mission: "D7 N",
  rattler: "H4 W",
  sidewinder: "G1 S",
  livery: "F10 E",
  mayor: "I10 E",
};

describe("street doors", () => {
  it("covers exactly the authoritative pose list", () => {
    expect(new Set(STREET_DOORS.map((d) => d.id))).toEqual(new Set(Object.keys(EXPECTED_POSES)));
    for (const door of STREET_DOORS) {
      expect(door.pose).toBe(EXPECTED_POSES[door.id]);
    }
  });

  it("each door faces its filmed pose tile from the matching wall", () => {
    for (const door of STREET_DOORS) {
      const [scene, facing] = door.pose.split(" ");
      const tile = parseScene(scene);
      expect(tile).not.toBeNull();
      if (!tile) {
        continue;
      }
      const c = tileCenter(tile.x, tile.y);
      // Pose "X E" means: standing on the tile looking east, the door is
      // east of the pose; its leaf faces back west toward the player.
      if (facing === "E") {
        expect(door.side).toBe("W");
        expect(door.x).toBeGreaterThan(c.x);
        expect(door.x - c.x).toBeLessThanOrEqual(TILE);
        expect(Math.abs(door.z - c.z)).toBeLessThan(TILE);
      } else if (facing === "W") {
        expect(door.side).toBe("E");
        expect(door.x).toBeLessThan(c.x);
        expect(c.x - door.x).toBeLessThanOrEqual(TILE);
        expect(Math.abs(door.z - c.z)).toBeLessThan(TILE);
      } else if (facing === "N") {
        expect(door.side).toBe("S");
        expect(door.z).toBeLessThan(c.z);
        expect(Math.abs(door.x - c.x)).toBeLessThan(TILE);
      } else {
        expect(door.side).toBe("N");
        expect(door.z).toBeGreaterThan(c.z);
        expect(Math.abs(door.x - c.x)).toBeLessThan(TILE);
      }
    }
  });

  it("saloon door sits on the H7 half of the long facade", () => {
    const saloon = streetDoor("saloon");
    // H7 tile spans z 56..64; the porch (I7) is 64..74.5
    expect(saloon.z).toBeGreaterThan(56);
    expect(saloon.z).toBeLessThan(64);
    expect(saloon.x).toBe(LOTS.saloon.maxX);
  });

  it("jail door is south-of-centre on the east face", () => {
    const jail = streetDoor("jail");
    const centre = (LOTS.jail.minZ + LOTS.jail.maxZ) / 2;
    expect(jail.z).toBeGreaterThan(centre);
    expect(jail.x).toBe(LOTS.jail.maxX);
  });

  it("mayor gate is an iron double gate; mansion is set back east", () => {
    const gate = streetDoor("mayor");
    expect(gate.gate).toBe(true);
    expect(gate.double).toBe(true);
    expect(LOTS.mansion.minX).toBeGreaterThanOrEqual(gate.x + 5);
  });
});

describe("buildings sit off the street", () => {
  it("Main Street column stays open between facades", () => {
    // street x 48..56 (tile 6)
    const west = [LOTS.saloon, LOTS.bank, LOTS.doctor, LOTS.jail];
    const east = [LOTS.stage, LOTS.watson, LOTS.bolivar, LOTS.curio, LOTS.hotel, LOTS.santaMarta];
    for (const lot of west) {
      expect(lot.maxX).toBeLessThanOrEqual(48);
    }
    for (const lot of east) {
      expect(lot.minX).toBeGreaterThanOrEqual(56);
    }
  });

  it("shops pack the east side south of G7: stage, watson, bolivar, alley, curio", () => {
    expect(LOTS.stage.minZ).toBe(56);
    expect(LOTS.watson.minZ).toBe(LOTS.stage.maxZ);
    expect(LOTS.bolivar.minZ).toBe(LOTS.watson.maxZ);
    // K7 east (z 80..88) stays an open alley
    expect(LOTS.bolivar.maxZ).toBeLessThanOrEqual(80);
    expect(LOTS.curio.minZ).toBeGreaterThanOrEqual(88);
  });

  it("saloon spans H7+I7 with the hotel across G7 on rows E+F", () => {
    expect(LOTS.saloon.minZ).toBe(56);
    expect(LOTS.saloon.maxZ).toBeGreaterThan(72);
    expect(LOTS.saloon.maxZ).toBeLessThan(76);
    expect(LOTS.hotel.minZ).toBe(32);
    expect(LOTS.hotel.maxZ).toBe(48);
  });

  it("no fake shops west of I7–K7: that flank is open", () => {
    // between the saloon block's south edge and the jail there is no lot
    // on the west street line
    const westLots = Object.values(LOTS).filter(
      (lot) => lot.maxX > 46 && lot.maxX <= 48 && lot.minZ >= LOTS.saloonBackshed.maxZ && lot.maxZ <= LOTS.jail.minZ,
    );
    expect(westLots).toEqual([]);
  });

  it("palisade runs the gate flank and ends before Curiosities", () => {
    expect(PALISADE.x).toBeGreaterThan(56);
    expect(PALISADE.zSouth).toBe(GATE.z);
    expect(PALISADE.zNorth).toBeGreaterThanOrEqual(LOTS.curio.maxZ);
  });

  it("interiors nest inside their footprints", () => {
    expect(LOTS.school.minX).toBeGreaterThanOrEqual(LOTS.mission.minX);
    expect(LOTS.school.maxX).toBeLessThanOrEqual(LOTS.mission.maxX);
    expect(LOTS.school.minZ).toBeGreaterThanOrEqual(LOTS.mission.minZ);
    expect(LOTS.padre.maxX).toBeLessThanOrEqual(LOTS.school.minX);
    expect(LOTS.padre.minX).toBeGreaterThanOrEqual(LOTS.mission.minX);
  });
});

describe("lots never collide", () => {
  const overlap = (a: Rect, b: Rect, eps: number): boolean =>
    a.minX + eps < b.maxX && b.minX + eps < a.maxX && a.minZ + eps < b.maxZ && b.minZ + eps < a.maxZ;

  it("no two building lots overlap (except designed nestings)", () => {
    const nested = new Set(["mission:school", "mission:padre", "mayorFence:mansion"]);
    const names = Object.keys(LOTS) as (keyof typeof LOTS)[];
    const bad: string[] = [];
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const a = names[i];
        const c = names[j];
        if (nested.has(`${a}:${c}`) || nested.has(`${c}:${a}`)) {
          continue;
        }
        if (overlap(LOTS[a], LOTS[c], 0.05)) {
          bad.push(`${a} × ${c}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("no lot intrudes into a walkable street corridor", () => {
    // envelopes of the filmed walk lanes (camera tiles)
    const corridors: [string, Rect][] = [
      ["Main", { minX: 48, minZ: 24, maxX: 56, maxZ: 120 }],
      ["Neely", { minX: 0, minZ: 48, maxX: 88, maxZ: 56 }],
      ["Day", { minX: 8, minZ: 80, maxX: 96, maxZ: 88 }],
      ["Mission St", { minX: 24, minZ: 24, maxX: 80, maxZ: 32 }],
      ["west lane", { minX: 24, minZ: 24, maxX: 32, maxZ: 88 }],
      ["Lee", { minX: 72, minZ: 24, maxX: 80, maxZ: 88 }],
      ["L3 spur", { minX: 16, minZ: 88, maxX: 24, maxZ: 96 }],
      // the L5 E still is a close-up of the jail's west wall: the lane
      // stops 2 m short of the tile edge there
      ["L5 spur", { minX: 34, minZ: 88, maxX: 38, maxZ: 96 }],
      ["gate row", { minX: 40, minZ: 112, maxX: 64, maxZ: 120 }],
    ];
    const bad: string[] = [];
    for (const [lot, r] of Object.entries(LOTS)) {
      for (const [street, c] of corridors) {
        if (overlap(r, c, 0.45)) {
          bad.push(`${lot} blocks ${street}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every filmed camera tile centre lies outside every lot", () => {
    // fenced yards you can walk into through a gate are not buildings
    const enterableYards = new Set(["cemetery"]);
    const bad: string[] = [];
    for (const [tx, ty] of CAMERA_TILES) {
      const c = tileCenter(tx, ty);
      for (const [lot, r] of Object.entries(LOTS)) {
        if (enterableYards.has(lot)) {
          continue;
        }
        if (c.x > r.minX && c.x < r.maxX && c.z > r.minZ && c.z < r.maxZ) {
          bad.push(`${lot} covers tile (${tx},${ty})`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("windows", () => {
  it("each window sits on its lot's wall run, clear of that lot's door", () => {
    for (const [lot, specs] of Object.entries(WINDOWS)) {
      const r = LOTS[lot as keyof typeof LOTS];
      const door = STREET_DOORS.find((d) => d.x >= r.minX && d.x <= r.maxX && d.z >= r.minZ && d.z <= r.maxZ);
      for (const w of specs ?? []) {
        const run = w.side === "E" || w.side === "W" ? [r.minZ, r.maxZ] : [r.minX, r.maxX];
        expect(w.at - w.w / 2).toBeGreaterThanOrEqual(run[0]);
        expect(w.at + w.w / 2).toBeLessThanOrEqual(run[1]);
        expect(w.top).toBeGreaterThan(w.bottom);
        // upper-storey panes may sit over the door; only windows in the
        // door's own height band must clear it in plan
        if (door && door.side === w.side && w.bottom < door.y + door.height) {
          const doorRun = w.side === "E" || w.side === "W" ? door.z : door.x;
          const clear = Math.abs(w.at - doorRun) - (w.w / 2 + 0.08) - (door.width / 2 + 0.12);
          expect(clear).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe("street-face decoration rule", () => {
  it("decor planes clear the wall AABB on both street sides", () => {
    // west-side building, east face: beyond maxX
    expect(decorX(LOTS.saloon, "E")).toBeGreaterThan(LOTS.saloon.maxX);
    // east-side building, west face: before minX
    expect(decorX(LOTS.watson, "W")).toBeLessThan(LOTS.watson.minX);
    expect(decorZ(LOTS.mission, "S")).toBeGreaterThan(LOTS.mission.maxZ);
    expect(DECOR_GAP).toBeGreaterThan(0);
    expect(WALL_T).toBeGreaterThan(0);
  });
});

describe("interior doors", () => {
  it("upper-floor doors carry an elevated y", () => {
    for (const id of ["salUp1", "salUp4", "hotRoom", "mayorBed"]) {
      const door = INTERIOR_DOORS.find((d) => d.id === id);
      expect(door?.y ?? 0).toBeGreaterThan(3);
    }
  });

  it("padre door sits west of the school doors", () => {
    const padre = INTERIOR_DOORS.find((d) => d.id === "padre");
    const school = INTERIOR_DOORS.find((d) => d.id === "school");
    expect(padre && school && padre.x < school.x).toBe(true);
  });
});

describe("place labels", () => {
  it("names the gate spawn 'South gate'", () => {
    expect(placeLabel(52, 0, 117.5)).toBe("South gate");
  });

  it("upper floors do not steal the ground-floor label", () => {
    const inSaloon = { x: 44, z: 62 };
    expect(placeLabel(inSaloon.x, 0, inSaloon.z)).toBe("Hard Drive Saloon");
    expect(placeLabel(inSaloon.x, 4.2, inSaloon.z)).toBe("Hard Drive Saloon — upstairs");
    expect(placeLabel(62, 0, 40)).toBe("Cactus Bed Hotel");
    expect(placeLabel(62, 4.5, 40)).toBe("Cactus Bed Hotel — upstairs");
  });

  it("streets and rooms resolve", () => {
    // the G7 crossing itself reads as Main; Neely proper is west of it
    expect(placeLabel(52, 0, 52)).toBe("Main Street");
    expect(placeLabel(30, 0, 52)).toBe("Neely Street");
    expect(placeLabel(52, 0, 70)).toBe("Main Street");
    expect(placeLabel(44, 0, 92)).toBe("Sheriff's office");
    expect(placeLabel(60, 0, 92)).toBe("Curiosities");
    expect(placeLabel(52, 0, 12)).toBe("Mission courtyard");
    expect(placeLabel(52, 0, -4)).toBe("Schoolhouse");
    expect(placeLabel(38, 0, -5)).toBe("Padre's room");
    expect(placeLabel(10, 0, 38)).toBe("Shady Acres");
    expect(placeLabel(17, 0, 60)).toBe("The Rattler");
    expect(placeLabel(-30, 0, -30)).toBe("Diamondback");
  });
});
