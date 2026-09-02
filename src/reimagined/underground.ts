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
import * as P from "./props";
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
  hub: [46.25, 22.25, 57.75, 33.75],
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
    kind: "figures" | "spiral" | "snake" | "bird" | "stele" | "spider" | "dancers",
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
    const w = (to - from) * 0.16;
    b.box(m.caveRed, from, top - 0.5, z - 0.3, from + w, top, z + 0.3, { collide: false });
    b.box(m.caveRed, to - w, top - 0.5, z - 0.3, to, top, z + 0.3, { collide: false });
    b.box(m.caveRed, from + w, top - 0.22, z - 0.3, from + 2 * w, top, z + 0.3, { collide: false });
    b.box(m.caveRed, to - 2 * w, top - 0.22, z - 0.3, to - w, top, z + 0.3, { collide: false });
  };
  const archZ = (from: number, to: number, x: number, top: number): void => {
    const w = (to - from) * 0.16;
    b.box(m.caveRed, x - 0.3, top - 0.5, from, x + 0.3, top, from + w, { collide: false });
    b.box(m.caveRed, x - 0.3, top - 0.5, to - w, x + 0.3, top, to, { collide: false });
    b.box(m.caveRed, x - 0.3, top - 0.22, from + w, x + 0.3, top, from + 2 * w, { collide: false });
    b.box(m.caveRed, x - 0.3, top - 0.22, to - 2 * w, x + 0.3, top, to - w, { collide: false });
  };

  const floorSlab = (x0: number, z0: number, x1: number, z1: number): void => {
    b.box(m.caveFloor, x0 - 0.4, FLOOR - 0.35, z0 - 0.4, x1 + 0.4, FLOOR, z1 + 0.4);
  };
  const ceil = (x0: number, z0: number, x1: number, z1: number, y: number, mat: THREE.Material = m.caveRed): void => {
    b.box(mat, x0 - 0.4, y, z0 - 0.4, x1 + 0.4, y + 0.4, z1 + 0.4);
  };
  /** A wide stone bowl of coals on the floor, its light dim for the niches. */
  const bowl = (x: number, z: number, y = FLOOR, lit = true): void => {
    P.fireBowl(b, m, x, z, y);
    lights.push({ x, y: y + 0.7, z, color: 0xff7a35, intensity: lit ? 5 : 2.5, distance: lit ? 6.5 : 4 });
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
    wallX(b, m.caveRed, x0, x1, z1, FLOOR, cy, [doorway(52, 2.8, FLOOR + 3.2)], 0.5);
    archX(50.6, 53.4, z1, FLOOR + 3.2);
    wallZ(b, m.caveRed, z0, z1, x0, FLOOR, cy, [doorway(12.5, 2.4, FLOOR + 2.5)], 0.5);
    wallZ(b, m.caveRed, z0, z1, x1, FLOOR, cy, [], 0.5);
    flame(48.2, 9.3);
    flame(55.8, 9.3);
    flame(48.2, 15.7);
    flame(55.8, 15.7);
    glyph("spiral", x1 - 0.28, FLOOR + 1.9, 12.5, 1.5, 1.5, "W");
    glyph("figures", 52, FLOOR + 1.9, z0 + 0.28, 2.0, 2.0, "S");
    // corridor west to the mine
    floorSlab(44, 11.1, 47.4, 13.9);
    ceil(44, 11.1, 47.4, 13.9, FLOOR + 2.6, m.caveDark);
    wallX(b, m.caveDark, 44, 47.4, 11.1, FLOOR, FLOOR + 2.6, [], 0.5);
    wallX(b, m.caveDark, 44, 47.4, 13.9, FLOOR, FLOOR + 2.6, [], 0.5);
  }

  /* ---------- the sundial chamber (hub) ---------- */
  {
    // _HUB: an 11.5 m chamber whose every wall is a pointed arch between two
    // deep blind niches, tunnels running out of the arches; the dial is a
    // flat stone table on a carved pedestal (the spider with the glowing
    // eyes), two fire bowls before each face of it and one before each niche
    const [x0, z0, x1, z1] = R.hub;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const H = FLOOR + 5.4;
    const ARCH = FLOOR + 3.6;
    const NICHE = FLOOR + 3.0;
    const NOFF = 3.6;
    floorSlab(x0, z0, x1, z1);
    ceil(x0, z0, x1, z1, H);
    const side = (axis: "x" | "z", fixed: number, inward: 1 | -1): void => {
      const mid = axis === "x" ? cx : cz;
      const face = fixed + inward * 0.25;
      const outer = fixed - inward * 0.25;
      const gaps = [doorway(mid, 2.8, ARCH), doorway(mid - NOFF, 1.8, NICHE), doorway(mid + NOFF, 1.8, NICHE)];
      const f: "N" | "S" | "E" | "W" = axis === "x" ? (inward > 0 ? "S" : "N") : inward > 0 ? "E" : "W";
      const p = 0.16;
      // a box given as u along the wall and w across it (any order)
      const bx = (mat: THREE.Material, u0: number, u1: number, y0: number, y1: number, w0: number, w1: number, collide = true): void => {
        const ua = Math.min(u0, u1);
        const ub = Math.max(u0, u1);
        const wa = Math.min(w0, w1);
        const wb = Math.max(w0, w1);
        if (axis === "x") {
          b.box(mat, ua, y0, wa, ub, y1, wb, { collide });
        } else {
          b.box(mat, wa, y0, ua, wb, y1, ub, { collide });
        }
      };
      const dec = (kind: "figures" | "stele", u: number, y: number, w: number, h: number, off: number): void => {
        if (axis === "x") {
          glyph(kind, u, y, face + inward * off, w, h, f);
        } else {
          glyph(kind, face + inward * off, y, u, w, h, f);
        }
      };
      if (axis === "x") {
        wallX(b, m.caveRed, x0, x1, fixed, FLOOR, H, gaps, 0.5);
        archX(mid - 1.4, mid + 1.4, fixed, ARCH);
        archX(mid - NOFF - 0.9, mid - NOFF + 0.9, fixed, NICHE);
        archX(mid + NOFF - 0.9, mid + NOFF + 0.9, fixed, NICHE);
      } else {
        wallZ(b, m.caveRed, z0, z1, fixed, FLOOR, H, gaps, 0.5);
        archZ(mid - 1.4, mid + 1.4, fixed, ARCH);
        archZ(mid - NOFF - 0.9, mid - NOFF + 0.9, fixed, NICHE);
        archZ(mid + NOFF - 0.9, mid + NOFF + 0.9, fixed, NICHE);
      }
      // niches: a metre-deep recess beyond the wall, black at the back,
      // a bowl of coals before each; a carved panel in each corner
      const D = 1.0;
      for (const s of [-1, 1]) {
        const u = mid + s * NOFF;
        bx(m.caveDark, u - 1.2, u + 1.2, FLOOR, H, outer - inward * D, outer - inward * (D + 0.3));
        bx(m.caveRed, u - 1.2, u - 0.9, FLOOR, H, outer, outer - inward * D);
        bx(m.caveRed, u + 0.9, u + 1.2, FLOOR, H, outer, outer - inward * D);
        bx(m.caveFloor, u - 1.2, u + 1.2, FLOOR - 0.35, FLOOR, outer, outer - inward * (D + 0.3));
        bx(m.caveRed, u - 1.2, u + 1.2, NICHE, NICHE + 0.5, outer, outer - inward * (D + 0.3), false);
        if (axis === "x") {
          bowl(u, face + inward * 0.9, FLOOR, false);
        } else {
          bowl(face + inward * 0.9, u, FLOOR, false);
        }
        dec("figures", mid + s * (NOFF + 1.45), FLOOR + 1.9, 0.9, 2.0, 0.03);
        // the arch surround: proud jambs carved with glyph bands
        bx(m.caveRed, mid + s * 1.42, mid + s * 1.9, FLOOR, ARCH + 0.4, face, face + inward * p);
        dec("stele", mid + s * 1.66, FLOOR + 1.75, 0.44, 3.4, p + 0.012);
      }
      bx(m.caveRed, mid - 1.9, mid + 1.9, ARCH + 0.02, ARCH + 0.4, face, face + inward * p, false);
      if (axis === "x") {
        b.rotBox(m.caveRed, mid, ARCH + 0.55, face + inward * p * 0.5, 0.55, 0.55, p, 0, { rotZ: Math.PI / 4, collide: false });
      } else {
        b.rotBox(m.caveRed, face + inward * p * 0.5, ARCH + 0.55, mid, p, 0.55, 0.55, 0, { rotX: Math.PI / 4, collide: false });
      }
    };
    side("x", z0, 1);
    side("x", z1, -1);
    side("z", x0, 1);
    side("z", x1, -1);
    // the dial: the spider pedestal under a flat stone table with a raised rim
    b.box(m.caveFloor, cx - 0.65, FLOOR, cz - 0.65, cx + 0.65, FLOOR + 1.25, cz + 0.65);
    glyph("spider", cx, FLOOR + 0.66, cz - 0.66, 1.1, 1.0, "N");
    glyph("spider", cx, FLOOR + 0.66, cz + 0.66, 1.1, 1.0, "S");
    glyph("spider", cx - 0.66, FLOOR + 0.66, cz, 1.1, 1.0, "W");
    glyph("spider", cx + 0.66, FLOOR + 0.66, cz, 1.1, 1.0, "E");
    b.cyl(m.caveFloor, cx, cz, FLOOR + 1.25, FLOOR + 1.6, 1.15, { rTop: 1.32, seg: 20, collide: true });
    b.cyl(m.iron, cx, cz, FLOOR + 1.6, FLOOR + 1.62, 1.2, { seg: 20 });
    const rim = new THREE.TorusGeometry(1.26, 0.06, 6, 24);
    rim.rotateX(Math.PI / 2);
    rim.translate(cx, FLOOR + 1.6, cz);
    b.mesh(m.caveRed, rim);
    for (const [bx, bz] of [
      [cx - 1.0, cz - 2.0],
      [cx + 1.0, cz - 2.0],
      [cx - 1.0, cz + 2.0],
      [cx + 1.0, cz + 2.0],
      [cx - 2.0, cz - 1.0],
      [cx - 2.0, cz + 1.0],
      [cx + 2.0, cz - 1.0],
      [cx + 2.0, cz + 1.0],
    ] as const) {
      bowl(bx, bz);
    }
    // the four tunnels: 2.8 m wide under 3.4 m, unlit black rock
    const tunnel = (ax0: number, az0: number, ax1: number, az1: number, alongX: boolean): void => {
      floorSlab(ax0, az0, ax1, az1);
      ceil(ax0, az0, ax1, az1, FLOOR + 3.4, m.caveDark);
      if (alongX) {
        wallX(b, m.caveDark, ax0, ax1, az0, FLOOR, FLOOR + 3.4, [], 0.5);
        wallX(b, m.caveDark, ax0, ax1, az1, FLOOR, FLOOR + 3.4, [], 0.5);
      } else {
        wallZ(b, m.caveDark, az0, az1, ax0, FLOOR, FLOOR + 3.4, [], 0.5);
        wallZ(b, m.caveDark, az0, az1, ax1, FLOOR, FLOOR + 3.4, [], 0.5);
      }
    };
    tunnel(cx - 1.4, 16.5, cx + 1.4, z0, false);
    tunnel(cx - 1.4, z1, cx + 1.4, 40.6, false);
    tunnel(x1, cz - 1.4, 68, cz + 1.4, true);
    tunnel(36, cz - 1.4, x0, cz + 1.4, true);
  }

  /* ---------- snake trial (east) ---------- */
  {
    const [x0, z0, x1, z1] = R.snake;
    floorSlab(x0, z0, x1, z1);
    ceil(x0, z0, x1, z1, FLOOR + 3.9);
    wallX(b, m.caveRed, x0, x1, z0, FLOOR, FLOOR + 3.9, [], 0.5);
    wallX(b, m.caveRed, x0, x1, z1, FLOOR, FLOOR + 3.9, [], 0.5);
    wallZ(b, m.caveRed, z0, z1, x0, FLOOR, FLOOR + 3.9, [doorway(28, 2.8, FLOOR + 3.4)], 0.5);
    archZ(26.6, 29.4, x0, FLOOR + 3.4);
    wallZ(b, m.caveRed, z0, z1, x1, FLOOR, FLOOR + 3.9, [], 0.5);
    // dais with steps up to the great snake head
    b.stairs(m.caveFloor, 80.4, 25.6, 4.8, 0.9, 1.3, "E", FLOOR, 3);
    b.box(m.caveFloor, 81.7, FLOOR, 25.4, x1, FLOOR + 0.9, 30.6);
    // the great head (B3 N / B2 N): a domed skull over a wide black mouth,
    // orange eyes, fangs down from the upper jaw, the coil rising behind
    const hy = FLOOR + 0.9;
    const skull = new THREE.SphereGeometry(1.6, 18, 12);
    skull.scale(1.25, 0.8, 1.2);
    skull.translate(84.4, hy + 2.2, 28);
    b.mesh(m.caveFloor, skull);
    b.box(m.caveFloor, 82.6, hy + 1.55, 25.9, 85.9, hy + 2.3, 30.1); // upper jaw
    b.box(m.caveFloor, 82.7, hy, 25.9, 85.9, hy + 0.45, 30.1); // lower jaw
    b.box(m.black, 82.75, hy + 0.45, 26.3, 85.5, hy + 1.55, 29.7, { collide: false }); // the mouth
    b.sphere(m.ember, 83.0, hy + 2.35, 26.8, 0.22, 8);
    b.sphere(m.ember, 83.0, hy + 2.35, 29.2, 0.22, 8);
    for (const fz of [26.7, 27.35, 28, 28.65, 29.3]) {
      const fang = new THREE.ConeGeometry(0.09, 0.55, 6);
      fang.rotateX(Math.PI);
      fang.translate(82.7, hy + 1.27, fz);
      b.mesh(m.bone, fang);
    }
    for (const fz of [27.0, 29.0]) {
      b.cone(m.bone, 82.7, fz, hy + 0.45, hy + 0.9, 0.08, 6);
    }
    b.cyl(m.caveFloor, 85.0, 28, hy + 2.9, hy + 3.5, 1.3, { rTop: 0.9, seg: 12 }); // coil above
    // flame posts flanking the dais + candle rows along the aisle
    for (const pz of [24.9, 31.1]) {
      b.box(m.woodSaloon, 81.2 - 0.12, FLOOR, pz - 0.12, 81.2 + 0.12, FLOOR + 1.9, pz + 0.12);
      flame(81.2, pz, FLOOR + 1.9, true);
    }
    for (const fx of [71, 75, 79]) {
      bowl(fx, 25.2, FLOOR, false);
      bowl(fx, 30.8, FLOOR, false);
    }
    // steles by the head, black dancing figures down the long walls (B2 E / B3 E)
    glyph("stele", 79.0, FLOOR + 2.0, z0 + 0.28, 1.7, 2.3, "S");
    glyph("stele", 79.0, FLOOR + 2.0, z1 - 0.28, 1.7, 2.3, "N");
    glyph("dancers", 74.5, FLOOR + 2.0, z0 + 0.28, 2.6, 2.6, "S");
    glyph("dancers", 74.5, FLOOR + 2.0, z1 - 0.28, 2.6, 2.6, "N");
    lights.push({ x: 83, y: hy + 1.8, z: 28, color: 0xff5a25, intensity: 10, distance: 9 });
  }

  /* ---------- thunderbird trial (south) ---------- */
  {
    const [x0, z0, x1, z1] = R.tbird;
    floorSlab(x0, z0, x1, z1);
    ceil(x0, z0, x1, z1, FLOOR + 3.9, m.caveTeal);
    wallX(b, m.caveTeal, x0, x1, z0, FLOOR, FLOOR + 3.9, [doorway(52, 2.8, FLOOR + 3.4)], 0.5);
    archX(50.6, 53.4, z0, FLOOR + 3.4);
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
    b.box(m.caveRed, 51.25, FLOOR + 1.0, 55.9, 52.75, FLOOR + 3.9, 56.5);
    const disc = new THREE.CylinderGeometry(0.72, 0.72, 0.06, 20);
    disc.rotateX(Math.PI / 2);
    disc.translate(52, FLOOR + 2.35, 55.88);
    b.mesh(m.black, disc);
    b.decal(new THREE.MeshBasicMaterial({ map: thunderbirdTex(), transparent: true }), 52, FLOOR + 2.35, 55.84, 1.35, 1.35, "N");
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      b.cone(m.iron, 52 + Math.cos(a) * 0.85, 55.8, FLOOR + 2.35 + Math.sin(a) * 0.85 - 0.09, FLOOR + 2.35 + Math.sin(a) * 0.85 + 0.09, 0.07, 4);
    }
    lights.push({ x: 52, y: FLOOR + 2.4, z: 55.2, color: 0x55e0e0, intensity: 10, distance: 8 });
    // black stone columns under bone capitals: two at the shrine, two down
    // the room (B3 N / B4 N); three bowls of coals at the shrine's foot
    for (const [px, pz] of [
      [50, 57.15],
      [54, 57.15],
      [49.4, 49.5],
      [54.6, 49.5],
    ] as const) {
      b.cyl(m.iron, px, pz, FLOOR, FLOOR + 3.3, 0.38, { seg: 10, collide: true });
      b.sphere(m.sunStone, px, FLOOR + 3.5, pz, 0.45, 8);
    }
    for (const [bx, bz] of [
      [50.4, 54.6],
      [52, 54.85],
      [53.6, 54.6],
    ] as const) {
      bowl(bx, bz);
    }
    bowl(x0 + 0.9, 46.5, FLOOR, false);
    bowl(x1 - 0.9, 46.5, FLOOR, false);
  }

  /* ---------- flute room (west) ---------- */
  {
    // _FLUTE B4: a black cavern. The altar rises at the west end between
    // two obelisks with a dark arch behind it, stone benches and two more
    // obelisks stand about the floor, the entry is a carved portal.
    const [x0, z0, x1, z1] = R.flute;
    floorSlab(x0, z0, x1, z1);
    ceil(x0, z0, x1, z1, FLOOR + 5.2, m.caveDark);
    wallX(b, m.caveDark, x0, x1, z0, FLOOR, FLOOR + 5.2, [], 0.5);
    wallX(b, m.caveDark, x0, x1, z1, FLOOR, FLOOR + 5.2, [], 0.5);
    wallZ(b, m.caveDark, z0, z1, x0, FLOOR, FLOOR + 5.2, [], 0.5);
    wallZ(b, m.caveDark, z0, z1, x1, FLOOR, FLOOR + 5.2, [doorway(28, 2.8, FLOOR + 3.4)], 0.5);
    archZ(26.6, 29.4, x1, FLOOR + 3.4);
    for (const gz of [26.1, 29.9]) {
      b.box(m.caveRed, x1 - 0.45, FLOOR, gz - 0.35, x1 + 0.45, FLOOR + 4.6, gz + 0.35);
      glyph("stele", x1 - 0.46, FLOOR + 2.3, gz, 0.6, 4.4, "W");
    }
    b.box(m.caveRed, x1 - 0.45, FLOOR + 3.4, 25.75, x1 + 0.45, FLOOR + 4.6, 30.25, { collide: false });
    glyph("spiral", x1 - 0.46, FLOOR + 4.0, 28, 1.1, 1.1, "W");
    // altar: steps up to a platform, a black arch in the wall behind, the
    // flute on its stone, urns of fire either side
    b.stairs(m.caveFloor, 29.4, 26.2, 3.6, 0.75, 1.1, "W", FLOOR, 3);
    b.box(m.caveFloor, x0, FLOOR, 25.8, 28.3, FLOOR + 0.75, 30.2);
    b.box(m.caveRed, x0 + 0.2, FLOOR + 0.75, 26.4, x0 + 1.0, FLOOR + 4.0, 29.6, { collide: false });
    b.box(m.black, x0 + 0.6, FLOOR + 0.75, 27.1, x0 + 1.01, FLOOR + 3.0, 28.9, { collide: false });
    archZ(27.1, 28.9, x0 + 1.0, FLOOR + 3.0);
    b.cyl(m.wellStone, 27.4, 28, FLOOR + 0.75, FLOOR + 1.45, 0.32, { seg: 8 });
    b.rotBox(m.bone, 27.4, FLOOR + 1.52, 28, 0.9, 0.07, 0.07, 0.4, { collide: false }); // the flute
    for (const uz of [26.4, 29.6]) {
      b.cyl(m.caveFloor, 28.7, uz, FLOOR + 0.75, FLOOR + 1.35, 0.3, { rTop: 0.38, seg: 8 });
      flame(28.7, uz, FLOOR + 1.35);
    }
    for (const [ox, oz, oh] of [
      [28.6, 25.0, 4.6],
      [28.6, 31.0, 4.6],
      [31.6, 24.2, 4.2],
      [34.2, 31.8, 4.2],
    ] as const) {
      b.cyl(m.caveRed, ox, oz, FLOOR, FLOOR + oh, 0.42, { rTop: 0.16, seg: 8, collide: true });
      b.box(m.caveFloor, ox - 0.5, FLOOR, oz - 0.5, ox + 0.5, FLOOR + 0.3, oz + 0.5);
    }
    for (const [bx, bz] of [
      [30.8, 26.3],
      [30.8, 29.7],
      [33.4, 25.4],
      [33.4, 30.6],
    ] as const) {
      b.box(m.caveFloor, bx - 1.2, FLOOR, bz - 0.4, bx + 1.2, FLOOR + 0.5, bz + 0.4);
    }
  }

  /* ---------- the mine (timber tunnels off the antechamber) ---------- */
  {
    const cx = 40;
    const cz = 12.5;
    // west arm + north/south arms
    floorSlab(30, 11.1, 44, 13.9);
    ceil(30, 11.1, 44, 13.9, FLOOR + 2.6, m.caveDark);
    wallX(b, m.caveDark, 30, 44, 11.1, FLOOR, FLOOR + 2.6, [], 0.5);
    wallX(b, m.caveDark, 30, 44, 13.9, FLOOR, FLOOR + 2.6, [], 0.5);
    wallZ(b, m.caveDark, 4, 11.1, 38.6, FLOOR, FLOOR + 2.6, [], 0.5);
    wallZ(b, m.caveDark, 4, 11.1, 41.4, FLOOR, FLOOR + 2.6, [], 0.5);
    wallZ(b, m.caveDark, 13.9, 21, 38.6, FLOOR, FLOOR + 2.6, [], 0.5);
    wallZ(b, m.caveDark, 13.9, 21, 41.4, FLOOR, FLOOR + 2.6, [], 0.5);
    floorSlab(38.6, 4, 41.4, 21);
    ceil(38.6, 4, 41.4, 11.1, FLOOR + 2.6, m.caveDark);
    ceil(38.6, 13.9, 41.4, 21, FLOOR + 2.6, m.caveDark);
    // end caps
    wallZ(b, m.caveDark, 11.1, 13.9, 30, FLOOR, FLOOR + 2.6, [], 0.5);
    wallX(b, m.caveDark, 38.6, 41.4, 4, FLOOR, FLOOR + 2.6, [], 0.5);
    wallX(b, m.caveDark, 38.6, 41.4, 21, FLOOR, FLOOR + 2.6, [], 0.5);
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
    for (const fx of [33.3, 35.9, 38.5, 41.3]) {
      bowl(fx, 11.65, FLOOR, false);
      bowl(fx, 13.35, FLOOR, false);
    }
    for (const fz of [6.9, 9.4, 16.7]) {
      bowl(39.15, fz, FLOOR, false);
      bowl(40.85, fz, FLOOR, false);
    }
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
