/**
 * Interiors, sized from each interior SET's walkable camera tiles and
 * nested INSIDE the exterior footprints (upper floors stacked, never
 * dumped on the street). Furnishing follows the interior HQ stills.
 */
import * as THREE from "three";
import { Builder } from "./geometry";
import { LOTS, STOREY, streetDoor, winGaps, type DoorSpec } from "./layout";
import type { Mats } from "./materials";
import * as P from "./props";
import { boardTex, posterTex, type BoardOpts, type PosterKind } from "./textures";
import { doorGapOf, wallX, wallZ, type Gap } from "./town";

const CEIL = 3.3;

export interface PointLightSpec {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}

export interface InteriorsResult {
  group: THREE.Group;
  builder: Builder;
  lights: PointLightSpec[];
}

function matOf(tex: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: tex });
}

function signMat(lines: string[], w: number, h: number, opts?: BoardOpts): THREE.MeshLambertMaterial {
  return matOf(boardTex(lines, w, h, opts));
}

const posterCache = new Map<PosterKind, THREE.MeshLambertMaterial>();

function posterMat(kind: PosterKind): THREE.MeshLambertMaterial {
  let mm = posterCache.get(kind);
  if (!mm) {
    mm = matOf(posterTex(kind));
    posterCache.set(kind, mm);
  }
  return mm;
}

/**
 * Interior doors (clickable, swing). y > 0 for upper floors. The
 * `side` is the face the player usually meets first.
 */
export const INTERIOR_DOORS: readonly DoorSpec[] = [
  { id: "doctorInner", pose: "doctor1 B1 W", side: "E", x: 44, y: 0, z: 35.5, width: 1.2, height: 2.45, swing: 1, label: "Dr. Rodham — office" },
  { id: "jailCell", pose: "jail cell", side: "S", x: 45.2, y: 0, z: 92.2, width: 0.95, height: 2.5, swing: 1, label: "Cell", gate: true },
  { id: "school", pose: "court C3 N", side: "S", x: 52, y: 0, z: 1, width: 2.5, height: 2.9, swing: -1, label: "Schoolhouse", double: true },
  { id: "padre", pose: "school A2 W", side: "E", x: 42, y: 0, z: -5, width: 1.2, height: 2.4, swing: 1, label: "Padre's room" },
  { id: "salUp4", pose: "salupper A1 N", side: "E", x: 43.6, y: STOREY, z: 58.9, width: 1.1, height: 2.3, swing: 1, label: "Room 4" },
  { id: "salUp3", pose: "salupper A3 E", side: "E", x: 43.6, y: STOREY, z: 64, width: 1.1, height: 2.3, swing: -1, label: "Room 3" },
  { id: "hotRoom", pose: "hotupper C4 W", side: "S", x: 59.7, y: STOREY, z: 38.8, width: 1.15, height: 2.3, swing: 1, label: "Room 2" },
  { id: "mayorFront", pose: "mayhall C4 S", side: "W", x: 86, y: 0, z: 66.6, width: 1.5, height: 2.6, swing: 1, label: "Mansion door" },
  { id: "mayorStudy", pose: "mayhall C3 W", side: "S", x: 90, y: 0, z: 63, width: 1.3, height: 2.5, swing: 1, label: "Study" },
  { id: "mayorDine", pose: "mayhall C3 E", side: "N", x: 90, y: 0, z: 69, width: 1.3, height: 2.5, swing: -1, label: "Dining room" },
  { id: "mayorBed", pose: "mayupper B1 N", side: "S", x: 93, y: STOREY, z: 63, width: 1.2, height: 2.4, swing: 1, label: "Bedroom" },
];

function interiorDoor(id: string): DoorSpec {
  const d = INTERIOR_DOORS.find((s) => s.id === id);
  if (!d) {
    throw new Error(`no interior door ${id}`);
  }
  return d;
}

/* ------------------------------------------------------------------ */

export function buildInteriors(m: Mats): InteriorsResult {
  const group = new THREE.Group();
  const b = new Builder();
  const lights: PointLightSpec[] = [];

  const warm = (x: number, y: number, z: number, intensity = 16, distance = 9): void => {
    lights.push({ x, y, z, color: 0xffc98a, intensity, distance });
  };

  /** Inner wall lining with world-UV wallpaper + floor + ceiling. */
  function room(
    mat: THREE.Material,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    opts: {
      /** null skips the floor plane (upper rooms sit on slab boxes). */
      floor?: THREE.Material | null;
      ceil?: THREE.Material | null;
      ceilY?: number;
      y0?: number;
      wainscot?: THREE.Material;
      gaps?: { N?: Gap[]; S?: Gap[]; E?: Gap[]; W?: Gap[] };
    } = {},
  ): void {
    const y0 = opts.y0 ?? 0;
    const ceilY = opts.ceilY ?? y0 + CEIL;
    const g = opts.gaps ?? {};
    // shells are inset inward from the lot edge (inner face at +0.3),
    // so linings hang just roomward of that face
    const t = 0.06;
    const off = 0.3 + t / 2 + 0.01;
    wallX(b, mat, minX, maxX, minZ + off, y0, ceilY, g.N ?? [], t);
    wallX(b, mat, minX, maxX, maxZ - off, y0, ceilY, g.S ?? [], t);
    wallZ(b, mat, minZ, maxZ, minX + off, y0, ceilY, g.W ?? [], t);
    wallZ(b, mat, minZ, maxZ, maxX - off, y0, ceilY, g.E ?? [], t);
    if (opts.wainscot) {
      const wt = 0.05;
      const woff = off + t / 2 + wt / 2 + 0.01;
      wallX(b, opts.wainscot, minX, maxX, minZ + woff, y0, y0 + 1.0, g.N ?? [], wt);
      wallX(b, opts.wainscot, minX, maxX, maxZ - woff, y0, y0 + 1.0, g.S ?? [], wt);
      wallZ(b, opts.wainscot, minZ, maxZ, minX + woff, y0, y0 + 1.0, g.W ?? [], wt);
      wallZ(b, opts.wainscot, minZ, maxZ, maxX - woff, y0, y0 + 1.0, g.E ?? [], wt);
    }
    if (opts.floor !== null) {
      b.flat(opts.floor ?? m.floorWood, minX, minZ, maxX, maxZ, y0 + 0.04);
    }
    if (opts.ceil !== null) {
      b.box(opts.ceil ?? m.woodDark, minX, ceilY, minZ, maxX, ceilY + 0.12, maxZ);
    }
  }

  /* ---------- Hard Drive Saloon: lower ---------- */
  {
    const r = LOTS.saloon;
    const d = streetDoor("saloon");
    room(m.wpSaloon, r.minX, r.minZ, r.maxX, r.maxZ, {
      wainscot: m.woodSaloon,
      ceilY: 3.4,
      ceil: null, // upper floor slab is the ceiling
      gaps: {
        E: [doorGapOf(d)],
        W: [{ from: 71.4, to: 72.8, top: 2.6 }],
      },
    });
    // upper floor slab (with a stairwell opening at the south-west)
    b.box(m.floorWood, r.minX, 3.4, r.minZ, r.maxX, STOREY, 69.6);
    b.box(m.floorWood, 43.4, 3.4, 69.6, r.maxX, STOREY, r.maxZ);
    // long bar along the west wall with brass rail + stools
    b.box(m.woodSaloon, 40.5, 0, 58, 42.2, 1.15, 66.5);
    b.flat(m.woodDark, 40.4, 57.9, 42.35, 66.6, 1.16);
    b.box(m.brass, 42.5, 0.25, 58.2, 42.56, 0.31, 66.3, { collide: false });
    for (const sz of [59.2, 61.2, 63.2, 65.2]) {
      b.cyl(m.woodDark, 43.1, sz, 0, 0.75, 0.22, { seg: 8, collide: true });
    }
    // backbar with arches, bottles, and the gold nude painting
    b.box(m.woodSaloon, 40.2, 0, 57.2, 40.55, 2.9, 67.2);
    b.decal(signMat(["", "◠", ""], 3, 1.6, { bg: "#241a12", fg: "#6b5b3c" }), 40.58, 1.9, 60, 3, 1.6, "E");
    b.decal(
      signMat(["~ La Belle ~"], 2.4, 1.4, { bg: "#8a6f52", fg: "#dfb44e", border: "#5e4a30" }),
      40.58,
      2.35,
      63.6,
      2.4,
      1.4,
      "E",
    );
    for (let i = 0; i < 8; i += 1) {
      b.box(m.glassCold, 40.6, 1.2, 58.4 + i * 0.9, 40.72, 1.55, 58.55 + i * 0.9, { collide: false });
    }
    P.barrel(b, m, 40.9, 67.6, 0.4, 0.9);
    // café doors just inside the street door
    // (built by game.ts via cafeDoors so they can be a separate group)
    // tables + chairs
    P.tableRound(b, m, 45.3, 61.5);
    P.chair(b, m, 44.5, 62.3, 2.4);
    P.chair(b, m, 46.2, 61.0, -0.6);
    P.tableRound(b, m, 44.8, 68.4);
    P.chair(b, m, 45.7, 69, 1.2);
    // Lucky Jack's slot machine against the east wall
    b.box(m.gold, 47.1, 0.9, 65.6, 47.75, 2.2, 66.6);
    b.box(m.woodSaloon, 47.05, 0, 65.7, 47.7, 0.9, 66.5);
    b.decal(
      signMat(["LUCKY JACK'S", "SLOT MACHINE"], 1.0, 0.9, { bg: "#7a5a1e", fg: "#efe0b0", border: "#3c2c10" }),
      47.02,
      1.7,
      66.1,
      1.0,
      0.9,
      "W",
    );
    // red curtains along the south + east back walls
    for (const cz of [70.5, 73.5] as const) {
      b.box(m.curtainRed, 47.4, 0.1, cz - 0.9, 47.62, 3.2, cz + 0.9, { collide: false });
    }
    b.box(m.curtainRed, 44.4, 0.1, 74.0, 46.4, 3.2, 74.2, { collide: false });
    // framed landscapes + sconces
    b.decal(signMat(["≈"], 1.2, 0.9, { bg: "#57683f", fg: "#8ea06a", border: "#b08d3f" }), 45, 2.2, 56.42, 1.2, 0.9, "S");
    b.decal(signMat(["≈"], 1.2, 0.9, { bg: "#57683f", fg: "#8ea06a", border: "#b08d3f" }), 47.56, 2.2, 68.8, 1.2, 0.9, "W");
    // stairs up along the west wall, rising north from the back
    b.stairs(m.woodSaloon, 40.3, 74.1, 2.9, STOREY, 4.6, "N");
    P.balustrade(b, m, 43.35, 69.7, 43.35, 74.3, 3.7, 0.95);
    P.balustrade(b, m, 40.3, 69.62, 43.35, 69.62, 3.7, 0.95);
    warm(44, 2.9, 61, 18, 11);
    warm(44.5, 2.9, 70, 14, 9);
  }

  /* ---------- saloon upper: numbered doors, deer heads, red room ---------- */
  {
    const r = LOTS.saloon;
    const up = STOREY;
    room(m.wpSalUpper, r.minX, r.minZ, r.maxX, r.maxZ, {
      y0: up,
      floor: null,
      ceilY: up + 3.0,
      ceil: m.woodSaloon,
      gaps: {
        // stairwell reaches the south wall opening; corridor windows E
        S: [{ from: 40.3, to: 43.3, top: up + 3.0 }],
        E: winGaps("saloon", "E"),
      },
    });
    // rooms partition on the west side: red shared room (Ruby/Oona) + room 3
    const d4 = interiorDoor("salUp4");
    const d3 = interiorDoor("salUp3");
    wallZ(b, m.wpSalUpper, 56.3, 66.6, 43.6, up, up + 3.0, [doorGapOf(d4, 0.08), doorGapOf(d3, 0.08)], 0.2);
    wallX(b, m.wpSalRoom, 40.3, 43.6, 61.6, up, up + 3.0, [], 0.2);
    // red room lining (Ruby's): red wallpaper + bed + washstand
    room(m.wpSalRoom, r.minX, r.minZ, 43.6, 61.6, { y0: up, ceilY: up + 3.0, ceil: null, gaps: { E: [doorGapOf(d4, 0.08)] } });
    b.box(m.woodSaloon, 40.6, up, 56.8, 42.4, up + 0.65, 59.4);
    b.box(m.quiltGreen, 40.65, up + 0.55, 57.0, 42.35, up + 0.8, 59.3, { collide: false });
    b.box(m.woodSaloon, 40.6, up, 56.6, 42.4, up + 1.4, 56.9, { collide: false });
    b.box(m.curtainRed, 40.4, up + 0.3, 60.2, 40.6, up + 2.6, 61.3, { collide: false });
    b.decal(signMat(["✦"], 0.6, 0.8, { bg: "#6e5844", fg: "#d8cba6", border: "#b08d3f" }), 43.38, up + 1.9, 58, 0.6, 0.8, "W");
    b.cyl(m.woodDark, 43, 60.9, up, up + 0.8, 0.3, { seg: 8, collide: true });
    b.box(m.marble, 42.7, up + 0.8, 60.6, 43.3, up + 0.86, 61.2, { collide: false });
    warm(42, up + 2.2, 59, 10, 6);
    // room 3 (plain) south of the red room
    room(m.wpSalUpper, r.minX, 61.6, 43.6, 66.6, { y0: up, ceilY: up + 3.0, ceil: null, gaps: { E: [doorGapOf(d3, 0.08)] } });
    b.box(m.woodSaloon, 40.6, up, 62.2, 42.2, up + 0.6, 64.6);
    b.box(m.quiltGreen, 40.65, up + 0.5, 62.4, 42.15, up + 0.72, 64.5, { collide: false });
    // corridor dressing: fake doors 1+2 on the east wall, deer heads, runner
    b.decal(signMat(["1"], 1.1, 2.3, { bg: "#3a2b1f", fg: "#dfb44e", planked: true }), 47.55, up + 1.25, 62.9, 1.1, 2.3, "W");
    b.decal(signMat(["2"], 1.1, 2.3, { bg: "#3a2b1f", fg: "#dfb44e", planked: true }), 47.55, up + 1.25, 59.3, 1.1, 2.3, "W");
    b.flat(m.rug, 44.2, 57, 47.2, 69, up + 0.05, { texWorld: 1.6 });
    // deer head mounts
    b.box(m.woodMid, 47.5, up + 2.0, 66.8, 47.62, up + 2.5, 67.3, { collide: false });
    b.cone(m.woodStage, 47.35, 67.05, up + 2.05, up + 2.45, 0.18, 6);
    b.box(m.woodMid, 44.3, up + 2.0, 56.55, 44.8, up + 2.5, 56.67, { collide: false });
    b.decal(signMat(["♞"], 0.5, 0.5, { bg: "#c9bd9f", fg: "#8a6f52" }), 44.55, up + 2.25, 56.7, 0.5, 0.5, "S");
    warm(45.5, up + 2.6, 62, 12, 8);
    warm(45.5, up + 2.6, 70, 10, 7);
  }

  /* ---------- saloon backshed corridor ---------- */
  {
    const r = LOTS.saloonBackshed;
    room(m.woodSaloon, r.minX, r.minZ, r.maxX, r.maxZ, {
      gaps: {
        W: [doorGapOf(streetDoor("saloonBack"))],
        E: [{ from: 71.4, to: 72.8, top: 2.6 }],
      },
    });
    P.barrel(b, m, 34, 58.5);
    P.barrel(b, m, 35, 59.2);
    P.crate(b, m, 38.5, 62, 1.0, 0.9, 0.2);
    P.crate(b, m, 38.2, 64.5, 0.8, 1.4, 0.1);
    P.sack(b, m, 34.5, 74);
    P.sack(b, m, 35.2, 74.5, 0.4);
    b.decal(posterMat("circus"), 39.9, 1.9, 66, 0.85, 1.15, "W");
    warm(36, 2.8, 66, 10, 8);
    warm(36, 2.8, 76, 8, 7);
  }

  /* ---------- Jail: office + cell behind a bar grid ---------- */
  {
    const r = LOTS.jail;
    const d = streetDoor("jail");
    const cell = interiorDoor("jailCell");
    room(m.plasterJail, r.minX, r.minZ, r.maxX, r.maxZ, {
      ceilY: 3.2,
      gaps: {
        E: [doorGapOf(d), ...winGaps("jail", "E")],
        W: winGaps("jail", "W"),
      },
    });
    // ceiling vigas
    for (const vz of [89.3, 91, 92.7, 94.4]) {
      b.box(m.woodDark, r.minX + 0.2, 2.95, vz - 0.1, r.maxX - 0.2, 3.2, vz + 0.1, { collide: false });
    }
    // cell in the north-east corner: bar walls with a barred door gap
    const barWall = (x0: number, z0: number, x1: number, z1: number, gap?: Gap): void => {
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const len = alongX ? x1 - x0 : z1 - z0;
      const n = Math.round(Math.abs(len) / 0.22);
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const px = x0 + (alongX ? len * t : 0);
        const pz = z0 + (alongX ? 0 : len * t);
        const runPos = alongX ? px : pz;
        if (gap && runPos > gap.from && runPos < gap.to) {
          continue;
        }
        b.box(m.iron, px - 0.03, 0, pz - 0.03, px + 0.03, 3.2, pz + 0.03, { collide: false });
      }
      // rails top/bottom + collision slab
      if (alongX) {
        b.box(m.iron, x0, 2.9, z0 - 0.04, x1, 3.0, z0 + 0.04, { collide: false });
        if (gap) {
          b.solid({ minX: x0, minY: 0, minZ: z0 - 0.06, maxX: gap.from, maxY: 3.2, maxZ: z0 + 0.06 });
          b.solid({ minX: gap.to, minY: 0, minZ: z0 - 0.06, maxX: x1, maxY: 3.2, maxZ: z0 + 0.06 });
        } else {
          b.solid({ minX: x0, minY: 0, minZ: z0 - 0.06, maxX: x1, maxY: 3.2, maxZ: z0 + 0.06 });
        }
      } else {
        b.box(m.iron, x0 - 0.04, 2.9, z0, x0 + 0.04, 3.0, z1, { collide: false });
        b.solid({ minX: x0 - 0.06, minY: 0, minZ: z0, maxX: x0 + 0.06, maxY: 3.2, maxZ: z1 });
      }
    };
    barWall(44.6, 88.3, 44.6, 92.2);
    barWall(44.6, 92.2, 47.8, 92.2, doorGapOf(cell, 0.05));
    // bunk + bucket + blue-lit barred window handled by facade
    b.box(m.woodDark, 46.2, 0.35, 88.5, 47.7, 0.6, 89.4);
    b.box(m.quiltGreen, 46.25, 0.6, 88.55, 47.65, 0.72, 89.35, { collide: false });
    b.cyl(m.iron, 45.2, 88.8, 0, 0.35, 0.2, { seg: 8 });
    // office: desk, stove + pipe, map, poster board, gun rack, cabinet
    b.box(m.woodMid, 42.2, 0, 92.9, 44.0, 0.78, 94.1);
    b.flat(m.woodDark, 42.1, 92.8, 44.1, 94.2, 0.8);
    b.decal(signMat(["✉"], 0.4, 0.3, { bg: "#ddd2b0", fg: "#241d16" }), 43, 0.83, 93.5, 0.4, 0.3, "N");
    P.chair(b, m, 43, 94.8, Math.PI);
    P.stove(b, m, 41.3, 89.3, 3.2);
    b.decal(
      signMat(["ARIZONA AND NEW MEXICO", "TERRITORIES"], 2.6, 1.5, { bg: "#c9bd8f", fg: "#4a3826", border: "#6b5b3c" }),
      42.6,
      1.9,
      88.42,
      2.6,
      1.5,
      "S",
    );
    b.decal(
      signMat(["WANTED  WANTED", "WANTED  WANTED"], 2.6, 1.4, { bg: "#8a6f52", fg: "#ddd2b0", border: "#4f382a" }),
      42.6,
      1.9,
      95.58,
      2.6,
      1.4,
      "N",
    );
    b.decal(posterMat("wanted"), 44.6, 1.8, 95.58, 0.7, 0.95, "N");
    // gun rack on the west wall, north of the window
    b.box(m.woodDark, 40.35, 1.7, 88.7, 40.55, 2.4, 90.3, { collide: false });
    for (let i = 0; i < 3; i += 1) {
      b.rotBox(m.iron, 40.55, 2.05, 89.0 + i * 0.4, 0.06, 1.1, 0.06, 0, { rotX: 0.5, collide: false });
    }
    b.box(m.woodMid, 40.3, 0, 94.6, 41.0, 1.3, 95.5); // filing cabinet
    P.coatRack(b, m, 41.2, 95.2);
    b.flat(m.rug, 41.5, 90.5, 44, 92.5, 0.06, { texWorld: 1.4 });
    warm(43, 2.7, 92.5, 14, 8);
  }

  /* ---------- Watson's Apothecary ---------- */
  {
    const r = LOTS.watson;
    const d = streetDoor("watson");
    room(m.wpApoth, r.minX, r.minZ, r.maxX, r.maxZ, {
      wainscot: m.woodSaloon,
      gaps: { W: [doorGapOf(d), ...winGaps("watson", "W")] },
    });
    // dual glass counters along north + south
    for (const [z0, z1] of [
      [64.6, 65.6],
      [70.4, 71.4],
    ] as const) {
      b.box(m.woodSaloon, 58, 0, z0, 65.5, 0.95, z1);
      b.box(m.glassCold, 58.1, 0.95, z0 + 0.1, 65.4, 1.25, z1 - 0.1, { collide: false });
      b.box(m.brass, 58, 0.92, z0 - 0.03, 65.5, 0.98, z0, { collide: false });
    }
    // shelving with jars on both long walls
    for (const wallZ0 of [64.35, 71.65] as const) {
      const face = wallZ0 < 68 ? "S" : "N";
      b.decal(
        signMat(["▯▯▯▯▯▯▯", "▯▯▯▯▯▯▯", "▯▯▯▯▯▯▯"], 6.5, 2.0, { bg: "#3a2b1f", fg: "#ddd2b0" }),
        61.5,
        2.1,
        face === "S" ? wallZ0 + 0.28 : wallZ0 - 0.28,
        6.5,
        2.0,
        face,
      );
    }
    // arched back-room feel: header beam + barrels + crocks at the east end
    b.box(m.woodSaloon, 65.8, 2.5, r.minZ + 0.2, 66.2, 3.3, r.maxZ - 0.2, { collide: false });
    P.barrel(b, m, 67.1, 65.2, 0.45, 1.0);
    P.barrel(b, m, 67.2, 66.5, 0.4, 0.9);
    b.cyl(m.woodStage, 66.9, 70.6, 0, 0.8, 0.35, { seg: 9, collide: true });
    b.decal(posterMat("tonic"), 67.86, 1.9, 68, 0.85, 1.15, "W");
    // grandfather clock + portrait by the door
    b.box(m.woodSaloon, 56.4, 0, 64.6, 57.0, 2.3, 65.2);
    b.decal(signMat(["XII"], 0.4, 0.4, { bg: "#ddd2b0", fg: "#241d16", border: "#b08d3f" }), 56.7, 1.95, 65.24, 0.4, 0.4, "S");
    b.decal(signMat(["◐"], 0.7, 0.9, { bg: "#8a6f52", fg: "#ddd2b0", border: "#b08d3f" }), 56.44, 2.1, 68, 0.7, 0.9, "E");
    P.chair(b, m, 58.6, 66.4, 0.6);
    P.coatRack(b, m, 57.2, 71);
    warm(61, 2.8, 68, 16, 9);
  }

  /* ---------- Bolivar's Dry Goods ---------- */
  {
    const r = LOTS.bolivar;
    const d = streetDoor("bolivar");
    room(m.woodMid, r.minX, r.minZ, r.maxX, r.maxZ, {
      gaps: { W: [doorGapOf(d), ...winGaps("bolivar", "W")] },
    });
    // teal shelving stacked with cans on N, E, S walls
    b.decal(signMat(["▤▤▤▤▤▤", "▤▤▤▤▤▤", "▤▤▤▤▤▤"], 8, 2.2, { bg: "#3f7770", fg: "#c9a24a" }), 61, 2.0, 72.5, 8, 2.2, "S");
    b.decal(signMat(["▤▤▤▤▤▤", "▤▤▤▤▤▤"], 6.5, 2.0, { bg: "#3f7770", fg: "#b0552e" }), 61, 2.0, 79.5, 6.5, 2.0, "N");
    b.decal(signMat(["▤▤▤", "▤▤▤"], 3, 1.8, { bg: "#3f7770", fg: "#c9a24a" }), 65.6, 1.9, 76, 3, 1.8, "W");
    // white marble U-counter opening toward the door
    b.box(m.teal, 58.4, 0, 73.6, 64.8, 0.9, 74.5);
    b.flat(m.marble, 58.3, 73.5, 64.9, 74.6, 0.92);
    b.box(m.teal, 58.4, 0, 77.6, 64.8, 0.9, 78.5);
    b.flat(m.marble, 58.3, 77.5, 64.9, 78.6, 0.92);
    b.box(m.teal, 64.2, 0, 74.5, 65.1, 0.9, 77.6);
    b.flat(m.marble, 64.1, 74.4, 65.2, 77.7, 0.92);
    // red coffee grinder + crocks + scale
    b.cyl(m.curioRed, 61.5, 78.05, 0.92, 1.5, 0.28, { seg: 10 });
    b.cyl(m.curioRed, 61.5, 78.05, 1.5, 1.75, 0.1, { seg: 8 });
    b.cyl(m.woodStage, 60, 74.05, 0.92, 1.5, 0.24, { seg: 9 });
    b.cyl(m.woodStage, 60.7, 74.05, 0.92, 1.45, 0.22, { seg: 9 });
    b.box(m.iron, 62.6, 0.92, 73.8, 63.3, 1.15, 74.3, { collide: false });
    // wagon wheel + pans + mirrors on the back wall, chairs hung high
    P.wagonWheel(b, m, 62, 1.6, 79.2, 0.65, 0);
    b.decal(signMat(["◯ ◯"], 1.6, 0.7, { bg: "#6d5136", fg: "#3a3630" }), 59.4, 2.6, 79.55, 1.6, 0.7, "N");
    b.decal(signMat(["⚒"], 0.9, 0.9, { bg: "#6d5136", fg: "#2b2a28" }), 64.4, 2.7, 79.55, 0.9, 0.9, "N");
    // stove + barrel of apples
    P.stove(b, m, 65.0, 73.2, 3.3);
    P.barrel(b, m, 57.6, 78.6, 0.42, 0.8);
    b.sphere(m.curioRed, 57.6, 0.86, 78.6, 0.12, 6);
    b.sphere(m.curioRed, 57.85, 0.84, 78.45, 0.11, 6);
    // WANTED poster + baking powder banner between the windows
    b.decal(posterMat("wanted"), 56.44, 1.9, 75.5, 0.75, 1.0, "E");
    b.decal(signMat(["COUNCE", "BAKING", "POWDER"], 0.8, 1.4, { bg: "#a3261d", fg: "#efe0b0", border: "#5e1713" }), 56.44, 2.0, 76.6, 0.8, 1.4, "E");
    warm(61, 2.8, 76, 16, 9);
  }

  /* ---------- Bank: teller cage, vault, benches ---------- */
  {
    const r = LOTS.bank;
    const d = streetDoor("bank");
    room(m.bankInner, r.minX, r.minZ, r.maxX, r.maxZ, {
      ceilY: 3.4,
      ceil: m.redCeiling,
      gaps: { E: [doorGapOf(d), ...winGaps("bank", "E")] },
    });
    // teller partition along the west: dark frame + gold-barred arch
    b.box(m.woodBlack, 43.8, 0, 40.4, 44.2, 3.4, 42.6);
    b.box(m.woodBlack, 43.8, 0, 44.6, 44.2, 3.4, 47.6);
    b.box(m.woodBlack, 43.8, 2.6, 42.6, 44.2, 3.4, 44.6, { collide: false });
    b.box(m.woodBlack, 43.8, 0, 42.6, 44.2, 1.05, 44.6);
    b.flat(m.woodDark, 43.7, 42.5, 44.4, 44.7, 1.07);
    for (let i = 0; i < 7; i += 1) {
      b.box(m.brass, 43.95, 1.07, 42.75 + i * 0.27, 44.05, 2.6, 42.81 + i * 0.27, { collide: false });
    }
    b.solid({ minX: 43.8, minY: 1.05, minZ: 42.6, maxX: 44.2, maxY: 2.6, maxZ: 44.6 });
    b.decal(signMat(["TELLER"], 1.2, 0.4, { bg: "#efeadb", fg: "#241d16", border: "#b08d3f" }), 44.24, 2.8, 43.6, 1.2, 0.4, "E");
    // vault door at the north end
    b.box(m.woodBlack, 44.3, 0, 40.42, 47.6, 0.1, 40.6, { collide: false });
    b.decal(
      signMat(["DIAMONDBACK", "BANK & TRUST", "◎"], 2.6, 2.6, { bg: "#17130f", fg: "#dfb44e", border: "#3c2c10" }),
      46,
      1.5,
      40.62,
      2.6,
      2.6,
      "S",
    );
    // benches + certificates + clock between the barred windows
    P.bench(b, m, 47.0, 43.5, 2.2, "W");
    b.decal(
      signMat(["The Co-Operative", "Town Company"], 1.2, 0.9, { bg: "#e6dcba", fg: "#4a3826", border: "#6b5b3c" }),
      47.56,
      2.0,
      44.6,
      1.2,
      0.9,
      "W",
    );
    b.decal(signMat(["XII"], 0.55, 0.8, { bg: "#6d5136", fg: "#ddd2b0", border: "#3c2c10" }), 45.8, 2.3, 47.42, 0.55, 0.8, "N");
    // writing table + green-shade lamps
    b.box(m.woodMid, 45.2, 0, 46.4, 46.6, 0.85, 47.1);
    b.cyl(m.brass, 46.9, 41.4, 0, 0.3, 0.15, { seg: 8 });
    lights.push({ x: 46, y: 2.6, z: 43.5, color: 0xcfe8b0, intensity: 12, distance: 8 });
    warm(46, 2.6, 46, 8, 6);
  }

  /* ---------- Dr. Rodham: waiting room + inner office ---------- */
  {
    const r = LOTS.doctor;
    const d = streetDoor("doctor");
    const inner = interiorDoor("doctorInner");
    // partition at x=44
    wallZ(b, m.woodDoctor, r.minZ, r.maxZ, 44, 0, CEIL, [doorGapOf(inner, 0.08)], 0.2);
    room(m.woodDoctor, 44, r.minZ, r.maxX, r.maxZ, {
      gaps: { E: [doorGapOf(d), ...winGaps("doctor", "E")], W: [doorGapOf(inner, 0.08)] },
    });
    room(m.woodMid, r.minX, r.minZ, 44, r.maxZ, {
      gaps: { E: [doorGapOf(inner, 0.08)] },
    });
    // waiting room: desk, clock, certificate, poster, stove, coat rack
    b.box(m.woodMid, 44.6, 0, 33.0, 45.9, 0.95, 34.0);
    b.decal(signMat(["◔"], 0.5, 0.7, { bg: "#6d5136", fg: "#ddd2b0" }), 45.4, 2.3, 32.42, 0.5, 0.7, "S");
    b.decal(
      signMat(["Diploma", "H. Rodham M.D."], 1.1, 0.8, { bg: "#e6dcba", fg: "#4a3826", border: "#6b5b3c" }),
      46.6,
      2.25,
      32.42,
      1.1,
      0.8,
      "S",
    );
    b.decal(posterMat("tonic"), 47.56, 1.9, 36.4, 0.85, 1.15, "W");
    P.stove(b, m, 45.0, 38.9, CEIL);
    P.coatRack(b, m, 47.0, 33.2);
    P.chair(b, m, 46.8, 36.6, -Math.PI / 2);
    P.chair(b, m, 46.8, 38.0, -Math.PI / 2);
    b.decal(signMat(["DR. H. RODHAM"], 1.05, 0.3, { bg: "#4a3826", fg: "#efeadb" }), 44.24, 2.0, 35.5, 1.05, 0.3, "E");
    // inner office: marble table, charts, skeleton + saw, cabinet
    b.box(m.woodDark, 41.3, 0, 34.8, 43.2, 0.9, 36.6);
    b.flat(m.marble, 41.2, 34.7, 43.3, 36.7, 0.92);
    b.cyl(m.white, 41.7, 35.2, 0.92, 1.25, 0.12, { seg: 8 });
    b.decal(
      signMat(["☰ anatomy", "☰ humours", "☰ the body"], 2.6, 1.4, { bg: "#d8cba6", fg: "#6e5030", border: "#8a7a52" }),
      41.8,
      2.1,
      32.42,
      2.6,
      1.4,
      "S",
    );
    b.decal(signMat(["☠"], 0.8, 1.3, { bg: "#ddd2b0", fg: "#4a3826", border: "#8a7a52" }), 40.44, 2.0, 35.2, 0.8, 1.3, "E");
    b.rotBox(m.iron, 40.6, 2.1, 37.2, 0.5, 0.16, 0.03, 0, { rotZ: 0.5, collide: false });
    b.box(m.woodSaloon, 41.0, 0, 38.6, 43.4, 1.9, 39.5);
    b.decal(signMat(["▯▯▯▯", "▯▯▯▯"], 1.9, 1.0, { bg: "#3a2b1f", fg: "#ddd2b0" }), 42.2, 1.3, 38.55, 1.9, 1.0, "N");
    P.barrel(b, m, 40.8, 33.2, 0.4, 0.85);
    warm(46, 2.7, 36, 13, 8);
    warm(42, 2.7, 36, 12, 8);
  }

  /* ---------- Curiosities: dark corridor, red screens, jars ---------- */
  {
    const r = LOTS.curio;
    const d = streetDoor("curio");
    room(m.woodBlack, r.minX, r.minZ, r.maxX, r.maxZ, {
      ceilY: 3.4,
      ceil: m.woodBlack,
      gaps: { W: [doorGapOf(d), ...winGaps("curio", "W")] },
    });
    // red band at the ceiling line
    b.box(m.curioRed, r.minX + 0.24, 3.1, r.minZ + 0.24, r.maxX - 0.24, 3.28, r.minZ + 0.34, { collide: false });
    b.box(m.curioRed, r.minX + 0.24, 3.1, r.maxZ - 0.34, r.maxX - 0.24, 3.28, r.maxZ - 0.24, { collide: false });
    // red fretwork screens making the corridor turn
    const screen = (x: number, z0: number, z1: number): void => {
      b.box(m.curioRed, x - 0.05, 0, z0, x + 0.05, 0.25, z1);
      b.box(m.curioRed, x - 0.05, 2.6, z0, x + 0.05, 2.85, z1, { collide: false });
      for (let i = 0; i <= Math.round((z1 - z0) / 0.55); i += 1) {
        b.box(m.curioRed, x - 0.04, 0.25, z0 + i * 0.55 - 0.03, x + 0.04, 2.6, z0 + i * 0.55 + 0.03, {
          collide: false,
        });
      }
      b.solid({ minX: x - 0.06, minY: 0, minZ: z0, maxX: x + 0.06, maxY: 2.9, maxZ: z1 });
    };
    screen(60.5, 88.4, 90.6);
    screen(60.5, 93.8, 95.6);
    screen(65.5, 90.2, 95.6);
    // shelves of jars + big vases + skull
    b.decal(signMat(["◫◫◫◫◫"], 4.2, 1.6, { bg: "#241d16", fg: "#7a4a7e" }), 58.4, 1.9, 95.55, 4.2, 1.6, "N");
    b.decal(signMat(["◫◫◫◫"], 3.4, 1.5, { bg: "#241d16", fg: "#a3542e" }), 69.5, 1.9, 88.45, 3.4, 1.5, "S");
    for (let i = 0; i < 5; i += 1) {
      b.cyl(m.white, 66.4 + i * 1.1, 95.0, 0.9, 1.7, 0.28, { seg: 9 });
    }
    b.box(m.woodBlack, 66, 0, 94.7, 71.6, 0.9, 95.4);
    b.sphere(m.bone, 63.2, 1.1, 95.1, 0.2, 8);
    b.box(m.woodBlack, 61.5, 0, 94.9, 64.4, 0.95, 95.5);
    // hanging scroll + lantern + counters
    b.decal(
      signMat(["☲", "☯", "☵"], 0.9, 1.9, { bg: "#c9b98a", fg: "#4a3826", border: "#241d16" }),
      56.44,
      1.8,
      91.2,
      0.9,
      1.9,
      "E",
    );
    b.box(m.iron, 62.4, 2.5, 91.9, 62.7, 2.8, 92.2, { collide: false });
    b.box(m.glassWarm, 62.35, 2.2, 91.85, 62.75, 2.5, 92.25, { collide: false });
    b.box(m.woodBlack, 57, 0, 88.5, 59.8, 0.95, 89.3);
    b.decal(posterMat("wanted"), 59, 1.9, 88.45, 0.75, 1.0, "S");
    // scenery back door at the far north-east
    b.decal(signMat([""], 1.1, 2.3, { bg: "#17120d", fg: "#17120d", planked: true }), 68.5, 1.2, 88.45, 1.1, 2.3, "S");
    warm(62.5, 2.4, 92, 9, 7);
    warm(68, 2.4, 92, 7, 6);
  }

  /* ---------- Stagecoach office ---------- */
  {
    const r = LOTS.stage;
    const d = streetDoor("stage");
    room(m.woodDoctor, r.minX, r.minZ, r.maxX, r.maxZ, {
      ceilY: 3.3,
      ceil: m.redCeiling,
      gaps: { W: [doorGapOf(d)] },
    });
    // ticket counter bay along the east wall with arch + sign
    b.box(m.woodSaloon, 62.2, 0, 57.6, 63.4, 1.1, 62.4);
    b.flat(m.woodBlack, 62.1, 57.5, 63.5, 62.5, 1.12);
    b.box(m.woodSaloon, 62.0, 2.5, 57.4, 63.6, 2.9, 62.6, { collide: false });
    for (const pz of [57.6, 62.3]) {
      b.cyl(m.woodSaloon, 62.3, pz, 1.1, 2.5, 0.09, { seg: 7 });
    }
    b.decal(
      signMat(["The Great Southwestern", "STAGECOACH Co."], 2.6, 1.0, { bg: "#efeadb", fg: "#241d16", border: "#8a7a52" }),
      63.66,
      2.0,
      60,
      2.6,
      1.0,
      "W",
    );
    // THROUGH TICKETS board on the south wall
    b.decal(
      signMat(
        ["THROUGH TICKETS TO:", "Asbestos · Phoenix · Los Osos · Santa Fe", "Rabies · Dry Rot · Albuquerque · Tombstone", "CALIFORNIA AND ALL POINTS SOUTH AND EAST"],
        3.4,
        1.5,
        { bg: "#c9b98a", fg: "#33261a", border: "#6b5b3c" },
      ),
      60,
      1.9,
      63.58,
      3.4,
      1.5,
      "N",
    );
    // Lincoln + map + Fast Freight on the north wall
    b.decal(signMat(["▣"], 0.7, 0.9, { bg: "#3a2b1f", fg: "#ddd2b0", border: "#6b5b3c" }), 58.4, 2.2, 56.42, 0.7, 0.9, "S");
    b.decal(signMat(["MAP"], 1.2, 0.9, { bg: "#d8cba6", fg: "#6e5030", border: "#6b5b3c" }), 60, 2.2, 56.42, 1.2, 0.9, "S");
    b.decal(signMat(["Fast Freight", "CONTRACTED"], 1.1, 0.6, { bg: "#efeadb", fg: "#241d16", border: "#241d16" }), 61.6, 1.9, 56.42, 1.1, 0.6, "S");
    b.decal(posterMat("news"), 57.2, 2.0, 63.58, 0.85, 1.15, "N");
    P.bench(b, m, 57.1, 60, 2.2, "E");
    P.barrel(b, m, 59.2, 62.6, 0.42, 0.9);
    P.barrel(b, m, 60.4, 62.9, 0.38, 0.8);
    b.box(m.woodMid, 57.6, 0, 61.8, 58.8, 0.8, 62.6);
    b.cyl(m.brass, 57.4, 57.4, 0, 0.3, 0.15, { seg: 8 });
    warm(60, 2.7, 60, 15, 9);
  }

  /* ---------- The Rattler: press office ---------- */
  {
    const r = LOTS.rattler;
    const d = streetDoor("rattler");
    room(m.rattlerGreen, r.minX, r.minZ, r.maxX, r.maxZ, {
      wainscot: m.woodSaloon,
      gaps: { E: [doorGapOf(d), ...winGaps("rattler", "E")] },
    });
    // giant front pages pinned as wall art
    b.decal(
      signMat(["The Rattler", "———", "BONE-IDLE LOUNGERS DECRIED"], 2.2, 1.7, { bg: "#ddd2b0", fg: "#241d16", border: "#8a7a52" }),
      16,
      2.0,
      56.42,
      2.2,
      1.7,
      "S",
    );
    b.decal(posterMat("news"), 13.4, 2.0, 56.42, 0.95, 1.25, "S");
    b.decal(posterMat("news"), 18.6, 1.95, 56.42, 0.95, 1.25, "S");
    // editor desk + EDITOR plate + coat rack + sconces
    b.box(m.woodSaloon, 17, 0, 60.2, 19.4, 0.85, 61.6);
    b.decal(signMat(["EDITOR"], 0.7, 0.2, { bg: "#3c2c10", fg: "#dfb44e" }), 18.2, 0.95, 61.64, 0.7, 0.2, "S");
    P.chair(b, m, 18.2, 62.4, Math.PI);
    P.coatRack(b, m, 21.5, 56.6);
    // PRINTING PRESS door on the west wall (scenery)
    b.decal(signMat([""], 1.3, 2.4, { bg: "#3a2b1f", fg: "#3a2b1f", planked: true }), 10.46, 1.25, 60, 1.3, 2.4, "E");
    b.decal(
      signMat(["PRINTING PRESS", "AUTHORIZED USE ONLY"], 1.25, 0.55, { bg: "#c9b98a", fg: "#33261a" }),
      10.47,
      1.75,
      60,
      1.25,
      0.55,
      "E",
    );
    // galley proof strips by the press door
    for (const gz of [57.4, 58.3, 62.0, 62.9]) {
      b.decal(signMat(["|||", "|||", "|||"], 0.4, 1.4, { bg: "#ddd2b0", fg: "#8a7a52" }), 10.5, 1.9, gz, 0.4, 1.4, "E");
    }
    b.decal(signMat(["◙"], 0.6, 0.7, { bg: "#241d16", fg: "#ddd2b0", border: "#b08d3f" }), 16, 2.1, 64.04, 0.6, 0.7, "N");
    warm(16, 2.7, 60, 14, 9);
  }

  /* ---------- Sidewinder: coffin + barber corner ---------- */
  {
    const r = LOTS.sidewinder;
    const d = streetDoor("sidewinder");
    room(m.woodMid, r.minX, r.minZ, r.maxX, r.maxZ, {
      gaps: { N: [doorGapOf(d), ...winGaps("sidewinder", "N")] },
    });
    // coffin on trestles
    b.box(m.woodDark, 3.2, 0, 59.6, 3.7, 0.7, 60.4);
    b.box(m.woodDark, 5.3, 0, 59.6, 5.8, 0.7, 60.4);
    P.coffin(b, m, 4.5, 60, 0.05);
    b.solid({ minX: 3.2, minY: 0, minZ: 59.4, maxX: 5.8, maxY: 1.2, maxZ: 60.6 });
    // price board (film list)
    b.decal(
      signMat(
        ["HAIR CUTS 25¢ · SHAVE 25¢", "CLOSE SHAVE 50¢", "HEADSTONES $5 · PLOTS $10", "MOURNERS $1 EACH"],
        2.6,
        1.5,
        { bg: "#22301f", fg: "#d8e0b0", border: "#101810" },
      ),
      4.5,
      1.9,
      65.54,
      2.6,
      1.5,
      "N",
    );
    // barber chair + mirror + mug shelf
    b.box(m.leatherRed, 6.7, 0.5, 62.2, 7.5, 1.0, 63.0);
    b.box(m.leatherRed, 6.7, 1.0, 63.0, 7.5, 1.9, 63.25, { collide: false });
    b.box(m.woodDark, 6.8, 0, 62.3, 7.4, 0.5, 62.9);
    b.decal(signMat([""], 0.9, 1.3, { bg: "#b7c4c9", fg: "#b7c4c9", border: "#4a3826" }), 8.5, 1.8, 62.6, 0.9, 1.3, "W");
    b.box(m.woodMid, 8.2, 0, 62.0, 8.8, 1.1, 63.2);
    b.decal(signMat(["☕☕☕"], 1.2, 0.4, { bg: "#6d5136", fg: "#efeadb" }), 7.4, 2.2, 65.54, 1.2, 0.4, "N");
    P.stove(b, m, 1.2, 58.2, CEIL);
    b.decal(signMat(["♒"], 0.7, 1.2, { bg: "#ddd2b0", fg: "#6e5030", border: "#8a7a52" }), 0.46, 1.9, 61, 0.7, 1.2, "E");
    P.chair(b, m, 1.4, 61.8, Math.PI / 2);
    warm(4.5, 2.7, 61, 13, 8);
  }

  /* ---------- Livery office ---------- */
  {
    const r = LOTS.livery;
    const d = streetDoor("livery");
    // office is the west half; the rest is the (closed) barn
    wallZ(b, m.woodStage, r.minZ, r.maxZ, 87.4, 0, CEIL, [], 0.2);
    room(m.woodStage, r.minX, r.minZ, 87.4, r.maxZ, {
      gaps: { W: [doorGapOf(d), ...winGaps("livery", "W")] },
    });
    b.box(m.woodMid, 82, 0, 39.2, 84.4, 0.85, 40.3);
    b.decal(signMat(["Harness and Saddlery"], 1.9, 0.45, { bg: "#241d16", fg: "#dfb44e" }), 83.4, 2.5, 38.62, 1.9, 0.45, "S");
    b.decal(signMat(["◔"], 0.45, 0.6, { bg: "#6d5136", fg: "#ddd2b0" }), 85.6, 2.3, 38.62, 0.45, 0.6, "S");
    // horseshoes everywhere
    for (const [hx, hz, f] of [
      [81.2, 39.5, "E"],
      [81.2, 46.4, "E"],
      [84, 47.3, "N"],
      [86, 47.3, "N"],
    ] as const) {
      b.decal(signMat(["U"], 0.35, 0.3, { bg: "#a98e66", fg: "#3a3630" }), f === "E" ? 80.46 : hx, 2.1, f === "E" ? hz : 47.32, 0.35, 0.3, f as "E" | "N");
    }
    // PRIVATE door on the inner wall + WANTED door dressing
    b.decal(signMat([""], 1.15, 2.3, { bg: "#4a3826", fg: "#4a3826", planked: true }), 87.28, 1.2, 45, 1.15, 2.3, "W");
    b.decal(signMat(["PRIVATE"], 0.85, 0.3, { bg: "#e6dcba", fg: "#33261a" }), 87.27, 1.95, 45, 0.85, 0.3, "W");
    b.decal(posterMat("wanted2"), 87.28, 1.5, 42.6, 0.8, 1.05, "W");
    P.stove(b, m, 81.7, 46.6, CEIL);
    P.bench(b, m, 84.6, 38.9, 1.6, "S");
    P.barrel(b, m, 86.6, 39.2, 0.4, 0.85);
    b.cyl(m.brass, 86.4, 44.4, 0, 0.3, 0.15, { seg: 8 });
    P.chair(b, m, 83, 41.2, 0.4);
    warm(84, 2.7, 45, 14, 9);
  }

  /* ---------- Mission courtyard + school + padre ---------- */
  {
    const r = LOTS.mission;
    const school = interiorDoor("school");
    const padre = interiorDoor("padre");
    // courtyard: terracotta floor, arcade ring, three-tier fountain
    b.flat(m.floorTile, r.minX + 0.5, r.minZ + 0.5, r.maxX - 0.5, r.maxZ - 0.5, 0.05);
    // inner rooms wall (school + padre block) with the school doors
    wallX(b, m.adobeMission, 34.5, 65.5, 1, 0, 4.4, [doorGapOf(school, 0.15)], 0.4);
    wallZ(b, m.adobeMission, -9, 1, 42, 0, 3.4, [doorGapOf(padre, 0.1)], 0.3);
    // arcade piers around the open centre (sky above the middle)
    const piers: [number, number][] = [];
    for (const px of [40, 46, 52, 58, 64]) {
      piers.push([px, 5.5], [px, 20.5]);
    }
    for (const pz of [10.5, 15.5]) {
      piers.push([40, pz], [64, pz]);
    }
    for (const [px, pz] of piers) {
      b.box(m.adobeMission, px - 0.5, 0, pz - 0.5, px + 0.5, 3.4, pz + 0.5);
    }
    // arcade roofs (flat adobe slabs) leaving the centre open to the sky
    b.box(m.adobeMission, r.minX + 0.4, 3.9, 1, r.maxX - 0.4, 4.25, 6);
    b.box(m.adobeMission, r.minX + 0.4, 3.9, 20, r.maxX - 0.4, 4.25, r.maxZ - 0.4);
    b.box(m.adobeMission, r.minX + 0.4, 3.9, 6, 40.5, 4.25, 20);
    b.box(m.adobeMission, 63.5, 3.9, 6, r.maxX - 0.4, 4.25, 20);
    // three-tier fountain at the centre
    const fx = 52;
    const fz = 12.5;
    b.cyl(m.wellStone, fx, fz, 0, 0.75, 2.1, { seg: 14, collide: true });
    b.cyl(m.glassCold, fx, fz, 0.62, 0.68, 1.85, { seg: 14 });
    b.cyl(m.wellStone, fx, fz, 0.75, 1.7, 0.35, { seg: 10 });
    b.cyl(m.wellStone, fx, fz, 1.7, 1.95, 1.05, { seg: 12 });
    b.cyl(m.wellStone, fx, fz, 1.95, 2.7, 0.22, { seg: 8 });
    b.cyl(m.wellStone, fx, fz, 2.7, 2.9, 0.55, { seg: 10 });
    // shrine niche + cross on the south wall, sun disks inside
    b.box(m.adobeMission, 57.5, 0, r.maxZ - 1.1, 59.5, 3.0, r.maxZ - 0.5, { collide: true });
    b.box(m.woodDark, 58.35, 3.0, r.maxZ - 0.85, 58.65, 3.7, r.maxZ - 0.75, { collide: false });
    b.box(m.woodDark, 58.1, 3.35, r.maxZ - 0.85, 58.9, 3.5, r.maxZ - 0.75, { collide: false });
    b.decal(m.sunFace, 46, 2.6, r.maxZ - 0.72, 1.1, 1.1, "N");
    b.decal(m.sunFace, 62, 2.6, r.maxZ - 0.72, 1.1, 1.1, "N");
    // benches + pots + a leaning wheel
    P.bench(b, m, 42, 8, 1.8, "E");
    P.bench(b, m, 62, 17, 1.8, "W");
    P.bench(b, m, 52, 21.5, 1.8, "N");
    P.potPlant(b, m, 41, 13);
    P.potPlant(b, m, 63, 8.5);
    P.wagonWheel(b, m, 48.5, 0, 21.6, 0.7, 0.25);
    warm(52, 3.0, 18, 10, 10);

    // school: chairs, teacher table, blackboards, arched windows N
    room(m.adobeMission, LOTS.school.minX, LOTS.school.minZ, LOTS.school.maxX, LOTS.school.maxZ, {
      floor: m.dirt,
      ceilY: 3.2,
      gaps: { S: [doorGapOf(school, 0.15)], W: [doorGapOf(padre, 0.1)] },
    });
    b.box(m.woodDark, 44, 0, -7.8, 47, 0.8, -6.6);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        P.chair(b, m, 45.5 + col * 2.6 + (row % 2) * 0.6, -5.2 + row * 1.8, 0.15 * ((row + col) % 3) - 0.1);
      }
    }
    b.decal(signMat([""], 2.4, 1.4, { bg: "#1c1f1a", fg: "#1c1f1a", border: "#4a3826" }), 45, 1.9, -8.74, 2.4, 1.4, "S");
    b.decal(signMat(["A B C"], 1.4, 1.0, { bg: "#1c1f1a", fg: "#cfc4a6", border: "#4a3826" }), 52.5, 1.9, -8.74, 1.4, 1.0, "S");
    b.decal(signMat(["✝"], 0.5, 0.8, { bg: "#e6dabf", fg: "#4a3826" }), 50.2, 2.2, -8.74, 0.5, 0.8, "S");
    b.decal(signMat(["♕"], 0.7, 0.9, { bg: "#8a6f52", fg: "#e6dabf", border: "#6b5b3c" }), 48.5, 2.2, -8.74, 0.7, 0.9, "S");
    b.decal(m.winCold, 47, 2.3, -8.72, 0.8, 1.1, "S");
    b.decal(m.winCold, 56, 2.3, -8.72, 0.8, 1.1, "S");
    warm(52, 2.8, -4, 12, 10);

    // padre: ladder to the tower hatch, cot, cross, altar
    room(m.adobeMission, LOTS.padre.minX, LOTS.padre.minZ, LOTS.padre.maxX, LOTS.padre.maxZ, {
      floor: m.dirt,
      ceilY: 3.2,
      gaps: { E: [doorGapOf(padre, 0.1)] },
    });
    // ladder + hatch
    for (let i = 0; i < 7; i += 1) {
      b.box(m.woodDark, 37.6, 0.35 + i * 0.42, -8.62, 38.4, 0.42 + i * 0.42, -8.54, { collide: false });
    }
    b.box(m.woodDark, 37.55, 0, -8.66, 37.65, 3.2, -8.56, { collide: false });
    b.box(m.woodDark, 38.35, 0, -8.66, 38.45, 3.2, -8.56, { collide: false });
    // dark tower hatch in the ceiling above the ladder
    b.box(m.woodBlack, 37.4, 3.06, -8.7, 38.6, 3.19, -7.6, { collide: false });
    b.box(m.woodDark, 35.2, 0, -3.4, 36.9, 0.5, -1.6);
    b.box(m.white, 35.3, 0.5, -3.3, 36.8, 0.62, -1.7, { collide: false });
    b.decal(signMat(["✝"], 0.6, 1.0, { bg: "#e6dabf", fg: "#4a3826" }), 36, 2.0, -1.06, 0.6, 1.0, "N");
    // altar chest with sun cloth + bowls
    b.box(m.woodBlack, 39.2, 0, -8.3, 40.6, 0.9, -7.2);
    b.decal(m.sunFace, 39.9, 1.7, -8.55, 0.8, 0.8, "S");
    b.cyl(m.iron, 39.5, -7.0, 0.9, 1.0, 0.14, { seg: 8 });
    b.cyl(m.iron, 40.3, -7.0, 0.9, 1.0, 0.14, { seg: 8 });
    b.decal(signMat(["♢"], 0.8, 1.1, { bg: "#5a6b8a", fg: "#cfd8e8", border: "#4a3826" }), 34.42, 2.1, -5, 0.8, 1.1, "E");
    warm(38, 2.5, -5, 8, 7);
  }

  /* ---------- Cactus Bed Hotel: lobby + dining + upper ---------- */
  {
    const r = LOTS.hotel;
    const d = streetDoor("hotel");
    const roomDoor = interiorDoor("hotRoom");
    room(m.wpHotel, r.minX, r.minZ, r.maxX, r.maxZ, {
      wainscot: m.woodSaloon,
      ceilY: 3.4,
      ceil: null,
      gaps: {
        W: [doorGapOf(d), ...winGaps("hotel", "W").filter((g) => g.bottom < 3)],
        S: winGaps("hotel", "S").filter((g) => g.bottom < 3),
      },
    });
    // upper floor slab minus the stairwell (NE corner)
    b.box(m.floorWood, r.minX, 3.4, r.minZ, 67.7, STOREY, r.maxZ);
    b.box(m.floorWood, 67.7, 3.4, 38.8, r.maxX, STOREY, r.maxZ);
    b.box(m.floorWood, 71.5, 3.4, r.minZ, r.maxX, STOREY, 38.8);
    // front desk with ledger + bell, key board + PRIVATE door behind
    b.box(m.woodSaloon, 59.4, 0, 33.2, 63.8, 1.1, 34.4);
    b.flat(m.woodDark, 59.3, 33.1, 63.9, 34.5, 1.12);
    b.box(m.white, 61.2, 1.12, 33.6, 61.9, 1.17, 34.1, { collide: false });
    b.sphere(m.brass, 62.6, 1.24, 33.9, 0.09, 8);
    b.decal(signMat(["⚿ ⚿ ⚿ ⚿"], 1.6, 0.8, { bg: "#6d5136", fg: "#dfb44e", border: "#4a3826" }), 61.5, 2.2, 32.46, 1.6, 0.8, "S");
    b.decal(signMat([""], 1.15, 2.3, { bg: "#3a2b1f", fg: "#3a2b1f", planked: true }), 64.8, 1.2, 32.47, 1.15, 2.3, "S");
    b.decal(signMat(["PRIVATE"], 0.8, 0.28, { bg: "#e6dcba", fg: "#33261a" }), 64.8, 1.95, 32.48, 0.8, 0.28, "S");
    b.decal(
      signMat(["THE CACTUS BED", "no spurs in bed", "no shooting the lamps", "settle up saturdays"], 1.7, 1.4, {
        bg: "#6d5136",
        fg: "#e6dcba",
        border: "#4a3826",
      }),
      66.8,
      2.0,
      32.46,
      1.7,
      1.4,
      "S",
    );
    // grandfather clock + posters by the door
    b.box(m.woodSaloon, 56.55, 0, 32.55, 57.15, 2.4, 33.25);
    b.decal(posterMat("repent"), 56.46, 2.0, 37.7, 0.8, 1.05, "E");
    // wagon-wheel chandelier
    b.cyl(m.iron, 62, 40, 3.0, 3.08, 1.1, { seg: 12, collide: false });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      b.box(m.glassWarm, 62 + Math.cos(a) * 1.0 - 0.05, 3.08, 40 + Math.sin(a) * 1.0 - 0.05, 62 + Math.cos(a) * 1.0 + 0.05, 3.3, 40 + Math.sin(a) * 1.0 + 0.05, { collide: false });
    }
    // dining east half: tables, china hutch, fireplace, sofa, drapes
    P.tableRound(b, m, 66.5, 40.5, 0.8);
    P.chair(b, m, 65.5, 41.3, 2.2);
    P.chair(b, m, 67.4, 39.8, -0.7);
    P.tableRound(b, m, 68.5, 44.5, 0.75);
    P.chair(b, m, 69.4, 45.2, -2.2);
    b.box(m.woodSaloon, 71.0, 0, 40.0, 71.7, 2.4, 43.4);
    b.decal(signMat(["◍◍◍", "◍◍◍"], 1.8, 1.4, { bg: "#3a2b1f", fg: "#efeadb" }), 70.94, 1.6, 41.7, 1.8, 1.4, "W");
    b.box(m.brickBank, 64.8, 0, 47.0, 67.2, 2.6, 47.75);
    b.box(m.iron, 65.3, 0.1, 46.9, 66.7, 1.1, 47.1, { collide: false });
    b.box(m.leatherRed, 62.2, 0.3, 46.4, 64.2, 1.1, 47.3);
    b.box(m.curtainRed, 67.5, 0.2, 47.45, 68.9, 3.0, 47.7, { collide: false });
    b.box(m.curtainRed, 71.45, 0.2, 36.5, 71.7, 3.0, 37.9, { collide: false });
    // stairs NE, rising north against the east wall
    b.stairs(m.woodSaloon, 68.1, 38.6, 3.3, STOREY, 4.9, "N");
    P.balustrade(b, m, 68.0, 38.75, 68.0, 33.8, 3.7);
    warm(62, 3.0, 40, 18, 11);
    warm(67, 2.9, 44, 14, 9);

    // upper hall + rooms
    const up = STOREY;
    room(m.wpHotel, r.minX, r.minZ, r.maxX, r.maxZ, {
      y0: up,
      floor: null,
      ceilY: up + 2.9,
      ceil: m.woodSaloon,
      gaps: {
        E: [{ from: 34, to: 38.6, top: up + 2.9 }],
        W: winGaps("hotel", "W").filter((g) => g.bottom > 3),
        S: winGaps("hotel", "S").filter((g) => g.bottom > 3),
      },
    });
    // rooms N + S of the E-W hall (hall z 38.8..41.8)
    wallX(b, m.wpHotel, r.minX + 0.3, 67.7, 38.8, up, up + 2.9, [doorGapOf(roomDoor, 0.08)], 0.2);
    wallX(b, m.wpHotel, r.minX + 0.3, r.maxX - 0.3, 41.8, up, up + 2.9, [
      { from: 60.4, to: 61.6, top: up + 2.42 },
      { from: 66.4, to: 67.6, top: up + 2.42 },
    ], 0.2);
    // numbered doors: real Room 2 (N side) + scenery 1/3/4
    b.decal(signMat(["1"], 1.1, 2.3, { bg: "#3a2b1f", fg: "#dfb44e", planked: true }), 63.9, up + 1.25, 39.0, 1.1, 2.3, "S");
    b.decal(signMat(["3"], 1.1, 2.3, { bg: "#3a2b1f", fg: "#dfb44e", planked: true }), 61, up + 1.25, 41.6, 1.1, 2.3, "N");
    b.decal(signMat(["4"], 1.1, 2.3, { bg: "#3a2b1f", fg: "#dfb44e", planked: true }), 67, up + 1.25, 41.6, 1.1, 2.3, "N");
    // red curtain at the hall's west end + elk head over the stairwell
    b.box(m.curtainRed, 56.55, up + 0.2, 39.35, 56.8, up + 2.7, 40.35, { collide: false });
    b.box(m.woodMid, 71.2, up + 1.9, 36.2, 71.42, up + 2.5, 36.9, { collide: false });
    b.cone(m.woodStage, 71.05, 36.55, up + 2.0, up + 2.4, 0.2, 6);
    b.flat(m.rug, 57.5, 39.2, 67.5, 41.4, up + 0.05, { texWorld: 1.5 });
    warm(62, up + 2.5, 40.3, 12, 9);
    warm(69, up + 2.5, 36, 10, 7);

    // your room (Room 2): bed, red curtain, mirror stand, washbowl
    room(m.wpHotel, 56.3, 32.3, 62.5, 38.8, {
      y0: up,
      ceilY: up + 2.9,
      ceil: null,
      gaps: {
        S: [doorGapOf(roomDoor, 0.08)],
        W: winGaps("hotel", "W").filter((g) => g.bottom > 3),
      },
    });
    b.box(m.woodSaloon, 57, up, 33.0, 59.2, up + 0.6, 36.4);
    b.box(m.rug, 57.05, up + 0.5, 33.2, 59.15, up + 0.72, 36.3, { collide: false });
    b.box(m.woodSaloon, 57, up, 32.8, 59.2, up + 1.2, 33.05, { collide: false });
    b.box(m.curtainRed, 56.55, up + 0.4, 34.45, 56.8, up + 2.6, 35.55, { collide: false });
    b.box(m.woodMid, 61.2, up, 33.0, 62.1, up + 1.0, 33.6);
    b.decal(signMat([""], 0.7, 1.1, { bg: "#b7c4c9", fg: "#b7c4c9", border: "#4a3826" }), 61.65, up + 1.7, 33.66, 0.7, 1.1, "S");
    b.cyl(m.white, 61.4, 34.3, up + 1.0, up + 1.2, 0.12, { seg: 8 });
    P.chair(b, m, 60.6, 36.8, 2.6);
    warm(59, up + 2.4, 35, 10, 7);
  }

  /* ---------- Mayor's mansion (footprint z 57..75, gate-aligned) ---------- */
  {
    const r = LOTS.mansion;
    const front = interiorDoor("mayorFront");
    const study = interiorDoor("mayorStudy");
    const dine = interiorDoor("mayorDine");
    const bed = interiorDoor("mayorBed");
    // hall (z 63..69) with grand stairs rising east
    room(m.wpMayHall, r.minX, 63, 97, 69, {
      ceilY: 3.4,
      ceil: null,
      gaps: {
        W: [doorGapOf(front, 0.08)],
        N: [doorGapOf(study, 0.08)],
        S: [doorGapOf(dine, 0.08)],
        E: [{ from: 63.5, to: 66.5, top: 3.4 }],
      },
    });
    // upper slab with a stairwell hole over the stairs (x 92..97, z 63.4..66.4)
    b.box(m.floorWood, r.minX, 3.4, r.minZ, r.maxX, STOREY, 63.4);
    b.box(m.floorWood, r.minX, 3.4, 66.4, r.maxX, STOREY, r.maxZ);
    b.box(m.floorWood, r.minX, 3.4, 63.4, 92, STOREY, 66.4);
    b.box(m.floorWood, 97, 3.4, 63.4, r.maxX, STOREY, 66.4);
    b.stairs(m.woodSaloon, 92.3, 63.7, 2.6, STOREY, 4.6, "E");
    P.balustrade(b, m, 92.2, 66.5, 97, 66.5, 3.7);
    P.balustrade(b, m, 92.1, 63.5, 92.1, 66.5, 3.7);
    // hall dressing: mirror, HOME SWEET HOME, plants, wardrobe
    b.decal(signMat([""], 0.8, 1.6, { bg: "#b7c4c9", fg: "#b7c4c9", border: "#4a3826" }), 87.5, 1.6, 63.26, 0.8, 1.6, "S");
    b.decal(
      signMat(["HOME SWEET HOME"], 1.2, 0.5, { bg: "#e6dcba", fg: "#7e1f1c", border: "#6b5b3c" }),
      89,
      2.0,
      68.74,
      1.2,
      0.5,
      "N",
    );
    P.potPlant(b, m, 86.8, 67.8);
    P.coatRack(b, m, 87.2, 64);
    b.box(m.woodSaloon, 90.5, 0, 68.0, 92.3, 2.3, 68.7);
    b.flat(m.rug, 87, 64.5, 92, 67.5, 0.06, { texWorld: 1.5 });
    warm(89.5, 3.0, 66, 15, 9);

    // study (north of hall): fireplace, bookcases, drapes, cow painting
    room(m.wpMayHall, r.minX, r.minZ, 96, 63, {
      gaps: { S: [doorGapOf(study, 0.08)], W: winGaps("mansion", "W").filter((g) => g.bottom < 3) },
    });
    b.box(m.marble, 90.6, 0, 57.35, 92.4, 1.4, 57.85);
    b.box(m.iron, 91.0, 0.1, 57.3, 92.0, 0.9, 57.6, { collide: false });
    b.decal(signMat(["▮"], 0.9, 1.2, { bg: "#241d16", fg: "#8a6f52", border: "#b08d3f" }), 91.5, 2.3, 57.9, 0.9, 1.2, "S");
    b.decal(signMat(["▤▤▤", "▤▤▤", "▤▤▤"], 2.6, 2.2, { bg: "#3a2b1f", fg: "#a3874a" }), 95.66, 1.7, 60, 2.6, 2.2, "W");
    b.decal(signMat(["🐄"], 1.5, 1.0, { bg: "#8a7a52", fg: "#e6dcba", border: "#b08d3f" }), 94.2, 2.1, 57.66, 1.5, 1.0, "S");
    b.box(m.curtainRed, 88.2, 0.2, 57.32, 89.6, 2.9, 57.55, { collide: false });
    b.box(m.leatherRed, 92.5, 0.3, 60.5, 94.5, 1.05, 61.4);
    b.cyl(m.brass, 89.2, 59.4, 0, 0.75, 0.25, { seg: 8, collide: true });
    lights.push({ x: 89.2, y: 1.2, z: 59.4, color: 0xa8d8a0, intensity: 6, distance: 4 });
    warm(91.5, 2.9, 60, 13, 8);

    // dining (south of hall): long table + pie, chandelier, hutch
    room(m.wpMayHall, r.minX, 69, 96, r.maxZ, {
      gaps: { N: [doorGapOf(dine, 0.08)], W: winGaps("mansion", "W").filter((g) => g.bottom < 3) },
    });
    b.box(m.woodSaloon, 89, 0, 70.8, 94, 0.82, 72.6);
    b.flat(m.white, 89.3, 71.1, 93.7, 72.3, 0.84);
    b.cyl(m.woodStage, 91.5, 71.7, 0.84, 1.05, 0.3, { seg: 9 });
    for (const [cx2, cz2, ra] of [
      [89.5, 70.2, 0],
      [91.5, 70.2, 0],
      [93.5, 70.2, 0],
      [89.5, 73.2, Math.PI],
      [91.5, 73.2, Math.PI],
      [93.5, 73.2, Math.PI],
    ] as const) {
      P.chair(b, m, cx2, cz2, ra);
    }
    b.cyl(m.brass, 91.5, 71.7, 2.75, 2.9, 0.8, { seg: 10, collide: false });
    b.box(m.woodSaloon, 87.3, 0, 73.05, 88.0, 2.4, 74.55);
    b.decal(signMat(["◍◍◍", "◍◍◍"], 1.3, 1.6, { bg: "#3a2b1f", fg: "#efeadb" }), 88.04, 1.5, 73.8, 1.3, 1.6, "E");
    b.box(m.curtainRed, 95.4, 0.2, 71, 95.66, 2.9, 72.4, { collide: false });
    b.decal(signMat(["✿"], 1.1, 0.8, { bg: "#57683f", fg: "#c9a24a", border: "#b08d3f" }), 91.5, 2.3, 74.72, 1.1, 0.8, "N");
    warm(91.5, 2.6, 71.7, 15, 8);

    // upper landing (hall + south half) + bedroom north
    const up = STOREY;
    room(m.wpMayHall, r.minX, 63, r.maxX - 0.3, r.maxZ - 0.3, {
      y0: up,
      floor: null,
      ceilY: up + 2.9,
      ceil: m.woodDark,
      gaps: {
        N: [doorGapOf(bed, 0.08)],
        W: winGaps("mansion", "W").filter((g) => g.bottom > 3 && g.from > 63),
      },
    });
    // butterfly/insect frames + clock on the landing
    b.decal(signMat(["🦋"], 0.7, 0.9, { bg: "#e6dcba", fg: "#8a6f52", border: "#6b5b3c" }), 86.68, up + 1.9, 65.5, 0.7, 0.9, "E");
    b.decal(signMat(["🪲"], 0.7, 0.9, { bg: "#e6dcba", fg: "#4a5138", border: "#6b5b3c" }), 86.68, up + 1.9, 67, 0.7, 0.9, "E");
    b.box(m.woodSaloon, 94.8, up, 70.8, 95.4, up + 2.3, 71.5);
    b.box(m.woodMid, 88.6, up, 69.8, 90.2, up + 0.75, 70.5);
    b.cyl(m.glassCold, 89.4, 70.15, up + 0.75, up + 1.15, 0.14, { seg: 8 });
    warm(91, up + 2.5, 66, 12, 9);
    // bedroom north: green wallpaper + canopy bed
    room(m.wpMayRoom, r.minX, r.minZ + 0.3, 96, 63, {
      y0: up,
      ceilY: up + 2.9,
      ceil: m.woodDark,
      gaps: {
        S: [doorGapOf(bed, 0.08)],
        W: winGaps("mansion", "W").filter((g) => g.bottom > 3 && g.to < 63),
      },
    });
    b.box(m.woodSaloon, 90.4, up, 57.6, 93.2, up + 0.7, 61.2);
    b.box(m.quiltGreen, 90.5, up + 0.6, 57.9, 93.1, up + 0.85, 61.1, { collide: false });
    b.box(m.woodSaloon, 90.4, up, 57.4, 93.2, up + 1.6, 57.7, { collide: false });
    // canopy posts + tester
    for (const [px2, pz2] of [
      [90.5, 57.7],
      [93.1, 57.7],
      [90.5, 61.0],
      [93.1, 61.0],
    ] as const) {
      b.box(m.woodSaloon, px2 - 0.07, up, pz2 - 0.07, px2 + 0.07, up + 2.3, pz2 + 0.07, { collide: false });
    }
    b.box(m.curtainRed, 90.3, up + 2.3, 57.5, 93.3, up + 2.45, 61.2, { collide: false });
    b.box(m.woodSaloon, 94.2, up, 58, 95.3, up + 2.1, 59.6); // armoire
    b.box(m.marble, 88.5, up, 59, 89.6, up + 0.8, 60.2);
    warm(91.8, up + 2.4, 59.5, 11, 8);
  }

  b.build(group);
  return { group, builder: b, lights };
}
