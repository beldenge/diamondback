/**
 * Main Street west interiors: the Hard Drive Saloon (both floors and
 * its backlot), the jail, the bank lobby and Dr. Rodham's two rooms.
 * Plans follow the film SETs; see the notes on each block.
 */
import * as THREE from "three";
import { CAFE_DOORS, LOTS, STOREY, WALL_T, streetDoor, winGaps } from "./layout";
import * as P from "./props";
import type { Ctx } from "./interiors";

const IN = WALL_T; // shell inset: air volume = lot ± IN

export function buildWestRooms(c: Ctx): void {
  buildSaloon(c);
  buildBackshed(c);
  buildJail(c);
  buildBank(c);
  buildDoctor(c);
}

/* ------------------------------------------------------------------ */
/* Hard Drive Saloon — `_SALLOWER` 3×6 @2.84: street door at the north */
/* end of the east wall, café doors, the bar down the west wall, the   */
/* stairs along the south wall rising WEST from the south-east corner */
/* (D6 W), piano beneath them; `_SALUPPER` corridor above the bar with */
/* rooms 1–3 facing east and Ruby's room 4 across the north end.       */

function buildSaloon(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.saloon;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const d = streetDoor("saloon");
  const backDoorGap = { from: 65.6, to: 67.0, top: 2.6 };
  const slabY = 3.4; // upper floor slab bottom = lower ceiling

  c.lining(m.wpSaloon, x0, z0, x1, z1, {
    wainscot: m.woodSaloon,
    wainscotH: 1.05,
    ceilY: slabY,
    ceil: null,
    gaps: {
      E: [c.gapOf(d, 0.12), ...winGaps("saloon", "E")],
      W: [backDoorGap, ...winGaps("saloon", "W")],
      N: winGaps("saloon", "N"),
    },
  });
  // dark pilasters along the long walls
  for (const pz of [60.2, 64.2, 68.2, 72.2]) {
    b.box(m.woodSaloon, x0 + 0.04, 0, pz - 0.12, x0 + 0.16, slabY, pz + 0.12, { collide: false });
  }
  for (const px of [38.2, 42.2]) {
    b.box(m.woodSaloon, px - 0.12, 0, z0 + 0.04, px + 0.12, slabY, z0 + 0.16, { collide: false });
  }
  // upper floor slab with the stairwell hole along the south wall
  // the stair turns at the bottom (D6 W): three steps up from the room
  // to a low landing in the south-east corner, then the long flight
  // west along the south wall; a railed passage runs over the flight
  // to the east window (A4 E)
  const stairZ0 = z1 - 1.4;
  const stairHoleX = 39.1;
  const bendX = 43.8;
  const landY = 0.75;
  b.box(m.floorWood, x0, slabY, z0, x1, STOREY, stairZ0);
  b.box(m.floorWood, x0, slabY, stairZ0, stairHoleX, STOREY, z1);
  // ceiling beams under the slab
  for (const bz of [59.5, 63.5, 67.5, 71.5]) {
    b.box(m.woodSaloon, x0, slabY - 0.22, bz - 0.1, x1, slabY, bz + 0.1, { collide: false });
  }

  /* ---- the bar along the west wall ---- */
  const barZ0 = 57.9;
  const barZ1 = 66.3;
  // backbar body + bottle shelf + the reclining nude + three arched mirrors
  b.box(m.woodSaloon, x0, 0, barZ0, x0 + 0.55, 2.95, barZ1);
  b.box(m.woodSaloon, x0, 2.95, barZ0 - 0.1, x0 + 0.62, 3.1, barZ1 + 0.1, { collide: false });
  b.decal(P.shelfMat("bottles", 1), x0 + 0.562, 1.25, 62.1, 8.0, 0.5, "E");
  P.pictureFrame(b, m, x0 + 0.55, 2.25, 59.4, 2.0, 1.15, "E", "odalisque", { frame: m.brass, px: 128, py: 72 });
  for (const az of [61.6, 63.2, 64.8]) {
    b.decal(P.pictureMat("mirror", 64, 96), x0 + 0.565, 2.2, az, 0.9, 1.3, "E");
    b.archWall(m.woodSaloon, "z", az - 0.62, az + 0.62, x0 + 0.62, 1.6, 2.85, az, 0.9, 2.75, 0.1, { collide: false });
  }
  b.box(m.woodSaloon, x0 + 0.55, 1.55, 61.0, x0 + 0.68, 1.65, 65.5, { collide: false });
  // counter with a polished top, brass foot rail, kegs and bottles
  P.counter(b, m, x0 + 1.15, barZ0, x0 + 2.35, barZ1, 1.15, m.woodSaloon, m.woodDark);
  b.box(m.brass, x0 + 2.55, 0.22, barZ0 + 0.2, x0 + 2.61, 0.28, barZ1 - 0.2, { collide: false });
  for (const kz of [63.6, 64.8]) {
    P.keg(b, m, x0 + 1.75, 1.15, kz, true, 0.24, 0.5);
  }
  for (let i = 0; i < 4; i += 1) {
    b.cyl(m.cactusDark, x0 + 1.5 + (i % 2) * 0.25, 58.6 + i * 0.45, 1.15, 1.42, 0.05, { seg: 6 });
  }
  for (const cz of [59.5, 61.9]) {
    b.cyl(m.brass, x0 + 1.9, cz, 1.15, 1.5, 0.045, { seg: 6 });
    b.box(m.glassWarm, x0 + 1.86, 1.5, cz - 0.04, x0 + 1.94, 1.66, cz + 0.04, { collide: false });
  }
  b.cyl(m.brass, x0 + 1.7, 65.6, 1.15, 1.25, 0.16, { seg: 9 }); // tray

  /* ---- floor: tables, chairs, the slot machine, drapes ---- */
  P.tableRound(b, m, 40.3, 62.6);
  P.chair(b, m, 39.4, 63.3, 2.4);
  P.chair(b, m, 41.2, 62.0, -0.7);
  P.chair(b, m, 40.1, 61.7, 1.6);
  P.tableRound(b, m, 42.0, 67.0);
  P.chair(b, m, 42.9, 67.6, -2.3);
  P.chair(b, m, 41.1, 67.5, 2.6);
  P.tableRound(b, m, 39.2, 69.9, 0.6);
  P.chair(b, m, 38.4, 70.6, 2.2);
  P.chair(b, m, 40.0, 69.2, -0.9);
  P.spittoon(b, m, 42.3, 61.4);
  P.spittoon(b, m, 38.0, 67.4);
  // entry vestibule (film 300_5 / 294_5): the café doors hang in an
  // arched partition one tile in, and the vestibule is closed to the
  // south, so the doors swing in a wall instead of floating
  const vestS = 60.55;
  const cafeHalf = CAFE_DOORS.width / 2 + 0.16;
  c.partZ(m.woodSaloon, z0, vestS, CAFE_DOORS.x, 0, slabY, [{ from: CAFE_DOORS.z - cafeHalf, to: CAFE_DOORS.z + cafeHalf, top: 2.95 }]);
  for (const pz of [CAFE_DOORS.z - cafeHalf - 0.1, CAFE_DOORS.z + cafeHalf + 0.1]) {
    b.cyl(m.woodSaloon, CAFE_DOORS.x, pz, 0, 2.95, 0.1, { rTop: 0.08, seg: 8 });
    b.cyl(m.woodSaloon, CAFE_DOORS.x, pz, 0, 0.35, 0.14, { seg: 8 });
    b.cyl(m.woodSaloon, CAFE_DOORS.x, pz, 1.25, 1.42, 0.14, { seg: 8 });
  }
  b.box(m.woodSaloon, CAFE_DOORS.x - 0.14, 2.95, CAFE_DOORS.z - cafeHalf - 0.25, CAFE_DOORS.x + 0.14, 3.15, CAFE_DOORS.z + cafeHalf + 0.25, { collide: false });
  c.partX(m.woodSaloon, CAFE_DOORS.x, x1, vestS, 0, slabY);
  P.wallLantern(b, m, CAFE_DOORS.x + 0.1, 2.2, 57.3, "E");
  P.wallLantern(b, m, CAFE_DOORS.x - 0.1, 2.2, 60.2, "W");
  P.pictureFrame(b, m, 44.4, 2.2, vestS - 0.1, 0.9, 0.7, "N", "landscape");
  c.warm(44.2, 2.8, 58.3, 9, 6);
  // Lucky Jack's slot machine stands in the curtained bay of the north
  // street window; both street windows hang with red drapes from inside
  // (B4 E / C3 E / D5 E), a landscape on the wall between them
  const sz = 64.05;
  b.box(m.woodSaloon, x1 - 0.62, 0, sz - 0.45, x1 - 0.04, 0.9, sz + 0.45);
  b.box(m.gold, x1 - 0.66, 0.9, sz - 0.5, x1 - 0.04, 2.25, sz + 0.5);
  b.cyl(m.gold, x1 - 0.35, sz, 2.25, 2.5, 0.42, { seg: 12 });
  b.decal(
    c.signMat(["LUCKY JACK'S", "SLOT MACHINE"], 0.9, 0.8, { bg: "#7a5a1e", fg: "#efe0b0", border: "#3c2c10" }),
    x1 - 0.672,
    1.75,
    sz,
    0.9,
    0.8,
    "W",
  );
  b.box(m.iron, x1 - 0.7, 1.3, sz + 0.32, x1 - 0.62, 1.7, sz + 0.4, { collide: false }); // lever
  b.box(m.glassCold, x1 - 0.67, 1.05, sz - 0.35, x1 - 0.64, 1.35, sz + 0.35, { collide: false }); // reels
  for (const [wz, hw] of [
    [64.05, 1.75],
    [71.5, 1.75],
  ] as const) {
    P.curtain(b, m, x1, 0.15, wz - hw + 0.55, 1.1, 3.0, "W");
    P.curtain(b, m, x1, 0.15, wz + hw - 0.55, 1.1, 3.0, "W");
    b.box(m.curtainRed, x1 - 0.1, 0.15, wz - hw, x1 - 0.04, 3.15, wz + hw, { collide: false });
    b.box(m.woodSaloon, x1 - 0.2, 3.05, wz - hw - 0.1, x1 - 0.02, 3.3, wz + hw + 0.1, { collide: false });
  }
  P.pictureFrame(b, m, x1, 2.3, 67.75, 1.2, 0.9, "W", "landscape");
  // paintings, house rules, deer head, sconces
  P.pictureFrame(b, m, x0, 2.25, 68.4, 1.2, 0.9, "E", "landscape");
  P.pictureFrame(b, m, x0, 2.3, 70.6, 0.9, 1.1, "E", "portrait", { px: 96, py: 128 });
  b.decal(
    c.signMat(
      ["HOUSE RULES", "No spurs on the bar", "No shooting the lamps", "Settle up nightly", "Ladies upstairs only"],
      1.3,
      1.0,
      { bg: "#3e2a1c", fg: "#e6dcba", border: "#6b5b3c" },
    ),
    x0 + 0.012,
    2.1,
    72.9,
    1.3,
    1.0,
    "E",
  );
  P.trophyHead(b, m, x0 + 0.02, 2.35, 69.6, "E");
  P.pictureFrame(b, m, 39.4, 2.3, z0, 1.1, 0.85, "S", "flowers");
  P.pictureFrame(b, m, 41.5, 2.3, z0, 1.0, 0.8, "S", "landscape");
  P.pictureFrame(b, m, 43.8, 2.3, z0, 1.3, 0.95, "S", "landscape");
  P.sconce(b, m, 40.5, 2.25, z0 + 0.06, "S");
  P.sconce(b, m, x1 - 0.06, 2.25, 60.3, "W");
  P.sconce(b, m, x0 + 0.06, 2.25, 73.9, "E");
  P.candleWheel(b, m, 41.0, 63.5, 2.9, 0.75, 6, slabY);
  P.candleWheel(b, m, 41.0, 69.2, 2.9, 0.75, 6, slabY);
  P.hangLamp(b, m, 37.2, 62, slabY, { drop: 0.7 });
  b.flat(m.rug, 39.2, 61.2, 44.3, 64.6, 0.05, { texWorld: 1.6 });

  /* ---- the stairs: three steps south to the corner landing, then west along the south wall; piano beneath ---- */
  const stairFoot = x1 - 0.15;
  P.railStairs(b, m, bendX, stairZ0 - 1.4, stairFoot - bendX, landY, 1.4, "S", {
    rail: "right",
    runner: m.leatherRed,
    steps: 3,
    mat: m.woodMid,
  });
  b.box(m.woodMid, bendX, landY - 0.18, stairZ0, stairFoot, landY, z1);
  b.flat(m.leatherRed, bendX + 0.25, stairZ0 + 0.25, stairFoot - 0.25, z1 - 0.25, landY + 0.008);
  P.railStairs(b, m, bendX, stairZ0, z1 - stairZ0, STOREY - landY, bendX - stairHoleX, "W", {
    rail: "right",
    runner: m.leatherRed,
    steps: 11,
    mat: m.woodMid,
    baseY: landY,
    hollow: true,
  });
  // the landing is boxed to the floor; the flight above is open underneath for the piano
  b.box(m.woodSaloon, bendX, 0, stairZ0, stairFoot, landY - 0.18, z1);
  P.piano(b, m, 40.0, z1, "N");
  P.pictureFrame(b, m, 37.9, 2.4, z1, 1.1, 0.85, "N", "landscape"); // under the stair top, south wall
  c.warm(40.7, 3.0, 63.5, 18, 11);
  c.warm(40.7, 3.0, 69.2, 14, 9);
  c.warm(37.0, 2.6, 62, 10, 6);

  /* ================= upstairs ================= */
  const up = STOREY;
  const upCeil = up + 3.0;
  const partX = 38.3; // corridor / rooms partition
  const partZ4 = 62.5; // room 4 south wall
  const partZ1 = 68.2; // room 1 north wall
  const d4 = c.door("salUp4");
  const d1 = c.door("salUp1");
  // partitions
  c.partX(m.wpSalUpper, x0, x1, partZ4, up, upCeil, [c.gapOf(d4, 0.08)]);
  c.partZ(m.wpSalUpper, partZ4, 72.1, partX, up, upCeil, [c.gapOf(d1, 0.08)]);
  c.partX(m.wpSalUpper, partX, x1, partZ1, up, upCeil);
  c.partX(m.wpSalUpper, partX, x1, 65.3, up, upCeil);
  // corridor (west side, over the bar) + the stair-top landing strip
  c.lining(m.wpSalUpper, x0, partZ4 + 0.1, partX - 0.1, z1, {
    y0: up,
    floor: null,
    ceilY: upCeil,
    ceil: m.woodSaloon,
    wainscot: m.woodSaloon,
    wainscotH: 0.9,
    gaps: {
      N: [c.gapOf(d4, 0.08)],
      E: [{ from: stairZ0 - 1.4, to: z1, top: upCeil }, c.gapOf(d1, 0.08)],
      W: winGaps("saloon", "W"),
    },
  });
  // the rail along the passage over the flight
  P.balustrade(b, m, stairHoleX, stairZ0, x1, stairZ0, up, 0.95);
  b.box(m.woodSaloon, stairHoleX - 0.06, up, stairZ0 - 0.06, stairHoleX + 0.06, up + 1.1, stairZ0 + 0.06, { collide: false });
  b.flat(m.rug, x0 + 0.5, partZ4 + 0.5, partX - 0.4, z1 - 0.3, up + 0.05, { texWorld: 1.6 });
  // numbered doors 3 and 2 painted shut, room 1 real; sconces between
  for (const [dz, num] of [
    [63.9, "3"],
    [66.8, "2"],
  ] as const) {
    P.fakeDoor(b, m, partX - 0.1, up, dz, 1.05, 2.25, "W", { label: num });
  }
  b.decal(c.signMat(["1"], 0.5, 0.4, { bg: "#3a2b1f", fg: "#dfb44e" }), partX - 0.1 - 0.012, up + 2.55, 69.9, 0.5, 0.4, "W");
  b.decal(c.signMat(["4"], 0.5, 0.4, { bg: "#3a2b1f", fg: "#dfb44e" }), 36.7, up + 2.55, partZ4 + 0.1 + 0.012, 0.5, 0.4, "S");
  P.sconce(b, m, partX - 0.16, up + 2.0, 65.35, "W");
  P.sconce(b, m, partX - 0.16, up + 2.0, 68.35, "W");
  P.sconce(b, m, x0 + 0.06, up + 2.0, 65.9, "E");
  P.sconce(b, m, x0 + 0.06, up + 2.0, 71.9, "E");
  P.pictureFrame(b, m, x0, up + 2.1, 66.7, 1.1, 0.8, "E", "landscape");
  P.pictureFrame(b, m, x0, up + 2.1, 70.0, 1.1, 0.8, "E", "desert");
  P.pictureFrame(b, m, x0, up + 2.1, 73.2, 0.75, 0.95, "E", "lady", { px: 96, py: 128 });
  P.trophyHead(b, m, x0 + 0.02, up + 2.3, 76.0, "E");
  P.sconce(b, m, 36.7, up + 2.1, z1 - 0.06, "N");
  c.warm(36.7, up + 2.6, 65.5, 12, 8);
  c.warm(36.7, up + 2.6, 72, 10, 7);

  // room 4 across the north end: Ruby's red room
  const r4z1 = partZ4 - 0.1;
  c.lining(m.wpSalRoom, x0, z0, x1, r4z1, {
    y0: up,
    floor: null,
    ceilY: upCeil,
    ceil: m.woodSaloon,
    gaps: {
      S: [c.gapOf(d4, 0.08)],
      E: winGaps("saloon", "E"),
      N: winGaps("saloon", "N"),
    },
  });
  P.bed(b, m, 41.9, 57.8, 1.6, 2.1, "N", m.quiltGreen, { y0: up });
  P.curtain(b, m, 37.0, up + 0.4, z0, 0.5, 2.4, "S");
  P.curtain(b, m, 39.4, up + 0.4, z0, 0.5, 2.4, "S");
  P.curtain(b, m, x1, up + 0.4, 57.6, 0.5, 2.4, "W");
  P.washstand(b, m, x0, 60.2, "E", up);
  P.armoire(b, m, x0, 58.0, 1.1, "E", 2.0, up);
  P.pictureFrame(b, m, 35.6, up + 2.0, r4z1, 0.7, 0.9, "N", "lady", { px: 96, py: 128 });
  P.pictureFrame(b, m, 43.7, up + 2.0, r4z1, 0.7, 0.9, "N", "portrait", { px: 96, py: 128 });
  P.coatRack(b, m, 44.3, 61.4, up);
  P.chair(b, m, 43.6, 59.6, 0.9, up);
  P.tableSquare(b, m, 44.1, 57.4, 0.7, 0.5, 0.72, undefined, undefined, up);
  b.cyl(m.brass, 44.1, 57.4, up + 0.72, up + 0.95, 0.04, { seg: 6 });
  b.box(m.glassWarm, 44.02, up + 0.95, 57.32, 44.18, up + 1.15, 57.48, { collide: false });
  b.flat(m.rug, 38.2, 58.8, 43.5, 61.6, up + 0.05, { texWorld: 1.5 });
  c.warm(40.7, up + 2.4, 59.5, 10, 7);

  // rooms 3 + 2: closed cribs behind the painted doors (seen through the street panes)
  c.lining(m.wpSalUpper, partX + 0.1, partZ4 + 0.1, x1, 65.2, { y0: up, floor: null, ceilY: upCeil, ceil: m.woodSaloon, gaps: { E: winGaps("saloon", "E") } });
  c.lining(m.wpSalUpper, partX + 0.1, 65.4, x1, partZ1 - 0.1, { y0: up, floor: null, ceilY: upCeil, ceil: m.woodSaloon, gaps: { E: winGaps("saloon", "E") } });
  P.bed(b, m, 44.1, 63.9, 1.3, 2.0, "S", m.quiltGreen, { y0: up });
  P.bed(b, m, 44.1, 66.8, 1.3, 2.0, "N", m.rug, { y0: up });

  // room 1: Oona's, the red room off the corridor's south end
  c.lining(m.wpSalRoom, partX + 0.1, partZ1 + 0.1, x1, stairZ0 - 1.5, {
    y0: up,
    floor: null,
    ceilY: upCeil,
    ceil: m.woodSaloon,
    gaps: { W: [c.gapOf(d1, 0.08)], E: winGaps("saloon", "E") },
  });
  c.partX(m.wpSalRoom, partX, x1, stairZ0 - 1.5, up, upCeil, [], 0.1);
  P.bed(b, m, 44.4, 70.0, 1.45, 2.2, "N", m.quiltGreen, { y0: up });
  P.curtain(b, m, x1, up + 0.4, 69.3, 0.45, 2.4, "W");
  P.curtain(b, m, x1, up + 0.4, 71.1, 0.45, 2.4, "W");
  P.washstand(b, m, partX + 0.1, 71.2, "E", up);
  P.coatRack(b, m, 39.1, 68.8, up);
  P.pictureFrame(b, m, 41.3, up + 2.0, partZ1 + 0.1, 0.7, 0.9, "S", "lady", { px: 96, py: 128 });
  P.tableSquare(b, m, 42.3, 71.4, 0.6, 0.5, 0.72, undefined, undefined, up);
  b.cyl(m.brass, 42.3, 71.4, up + 0.72, up + 0.95, 0.04, { seg: 6 });
  b.box(m.glassWarm, 42.22, up + 0.95, 71.32, 42.38, up + 1.15, 71.48, { collide: false });
  c.warm(41.7, up + 2.4, 70, 9, 6);
}

/* ------------------------------------------------------------------ */
/* Saloon backlot: the storeroom between the bar and the west lane,    */
/* J4 E back door on its lane face, an open doorway into the saloon.   */

function buildBackshed(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.saloonBackshed;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  c.lining(m.woodSaloon, x0, z0, x1, z1, {
    ceilY: 3.3,
    gaps: {
      W: [c.gapOf(streetDoor("saloonBack"), 0.12)],
      E: [{ from: 65.6, to: 67.0, top: 2.6 }],
    },
  });
  P.barrel(b, m, x0 + 0.6, 61.2);
  P.barrel(b, m, x0 + 1.5, 61.0);
  P.barrel(b, m, x0 + 0.6, 62.2, 0.4, 0.85);
  P.crate(b, m, x1 - 0.7, 61.4, 1.0, 0.9, 0.2);
  P.crate(b, m, x1 - 0.7, 63.1, 0.8, 1.3, 0.1);
  P.crate(b, m, x1 - 0.65, 62.5, 0.7, 0.6, 0.3);
  P.keg(b, m, x0 + 0.7, 0, 75.4, false);
  P.keg(b, m, x0 + 0.7, 0.5, 75.4, false);
  P.sack(b, m, x0 + 0.6, 76.1);
  P.sack(b, m, x0 + 1.3, 76.5, 0.4);
  P.sack(b, m, x1 - 0.8, 76.3);
  P.shelfUnit(b, m, x1, 0, 74.5, 3.6, 2.2, 0.4, "W", "bottles", 3);
  b.decal(c.posterMat("circus"), x1 - 0.012, 1.9, 69.4, 0.85, 1.15, "W");
  b.decal(c.posterMat("wanted"), x0 + 0.012, 1.9, 64.3, 0.85, 1.15, "E");
  P.hangLamp(b, m, 34.5, 66.5, 3.3, { drop: 0.7 });
  P.hangLamp(b, m, 34.5, 74, 3.3, { drop: 0.7 });
  c.warm(34.5, 2.7, 66.5, 10, 8);
  c.warm(34.5, 2.7, 74, 8, 7);
}

/* ------------------------------------------------------------------ */
/* Jail — `_JAIL` 2×2 @3.54 filmed with its door on the west; the shop  */
/* faces Main so the plan is turned 180°: door on the east wall south */
/* of centre, the barred cell across the back (its window on the well */
/* yard), gun rack + territory map on the south wall, wanted board on */
/* the north, desk between them.                                       */

function buildJail(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.jail;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const d = streetDoor("jail");
  const cell = c.door("jailCell");
  const barsX = 42.9;
  const ceilY = 3.2;
  c.lining(m.plasterJail, x0, z0, x1, z1, {
    ceilY,
    gaps: {
      E: [c.gapOf(d, 0.12), ...winGaps("jail", "E")],
      W: winGaps("jail", "W"),
    },
  });
  // vigas
  for (const vz of [89.5, 91.2, 92.9, 94.6]) {
    b.box(m.woodDark, x0 + 0.1, ceilY - 0.26, vz - 0.1, x1 - 0.1, ceilY, vz + 0.1, { collide: false });
  }
  // the cell: a bar wall with its gate gap, rails top and bottom
  const gap = c.gapOf(cell, 0.05);
  for (let pz = z0 + 0.08; pz < z1 - 0.04; pz += 0.2) {
    if (pz > gap.from && pz < gap.to) {
      continue;
    }
    b.box(m.iron, barsX - 0.03, 0, pz - 0.03, barsX + 0.03, ceilY, pz + 0.03, { collide: false });
  }
  b.box(m.iron, barsX - 0.05, ceilY - 0.3, z0, barsX + 0.05, ceilY - 0.2, z1, { collide: false });
  b.box(m.iron, barsX - 0.05, 0.12, z0, barsX + 0.05, 0.22, gap.from, { collide: false });
  b.box(m.iron, barsX - 0.05, 0.12, gap.to, barsX + 0.05, 0.22, z1, { collide: false });
  b.box(m.iron, barsX - 0.05, 2.4, gap.from - 0.05, barsX + 0.05, 2.5, gap.to + 0.05, { collide: false });
  b.solid({ minX: barsX - 0.06, minY: 0, minZ: z0, maxX: barsX + 0.06, maxY: ceilY, maxZ: gap.from });
  b.solid({ minX: barsX - 0.06, minY: 0, minZ: gap.to, maxX: barsX + 0.06, maxY: ceilY, maxZ: z1 });
  // inside: bunk, blanket, bucket, a barred blue window on the yard
  P.cot(b, m, x0 + 0.45, 93.8, 0.85, 1.9, true);
  b.box(m.quiltGreen, x0 + 0.08, 0.52, 93.0, x0 + 0.82, 0.62, 94.6, { collide: false });
  b.cyl(m.iron, x0 + 0.4, 89.2, 0, 0.35, 0.2, { seg: 8 });
  b.decal(m.winBlue, x0 + 0.075, 2.15, 92.8, 0.9, 0.9, "E");
  // office (_JAIL A1..B2 turned 180): the desk along the street wall's north
  // half with its chair on the room side, the filing cabinet in the corner
  // by the cell, the stove against the bars at the south, rug under the desk
  P.desk(b, m, 46.0, 89.6, 0.9, 1.8, m.woodDark);
  b.box(m.paper, 45.8, 0.8, 89.2, 46.2, 0.81, 89.7, { collide: false });
  b.cyl(m.iron, 46.1, 90.2, 0.8, 0.9, 0.04, { seg: 6 }); // inkwell
  b.cyl(m.iron, 45.9, 90.0, 0.8, 0.95, 0.09, { seg: 8 }); // pot
  for (const [bx, bmat] of [
    [46.2, m.leatherRed],
    [46.28, m.woodDark],
    [46.36, m.leatherRed],
  ] as const) {
    b.box(bmat, bx - 0.035, 0.8, 88.78, bx + 0.035, 1.04, 88.98, { collide: false }); // ledgers
  }
  P.chair(b, m, 44.9, 89.6, 0);
  b.box(m.woodMid, 43.55, 0, z0 + 0.05, 44.35, 1.35, z0 + 0.6); // filing cabinet
  for (const dy of [0.3, 0.7, 1.1]) {
    b.box(m.brass, 43.9, dy, z0 + 0.6, 44.0, dy + 0.04, z0 + 0.63, { collide: false });
  }
  b.cyl(m.woodMid, 43.2, z0 + 0.5, 0, 0.32, 0.18, { seg: 8 }); // bucket
  b.cyl(m.woodMid, 44.1, z1 - 0.45, 0, 0.32, 0.18, { seg: 8 }); // bucket by the map
  P.stove(b, m, 43.3, 94.5, ceilY);
  P.chair(b, m, 45.05, z1 - 0.45, Math.PI / 2);
  P.coatRack(b, m, x1 - 0.4, 92.4);
  b.flat(m.rug, 44.6, 88.5, 47.2, 90.9, 0.06, { texWorld: 1.4 });
  // north wall (A1 S / B2 S): a small picture over the bucket, the
  // calendar, the wanted board; south wall (A2 N): the gun rack at the
  // east end, the big territory map, the chair and bucket under it
  P.pictureFrame(b, m, 43.4, 2.1, z0, 0.42, 0.55, "S", "landscape", { frame: m.woodDark });
  b.decal(c.signMat(["MAY", "1882"], 0.55, 0.7, { bg: "#e6dcba", fg: "#33261a", border: "#8a7a52" }), 44.95, 2.05, z0 + 0.012, 0.55, 0.7, "S");
  b.decal(new THREE.MeshLambertMaterial({ map: P.wantedBoard() }), 46.35, 2.0, z0 + 0.012, 1.9, 1.15, "S");
  P.pictureFrame(b, m, 44.2, 2.0, z1, 1.95, 1.45, "N", "map", { frame: m.woodDark });
  b.box(m.woodDark, 46.05, 1.3, z1 - 0.32, 47.75, 1.4, z1 - 0.04, { collide: false });
  b.box(m.woodDark, 46.05, 1.3, z1 - 0.32, 46.15, 2.5, z1 - 0.04, { collide: false });
  b.box(m.woodDark, 47.65, 1.3, z1 - 0.32, 47.75, 2.5, z1 - 0.04, { collide: false });
  b.box(m.woodDark, 46.05, 2.42, z1 - 0.3, 47.75, 2.5, z1 - 0.04, { collide: false });
  for (const gx of [46.5, 46.9, 47.3]) {
    b.cyl(m.iron, gx, z1 - 0.18, 1.4, 2.55, 0.025, { seg: 5 });
    b.box(m.woodMid, gx - 0.035, 1.4, z1 - 0.22, gx + 0.035, 1.9, z1 - 0.14, { collide: false });
  }
  // street wall (B2 W): the sheriff's portrait, then the barred window
  // shuttered from inside, the coat rack, the door
  b.box(m.woodBlack, x1 - 0.06, 1.0, 89.28, x1 + 0.02, 2.85, 90.32, { collide: false });
  b.box(m.woodDark, x1 - 0.08, 1.0, 89.77, x1 + 0.02, 2.85, 89.83, { collide: false });
  P.pictureFrame(b, m, x1, 2.05, 88.72, 0.5, 0.7, "W", "portrait", { frame: m.woodDark, px: 96, py: 128 });
  // one lantern on a hook over the desk lights the whole office
  P.hangLantern(b, m, 47.05, 89.0, ceilY, 0.28);
  c.warm(46.9, 2.6, 89.2, 13, 8);
  c.warm(44.5, 2.7, 92.5, 8, 7);
}

/* ------------------------------------------------------------------ */
/* Bank — `_BANK` 1×3 @3.54: a narrow lobby along the street, the       */
/* teller's arched brass cage in the middle of the back wall, the      */
/* vault door at its north end, certificates and a clock on the walls. */

function buildBank(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.bank;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const partX = 42; // lobby / teller-room partition
  const x0 = partX + 0.1;
  const d = streetDoor("bank");
  const ceilY = 3.4;
  c.lining(m.bankInner, x0, z0, x1, z1, {
    ceilY,
    ceil: m.redCeiling,
    skip: ["W"],
    gaps: { E: [c.gapOf(d, 0.12), ...winGaps("bank", "E")] },
  });
  // the partition: vault bay (north), arched teller window, plain south
  const tellerZ = 43.3;
  c.partZ(m.bankInner, z0, tellerZ - 0.85, partX, 0, ceilY);
  c.partZ(m.bankInner, tellerZ + 0.85, z1, partX, 0, ceilY);
  b.archWall(m.woodBlack, "z", tellerZ - 0.85, tellerZ + 0.85, partX, 1.05, ceilY, tellerZ, 1.5, 2.7, 0.2);
  b.box(m.woodBlack, partX - 0.1, 0, tellerZ - 0.85, partX + 0.1, 1.05, tellerZ + 0.85);
  b.box(m.woodDark, partX - 0.25, 1.05, tellerZ - 0.9, partX + 0.3, 1.12, tellerZ + 0.9, { collide: false });
  for (let i = 0; i <= 6; i += 1) {
    const bz = tellerZ - 0.66 + (i / 6) * 1.32;
    b.box(m.brass, partX - 0.03, 1.12, bz - 0.02, partX + 0.03, 2.7 - Math.abs(i - 3) * 0.05, bz + 0.02, { collide: false });
  }
  b.solid({ minX: partX - 0.1, minY: 1.05, minZ: tellerZ - 0.85, maxX: partX + 0.1, maxY: 2.7, maxZ: tellerZ + 0.85 });
  b.decal(c.signMat(["TELLER"], 1.1, 0.36, { bg: "#efeadb", fg: "#241d16", border: "#b08d3f" }), partX + 0.1 + 0.012, 2.95, tellerZ, 1.1, 0.36, "E");
  // the vault (D1 W): a tall steel door, gold lettering above a spoked
  // wheel, three brass hinges down its north edge
  {
    const vz = 41.5;
    b.box(m.woodBlack, partX + 0.1, 0.1, vz - 1.05, partX + 0.16, 2.85, vz + 1.05, { collide: false });
    b.box(m.iron, partX + 0.16, 0.2, vz - 0.85, partX + 0.36, 2.7, vz + 0.85, { collide: false });
    P.spokedWheel(b, m, partX + 0.42, vz, 0.42, { y: 1.2, rotY: Math.PI / 2, mat: m.iron });
    b.box(m.brass, partX + 0.36, 1.6, vz - 0.03, partX + 0.5, 1.64, vz + 0.03, { collide: false }); // axle
    for (const hy of [0.5, 1.4, 2.3]) {
      b.box(m.brass, partX + 0.3, hy, vz - 0.98, partX + 0.42, hy + 0.3, vz - 0.82, { collide: false });
    }
    b.decal(
      c.signMat(["DIAMONDBACK", "BANK & TRUST"], 1.4, 0.5, { bg: "#17130f", fg: "#dfb44e" }),
      partX + 0.372,
      2.25,
      vz,
      1.4,
      0.5,
      "E",
    );
    b.solid({ minX: partX, minY: 0, minZ: vz - 1.05, maxX: partX + 0.5, maxY: 2.85, maxZ: vz + 1.05 });
  }
  // furniture: benches, writing table with a green lamp, coat racks
  P.bench(b, m, x1 - 0.35, 42.6, 0.9, "W");
  P.tableSquare(b, m, 44.5, z1 - 0.55, 1.5, 0.7, 0.8, m.woodMid, m.woodDark);
  b.cyl(m.brass, 45.0, z1 - 0.55, 0.8, 1.05, 0.035, { seg: 6 });
  b.cone(m.cactusDark, 45.0, z1 - 0.55, 1.03, 1.23, 0.19, 8);
  b.box(m.paper, 44.0, 0.8, z1 - 0.75, 44.5, 0.81, z1 - 0.4, { collide: false });
  b.cyl(m.iron, 44.2, z1 - 0.3, 0.8, 0.9, 0.04, { seg: 6 });
  c.light(45.0, 1.25, z1 - 0.55, 0xa8d8a0, 6, 4);
  P.coatRack(b, m, x1 - 0.5, z0 + 0.5);
  P.coatRack(b, m, x1 - 0.55, 45.3);
  P.spittoon(b, m, 46.8, 41.6);
  // the street windows keep their shades down (D1 E / D3 E)
  P.blind(b, m, x1, 1.95, 46.5, 1.25, 2.05, "W");
  P.blind(b, m, x1, 1.95, 41.7, 1.25, 2.05, "W");
  // certificates on three walls, the clock over the writing table (D3 S)
  P.pictureFrame(b, m, 45.0, 2.15, z0, 1.2, 0.85, "S", "certificate", { frame: m.woodDark });
  P.pictureFrame(b, m, 46.4, 2.2, z1, 0.95, 0.7, "N", "certificate", { frame: m.woodDark });
  P.pictureFrame(b, m, 44.2, 2.5, z1, 0.8, 0.6, "N", "certificate", { frame: m.woodDark });
  P.pictureFrame(b, m, x1, 2.15, 45.5, 0.7, 0.6, "W", "certificate", { frame: m.woodDark });
  P.wallClock(b, m, 45.4, 2.3, z1, "N");
  P.hangLamp(b, m, 45, 41.6, ceilY, { green: true, drop: 0.85 });
  P.hangLamp(b, m, 45, 45.6, ceilY, { green: true, drop: 0.85 });
  c.light(45, 2.5, 41.6, 0xcfe8b0, 11, 8);
  c.light(45, 2.5, 45.6, 0xcfe8b0, 9, 7);
}

/* ------------------------------------------------------------------ */
/* Dr. Rodham — `_DOCTOR1` waiting room on the street, `_DOCTOR2` the   */
/* inner office behind the "DR. H. RODHAM" door on its west wall.       */

function buildDoctor(c: Ctx): void {
  const { b, m } = c;
  const r = LOTS.doctor;
  const x0 = r.minX + IN;
  const x1 = r.maxX - IN;
  const z0 = r.minZ + IN;
  const z1 = r.maxZ - IN;
  const d = streetDoor("doctor");
  const inner = c.door("doctorInner");
  const partX = 43;
  const ceilY = 3.2;
  c.partZ(m.woodDoctor, z0, z1, partX, 0, ceilY, [c.gapOf(inner, 0.08)]);
  // waiting room
  c.lining(m.woodDoctor, partX + 0.1, z0, x1, z1, {
    ceilY,
    gaps: { E: [c.gapOf(d, 0.12), ...winGaps("doctor", "E")], W: [c.gapOf(inner, 0.08)] },
  });
  // north wall (B1 N): the clock, the diploma, the desk under them with
  // its books, the portrait, a lamp on a round table in the corner
  P.desk(b, m, 45.6, z0 + 0.55, 1.5, 0.8, m.woodMid);
  for (const [bx, bmat] of [
    [45.2, m.leatherRed],
    [45.29, m.woodDark],
    [45.38, m.quiltGreen],
  ] as const) {
    b.box(bmat, bx - 0.04, 0.8, z0 + 0.25, bx + 0.04, 1.06, z0 + 0.5, { collide: false });
  }
  b.cyl(m.iron, 46.1, z0 + 0.4, 0.8, 0.9, 0.04, { seg: 6 });
  P.tableRound(b, m, 47.2, z0 + 0.7, 0.35);
  b.cyl(m.brass, 47.2, z0 + 0.7, 0.75, 1.0, 0.035, { seg: 6 });
  b.cone(m.leatherRed, 47.2, z0 + 0.7, 0.98, 1.17, 0.18, 8);
  c.light(47.2, 1.2, z0 + 0.7, 0xffd9a0, 5, 4);
  P.wallClock(b, m, 44.85, 2.4, z0, "S");
  P.pictureFrame(b, m, 45.7, 2.35, z0, 1.0, 0.7, "S", "certificate", { frame: m.woodDark });
  P.pictureFrame(b, m, 46.7, 2.3, z0, 0.55, 0.75, "S", "portrait", { frame: m.woodDark, px: 96, py: 128 });
  // south wall (B1 S): the coat rack in the corner, the Macassar oil
  // bill, an oval portrait, the stove with its long pipe at the west
  P.coatRack(b, m, x1 - 0.55, z1 - 0.6);
  P.stove(b, m, 44.2, 37.6, ceilY);
  b.decal(c.posterMat("tonic"), 46.6, 2.0, z1 - 0.012, 0.65, 1.0, "N");
  P.pictureFrame(b, m, 45.4, 2.2, z1, 0.6, 0.72, "N", "portrait", { frame: m.woodDark, px: 96, py: 128 });
  // street wall: shades down over both windows (B1 E)
  P.blind(b, m, x1, 2.0, 38.27, 1.4, 2.0, "W");
  P.blind(b, m, x1, 2.0, 33.6, 1.3, 2.0, "W");
  P.shelfUnit(b, m, partX + 0.1, 0, 33.6, 1.7, 2.0, 0.35, "E", "books", 4);
  b.decal(c.signMat(["DR. H. RODHAM"], 0.95, 0.26, { bg: "#4a3826", fg: "#efeadb" }), partX + 0.1 + 0.012, 2.78, inner.z, 0.95, 0.26, "E");
  P.pictureFrame(b, m, partX + 0.1, 2.3, 37.0, 0.8, 0.6, "E", "landscape", { frame: m.woodDark });
  P.hangLamp(b, m, 45.5, 35.3, ceilY, { drop: 0.7 });
  b.flat(m.rug, 44.2, 34.2, 47.2, 36.6, 0.05, { texWorld: 1.4 });
  c.warm(45.5, 2.6, 35.3, 13, 8);
  // inner office
  c.lining(m.woodDoctor, x0, z0, partX - 0.1, z1, {
    ceilY,
    gaps: { E: [c.gapOf(inner, 0.08)] },
  });
  P.tableSquare(b, m, 40.6, 34.4, 1.9, 1.1, 0.9, m.woodDark, m.marble);
  b.cyl(m.white, 40.0, 34.2, 0.9, 1.22, 0.11, { seg: 8 });
  b.cyl(m.white, 41.1, 34.6, 0.9, 1.0, 0.18, { rTop: 0.2, seg: 9 });
  b.cyl(m.cactusDark, 41.4, 34.2, 0.9, 1.1, 0.04, { seg: 6 });
  P.pictureFrame(b, m, 39.6, 2.15, z0, 0.8, 1.0, "S", "anatomy", { frame: m.woodDark, px: 96, py: 128 });
  P.pictureFrame(b, m, 41.5, 2.15, z0, 0.8, 1.0, "S", "anatomy", { frame: m.woodDark, px: 96, py: 128 });
  P.pictureFrame(b, m, x0, 2.1, 34.6, 0.8, 1.2, "E", "skeleton", { frame: m.woodDark, px: 96, py: 128 });
  b.rotBox(m.iron, x0 + 0.06, 2.0, 36.6, 0.02, 0.16, 0.55, 0, { rotX: 0.5, collide: false }); // bone saw
  P.fakeDoor(b, m, x0, 0, 38.0, 1.1, 2.3, "E", { mat: m.woodDark });
  P.shelfUnit(b, m, 41.3, 0, z1, 1.9, 1.9, 0.4, "N", "vials", 3, m.woodSaloon);
  P.barrel(b, m, x0 + 0.55, z1 - 0.55, 0.4, 0.85);
  P.washstand(b, m, partX - 0.1, 37.2, "W");
  P.chair(b, m, 41.9, 36.5, 0.5);
  P.pictureFrame(b, m, 39.3, 2.15, z1, 1.1, 0.8, "N", "desert", { frame: m.woodDark });
  P.hangLamp(b, m, 40.6, 35.6, ceilY, { drop: 0.7 });
  c.warm(40.6, 2.6, 35.6, 12, 8);
}
