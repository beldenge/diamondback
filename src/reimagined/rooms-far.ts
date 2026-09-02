/**
 * The outlying interiors: The Rattler's front office, Sidewinder's
 * parlour, the mission (patio with its arcades, the schoolhouse and
 * the padre's room) and the mayor's mansion on both floors.
 */
import * as THREE from "three";
import { LOTS, PATIO, SHAFT, SHAFT_HOLE, STOREY, WALL_T, streetDoor, winGaps } from "./layout";
import * as P from "./props";
import type { Ctx } from "./interiors";

const IN = WALL_T;

export function buildFarRooms(c: Ctx): void {
  buildRattler(c);
  buildSidewinder(c);
  buildMission(c);
  buildMansion(c);
}

/* ------------------------------------------------------------------ */
/* The Rattler — `_PAPER` 1×2 @1.9: a tiny green front office with the */
/* editor's desk south, blinds on the street window, press room west.  */

function buildRattler(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.rattler;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const partX = 20;
  const x0 = partX + 0.1;
  const d = streetDoor("rattler");
  const ceilY = 3.2;
  c.partZ(m.rattlerGreen, z0, z1, partX, 0, ceilY);
  c.lining(m.rattlerGreen, x0, z0, x1, z1, {
    ceilY,
    wainscot: m.woodSaloon,
    wainscotH: 0.9,
    gaps: { E: [c.gapOf(d, 0.12), ...winGaps("rattler", "E")] },
  });
  // blind half-drawn over the street window
  b.decal(P.pictureMat("blind", 96, 64), x1 - 0.14, 2.28, 57.9, 1.85, 0.85, "W");
  // editor's desk against the south wall
  P.desk(b, m, 21.9, z1 - 0.55, 1.8, 0.9, m.woodSaloon);
  b.decal(c.signMat(["EDITOR"], 0.6, 0.18, { bg: "#3c2c10", fg: "#dfb44e" }), 21.9, 0.5, z1 - 1.0 - 0.012, 0.6, 0.18, "N");
  P.chair(b, m, 21.9, z1 - 1.4, -Math.PI / 2);
  b.box(m.paper, 21.4, 0.8, z1 - 0.8, 22.0, 0.81, z1 - 0.4, { collide: false });
  b.cyl(m.iron, 22.5, z1 - 0.5, 0.8, 0.9, 0.04, { seg: 6 });
  P.pictureFrame(b, m, 22.7, 2.15, z1, 0.5, 0.65, "N", "portrait", { frame: m.woodDark, px: 96, py: 128 });
  P.pictureFrame(b, m, 21.1, 2.15, z1, 0.85, 0.6, "N", "certificate", { frame: m.woodDark });
  P.sconce(b, m, 23.3, 2.2, z1 - 0.06, "N");
  // giant front pages pinned across the north wall
  P.pictureFrame(b, m, 21.0, 2.05, z0, 1.1, 1.4, "S", "newspaper", { frame: m.woodDark, px: 96, py: 128 });
  P.pictureFrame(b, m, 22.6, 2.05, z0, 1.1, 1.4, "S", "newspaper", { frame: m.woodDark, px: 96, py: 128 });
  // press-room door on the partition, galley strips beside it
  P.fakeDoor(b, m, x0, 0, 59.3, 1.2, 2.3, "E");
  b.decal(c.signMat(["PRINTING PRESS", "AUTHORIZED USE ONLY"], 1.0, 0.46, { bg: "#c9b98a", fg: "#33261a" }), x0 + 0.09, 1.75, 59.3, 1.0, 0.46, "E");
  for (const gz of [57.2, 57.75, 60.85, 61.4]) {
    b.decal(P.pictureMat("galley", 32, 128), x0 + 0.012, 1.95, gz, 0.34, 1.3, "E");
  }
  P.coatRack(b, m, 23.0, 57.0);
  P.hangLamp(b, m, 21.9, 59.3, ceilY, { drop: 0.7 });
  c.warm(21.9, 2.6, 59.3, 13, 8);
}

/* ------------------------------------------------------------------ */
/* Sidewinder — `_UNDERTAK` one tile @2.25 filmed with its door west;  */
/* the shop faces Neely, so the plan is turned: stove east, coffin on  */
/* trestles south, barber chair + mirror + price board west.           */

function buildSidewinder(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.sidewinder;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const d = streetDoor("sidewinder");
  const ceilY = 3.2;
  c.lining(m.woodMid, x0, z0, x1, z1, {
    ceilY,
    gaps: { N: [c.gapOf(d, 0.12), ...winGaps("sidewinder", "N")] },
  });
  // stove + chair east
  P.stove(b, m, x1 - 0.5, 57.3, ceilY);
  P.chair(b, m, x1 - 0.6, 58.7, Math.PI);
  // coffin on trestles along the south wall, a spare leaning in the corner
  for (const tx of [3.2, 5.0]) {
    b.box(m.woodDark, tx - 0.25, 0, z1 - 0.95, tx + 0.25, 0.7, z1 - 0.25);
  }
  P.coffin(b, m, 4.1, z1 - 0.6, 0);
  b.solid({ minX: 3.0, minY: 0, minZ: z1 - 1.0, maxX: 5.2, maxY: 1.2, maxZ: z1 - 0.2 });
  P.coffin(b, m, x1 - 0.5, z1 - 0.4, 0.35, true);
  P.pictureFrame(b, m, 6.2, 2.05, z1, 0.5, 0.65, "N", "skeleton", { frame: m.woodDark, px: 96, py: 128 });
  P.washstand(b, m, 1.7, z1, "N");
  // barber corner west: chair, mirror, price board, mug shelf
  b.box(m.woodDark, 1.35, 0, 58.65, 1.95, 0.5, 59.35);
  b.box(m.leatherRed, 1.25, 0.5, 58.6, 2.05, 1.0, 59.4);
  b.box(m.leatherRed, 1.25, 1.0, 58.6, 1.5, 1.9, 59.4, { collide: false });
  b.box(m.brass, 1.4, 0.3, 59.4, 2.1, 0.36, 59.7, { collide: false }); // footrest
  P.pictureFrame(b, m, x0, 1.85, 59.0, 0.8, 1.1, "E", "mirror", { frame: m.woodDark, px: 64, py: 96 });
  b.decal(
    c.signMat(
      ["HAIR CUTS 25¢ · SHAVE 25¢", "CLOSE SHAVE 50¢", "HEADSTONES $5 · PLOTS $10", "MOURNERS $1 EACH"],
      1.3,
      0.95,
      { bg: "#22301f", fg: "#d8e0b0", border: "#101810" },
    ),
    x0 + 0.012,
    2.25,
    57.4,
    1.3,
    0.95,
    "E",
  );
  P.shelfUnit(b, m, x0, 1.3, 60.7, 0.9, 0.5, 0.22, "E", "jars", 1, m.woodMid);
  b.box(m.brass, x0 + 0.05, 1.45, 60.2, x0 + 0.1, 1.5, 61.2, { collide: false });
  b.decal(m.white, x0 + 0.11, 1.2, 60.7, 0.4, 0.5, "E"); // towel
  P.hangLamp(b, m, 4, 59, ceilY, { drop: 0.7 });
  c.warm(4, 2.6, 59, 13, 8);
}

/* ------------------------------------------------------------------ */
/* Mission — `_COURT` 3×3 @5.5 around the fountain, arcades of round   */
/* arches on all four sides with stepped parapets against the sky,    */
/* the schoolhouse (`_SCHOOL`) across the north, the padre's room      */
/* (`_PADRE`) under the tower at the north-west.                       */

function buildMission(c: Ctx): void {
  const { b, m } = c;
  const school = c.door("school");
  const padre = c.door("padre");
  const p = PATIO;
  const outerS = LOTS.mission.maxZ - 0.25; // inner face of the front wall
  const wallTop = 4.8;
  const roofY = 4.0;
  // patio enclosure: west, east and north walls (the front wall is the shell)
  c.partZ(m.adobeMission, p.minZ, outerS, p.minX, 0, wallTop, [], 0.5);
  c.partZ(m.adobeMission, p.minZ, outerS, p.maxX, 0, wallTop, [], 0.5);
  c.partX(m.adobeMission, p.minX, p.maxX, p.minZ, 0, wallTop, [c.gapOf(school, 0.15)], 0.5);
  // brick floor with the shaft mouth cut out
  b.flat(m.floorBrick, p.minX, p.minZ, p.maxX, SHAFT_HOLE.minZ, 0.04);
  b.flat(m.floorBrick, p.minX, SHAFT_HOLE.maxZ, p.maxX, outerS, 0.04);
  b.flat(m.floorBrick, p.minX, SHAFT_HOLE.minZ, SHAFT_HOLE.minX, SHAFT_HOLE.maxZ, 0.04);
  b.flat(m.floorBrick, SHAFT_HOLE.maxX, SHAFT_HOLE.minZ, p.maxX, SHAFT_HOLE.maxZ, 0.04);
  // the mouth is round: a washer of brick fills the square cut-out's corners
  const washer = new THREE.RingGeometry(SHAFT.r, SHAFT.r * 1.48, 28);
  washer.rotateX(-Math.PI / 2);
  washer.translate(SHAFT.x, 0.046, SHAFT.z);
  b.mesh(m.floorBrick, washer);
  // the arcades: four lines of arches around the open centre
  const ax0 = 44.5;
  const ax1 = 59.5;
  const az0 = 5.5;
  const az1 = 19.5;
  // five bays a side so an arch, not a pier, sits on the entry axis
  // (the film looks through the middle arch at the fountain)
  const bays = 5;
  const archLine = (along: "x" | "z", from: number, to: number, fixed: number): void => {
    const len = to - from;
    for (let i = 0; i < bays; i += 1) {
      const u0 = from + (len * i) / bays;
      const u1 = from + (len * (i + 1)) / bays;
      b.archWall(m.adobeMission, along, u0, u1, fixed, 0, roofY, (u0 + u1) / 2, 2.2, 3.55, 0.6);
    }
  };
  archLine("x", ax0, ax1, az1);
  archLine("x", ax0, ax1, az0);
  archLine("z", az0, az1, ax0);
  archLine("z", az0, az1, ax1);
  // arcade roofs (adobe slabs on beams) + the stepped parapet above the arches
  const strip = (x0: number, z0: number, x1: number, z1: number): void => {
    b.box(m.adobeMission, x0, roofY, z0, x1, roofY + 0.4, z1, { collide: false });
    const alongX = x1 - x0 > z1 - z0;
    const n = Math.round((alongX ? x1 - x0 : z1 - z0) / 1.3);
    for (let i = 1; i < n; i += 1) {
      const t = i / n;
      if (alongX) {
        const bx = x0 + (x1 - x0) * t;
        b.box(m.woodDark, bx - 0.1, roofY - 0.22, z0, bx + 0.1, roofY, z1, { collide: false });
      } else {
        const bz = z0 + (z1 - z0) * t;
        b.box(m.woodDark, x0, roofY - 0.22, bz - 0.1, x1, roofY, bz + 0.1, { collide: false });
      }
    }
  };
  strip(p.minX, az1, p.maxX, outerS);
  strip(p.minX, p.minZ, p.maxX, az0);
  strip(p.minX, az0, ax0, az1);
  strip(ax1, az0, p.maxX, az1);
  const parapet = (x0: number, z0: number, x1: number, z1: number): void => {
    b.box(m.adobeMission, x0, roofY + 0.4, z0, x1, roofY + 1.0, z1, { collide: false });
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    const n = Math.round(len / 3.0);
    for (let i = 0; i <= n; i += 1) {
      const u = (alongX ? x0 : z0) + (len * i) / n;
      if (alongX) {
        b.box(m.adobeMission, u - 0.45, roofY + 1.0, z0 - 0.05, u + 0.45, roofY + 1.5, z1 + 0.05, { collide: false });
      } else {
        b.box(m.adobeMission, x0 - 0.05, roofY + 1.0, u - 0.45, x1 + 0.05, roofY + 1.5, u + 0.45, { collide: false });
      }
    }
    b.box(m.tileRed, x0 - 0.1, roofY + 1.5, z0 - 0.1, x1 + 0.1, roofY + 1.62, z1 + 0.1, { collide: false });
  };
  parapet(ax0 - 0.3, az1 - 0.3, ax1 + 0.3, az1 + 0.3);
  parapet(ax0 - 0.3, az0 - 0.3, ax1 + 0.3, az0 + 0.3);
  parapet(ax0 - 0.3, az0, ax0 + 0.3, az1);
  parapet(ax1 - 0.3, az0, ax1 + 0.3, az1);
  // sun discs on the entry piers and beside the doors, benches, pots, wheel
  P.sunDisc(b, m, 47.5, 2.7, az1 - 0.3, "N", 0.42);
  P.sunDisc(b, m, 56.5, 2.7, az1 - 0.3, "N", 0.42);
  P.sunDisc(b, m, 47.9, 2.4, outerS, "N", 0.55);
  P.sunDisc(b, m, 56.6, 2.4, outerS, "N", 0.55);
  P.bench(b, m, p.minX + 0.62, 9.0, 1.9, "E");
  P.bench(b, m, p.minX + 0.62, 15.5, 1.9, "E");
  P.bench(b, m, p.maxX - 0.62, 10.0, 1.9, "W");
  P.bench(b, m, p.maxX - 0.62, 16.0, 1.9, "W");
  P.bench(b, m, 45.5, outerS - 0.6, 1.9, "N");
  P.bench(b, m, 58.5, outerS - 0.6, 1.9, "N");
  P.wagonWheel(b, m, 45.4, 0, 19.1, 0.75, 0.2);
  for (const [px, pz] of [
    [43.0, 3.6],
    [61.0, 3.6],
    [43.0, 21.6],
    [61.2, 21.4],
  ] as const) {
    b.cyl(m.brickMayor, px, pz, 0, 0.6, 0.34, { rTop: 0.42, seg: 9, collide: true });
    b.cyl(m.cactus, px, pz, 0.6, 1.5, 0.15, { seg: 6 });
  }
  P.hangLamp(b, m, 52, 4.0, roofY, { drop: 0.7 });
  P.hangLamp(b, m, 52, 21.6, roofY, { drop: 0.7 });
  P.hangLamp(b, m, 43.0, 12.5, roofY, { drop: 0.7 });
  P.hangLamp(b, m, 61.0, 12.5, roofY, { drop: 0.7 });
  c.warm(52, 3.2, 4.2, 9, 8);
  c.warm(52, 3.2, 21.6, 9, 8);
  // the closed wings either side of the patio
  b.box(m.adobeMission, LOTS.mission.minX + 0.3, wallTop - 0.3, LOTS.mission.minZ + 0.3, p.minX, wallTop, outerS + 0.25, { collide: false });
  b.box(m.adobeMission, p.maxX, wallTop - 0.3, LOTS.mission.minZ + 0.3, LOTS.mission.maxX - 0.3, wallTop, outerS + 0.25, { collide: false });
  b.box(m.adobeMission, p.minX, wallTop - 0.3, LOTS.mission.minZ + 0.3, p.maxX, wallTop, p.minZ, { collide: false });

  /* ---- schoolhouse ---- */
  const s = LOTS.school;
  const sx0 = s.minX + IN;
  const sx1 = s.maxX - IN;
  const sz0 = s.minZ + IN;
  const sz1 = s.maxZ - 0.25;
  c.partZ(m.adobeMission, s.minZ, s.maxZ, s.minX, 0, wallTop, [c.gapOf(padre, 0.1)], 0.5);
  c.partZ(m.adobeMission, s.minZ, s.maxZ, s.maxX, 0, wallTop, [], 0.5);
  c.lining(m.adobeMission, sx0, sz0, sx1, sz1, {
    floor: m.dirt,
    ceilY: 3.4,
    ceil: m.woodDark,
    gaps: { S: [c.gapOf(school, 0.15)], W: [c.gapOf(padre, 0.1)], N: winGaps("school", "N") },
  });
  for (const bx of [47.5, 50.5, 53.5, 56.5]) {
    b.box(m.woodDark, bx - 0.1, 3.14, sz0, bx + 0.1, 3.4, sz1, { collide: false });
  }
  P.tableSquare(b, m, 47.0, -2.4, 1.7, 0.8, 0.78, m.woodDark, m.woodDark);
  b.box(m.paper, 46.6, 0.78, -2.6, 47.1, 0.79, -2.2, { collide: false });
  b.box(m.leatherRed, 47.4, 0.78, -2.55, 47.9, 0.9, -2.15, { collide: false });
  P.stool(b, m, 47.0, -3.3, 0.5);
  P.pictureFrame(b, m, 46.5, 2.0, sz0, 1.6, 1.2, "S", "chalkboard", { frame: m.woodDark, px: 128, py: 96 });
  P.crucifix(b, m, 53.6, 2.5, sz0, "S", 0.7);
  P.pictureFrame(b, m, 51.6, 2.2, sz0, 0.55, 0.75, "S", "madonna", { frame: m.woodDark, px: 96, py: 128 });
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      P.chair(b, m, 49.6 + col * 2.0 + (row % 2) * 0.4, -1.9 + row * 1.6, Math.PI / 2 + 0.12 * ((row + col) % 3) - 0.12);
    }
  }
  P.stool(b, m, 57.9, -3.5, 0.62);
  P.bench(b, m, sx1 - 0.32, 0.4, 1.8, "W");
  P.hangLamp(b, m, 52, -1, 3.4, { drop: 0.7 });
  c.warm(52, 2.8, -1, 12, 10);

  /* ---- padre's room ---- */
  const q = LOTS.padre;
  const qx0 = q.minX + IN;
  const qx1 = q.maxX - 0.25;
  const qz0 = q.minZ + IN;
  const qz1 = q.maxZ - 0.25;
  c.partX(m.adobeMission, q.minX, q.maxX, q.maxZ, 0, wallTop, [], 0.5);
  c.lining(m.adobeMission, qx0, qz0, qx1, qz1, {
    floor: m.dirt,
    ceilY: 3.2,
    ceil: m.woodDark,
    gaps: { E: [c.gapOf(padre, 0.1)], W: winGaps("padre", "W") },
  });
  // an arched opening divides the cell from the window alcove west of it
  b.archWall(m.adobeMission, "z", qz0, qz1, 38, 0, 3.2, -1.7, 1.7, 2.7, 0.4);
  P.ladder(b, m, 41.5, qz0, 0.1, 3.0, "S", 0.75);
  b.archWall(m.adobeMission, "x", 40.6, 42.4, qz0 + 0.2, 0, 3.2, 41.5, 1.3, 3.1, 0.15, { collide: false });
  b.box(m.woodBlack, 40.9, 3.06, qz0, 42.1, 3.19, qz0 + 1.1, { collide: false });
  // altar chest with the sun cloth and offering bowls, on the east wall
  b.box(m.woodBlack, qx1 - 0.6, 0, 0.0, qx1, 0.9, 1.4);
  P.pictureFrame(b, m, qx1, 1.75, 0.7, 0.8, 0.8, "W", "sunCloth", { frame: m.curioRed, px: 96, py: 96 });
  b.cyl(m.iron, qx1 - 0.3, 0.3, 0.9, 1.0, 0.14, { seg: 8 });
  b.cyl(m.iron, qx1 - 0.3, 1.1, 0.9, 1.0, 0.14, { seg: 8 });
  b.box(m.glassWarm, qx1 - 0.34, 1.0, 0.66, qx1 - 0.26, 1.16, 0.74, { collide: false });
  P.cot(b, m, 40.6, qz1 - 0.5, 0.8, 1.9, false);
  P.crucifix(b, m, 42.6, 2.1, qz1, "N", 0.6);
  P.pictureFrame(b, m, qx0, 2.0, 0.3, 0.55, 0.75, "E", "madonna", { frame: m.woodDark, px: 96, py: 128 });
  P.pictureFrame(b, m, qx0, 2.0, -3.6, 0.55, 0.75, "E", "madonna", { frame: m.woodDark, px: 96, py: 128 });
  P.bench(b, m, 35.4, qz1 - 0.35, 1.6, "N");
  P.tableSquare(b, m, 39.3, -5.0, 0.7, 0.5, 0.72);
  b.cyl(m.white, 39.3, -5.0, 0.72, 0.98, 0.03, { seg: 6 });
  b.box(m.glassWarm, 39.26, 0.98, -5.04, 39.34, 1.08, -4.96, { collide: false });
  P.stool(b, m, 40.2, -4.3, 0.45);
  P.shelfUnit(b, m, 43.0, 0.9, qz0, 1.6, 1.4, 0.3, "S", "books", 3, m.woodDark);
  c.warm(41.5, 2.4, -3.5, 7, 7);
}

/* ------------------------------------------------------------------ */
/* Mayor's mansion — `_MAYHALL` turned to face the gate: the hall runs  */
/* east from the front door, grand stairs at its far end, the study    */
/* (`_MAYSTUDY`) north, the dining room (`_MAYDINE`) south; upstairs   */
/* the landing wraps the stairwell and the bedroom (`_MAYROOM`) fills  */
/* the north-west.                                                     */

function buildMansion(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.mansion;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const front = c.door("mayorFront");
  const study = c.door("mayorStudy");
  const dine = c.door("mayorDine");
  const bed = c.door("mayorBed");
  const hallN = 64.4;
  const hallS = 68.8;
  const backX = 95.8;
  const slabY = 3.4;
  const lowerW = winGaps("mansion", "W").filter((g) => g.bottom < 3);
  // partitions
  c.partX(m.wpMayHall, x0, x1, hallN, 0, slabY, [c.gapOf(study, 0.08)]);
  c.partX(m.wpMayHall, x0, x1, hallS, 0, slabY, [c.gapOf(dine, 0.08)]);
  c.partZ(m.wpMayHall, z0, hallN, backX, 0, slabY);
  c.partZ(m.wpMayHall, hallS, z1, backX, 0, slabY);
  // upper slab minus the stairwell
  const sx0 = 90.8;
  const sx1 = 95.8;
  const sz0 = 65.4;
  const sz1 = 68.0;
  b.box(m.floorWood, x0, slabY, z0, x1, STOREY, sz0);
  b.box(m.floorWood, x0, slabY, sz1, x1, STOREY, z1);
  b.box(m.floorWood, x0, slabY, sz0, sx0, STOREY, sz1);
  b.box(m.floorWood, sx1, slabY, sz0, x1, STOREY, sz1);

  /* ---- hall ---- */
  c.lining(m.wpMayHall, x0, hallN + 0.1, x1, hallS - 0.1, {
    ceilY: slabY,
    ceil: null,
    wainscot: m.woodSaloon,
    wainscotH: 0.9,
    gaps: { W: [c.gapOf(front, 0.08)], N: [c.gapOf(study, 0.08)], S: [c.gapOf(dine, 0.08)] },
  });
  P.railStairs(b, m, sx0, sz0, sz1 - sz0, STOREY, sx1 - sx0, "E", { rail: "both", runner: m.leatherRed, steps: 13, mat: m.woodMid });
  P.pictureFrame(b, m, 88.0, 1.75, hallN + 0.1, 0.7, 1.4, "S", "mirror", { frame: m.woodDark, px: 64, py: 96 });
  b.decal(c.signMat(["HOME SWEET HOME"], 1.1, 0.45, { bg: "#e6dcba", fg: "#7e1f1c", border: "#6b5b3c" }), 87.8, 2.05, hallS - 0.1 - 0.012, 1.1, 0.45, "N");
  P.potPlant(b, m, 86.9, 68.2);
  P.coatRack(b, m, 87.0, 65.0);
  P.armoire(b, m, 93.4, hallN + 0.1, 1.5, "S", 2.2);
  P.chair(b, m, 98.7, 68.1, Math.PI / 2);
  P.sconce(b, m, 92.4, 2.25, hallN + 0.16, "S");
  P.sconce(b, m, 92.4, 2.25, hallS - 0.16, "N");
  P.fakeDoor(b, m, x1, 0, 66.6, 1.1, 2.2, "W");
  b.flat(m.rug, 86.9, 65.2, 90.4, 68.0, 0.05, { texWorld: 1.5 });
  P.hangLamp(b, m, 88.6, 66.6, slabY, { drop: 0.7 });
  c.warm(88.6, 2.8, 66.6, 14, 9);
  c.warm(94, 3.0, 66.6, 10, 8);

  /* ---- study ---- */
  c.lining(m.wpMayHall, x0, z0, backX - 0.1, hallN - 0.1, {
    ceilY: slabY,
    ceil: null,
    wainscot: m.woodSaloon,
    wainscotH: 0.9,
    gaps: { S: [c.gapOf(study, 0.08)], W: lowerW },
  });
  P.fireplace(b, m, backX - 0.1, 60.6, "W", 1.9, m.marble);
  P.pictureFrame(b, m, backX - 0.1, 2.55, 60.6, 0.85, 1.05, "W", "portrait", { frame: m.brass, px: 96, py: 128 });
  for (const cz of [59.9, 61.3]) {
    b.cyl(m.brass, backX - 0.5, cz, 1.44, 1.72, 0.03, { seg: 6 });
    b.box(m.glassWarm, backX - 0.54, 1.72, cz - 0.04, backX - 0.46, 1.86, cz + 0.04, { collide: false });
  }
  P.shelfUnit(b, m, 93.2, 0, z0, 3.8, 2.5, 0.38, "S", "books", 5, m.woodSaloon);
  P.shelfUnit(b, m, backX - 0.1, 0, 63.4, 1.5, 2.5, 0.38, "W", "books", 5, m.woodSaloon);
  P.sofa(b, m, x0, 60.75, 1.5, "E");
  for (const cz of [58.85, 60.15, 61.35, 62.65]) {
    P.curtain(b, m, x0, 0.4, cz, 0.42, 2.6, "E");
  }
  P.pictureFrame(b, m, 88.3, 2.15, hallN - 0.1, 1.3, 0.9, "N", "cow", { frame: m.brass });
  P.tableSquare(b, m, 88.3, 58.3, 0.7, 0.6, 0.74);
  b.cyl(m.brass, 88.3, 58.3, 0.74, 1.0, 0.035, { seg: 6 });
  b.cone(m.cactusDark, 88.3, 58.3, 0.98, 1.18, 0.19, 8);
  c.light(88.3, 1.2, 58.3, 0xa8d8a0, 6, 4);
  P.potPlant(b, m, 87.0, 63.5);
  P.tableRound(b, m, 92.0, 61.0, 0.6);
  P.chair(b, m, 92.9, 61.6, -2.3);
  P.chair(b, m, 91.2, 60.3, 0.8);
  P.pictureFrame(b, m, 88.7, 2.15, z0, 1.1, 0.8, "S", "landscape", { frame: m.brass });
  P.pictureFrame(b, m, 90.4, 2.15, z0, 0.55, 0.75, "S", "portrait", { frame: m.brass, px: 96, py: 128 });
  P.sconce(b, m, 92.4, 2.3, hallN - 0.16, "N");
  b.flat(m.rug, 87.5, 58.0, 94.0, 63.2, 0.05, { texWorld: 1.6 });
  P.hangLamp(b, m, 91, 60.5, slabY, { drop: 0.7 });
  c.warm(91, 2.8, 60.5, 13, 8);

  /* ---- dining room ---- */
  c.lining(m.wpMayHall, x0, hallS + 0.1, backX - 0.1, z1, {
    ceilY: slabY,
    ceil: null,
    wainscot: m.woodSaloon,
    wainscotH: 0.9,
    gaps: { N: [c.gapOf(dine, 0.08)], W: lowerW },
  });
  P.tableSquare(b, m, 91.2, 73.4, 4.2, 1.5, 0.8, m.woodSaloon, m.white);
  for (const cx of [89.8, 91.2, 92.6]) {
    P.chair(b, m, cx, 72.2, -Math.PI / 2);
    P.chair(b, m, cx, 74.6, Math.PI / 2);
  }
  P.chair(b, m, 88.6, 73.4, 0);
  P.chair(b, m, 93.8, 73.4, Math.PI);
  b.cyl(m.woodStage, 91.8, 73.4, 0.8, 0.92, 0.28, { seg: 10 }); // the pie
  b.cyl(m.curioRed, 91.8, 73.4, 0.92, 0.94, 0.22, { seg: 10 });
  b.cyl(m.white, 90.2, 73.7, 0.8, 1.1, 0.08, { seg: 8 });
  for (const cx of [89.6, 92.9]) {
    b.cyl(m.brass, cx, 73.1, 0.8, 1.05, 0.03, { seg: 6 });
    b.box(m.glassWarm, cx - 0.04, 1.05, 73.06, cx + 0.04, 1.2, 73.14, { collide: false });
  }
  P.candleWheel(b, m, 91.2, 73.4, 2.8, 0.85, 8, slabY);
  P.hutch(b, m, 91.0, z1, 2.6, "N");
  for (const cz of [70.4, 71.6, 73.4, 74.6]) {
    P.curtain(b, m, x0, 0.4, cz, 0.42, 2.6, "E");
  }
  P.pictureFrame(b, m, backX - 0.1, 2.1, 71.5, 0.9, 1.1, "W", "witch", { frame: m.brass, px: 96, py: 128 });
  b.cyl(m.woodDark, backX - 0.15, 74.4, 2.25, 2.32, 0.24, { seg: 14 });
  b.decal(m.paper, backX - 0.212, 2.28, 74.4, 0.4, 0.4, "W");
  b.box(m.woodDark, backX - 0.2, 1.65, 74.35, backX - 0.15, 2.05, 74.45, { collide: false });
  P.sconce(b, m, backX - 0.16, 2.3, 76.6, "W");
  P.pictureFrame(b, m, 94.0, 2.15, z1, 1.0, 0.75, "N", "landscape", { frame: m.brass });
  b.decal(m.winCold, 88.4, 2.0, z1 - 0.045, 1.0, 1.4, "N");
  P.curtain(b, m, 87.6, 0.4, z1, 0.42, 2.6, "N");
  P.curtain(b, m, 89.2, 0.4, z1, 0.42, 2.6, "N");
  P.potPlant(b, m, 87.0, 77.9);
  P.counter(b, m, 92.6, hallS + 0.1, 94.9, hallS + 0.7, 0.95, m.woodSaloon, m.marble);
  P.vase(b, m, 93.7, 0.95, hallS + 0.4, 0.12, 0.4, m.teal);
  b.flat(m.rug, 87.6, 70.4, 94.8, 76.4, 0.05, { texWorld: 1.6 });
  c.warm(91.2, 2.7, 73.4, 15, 9);

  /* ================= upstairs ================= */
  const up = STOREY;
  const upCeil = up + 2.9;
  const bedS = 62.7; // bedroom south wall
  const bedE = 95.0;
  const southZ = 68.8; // south rooms' wall
  c.partX(m.wpMayHall, x0, x1, bedS, up, upCeil, [c.gapOf(bed, 0.08)]);
  c.partZ(m.wpMayRoom, z0, bedS, bedE, up, upCeil);
  c.partX(m.wpMayHall, x0, x1, southZ, up, upCeil);
  const upperW = winGaps("mansion", "W").filter((g) => g.bottom > 3);
  // landing
  c.lining(m.wpMayHall, x0, bedS + 0.1, x1, southZ - 0.1, {
    y0: up,
    floor: null,
    ceilY: upCeil,
    ceil: m.woodDark,
    wainscot: m.woodSaloon,
    wainscotH: 0.9,
    gaps: { N: [c.gapOf(bed, 0.08)], W: upperW.filter((g) => g.from > bedS) },
  });
  P.balustrade(b, m, sx0, sz0, sx1, sz0, up, 0.95);
  P.balustrade(b, m, sx0, sz1, sx1, sz1, up, 0.95);
  P.balustrade(b, m, sx0, sz0, sx0, sz1, up, 0.95);
  for (const [px, pz] of [
    [sx0, sz0],
    [sx0, sz1],
    [sx1, sz0],
    [sx1, sz1],
  ] as const) {
    b.box(m.woodSaloon, px - 0.07, up, pz - 0.07, px + 0.07, up + 1.12, pz + 0.07, { collide: false });
    b.sphere(m.woodSaloon, px, up + 1.18, pz, 0.08, 8);
  }
  P.grandfatherClock(b, m, x1, 63.8, "W", up);
  P.pictureFrame(b, m, x0, up + 1.9, 63.6, 0.6, 0.75, "E", "insects", { frame: m.woodDark, px: 96, py: 128 });
  P.pictureFrame(b, m, x0, up + 1.9, 65.0, 0.6, 0.75, "E", "insects", { frame: m.woodDark, px: 96, py: 128 });
  P.tableSquare(b, m, 87.2, 64.2, 0.8, 0.5, 0.75, undefined, undefined, up);
  P.vase(b, m, 87.2, up + 0.75, 64.2, 0.12, 0.42, m.teal);
  b.box(m.leatherRed, 87.0, up + 0.75, 63.95, 87.4, up + 0.9, 64.15, { collide: false });
  P.chair(b, m, 98.8, 68.1, Math.PI / 2, up);
  P.potPlant(b, m, 90.4, 64.8, up);
  for (const dx of [89.0, 94.5]) {
    P.fakeDoor(b, m, dx, up, southZ - 0.1, 1.05, 2.25, "N");
  }
  P.pictureFrame(b, m, 91.8, up + 2.05, southZ - 0.1, 1.0, 0.75, "N", "landscape", { frame: m.brass });
  P.pictureFrame(b, m, 97.4, up + 2.0, bedS + 0.1, 0.6, 0.8, "S", "portrait", { frame: m.brass, px: 96, py: 128 });
  P.fakeDoor(b, m, x1, up, 66.0, 1.05, 2.25, "W");
  P.sconce(b, m, 90.5, up + 2.05, bedS + 0.16, "S");
  P.sconce(b, m, 97.0, up + 2.05, southZ - 0.16, "N");
  b.flat(m.rug, 87.0, 63.2, 99.0, 64.9, up + 0.05, { texWorld: 1.5 });
  P.hangLamp(b, m, 93.3, 66.7, upCeil, { drop: 0.9 });
  c.warm(93.3, up + 2.2, 66.7, 13, 9);
  c.warm(88, up + 2.4, 64, 9, 7);
  // bedroom: canopy bed, armoire, washstand, green paper
  c.lining(m.wpMayRoom, x0, z0, bedE - 0.1, bedS - 0.1, {
    y0: up,
    floor: null,
    ceilY: upCeil,
    ceil: m.woodDark,
    gaps: { S: [c.gapOf(bed, 0.08)], W: upperW.filter((g) => g.to < bedS) },
  });
  P.bed(b, m, 89.8, 58.0, 1.8, 2.2, "N", m.quiltGreen, { canopy: true, y0: up });
  P.armoire(b, m, 90.4, bedS - 0.1, 1.4, "N", 2.1, up);
  P.washstand(b, m, bedE - 0.1, 60.4, "W", up);
  P.pictureFrame(b, m, x0, up + 1.95, 60.75, 0.6, 0.8, "E", "lady", { frame: m.brass, px: 96, py: 128 });
  P.sconce(b, m, bedE - 0.16, up + 2.05, 58.5, "W");
  P.chair(b, m, 93.4, 58.4, 2.2, up);
  P.tableSquare(b, m, 91.6, 57.4, 0.6, 0.5, 0.72, undefined, undefined, up);
  b.cyl(m.brass, 91.6, 57.4, up + 0.72, up + 0.95, 0.035, { seg: 6 });
  b.box(m.glassWarm, 91.52, up + 0.95, 57.32, 91.68, up + 1.15, 57.48, { collide: false });
  b.flat(m.rug, 87.5, 59.5, 94.0, 62.2, up + 0.05, { texWorld: 1.5 });
  c.warm(90.5, up + 2.4, 60, 11, 8);
  // closed rooms: the north-east chamber and the south range
  c.lining(m.wpMayHall, bedE + 0.1, z0, x1, bedS - 0.1, { y0: up, floor: null, ceilY: upCeil, ceil: m.woodDark });
  c.lining(m.wpMayHall, x0, southZ + 0.1, x1, z1, { y0: up, floor: null, ceilY: upCeil, ceil: m.woodDark, gaps: { W: upperW } });
  P.bed(b, m, 89.0, 72.0, 1.5, 2.1, "N", m.quiltGreen, { y0: up });
  P.bed(b, m, 89.0, 76.6, 1.5, 2.1, "S", m.rug, { y0: up });
}
