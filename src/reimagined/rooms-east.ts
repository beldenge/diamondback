/**
 * Main Street east + Lee interiors: the stage office, Watson's
 * Apothecary, Bolivar's Dry Goods, Curiosities, the Cactus Bed Hotel
 * (both floors) and the livery office.
 */
import * as THREE from "three";
import { LOTS, STOREY, WALL_T, streetDoor, winGaps } from "./layout";
import * as P from "./props";
import type { Ctx } from "./interiors";

const IN = WALL_T;

export function buildEastRooms(c: Ctx): void {
  buildStage(c);
  buildWatson(c);
  buildBolivar(c);
  buildCurio(c);
  buildHotel(c);
  buildLivery(c);
}

/* ------------------------------------------------------------------ */
/* Stagecoach office — `_STAGE` 1×3 @3.3 along the street: ticket bay  */
/* on the back wall, Lincoln + map north, THROUGH TICKETS south.       */

function buildStage(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.stage;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const d = streetDoor("stage");
  const ceilY = 3.3;
  c.lining(m.woodDoctor, x0, z0, x1, z1, {
    ceilY,
    ceil: m.redCeiling,
    wainscot: m.woodSaloon,
    wainscotH: 0.9,
    gaps: { W: [c.gapOf(d, 0.12), ...winGaps("stage", "W")] },
  });
  // ticket bay: counter under a low arch, lamps on its posts
  P.counter(b, m, x1 - 1.25, 58.6, x1, 62.4, 1.1, m.woodSaloon, m.woodBlack);
  const bayX = x1 - 1.35;
  b.archWall(m.woodSaloon, "z", 58.2, 62.8, bayX, 1.75, ceilY, 60.5, 2.8, 3.15, 0.14, { collide: false });
  for (const pz of [58.3, 62.7]) {
    b.box(m.woodSaloon, bayX - 0.07, 1.1, pz - 0.1, bayX + 0.07, 1.75, pz + 0.1, { collide: false });
    P.wallLantern(b, m, bayX - 0.07, 1.9, pz, "W");
  }
  b.decal(
    c.signMat(["The Great Southwestern", "STAGECOACH Co."], 2.3, 0.85, { bg: "#efeadb", fg: "#241d16", border: "#8a7a52" }),
    x1 - 0.012,
    2.05,
    60.5,
    2.3,
    0.85,
    "W",
  );
  b.box(m.paper, x1 - 1.1, 1.1, 60.2, x1 - 0.5, 1.11, 60.8, { collide: false }); // tickets
  b.cyl(m.brass, x1 - 0.7, 61.8, 1.1, 1.18, 0.06, { seg: 8 }); // bell
  // north end of the back wall: Lincoln, the route map, Fast Freight
  P.pictureFrame(b, m, x1, 2.3, 56.85, 0.6, 0.8, "W", "portrait", { frame: m.woodDark, px: 96, py: 128 });
  P.pictureFrame(b, m, x1, 2.45, 57.55, 0.85, 0.65, "W", "map", { frame: m.woodDark });
  b.decal(c.signMat(["Fast Freight", "CONTRACTED"], 0.8, 0.5, { bg: "#efeadb", fg: "#241d16", border: "#241d16" }), x1 - 0.012, 1.55, 57.55, 0.8, 0.5, "W");
  // south end: the through-tickets board
  b.decal(
    c.signMat(
      ["THROUGH TICKETS TO:", "Asbestos · Phoenix · Los Osos · Santa Fe", "Rabies · Dry Rot · Albuquerque · Tombstone", "CALIFORNIA AND ALL POINTS SOUTH AND EAST"],
      1.7,
      1.05,
      { bg: "#c9b98a", fg: "#33261a", border: "#6b5b3c" },
    ),
    x1 - 0.012,
    2.0,
    63.75,
    1.7,
    1.05,
    "W",
  );
  // end walls + waiting bench, luggage, barrels
  b.decal(c.signMat(["ASBESTOS, DETROIT", "AND SANTA FE", "— COACHES —", "The Great Southwestern", "STAGECOACH Co."], 0.85, 1.25, { bg: "#d8cba6", fg: "#33261a", border: "#8a7a52" }), 58.6, 2.1, z0 + 0.012, 0.85, 1.25, "S");
  P.pictureFrame(b, m, 59.0, 2.2, z1, 1.1, 0.8, "N", "flowers", { frame: m.brass });
  P.bench(b, m, x0 + 0.42, 57.9, 1.6, "E");
  b.box(m.woodSaloon, x0 + 0.3, 0, 59.2, x0 + 1.3, 0.55, 59.9);
  b.box(m.brass, x0 + 0.3, 0.24, 59.18, x0 + 1.3, 0.32, 59.92, { collide: false });
  b.rotBox(m.leatherRed, x0 + 1.1, 0.24, 57.0, 0.62, 0.44, 0.34, 0.4, { collide: false });
  P.spittoon(b, m, x0 + 0.55, 61.4);
  P.barrel(b, m, 60.9, 64.1, 0.42, 0.9);
  P.barrel(b, m, 59.8, 64.25, 0.38, 0.8);
  P.tableSquare(b, m, 57.4, 64.15, 1.1, 0.6, 0.78);
  b.cyl(m.brass, 57.4, 64.15, 0.78, 0.98, 0.14, { seg: 8 });
  P.hangLamp(b, m, 59.0, 60.5, ceilY, { drop: 0.7 });
  c.warm(59, 2.7, 60.5, 15, 9);
}

/* ------------------------------------------------------------------ */
/* Watson's Apothecary — `_APOTH` 3×1 @3.54 running back from the door: */
/* brass-edged glass cases along both walls under shelves of jars,     */
/* barrels and crocks in the back, the clock inside the door.          */

function buildWatson(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.watson;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const d = streetDoor("watson");
  const ceilY = 3.3;
  c.lining(m.wpApoth, x0, z0, x1, z1, {
    ceilY,
    wainscot: m.woodSaloon,
    gaps: { W: [c.gapOf(d, 0.12), ...winGaps("watson", "W")] },
  });
  P.glassCase(b, m, 58.2, z0 + 0.6, 64.2, z0 + 1.6);
  P.glassCase(b, m, 58.2, z1 - 1.6, 64.2, z1 - 0.6);
  P.shelfUnit(b, m, 61.2, 1.35, z0, 8.4, 1.75, 0.32, "S", "jars", 3, m.woodSaloon);
  P.shelfUnit(b, m, 61.2, 1.35, z1, 8.4, 1.75, 0.32, "N", "jars", 3, m.woodSaloon);
  b.cyl(m.marble, 60.8, z0 + 1.1, 1.35, 1.5, 0.09, { seg: 7 }); // mortar
  b.box(m.brass, 62.3, 1.35, z1 - 1.25, 62.7, 1.4, z1 - 0.95, { collide: false }); // scales
  b.cyl(m.brass, 62.5, z1 - 1.1, 1.4, 1.7, 0.02, { seg: 5 });
  b.box(m.brass, 62.15, 1.68, z1 - 1.3, 62.85, 1.72, z1 - 0.9, { collide: false });
  b.cyl(m.cactusDark, 59.4, z1 - 1.1, 1.35, 1.6, 0.05, { seg: 6 });
  b.cyl(m.curioRed, 63.4, z0 + 1.1, 1.35, 1.55, 0.06, { seg: 6 });
  // the back: barrels, crocks, crates, a tonic poster and a lady's portrait
  P.barrel(b, m, x1 - 0.65, 66.4, 0.45, 1.0);
  P.barrel(b, m, x1 - 0.6, 67.6, 0.4, 0.9);
  b.cyl(m.woodStage, x1 - 0.7, 70.5, 0, 0.8, 0.35, { seg: 9, collide: true });
  b.cyl(m.woodStage, x1 - 0.7, 70.5, 0.8, 0.95, 0.25, { seg: 9 });
  P.crate(b, m, x1 - 0.75, 69.0, 0.85, 0.75, 0.15);
  P.crate(b, m, x1 - 0.6, 71.5, 0.7, 0.9, 0.3);
  b.decal(c.posterMat("tonic"), x1 - 0.012, 2.05, 68.75, 0.85, 1.15, "W");
  P.pictureFrame(b, m, x1, 2.2, 66.6, 0.6, 0.8, "W", "lady", { frame: m.woodDark, px: 96, py: 128 });
  b.box(m.woodSaloon, x1 - 0.3, 2.45, z0 + 0.4, x1, 2.55, z1 - 0.4, { collide: false }); // header beam
  // front: clock, coat rack, chair
  P.grandfatherClock(b, m, x0, 67.65, "E");
  P.coatRack(b, m, x0 + 0.55, 70.2);
  P.chair(b, m, 57.6, 67.6, 0.7);
  P.hangLamp(b, m, 61.5, 68.75, ceilY, { drop: 0.8 });
  P.hangLamp(b, m, 64.8, 68.75, ceilY, { drop: 0.7 });
  c.warm(61.5, 2.7, 68.75, 16, 9);
  c.warm(65, 2.6, 68.75, 9, 6);
}

/* ------------------------------------------------------------------ */
/* Bolivar's Dry Goods — `_STORE` 2×1 @3.1: a marble U counter opening */
/* toward the door, teal shelves of tins on every wall, pans overhead. */

function buildBolivar(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.bolivar;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const d = streetDoor("bolivar");
  const ceilY = 3.3;
  c.lining(m.woodMid, x0, z0, x1, z1, {
    ceilY,
    gaps: { W: [c.gapOf(d, 0.12), ...winGaps("bolivar", "W")] },
  });
  P.shelfUnit(b, m, 61.6, 1.2, z0, 6.0, 1.9, 0.3, "S", "cans", 3, m.teal);
  P.shelfUnit(b, m, 61.6, 1.2, z1, 6.0, 1.9, 0.3, "N", "cans", 3, m.teal);
  P.shelfUnit(b, m, x1, 1.2, 76.25, 5.6, 1.9, 0.3, "W", "cans", 3, m.teal);
  // the U counter
  P.counter(b, m, 58.3, 74.4, 63.3, 75.3, 0.95, m.teal, m.marble);
  P.counter(b, m, 58.3, 77.3, 63.3, 78.2, 0.95, m.teal, m.marble);
  P.counter(b, m, 63.3, 74.4, 64.2, 78.2, 0.95, m.teal, m.marble);
  // goods on the counters: crocks, the red coffee grinder, the scale
  b.cyl(m.woodStage, 59.3, 74.85, 0.95, 1.45, 0.24, { seg: 9 });
  b.cyl(m.woodStage, 60.1, 74.85, 0.95, 1.4, 0.2, { seg: 9 });
  b.cyl(m.woodStage, 61.9, 74.85, 0.95, 1.5, 0.26, { seg: 9 });
  b.cyl(m.curioRed, 60.5, 77.75, 0.95, 1.5, 0.27, { seg: 10 });
  b.cyl(m.curioRed, 60.5, 77.75, 1.5, 1.75, 0.1, { seg: 8 });
  const grinder = new THREE.TorusGeometry(0.22, 0.03, 6, 14);
  grinder.rotateY(Math.PI / 2);
  grinder.translate(60.8, 1.6, 77.75);
  b.mesh(m.iron, grinder);
  b.box(m.iron, 63.55, 0.95, 76.0, 63.95, 1.15, 76.6, { collide: false });
  b.cyl(m.iron, 63.75, 76.3, 1.15, 1.35, 0.02, { seg: 5 });
  b.box(m.iron, 63.5, 1.33, 76.05, 64.0, 1.36, 76.55, { collide: false });
  b.cyl(m.brass, 63.6, 76.2, 1.36, 1.38, 0.14, { seg: 9 });
  b.cyl(m.brass, 63.9, 76.4, 1.36, 1.38, 0.14, { seg: 9 });
  b.box(m.woodStage, 62.4, 0.95, 77.5, 63.0, 1.25, 78.0, { collide: false }); // cracker box
  b.decal(c.signMat(["SODA", "CRACKERS"], 0.5, 0.28, { bg: "#c9a24a", fg: "#33261a" }), 62.7, 1.1, 77.49, 0.5, 0.28, "N");
  // pans and a lantern hanging from the ceiling, the wagon wheel on the wall
  for (const [px, pz] of [
    [59.6, 75.9],
    [60.7, 76.4],
    [61.9, 75.9],
    [63.0, 76.4],
    [60.2, 77.0],
  ] as const) {
    b.cyl(m.iron, px, pz, 2.5, 2.58, 0.18, { seg: 9 });
    b.cyl(m.iron, px, pz, 2.58, ceilY, 0.012, { seg: 4 });
  }
  P.spokedWheel(b, m, 57.5, z0 + 0.45, 0.55, { y: 1.3, mat: m.curioRed });
  P.stove(b, m, 64.6, 73.4, ceilY);
  // apple barrel by the door, the baking powder sign and a wanted bill
  P.barrel(b, m, 57.3, 78.9, 0.42, 0.8);
  for (const [ax, az] of [
    [57.2, 78.8],
    [57.45, 79.05],
    [57.1, 79.1],
  ] as const) {
    b.sphere(m.curioRed, ax, 0.86, az, 0.11, 6);
  }
  b.decal(c.signMat(["COUNCE", "BAKING", "POWDER"], 0.7, 1.2, { bg: "#a3261d", fg: "#efe0b0", border: "#5e1713" }), x0 + 0.012, 2.0, 75.2, 0.7, 1.2, "E");
  b.decal(c.posterMat("wanted"), x0 + 0.012, 1.9, 77.45, 0.65, 0.9, "E");
  P.chair(b, m, 57.6, 73.6, 0.3);
  P.hangLamp(b, m, 60.8, 76.3, ceilY, { drop: 0.7 });
  c.warm(60.8, 2.7, 76.3, 16, 9);
}

/* ------------------------------------------------------------------ */
/* Curiosities — `_CHIN` 2×3 @2.16: a dark little shop, door mid-wall, */
/* red fretwork screens, jars and vases on black shelves, a hanging     */
/* scroll on the back wall, paper lanterns, gilt bats on the ceiling.   */

function buildCurio(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.curio;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const d = streetDoor("curio");
  const ceilY = 3.4;
  c.lining(m.woodBlack, x0, z0, x1, z1, {
    ceilY,
    ceil: m.woodBlack,
    gaps: { W: [c.gapOf(d, 0.12), ...winGaps("curio", "W")] },
  });
  // red band at the ceiling line
  b.box(m.curioRed, x0 + 0.04, 3.1, z0 + 0.04, x1 - 0.04, 3.28, z0 + 0.14, { collide: false });
  b.box(m.curioRed, x0 + 0.04, 3.1, z1 - 0.14, x1 - 0.04, 3.28, z1 - 0.04, { collide: false });
  b.box(m.curioRed, x1 - 0.14, 3.1, z0 + 0.04, x1 - 0.04, 3.28, z1 - 0.04, { collide: false });
  // black counters under the shelves, shelves of glazed jars
  b.box(m.woodBlack, 57.2, 0, z0, 62.2, 0.9, z0 + 0.6);
  b.box(m.woodBlack, 57.2, 0, z1 - 0.6, 62.2, 0.9, z1);
  b.box(m.woodBlack, x1 - 0.6, 0, z0 + 0.6, x1, 0.9, z1 - 0.6);
  P.shelfUnit(b, m, 59.7, 0.9, z0, 5.0, 2.1, 0.34, "S", "curios", 3, m.woodBlack);
  P.shelfUnit(b, m, 59.7, 0.9, z1, 5.0, 2.1, 0.34, "N", "curios", 3, m.woodBlack);
  P.shelfUnit(b, m, x1, 0.9, 89.8, 2.0, 2.1, 0.34, "W", "curios", 3, m.woodBlack);
  P.shelfUnit(b, m, x1, 0.9, 94.2, 2.0, 2.1, 0.34, "W", "curios", 3, m.woodBlack);
  // the back wall between the shelves: hanging scroll + bills
  P.pictureFrame(b, m, x1, 2.0, 92.0, 0.7, 1.9, "W", "scroll", { frame: m.curioRed, px: 64, py: 192 });
  b.decal(c.posterMat("wanted"), x1 - 0.012, 2.1, 91.1, 0.5, 0.7, "W");
  b.decal(c.posterMat("tonic"), x1 - 0.012, 2.0, 92.9, 0.5, 0.7, "W");
  b.decal(c.posterMat("wanted2"), x0 + 0.012, 2.2, 90.7, 0.5, 0.7, "E");
  b.decal(c.posterMat("circus"), x0 + 0.012, 2.2, 93.3, 0.5, 0.7, "E");
  // red fretwork screens in front of the side bays
  P.latticeScreen(b, m, 61.3, z0 + 0.62, 61.3, 90.7, 2.7);
  P.latticeScreen(b, m, 61.3, 93.3, 61.3, z1 - 0.62, 2.7);
  // vases, the skull, incense, a bowl on a stand
  for (const vx of [58.0, 59.0, 60.0]) {
    P.vase(b, m, vx, 0.9, z1 - 0.3, 0.24, 0.75, m.white);
  }
  b.sphere(m.bone, 61.4, 1.06, z0 + 0.3, 0.16, 8);
  b.box(m.bone, 61.28, 0.9, z0 + 0.2, 61.52, 0.98, z0 + 0.4, { collide: false });
  P.tableSquare(b, m, 57.7, 89.5, 0.7, 0.5, 0.7, m.woodBlack, m.woodBlack);
  for (let i = 0; i < 4; i += 1) {
    b.rotBox(m.woodDark, 57.6 + i * 0.06, 0.95, 89.5, 0.012, 0.5, 0.012, 0, { rotZ: 0.08 * (i - 1.5), collide: false });
  }
  b.cyl(m.brass, 57.5, 94.4, 0, 0.55, 0.06, { seg: 6 });
  b.cyl(m.brass, 57.5, 94.4, 0.55, 0.62, 0.3, { rTop: 0.34, seg: 10 });
  // lanterns and gilt bats
  P.paperLantern(b, m, 59.4, 2.35, 89.9, ceilY);
  P.paperLantern(b, m, 59.4, 2.35, 94.1, ceilY);
  P.paperLantern(b, m, 57.6, 2.5, 92.0, ceilY);
  for (const [bx, bz] of [
    [58.6, 89.2],
    [60.6, 95.0],
    [58.5, 92.0],
  ] as const) {
    b.rotBox(m.brass, bx - 0.14, ceilY - 0.03, bz, 0.26, 0.02, 0.14, 0.4, { collide: false });
    b.rotBox(m.brass, bx + 0.14, ceilY - 0.03, bz, 0.26, 0.02, 0.14, -0.4, { collide: false });
    b.sphere(m.brass, bx, ceilY - 0.04, bz, 0.05, 6);
  }
  c.warm(59.4, 2.3, 89.9, 8, 6);
  c.warm(59.4, 2.3, 94.1, 8, 6);
  c.warm(57.6, 2.4, 92, 6, 5);
}

/* ------------------------------------------------------------------ */
/* Cactus Bed Hotel — `_HOTLOWER` 4×3 @3.8: lobby with the desk on the  */
/* north wall and the PRIVATE partition east of it, the dining room    */
/* across the south with hutch, fireplace and sofa, the enclosed stair */
/* in the north-east rising north. `_HOTUPPER` above: landing at the   */
/* stair top, corridor west then south along the rooms, your room 3   */
/* at the south-west corner with its window on the street.            */

function buildHotel(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.hotel;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const d = streetDoor("hotel");
  const slabY = 3.4;
  const partX = 64; // lobby / back office
  const stairX = 67.7; // office / stairwell
  const dineZ = 40.3; // dining room's north line
  const lowerW = winGaps("hotel", "W").filter((g) => g.bottom < 3);
  const lowerS = winGaps("hotel", "S").filter((g) => g.bottom < 3);

  // lobby + the west half of the dining room (one L-shaped volume)
  c.lining(m.wpHotel, x0, z0, partX - 0.1, z1, {
    wainscot: m.woodSaloon,
    ceilY: slabY,
    ceil: null,
    gaps: {
      W: [c.gapOf(d, 0.12), ...lowerW],
      S: lowerS,
      E: [{ from: dineZ, to: z1, top: slabY }],
    },
  });
  // east half of the dining room, open to the west, the stair foot at its north-east
  c.lining(m.wpHotel, partX - 0.1, dineZ, x1, z1, {
    wainscot: m.woodSaloon,
    ceilY: slabY,
    ceil: null,
    skip: ["W"],
    gaps: {
      S: lowerS,
      N: [{ from: stairX, to: x1, top: slabY }],
    },
  });
  // partitions: PRIVATE wall, back office south wall, stairwell west wall
  c.partZ(m.wpHotel, z0, dineZ, partX, 0, slabY);
  c.partX(m.wpHotel, partX, stairX, dineZ, 0, slabY);
  c.partZ(m.wpHotel, z0, dineZ, stairX, 0, slabY);
  // upper slab minus the stairwell
  b.box(m.floorWood, x0, slabY, z0, stairX + 0.1, STOREY, z1);
  b.box(m.floorWood, stairX + 0.1, slabY, z0, x1, STOREY, 33.4);
  b.box(m.floorWood, stairX + 0.1, slabY, dineZ, x1, STOREY, z1);
  // ceiling beams stop at the stairwell wall; the flight rises through
  // the slab hole beyond it
  for (const bz of [36.2, 40.0, 43.8]) {
    const bx1 = bz < dineZ ? stairX - 0.1 : x1;
    b.box(m.woodSaloon, x0, slabY - 0.22, bz - 0.1, bx1, slabY, bz + 0.1, { collide: false });
  }
  // the stairs: enclosed run rising north, sconces at the foot
  P.railStairs(b, m, stairX + 0.2, dineZ, x1 - stairX - 0.2, STOREY, dineZ - 33.4, "N", {
    rail: "none",
    runner: m.leatherRed,
    steps: 14,
    mat: m.woodMid,
  });
  P.sconce(b, m, stairX + 0.16, 2.2, 39.6, "E");
  P.sconce(b, m, x1 - 0.06, 2.2, 39.6, "W");
  P.sconce(b, m, stairX + 0.16, 4.2, 36.0, "E");
  b.box(m.woodDark, stairX + 0.1, 0.92, 39.4, stairX + 0.2, 1.0, 40.3, { collide: false });

  /* ---- lobby ---- */
  P.counter(b, m, 58.0, z0 + 0.4, 63.2, z0 + 1.4, 1.1, m.woodSaloon, m.woodDark);
  b.box(m.white, 60.0, 1.1, z0 + 0.7, 60.9, 1.16, z0 + 1.2, { collide: false }); // ledger
  b.sphere(m.brass, 62.3, 1.22, z0 + 0.9, 0.09, 8);
  b.cyl(m.brass, 58.6, z0 + 0.9, 1.1, 1.5, 0.04, { seg: 6 });
  b.box(m.glassWarm, 58.52, 1.5, z0 + 0.82, 58.68, 1.68, z0 + 0.98, { collide: false });
  P.pictureFrame(b, m, 60.6, 2.15, z0, 1.6, 0.8, "S", "keys", { frame: m.woodDark, px: 128, py: 64 });
  P.pictureFrame(b, m, 57.4, 2.25, z0, 0.95, 0.7, "S", "map", { frame: m.woodDark });
  P.coatRack(b, m, 57.0, z0 + 1.1);
  P.sconce(b, m, 63.0, 2.3, z0 + 0.06, "S");
  // wagon-wheel chandelier
  P.spokedWheel(b, m, 60.0, 36.6, 1.0, { y: 1.95, lean: Math.PI / 2, mat: m.woodDark });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    b.box(m.glassWarm, 60 + Math.cos(a) * 0.95 - 0.04, 2.98, 36.6 + Math.sin(a) * 0.95 - 0.04, 60 + Math.cos(a) * 0.95 + 0.04, 3.2, 36.6 + Math.sin(a) * 0.95 + 0.04, { collide: false });
  }
  b.cyl(m.iron, 60, 36.6, 2.96, slabY, 0.02, { seg: 5 });
  // clock and bills on the street wall south of the door
  P.grandfatherClock(b, m, x0, 36.6, "E");
  b.decal(c.posterMat("circus"), x0 + 0.012, 2.3, 38.2, 0.55, 0.75, "E");
  // the PRIVATE partition: house rules + the painted door
  b.decal(
    c.signMat(
      ["THE CACTUS BED", "Gold nuggets and pesos accepted", "No spurs in bed · No shooting the lamps", "No blue talk in the lobby", "Settle up Saturdays"],
      1.5,
      1.15,
      { bg: "#6d5136", fg: "#e6dcba", border: "#4a3826" },
    ),
    partX - 0.1 - 0.012,
    2.1,
    34.4,
    1.5,
    1.15,
    "W",
  );
  P.fakeDoor(b, m, partX - 0.1, 0, 36.9, 1.1, 2.2, "W", { label: "PRIVATE", plate: { bg: "#e6dcba", fg: "#33261a" } });
  P.shelfUnit(b, m, partX - 0.1, 0, 38.9, 1.4, 1.6, 0.35, "W", "books", 3, m.woodSaloon);
  b.flat(m.rug, 57.3, 34.6, 62.8, 39.4, 0.05, { texWorld: 1.6 });
  c.warm(60, 3.0, 36.6, 18, 11);

  /* ---- dining ---- */
  P.tableRound(b, m, 59.6, 43.6, 0.8);
  P.chair(b, m, 58.7, 44.3, 2.3);
  P.chair(b, m, 60.5, 42.9, -0.8);
  P.chair(b, m, 60.3, 44.5, -2.4);
  P.tableRound(b, m, 63.6, 45.0, 0.75);
  P.chair(b, m, 64.5, 45.6, -2.2);
  P.chair(b, m, 62.7, 45.5, 2.4);
  P.tableRound(b, m, 66.4, 42.3, 0.75);
  P.chair(b, m, 65.5, 43.0, 2.4);
  P.chair(b, m, 67.3, 41.7, -0.6);
  for (const [tx, tz] of [
    [59.6, 43.6],
    [63.6, 45.0],
    [66.4, 42.3],
  ] as const) {
    b.cyl(m.white, tx + 0.2, tz - 0.1, 0.78, 0.98, 0.08, { seg: 8 });
    b.cyl(m.brass, tx - 0.25, tz + 0.15, 0.78, 0.92, 0.04, { seg: 6 });
    b.box(m.glassWarm, tx - 0.29, 0.92, tz + 0.11, tx - 0.21, 1.06, tz + 0.19, { collide: false });
  }
  P.hutch(b, m, 62.5, z1, 2.4, "N");
  for (const cx of [58.2, 59.8, 65.2, 66.8]) {
    P.curtain(b, m, cx, 0.3, z1, 0.5, 2.9, "N");
  }
  P.fireplace(b, m, x1, 44.6, "W", 2.0);
  P.pictureFrame(b, m, x1, 2.85, 44.6, 1.2, 0.5, "W", "landscape", { frame: m.brass, px: 128, py: 56 });
  P.sofa(b, m, 65.6, dineZ + 0.1, 2.0, "S");
  b.box(m.woodDark, x1 - 0.06, 1.9, 41.0, x1, 2.02, 42.3, { collide: false });
  for (let i = 0; i < 6; i += 1) {
    b.box(m.brass, x1 - 0.12, 1.94, 41.1 + i * 0.22, x1 - 0.06, 1.98, 41.14 + i * 0.22, { collide: false });
  }
  P.potPlant(b, m, x1 - 0.5, z1 - 0.5);
  P.potPlant(b, m, x0 + 0.5, z1 - 0.5);
  P.candleWheel(b, m, 61.5, 44.0, 2.9, 0.75, 6, slabY);
  P.candleWheel(b, m, 67.5, 44.6, 2.9, 0.75, 6, slabY);
  P.pictureFrame(b, m, x0, 2.2, 42.3, 1.2, 0.85, "E", "landscape");
  P.pictureFrame(b, m, 69.6, 2.25, z1, 0.6, 0.8, "N", "portrait", { frame: m.brass, px: 96, py: 128 });
  P.pictureFrame(b, m, 70.6, 2.25, z1, 0.6, 0.8, "N", "lady", { frame: m.brass, px: 96, py: 128 });
  P.sconce(b, m, 68.3, 2.3, z1 - 0.06, "N");
  c.warm(61.5, 2.9, 44.0, 14, 9);
  c.warm(67.5, 2.9, 44.6, 12, 8);

  /* ================= upstairs ================= */
  const up = STOREY;
  const upCeil = up + 2.9;
  const corX = 64; // rooms / corridor partition
  const room3z = 43.1;
  const roomDoor = c.door("hotRoom");
  const upperW = winGaps("hotel", "W").filter((g) => g.bottom > 3);
  const upperS = winGaps("hotel", "S").filter((g) => g.bottom > 3);
  // partitions
  c.partZ(m.wpHotel, z0, z1, corX, up, upCeil, [c.gapOf(roomDoor, 0.08)]);
  c.partX(m.wpHotel, x0, corX, 36.5, up, upCeil);
  c.partX(m.wpHotel, x0, corX, 40.5, up, upCeil);
  c.partX(m.wpHotel, x0, corX, room3z, up, upCeil);
  c.partX(m.wpHotel, stairX, x1, dineZ, up, upCeil); // stairwell south wall (deer head)
  c.partZ(m.wpHotel, dineZ, z1, stairX, up, upCeil); // closet + room 4 west wall
  c.partX(m.wpHotel, stairX, x1, room3z, up, upCeil);
  // corridor + the stair-top landing
  c.lining(m.wpHotel, corX + 0.1, z0, stairX - 0.1, z1, {
    y0: up,
    floor: null,
    ceilY: upCeil,
    ceil: m.woodSaloon,
    wainscot: m.woodSaloon,
    wainscotH: 0.9,
    gaps: {
      W: [c.gapOf(roomDoor, 0.08)],
      E: [{ from: z0, to: dineZ, top: upCeil }],
    },
  });
  c.lining(m.wpHotel, stairX - 0.1, z0, x1, 33.4, {
    y0: up,
    floor: null,
    ceilY: upCeil,
    ceil: m.woodSaloon,
    skip: ["W", "S"],
  });
  P.balustrade(b, m, stairX, 33.4, stairX, dineZ, up, 0.95);
  b.box(m.woodSaloon, stairX - 0.06, up, 33.34, stairX + 0.06, up + 1.1, 33.46, { collide: false });
  b.flat(m.rug, corX + 0.6, 33.0, stairX - 0.6, z1 - 0.3, up + 0.05, { texWorld: 1.5 });
  // painted doors 1, 2 (west) and 4 (east); the real room 3
  for (const [dz, num] of [
    [34.4, "1"],
    [38.5, "2"],
  ] as const) {
    P.fakeDoor(b, m, corX + 0.1, up, dz, 1.05, 2.25, "E", { label: num });
  }
  P.fakeDoor(b, m, stairX - 0.1, up, 45.4, 1.05, 2.25, "W", { label: "4" });
  b.decal(c.signMat(["3"], 0.5, 0.4, { bg: "#3a2b1f", fg: "#dfb44e" }), corX + 0.1 + 0.012, up + 2.5, roomDoor.z, 0.5, 0.4, "E");
  P.sconce(b, m, corX + 0.16, up + 2.0, 36.5, "E");
  P.sconce(b, m, corX + 0.16, up + 2.0, 40.5, "E");
  P.sconce(b, m, stairX - 0.16, up + 2.0, 43.1, "W");
  P.sconce(b, m, x1 - 0.06, up + 2.2, 32.9, "W");
  P.pictureFrame(b, m, corX + 0.1, up + 2.1, 41.8, 1.0, 0.75, "E", "flowers");
  P.pictureFrame(b, m, stairX - 0.1, up + 2.1, 41.6, 1.0, 0.75, "W", "landscape");
  P.pictureFrame(b, m, 65.8, up + 2.1, z0, 1.1, 0.8, "S", "landscape");
  P.pictureFrame(b, m, 69.7, up + 2.15, z0, 0.6, 0.8, "S", "portrait", { px: 96, py: 128 });
  P.trophyHead(b, m, 69.7, up + 2.25, dineZ - 0.12, "N");
  b.decal(m.winCold, 65.8, up + 1.9, z1 - 0.045, 0.9, 1.3, "N");
  P.curtain(b, m, 65.0, up + 0.5, z1, 0.45, 2.4, "N");
  P.curtain(b, m, 66.6, up + 0.5, z1, 0.45, 2.4, "N");
  c.warm(65.8, up + 2.5, 36, 12, 9);
  c.warm(65.8, up + 2.5, 44.5, 11, 8);
  c.warm(69.7, up + 2.5, 33, 9, 7);
  // your room 3 — `_HOTROOM`: bed under the curtained street window
  c.lining(m.wpHotel, x0, room3z + 0.1, corX - 0.1, z1, {
    y0: up,
    floor: null,
    ceilY: upCeil,
    ceil: m.woodSaloon,
    gaps: { E: [c.gapOf(roomDoor, 0.08)], W: upperW, S: upperS },
  });
  P.bed(b, m, 57.15, 45.3, 1.4, 2.1, "N", m.rug, { y0: up });
  P.curtain(b, m, x0, up + 0.4, 44.55, 0.5, 2.5, "E");
  P.curtain(b, m, x0, up + 0.4, 46.25, 0.5, 2.5, "E");
  P.washstand(b, m, 62.4, room3z + 0.1, "S", up);
  P.coatRack(b, m, 63.2, 47.0, up);
  P.chair(b, m, 61.8, 44.3, 2.5, up);
  P.tableSquare(b, m, 58.7, 47.2, 0.6, 0.5, 0.72, undefined, undefined, up);
  b.cyl(m.brass, 58.7, 47.2, up + 0.72, up + 0.95, 0.04, { seg: 6 });
  b.box(m.glassWarm, 58.62, up + 0.95, 47.12, 58.78, up + 1.15, 47.28, { collide: false });
  P.pictureFrame(b, m, 60.4, up + 2.1, z1, 0.9, 0.7, "N", "landscape");
  b.flat(m.rug, 58.4, 43.9, 62.6, 46.8, up + 0.05, { texWorld: 1.4 });
  c.warm(60, up + 2.4, 45.3, 10, 7);
  // closed rooms 1, 2, the closet and room 4 (seen through their windows)
  c.lining(m.wpHotel, x0, z0, corX - 0.1, 36.4, { y0: up, floor: null, ceilY: upCeil, ceil: m.woodSaloon, gaps: { W: upperW } });
  c.lining(m.wpHotel, x0, 36.6, corX - 0.1, 40.4, { y0: up, floor: null, ceilY: upCeil, ceil: m.woodSaloon, gaps: { W: upperW } });
  c.lining(m.wpHotel, x0, 40.6, corX - 0.1, room3z - 0.1, { y0: up, floor: null, ceilY: upCeil, ceil: m.woodSaloon, gaps: { W: upperW } });
  c.lining(m.wpHotel, stairX + 0.1, room3z + 0.1, x1, z1, { y0: up, floor: null, ceilY: upCeil, ceil: m.woodSaloon, gaps: { S: upperS } });
  P.bed(b, m, 57.2, 34.4, 1.4, 2.0, "N", m.quiltGreen, { y0: up });
  P.bed(b, m, 57.2, 38.5, 1.4, 2.0, "N", m.rug, { y0: up });
  P.bed(b, m, 70.6, 45.4, 1.3, 2.0, "N", m.quiltGreen, { y0: up });
}

/* ------------------------------------------------------------------ */
/* Livery office — `_LIVERY` 1×2 @3.1 filmed with its door east; the   */
/* stable faces Lee so the plan is turned: desk + Harness and Saddlery */
/* on the south wall, stove north, the PRIVATE door east into stalls.  */

function buildLivery(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.livery;
  const x0 = r.minX + IN;
  const z1 = r.maxZ - IN;
  const partX = 85.5;
  const partZ = 40;
  const d = streetDoor("livery");
  const ceilY = 3.2;
  c.partZ(m.woodStage, partZ, z1, partX, 0, ceilY);
  c.partX(m.woodStage, x0, partX, partZ, 0, ceilY);
  c.lining(m.woodStage, x0, partZ + 0.1, partX - 0.1, z1, {
    ceilY,
    gaps: { W: [c.gapOf(d, 0.12), ...winGaps("livery", "W")] },
  });
  P.desk(b, m, 83.0, z1 - 0.55, 1.7, 0.85, m.woodMid);
  P.chair(b, m, 83.0, z1 - 1.4, -Math.PI / 2);
  b.box(m.paper, 82.6, 0.8, z1 - 0.7, 83.1, 0.81, z1 - 0.4, { collide: false });
  b.cyl(m.iron, 83.5, z1 - 0.5, 0.8, 0.9, 0.04, { seg: 6 });
  b.decal(c.signMat(["Harness and Saddlery"], 1.9, 0.42, { bg: "#241d16", fg: "#dfb44e" }), 83.0, 2.55, z1 - 0.012, 1.9, 0.42, "N");
  P.pictureFrame(b, m, 81.4, 2.2, z1, 0.9, 0.7, "N", "landscape", { frame: m.woodDark });
  b.cyl(m.woodDark, 84.6, z1 - 0.05, 2.25, 2.32, 0.22, { seg: 14 });
  b.decal(m.paper, 84.6, 2.28, z1 - 0.112, 0.36, 0.36, "N");
  P.stove(b, m, 81.6, 41.0, ceilY);
  for (const [hx, hz, f] of [
    [82.8, partZ + 0.1, "S"],
    [84.4, partZ + 0.1, "S"],
    [x0, 42.4, "E"],
    [x0, 45.2, "E"],
  ] as const) {
    b.decal(c.signMat(["U"], 0.3, 0.3, { bg: "#a98e66", fg: "#3a3630" }), hx + (f === "E" ? 0.012 : 0), 2.1, hz + (f === "S" ? 0.012 : 0), 0.3, 0.3, f);
  }
  P.pictureFrame(b, m, 83.6, 2.2, partZ + 0.1, 1.0, 0.75, "S", "landscape", { frame: m.woodDark });
  P.sconce(b, m, 84.7, 2.3, partZ + 0.16, "S");
  P.fakeDoor(b, m, partX - 0.1, 0, 43.7, 1.15, 2.3, "W", { label: "PRIVATE", plate: { bg: "#e6dcba", fg: "#33261a" }, mat: m.woodMid });
  b.decal(c.posterMat("wanted2"), partX - 0.1 - 0.012, 1.6, 46.0, 0.8, 1.05, "W");
  b.box(m.woodDark, partX - 0.16, 1.85, 41.0, partX - 0.1, 1.97, 42.3, { collide: false });
  for (let i = 0; i < 6; i += 1) {
    b.box(m.brass, partX - 0.22, 1.89, 41.1 + i * 0.22, partX - 0.16, 1.93, 41.14 + i * 0.22, { collide: false });
  }
  // saddle on its rack, bench, barrel, milk can
  b.box(m.woodDark, 84.2, 0, 42.3, 84.4, 0.85, 43.7);
  b.box(m.woodDark, 85.0, 0, 42.3, 85.2, 0.85, 43.7);
  b.box(m.woodDark, 84.2, 0.8, 42.9, 85.2, 0.92, 43.1, { collide: false });
  b.rotBox(m.woodMid, 84.7, 1.02, 43, 1.0, 0.22, 0.75, 0, { collide: false });
  b.rotBox(m.leatherRed, 84.7, 1.14, 43, 0.7, 0.1, 0.55, 0, { collide: false });
  P.bench(b, m, 81.6, 46.0, 1.5, "N");
  P.barrel(b, m, 80.9, 46.9, 0.4, 0.85);
  b.cyl(m.white, 84.9, 46.9, 0, 0.55, 0.16, { seg: 8 });
  P.hangLamp(b, m, 83, 43.7, ceilY, { drop: 0.7 });
  c.warm(83, 2.6, 43.7, 14, 9);
}
