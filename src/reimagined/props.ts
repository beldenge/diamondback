/** Shared street/interior prop builders. Everything merges via Builder. */
import type { Facing } from "./coords";
import type { Builder } from "./geometry";
import type { Mats } from "./materials";
import { boardTex } from "./textures";
import * as THREE from "three";

export function barrel(b: Builder, m: Mats, x: number, z: number, r = 0.42, h = 0.95): void {
  b.cyl(m.woodMid, x, z, 0, h, r, { collide: true });
  b.cyl(m.iron, x, z, h * 0.18, h * 0.26, r + 0.02, { collide: false });
  b.cyl(m.iron, x, z, h * 0.72, h * 0.8, r + 0.02, { collide: false });
}

export function crate(
  b: Builder,
  m: Mats,
  x: number,
  z: number,
  s = 0.8,
  h = 0.7,
  rotY = 0,
  mat?: THREE.Material,
): void {
  b.rotBox(mat ?? m.woodStage, x, h / 2, z, s, h, s, rotY, { collide: true });
}

export function saguaro(b: Builder, m: Mats, x: number, z: number, h = 3.4): void {
  b.cyl(m.cactus, x, z, 0, h, 0.28, { seg: 7, collide: true });
  b.sphere(m.cactus, x, h, z, 0.28, 7);
  // one or two arms
  const armY = h * 0.45;
  b.rotBox(m.cactusDark, x + 0.45, armY, z, 0.7, 0.24, 0.24, 0, { collide: false });
  b.cyl(m.cactusDark, x + 0.78, z, armY, armY + h * 0.32, 0.2, { seg: 6 });
  if (h > 3) {
    const armY2 = h * 0.6;
    b.rotBox(m.cactusDark, x - 0.4, armY2, z, 0.6, 0.22, 0.22, 0, { collide: false });
    b.cyl(m.cactusDark, x - 0.68, z, armY2, armY2 + h * 0.25, 0.18, { seg: 6 });
  }
}

export function lampPost(
  b: Builder,
  m: Mats,
  x: number,
  z: number,
  h = 3.5,
): void {
  b.box(m.wellStone, x - 0.22, 0, z - 0.22, x + 0.22, 0.5, z + 0.22);
  b.cyl(m.iron, x, z, 0.5, h - 0.55, 0.07, { collide: true });
  b.box(m.iron, x - 0.16, h - 0.55, z - 0.16, x + 0.16, h - 0.45, z + 0.16, { collide: false });
  b.box(m.glassWarm, x - 0.13, h - 0.45, z - 0.13, x + 0.13, h - 0.1, z + 0.13, { collide: false });
  b.cone(m.iron, x, z, h - 0.1, h + 0.08, 0.2, 4);
}

/** Crossed street-name boards on a lamp post. */
export function streetSign(
  b: Builder,
  _m: Mats,
  x: number,
  z: number,
  y: number,
  names: [string, string],
): void {
  const t1 = boardTex([names[0]], 1.1, 0.26, { bg: "#3c2c1c", fg: "#ddd0a8" });
  const t2 = boardTex([names[1]], 1.1, 0.26, { bg: "#3c2c1c", fg: "#ddd0a8" });
  const m1 = new THREE.MeshLambertMaterial({ map: t1 });
  const m2 = new THREE.MeshLambertMaterial({ map: t2 });
  // one board along X (readable N+S), one along Z (readable E+W)
  b.decal(m1, x, y, z - 0.09, 1.1, 0.26, "N");
  b.decal(m1, x, y, z + 0.09, 1.1, 0.26, "S");
  b.decal(m2, x - 0.09, y - 0.3, z, 1.1, 0.26, "W");
  b.decal(m2, x + 0.09, y - 0.3, z, 1.1, 0.26, "E");
}

export function hitchRail(
  b: Builder,
  m: Mats,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): void {
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? "x" : "z";
  b.cyl(m.woodDark, x0, z0, 0, 1.05, 0.07);
  b.cyl(m.woodDark, x1, z1, 0, 1.05, 0.07);
  if (along === "x") {
    b.box(m.woodDark, Math.min(x0, x1), 0.95, z0 - 0.05, Math.max(x0, x1), 1.08, z0 + 0.05, {
      collide: true,
    });
  } else {
    b.box(m.woodDark, x0 - 0.05, 0.95, Math.min(z0, z1), x0 + 0.05, 1.08, Math.max(z0, z1), {
      collide: true,
    });
  }
}

/** Post-and-rail fence along one axis. */
export function railFence(
  b: Builder,
  m: Mats,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  rails = 3,
  h = 1.3,
  mat?: THREE.Material,
): void {
  const wood = mat ?? m.woodDark;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const posts = Math.max(2, Math.round(len / 2.4) + 1);
  for (let i = 0; i < posts; i += 1) {
    const t = i / (posts - 1);
    b.box(
      wood,
      x0 + dx * t - 0.08,
      0,
      z0 + dz * t - 0.08,
      x0 + dx * t + 0.08,
      h,
      z0 + dz * t + 0.08,
      { collide: false },
    );
  }
  for (let r = 0; r < rails; r += 1) {
    const y = h * ((r + 1) / (rails + 0.3));
    if (Math.abs(dx) > Math.abs(dz)) {
      b.box(wood, Math.min(x0, x1), y - 0.06, z0 - 0.04, Math.max(x0, x1), y + 0.06, z0 + 0.04, {
        collide: r === 0,
      });
    } else {
      b.box(wood, x0 - 0.04, y - 0.06, Math.min(z0, z1), x0 + 0.04, y + 0.06, Math.max(z0, z1), {
        collide: r === 0,
      });
    }
  }
}

/** Tight picket/plank fence: one textured slab. */
export function picketFence(
  b: Builder,
  m: Mats,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h = 1.25,
  mat?: THREE.Material,
): void {
  const f = mat ?? m.fenceGray;
  if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) {
    b.box(f, Math.min(x0, x1), 0, z0 - 0.05, Math.max(x0, x1), h, z0 + 0.05, { collide: true });
  } else {
    b.box(f, x0 - 0.05, 0, Math.min(z0, z1), x0 + 0.05, h, Math.max(z0, z1), { collide: true });
  }
}

export function bench(b: Builder, m: Mats, x: number, z: number, w = 1.7, facing: Facing = "N"): void {
  const alongX = facing === "N" || facing === "S";
  const hw = w / 2;
  if (alongX) {
    b.box(m.woodDark, x - hw, 0.42, z - 0.25, x + hw, 0.5, z + 0.25, { collide: true });
    b.box(m.woodDark, x - hw + 0.1, 0, z - 0.2, x - hw + 0.24, 0.42, z + 0.2, { collide: false });
    b.box(m.woodDark, x + hw - 0.24, 0, z - 0.2, x + hw - 0.1, 0.42, z + 0.2, { collide: false });
  } else {
    b.box(m.woodDark, x - 0.25, 0.42, z - hw, x + 0.25, 0.5, z + hw, { collide: true });
    b.box(m.woodDark, x - 0.2, 0, z - hw + 0.1, x + 0.2, 0.42, z - hw + 0.24, { collide: false });
    b.box(m.woodDark, x - 0.2, 0, z + hw - 0.24, x + 0.2, 0.42, z + hw - 0.1, { collide: false });
  }
}

export function trough(b: Builder, m: Mats, x: number, z: number, w = 1.8, alongX = true): void {
  const hw = w / 2;
  if (alongX) {
    b.box(m.woodDark, x - hw, 0, z - 0.35, x + hw, 0.55, z + 0.35, { collide: true });
    b.flat(m.glassCold, x - hw + 0.08, z - 0.27, x + hw - 0.08, z + 0.27, 0.48);
  } else {
    b.box(m.woodDark, x - 0.35, 0, z - hw, x + 0.35, 0.55, z + hw, { collide: true });
    b.flat(m.glassCold, x - 0.27, z - hw + 0.08, x + 0.27, z + hw - 0.08, 0.48);
  }
}

/**
 * A proper spoked wagon wheel: wooden rim, iron tyre, hub, 8 spokes.
 * Built around the wheel centre, rolling along local X (axle Z), then
 * leaned/turned and placed.
 */
export function spokedWheel(
  b: Builder,
  m: Mats,
  x: number,
  z: number,
  r: number,
  opts: { y?: number; rotY?: number; lean?: number; mat?: THREE.Material } = {},
): void {
  const lean = opts.lean ?? 0;
  const rotY = opts.rotY ?? 0;
  const cy = (opts.y ?? 0) + r;
  const wood = opts.mat ?? m.woodMid;
  const place = (g: THREE.BufferGeometry, material: THREE.Material): void => {
    if (lean) {
      g.rotateX(lean);
    }
    if (rotY) {
      g.rotateY(rotY);
    }
    g.translate(x, cy, z);
    b.mesh(material, g);
  };
  place(new THREE.TorusGeometry(r - 0.05, 0.055, 6, 16), wood);
  place(new THREE.TorusGeometry(r, 0.028, 5, 16), m.iron);
  const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8);
  hub.rotateX(Math.PI / 2);
  place(hub, wood);
  for (let i = 0; i < 8; i += 1) {
    const spoke = new THREE.BoxGeometry(0.05, r - 0.08, 0.04);
    spoke.translate(0, (r - 0.08) / 2, 0);
    spoke.rotateZ((i / 8) * Math.PI * 2 + 0.2);
    place(spoke, wood);
  }
}

/** A spare wheel leaning against a wall, tipped slightly. */
export function wagonWheel(b: Builder, m: Mats, x: number, y: number, z: number, r = 0.7, leanZ = 0): void {
  spokedWheel(b, m, x, z, r, { y, lean: 0.24, rotY: leanZ * 3 });
}

/** Freight wagon: plank bed, sides, seat, red spoked wheels, tongue. */
export function wagon(b: Builder, m: Mats, x: number, z: number, rotY = 0): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const off = (dx: number, dz: number): [number, number] => [x + dx * c - dz * s, z + dx * s + dz * c];
  b.rotBox(m.woodSaloon, x, 1.15, z, 4.2, 0.3, 1.9, rotY, { collide: true });
  // side boards + tail board
  const [n1x, n1z] = off(0, -0.88);
  const [n2x, n2z] = off(0, 0.88);
  const [tbx, tbz] = off(-2.03, 0);
  b.rotBox(m.woodSaloon, n1x, 1.55, n1z, 4.2, 0.5, 0.14, rotY, { collide: false });
  b.rotBox(m.woodSaloon, n2x, 1.55, n2z, 4.2, 0.5, 0.14, rotY, { collide: false });
  b.rotBox(m.woodSaloon, tbx, 1.55, tbz, 0.14, 0.5, 1.9, rotY, { collide: false });
  // seat up front
  const [sx2, sz2] = off(1.7, 0);
  b.rotBox(m.woodDark, sx2, 1.75, sz2, 0.8, 0.12, 1.5, rotY, { collide: false });
  // sacks in the bed
  const [k1x, k1z] = off(-0.9, 0.3);
  const [k2x, k2z] = off(-0.1, -0.35);
  sack(b, m, k1x, k1z, 1.3);
  sack(b, m, k2x, k2z, 1.3);
  // wheels: small front pair, tall rear pair
  for (const [dx, dz, r] of [
    [-1.5, -1.03, 0.75],
    [-1.5, 1.03, 0.75],
    [1.55, -1.03, 0.58],
    [1.55, 1.03, 0.58],
  ] as const) {
    const [wx, wz] = off(dx, dz);
    spokedWheel(b, m, wx, wz, r, { rotY, mat: m.curioRed });
  }
  const [tx, tz] = off(2.9, 0);
  b.rotBox(m.woodDark, tx, 0.5, tz, 1.6, 0.1, 0.1, rotY, { rotZ: 0.18, collide: false });
}

/** Light open buckboard with gray spoked wheels. */
export function buckboard(b: Builder, m: Mats, x: number, z: number, rotY = 0): void {
  b.rotBox(m.woodGray, x, 0.85, z, 3.2, 0.16, 1.5, rotY, { collide: true });
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const off = (dx: number, dz: number): [number, number] => [x + dx * c - dz * s, z + dx * s + dz * c];
  const [bx, bz] = off(0.9, 0);
  b.rotBox(m.woodGray, bx, 1.25, bz, 0.7, 0.1, 1.3, rotY, { collide: false });
  for (const [dx, dz, r] of [
    [-1.05, -0.82, 0.62],
    [-1.05, 0.82, 0.62],
    [1.05, -0.82, 0.5],
    [1.05, 0.82, 0.5],
  ] as const) {
    const [wx, wz] = off(dx, dz);
    spokedWheel(b, m, wx, wz, r, { rotY, mat: m.woodGray });
  }
  const [tx, tz] = off(2.4, 0);
  b.rotBox(m.woodGray, tx, 0.45, tz, 1.4, 0.09, 0.09, rotY, { rotZ: 0.15, collide: false });
}

export function windmill(b: Builder, m: Mats, x: number, z: number, h = 9.5): void {
  // four battered lattice legs
  const spread = 1.6;
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const) {
    b.rotBox(m.woodDark, x + sx * spread * 0.55, h / 2, z + sz * spread * 0.55, 0.16, h, 0.16, 0, {
      rotZ: sx * 0.16,
      rotX: -sz * 0.16,
      collide: false,
    });
  }
  b.solid({ minX: x - 1.4, minY: 0, minZ: z - 1.4, maxX: x + 1.4, maxY: h, maxZ: z + 1.4 });
  // cross braces
  for (let i = 1; i <= 3; i += 1) {
    const y = (h / 4) * i;
    const half = spread * 0.55 * (1 - (y / h) * 0.75) + 0.12;
    b.box(m.woodDark, x - half, y - 0.06, z - half, x + half, y + 0.06, z - half + 0.1, { collide: false });
    b.box(m.woodDark, x - half, y - 0.06, z + half - 0.1, x + half, y + 0.06, z + half, { collide: false });
    b.box(m.woodDark, x - half, y - 0.06, z - half, x - half + 0.1, y + 0.06, z + half, { collide: false });
    b.box(m.woodDark, x + half - 0.1, y - 0.06, z - half, x + half, y + 0.06, z + half, { collide: false });
  }
  // head: hub + blades + tail vane
  b.box(m.woodGray, x - 0.3, h, z - 0.3, x + 0.3, h + 0.5, z + 0.3, { collide: false });
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    b.rotBox(m.woodGray, x, h + 0.25, z - 0.45, 0.24, 1.5, 0.05, 0, { rotZ: a, collide: false });
  }
  b.rotBox(m.woodGray, x + 0.9, h + 0.25, z + 0.3, 1.6, 0.7, 0.06, 0.5, { collide: false });
}

export function waterTower(b: Builder, m: Mats, x: number, z: number, label: string): void {
  const legH = 5.2;
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const) {
    b.rotBox(m.woodDark, x + sx * 1.1, legH / 2, z + sz * 1.1, 0.2, legH, 0.2, 0, {
      rotZ: sx * 0.1,
      rotX: -sz * 0.1,
      collide: false,
    });
  }
  b.solid({ minX: x - 1.3, minY: 0, minZ: z - 1.3, maxX: x + 1.3, maxY: legH, maxZ: z + 1.3 });
  b.cyl(m.woodSaloon, x, z, legH, legH + 2.4, 1.6, { seg: 14 });
  b.cone(m.roofDark, x, z, legH + 2.4, legH + 3.4, 1.75, 14);
  const t = boardTex([label], 2.6, 0.55, { bg: "#2e2620", fg: "#d8cba6" });
  const tm = new THREE.MeshLambertMaterial({ map: t });
  b.decal(tm, x, legH + 1.3, z - 1.65, 2.6, 0.55, "N");
  b.decal(tm, x - 1.65, legH + 1.3, z, 2.6, 0.55, "W");
  b.decal(tm, x, legH + 1.3, z + 1.65, 2.6, 0.55, "S");
}

export function oxSkull(b: Builder, m: Mats, x: number, z: number, y = 0.12): void {
  b.rotBox(m.bone, x, y, z, 0.42, 0.18, 0.5, 0.4, { collide: false });
  b.rotBox(m.bone, x - 0.45, y + 0.05, z, 0.6, 0.09, 0.09, 0.15, { rotZ: 0.35, collide: false });
  b.rotBox(m.bone, x + 0.45, y + 0.05, z, 0.6, 0.09, 0.09, -0.15, { rotZ: -0.35, collide: false });
}

export function gravestone(
  b: Builder,
  m: Mats,
  x: number,
  z: number,
  kind: number,
): void {
  const lean = ((kind * 37) % 10 - 5) * 0.02;
  if (kind % 3 === 0) {
    // cross
    b.rotBox(m.woodGray, x, 0.55, z, 0.12, 1.1, 0.12, 0, { rotZ: lean, collide: false });
    b.rotBox(m.woodGray, x, 0.82, z, 0.55, 0.12, 0.12, 0, { rotZ: lean, collide: false });
  } else if (kind % 3 === 1) {
    b.rotBox(m.wellStone, x, 0.42, z, 0.55, 0.84, 0.12, 0, { rotZ: lean, collide: false });
    b.sphere(m.wellStone, x, 0.84, z, 0.27, 8);
  } else {
    b.rotBox(m.wellStone, x, 0.3, z, 0.5, 0.6, 0.14, 0, { rotZ: lean, collide: false });
  }
}

export function deadTree(b: Builder, m: Mats, x: number, z: number, h = 4.6): void {
  b.cyl(m.woodSaloon, x, z, 0, h, 0.22, { rTop: 0.1, seg: 7, collide: true });
  b.rotBox(m.woodSaloon, x + 0.6, h * 0.7, z, 1.6, 0.1, 0.1, 0.3, { rotZ: 0.6, collide: false });
  b.rotBox(m.woodSaloon, x - 0.5, h * 0.55, z + 0.2, 1.3, 0.09, 0.09, -0.5, { rotZ: -0.7, collide: false });
  b.rotBox(m.woodSaloon, x + 0.2, h * 0.9, z - 0.3, 1.0, 0.08, 0.08, 1.2, { rotZ: 0.9, collide: false });
}

export function well(b: Builder, m: Mats, x: number, z: number): void {
  b.cyl(m.wellStone, x, z, 0, 1.0, 0.95, { seg: 12, collide: true });
  b.cyl(m.iron, x, z, 0.98, 1.02, 0.8, { seg: 12, collide: false });
  b.box(m.woodDark, x - 1.05, 0, z - 0.12, x - 0.85, 2.2, z + 0.12, { collide: false });
  b.box(m.woodDark, x + 0.85, 0, z - 0.12, x + 1.05, 2.2, z + 0.12, { collide: false });
  b.rotBox(m.roofDark, x, 2.5, z, 2.6, 0.1, 1.6, 0, { rotZ: 0, collide: false });
  b.cone(m.roofDark, x, z, 2.5, 3.3, 1.35, 4);
  b.cyl(m.woodMid, x, z, 1.9, 2.02, 0.09);
}

export function stove(b: Builder, m: Mats, x: number, z: number, ceilY = 3.4): void {
  b.cyl(m.iron, x, z, 0, 1.15, 0.42, { seg: 10, collide: true });
  b.cyl(m.iron, x, z, 1.15, 1.3, 0.3, { seg: 10 });
  b.cyl(m.iron, x, z, 1.3, ceilY, 0.11, { seg: 8 });
  b.box(m.brass, x - 0.12, 0.45, z - 0.44, x + 0.12, 0.62, z - 0.4, { collide: false });
}

export function tableRound(b: Builder, m: Mats, x: number, z: number, r = 0.65): void {
  b.cyl(m.woodMid, x, z, 0.72, 0.78, r, { seg: 12, collide: true });
  b.cyl(m.woodDark, x, z, 0, 0.72, 0.09, { seg: 8 });
  b.cyl(m.woodDark, x, z, 0, 0.06, 0.4, { seg: 8 });
}

export function chair(b: Builder, m: Mats, x: number, z: number, rotY = 0): void {
  b.rotBox(m.woodMid, x, 0.46, z, 0.46, 0.06, 0.46, rotY, { collide: false });
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  b.rotBox(m.woodMid, x - 0.2 * c, 0.75, z + 0.2 * s, 0.46, 0.6, 0.06, rotY, { collide: false });
  for (const [dx, dz] of [
    [-0.18, -0.18],
    [-0.18, 0.18],
    [0.18, -0.18],
    [0.18, 0.18],
  ] as const) {
    b.rotBox(m.woodDark, x + dx * c - dz * s, 0.23, z + dx * s + dz * c, 0.05, 0.46, 0.05, rotY, {
      collide: false,
    });
  }
}

/** Balustrade: top rail + thin spindles, along X or Z. */
export function balustrade(
  b: Builder,
  m: Mats,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  baseY: number,
  h = 0.95,
): void {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(2, Math.round(len / 0.4));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    b.box(m.woodDark, px - 0.035, baseY, pz - 0.035, px + 0.035, baseY + h - 0.08, pz + 0.035, {
      collide: false,
    });
  }
  if (alongX) {
    b.box(m.woodSaloon, Math.min(x0, x1), baseY + h - 0.08, z0 - 0.06, Math.max(x0, x1), baseY + h, z0 + 0.06, {
      collide: true,
    });
  } else {
    b.box(m.woodSaloon, x0 - 0.06, baseY + h - 0.08, Math.min(z0, z1), x0 + 0.06, baseY + h, Math.max(z0, z1), {
      collide: true,
    });
  }
}

export function coatRack(b: Builder, m: Mats, x: number, z: number): void {
  b.cyl(m.woodDark, x, z, 0, 1.8, 0.05, { seg: 6 });
  b.cyl(m.woodDark, x, z, 0, 0.05, 0.3, { seg: 8 });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    b.rotBox(m.woodDark, x + Math.cos(a) * 0.18, 1.7, z + Math.sin(a) * 0.18, 0.3, 0.04, 0.04, a, {
      collide: false,
    });
  }
}

export function sack(b: Builder, m: Mats, x: number, z: number, y = 0): void {
  b.rotBox(m.woodStage, x, y + 0.22, z, 0.7, 0.44, 0.45, (x * 7 + z * 3) % 1, { collide: false });
}

export function coffin(b: Builder, m: Mats, x: number, z: number, rotY = 0, standing = false): void {
  if (standing) {
    b.rotBox(m.woodStage, x, 1.05, z, 0.66, 2.1, 0.3, rotY, { rotX: -0.12, collide: true });
  } else {
    b.rotBox(m.woodStage, x, 0.25, z, 2.0, 0.5, 0.7, rotY, { collide: true });
  }
}

export function barberPole(b: Builder, m: Mats, x: number, z: number): void {
  b.cyl(m.white, x, z, 0, 2.3, 0.09, { seg: 10, collide: true });
  for (let i = 0; i < 6; i += 1) {
    b.cyl(m.curioRed, x, z, 0.42 + i * 0.32, 0.42 + i * 0.32 + 0.14, 0.1, { seg: 10 });
  }
  b.sphere(m.brass, x, 2.42, z, 0.14, 8);
}

export function bell(b: Builder, m: Mats, x: number, y: number, z: number, r = 0.34): void {
  b.cyl(m.iron, x, z, y, y + r * 1.4, r, { rTop: r * 0.55, seg: 10 });
  b.sphere(m.iron, x, y + r * 1.5, z, r * 0.35, 6);
}

export function potPlant(b: Builder, m: Mats, x: number, z: number): void {
  b.cyl(m.brickMayor, x, z, 0, 0.4, 0.28, { rTop: 0.34, seg: 8, collide: false });
  b.cyl(m.cactus, x, z, 0.4, 1.15, 0.14, { seg: 6 });
}

/** Boardwalk slab with a step lip; registers walkable collision. */
export function boardwalkSlab(
  b: Builder,
  m: Mats,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  h = 0.32,
): void {
  b.box(m.boardwalk, minX, 0, minZ, maxX, h, maxZ);
}

/** Shed/porch roof: a thin sloped slab on posts. */
export function porchRoof(
  b: Builder,
  m: Mats,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  yEdge: number,
  yWall: number,
  slopeFrom: Facing,
  mat?: THREE.Material,
): void {
  const roof = mat ?? m.roofDark;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const cy = (yEdge + yWall) / 2;
  if (slopeFrom === "E" || slopeFrom === "W") {
    const ang = Math.atan2(yWall - yEdge, w) * (slopeFrom === "E" ? 1 : -1);
    b.rotBox(roof, cx, cy, cz, Math.hypot(w, yWall - yEdge), 0.09, d, 0, { rotZ: ang, collide: false });
  } else {
    const ang = Math.atan2(yWall - yEdge, d) * (slopeFrom === "S" ? -1 : 1);
    b.rotBox(roof, cx, cy, cz, w, 0.09, Math.hypot(d, yWall - yEdge), 0, { rotX: ang, collide: false });
  }
}

export function porchPosts(
  b: Builder,
  m: Mats,
  y0: number,
  y1: number,
  posts: [number, number][],
  mat?: THREE.Material,
): void {
  for (const [x, z] of posts) {
    b.box(mat ?? m.woodDark, x - 0.09, y0, z - 0.09, x + 0.09, y1, z + 0.09, { collide: true });
  }
}

/** Gable roof: two sloped slabs meeting at a ridge along X or Z. */
export function gableRoof(
  b: Builder,
  m: Mats,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  yEave: number,
  yRidge: number,
  ridgeAlong: "x" | "z",
  mat?: THREE.Material,
): void {
  const roof = mat ?? m.roofDark;
  const rise = yRidge - yEave;
  if (ridgeAlong === "x") {
    const half = (maxZ - minZ) / 2;
    const slope = Math.hypot(half, rise) + 0.25;
    const ang = Math.atan2(rise, half);
    const cz1 = minZ + half / 2 - 0.1;
    const cz2 = maxZ - half / 2 + 0.1;
    b.rotBox(roof, (minX + maxX) / 2, yEave + rise / 2 + 0.06, cz1, maxX - minX + 0.5, 0.12, slope, 0, {
      rotX: -ang,
      collide: false,
    });
    b.rotBox(roof, (minX + maxX) / 2, yEave + rise / 2 + 0.06, cz2, maxX - minX + 0.5, 0.12, slope, 0, {
      rotX: ang,
      collide: false,
    });
  } else {
    const half = (maxX - minX) / 2;
    const slope = Math.hypot(half, rise) + 0.25;
    const ang = Math.atan2(rise, half);
    const cx1 = minX + half / 2 - 0.1;
    const cx2 = maxX - half / 2 + 0.1;
    b.rotBox(roof, cx1, yEave + rise / 2 + 0.06, (minZ + maxZ) / 2, slope, 0.12, maxZ - minZ + 0.5, 0, {
      rotZ: ang,
      collide: false,
    });
    b.rotBox(roof, cx2, yEave + rise / 2 + 0.06, (minZ + maxZ) / 2, slope, 0.12, maxZ - minZ + 0.5, 0, {
      rotZ: -ang,
      collide: false,
    });
  }
  // gable end fills
  if (ridgeAlong === "x") {
    b.box(roof, minX, yEave, (minZ + maxZ) / 2 - 0.12, maxX, yRidge - 0.05, (minZ + maxZ) / 2 + 0.12, {
      collide: false,
    });
  } else {
    b.box(roof, (minX + maxX) / 2 - 0.12, yEave, minZ, (minX + maxX) / 2 + 0.12, yRidge - 0.05, maxZ, {
      collide: false,
    });
  }
}
