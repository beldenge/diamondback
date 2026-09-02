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
  const stairHoleX = 39.1;
  const stairZ0 = 72.1;
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
  b.decal(P.shelfMat("bottles", 1), x0 + 0.562, 1.35, 62.1, 8.0, 0.55, "E");
  P.pictureFrame(b, m, x0 + 0.55, 2.25, 59.4, 2.0, 1.15, "E", "odalisque", { frame: m.brass, px: 128, py: 72 });
  for (const az of [61.6, 63.2, 64.8]) {
    b.decal(P.pictureMat("mirror", 64, 96), x0 + 0.565, 2.1, az, 0.9, 1.3, "E");
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
  b.archWall(m.woodSaloon, "z", z0, vestS, CAFE_DOORS.x, 0, slabY, CAFE_DOORS.z, CAFE_DOORS.width + 0.25, 2.95, 0.2);
  c.partX(m.woodSaloon, CAFE_DOORS.x, x1, vestS, 0, slabY);
  P.wallLantern(b, m, CAFE_DOORS.x + 0.1, 2.2, 57.3, "E");
  P.wallLantern(b, m, CAFE_DOORS.x - 0.1, 2.2, 60.2, "W");
  P.pictureFrame(b, m, 44.4, 2.2, vestS - 0.1, 0.9, 0.7, "N", "landscape");
  c.warm(44.2, 2.8, 58.3, 9, 6);
  // Lucky Jack's slot machine between the porch windows
  b.box(m.woodSaloon, x1 - 0.62, 0, 62.85, x1 - 0.04, 0.9, 63.75);
  b.box(m.gold, x1 - 0.66, 0.9, 62.8, x1 - 0.04, 2.25, 63.8);
  b.cyl(m.gold, x1 - 0.35, 63.3, 2.25, 2.5, 0.42, { seg: 12 });
  b.decal(
    c.signMat(["LUCKY JACK'S", "SLOT MACHINE"], 0.9, 0.8, { bg: "#7a5a1e", fg: "#efe0b0", border: "#3c2c10" }),
    x1 - 0.672,
    1.75,
    63.3,
    0.9,
    0.8,
    "W",
  );
  b.box(m.iron, x1 - 0.7, 1.3, 63.62, x1 - 0.62, 1.7, 63.7, { collide: false }); // lever
  b.box(m.glassCold, x1 - 0.67, 1.05, 62.95, x1 - 0.64, 1.35, 63.65, { collide: false }); // reels
  // red drapes on the street wall + across the back corner
  P.curtain(b, m, x1, 0.15, 67.8, 0.9, 3.0, "W");
  P.curtain(b, m, x1, 0.15, 71.75, 0.55, 3.0, "W");
  // paintings, house rules, deer head, sconces
  P.pictureFrame(b, m, x0, 2.25, 68.4, 1.2, 0.9, "E", "landscape");
  P.pictureFrame(b, m, x0, 2.3, 70.6, 0.9, 1.1, "E", "portrait", { px: 96, py: 128 });
  b.decal(
    c.signMat(
      ["HOUSE RULES", "No spurs on the bar", "No shooting the lamps", "Settle up nightly", "Ladies upstairs only"],
      1.0,
      1.1,
      { bg: "#c9b98a", fg: "#33261a", border: "#6b5b3c" },
    ),
    x0 + 0.012,
    2.05,
    72.9,
    1.0,
    1.1,
    "E",
  );
  P.trophyHead(b, m, x0 + 0.02, 2.35, 69.6, "E");
  P.pictureFrame(b, m, 38.9, 2.3, z0, 1.3, 0.95, "S", "landscape");
  P.pictureFrame(b, m, 44.0, 2.3, z0, 1.3, 0.95, "S", "desert");
  P.sconce(b, m, 41.3, 2.25, z0 + 0.06, "S");
  P.sconce(b, m, x1 - 0.06, 2.25, 60.3, "W");
  P.sconce(b, m, x0 + 0.06, 2.25, 73.9, "E");
  P.candleWheel(b, m, 41.0, 63.5, 2.9, 0.75, 6, slabY);
  P.candleWheel(b, m, 41.0, 69.2, 2.9, 0.75, 6, slabY);
  P.hangLamp(b, m, 37.2, 62, slabY, { drop: 0.7 });
  b.flat(m.rug, 39.2, 61.2, 44.3, 64.6, 0.05, { texWorld: 1.6 });

  /* ---- stairs up along the south wall, rising west; piano beneath ---- */
  const stairFoot = x1 - 0.15;
  P.railStairs(b, m, stairFoot, stairZ0, z1 - stairZ0, STOREY, stairFoot - stairHoleX, "W", {
    rail: "right",
    runner: m.leatherRed,
    steps: 14,
    mat: m.woodMid,
  });
  // closed stringer under the stair, room side
  b.rotBox(m.woodSaloon, (stairFoot + stairHoleX) / 2, STOREY / 2 - 0.3, stairZ0 + 0.06, Math.hypot(stairFoot - stairHoleX, STOREY), 0.5, 0.06, 0, {
    rotZ: -Math.atan2(STOREY, stairFoot - stairHoleX),
    collide: false,
  });
  P.piano(b, m, 42.1, z1, "N");
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
      E: [{ from: stairZ0, to: z1, top: upCeil }, c.gapOf(d1, 0.08)],
      W: winGaps("saloon", "W"),
    },
  });
  // the stairwell's east + south walls are the shell; fence the hole
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
  P.trophyHead(b, m, 36.7, up + 2.25, z1 - 0.02, "N");
  P.trophyHead(b, m, x0 + 0.02, up + 2.3, 63.5, "E");
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
  c.lining(m.wpSalRoom, partX + 0.1, partZ1 + 0.1, x1, stairZ0 - 0.1, {
    y0: up,
    floor: null,
    ceilY: upCeil,
    ceil: m.woodSaloon,
    gaps: { W: [c.gapOf(d1, 0.08)], E: winGaps("saloon", "E") },
  });
  c.partX(m.wpSalRoom, partX, x1, stairZ0 - 0.1, up, upCeil, [], 0.1);
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
  P.sack(b, m, x0 + 0.6, 77.8);
  P.sack(b, m, x0 + 1.3, 78.3, 0.4);
  P.sack(b, m, x1 - 0.8, 78.6);
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
  const barsX = 41.2;
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
  // office: desk + chair, filing cabinet, stove, rug
  P.desk(b, m, 43.6, 89.9, 1.8, 0.9, m.woodMid);
  b.box(m.paper, 43.2, 0.8, 89.7, 43.7, 0.81, 90.1, { collide: false });
  b.cyl(m.iron, 44.2, 89.6, 0.8, 0.9, 0.04, { seg: 6 }); // inkwell
  P.chair(b, m, 43.6, 89.0, -Math.PI / 2);
  b.box(m.woodMid, x1 - 0.9, 0, z0 + 0.05, x1 - 0.1, 1.35, z0 + 0.6); // filing cabinet
  for (const dy of [0.3, 0.7, 1.1]) {
    b.box(m.brass, x1 - 0.55, dy, z0 + 0.6, x1 - 0.45, dy + 0.04, z0 + 0.63, { collide: false });
  }
  P.stove(b, m, 41.9, 95.0, ceilY);
  P.coatRack(b, m, 47.2, 95.2);
  b.flat(m.rug, 42.3, 90.9, 46.4, 93.6, 0.06, { texWorld: 1.4 });
  // walls: wanted board + calendar (north), map + gun rack + cabinet (south),
  // the sheriff's portrait between window and door
  b.decal(new THREE.MeshLambertMaterial({ map: P.wantedBoard() }), 43.9, 2.0, z0 + 0.012, 2.4, 1.45, "S");
  b.decal(c.signMat(["MAY", "1882"], 0.45, 0.6, { bg: "#e6dcba", fg: "#33261a", border: "#8a7a52" }), 45.8, 2.05, z0 + 0.012, 0.45, 0.6, "S");
  P.pictureFrame(b, m, 42.4, 2.05, z1, 1.8, 1.2, "N", "map", { frame: m.woodDark });
  b.box(m.woodDark, 44.2, 1.65, z1 - 0.2, 46.0, 2.4, z1 - 0.04, { collide: false });
  for (let i = 0; i < 3; i += 1) {
    b.rotBox(m.iron, 44.55 + i * 0.5, 2.05, z1 - 0.22, 0.06, 1.1, 0.06, 0, { rotZ: 0.06, collide: false });
    b.rotBox(m.woodMid, 44.55 + i * 0.5, 1.7, z1 - 0.22, 0.08, 0.4, 0.06, 0, { rotZ: 0.06, collide: false });
  }
  b.box(m.woodBlack, 46.4, 1.3, z1 - 0.34, 47.5, 2.35, z1 - 0.04, { collide: false }); // wall cabinet
  b.decal(m.woodDark, 46.95, 1.82, z1 - 0.352, 0.03, 1.0, "N");
  P.pictureFrame(b, m, x1, 2.05, 91.9, 0.6, 0.8, "W", "portrait", { frame: m.woodDark, px: 96, py: 128 });
  P.hangLamp(b, m, 43.6, 89.9, ceilY, { green: true, drop: 0.8 });
  P.sconce(b, m, x1 - 0.06, 2.2, 95.1, "W");
  c.light(43.6, 2.2, 89.9, 0xcfe8b0, 9, 6);
  c.warm(44.5, 2.7, 92.5, 12, 8);
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
  // the vault: round steel door with a brass spinner wheel, hinges, lettering
  {
    const vz = 40.4;
    b.box(m.woodBlack, partX + 0.1, 0.1, vz - 1.3, partX + 0.16, 3.0, vz + 1.3, { collide: false });
    const door = new THREE.CylinderGeometry(1.12, 1.12, 0.22, 20);
    door.rotateZ(Math.PI / 2);
    door.translate(partX + 0.27, 1.5, vz);
    b.mesh(m.iron, door);
    const wheel = new THREE.TorusGeometry(0.4, 0.045, 6, 14);
    wheel.rotateY(Math.PI / 2);
    wheel.translate(partX + 0.44, 1.5, vz);
    b.mesh(m.brass, wheel);
    for (const a of [0, Math.PI / 2]) {
      b.rotBox(m.brass, partX + 0.42, 1.5, vz, 0.05, 0.8, 0.05, 0, { rotX: a, collide: false });
    }
    for (const hy of [0.7, 2.3]) {
      b.box(m.brass, partX + 0.16, hy, vz + 1.05, partX + 0.4, hy + 0.35, vz + 1.28, { collide: false });
    }
    b.decal(
      c.signMat(["DIAMONDBACK", "BANK & TRUST"], 1.7, 0.6, { bg: "#17130f", fg: "#dfb44e" }),
      partX + 0.382,
      2.2,
      vz,
      1.7,
      0.6,
      "E",
    );
    b.solid({ minX: partX, minY: 0, minZ: vz - 1.2, maxX: partX + 0.45, maxY: 2.7, maxZ: vz + 1.2 });
  }
  // furniture: benches, writing table with a green lamp, coat racks
  P.bench(b, m, 45.0, z1 - 0.32, 1.9, "N");
  P.tableSquare(b, m, 43.3, z1 - 0.55, 1.4, 0.7, 0.8, m.woodMid, m.woodDark);
  b.cyl(m.brass, 43.3, z1 - 0.55, 0.8, 1.05, 0.035, { seg: 6 });
  b.cone(m.cactusDark, 43.3, z1 - 0.55, 1.03, 1.23, 0.19, 8);
  c.light(43.3, 1.25, z1 - 0.55, 0xa8d8a0, 6, 4);
  P.coatRack(b, m, x1 - 0.5, z0 + 0.5);
  P.coatRack(b, m, x1 - 0.5, z1 - 0.5);
  P.spittoon(b, m, 46.8, 41.6);
  // certificates, clock
  P.pictureFrame(b, m, 45.0, 2.15, z0, 1.2, 0.85, "S", "certificate", { frame: m.woodDark });
  P.pictureFrame(b, m, 46.5, 2.2, z1, 1.0, 0.75, "N", "certificate", { frame: m.woodDark });
  P.pictureFrame(b, m, x1, 2.15, 44.8, 0.9, 0.7, "W", "certificate", { frame: m.woodDark });
  b.cyl(m.woodDark, 44.0, z1 - 0.05, 2.25, 2.32, 0.26, { seg: 14 });
  b.decal(m.paper, 44.0, 2.28, z1 - 0.112, 0.44, 0.44, "N");
  b.box(m.woodDark, 43.95, 1.6, z1 - 0.1, 44.05, 2.02, z1 - 0.05, { collide: false }); // pendulum case
  P.hangLamp(b, m, 45, 41.0, ceilY, { green: true, drop: 0.85 });
  P.hangLamp(b, m, 45, 45.6, ceilY, { green: true, drop: 0.85 });
  c.light(45, 2.5, 41, 0xcfe8b0, 11, 8);
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
  P.desk(b, m, 45.7, z0 + 0.55, 1.5, 0.8, m.woodMid);
  b.cyl(m.brass, 46.2, z0 + 0.45, 0.8, 1.05, 0.035, { seg: 6 });
  b.cone(m.cactusDark, 46.2, z0 + 0.45, 1.03, 1.22, 0.18, 8);
  c.light(46.2, 1.25, z0 + 0.45, 0xffd9a0, 5, 4);
  b.cyl(m.woodDark, 44.3, z0 + 0.05, 2.3, 2.37, 0.24, { seg: 14 });
  b.decal(m.paper, 44.3, 2.33, z0 + 0.112, 0.4, 0.4, "S");
  b.box(m.woodDark, 44.25, 1.7, z0 + 0.05, 44.35, 2.08, z0 + 0.1, { collide: false });
  P.pictureFrame(b, m, 46.3, 2.25, z0, 1.0, 0.7, "S", "certificate", { frame: m.woodDark });
  P.pictureFrame(b, m, 47.25, 2.2, z0, 0.55, 0.75, "S", "portrait", { frame: m.woodDark, px: 96, py: 128 });
  P.coatRack(b, m, x1 - 0.55, z0 + 0.55);
  P.stove(b, m, 44.2, 37.6, ceilY);
  b.decal(c.posterMat("tonic"), 46.6, 2.0, z1 - 0.012, 0.85, 1.15, "N");
  P.chair(b, m, 45.2, z1 - 0.45, Math.PI / 2);
  P.chair(b, m, 46.3, z1 - 0.45, Math.PI / 2);
  P.shelfUnit(b, m, partX + 0.1, 0, 33.6, 1.7, 2.0, 0.35, "E", "books", 4);
  b.decal(c.signMat(["DR. H. RODHAM"], 0.95, 0.26, { bg: "#4a3826", fg: "#efeadb" }), partX + 0.1 + 0.012, 2.05, inner.z, 0.95, 0.26, "E");
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
  P.shelfUnit(b, m, 41.3, 0, z1, 1.9, 1.9, 0.4, "N", "vials", 3, m.woodSaloon);
  P.barrel(b, m, x0 + 0.55, z1 - 0.55, 0.4, 0.85);
  P.washstand(b, m, partX - 0.1, 37.2, "W");
  P.chair(b, m, 41.9, 36.5, 0.5);
  P.pictureFrame(b, m, 39.3, 2.15, z1, 1.1, 0.8, "N", "desert", { frame: m.woodDark });
  P.hangLamp(b, m, 40.6, 35.6, ceilY, { drop: 0.7 });
  c.warm(40.6, 2.6, 35.6, 12, 8);
}
