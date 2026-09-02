/** Shared street/interior prop builders. Everything merges via Builder. */
import type { Facing } from "./coords";
import type { Builder } from "./geometry";
import type { Mats } from "./materials";
import {
  boardTex,
  epitaphTex,
  pictureTex,
  shelfTex,
  wantedBoardTex,
  type BoardOpts,
  type PictureKind,
  type ShelfKind,
} from "./textures";
import type { DoorSpec } from "./layout";
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/** Unit outward normal for a facing. */
export function normalOf(facing: Facing): [number, number] {
  return [facing === "E" ? 1 : facing === "W" ? -1 : 0, facing === "S" ? 1 : facing === "N" ? -1 : 0];
}

const pictureCache = new Map<string, THREE.MeshLambertMaterial>();

export function pictureMat(kind: PictureKind, w = 128, h = 96): THREE.MeshLambertMaterial {
  const key = `${kind}:${w}x${h}`;
  let mat = pictureCache.get(key);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ map: pictureTex(kind, w, h) });
    pictureCache.set(key, mat);
  }
  return mat;
}

let wantedBoardTexture: THREE.Texture | null = null;

export function wantedBoard(): THREE.Texture {
  if (!wantedBoardTexture) {
    wantedBoardTexture = wantedBoardTex();
  }
  return wantedBoardTexture;
}

const shelfCache = new Map<string, THREE.MeshLambertMaterial>();

export function shelfMat(kind: ShelfKind, rows = 3): THREE.MeshLambertMaterial {
  const key = `${kind}:${rows}`;
  let mat = shelfCache.get(key);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ map: shelfTex(kind, rows) });
    shelfCache.set(key, mat);
  }
  return mat;
}

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

/**
 * Picket fence: square posts, two rails and pointed slats with air
 * between them, as the cemetery and yard fences are filmed. One thin
 * collider slab along the run.
 */
export function picketFence(
  b: Builder,
  m: Mats,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h = 1.25,
  mat?: THREE.Material,
  opts: { slat?: number; gap?: number; pointed?: boolean; postEvery?: number } = {},
): void {
  const f = mat ?? m.fenceGray;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const fixed = alongX ? z0 : x0;
  const slat = opts.slat ?? 0.1;
  const gap = opts.gap ?? 0.07;
  const pitch = slat + gap;
  const put = (u0: number, u1: number, y0: number, y1: number, t: number, collide = false): void => {
    if (alongX) {
      b.box(f, u0, y0, fixed - t / 2, u1, y1, fixed + t / 2, { collide });
    } else {
      b.box(f, fixed - t / 2, y0, u0, fixed + t / 2, y1, u1, { collide });
    }
  };
  // posts
  const postEvery = opts.postEvery ?? 2.4;
  const posts = Math.max(2, Math.round((a1 - a0) / postEvery) + 1);
  for (let i = 0; i < posts; i += 1) {
    const u = a0 + ((a1 - a0) * i) / (posts - 1);
    put(u - 0.07, u + 0.07, 0, h + 0.12, 0.14);
  }
  // rails
  put(a0, a1, h * 0.28, h * 0.36, 0.05);
  put(a0, a1, h * 0.76, h * 0.84, 0.05);
  // slats, tips pointed
  for (let u = a0 + gap; u + slat <= a1 - gap * 0.5; u += pitch) {
    put(u, u + slat, 0.08, h, 0.03);
    if (opts.pointed !== false) {
      const cx = alongX ? u + slat / 2 : fixed;
      const cz = alongX ? fixed : u + slat / 2;
      b.cone(f, cx, cz, h, h + slat * 0.9, slat * 0.55, 4);
    }
  }
  // one collider for the whole run
  if (alongX) {
    b.solid({ minX: a0, minY: 0, minZ: fixed - 0.06, maxX: a1, maxY: h, maxZ: fixed + 0.06 });
  } else {
    b.solid({ minX: fixed - 0.06, minY: 0, minZ: a0, maxX: fixed + 0.06, maxY: h, maxZ: a1 });
  }
}

/**
 * Close-boarded fence whose top sags in a scallop between two posts —
 * the dark fence between the mayor's brick pillars (G10 S / I10 E).
 */
export function boardFence(
  b: Builder,
  m: Mats,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  hEnd: number,
  hMid: number,
  mat?: THREE.Material,
): void {
  const f = mat ?? m.woodBlack;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const fixed = alongX ? z0 : x0;
  const board = 0.22;
  const pitch = 0.235;
  for (let u = a0; u < a1 - 0.02; u += pitch) {
    const t = (u + board / 2 - a0) / (a1 - a0);
    const c = Math.cos(Math.PI * t);
    const hh = hMid + (hEnd - hMid) * c * c;
    const u1 = Math.min(u + board, a1);
    if (alongX) {
      b.box(f, u, 0.05, fixed - 0.03, u1, hh, fixed + 0.03, { collide: false });
    } else {
      b.box(f, fixed - 0.03, 0.05, u, fixed + 0.03, hh, u1, { collide: false });
    }
  }
  // rails on the yard side
  for (const ry of [0.4, hMid - 0.35]) {
    if (alongX) {
      b.box(f, a0, ry, fixed + 0.03, a1, ry + 0.1, fixed + 0.09, { collide: false });
    } else {
      b.box(f, fixed - 0.09, ry, a0, fixed - 0.03, ry + 0.1, a1, { collide: false });
    }
  }
  if (alongX) {
    b.solid({ minX: a0, minY: 0, minZ: fixed - 0.06, maxX: a1, maxY: hMid, maxZ: fixed + 0.06 });
  } else {
    b.solid({ minX: fixed - 0.06, minY: 0, minZ: a0, maxX: fixed + 0.06, maxY: hMid, maxZ: a1 });
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

/**
 * Freight wagon: plank bed on bolsters over two iron axles, sides,
 * seat, red spoked wheels, tongue. The running gear is what keeps the
 * bed from floating over the wheels.
 */
export function wagon(b: Builder, m: Mats, x: number, z: number, rotY = 0): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const off = (dx: number, dz: number): [number, number] => [x + dx * c - dz * s, z + dx * s + dz * c];
  const rearR = 0.75;
  const frontR = 0.58;
  const bedY = 0.92; // underside of the bed
  // axles on the wheel centres, bolsters carrying the bed
  for (const [dx, r] of [
    [-1.5, rearR],
    [1.55, frontR],
  ] as const) {
    const [ax, az] = off(dx, 0);
    b.rotBox(m.iron, ax, r, az, 0.09, 0.09, 2.12, rotY, { collide: false });
    b.rotBox(m.woodDark, ax, (r + bedY) / 2, az, 0.32, bedY - r + 0.02, 1.7, rotY, { collide: false });
  }
  // reach pole between the axles, sloping from the tall rear axle to the front
  {
    const [rx, rz] = off(0.025, 0);
    const slope = Math.atan2(frontR - rearR, 3.05);
    b.rotBox(m.woodDark, rx, (rearR + frontR) / 2, rz, 3.1, 0.1, 0.12, rotY, { rotZ: slope, collide: false });
  }
  b.rotBox(m.woodSaloon, x, bedY + 0.1, z, 4.2, 0.2, 1.9, rotY, { collide: true });
  // side boards + tail board
  const [n1x, n1z] = off(0, -0.88);
  const [n2x, n2z] = off(0, 0.88);
  const [tbx, tbz] = off(-2.03, 0);
  b.rotBox(m.woodSaloon, n1x, bedY + 0.45, n1z, 4.2, 0.5, 0.14, rotY, { collide: false });
  b.rotBox(m.woodSaloon, n2x, bedY + 0.45, n2z, 4.2, 0.5, 0.14, rotY, { collide: false });
  b.rotBox(m.woodSaloon, tbx, bedY + 0.45, tbz, 0.14, 0.5, 1.9, rotY, { collide: false });
  // seat up front on two brackets
  const [sx2, sz2] = off(1.7, 0);
  b.rotBox(m.woodDark, sx2, bedY + 0.68, sz2, 0.8, 0.1, 1.5, rotY, { collide: false });
  for (const side of [-0.6, 0.6]) {
    const [kx, kz] = off(1.7, side);
    b.rotBox(m.woodDark, kx, bedY + 0.4, kz, 0.6, 0.5, 0.08, rotY, { collide: false });
  }
  // sacks in the bed
  const [k1x, k1z] = off(-0.9, 0.3);
  const [k2x, k2z] = off(-0.1, -0.35);
  sack(b, m, k1x, k1z, bedY + 0.2);
  sack(b, m, k2x, k2z, bedY + 0.2);
  // wheels: small front pair, tall rear pair
  for (const [dx, dz, r] of [
    [-1.5, -1.03, rearR],
    [-1.5, 1.03, rearR],
    [1.55, -1.03, frontR],
    [1.55, 1.03, frontR],
  ] as const) {
    const [wx, wz] = off(dx, dz);
    spokedWheel(b, m, wx, wz, r, { rotY, mat: m.curioRed });
  }
  // tongue: pinned to the front axle, its tip resting on the ground ahead
  {
    const run = 2.2;
    const [tx, tz] = off(1.55 + run / 2, 0);
    const slope = Math.atan2(0.05 - frontR, run);
    const len = Math.hypot(run, frontR - 0.05) + 0.1;
    b.rotBox(m.woodDark, tx, (frontR + 0.05) / 2, tz, len, 0.1, 0.1, rotY, { rotZ: slope, collide: false });
    // doubletree across the tongue
    const [ex, ez] = off(1.55 + 0.7, 0);
    const ey = frontR + (0.05 - frontR) * (0.7 / run);
    b.rotBox(m.woodDark, ex, ey, ez, 0.08, 0.08, 1.25, rotY, { collide: false });
  }
}

/** Light open buckboard on iron axles, gray spoked wheels. */
export function buckboard(b: Builder, m: Mats, x: number, z: number, rotY = 0): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const off = (dx: number, dz: number): [number, number] => [x + dx * c - dz * s, z + dx * s + dz * c];
  const bedY = 0.77;
  for (const [dx, r] of [
    [-1.05, 0.62],
    [1.05, 0.5],
  ] as const) {
    const [ax, az] = off(dx, 0);
    b.rotBox(m.iron, ax, r, az, 0.08, 0.08, 1.7, rotY, { collide: false });
    b.rotBox(m.woodGray, ax, (r + bedY) / 2, az, 0.26, bedY - r + 0.02, 1.3, rotY, { collide: false });
  }
  b.rotBox(m.woodGray, x, 0.56, z, 2.2, 0.08, 0.1, rotY, { rotZ: Math.atan2(-0.12, 2.1), collide: false });
  b.rotBox(m.woodGray, x, bedY + 0.08, z, 3.2, 0.16, 1.5, rotY, { collide: true });
  const [bx, bz] = off(0.9, 0);
  b.rotBox(m.woodGray, bx, bedY + 0.48, bz, 0.7, 0.1, 1.3, rotY, { collide: false });
  for (const side of [-0.5, 0.5]) {
    const [kx, kz] = off(0.9, side);
    b.rotBox(m.woodGray, kx, bedY + 0.28, kz, 0.5, 0.36, 0.07, rotY, { collide: false });
  }
  for (const [dx, dz, r] of [
    [-1.05, -0.82, 0.62],
    [-1.05, 0.82, 0.62],
    [1.05, -0.82, 0.5],
    [1.05, 0.82, 0.5],
  ] as const) {
    const [wx, wz] = off(dx, dz);
    spokedWheel(b, m, wx, wz, r, { rotY, mat: m.woodGray });
  }
  // a pair of shafts off the front axle, tips resting on the ground
  {
    const run = 1.9;
    const slope = Math.atan2(0.05 - 0.5, run);
    const len = Math.hypot(run, 0.45) + 0.08;
    for (const side of [-0.45, 0.45]) {
      const [tx, tz] = off(1.05 + run / 2, side);
      b.rotBox(m.woodGray, tx, 0.275, tz, len, 0.08, 0.08, rotY, { rotZ: slope, collide: false });
    }
    const [cx, cz] = off(1.05 + 0.35, 0);
    b.rotBox(m.woodGray, cx, 0.5 - 0.45 * (0.35 / run), cz, 0.07, 0.07, 0.95, rotY, { collide: false });
  }
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

export type StoneKind = "slate" | "granite" | "cross" | "wood";

/**
 * Shady Acres headstones as filmed: round-headed slate slabs lettered
 * in white, squat gray granite blocks, a few boards and crosses.
 * `facing` is the side the epitaph is cut on.
 */
export function gravestone(
  b: Builder,
  m: Mats,
  x: number,
  z: number,
  kind: StoneKind,
  opts: { text?: string[]; facing?: Facing; h?: number; lean?: number; w?: number } = {},
): void {
  const facing = opts.facing ?? "E";
  const lean = opts.lean ?? 0;
  const alongX = facing === "N" || facing === "S"; // slab face runs along X
  const rotY = alongX ? 0 : Math.PI / 2;
  const ox = facing === "E" ? 1 : facing === "W" ? -1 : 0;
  const oz = facing === "S" ? 1 : facing === "N" ? -1 : 0;
  if (kind === "cross") {
    b.rotBox(m.woodGray, x, 0.6, z, 0.12, 1.2, 0.12, rotY, { rotZ: lean, collide: false });
    b.rotBox(m.woodGray, x, 0.9, z, 0.6, 0.12, 0.12, rotY, { rotZ: lean, collide: false });
    b.solid({ minX: x - 0.1, minY: 0, minZ: z - 0.1, maxX: x + 0.1, maxY: 1.1, maxZ: z + 0.1 });
    return;
  }
  const w = opts.w ?? (kind === "granite" ? 0.62 : kind === "wood" ? 0.5 : 0.74);
  const h = opts.h ?? (kind === "granite" ? 0.78 : kind === "wood" ? 0.9 : 1.05);
  const t = kind === "granite" ? 0.2 : kind === "wood" ? 0.06 : 0.1;
  const mat = kind === "granite" ? m.granite : kind === "wood" ? m.woodGray : m.slate;
  const bodyTop = h - w / 2;
  b.rotBox(mat, x, bodyTop / 2, z, w, bodyTop, t, rotY, { rotZ: lean, collide: false });
  if (kind !== "wood") {
    // round head: a short cylinder lying along the slab's thickness
    const cap = new THREE.CylinderGeometry(w / 2, w / 2, t, 18);
    cap.rotateX(Math.PI / 2);
    if (lean) {
      cap.rotateZ(lean);
    }
    cap.rotateY(rotY);
    cap.translate(x, bodyTop, z);
    b.mesh(mat, cap);
  }
  if (kind === "granite") {
    b.rotBox(mat, x, 0.08, z, w + 0.24, 0.16, t + 0.24, rotY, { collide: false });
  }
  if (opts.text && opts.text.length > 0) {
    const tex = epitaphTex(opts.text, kind === "granite" ? "granite" : kind === "wood" ? "wood" : "slate");
    const tm = new THREE.MeshLambertMaterial({ map: tex });
    const off = t / 2 + 0.012;
    b.decal(tm, x + ox * off, h * 0.5, z + oz * off, w * 0.86, h * 0.86, facing);
  }
  b.solid({
    minX: x - (alongX ? w / 2 : t / 2 + 0.05),
    minY: 0,
    minZ: z - (alongX ? t / 2 + 0.05 : w / 2),
    maxX: x + (alongX ? w / 2 : t / 2 + 0.05),
    maxY: h,
    maxZ: z + (alongX ? t / 2 + 0.05 : w / 2),
  });
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

export function tableRound(b: Builder, m: Mats, x: number, z: number, r = 0.65, y0 = 0): void {
  b.cyl(m.woodMid, x, z, y0 + 0.72, y0 + 0.78, r, { seg: 12, collide: true });
  b.cyl(m.woodDark, x, z, y0, y0 + 0.72, 0.09, { seg: 8 });
  b.cyl(m.woodDark, x, z, y0, y0 + 0.06, 0.4, { seg: 8 });
}

export function chair(b: Builder, m: Mats, x: number, z: number, rotY = 0, y0 = 0): void {
  b.rotBox(m.woodMid, x, y0 + 0.46, z, 0.46, 0.06, 0.46, rotY, { collide: false });
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  b.rotBox(m.woodMid, x - 0.2 * c, y0 + 0.75, z + 0.2 * s, 0.46, 0.6, 0.06, rotY, { collide: false });
  for (const [dx, dz] of [
    [-0.18, -0.18],
    [-0.18, 0.18],
    [0.18, -0.18],
    [0.18, 0.18],
  ] as const) {
    b.rotBox(m.woodDark, x + dx * c - dz * s, y0 + 0.23, z + dx * s + dz * c, 0.05, 0.46, 0.05, rotY, {
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

export function coatRack(b: Builder, m: Mats, x: number, z: number, y0 = 0): void {
  b.cyl(m.woodDark, x, z, y0, y0 + 1.8, 0.05, { seg: 6 });
  b.cyl(m.woodDark, x, z, y0, y0 + 0.05, 0.3, { seg: 8 });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    b.rotBox(m.woodDark, x + Math.cos(a) * 0.18, y0 + 1.7, z + Math.sin(a) * 0.18, 0.3, 0.04, 0.04, a, {
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

/** Wall sconce: iron bracket + warm glass chimney. `facing` is the
 * direction the sconce sticks out from its wall. */
export function sconce(b: Builder, m: Mats, x: number, y: number, z: number, facing: Facing): void {
  const ox = facing === "E" ? 1 : facing === "W" ? -1 : 0;
  const oz = facing === "S" ? 1 : facing === "N" ? -1 : 0;
  b.box(
    m.iron,
    x + ox * 0.06 - 0.035,
    y - 0.32,
    z + oz * 0.06 - 0.035,
    x + ox * 0.06 + 0.035,
    y - 0.04,
    z + oz * 0.06 + 0.035,
    { collide: false },
  );
  b.box(
    m.glassWarm,
    x + ox * 0.14 - 0.07,
    y - 0.06,
    z + oz * 0.14 - 0.07,
    x + ox * 0.14 + 0.07,
    y + 0.28,
    z + oz * 0.14 + 0.07,
    { collide: false },
  );
}

/** Hanging lamp: rod, shade cone, warm glass. Green shade optional. */
export function hangLamp(
  b: Builder,
  m: Mats,
  x: number,
  z: number,
  yCeil: number,
  opts: { drop?: number; green?: boolean } = {},
): void {
  const drop = opts.drop ?? 0.75;
  const yShade = yCeil - drop;
  b.cyl(m.iron, x, z, yShade + 0.16, yCeil, 0.02, { seg: 5 });
  b.cone(opts.green ? m.cactusDark : m.iron, x, z, yShade, yShade + 0.28, 0.34, 9);
  b.box(m.glassWarm, x - 0.075, yShade - 0.2, z - 0.075, x + 0.075, yShade + 0.04, z + 0.075, {
    collide: false,
  });
}

/** Candle-wheel chandelier: iron ring with warm candle tips. */
export function candleWheel(
  b: Builder,
  m: Mats,
  x: number,
  z: number,
  y: number,
  r = 0.75,
  n = 6,
  yCeil?: number,
): void {
  const ring = new THREE.TorusGeometry(r, 0.045, 6, 14);
  ring.rotateX(Math.PI / 2);
  ring.translate(x, y, z);
  b.mesh(m.iron, ring);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const cx = x + Math.cos(a) * r;
    const cz = z + Math.sin(a) * r;
    b.box(m.glassWarm, cx - 0.04, y, cz - 0.04, cx + 0.04, y + 0.22, cz + 0.04, { collide: false });
  }
  if (yCeil !== undefined) {
    b.cyl(m.iron, x, z, y, yCeil, 0.02, { seg: 5 });
  }
}

/** Mounted trophy head (deer/elk) on a plaque. */
export function trophyHead(b: Builder, m: Mats, x: number, y: number, z: number, facing: Facing): void {
  const ox = facing === "E" ? 1 : facing === "W" ? -1 : 0;
  const oz = facing === "S" ? 1 : facing === "N" ? -1 : 0;
  const rotY = ox !== 0 ? Math.PI / 2 : 0;
  b.rotBox(m.woodMid, x + ox * 0.04, y, z + oz * 0.04, 0.5, 0.66, 0.07, rotY, { collide: false });
  b.rotBox(m.woodStage, x + ox * 0.24, y + 0.04, z + oz * 0.24, 0.27, 0.32, 0.36, rotY, { collide: false });
  b.rotBox(m.woodStage, x + ox * 0.45, y - 0.12, z + oz * 0.45, 0.16, 0.2, 0.22, rotY, { collide: false });
  const sx = -oz;
  const sz = ox;
  for (const side of [-1, 1]) {
    b.rotBox(
      m.bone,
      x + ox * 0.2 + sx * side * 0.17,
      y + 0.42,
      z + oz * 0.2 + sz * side * 0.17,
      0.055,
      0.5,
      0.055,
      rotY,
      { rotZ: side * 0.45, collide: false },
    );
    b.rotBox(
      m.bone,
      x + ox * 0.2 + sx * side * 0.3,
      y + 0.58,
      z + oz * 0.2 + sz * side * 0.3,
      0.05,
      0.26,
      0.05,
      rotY,
      { rotZ: -side * 0.35, collide: false },
    );
  }
}

export function potPlant(b: Builder, m: Mats, x: number, z: number, y0 = 0): void {
  b.cyl(m.brickMayor, x, z, y0, y0 + 0.4, 0.28, { rTop: 0.34, seg: 8, collide: false });
  b.cyl(m.cactus, x, z, y0 + 0.4, y0 + 1.15, 0.14, { seg: 6 });
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

/**
 * Triangular gable-end fill under a ridge: the wall material carried
 * up to the roof line, so a barn never shows daylight under its roof.
 */
function gableEnd(
  b: Builder,
  mat: THREE.Material,
  along: "x" | "z",
  u0: number,
  u1: number,
  fixed: number,
  yEave: number,
  yRidge: number,
  t = 0.3,
): void {
  const shape = new THREE.Shape();
  shape.moveTo(u0, yEave - 0.05);
  shape.lineTo(u1, yEave - 0.05);
  shape.lineTo((u0 + u1) / 2, yRidge);
  shape.closePath();
  const geom = mergeVertices(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }));
  const texWorld = (mat.userData?.texWorld as number | undefined) ?? 2.5;
  const uv = geom.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) / texWorld, uv.getY(i) / texWorld);
  }
  uv.needsUpdate = true;
  if (along === "x") {
    geom.translate(0, 0, fixed);
  } else {
    geom.rotateY(-Math.PI / 2);
    geom.translate(fixed + t, 0, 0);
  }
  b.mesh(mat, geom);
}

/** Gable roof: two sloped slabs meeting at a ridge along X or Z, with
 * closed gable ends in `endMat` (the building's wall material). */
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
  endMat?: THREE.Material,
): void {
  const roof = mat ?? m.roofDark;
  const rise = yRidge - yEave;
  if (endMat) {
    if (ridgeAlong === "x") {
      gableEnd(b, endMat, "z", minZ, maxZ, minX, yEave, yRidge);
      gableEnd(b, endMat, "z", minZ, maxZ, maxX - 0.3, yEave, yRidge);
    } else {
      gableEnd(b, endMat, "x", minX, maxX, minZ, yEave, yRidge);
      gableEnd(b, endMat, "x", minX, maxX, maxZ - 0.3, yEave, yRidge);
    }
  }
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
  // ridge board
  if (ridgeAlong === "x") {
    b.box(roof, minX - 0.25, yRidge - 0.08, (minZ + maxZ) / 2 - 0.12, maxX + 0.25, yRidge + 0.08, (minZ + maxZ) / 2 + 0.12, {
      collide: false,
    });
  } else {
    b.box(roof, (minX + maxX) / 2 - 0.12, yRidge - 0.08, minZ - 0.25, (minX + maxX) / 2 + 0.12, yRidge + 0.08, maxZ + 0.25, {
      collide: false,
    });
  }
}

/**
 * A door that never opens — for the rooms the film never lets you into.
 * A framed, panelled leaf standing proud of the wall face, with a
 * knob and an optional plate, so it reads as a door and not a board.
 */
export function fakeDoor(
  b: Builder,
  m: Mats,
  x: number,
  y0: number,
  z: number,
  w: number,
  h: number,
  facing: Facing,
  opts: { label?: string; mat?: THREE.Material; frame?: THREE.Material; plate?: BoardOpts } = {},
): void {
  const wood = opts.mat ?? m.woodSaloon;
  const frame = opts.frame ?? m.woodDark;
  const [nx, nz] = normalOf(facing);
  const tx = nz !== 0 ? 1 : 0;
  const tz = nx !== 0 ? 1 : 0;
  // frame: jambs + head, proud of the wall
  wallBox(b, frame, x - tx * (w / 2), y0, z - tz * (w / 2), 0.11, h + 0.1, 0.09, facing);
  wallBox(b, frame, x + tx * (w / 2), y0, z + tz * (w / 2), 0.11, h + 0.1, 0.09, facing);
  wallBox(b, frame, x, y0 + h, z, w + 0.11, 0.11, 0.09, facing);
  // the leaf, recessed a touch inside the frame, with two raised panels
  wallBox(b, wood, x, y0 + 0.02, z, w - 0.08, h - 0.02, 0.055, facing, false, 0.012);
  wallBox(b, wood, x, y0 + h * 0.56, z, w * 0.56, h * 0.3, 0.02, facing, false, 0.067);
  wallBox(b, wood, x, y0 + h * 0.12, z, w * 0.56, h * 0.3, 0.02, facing, false, 0.067);
  b.sphere(m.brass, x + nx * 0.1 + tx * (w / 2 - 0.13), y0 + h * 0.46, z + nz * 0.1 + tz * (w / 2 - 0.13), 0.035, 7);
  if (opts.label) {
    const tex = boardTex([opts.label], 0.42, 0.3, opts.plate ?? { bg: "#3a2b1f", fg: "#dfb44e" });
    const pm = new THREE.MeshLambertMaterial({ map: tex });
    b.decal(pm, x + nx * 0.07, y0 + h * 0.8, z + nz * 0.07, 0.42, 0.3, facing);
  }
}

/**
 * Jambs, head and threshold around a door opening: the wall is cut
 * `extra` wider than the leaf each side and 0.12 higher, and the
 * frame fills exactly that margin, `t` deep through the wall and
 * 4 cm proud of both faces, so a swung leaf hangs in a real frame
 * instead of a hole.
 */
export function doorFrame(b: Builder, m: Mats, spec: DoorSpec, extra = 0.12, t = 0.3, mat?: THREE.Material): void {
  const wood = mat ?? m.woodDark;
  const half = spec.width / 2 + extra;
  const top = spec.y + spec.height + 0.12;
  const headH = 0.12;
  const alongZ = spec.side === "E" || spec.side === "W";
  // the leaf hangs on the wall face at spec.x/z; the wall body lies behind it
  const inward = spec.side === "E" || spec.side === "S" ? -1 : 1;
  const face = alongZ ? spec.x : spec.z;
  const f0 = Math.min(face, face + inward * t) - 0.04;
  const f1 = Math.max(face, face + inward * t) + 0.04;
  const run = alongZ ? spec.z : spec.x;
  const put = (r0: number, r1: number, y0: number, y1: number, collide: boolean): void => {
    if (alongZ) {
      b.box(wood, f0, y0, r0, f1, y1, r1, { collide });
    } else {
      b.box(wood, r0, y0, f0, r1, y1, f1, { collide });
    }
  };
  put(run - half, run - half + extra, spec.y, top, true);
  put(run + half - extra, run + half, spec.y, top, true);
  put(run - half, run + half, top - headH, top, false);
  put(run - half + extra, run + half - extra, spec.y, spec.y + 0.03, false);
}

/* ------------------------------------------------------------------ */
/* Interior furniture. Wall props take the wall FACE position and the  */
/* facing normal pointing into the room; they stand just off the wall. */

/** Box with `w` along the wall, `h` up, `d` out from the wall face. */
function wallBox(
  b: Builder,
  mat: THREE.Material,
  x: number,
  y0: number,
  z: number,
  w: number,
  h: number,
  d: number,
  facing: Facing,
  collide = false,
  off = 0,
): void {
  const [nx, nz] = normalOf(facing);
  if (nx !== 0) {
    const x0 = nx > 0 ? x + off : x - off - d;
    b.box(mat, x0, y0, z - w / 2, x0 + d, y0 + h, z + w / 2, { collide });
  } else {
    const z0 = nz > 0 ? z + off : z - off - d;
    b.box(mat, x - w / 2, y0, z0, x + w / 2, y0 + h, z0 + d, { collide });
  }
}

/** Framed picture hung on a wall face. */
export function pictureFrame(
  b: Builder,
  m: Mats,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  facing: Facing,
  kind: PictureKind,
  opts: { frame?: THREE.Material; px?: number; py?: number } = {},
): void {
  const fm = opts.frame ?? m.brass;
  const [nx, nz] = normalOf(facing);
  const t = Math.min(0.06, w * 0.08);
  const d = 0.05;
  wallBox(b, fm, x, y + h / 2 - t, z, w, t, d, facing);
  wallBox(b, fm, x, y - h / 2, z, w, t, d, facing);
  const side = (u: number): void => {
    if (nx !== 0) {
      wallBox(b, fm, x, y - h / 2, z + u, t, h, d, facing);
    } else {
      wallBox(b, fm, x + u, y - h / 2, z, t, h, d, facing);
    }
  };
  side(-w / 2 + t / 2);
  side(w / 2 - t / 2);
  b.decal(pictureMat(kind, opts.px ?? 128, opts.py ?? 96), x + nx * 0.03, y, z + nz * 0.03, w - t * 2, h - t * 2, facing);
}

/** Open shelving unit against a wall, its face painted with goods. */
export function shelfUnit(
  b: Builder,
  m: Mats,
  x: number,
  y0: number,
  z: number,
  w: number,
  h: number,
  depth: number,
  facing: Facing,
  kind: ShelfKind,
  rows = 3,
  mat?: THREE.Material,
): void {
  const [nx, nz] = normalOf(facing);
  wallBox(b, mat ?? m.woodDark, x, y0, z, w, h, depth, facing, true);
  b.decal(shelfMat(kind, rows), x + nx * (depth + 0.012), y0 + h / 2, z + nz * (depth + 0.012), w - 0.06, h - 0.06, facing);
}

/** Plain counter: body + overhanging top slab. */
export function counter(
  b: Builder,
  m: Mats,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
  mat: THREE.Material,
  topMat?: THREE.Material,
): void {
  b.box(mat, x0, 0, z0, x1, h - 0.06, z1);
  b.box(topMat ?? m.woodDark, x0 - 0.06, h - 0.06, z0 - 0.06, x1 + 0.06, h, z1 + 0.06, { collide: false });
}

/** Apothecary case: wood base under a brass-edged glass vitrine. */
export function glassCase(b: Builder, m: Mats, x0: number, z0: number, x1: number, z1: number): void {
  b.box(m.woodSaloon, x0, 0, z0, x1, 0.92, z1);
  b.box(m.woodDark, x0 - 0.04, 0.9, z0 - 0.04, x1 + 0.04, 0.96, z1 + 0.04, { collide: false });
  b.box(m.glassClear, x0 + 0.05, 0.96, z0 + 0.05, x1 - 0.05, 1.32, z1 - 0.05, { collide: false });
  b.solid({ minX: x0, minY: 0, minZ: z0, maxX: x1, maxY: 1.32, maxZ: z1 });
  for (const [ex, ez] of [
    [x0 + 0.05, z0 + 0.05],
    [x1 - 0.05, z0 + 0.05],
    [x0 + 0.05, z1 - 0.05],
    [x1 - 0.05, z1 - 0.05],
  ] as const) {
    b.box(m.brass, ex - 0.02, 0.96, ez - 0.02, ex + 0.02, 1.34, ez + 0.02, { collide: false });
  }
  b.box(m.brass, x0 + 0.03, 1.32, z0 + 0.03, x1 - 0.03, 1.35, z1 - 0.03, { collide: false });
}

/** Bed: frame, mattress, quilt, headboard against `head`. */
export function bed(
  b: Builder,
  m: Mats,
  x: number,
  z: number,
  w: number,
  l: number,
  head: Facing,
  quilt?: THREE.Material,
  opts: { canopy?: boolean; y0?: number; frame?: THREE.Material } = {},
): void {
  const y0 = opts.y0 ?? 0;
  const frame = opts.frame ?? m.woodSaloon;
  const alongZ = head === "N" || head === "S";
  const hw = alongZ ? w / 2 : l / 2;
  const hl = alongZ ? l / 2 : w / 2;
  b.box(frame, x - hw, y0, z - hl, x + hw, y0 + 0.5, z + hl);
  b.box(m.linen, x - hw + 0.05, y0 + 0.5, z - hl + 0.05, x + hw - 0.05, y0 + 0.66, z + hl - 0.05, { collide: false });
  b.box(quilt ?? m.quiltGreen, x - hw + 0.03, y0 + 0.62, z - hl + 0.35, x + hw - 0.03, y0 + 0.74, z + hl - 0.03, { collide: false });
  // pillow at the head
  const [nx, nz] = normalOf(head);
  b.box(m.white, x + nx * (hl - 0.35) - (alongZ ? hw - 0.15 : 0.22), y0 + 0.66, z + nz * (hl - 0.35) - (alongZ ? 0.22 : hw - 0.15), x + nx * (hl - 0.35) + (alongZ ? hw - 0.15 : 0.22), y0 + 0.8, z + nz * (hl - 0.35) + (alongZ ? 0.22 : hw - 0.15), { collide: false });
  // headboard (and canopy posts)
  const hbH = opts.canopy ? 1.5 : 1.1;
  b.box(frame, x + nx * hl - (alongZ ? hw : 0.05), y0, z + nz * hl - (alongZ ? 0.05 : hw), x + nx * hl + (alongZ ? hw : 0.05), y0 + hbH, z + nz * hl + (alongZ ? 0.05 : hw), { collide: false });
  if (opts.canopy) {
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      b.box(frame, x + sx * (hw - 0.06) - 0.05, y0, z + sz * (hl - 0.06) - 0.05, x + sx * (hw - 0.06) + 0.05, y0 + 2.2, z + sz * (hl - 0.06) + 0.05, { collide: false });
    }
    b.box(m.curtainRed, x - hw - 0.08, y0 + 2.2, z - hl - 0.08, x + hw + 0.08, y0 + 2.34, z + hl + 0.08, { collide: false });
  }
}

/** Tall wardrobe against a wall. */
export function armoire(b: Builder, m: Mats, x: number, z: number, w: number, facing: Facing, h = 2.1, y0 = 0): void {
  wallBox(b, m.woodSaloon, x, y0, z, w, h, 0.6, facing, true);
  const [nx, nz] = normalOf(facing);
  // two door panels + knobs
  b.decal(m.woodDark, x + nx * 0.612, y0 + h / 2, z + nz * 0.612, 0.05, h - 0.2, facing);
  const sx = nz !== 0 ? 1 : 0;
  const sz = nx !== 0 ? 1 : 0;
  for (const side of [-1, 1]) {
    b.sphere(m.brass, x + nx * 0.63 + sx * side * 0.08, y0 + h * 0.5, z + nz * 0.63 + sz * side * 0.08, 0.025, 6);
  }
}

/** Washstand: cabinet, jug + bowl, mirror above. */
export function washstand(b: Builder, m: Mats, x: number, z: number, facing: Facing, y0 = 0): void {
  wallBox(b, m.woodMid, x, y0, z, 0.9, 0.85, 0.5, facing, true);
  const [nx, nz] = normalOf(facing);
  b.flat(m.marble, x + nx * 0.25 - 0.47, z + nz * 0.25 - 0.47, x + nx * 0.25 + 0.47, z + nz * 0.25 + 0.47, y0 + 0.87);
  b.cyl(m.white, x + nx * 0.25 - nz * 0.18, z + nz * 0.25 + nx * 0.18, y0 + 0.87, y0 + 0.95, 0.16, { seg: 9 });
  b.cyl(m.white, x + nx * 0.25 + nz * 0.2, z + nz * 0.25 - nx * 0.2, y0 + 0.87, y0 + 1.2, 0.1, { seg: 8 });
  pictureFrame(b, m, x, y0 + 1.55, z, 0.5, 0.7, facing, "mirror", { frame: m.woodDark, px: 64, py: 96 });
}

/** Writing desk with drawers; axis-aligned, `w` along X. */
export function desk(b: Builder, m: Mats, x: number, z: number, w = 1.6, d = 0.85, mat?: THREE.Material): void {
  const wood = mat ?? m.woodMid;
  b.box(wood, x - w / 2, 0.68, z - d / 2, x + w / 2, 0.78, z + d / 2);
  b.box(wood, x - w / 2 + 0.05, 0, z - d / 2 + 0.08, x - w / 2 + 0.5, 0.68, z + d / 2 - 0.08);
  b.box(wood, x + w / 2 - 0.5, 0, z - d / 2 + 0.08, x + w / 2 - 0.05, 0.68, z + d / 2 - 0.08);
  b.box(m.woodDark, x - w / 2 + 0.03, 0.78, z - d / 2 + 0.03, x + w / 2 - 0.03, 0.8, z + d / 2 - 0.03, { collide: false });
  for (const side of [-1, 1]) {
    for (const dy of [0.2, 0.45]) {
      b.sphere(m.brass, x + side * (w / 2 - 0.27), dy, z + d / 2 + 0.01, 0.02, 6);
    }
  }
}

/** Brick fireplace with a mantel shelf and a dark firebox. */
export function fireplace(b: Builder, m: Mats, x: number, z: number, facing: Facing, w = 2.0, brick?: THREE.Material): void {
  const mat = brick ?? m.brickBank;
  const [nx, nz] = normalOf(facing);
  wallBox(b, mat, x, 0, z, w, 2.4, 0.55, facing, true);
  wallBox(b, m.marble, x, 1.35, z, w + 0.2, 0.09, 0.7, facing, false);
  // firebox opening (dark) + fender + andirons
  b.decal(m.iron, x + nx * 0.562, 0.5, z + nz * 0.562, w * 0.5, 1.0, facing);
  wallBox(b, m.iron, x, 0, z, w * 0.55, 0.12, 0.25, facing, false, 0.55);
  b.box(m.glassWarm, x + nx * 0.5 - 0.15, 0.06, z + nz * 0.5 - 0.15, x + nx * 0.5 + 0.15, 0.3, z + nz * 0.5 + 0.15, { collide: false });
}

/** China hutch: closed lower cabinet, open upper shelves of plates. */
export function hutch(b: Builder, m: Mats, x: number, z: number, w: number, facing: Facing): void {
  wallBox(b, m.woodSaloon, x, 0, z, w, 0.95, 0.55, facing, true);
  wallBox(b, m.woodSaloon, x, 0.95, z, w, 1.5, 0.35, facing, true);
  const [nx, nz] = normalOf(facing);
  b.decal(shelfMat("plates", 3), x + nx * 0.362, 1.7, z + nz * 0.362, w - 0.1, 1.42, facing);
  b.box(m.woodDark, x + nx * 0.28 - (nz !== 0 ? w / 2 : 0.3), 0.95, z + nz * 0.28 - (nx !== 0 ? w / 2 : 0.3), x + nx * 0.28 + (nz !== 0 ? w / 2 : 0.3), 0.99, z + nz * 0.28 + (nx !== 0 ? w / 2 : 0.3), { collide: false });
}

/** Upholstered sofa, back against the wall. */
export function sofa(b: Builder, m: Mats, x: number, z: number, w: number, facing: Facing, mat?: THREE.Material): void {
  const up = mat ?? m.leatherRed;
  wallBox(b, up, x, 0.2, z, w, 0.28, 0.85, facing, true);
  wallBox(b, up, x, 0.45, z, w, 0.55, 0.22, facing, false);
  const [nx, nz] = normalOf(facing);
  for (const side of [-1, 1]) {
    const ax = x + nx * 0.42 + (nz !== 0 ? side * (w / 2 - 0.1) : 0);
    const az = z + nz * 0.42 + (nx !== 0 ? side * (w / 2 - 0.1) : 0);
    b.box(up, ax - (nz !== 0 ? 0.1 : 0.42), 0.4, az - (nx !== 0 ? 0.1 : 0.42), ax + (nz !== 0 ? 0.1 : 0.42), 0.68, az + (nx !== 0 ? 0.1 : 0.42), { collide: false });
  }
  b.box(m.woodDark, x + nx * 0.42 - 0.42, 0, z + nz * 0.42 - 0.42, x + nx * 0.42 + 0.42, 0.2, z + nz * 0.42 + 0.42, { collide: false });
}

/** Tall case clock against a wall. */
export function grandfatherClock(b: Builder, m: Mats, x: number, z: number, facing: Facing, y0 = 0): void {
  wallBox(b, m.woodSaloon, x, y0, z, 0.55, 2.3, 0.4, facing, true);
  wallBox(b, m.woodSaloon, x, y0 + 2.3, z, 0.66, 0.16, 0.5, facing, false);
  const [nx, nz] = normalOf(facing);
  b.decal(m.paper, x + nx * 0.412, y0 + 1.95, z + nz * 0.412, 0.36, 0.36, facing);
  b.decal(m.glassCold, x + nx * 0.412, y0 + 1.05, z + nz * 0.412, 0.3, 1.0, facing);
  b.cyl(m.brass, x + nx * 0.3, z + nz * 0.3, y0 + 0.9, y0 + 0.98, 0.09, { seg: 8 });
}

/** Upright piano; `facing` is the side the keyboard is on. */
export function piano(b: Builder, m: Mats, x: number, z: number, facing: Facing): void {
  wallBox(b, m.woodBlack, x, 0, z, 1.5, 1.28, 0.55, facing, true);
  wallBox(b, m.woodBlack, x, 0.72, z, 1.5, 0.08, 0.28, facing, false, 0.55);
  const [nx, nz] = normalOf(facing);
  b.decal(m.white, x + nx * 0.83, 0.76, z + nz * 0.83, 1.28, 0.06, facing);
  b.solid({ minX: x - 0.8, minY: 0, minZ: z - 0.8, maxX: x + 0.8, maxY: 1.3, maxZ: z + 0.8 });
  // stool
  b.cyl(m.woodDark, x + nx * 1.15, z + nz * 1.15, 0, 0.48, 0.2, { seg: 8, collide: true });
}

/** Hexagonal paper lantern hung from the ceiling. */
export function paperLantern(b: Builder, m: Mats, x: number, y: number, z: number, yCeil: number): void {
  b.cyl(m.iron, x, z, y + 0.55, yCeil, 0.015, { seg: 4 });
  b.cyl(m.curioRed, x, z, y + 0.46, y + 0.55, 0.24, { seg: 6 });
  b.cyl(m.glassWarm, x, z, y, y + 0.46, 0.21, { seg: 6 });
  b.cyl(m.curioRed, x, z, y - 0.09, y, 0.24, { seg: 6 });
  b.box(m.curioRed, x - 0.02, y - 0.3, z - 0.02, x + 0.02, y - 0.09, z + 0.02, { collide: false });
}

/** Freestanding red fretwork screen (curiosities); blocks walking. */
export function latticeScreen(
  b: Builder,
  m: Mats,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h = 2.6,
  y0 = 0,
): void {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const panels = Math.max(1, Math.round(len / 0.9));
  for (let i = 0; i < panels; i += 1) {
    const t0 = i / panels;
    const t1 = (i + 1) / panels;
    const px = x0 + (x1 - x0) * ((t0 + t1) / 2);
    const pz = z0 + (z1 - z0) * ((t0 + t1) / 2);
    b.decal(m.lattice, px, y0 + h / 2, pz, len / panels, h, alongX ? "S" : "E");
  }
  // frame rails
  if (alongX) {
    b.box(m.curioRed, Math.min(x0, x1), y0, cz - 0.04, Math.max(x0, x1), y0 + 0.12, cz + 0.04, { collide: false });
    b.box(m.curioRed, Math.min(x0, x1), y0 + h - 0.1, cz - 0.04, Math.max(x0, x1), y0 + h, cz + 0.04, { collide: false });
    b.solid({ minX: Math.min(x0, x1), minY: y0, minZ: cz - 0.06, maxX: Math.max(x0, x1), maxY: y0 + h, maxZ: cz + 0.06 });
  } else {
    b.box(m.curioRed, cx - 0.04, y0, Math.min(z0, z1), cx + 0.04, y0 + 0.12, Math.max(z0, z1), { collide: false });
    b.box(m.curioRed, cx - 0.04, y0 + h - 0.1, Math.min(z0, z1), cx + 0.04, y0 + h, Math.max(z0, z1), { collide: false });
    b.solid({ minX: cx - 0.06, minY: y0, minZ: Math.min(z0, z1), maxX: cx + 0.06, maxY: y0 + h, maxZ: Math.max(z0, z1) });
  }
  for (const [px, pz] of [
    [x0, z0],
    [x1, z1],
  ] as const) {
    b.box(m.curioRed, px - 0.05, y0, pz - 0.05, px + 0.05, y0 + h, pz + 0.05, { collide: false });
  }
}

/**
 * Stair run with a raking balustrade: turned spindles on every tread
 * and a sloped handrail. `rail` names the side seen walking UP.
 */
export function railStairs(
  b: Builder,
  m: Mats,
  x0: number,
  z0: number,
  width: number,
  rise: number,
  run: number,
  dir: Facing,
  opts: {
    baseY?: number;
    steps?: number;
    rail?: "left" | "right" | "both" | "none";
    mat?: THREE.Material;
    runner?: THREE.Material;
    railH?: number;
  } = {},
): void {
  const baseY = opts.baseY ?? 0;
  const steps = opts.steps ?? 12;
  const mat = opts.mat ?? m.woodSaloon;
  const railH = opts.railH ?? 0.92;
  b.stairs(mat, x0, z0, width, rise, run, dir, baseY, steps);
  const stepRise = rise / steps;
  const stepRun = run / steps;
  // position of a point `d` along the run, `s` across (0..width)
  const at = (d: number, s: number): [number, number] => {
    if (dir === "N") {
      return [x0 + s, z0 - d];
    }
    if (dir === "S") {
      return [x0 + s, z0 + d];
    }
    if (dir === "E") {
      return [x0 + d, z0 + s];
    }
    return [x0 - d, z0 + s];
  };
  if (opts.runner) {
    for (let i = 0; i < steps; i += 1) {
      const [ax, az] = at(stepRun * i, width * 0.18);
      const [bx, bz] = at(stepRun * (i + 1), width * 0.82);
      b.flat(opts.runner, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), baseY + stepRise * (i + 1) + 0.008);
    }
  }
  const sides: number[] = [];
  const leftS = dir === "N" || dir === "W" ? 0.07 : width - 0.07;
  const rightS = dir === "N" || dir === "W" ? width - 0.07 : 0.07;
  if (opts.rail === "left" || opts.rail === "both") {
    sides.push(leftS);
  }
  if (opts.rail === "right" || opts.rail === "both" || opts.rail === undefined) {
    sides.push(rightS);
  }
  const angle = Math.atan2(rise, run);
  for (const s of sides) {
    for (let i = 0; i < steps; i += 1) {
      const [px, pz] = at(stepRun * (i + 0.5), s);
      const top = baseY + stepRise * (i + 1);
      b.box(m.woodDark, px - 0.03, top, pz - 0.03, px + 0.03, top + railH - 0.06, pz + 0.03, { collide: false });
    }
    const [mx, mz] = at(run / 2, s);
    const len = Math.hypot(run, rise);
    const my = baseY + rise / 2 + stepRise / 2 + railH - 0.03;
    if (dir === "E" || dir === "W") {
      b.rotBox(m.woodSaloon, mx, my, mz, len, 0.07, 0.09, 0, { rotZ: dir === "E" ? angle : -angle, collide: false });
    } else {
      b.rotBox(m.woodSaloon, mx, my, mz, 0.09, 0.07, len, 0, { rotX: dir === "N" ? angle : -angle, collide: false });
    }
    // newel posts at both ends
    for (const d of [0, run]) {
      const [nx2, nz2] = at(d, s);
      const ny = baseY + (d === 0 ? 0 : rise);
      b.box(m.woodSaloon, nx2 - 0.06, ny, nz2 - 0.06, nx2 + 0.06, ny + railH + 0.12, nz2 + 0.06, { collide: false });
      b.sphere(m.woodSaloon, nx2, ny + railH + 0.17, nz2, 0.07, 8);
    }
  }
}

/** Iron wall lantern with a warm glass chimney, hung on a wall face. */
export function wallLantern(b: Builder, m: Mats, x: number, y: number, z: number, facing: Facing): void {
  const [nx, nz] = normalOf(facing);
  b.box(m.iron, x + nx * 0.16 - 0.06, y + 0.26, z + nz * 0.16 - 0.06, x + nx * 0.16 + 0.06, y + 0.38, z + nz * 0.16 + 0.06, { collide: false });
  b.box(m.glassWarm, x + nx * 0.16 - 0.08, y, z + nz * 0.16 - 0.08, x + nx * 0.16 + 0.08, y + 0.26, z + nz * 0.16 + 0.08, { collide: false });
  b.box(m.iron, x, y + 0.3, z, x + nx * 0.16 + (nz !== 0 ? 0.02 : 0), y + 0.34, z + nz * 0.16 + (nx !== 0 ? 0.02 : 0), { collide: false });
}

/** Keg lying on its side with a brass tap. */
export function keg(b: Builder, m: Mats, x: number, y: number, z: number, alongX = true, r = 0.26, len = 0.55): void {
  const geom = new THREE.CylinderGeometry(r, r, len, 12);
  if (alongX) {
    geom.rotateZ(Math.PI / 2);
  } else {
    geom.rotateX(Math.PI / 2);
  }
  geom.translate(x, y + r, z);
  b.mesh(m.woodMid, geom);
  for (const off of [-len * 0.32, len * 0.32]) {
    const ring = new THREE.TorusGeometry(r + 0.01, 0.018, 5, 14);
    if (alongX) {
      ring.rotateY(Math.PI / 2);
      ring.translate(x + off, y + r, z);
    } else {
      ring.translate(x, y + r, z + off);
    }
    b.mesh(m.iron, ring);
  }
  b.cyl(m.brass, x + (alongX ? len / 2 + 0.05 : 0), z + (alongX ? 0 : len / 2 + 0.05), y + r - 0.15, y + r - 0.02, 0.025, { seg: 6 });
}

export function stool(b: Builder, m: Mats, x: number, z: number, h = 0.72, y0 = 0): void {
  b.cyl(m.woodDark, x, z, y0 + h - 0.05, y0 + h, 0.19, { seg: 9, collide: true });
  b.cyl(m.woodDark, x, z, y0, y0 + h - 0.05, 0.05, { seg: 6 });
}

export function tableSquare(
  b: Builder,
  m: Mats,
  x: number,
  z: number,
  w: number,
  d: number,
  h = 0.76,
  mat?: THREE.Material,
  top?: THREE.Material,
  y0 = 0,
): void {
  const wood = mat ?? m.woodMid;
  b.box(top ?? wood, x - w / 2, y0 + h - 0.05, z - d / 2, x + w / 2, y0 + h, z + d / 2);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    b.box(wood, x + sx * (w / 2 - 0.08) - 0.04, y0, z + sz * (d / 2 - 0.08) - 0.04, x + sx * (w / 2 - 0.08) + 0.04, y0 + h - 0.05, z + sz * (d / 2 - 0.08) + 0.04, { collide: false });
  }
}

/** Simple cot: low frame + thin mattress. */
export function cot(b: Builder, m: Mats, x: number, z: number, w: number, l: number, alongZ = true, y0 = 0): void {
  const hw = alongZ ? w / 2 : l / 2;
  const hl = alongZ ? l / 2 : w / 2;
  b.box(m.woodDark, x - hw, y0 + 0.28, z - hl, x + hw, y0 + 0.4, z + hl);
  b.box(m.linen, x - hw + 0.03, y0 + 0.4, z - hl + 0.03, x + hw - 0.03, y0 + 0.52, z + hl - 0.03, { collide: false });
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    b.box(m.woodDark, x + sx * (hw - 0.06) - 0.03, y0, z + sz * (hl - 0.06) - 0.03, x + sx * (hw - 0.06) + 0.03, y0 + 0.28, z + sz * (hl - 0.06) + 0.03, { collide: false });
  }
}

/** Ladder standing against a wall face, rising from y0 to y1. */
export function ladder(b: Builder, m: Mats, x: number, z: number, y0: number, y1: number, facing: Facing, w = 0.7): void {
  const [nx, nz] = normalOf(facing);
  const rungs = Math.max(3, Math.round((y1 - y0) / 0.32));
  for (let i = 0; i <= rungs; i += 1) {
    const y = y0 + ((y1 - y0) * i) / rungs;
    wallBox(b, m.woodDark, x, y - 0.025, z, w, 0.05, 0.06, facing, false, 0.1);
  }
  const sx = nz !== 0 ? 1 : 0;
  const sz = nx !== 0 ? 1 : 0;
  for (const side of [-1, 1]) {
    b.box(m.woodDark, x + nx * 0.13 + sx * side * (w / 2) - 0.035, y0, z + nz * 0.13 + sz * side * (w / 2) - 0.035, x + nx * 0.13 + sx * side * (w / 2) + 0.035, y1 + 0.2, z + nz * 0.13 + sz * side * (w / 2) + 0.035, { collide: false });
  }
}

export function crucifix(b: Builder, m: Mats, x: number, y: number, z: number, facing: Facing, s = 0.6, mat?: THREE.Material): void {
  const wood = mat ?? m.woodDark;
  wallBox(b, wood, x, y - s / 2, z, s * 0.12, s, 0.05, facing, false, 0.02);
  wallBox(b, wood, x, y + s * 0.12, z, s * 0.6, s * 0.12, 0.05, facing, false, 0.02);
}

export function spittoon(b: Builder, m: Mats, x: number, z: number): void {
  b.cyl(m.brass, x, z, 0, 0.26, 0.16, { rTop: 0.11, seg: 9 });
  b.cyl(m.brass, x, z, 0.26, 0.32, 0.17, { rTop: 0.19, seg: 9 });
}

export function vase(b: Builder, m: Mats, x: number, y: number, z: number, r = 0.16, h = 0.5, mat?: THREE.Material): void {
  b.cyl(mat ?? m.white, x, z, y, y + h * 0.7, r, { rTop: r * 0.85, seg: 9 });
  b.cyl(mat ?? m.white, x, z, y + h * 0.7, y + h, r * 0.55, { rTop: r * 0.7, seg: 9 });
}

/** Red drape hanging beside/over a window on a wall face. */
export function curtain(b: Builder, m: Mats, x: number, y0: number, z: number, w: number, h: number, facing: Facing, mat?: THREE.Material): void {
  wallBox(b, mat ?? m.curtainRed, x, y0, z, w, h, 0.16, facing, false, 0.04);
  wallBox(b, m.woodDark, x, y0 + h, z, w + 0.2, 0.06, 0.26, facing, false, 0.0);
}

/** Carved sun disc with rays, the mission's emblem, on a wall face. */
export function sunDisc(b: Builder, m: Mats, x: number, y: number, z: number, facing: Facing, r = 0.55): void {
  const [nx, nz] = normalOf(facing);
  const disc = new THREE.CylinderGeometry(r, r, 0.12, 20);
  disc.rotateX(Math.PI / 2);
  if (nx !== 0) {
    disc.rotateY(Math.PI / 2);
  }
  disc.translate(x + nx * 0.08, y, z + nz * 0.08);
  b.mesh(m.cream, disc);
  b.decal(m.sunFace, x + nx * 0.145, y, z + nz * 0.145, r * 1.9, r * 1.9, facing);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const rr = r + 0.16;
    const ux = Math.cos(a) * rr;
    const uy = Math.sin(a) * rr;
    const px = x + nx * 0.06 + (nz !== 0 ? ux : 0);
    const pz = z + nz * 0.06 + (nx !== 0 ? ux : 0);
    b.rotBox(m.cream, px, y + uy, pz, nz !== 0 ? 0.26 : 0.08, 0.12, nx !== 0 ? 0.26 : 0.08, nz !== 0 ? 0 : 0, {
      rotZ: nz !== 0 ? a : 0,
      rotX: nx !== 0 ? -a : 0,
      collide: false,
    });
  }
}
