/**
 * The Yunni underground. Clicking the courtyard fountain slides it
 * aside and opens a circular stairwell down the shaft beneath it. The
 * shaft lands in an antechamber that leads to the sundial room (the
 * film's `_HUB`: a cross of arms around an unwalkable centre — the
 * sundial dish). Its other three arms are the trial rooms, matched to
 * the film SETs: east `_SNAKE`, south `_TBIRD`, west `_FLUTE`; a
 * timber `_MINE` runs off the antechamber. Everything sits at y −7,
 * red rock lit by floor flames, as the stills show.
 */
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { Builder, aabb, type Aabb } from "./geometry";
import { SHAFT } from "./layout";
import type { Mats } from "./materials";
import { glyphTex, thunderbirdTex } from "./textures";
import type { PointLightSpec } from "./interiors";
import { wallX, wallZ, type Gap } from "./town";

export { SHAFT };

const FLOOR = -SHAFT.depth;

export interface UndergroundResult {
  group: THREE.Group;
  builder: Builder;
  lights: PointLightSpec[];
}

interface Rooms {
  ante: [number, number, number, number];
  hub: [number, number, number, number];
  snake: [number, number, number, number];
  tbird: [number, number, number, number];
  flute: [number, number, number, number];
}

/**
 * The way down: a spiral of stone treads round a centre column inside
 * a 2.2 m well. Two full turns of 24 treads (0.29 rise, so the walker
 * steps up as well as down) starting and ending on the south side.
 * Each tread's collision is a grid of small boxes that stays inside
 * its own wedge, so the tread above never bulges into the one you are
 * on — that was what made the old spiral fight the walker.
 */
const SPIRAL = { rIn: 0.5, rOut: SHAFT.r - 0.12, steps: 24, turns: 2 };

const R: Rooms = {
  ante: [47.4, 8.5, 56.6, 16.5],
  hub: [42, 18, 62, 38],
  snake: [68, 24, 86, 32],
  tbird: [48, 40.6, 56, 58],
  flute: [26, 23, 36, 33],
};

function doorway(at: number, w = 2.8, top = FLOOR + 2.7): Gap {
  return { from: at - w / 2, to: at + w / 2, top };
}

export function buildUnderground(m: Mats): UndergroundResult {
  const group = new THREE.Group();
  const b = new Builder();
  const lights: PointLightSpec[] = [];

  const flame = (x: number, z: number, y = FLOOR, big = false): void => {
    b.cyl(m.iron, x, z, y, y + 0.12, big ? 0.2 : 0.14, { seg: 7 });
    b.box(m.flame, x - 0.07, y + 0.12, z - 0.07, x + 0.07, y + (big ? 0.5 : 0.34), z + 0.07, {
      collide: false,
    });
    lights.push({ x, y: y + 0.6, z, color: 0xff7a35, intensity: big ? 9 : 5, distance: big ? 8 : 5.5 });
  };

  const glyph = (
    kind: "figures" | "spiral" | "snake" | "bird" | "stele",
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    face: "N" | "S" | "E" | "W",
  ): void => {
    b.decal(new THREE.MeshLambertMaterial({ map: glyphTex(kind) }), x, y, z, w, h, face);
  };

  /** Arch corner fillets inside a doorway gap. */
  const archX = (from: number, to: number, z: number, top: number): void => {
    b.box(m.caveRed, from, top - 0.4, z - 0.3, from + 0.38, top, z + 0.3, { collide: false });
    b.box(m.caveRed, to - 0.38, top - 0.4, z - 0.3, to, top, z + 0.3, { collide: false });
  };
  const archZ = (from: number, to: number, x: number, top: number): void => {
    b.box(m.caveRed, x - 0.3, top - 0.4, from, x + 0.3, top + 0, from + 0.38, { collide: false });
    b.box(m.caveRed, x - 0.3, top - 0.4, to - 0.38, x + 0.3, top, to, { collide: false });
  };

  const floorSlab = (x0: number, z0: number, x1: number, z1: number): void => {
    b.box(m.caveFloor, x0 - 0.4, FLOOR - 0.35, z0 - 0.4, x1 + 0.4, FLOOR, z1 + 0.4);
  };
  const ceil = (x0: number, z0: number, x1: number, z1: number, y: number): void => {
    b.box(m.caveRed, x0 - 0.4, y, z0 - 0.4, x1 + 0.4, y + 0.4, z1 + 0.4);
  };

  /* ---------- the shaft: ring wall + the spiral stair ---------- */
  {
    const { rIn, rOut, steps } = SPIRAL;
    const pitch = (SPIRAL.turns * 2 * Math.PI) / steps;
    const rise = -FLOOR / steps;
    const rWall = SHAFT.r + 0.16;
    // ring wall in 24 segments; the south ones stop short of the floor,
    // leaving the way out of the well into the antechamber
    const segs = 24;
    for (let i = 0; i < segs; i += 1) {
      const a = ((i + 0.5) / segs) * Math.PI * 2;
      const wSeg = (2 * Math.PI * rWall) / segs + 0.06;
      const deg = (a * 180) / Math.PI;
      const openBelow = deg > 52 && deg < 128;
      const y0 = openBelow ? FLOOR + 3.1 : FLOOR;
      b.rotBox(m.caveRed, SHAFT.x + Math.cos(a) * rWall, y0 / 2, SHAFT.z + Math.sin(a) * rWall, 0.32, -y0, wSeg, -a, {
        collide: true,
      });
    }
    b.cyl(m.caveRed, SHAFT.x, SHAFT.z, FLOOR, 0.3, rIn, { seg: 12, collide: true });
    // treads: annular wedges, the top one on the south side of the mouth,
    // winding down clockwise; a dark nosing on each leading edge
    const wedge = (a0: number, a1: number, r0: number, r1: number, y0: number, h: number, mat: THREE.Material): void => {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, r1, -a0, -a1, true);
      shape.absarc(0, 0, r0, -a1, -a0, false);
      shape.closePath();
      const geom = mergeVertices(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 6 }));
      const uv = geom.getAttribute("uv") as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k += 1) {
        uv.setXY(k, uv.getX(k) / 2.5, uv.getY(k) / 2.5);
      }
      uv.needsUpdate = true;
      geom.rotateX(-Math.PI / 2);
      geom.translate(SHAFT.x, y0, SHAFT.z);
      b.mesh(mat, geom);
    };
    for (let i = 0; i < steps; i += 1) {
      const a0 = Math.PI / 2 + i * pitch;
      const a1 = a0 + pitch;
      const top = -rise * (i + 1);
      wedge(a0 - 0.012, a1 + 0.012, rIn, rOut, top - rise, rise, m.wellStone);
      wedge(a0 - 0.012, a0 + 0.07, rIn + 0.05, rOut - 0.02, top, 0.012, m.caveFloor);
      // collision: small boxes on a grid inside the wedge
      for (const rr of [0.95, 1.35, 1.75, 2.05]) {
        if (rr > rOut) {
          continue;
        }
        const s = Math.min(0.34, 0.185 * rr);
        for (const af of [0.2, 0.5, 0.8]) {
          const a = a0 + pitch * af;
          const cx = SHAFT.x + Math.cos(a) * rr;
          const cz = SHAFT.z + Math.sin(a) * rr;
          b.solid(aabb(cx - s, top - rise, cz - s, cx + s, top, cz + s));
        }
      }
    }
    // low stone kerb around the mouth
    for (let i = 0; i < 16; i += 1) {
      const a = ((i + 0.5) / 16) * Math.PI * 2;
      const rk = SHAFT.r + 0.34;
      b.rotBox(m.wellStone, SHAFT.x + Math.cos(a) * rk, 0.1, SHAFT.z + Math.sin(a) * rk, 0.4, 0.2, (2 * Math.PI * rk) / 16 + 0.04, -a, {
        collide: true,
      });
    }
    // torches on ledges down the wall, one every three-quarter turn
    for (let k = 0; k < 5; k += 1) {
      const a = Math.PI / 2 + 0.6 + k * 1.5;
      const y = -0.6 - k * 1.35;
      const rr = rWall - 0.33;
      const tx = SHAFT.x + Math.cos(a) * rr;
      const tz = SHAFT.z + Math.sin(a) * rr;
      b.box(m.caveRed, tx - 0.16, y + 0.9, tz - 0.16, tx + 0.16, y + 1.02, tz + 0.16, { collide: false });
      flame(tx, tz, y + 1.02);
    }
    lights.push({ x: SHAFT.x, y: -3.4, z: SHAFT.z, color: 0xff8a40, intensity: 7, distance: 7 });
  }

  /* ---------- antechamber + corridors ---------- */
  {
    const [x0, z0, x1, z1] = R.ante;
    floorSlab(x0, z0, x1, z1);
    // ceiling with a hole where the well comes down
    const cy = FLOOR + 3.4;
    const hr = SHAFT.r + 0.32;
    b.box(m.caveRed, x0 - 0.4, cy, z0 - 0.4, x1 + 0.4, cy + 0.4, SHAFT.z - hr);
    b.box(m.caveRed, x0 - 0.4, cy, SHAFT.z + hr, x1 + 0.4, cy + 0.4, z1 + 0.4);
    b.box(m.caveRed, x0 - 0.4, cy, SHAFT.z - hr, SHAFT.x - hr, cy + 0.4, SHAFT.z + hr);
    b.box(m.caveRed, SHAFT.x + hr, cy, SHAFT.z - hr, x1 + 0.4, cy + 0.4, SHAFT.z + hr);
    wallX(b, m.caveRed, x0, x1, z0, FLOOR, cy, [], 0.5);
    wallX(b, m.caveRed, x0, x1, z1, FLOOR, cy, [doorway(52)], 0.5);
    archX(50.6, 53.4, z1, FLOOR + 2.7);
    wallZ(b, m.caveRed, z0, z1, x0, FLOOR, cy, [doorway(12.5, 2.4, FLOOR + 2.5)], 0.5);
    wallZ(b, m.caveRed, z0, z1, x1, FLOOR, cy, [], 0.5);
    flame(48.2, 9.3);
    flame(55.8, 9.3);
    flame(48.2, 15.7);
    flame(55.8, 15.7);
    glyph("spiral", x1 - 0.28, FLOOR + 1.9, 12.5, 1.5, 1.5, "W");
    glyph("figures", 52, FLOOR + 1.9, z0 + 0.28, 2.0, 2.0, "S");
    // corridor south to the hub
    floorSlab(50.6, 16.5, 53.4, 18);
    ceil(50.6, 16.1, 53.4, 18, FLOOR + 2.9);
    wallZ(b, m.caveRed, 16.5, 18, 50.6, FLOOR, FLOOR + 2.9, [], 0.5);
    wallZ(b, m.caveRed, 16.5, 18, 53.4, FLOOR, FLOOR + 2.9, [], 0.5);
    // corridor west to the mine
    floorSlab(44, 11.1, 47.4, 13.9);
    ceil(44, 11.1, 47.4, 13.9, FLOOR + 2.6);
    wallX(b, m.caveRed, 44, 47.4, 11.1, FLOOR, FLOOR + 2.6, [], 0.5);
    wallX(b, m.caveRed, 44, 47.4, 13.9, FLOOR, FLOOR + 2.6, [], 0.5);
  }

  /* ---------- the sundial room (hub) ---------- */
  {
    const [x0, z0, x1, z1] = R.hub;
    floorSlab(x0, z0, x1, z1);
    ceil(x0, z0, x1, z1, FLOOR + 4.5);
    wallX(b, m.caveRed, x0, x1, z0, FLOOR, FLOOR + 4.5, [doorway(52)], 0.5);
    archX(50.6, 53.4, z0, FLOOR + 2.7);
    wallX(b, m.caveRed, x0, x1, z1, FLOOR, FLOOR + 4.5, [doorway(52)], 0.5);
    archX(50.6, 53.4, z1, FLOOR + 2.7);
    wallZ(b, m.caveRed, z0, z1, x0, FLOOR, FLOOR + 4.5, [doorway(28)], 0.5);
    archZ(26.6, 29.4, x0, FLOOR + 2.7);
    wallZ(b, m.caveRed, z0, z1, x1, FLOOR, FLOOR + 4.5, [doorway(28)], 0.5);
    archZ(26.6, 29.4, x1, FLOOR + 2.7);
    // carved jambs beside each arch + petroglyph panels
    for (const [gx, gz, f] of [
      [47.6, z0 + 0.28, "S"],
      [56.4, z0 + 0.28, "S"],
      [47.6, z1 - 0.28, "N"],
      [56.4, z1 - 0.28, "N"],
    ] as const) {
      glyph("figures", gx, FLOOR + 1.95, gz, 2.1, 2.4, f);
    }
    glyph("snake", x1 - 0.28, FLOOR + 1.95, 24, 2.1, 2.4, "W");
    glyph("bird", x0 + 0.28, FLOOR + 1.95, 33, 2.1, 2.4, "E");
    glyph("spiral", x0 + 0.28, FLOOR + 1.95, 23, 1.7, 1.7, "E");
    glyph("stele", x1 - 0.28, FLOOR + 1.95, 33.5, 1.6, 2.2, "W");
    // the sundial: pedestal, wide dish, gnomon
    b.cyl(m.wellStone, 52, 28, FLOOR, FLOOR + 1.1, 0.8, { seg: 12, collide: true });
    b.cyl(m.wellStone, 52, 28, FLOOR + 1.1, FLOOR + 1.42, 2.1, { rTop: 2.3, seg: 16, collide: true });
    b.cyl(m.caveFloor, 52, 28, FLOOR + 1.42, FLOOR + 1.46, 2.05, { seg: 16 });
    b.rotBox(m.caveFloor, 52.55, FLOOR + 1.85, 28, 1.25, 0.75, 0.12, 0.6, { rotZ: 0.5, collide: false });
    // flames around the dial + at the corners
    flame(50.1, 26.2);
    flame(53.9, 26.2);
    flame(50.1, 29.8);
    flame(53.9, 29.8);
    flame(43.3, 19.3, FLOOR, true);
    flame(60.7, 19.3, FLOOR, true);
    flame(43.3, 36.7, FLOOR, true);
    flame(60.7, 36.7, FLOOR, true);
    // corridors out east / south / west
    floorSlab(62, 26.6, 68, 29.4);
    ceil(62, 26.6, 68, 29.4, FLOOR + 2.9);
    wallX(b, m.caveRed, 62, 68, 26.6, FLOOR, FLOOR + 2.9, [], 0.5);
    wallX(b, m.caveRed, 62, 68, 29.4, FLOOR, FLOOR + 2.9, [], 0.5);
    floorSlab(50.6, 38, 53.4, 40.6);
    ceil(50.6, 38, 53.4, 40.6, FLOOR + 2.9);
    wallZ(b, m.caveRed, 38, 40.6, 50.6, FLOOR, FLOOR + 2.9, [], 0.5);
    wallZ(b, m.caveRed, 38, 40.6, 53.4, FLOOR, FLOOR + 2.9, [], 0.5);
    floorSlab(36, 26.6, 42, 29.4);
    ceil(36, 26.6, 42, 29.4, FLOOR + 2.9);
    wallX(b, m.caveRed, 36, 42, 26.6, FLOOR, FLOOR + 2.9, [], 0.5);
    wallX(b, m.caveRed, 36, 42, 29.4, FLOOR, FLOOR + 2.9, [], 0.5);
  }

  /* ---------- snake trial (east) ---------- */
  {
    const [x0, z0, x1, z1] = R.snake;
    floorSlab(x0, z0, x1, z1);
    ceil(x0, z0, x1, z1, FLOOR + 3.9);
    wallX(b, m.caveRed, x0, x1, z0, FLOOR, FLOOR + 3.9, [], 0.5);
    wallX(b, m.caveRed, x0, x1, z1, FLOOR, FLOOR + 3.9, [], 0.5);
    wallZ(b, m.caveRed, z0, z1, x0, FLOOR, FLOOR + 3.9, [doorway(28)], 0.5);
    archZ(26.6, 29.4, x0, FLOOR + 2.7);
    wallZ(b, m.caveRed, z0, z1, x1, FLOOR, FLOOR + 3.9, [], 0.5);
    // dais with steps up to the great snake head
    b.stairs(m.caveFloor, 80.4, 25.6, 4.8, 0.9, 1.3, "E", FLOOR, 3);
    b.box(m.caveFloor, 81.7, FLOOR, 25.4, x1, FLOOR + 0.9, 30.6);
    // the great head: dark skull, black open mouth, eyes, fangs, coil
    const hy = FLOOR + 0.9;
    b.box(m.caveFloor, 83.0, hy + 1.0, 25.9, 85.9, hy + 2.6, 30.1); // skull
    b.rotBox(m.caveFloor, 82.9, hy + 1.35, 28, 2.2, 0.55, 3.6, 0, { rotZ: 0.16, collide: false }); // snout
    b.rotBox(m.caveFloor, 83.0, hy + 0.2, 28, 2.4, 0.45, 3.3, 0, { rotZ: -0.14, collide: false }); // jaw
    b.decal(m.iron, 82.2, hy + 0.78, 28, 2.35, 0.95, "W"); // mouth shadow
    b.sphere(m.flame, 82.7, hy + 2.15, 26.7, 0.19, 7);
    b.sphere(m.flame, 82.7, hy + 2.15, 29.3, 0.19, 7);
    for (const fz of [26.9, 28, 29.1]) {
      b.cone(m.bone, 82.35, fz, hy + 0.85, hy + 1.35, 0.1, 6);
    }
    for (const fz of [27.45, 28.55]) {
      b.cone(m.bone, 82.35, fz, hy + 0.35, hy + 0.8, 0.1, 6);
    }
    b.cyl(m.caveFloor, 84.8, 28, hy + 2.6, hy + 3.1, 1.2, { seg: 10 }); // coil above
    // flame posts flanking the dais + candle rows along the aisle
    for (const pz of [24.9, 31.1]) {
      b.box(m.woodSaloon, 81.2 - 0.12, FLOOR, pz - 0.12, 81.2 + 0.12, FLOOR + 1.9, pz + 0.12);
      flame(81.2, pz, FLOOR + 1.9, true);
    }
    for (const fx of [71, 75, 79]) {
      flame(fx, 25.2);
      flame(fx, 30.8);
    }
    // steles + dancing figures on the long walls
    glyph("stele", 73, FLOOR + 2.0, z0 + 0.28, 1.7, 2.3, "S");
    glyph("stele", 79, FLOOR + 2.0, z1 - 0.28, 1.7, 2.3, "N");
    glyph("figures", 76.2, FLOOR + 1.9, z1 - 0.28, 2.2, 2.4, "N");
    glyph("snake", 70.5, FLOOR + 1.9, z0 + 0.28, 2.2, 2.4, "S");
    lights.push({ x: 83, y: hy + 1.8, z: 28, color: 0xff5a25, intensity: 10, distance: 9 });
  }

  /* ---------- thunderbird trial (south) ---------- */
  {
    const [x0, z0, x1, z1] = R.tbird;
    floorSlab(x0, z0, x1, z1);
    ceil(x0, z0, x1, z1, FLOOR + 3.9);
    wallX(b, m.caveTeal, x0, x1, z0, FLOOR, FLOOR + 3.9, [doorway(52)], 0.5);
    archX(50.6, 53.4, z0, FLOOR + 2.7);
    wallX(b, m.caveTeal, x0, x1, z1, FLOOR, FLOOR + 3.9, [], 0.5);
    wallZ(b, m.caveTeal, z0, z1, x0, FLOOR, FLOOR + 3.9, [], 0.5);
    wallZ(b, m.caveTeal, z0, z1, x1, FLOOR, FLOOR + 3.9, [], 0.5);
    // darker banding along the side walls
    for (const bx of [x0 + 0.26, x1 - 0.26]) {
      b.box(m.iron, bx - 0.02, FLOOR + 1.35, z0 + 0.5, bx + 0.02, FLOOR + 1.55, z1 - 0.5, { collide: false });
      b.box(m.iron, bx - 0.02, FLOOR + 2.45, z0 + 0.5, bx + 0.02, FLOOR + 2.65, z1 - 0.5, { collide: false });
    }
    // red runner to the shrine
    b.flat(m.leatherRed, 51.1, z0 + 0.6, 52.9, 55.4, FLOOR + 0.02);
    // shrine: pedestal column, glowing thunderbird disc, spiked ring
    b.box(m.caveTeal, 51.1, FLOOR, 55.4, 52.9, FLOOR + 1.0, 56.9);
    b.box(m.caveRed, 51.55, FLOOR + 1.0, 55.9, 52.45, FLOOR + 3.9, 56.5);
    b.decal(new THREE.MeshBasicMaterial({ map: thunderbirdTex() }), 52, FLOOR + 2.35, 55.85, 1.35, 1.35, "N");
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      b.cone(m.iron, 52 + Math.cos(a) * 0.85, 55.8, FLOOR + 2.35 + Math.sin(a) * 0.85 - 0.09, FLOOR + 2.35 + Math.sin(a) * 0.85 + 0.09, 0.07, 4);
    }
    lights.push({ x: 52, y: FLOOR + 2.4, z: 55.2, color: 0x55e0e0, intensity: 10, distance: 8 });
    // flanking pillars + horned torch posts
    for (const px of [50, 54]) {
      b.box(m.caveTeal, px - 0.35, FLOOR, 56.8, px + 0.35, FLOOR + 3.9, 57.5);
    }
    for (const [tx, tz] of [
      [x0 + 0.9, 45],
      [x1 - 0.9, 45],
      [x0 + 0.9, 51],
      [x1 - 0.9, 51],
    ] as const) {
      b.box(m.woodSaloon, tx - 0.11, FLOOR, tz - 0.11, tx + 0.11, FLOOR + 1.8, tz + 0.11);
      flame(tx, tz, FLOOR + 1.8, true);
      b.rotBox(m.bone, tx - 0.2, FLOOR + 2.1, tz, 0.4, 0.08, 0.08, 0.5, { rotZ: 0.6, collide: false });
      b.rotBox(m.bone, tx + 0.2, FLOOR + 2.1, tz, 0.4, 0.08, 0.08, -0.5, { rotZ: -0.6, collide: false });
    }
    glyph("bird", x0 + 0.28, FLOOR + 2.0, 48, 2.0, 2.2, "E");
    glyph("figures", x1 - 0.28, FLOOR + 2.0, 48, 2.0, 2.2, "W");
  }

  /* ---------- flute room (west) ---------- */
  {
    const [x0, z0, x1, z1] = R.flute;
    floorSlab(x0, z0, x1, z1);
    ceil(x0, z0, x1, z1, FLOOR + 3.9);
    wallX(b, m.caveRed, x0, x1, z0, FLOOR, FLOOR + 3.9, [], 0.5);
    wallX(b, m.caveRed, x0, x1, z1, FLOOR, FLOOR + 3.9, [], 0.5);
    wallZ(b, m.caveRed, z0, z1, x0, FLOOR, FLOOR + 3.9, [], 0.5);
    wallZ(b, m.caveRed, z0, z1, x1, FLOOR, FLOOR + 3.9, [doorway(28)], 0.5);
    // grand carved portal on the entry: jamb pillars + glyph band above
    archZ(26.6, 29.4, x1, FLOOR + 2.7);
    for (const gz of [26.1, 29.9]) {
      b.box(m.caveFloor, x1 - 0.45, FLOOR, gz - 0.35, x1 + 0.45, FLOOR + 3.2, gz + 0.35);
    }
    glyph("spiral", x1 + 0.47, FLOOR + 3.3, 28, 1.2, 1.0, "E");
    // altar at the west end: steps, platform, niche, urns, flute
    b.stairs(m.caveFloor, 29.4, 26.2, 3.6, 0.75, 1.1, "W", FLOOR, 3);
    b.box(m.caveFloor, x0, FLOOR, 25.8, 28.3, FLOOR + 0.75, 30.2);
    b.decal(new THREE.MeshLambertMaterial({ map: glyphTex("spiral") }), x0 + 0.28, FLOOR + 2.2, 28, 1.6, 1.8, "E");
    b.box(m.caveRed, x0 + 0.2, FLOOR + 0.75, 26.6, x0 + 1.1, FLOOR + 3.0, 29.4, { collide: false });
    b.cyl(m.wellStone, 27.4, 28, FLOOR + 0.75, FLOOR + 1.45, 0.32, { seg: 8 });
    b.rotBox(m.bone, 27.4, FLOOR + 1.52, 28, 0.9, 0.07, 0.07, 0.4, { collide: false }); // the flute
    for (const uz of [26.4, 29.6]) {
      b.cyl(m.caveFloor, 28.7, uz, FLOOR + 0.75, FLOOR + 1.35, 0.3, { rTop: 0.38, seg: 8 });
      flame(28.7, uz, FLOOR + 1.35);
    }
    // benches + standing steles
    for (const bz of [26.3, 29.7]) {
      b.box(m.caveFloor, 30.6, FLOOR, bz - 0.45, 33.6, FLOOR + 0.5, bz + 0.45);
    }
    for (const [sx, sz] of [
      [31.2, 24.1],
      [34.4, 31.9],
    ] as const) {
      b.box(m.caveRed, sx - 0.3, FLOOR, sz - 0.3, sx + 0.3, FLOOR + 3.1, sz + 0.3);
    }
    glyph("figures", 31, FLOOR + 1.9, z0 + 0.28, 2.0, 2.2, "S");
    glyph("spiral", 33, FLOOR + 1.9, z1 - 0.28, 1.6, 1.6, "N");
  }

  /* ---------- the mine (timber tunnels off the antechamber) ---------- */
  {
    const cx = 40;
    const cz = 12.5;
    // west arm + north/south arms
    floorSlab(30, 11.1, 44, 13.9);
    ceil(30, 11.1, 44, 13.9, FLOOR + 2.6);
    wallX(b, m.caveFloor, 30, 44, 11.1, FLOOR, FLOOR + 2.6, [], 0.5);
    wallX(b, m.caveFloor, 30, 44, 13.9, FLOOR, FLOOR + 2.6, [], 0.5);
    wallZ(b, m.caveFloor, 4, 11.1, 38.6, FLOOR, FLOOR + 2.6, [], 0.5);
    wallZ(b, m.caveFloor, 4, 11.1, 41.4, FLOOR, FLOOR + 2.6, [], 0.5);
    wallZ(b, m.caveFloor, 13.9, 21, 38.6, FLOOR, FLOOR + 2.6, [], 0.5);
    wallZ(b, m.caveFloor, 13.9, 21, 41.4, FLOOR, FLOOR + 2.6, [], 0.5);
    floorSlab(38.6, 4, 41.4, 21);
    ceil(38.6, 4, 41.4, 11.1, FLOOR + 2.6);
    ceil(38.6, 13.9, 41.4, 21, FLOOR + 2.6);
    // end caps
    wallZ(b, m.caveFloor, 11.1, 13.9, 30, FLOOR, FLOOR + 2.6, [], 0.5);
    wallX(b, m.caveFloor, 38.6, 41.4, 4, FLOOR, FLOOR + 2.6, [], 0.5);
    wallX(b, m.caveFloor, 38.6, 41.4, 21, FLOOR, FLOOR + 2.6, [], 0.5);
    // timber frames down each tunnel
    const frame = (x: number, z: number, alongX: boolean): void => {
      if (alongX) {
        b.box(m.woodSaloon, x - 0.12, FLOOR, 11.35, x + 0.12, FLOOR + 2.3, 11.6);
        b.box(m.woodSaloon, x - 0.12, FLOOR, 13.4, x + 0.12, FLOOR + 2.3, 13.65);
        b.box(m.woodSaloon, x - 0.14, FLOOR + 2.3, 11.3, x + 0.14, FLOOR + 2.56, 13.7, { collide: false });
      } else {
        b.box(m.woodSaloon, 38.85, FLOOR, z - 0.12, 39.1, FLOOR + 2.3, z + 0.12);
        b.box(m.woodSaloon, 40.9, FLOOR, z - 0.12, 41.15, FLOOR + 2.3, z + 0.12);
        b.box(m.woodSaloon, 38.8, FLOOR + 2.3, z - 0.14, 41.2, FLOOR + 2.56, z + 0.14, { collide: false });
      }
    };
    for (const fx of [32, 34.6, 37.2, 42.6]) {
      frame(fx, cz, true);
    }
    for (const fz of [5.6, 8.2, 10.6, 15.4, 18]) {
      frame(cx, fz, false);
    }
    // rubble + candles + an ore cart at the west dead end
    b.sphere(m.mesa, 30.8, FLOOR + 0.3, 12.1, 0.55, 7);
    b.sphere(m.mesa, 31.4, FLOOR + 0.2, 13.2, 0.4, 7);
    flame(33, 11.7);
    flame(37, 13.3);
    flame(40.7, 6.4);
    flame(39.3, 17.6);
    b.box(m.woodSaloon, 39.2, FLOOR + 0.35, 18.6, 40.8, FLOOR + 1.1, 20.2);
    for (const [wx2, wz2] of [
      [39.35, 18.9],
      [40.65, 18.9],
      [39.35, 19.9],
      [40.65, 19.9],
    ] as const) {
      b.cyl(m.iron, wx2, wz2, FLOOR, FLOOR + 0.35, 0.18, { seg: 8 });
    }
    b.sphere(m.mesa, 40, FLOOR + 1.15, 19.4, 0.5, 7);
  }

  b.build(group, { shadows: false });
  return { group, builder: b, lights };
}

/* ------------------------------------------------------------------ */

/**
 * The courtyard fountain, now a secret: it stands on a square stone
 * plinth that seals the well mouth; click it and plinth and fountain
 * slide east together, opening the spiral. Clickable-compatible with
 * SwingDoor for the game loop.
 */
export class FountainSecret {
  readonly group = new THREE.Group();

  readonly spec = { label: "The fountain" };

  readonly hitMeshes: THREE.Mesh[] = [];

  open = false;

  private t = 0;

  private readonly plinthH = 0.25;

  constructor(m: Mats) {
    this.group.position.set(SHAFT.x, 0, SHAFT.z);
    const add = (
      geom: THREE.BufferGeometry,
      mat: THREE.Material,
      y: number,
      hit = false,
    ): void => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      if (hit) {
        this.hitMeshes.push(mesh);
        mesh.userData.door = this;
      }
    };
    const p = SHAFT.plinth;
    const ph = this.plinthH;
    add(new THREE.BoxGeometry(p * 2, ph, p * 2), m.wellStone, ph / 2, true);
    add(new THREE.CylinderGeometry(2.1, 2.1, 0.75, 16), m.wellStone, ph + 0.375, true);
    add(new THREE.CylinderGeometry(1.85, 1.85, 0.06, 16), m.glassCold, ph + 0.68);
    add(new THREE.CylinderGeometry(0.35, 0.35, 0.95, 10), m.wellStone, ph + 1.2, true);
    add(new THREE.CylinderGeometry(1.05, 1.05, 0.25, 14), m.wellStone, ph + 1.8, true);
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.75, 8), m.wellStone, ph + 2.3);
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 10), m.wellStone, ph + 2.8, true);
  }

  toggle(): void {
    this.open = !this.open;
  }

  update(dt: number): void {
    const target = this.open ? 1 : 0;
    if (this.t !== target) {
      const step = dt / 1.4;
      this.t = target > this.t ? Math.min(target, this.t + step) : Math.max(target, this.t - step);
      const eased = this.t * this.t * (3 - 2 * this.t);
      this.group.position.x = SHAFT.x + eased * SHAFT.slide;
    }
  }

  colliders(): Aabb[] {
    const x = this.group.position.x;
    const p = SHAFT.plinth;
    return [
      // the plinth is a walkable step and the lid over the mouth
      aabb(x - p, -0.2, SHAFT.z - p, x + p, this.plinthH, SHAFT.z + p),
      aabb(x - 2.1, this.plinthH, SHAFT.z - 2.1, x + 2.1, this.plinthH + 3.0, SHAFT.z + 2.1),
    ];
  }
}
