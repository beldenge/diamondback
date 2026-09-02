/**
 * Outdoor Diamondback, block by filmed block. Layout follows the 52
 * camera poses of `_TOWN` (see layout.ts); materials are Dust-palette
 * tiling textures — no stills are pasted anywhere. Every enterable
 * shell is the size its interior SET demands (layout.ts), so the
 * porches, signs and windows here are placed on those faces.
 */
import * as THREE from "three";
import { Builder } from "./geometry";
import {
  DECOR_GAP,
  GATE,
  LOTS,
  PALISADE,
  SHAFT_HOLE,
  STREET_DOORS,
  WALL_T,
  WINDOWS,
  streetDoor,
  winGaps,
  type DoorSpec,
  type LotName,
  type Rect,
} from "./layout";
import type { Mats } from "./materials";
import * as P from "./props";
import { boardTex, posterTex, teepeeBandTex, type BoardOpts, type PosterKind } from "./textures";

export interface Gap {
  from: number;
  to: number;
  top: number;
  /** Window gaps carry a sill height; door gaps reach the floor. */
  bottom?: number;
}

export interface TownResult {
  group: THREE.Group;
  nightGroup: THREE.Group;
  builder: Builder;
}

function matOf(tex: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: tex });
}

function signMat(lines: string[], w: number, h: number, opts?: BoardOpts): THREE.MeshLambertMaterial {
  return matOf(boardTex(lines, w, h, opts));
}

const posterMats = new Map<PosterKind, THREE.MeshLambertMaterial>();

function posterMat(kind: PosterKind): THREE.MeshLambertMaterial {
  let m = posterMats.get(kind);
  if (!m) {
    m = matOf(posterTex(kind));
    posterMats.set(kind, m);
  }
  return m;
}

/** A solid rectangle of wall: run interval × height interval. */
type Slab = [u0: number, u1: number, v0: number, v1: number];

/**
 * The wall rectangle [u0,u1]×[y0,y1] minus every gap rectangle. Gaps
 * may overlap each other in the run (an upstairs window straight over
 * a street door): the run is cut at every gap edge and each slice is
 * filled around the union of the holes that cover it. The old
 * one-pass splitter walled up the saloon doorway with the sill of the
 * window above it.
 */
function wallSlabs(u0: number, u1: number, y0: number, y1: number, gaps: Gap[]): Slab[] {
  const lo = Math.min(u0, u1);
  const hi = Math.max(u0, u1);
  const cuts = new Set<number>([lo, hi]);
  const holes: { from: number; to: number; bottom: number; top: number }[] = [];
  for (const g of gaps) {
    const from = Math.max(g.from, lo);
    const to = Math.min(g.to, hi);
    const bottom = Math.max(g.bottom ?? y0, y0);
    const top = Math.min(g.top, y1);
    if (to - from <= 1e-4 || top - bottom <= 1e-4) {
      continue;
    }
    holes.push({ from, to, bottom, top });
    cuts.add(from);
    cuts.add(to);
  }
  const xs = [...cuts].sort((a, c) => a - c);
  const out: Slab[] = [];
  let prevKey = "";
  let prevStart = 0;
  let prevBands: [number, number][] = [];
  const flush = (end: number): void => {
    for (const [v0, v1] of prevBands) {
      out.push([prevStart, end, v0, v1]);
    }
  };
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const a = xs[i];
    const c = xs[i + 1];
    if (c - a <= 1e-4) {
      continue;
    }
    const mid = (a + c) / 2;
    const cover = holes
      .filter((h) => h.from <= mid && h.to >= mid)
      .map((h) => [h.bottom, h.top] as [number, number])
      .sort((p, q) => p[0] - q[0]);
    const bands: [number, number][] = [];
    let y = y0;
    for (const [hb, ht] of cover) {
      if (hb > y + 1e-4) {
        bands.push([y, hb]);
      }
      y = Math.max(y, ht);
    }
    if (y1 > y + 1e-4) {
      bands.push([y, y1]);
    }
    const key = bands.map(([p, q]) => `${p.toFixed(4)}:${q.toFixed(4)}`).join("|");
    if (key === prevKey && i > 0) {
      continue; // same bands as the slice before: extend it
    }
    if (i > 0) {
      flush(a);
    }
    prevKey = key;
    prevStart = a;
    prevBands = bands;
  }
  if (xs.length > 1) {
    flush(hi);
  }
  return out;
}

/** Wall running along X at z, or along Z at x, with door/window gaps. */
export function wallX(
  b: Builder,
  mat: THREE.Material,
  x0: number,
  x1: number,
  z: number,
  y0: number,
  y1: number,
  gaps: Gap[] = [],
  t = WALL_T,
): void {
  for (const [a, c, v0, v1] of wallSlabs(x0, x1, y0, y1, gaps)) {
    b.box(mat, a, v0, z - t / 2, c, v1, z + t / 2);
  }
}

export function wallZ(
  b: Builder,
  mat: THREE.Material,
  z0: number,
  z1: number,
  x: number,
  y0: number,
  y1: number,
  gaps: Gap[] = [],
  t = WALL_T,
): void {
  for (const [a, c, v0, v1] of wallSlabs(z0, z1, y0, y1, gaps)) {
    b.box(mat, x - t / 2, v0, a, x + t / 2, v1, c);
  }
}

export function doorGapOf(spec: DoorSpec, extra = 0.12): Gap {
  const half = spec.width / 2 + extra;
  const run = spec.side === "N" || spec.side === "S" ? spec.x : spec.z;
  return { from: run - half, to: run + half, top: spec.y + spec.height + 0.12 };
}

/**
 * Four shell walls on a rect, inset INWARD so every outer wall face
 * lies exactly on the rect edge. Street decor then sits outside the
 * wall AABB at `edge ± DECOR_GAP` (the rule layout.ts states).
 */
export function shell(
  b: Builder,
  mat: THREE.Material,
  r: Rect,
  y0: number,
  y1: number,
  gaps: { N?: Gap[]; S?: Gap[]; E?: Gap[]; W?: Gap[] } = {},
  mats: Partial<Record<"N" | "S" | "E" | "W", THREE.Material>> = {},
): void {
  const h = WALL_T / 2;
  wallX(b, mats.N ?? mat, r.minX, r.maxX, r.minZ + h, y0, y1, gaps.N ?? []);
  wallX(b, mats.S ?? mat, r.minX, r.maxX, r.maxZ - h, y0, y1, gaps.S ?? []);
  wallZ(b, mats.W ?? mat, r.minZ, r.maxZ, r.minX + h, y0, y1, gaps.W ?? []);
  wallZ(b, mats.E ?? mat, r.minZ, r.maxZ, r.maxX - h, y0, y1, gaps.E ?? []);
}

function flatRoof(b: Builder, m: Mats, r: Rect, y: number, mat?: THREE.Material): void {
  b.box(mat ?? m.roofDark, r.minX - 0.1, y, r.minZ - 0.1, r.maxX + 0.1, y + 0.18, r.maxZ + 0.1);
}

/** Simple non-enterable building: solid box + trims. */
function solidBuilding(
  b: Builder,
  m: Mats,
  r: Rect,
  h: number,
  mat: THREE.Material,
  roof: "flat" | "gableX" | "gableZ" = "flat",
  roofMat?: THREE.Material,
  ridge = 0,
): void {
  b.box(mat, r.minX, 0, r.minZ, r.maxX, h, r.maxZ);
  if (roof === "flat") {
    flatRoof(b, m, r, h, roofMat);
  } else {
    P.gableRoof(b, m, r.minX, r.minZ, r.maxX, r.maxZ, h, h + (ridge || 2), roof === "gableX" ? "x" : "z", roofMat, mat);
  }
}

/**
 * Diagonal braces behind a street-face false front, so the parapet
 * reads as a built thing from the side and back instead of a board
 * standing on the roof.
 */
function falseFrontBraces(b: Builder, m: Mats, r: Rect, side: "E" | "W" | "N" | "S", yRoof: number, yTop: number): void {
  const h = yTop - yRoof;
  if (h < 0.6) {
    return;
  }
  const reach = Math.min(1.6, h * 1.1);
  const len = Math.hypot(reach, h - 0.2);
  const ang = Math.atan2(h - 0.2, reach);
  const along = side === "E" || side === "W" ? [r.minZ + 0.6, (r.minZ + r.maxZ) / 2, r.maxZ - 0.6] : [r.minX + 0.6, (r.minX + r.maxX) / 2, r.maxX - 0.6];
  for (const u of along) {
    if (side === "E") {
      b.rotBox(m.woodDark, r.maxX - WALL_T - reach / 2, yRoof + h / 2, u, len, 0.1, 0.1, 0, { rotZ: ang, collide: false });
    } else if (side === "W") {
      b.rotBox(m.woodDark, r.minX + WALL_T + reach / 2, yRoof + h / 2, u, len, 0.1, 0.1, 0, { rotZ: -ang, collide: false });
    } else if (side === "N") {
      b.rotBox(m.woodDark, u, yRoof + h / 2, r.minZ + WALL_T + reach / 2, 0.1, 0.1, len, 0, { rotX: ang, collide: false });
    } else {
      b.rotBox(m.woodDark, u, yRoof + h / 2, r.maxZ - WALL_T - reach / 2, 0.1, 0.1, len, 0, { rotX: -ang, collide: false });
    }
  }
}

function windowRow(
  b: Builder,
  mCold: THREE.Material,
  face: "N" | "S" | "E" | "W",
  fixed: number,
  positions: number[],
  y: number,
  w = 0.9,
  h = 1.3,
): void {
  for (const p of positions) {
    if (face === "E" || face === "W") {
      b.decal(mCold, fixed, y, p, w, h, face);
    } else {
      b.decal(mCold, p, y, fixed, w, h, face);
    }
  }
}

/**
 * Real windows for a lot: clear glass mid-wall, a wood frame with a
 * muntin grid, an arched head where the film shows one, and iron bars
 * on the jail and bank. The matching wall holes come from `winGaps`
 * fed into the shell + interior linings.
 */
export function buildWindows(b: Builder, m: Mats, key: LotName, wallMat: THREE.Material): void {
  const r = LOTS[key];
  for (const w of WINDOWS[key] ?? []) {
    const hw = w.w / 2;
    const [cols, rows] = w.panes ?? [2, 2];
    const glassTop = w.arched ? w.top - 0.02 : w.top;
    if (w.side === "E" || w.side === "W") {
      const face = w.side === "E" ? r.maxX : r.minX;
      const inner = w.side === "E" ? face - WALL_T : face + WALL_T;
      const gx = (face + inner) / 2;
      const f0 = Math.min(face, inner) - 0.05;
      const f1 = Math.max(face, inner) + 0.05;
      if (w.arched) {
        // fill the rectangular wall gap with an arch-headed panel
        b.archWall(wallMat, "z", w.at - hw - 0.08, w.at + hw + 0.08, gx, w.bottom, w.top, w.at, w.w, w.top - 0.02, WALL_T, {
          collide: false,
        });
      }
      b.box(m.glassClear, gx - 0.02, w.bottom, w.at - hw, gx + 0.02, glassTop, w.at + hw, { collide: true });
      b.box(m.woodDark, f0, w.bottom - 0.1, w.at - hw - 0.07, f1, w.bottom, w.at + hw + 0.07, { collide: false });
      if (!w.arched) {
        b.box(m.woodDark, f0, w.top, w.at - hw - 0.07, f1, w.top + 0.1, w.at + hw + 0.07, { collide: false });
      }
      b.box(m.woodDark, f0, w.bottom, w.at - hw - 0.07, f1, w.top - (w.arched ? hw : 0), w.at - hw, { collide: false });
      b.box(m.woodDark, f0, w.bottom, w.at + hw, f1, w.top - (w.arched ? hw : 0), w.at + hw + 0.07, { collide: false });
      for (let c = 1; c < cols; c += 1) {
        const bz = w.at - hw + (c / cols) * w.w;
        b.box(m.woodDark, gx - 0.035, w.bottom, bz - 0.02, gx + 0.035, glassTop, bz + 0.02, { collide: false });
      }
      for (let rr = 1; rr < rows; rr += 1) {
        const by = w.bottom + (rr / rows) * (glassTop - w.bottom);
        b.box(m.woodDark, gx - 0.035, by - 0.02, w.at - hw, gx + 0.035, by + 0.02, w.at + hw, { collide: false });
      }
      if (w.bars) {
        const bx = w.side === "E" ? face + 0.07 : face - 0.13;
        for (let i = 0; i <= 4; i += 1) {
          const bz = w.at - hw + (i / 4) * w.w;
          b.box(m.iron, bx, w.bottom - 0.05, bz - 0.025, bx + 0.06, w.top + 0.05, bz + 0.025, { collide: false });
        }
        b.box(m.iron, bx, (w.bottom + w.top) / 2 - 0.02, w.at - hw - 0.04, bx + 0.06, (w.bottom + w.top) / 2 + 0.02, w.at + hw + 0.04, { collide: false });
      }
    } else {
      const face = w.side === "S" ? r.maxZ : r.minZ;
      const inner = w.side === "S" ? face - WALL_T : face + WALL_T;
      const gz = (face + inner) / 2;
      const f0 = Math.min(face, inner) - 0.05;
      const f1 = Math.max(face, inner) + 0.05;
      if (w.arched) {
        b.archWall(wallMat, "x", w.at - hw - 0.08, w.at + hw + 0.08, gz, w.bottom, w.top, w.at, w.w, w.top - 0.02, WALL_T, {
          collide: false,
        });
      }
      b.box(m.glassClear, w.at - hw, w.bottom, gz - 0.02, w.at + hw, glassTop, gz + 0.02, { collide: true });
      b.box(m.woodDark, w.at - hw - 0.07, w.bottom - 0.1, f0, w.at + hw + 0.07, w.bottom, f1, { collide: false });
      if (!w.arched) {
        b.box(m.woodDark, w.at - hw - 0.07, w.top, f0, w.at + hw + 0.07, w.top + 0.1, f1, { collide: false });
      }
      b.box(m.woodDark, w.at - hw - 0.07, w.bottom, f0, w.at - hw, w.top - (w.arched ? hw : 0), f1, { collide: false });
      b.box(m.woodDark, w.at + hw, w.bottom, f0, w.at + hw + 0.07, w.top - (w.arched ? hw : 0), f1, { collide: false });
      for (let c = 1; c < cols; c += 1) {
        const bx = w.at - hw + (c / cols) * w.w;
        b.box(m.woodDark, bx - 0.02, w.bottom, gz - 0.035, bx + 0.02, glassTop, gz + 0.035, { collide: false });
      }
      for (let rr = 1; rr < rows; rr += 1) {
        const by = w.bottom + (rr / rows) * (glassTop - w.bottom);
        b.box(m.woodDark, w.at - hw, by - 0.02, gz - 0.035, w.at + hw, by + 0.02, gz + 0.035, { collide: false });
      }
    }
  }
}

/** Cornice cap crowning a parapet along one face. */
function capFace(b: Builder, mat: THREE.Material, r: Rect, side: "E" | "W" | "N" | "S", y: number, m?: Mats, yRoof?: number): void {
  if (m && yRoof !== undefined) {
    falseFrontBraces(b, m, r, side, yRoof, y);
  }
  if (side === "E") {
    b.box(mat, r.maxX - WALL_T - 0.12, y, r.minZ - 0.15, r.maxX + 0.34, y + 0.16, r.maxZ + 0.15, { collide: false });
  } else if (side === "W") {
    b.box(mat, r.minX - 0.34, y, r.minZ - 0.15, r.minX + WALL_T + 0.12, y + 0.16, r.maxZ + 0.15, { collide: false });
  } else if (side === "N") {
    b.box(mat, r.minX - 0.15, y, r.minZ - 0.34, r.maxX + 0.15, y + 0.16, r.minZ + WALL_T + 0.12, { collide: false });
  } else {
    b.box(mat, r.minX - 0.15, y, r.maxZ - WALL_T - 0.12, r.maxX + 0.15, y + 0.16, r.maxZ + 0.34, { collide: false });
  }
}

/* ------------------------------------------------------------------ */

export function buildTown(m: Mats, nightGroup: THREE.Group): TownResult {
  const group = new THREE.Group();
  const b = new Builder();
  const nb = new Builder(); // night-only glow decals

  const winCold = m.winCold;
  const winWarm = m.winWarm;

  /* ---------- ground + desert (with the shaft mouth cut out) ---------- */
  b.flat(m.dirt, -280, -280, 380, SHAFT_HOLE.minZ, 0, { texWorld: 7 });
  b.flat(m.dirt, -280, SHAFT_HOLE.maxZ, 380, 400, 0, { texWorld: 7 });
  b.flat(m.dirt, -280, SHAFT_HOLE.minZ, SHAFT_HOLE.minX, SHAFT_HOLE.maxZ, 0, { texWorld: 7 });
  b.flat(m.dirt, SHAFT_HOLE.maxX, SHAFT_HOLE.minZ, 380, SHAFT_HOLE.maxZ, 0, { texWorld: 7 });
  // distant mesa ring: rounded hills + a few flat-top buttes, pushed
  // out to ~250 m so they sit in the haze instead of at the fences
  const dome = (x: number, z: number, r: number, h: number): void => {
    const geom = new THREE.SphereGeometry(r, 14, 9);
    geom.scale(1, h / r, 1);
    geom.translate(x, 0, z);
    b.mesh(m.mesa, geom);
  };
  const butte = (x: number, z: number, r: number, h: number): void => {
    b.cyl(m.mesa, x, z, 0, h * 0.75, r, { rTop: r * 0.62, seg: 14 });
    b.cyl(m.mesa, x, z, h * 0.75, h * 0.95, r * 0.6, { rTop: r * 0.42, seg: 12 });
    dome(x, z, r * 0.42, h);
  };
  for (const [hx, hz, hr, hh, kind] of [
    [-42, 172, 34, 10, 0], [8, 182, 30, 8, 0], [52, 188, 38, 13, 1], [98, 180, 30, 9, 0],
    [138, 172, 26, 11, 1], [182, 118, 30, 9, 0], [188, 60, 34, 12, 1], [186, 4, 30, 8, 0],
    [156, -48, 36, 11, 0], [96, -58, 30, 9, 1], [30, -62, 34, 8, 0], [-48, -44, 30, 10, 1],
    [-62, 22, 28, 8, 0], [-58, 92, 32, 9, 0],
  ] as const) {
    const mx = 52 + (hx - 52) * 1.9;
    const mz = 60 + (hz - 60) * 1.9;
    const mr = hr * 1.8;
    const mh = hh * 1.7;
    if (kind === 1) {
      butte(mx, mz, mr, mh);
    } else {
      dome(mx, mz, mr, mh);
      dome(mx + mr * 0.7, mz + 4, mr * 0.5, mh * 0.6);
      dome(mx - mr * 0.65, mz - 3, mr * 0.45, mh * 0.5);
    }
    b.solid({ minX: mx - mr, minY: 0, minZ: mz - mr, maxX: mx + mr, maxY: mh, maxZ: mz + mr });
  }

  /* ---------- south gate ---------- */
  {
    // A-frame posts + crossbeam + hanging DIAMONDBACK board (letters south only)
    for (const px of [GATE.westPostX, GATE.eastPostX]) {
      b.rotBox(m.woodSaloon, px, GATE.beamY / 2, GATE.z, 0.28, GATE.beamY, 0.28, 0, { collide: true });
      b.rotBox(m.woodSaloon, px - 0.5, GATE.beamY / 2 - 0.2, GATE.z, 0.2, GATE.beamY - 0.4, 0.2, 0, {
        rotZ: 0.12,
        collide: false,
      });
      b.rotBox(m.woodSaloon, px + 0.5, GATE.beamY / 2 - 0.2, GATE.z, 0.2, GATE.beamY - 0.4, 0.2, 0, {
        rotZ: -0.12,
        collide: false,
      });
    }
    b.box(m.woodSaloon, GATE.westPostX - 0.8, GATE.beamY - 0.34, GATE.z - 0.2, GATE.eastPostX + 0.8, GATE.beamY, GATE.z + 0.2, {
      collide: false,
    });
    // chains
    b.box(m.iron, 50.1, GATE.signTop, GATE.z - 0.03, 50.16, GATE.beamY - 0.3, GATE.z + 0.03, { collide: false });
    b.box(m.iron, 53.84, GATE.signTop, GATE.z - 0.03, 53.9, GATE.beamY - 0.3, GATE.z + 0.03, { collide: false });
    const signW = 4.6;
    b.box(m.woodSaloon, 52 - signW / 2, GATE.signBottom, GATE.z - 0.08, 52 + signW / 2, GATE.signTop, GATE.z + 0.08, {
      collide: false,
    });
    b.decal(
      signMat(["DIAMONDBACK"], signW, GATE.signTop - GATE.signBottom, { bg: "#3b2b1c", fg: "#e0cf9c", border: "#20150c" }),
      52,
      (GATE.signTop + GATE.signBottom) / 2,
      GATE.z + 0.08 + DECOR_GAP,
      signW,
      GATE.signTop - GATE.signBottom,
      "S",
    );

    // WARNING board west of the street, just inside the gate
    b.box(m.woodDark, 46.6, 0, 106.4, 46.78, 2.3, 106.58);
    b.box(m.woodDark, 49.0, 0, 106.4, 49.18, 2.3, 106.58);
    b.box(m.woodSaloon, 46.3, 2.1, 106.35, 49.5, 3.75, 106.62, { collide: false });
    b.decal(
      signMat(
        ["WARNING!", "Gunmen, Thieves, and", "Bone-Idle Loungers", "get out of Diamondback", "and stay out —", "otherwise HANG!"],
        3.2,
        1.65,
        { bg: "#33261a", fg: "#d8cba6" },
      ),
      47.9,
      2.92,
      106.66,
      3.2,
      1.65,
      "S",
    );
  }

  /* ---------- palisade + gate yard (windmill, water tower) ---------- */
  {
    // tall black palisade: uneven vertical boards, west face on x
    const pal = PALISADE;
    for (let z = pal.zNorth; z < pal.zSouth; z += 0.34) {
      const hh = pal.height - 0.35 + (((z * 7.3) % 1) - 0.5) * 0.5;
      b.box(m.palisade, pal.x - 0.12, 0, z, pal.x + 0.12, hh, Math.min(pal.zSouth, z + 0.3), { collide: false });
    }
    b.solid({ minX: pal.x - 0.14, minY: 0, minZ: pal.zNorth, maxX: pal.x + 0.14, maxY: pal.height, maxZ: pal.zSouth });
    for (let x = pal.x; x < pal.eastEndX; x += 0.34) {
      const hh = pal.height - 0.35 + (((x * 5.1) % 1) - 0.5) * 0.5;
      b.box(m.palisade, x, 0, pal.zSouth - 0.28, Math.min(pal.eastEndX, x + 0.3), hh, pal.zSouth - 0.04, { collide: false });
    }
    b.solid({ minX: pal.x, minY: 0, minZ: pal.zSouth - 0.3, maxX: pal.eastEndX, maxY: pal.height, maxZ: pal.zSouth });
    // rails on the yard side
    for (const ry of [1.0, 3.2]) {
      b.box(m.woodDark, pal.x + 0.12, ry, pal.zNorth, pal.x + 0.2, ry + 0.12, pal.zSouth, { collide: false });
    }
    // "FIREARMS STRICKLY PROHIBITED" (film spelling): a standing board on
    // two posts inside the gate, the twin of the WARNING board opposite
    b.box(m.woodDark, 54.3, 0, 107.9, 54.48, 2.3, 108.08);
    b.box(m.woodDark, 56.1, 0, 107.9, 56.28, 2.3, 108.08);
    b.box(m.woodSaloon, 54.1, 1.7, 107.85, 56.5, 3.2, 108.12, { collide: false });
    b.decal(
      signMat(["FIREARMS", "STRICKLY", "PROHIBITED"], 2.4, 1.5, { bg: "#d8cba6", fg: "#33261a", border: "#6b5b3c" }),
      55.3,
      2.45,
      108.16,
      2.4,
      1.5,
      "S",
    );
    P.oxSkull(b, m, pal.x - 0.55, 110.9);
    // weathered gray fence continues north to the Curiosities corner
    P.picketFence(b, m, pal.x, 96, pal.x, pal.zNorth, 2.4, m.fenceGray, { slat: 0.22, gap: 0.05, pointed: false });
    // yard behind: corral rails, windmill, water tower
    P.railFence(b, m, pal.eastEndX, 96, pal.eastEndX, pal.zSouth, 3, 1.3, m.woodGray);
    P.railFence(b, m, pal.x, 96, pal.eastEndX, 96, 3, 1.3, m.woodGray);
    P.windmill(b, m, 60, 102.5, 9.5);
    P.waterTower(b, m, 64.2, 107.5, "DIAMONDBACK CITY");
  }

  /* ---------- west of the gate: rails, the privy, cacti (M7 W / N7 W / O6 N) ---------- */
  {
    P.railFence(b, m, 26, 111.8, 47.5, 111.8, 3, 1.3);
    P.railFence(b, m, 26, 104, 26, 111.8, 3, 1.3);
    P.railFence(b, m, 34, 100.5, 47.5, 100.5, 3, 1.25);
    // the small privy shed by the fence; the ground stays open to the jail
    b.box(m.barnDark, 45, 0, 107.5, 46.6, 2.6, 109.1);
    b.cone(m.roofDark, 45.8, 108.3, 2.6, 3.1, 1.2, 4);
    P.saguaro(b, m, 43, 113.5, 3);
    P.saguaro(b, m, 24.5, 108, 2.6);
    P.saguaro(b, m, 38, 104.5, 2.8);
  }

  /* =========== MAIN STREET, WEST SIDE =========== */

  /* ---------- Hard Drive Saloon: door at H7, porch H7..J7 ---------- */
  {
    const r = LOTS.saloon;
    const dSaloon = streetDoor("saloon");
    const top = 7.6;
    shell(b, m.woodSaloon, r, 0, top, {
      E: [doorGapOf(dSaloon), ...winGaps("saloon", "E")],
      N: winGaps("saloon", "N"),
      W: [{ from: 65.6, to: 67.0, top: 2.6 }, ...winGaps("saloon", "W")],
    });
    buildWindows(b, m, "saloon", m.woodSaloon);
    // parapet on the street face
    b.box(m.woodSaloon, r.maxX - WALL_T, top, r.minZ, r.maxX + 0.05, 8.6, r.maxZ);
    flatRoof(b, m, r, top);
    capFace(b, m.woodDark, r, "E", 8.6, m, top);
    // gold letters over the porch roof: HARD DRIVE on the H7 half, SALOON across I7/J7
    const fx0 = r.maxX + 0.05 + DECOR_GAP;
    b.decal(signMat(["HARD DRIVE"], 4.6, 1.0, { bg: "#241a12", fg: "#e0b34c" }), fx0, 7.0, 59.2, 4.6, 1.0, "E");
    b.decal(signMat(["SALOON"], 9.4, 1.7, { bg: "#241a12", fg: "#e0b34c" }), fx0, 7.0, 67.8, 9.4, 1.7, "E");
    // porch along the whole front: boardwalk + posts + roof + balcony
    const porchX = r.maxX + 2.3;
    P.boardwalkSlab(b, m, r.maxX, 56.2, porchX, r.maxZ + 0.2);
    const postZ = [56.9, 61.5, 65.2, 68.8, 72.3, 74.9];
    P.porchPosts(b, m, 0.32, 3.4, postZ.map((pz) => [porchX - 0.12, pz] as [number, number]));
    for (const pz of postZ) {
      // knee braces
      b.rotBox(m.woodDark, porchX - 0.38, 3.1, pz, 0.6, 0.08, 0.08, 0, { rotZ: -0.7, collide: false });
    }
    b.box(m.woodSaloon, r.maxX, 3.4, 56.2, porchX + 0.15, 3.7, r.maxZ + 0.2, { collide: false });
    // balcony rail above the porch roof
    P.balustrade(b, m, r.maxX + 0.2, r.maxZ + 0.2, porchX, r.maxZ + 0.2, 3.7);
    P.balustrade(b, m, porchX, 56.4, porchX, r.maxZ + 0.2, 3.7);
    P.balustrade(b, m, r.maxX + 0.2, 56.4, porchX, 56.4, 3.7);
    // door dressing: boards + lanterns each side of the H7 door
    const wx = r.maxX + DECOR_GAP;
    b.decal(signMat(["Wines &", "Liquors"], 0.7, 0.9, { bg: "#2c2014", fg: "#d8cba6", border: "#6b5b3c" }), wx, 1.95, 57.9, 0.7, 0.9, "E");
    b.decal(signMat(["Beers &", "Whiskeys"], 0.7, 0.9, { bg: "#2c2014", fg: "#d8cba6", border: "#6b5b3c" }), wx, 1.95, 60.1, 0.7, 0.9, "E");
    P.wallLantern(b, m, r.maxX, 2.55, 57.9, "E");
    P.wallLantern(b, m, r.maxX, 2.55, 60.1, "E");
    // porch furniture: chairs, a spittoon, a hitch rail out front
    P.chair(b, m, r.maxX + 1.4, 63.4, Math.PI / 2);
    P.chair(b, m, r.maxX + 1.4, 68.0, Math.PI / 2);
    P.spittoon(b, m, r.maxX + 1.0, 66.0);
    P.hitchRail(b, m, porchX + 0.6, 64.4, porchX + 0.6, 69.2);
    P.trough(b, m, r.maxX + 1.2, 73.6, 1.6, false);
    // north side on Neely: a covered porch with posters (G5 S / G6 S)
    const nz = r.minZ - DECOR_GAP;
    P.boardwalkSlab(b, m, r.minX + 0.2, r.minZ - 1.7, r.maxX - 0.2, r.minZ, 0.2);
    P.porchPosts(b, m, 0.2, 3.2, [
      [35.9, r.minZ - 1.55],
      [39.3, r.minZ - 1.55],
      [42.7, r.minZ - 1.55],
      [45.3, r.minZ - 1.55],
    ]);
    b.box(m.woodSaloon, r.minX, 3.2, r.minZ - 1.7, r.maxX, 3.45, r.minZ, { collide: false });
    b.decal(posterMat("circus"), 43.1, 2.0, nz, 0.85, 1.15, "N");
    b.decal(posterMat("wanted"), 37.5, 2.1, nz, 0.85, 1.15, "N");
    b.decal(posterMat("wanted2"), 39.1, 1.95, nz, 0.85, 1.15, "N");
    P.bench(b, m, 42.2, r.minZ - 0.8, 1.7, "N");
    P.spittoon(b, m, 37.1, r.minZ - 0.9);
    b.decal(signMat(["HARD DRIVE SALOON"], 5.6, 1.0, { bg: "#241a12", fg: "#e0b34c" }), 40.2, 6.4, nz, 5.6, 1.0, "N");
    // south face: red board + lamps near Main (K5 E / K7 W views)
    b.decal(signMat(["HARD DRIVE SALOON"], 4.4, 0.8, { bg: "#5e1713", fg: "#e0cf9c" }), 41.2, 3.2, r.maxZ + DECOR_GAP, 4.4, 0.8, "S");
    b.decal(posterMat("wanted"), 37.9, 1.9, r.maxZ + DECOR_GAP, 0.85, 1.15, "S");
    P.wallLantern(b, m, 44.1, 2.4, r.maxZ, "S");
  }

  /* ---------- saloon backlot (west lane wall, posters, back door) ---------- */
  {
    const r = LOTS.saloonBackshed;
    const back = streetDoor("saloonBack");
    shell(b, m.woodSaloon, r, 0, 3.6, {
      W: [doorGapOf(back)],
      E: [{ from: 65.6, to: 67.0, top: 2.6 }],
    });
    flatRoof(b, m, r, 3.6);
    const px = r.minX - DECOR_GAP;
    // "EAT, DRINK AND GO TO BED, OR GIT OUT!" stencil by the back door
    b.decal(
      signMat(["HARD DRIVE SALOON", "EAT, DRINK AND GO TO BED,", "OR GIT OUT!"], 4.2, 1.5, {
        bg: "#2c2014",
        fg: "#e6dcba",
      }),
      px,
      2.55,
      73.6,
      4.2,
      1.5,
      "W",
    );
    b.decal(signMat(["GRANT"], 1.1, 0.45, { bg: "#3c2c1c", fg: "#d8cba6" }), px, 3.1, 70, 1.1, 0.45, "W");
    // poster wall along the lane (H4 E / I4 E)
    b.decal(posterMat("wanted"), px, 2.1, 61.2, 0.85, 1.15, "W");
    b.decal(posterMat("circus"), px, 1.9, 62.9, 0.85, 1.15, "W");
    b.decal(posterMat("bishop"), px, 2.2, 64.8, 0.85, 1.15, "W");
    b.decal(posterMat("wanted2"), px, 2.15, 68.1, 0.85, 1.15, "W");
    // chalk menu board (I4 S view)
    b.decal(
      signMat(["SALOON", "steak  .25", "beans  .10", "whiskey .15"], 1.3, 1.6, { bg: "#1c1712", fg: "#cfc4a6", align: "left" }),
      px,
      1.9,
      77.6,
      1.3,
      1.6,
      "W",
    );
    P.barrel(b, m, 32.9, 63.6);
    P.barrel(b, m, 33.8, 64.5);
    P.crate(b, m, 33.35, 76.6, 0.8, 1.1, 0.2, m.woodWatson);
    // south face on Day street: Beers & Whiskeys posters
    b.decal(signMat(["Beers & Whiskeys"], 2.4, 0.7, { bg: "#2c2014", fg: "#d8cba6", border: "#6b5b3c" }), 34.6, 2.6, r.maxZ + DECOR_GAP, 2.4, 0.7, "S");
    b.decal(posterMat("wanted"), 33.2, 1.6, r.maxZ + DECOR_GAP, 0.85, 1.15, "S");
  }

  /* ---------- Bank (F7 W): brick, no porch, barred windows ---------- */
  {
    const r = LOTS.bank;
    const d = streetDoor("bank");
    shell(b, m.brickBank, r, 0, 5.2, { E: [doorGapOf(d), ...winGaps("bank", "E")] });
    buildWindows(b, m, "bank", m.brickBank);
    flatRoof(b, m, r, 5.2);
    capFace(b, m.brickMayor, r, "E", 5.2);
    const fx = r.maxX + DECOR_GAP;
    b.decal(
      signMat(["DIAMONDBACK", "BANK & TRUST", "est. 1875"], 6.4, 1.8, { bg: "#5b3d2c", fg: "#efeadb" }),
      fx,
      4.15,
      43.25,
      6.4,
      1.8,
      "E",
    );
    b.decal(signMat(["POST NO BILLS"], 1.5, 0.4, { bg: "#7e1f1c", fg: "#efeadb" }), fx, 0.6, 40.8, 1.5, 0.4, "E");
    b.box(m.marble, r.maxX, 0, 42.4, r.maxX + 0.6, 0.14, 44.2); // stone step
    // painted signs on north + south brick faces, dark board on the lane
    b.decal(signMat(["DIAMONDBACK BANK & TRUST"], 6.5, 1.1, { bg: "#6b4732", fg: "#efeadb" }), 43, 4.3, r.minZ - DECOR_GAP, 6.5, 1.1, "N");
    b.decal(signMat(["DIAMONDBACK BANK & TRUST"], 6.5, 1.1, { bg: "#6b4732", fg: "#efeadb" }), 43, 4.3, r.maxZ + DECOR_GAP, 6.5, 1.1, "S");
    b.decal(signMat(["POST NO BILLS"], 2.6, 0.7, { bg: "#7e1f1c", fg: "#efeadb" }), 37, 2.3, r.maxZ + DECOR_GAP, 2.6, 0.7, "S");
    b.decal(signMat(["DIAMONDBACK", "BANK & TRUST"], 4.2, 1.6, { bg: "#2c2014", fg: "#cfc4a6", border: "#6b5b3c" }), r.minX - DECOR_GAP, 3.4, 43.25, 4.2, 1.6, "W");
    b.decal(winCold, 40.5, 3.9, r.maxZ + DECOR_GAP, 1, 1.3, "S");
    P.barrel(b, m, 37.4, 48.7);
    P.barrel(b, m, 41.2, 48.6);
  }

  /* ---------- Dr. Rodham (E7 W) + Grant annex ---------- */
  {
    const r = LOTS.doctor;
    const d = streetDoor("doctor");
    shell(b, m.woodDoctor, r, 0, 3.6, {
      E: [doorGapOf(d), ...winGaps("doctor", "E")],
    });
    buildWindows(b, m, "doctor", m.woodDoctor);
    b.box(m.woodDoctor, r.maxX - WALL_T, 3.6, r.minZ, r.maxX + 0.04, 4.9, r.maxZ);
    flatRoof(b, m, r, 3.6);
    capFace(b, m.woodDark, r, "E", 4.9, m, 3.6);
    const fx = r.maxX + 0.04 + DECOR_GAP;
    b.decal(
      signMat(["DR. H. RODHAM", "Medical and Tonsorial Parlour"], 5.6, 1.2, { bg: "#4f382a", fg: "#e6dcba", border: "#33261a" }),
      fx,
      4.2,
      35.25,
      5.6,
      1.2,
      "E",
    );
    P.boardwalkSlab(b, m, r.maxX, 32.2, r.maxX + 1.5, 38.3);
    P.barrel(b, m, r.maxX + 0.9, 37.4);
    // north hoarding on Mission street: painted ads (D6 S view)
    const nz = r.minZ - DECOR_GAP;
    b.decal(signMat(["DR. H. RODHAM", "Medical and Tonsorial Parlour"], 3.6, 1.2, { bg: "#4f382a", fg: "#e6dcba" }), 45.6, 2.6, nz, 3.6, 1.2, "N");
    b.decal(posterMat("circus"), 41.9, 1.9, nz, 0.85, 1.15, "N");
    b.decal(posterMat("tonic"), 40.2, 2.2, nz, 0.85, 1.15, "N");

    // Grant annex on the west lane: dark planks, brown door, tonic ads
    const a = LOTS.doctorAnnex;
    shell(b, m.woodMid, a, 0, 3.4, {});
    flatRoof(b, m, a, 3.4);
    const ax = a.minX - DECOR_GAP;
    b.decal(signMat(["GRANT"], 1.4, 0.5, { bg: "#3c2c1c", fg: "#d8cba6" }), ax, 3.0, 35.2, 1.4, 0.5, "W");
    P.fakeDoor(b, m, a.minX, 0, 35.2, 1.2, 2.4, "W", { mat: m.woodMid });
    b.decal(
      signMat(["DEENA KAOUSIA'S", "VEGETABLE COMPOUND"], 2.2, 1.1, { bg: "#d8cba6", fg: "#33261a", border: "#6b5b3c" }),
      ax,
      2.1,
      33.4,
      2.2,
      1.1,
      "W",
    );
    b.decal(posterMat("tonic"), ax, 1.9, 37.4, 0.85, 1.15, "W");
    b.decal(posterMat("circus"), 35, 2.1, a.minZ - DECOR_GAP, 0.85, 1.15, "N");
    P.barrel(b, m, a.minX + 0.7, 37.7);
    P.crate(b, m, a.minX + 0.6, 33.2, 0.8, 0.7, 0.2);
  }

  /* ---------- Jail (L7 W): adobe, SHERIFF, door south-of-centre ---------- */
  {
    const r = LOTS.jail;
    const d = streetDoor("jail");
    shell(b, m.adobeJail, r, 0, 3.7, {
      E: [doorGapOf(d), ...winGaps("jail", "E")],
      W: winGaps("jail", "W"),
    });
    buildWindows(b, m, "jail", m.adobeJail);
    b.box(m.adobeJail, r.minX - 0.05, 3.7, r.minZ - 0.05, r.maxX + 0.05, 3.85, r.maxZ + 0.05, { collide: false });
    flatRoof(b, m, r, 3.5, m.adobeJail);
    // vigas (beam ends) along the front, and the small high window
    for (const vz of [88.9, 90.3, 91.7, 93.1, 94.5, 95.5]) {
      b.box(m.woodDark, r.maxX, 3.15, vz - 0.09, r.maxX + 0.3, 3.35, vz + 0.09, { collide: false });
    }
    b.decal(m.winCold, r.maxX + DECOR_GAP, 3.0, 89.2, 0.5, 0.45, "E");
    const fx = r.maxX + DECOR_GAP;
    b.decal(signMat(["SHERIFF"], 2.2, 0.75, { bg: "#6e3423", fg: "#efeadb", border: "#40190f" }), fx, 2.75, 91.6, 2.2, 0.75, "E");
    b.decal(posterMat("wanted"), fx, 1.75, 92.4, 0.7, 0.95, "E");
    P.bench(b, m, r.maxX + 0.9, 91.0, 1.7, "E");
    P.spittoon(b, m, r.maxX + 0.7, 89.6);
    P.wallLantern(b, m, r.maxX, 2.35, 94.8, "E");
    b.box(m.marble, r.maxX, 0, 92.7, r.maxX + 0.7, 0.12, 94.5); // stone step
    // west wall graffiti + well-yard dressing (L5 E view)
    P.picketFence(b, m, 38.4, 88.4, 38.4, 91.4, 1.15, m.woodMid, { slat: 0.14, gap: 0.12 });
    P.barrel(b, m, 37.9, 95.6);
    // north face on Day: posters + viga ends (K6 S view)
    for (const vx of [39.4, 41, 42.6, 44.2, 45.8, 47.2]) {
      b.box(m.woodDark, vx - 0.09, 3.15, r.minZ - 0.3, vx + 0.09, 3.35, r.minZ, { collide: false });
    }
    b.decal(posterMat("wanted"), 41, 2.0, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.decal(posterMat("wanted2"), 42.6, 1.9, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    P.barrel(b, m, 46.2, r.minZ - 0.6);
  }

  /* =========== MAIN STREET, EAST SIDE =========== */

  /* ---------- Stagecoach (H7 E): shallow office, porch, hitch rail ---------- */
  {
    const r = LOTS.stage;
    const d = streetDoor("stage");
    shell(b, m.woodStage, r, 0, 3.6, { W: [doorGapOf(d), ...winGaps("stage", "W")] });
    buildWindows(b, m, "stage", m.woodStage);
    b.box(m.woodStage, r.minX - 0.04, 3.6, r.minZ, r.minX + WALL_T, 5.4, r.maxZ);
    flatRoof(b, m, r, 3.6);
    capFace(b, m.woodDark, r, "W", 5.4, m, 3.6);
    const fx = r.minX - 0.04 - DECOR_GAP;
    b.decal(
      signMat(["The Great Southwestern", "STAGECOACH Co."], 7.4, 1.6, { bg: "#8d7350", fg: "#2c2014" }),
      fx,
      4.5,
      60.5,
      7.4,
      1.6,
      "W",
    );
    b.decal(signMat(["STAGECOACH"], 2.6, 0.6, { bg: "#a3541d", fg: "#2c2014", border: "#6b3b12" }), fx, 3.05, 60.5, 2.6, 0.6, "W");
    b.decal(signMat(["POST OFFICE"], 1.0, 0.32, { bg: "#4f382a", fg: "#efeadb" }), fx, 2.9, 59.2, 1.0, 0.32, "W");
    P.boardwalkSlab(b, m, r.minX - 1.6, 56.2, r.minX, r.maxZ - 0.2);
    P.porchPosts(b, m, 0.32, 3.1, [
      [r.minX - 1.45, 56.8],
      [r.minX - 1.45, 60.5],
      [r.minX - 1.45, 64.2],
    ]);
    P.porchRoof(b, m, r.minX - 1.7, 56.2, r.minX, r.maxZ - 0.2, 3.1, 3.55, "W");
    P.hitchRail(b, m, r.minX - 2.5, 57.6, r.minX - 2.5, 63.6);
    b.box(m.iron, r.minX - 1.3, 0.32, 63.4, r.minX - 0.4, 0.9, 64.5); // planter
    P.wagonWheel(b, m, r.minX - 0.6, 0.3, 56.9, 0.75, 0.18);
    P.wallLantern(b, m, r.minX, 2.4, 61.6, "W");
    // north wall ad on Neely (G7 E view)
    b.decal(signMat(["The Great Southwestern STAGECOACH Co."], 5.4, 0.9, { bg: "#8d7350", fg: "#2c2014" }), 59, 3.0, r.minZ - DECOR_GAP, 5.4, 0.9, "N");
    // south face over Watson's roof line: coach posters (G8 S view sees the warehouse)
    const w = LOTS.stageWarehouse;
    solidBuilding(b, m, w, 3.8, m.barnDark, "flat");
    b.decal(
      signMat(["ASBESTOS, DETROIT AND SANTA FE", "— COACHES —", "For Through Tickets Inquire Within"], 5.4, 1.7, {
        bg: "#2c2014",
        fg: "#d8cba6",
      }),
      66.5,
      2.4,
      w.maxZ + DECOR_GAP,
      5.4,
      1.7,
      "S",
    );
    b.decal(posterMat("wanted2"), 63.2, 2.2, w.maxZ + DECOR_GAP, 0.85, 1.15, "S");
    b.decal(
      signMat(["STAGECOACH", "For Through Tickets", "Inquire Within"], 3.0, 1.5, { bg: "#2c2014", fg: "#d8cba6" }),
      w.maxX + DECOR_GAP,
      2.3,
      58.6,
      3.0,
      1.5,
      "E",
    );
    P.fakeDoor(b, m, w.maxX, 0, 61.0, 1.3, 2.4, "E", { mat: m.woodBlack });
    b.decal(posterMat("news"), w.maxX + DECOR_GAP, 2.1, 57.2, 0.85, 1.15, "E");
    P.barrel(b, m, w.maxX + 0.55, 60);
    P.wagonWheel(b, m, 63.5, 0, w.maxZ + 0.45, 0.7, 0.2);
    P.barrel(b, m, 70.2, w.maxZ + 0.7);
  }

  /* ---------- white boarding house (Lee west side) ---------- */
  {
    const wh = LOTS.whiteHouse;
    solidBuilding(b, m, wh, 6.6, m.woodWhite, "gableZ", m.roofDark, 1.7);
    const fx = wh.maxX + DECOR_GAP;
    P.fakeDoor(b, m, wh.maxX, 0, 66.2, 1.2, 2.4, "E");
    b.decal(posterMat("tonic"), fx, 1.9, 63.8, 0.85, 1.15, "E");
    b.decal(
      signMat(["Grain Recipes", "for the modern kitchen"], 1.1, 1.2, { bg: "#ddd2b0", fg: "#241d16", border: "#8a7a52" }),
      fx,
      1.95,
      68.5,
      1.1,
      1.2,
      "E",
    );
    b.decal(signMat(["FEED"], 1.1, 0.42, { bg: "#2c2014", fg: "#dfb44e" }), fx, 3.1, 63.4, 1.1, 0.42, "E");
    windowRow(b, winCold, "E", fx, [64.3, 67.9], 4.6, 0.9, 1.35);
    nb.decal(winWarm, fx + 0.004, 4.6, 64.3, 0.9, 1.35, "E");
    b.flat(m.boardwalk, wh.maxX, 65.3, wh.maxX + 1.0, 67.1, 0.06);
    P.barrel(b, m, wh.maxX + 0.5, 62.9);
    P.barrel(b, m, wh.maxX + 0.55, 69.4);
  }

  /* ---------- Watson's Apothecary (I7 E) ---------- */
  {
    const r = LOTS.watson;
    const d = streetDoor("watson");
    shell(b, m.woodWatson, r, 0, 3.6, { W: [doorGapOf(d), ...winGaps("watson", "W")] });
    buildWindows(b, m, "watson", m.woodWatson);
    b.box(m.woodWatson, r.minX - 0.04, 3.6, r.minZ, r.minX + WALL_T, 5.6, r.maxZ);
    flatRoof(b, m, r, 3.6);
    capFace(b, m.woodDark, r, "W", 5.6, m, 3.6);
    const fx = r.minX - 0.04 - DECOR_GAP;
    b.decal(
      signMat(["Watson's", "APOTHECARY"], 6.8, 1.8, { bg: "#b5b2a0", fg: "#c96f1e" }),
      fx,
      4.55,
      68.75,
      6.8,
      1.8,
      "W",
    );
    P.wallLantern(b, m, r.minX, 2.4, 70.0, "W");
    P.boardwalkSlab(b, m, r.minX - 1.5, r.minZ + 0.2, r.minX, r.maxZ - 0.2);
    // sandwich board + planter on the street (J7 N view)
    b.rotBox(m.white, 54.6, 0.55, 70.6, 0.7, 1.0, 0.08, 0.3, { rotX: 0.18, collide: true });
    b.rotBox(m.white, 54.78, 0.55, 70.6, 0.7, 1.0, 0.08, 0.3, { rotX: -0.18, collide: false });
    b.box(m.iron, r.minX - 1.2, 0.32, 65.4, r.minX - 0.3, 0.85, 66.2);
    b.decal(
      signMat(["TONICS", "POWDERS", "CURES"], 0.9, 1.1, { bg: "#1c1712", fg: "#cfc4a6" }),
      fx,
      1.5,
      71.9,
      0.9,
      1.1,
      "W",
    );
  }

  /* ---------- Bolivar's Dry Goods (J7 E) + annex ---------- */
  {
    const r = LOTS.bolivar;
    const d = streetDoor("bolivar");
    shell(b, m.woodMid, r, 0, 3.5, { W: [doorGapOf(d), ...winGaps("bolivar", "W")] }, { S: m.brickCream });
    buildWindows(b, m, "bolivar", m.woodMid);
    // tan brick upper with red letters
    b.box(m.brickCream, r.minX - 0.04, 3.5, r.minZ, r.maxX, 5.5, r.maxZ);
    flatRoof(b, m, r, 3.5, m.roofDark);
    b.box(m.woodDark, r.minX - 0.34, 5.5, r.minZ - 0.15, r.minX + 0.42, 5.66, r.maxZ + 0.15, { collide: false });
    const fx = r.minX - 0.04 - DECOR_GAP;
    b.decal(
      signMat(["BOLIVAR'S", "DRY GOODS"], 6.6, 1.9, { bg: "#d9cfb2", fg: "#b03024" }),
      fx,
      4.5,
      76.25,
      6.6,
      1.9,
      "W",
    );
    b.decal(signMat(["OPEN"], 0.5, 0.3, { bg: "#efeadb", fg: "#33261a" }), fx, 2.1, 77.3, 0.5, 0.3, "W");
    // rustic log porch
    P.boardwalkSlab(b, m, r.minX - 1.6, r.minZ + 0.2, r.minX, r.maxZ - 0.2);
    for (const pz of [73.2, 76.3, 79.4]) {
      b.cyl(m.woodDark, r.minX - 1.45, pz, 0.32, 3.2, 0.11, { seg: 7, collide: true });
    }
    P.porchRoof(b, m, r.minX - 1.7, r.minZ + 0.2, r.minX, r.maxZ - 0.2, 3.2, 3.5, "W");
    // hanging round signs + pans
    b.decal(signMat(["DRY", "GOODS"], 0.8, 0.8, { bg: "#1c1712", fg: "#d8cba6", border: "#6b5b3c" }), fx, 2.6, 73.4, 0.8, 0.8, "W");
    b.decal(signMat(["CHOICE", "GROCERIES"], 0.8, 0.8, { bg: "#1c1712", fg: "#d8cba6", border: "#6b5b3c" }), fx, 2.6, 79.1, 0.8, 0.8, "W");
    b.box(m.iron, r.minX - 1.1, 2.6, 74.8, r.minX - 0.7, 3.0, 74.9, { collide: false });
    b.box(m.iron, r.minX - 1.1, 2.5, 78.2, r.minX - 0.75, 2.95, 78.3, { collide: false });
    // porch clutter
    P.barrel(b, m, r.minX - 0.9, 73.1);
    b.cyl(m.white, r.minX - 0.5, 79.3, 0.32, 0.95, 0.2, { seg: 8 });
    b.cyl(m.white, r.minX - 0.95, 79.1, 0.32, 0.85, 0.18, { seg: 8 });
    P.chair(b, m, r.minX - 0.8, 75.0, -Math.PI / 2);
    // south wall painted brick sign over the K7 alley
    b.decal(signMat(["BOLIVAR'S DRY GOODS"], 5.4, 0.9, { bg: "#d9cfb2", fg: "#b03024" }), 60.5, 4.6, r.maxZ + DECOR_GAP, 5.4, 0.9, "S");
    b.decal(signMat(["Choice Groceries"], 2.2, 0.6, { bg: "#1c1712", fg: "#d8cba6" }), 58.4, 2.6, r.maxZ + DECOR_GAP, 2.2, 0.6, "S");
    b.decal(signMat(["Choice Groceries"], 2.2, 0.6, { bg: "#1c1712", fg: "#d8cba6" }), 63.4, 2.6, r.maxZ + DECOR_GAP, 2.2, 0.6, "S");

    // hardware annex + lumber yard (K8 N views)
    const a = LOTS.bolivarAnnex;
    solidBuilding(b, m, a, 3.4, m.woodMid, "flat");
    b.decal(signMat(["Lumber Yard", "Out Back  →"], 2.4, 0.9, { bg: "#e6dcba", fg: "#33261a", border: "#6b5b3c" }), 69.4, 2.9, a.maxZ + DECOR_GAP, 2.4, 0.9, "S");
    b.decal(
      signMat(["Pots & Pans", "Tin Ware", "Hard Ware", "Guns & Pistols"], 1.7, 1.6, { bg: "#2c2014", fg: "#d8cba6" }),
      67,
      1.9,
      a.maxZ + DECOR_GAP,
      1.7,
      1.6,
      "S",
    );
    b.decal(posterMat("wanted"), 70.6, 2, a.maxZ + DECOR_GAP, 0.85, 1.15, "S");
  }

  /* ---------- K7 east alley dressing ---------- */
  {
    P.barrel(b, m, 57.4, 83.2);
    P.saguaro(b, m, 78, 84, 3.2);
    P.saguaro(b, m, 88, 81.5, 2.6);
    // birdhouse/semaphore post far east + adobe ruin
    b.box(m.woodDark, 92, 0, 84.3, 92.16, 3.1, 84.46);
    b.box(m.woodBlack, 91.7, 3.1, 84.1, 92.5, 3.7, 84.7, { collide: false });
    b.box(m.adobeMission, 96, 0, 78, 101, 1.6, 82);
    // rail fence + gate closing the alley east
    P.railFence(b, m, 92, 80.4, 92, 88, 2, 1.2, m.woodGray);
  }

  /* ---------- Curiosities (L7 E): a narrow blackwood shop, red posts, pagoda ---------- */
  {
    const r = LOTS.curio;
    const d = streetDoor("curio");
    shell(b, m.woodBlack, r, 0, 3.7, { W: [doorGapOf(d), ...winGaps("curio", "W")] });
    buildWindows(b, m, "curio", m.woodBlack);
    flatRoof(b, m, r, 3.7, m.roofDark);
    // tall black parapet so the big red band clears the porch roof
    b.box(m.woodBlack, r.minX, 3.7, r.minZ, r.minX + WALL_T, 6.5, r.maxZ);
    falseFrontBraces(b, m, r, "W", 3.88, 6.5);
    const fx = r.minX - DECOR_GAP;
    b.decal(signMat(["CURIOSITIES"], 7, 1.15, { bg: "#a3261d", fg: "#e0cf9c", border: "#5e1713" }), fx, 5.75, 92, 7, 1.15, "W");
    b.decal(signMat(["+ CURIOSITIES +"], 5.2, 0.7, { bg: "#241d16", fg: "#c33a2b" }), fx, 3.25, 92, 5.2, 0.7, "W");
    // pagoda eaves: upturned dark slabs along the parapet top
    b.box(m.woodBlack, r.minX - 0.7, 6.5, r.minZ - 0.5, r.minX + 0.6, 6.75, r.maxZ + 0.5, { collide: false });
    for (const [cx, cz] of [
      [r.minX - 0.75, r.minZ - 0.55],
      [r.minX - 0.75, r.maxZ + 0.55],
    ] as const) {
      b.rotBox(m.woodBlack, cx, 6.92, cz, 1.2, 0.14, 1.2, 0.6, { rotZ: 0.35, collide: false });
    }
    // red porch posts with black bases
    P.boardwalkSlab(b, m, r.minX - 1.5, 88.2, r.minX, 95.8);
    for (const pz of [88.7, 91.0, 93.0, 95.3]) {
      b.box(m.woodBlack, r.minX - 1.42, 0.32, pz - 0.14, r.minX - 1.14, 1.1, pz + 0.14, { collide: true });
      b.box(m.curioRed, r.minX - 1.38, 1.1, pz - 0.1, r.minX - 1.18, 4.5, pz + 0.1, { collide: false });
    }
    P.porchRoof(b, m, r.minX - 1.6, 88.2, r.minX, 95.8, 4.1, 4.5, "W", m.roofDark);
    // red window frames + stool
    for (const wz of [89.6, 94.4]) {
      b.box(m.curioRed, r.minX - 0.06, 1.1, wz - 0.64, r.minX - 0.02, 2.7, wz - 0.55, { collide: false });
      b.box(m.curioRed, r.minX - 0.06, 1.1, wz + 0.55, r.minX - 0.02, 2.7, wz + 0.64, { collide: false });
    }
    P.stool(b, m, r.minX - 0.9, 90.4, 0.55);
    P.barrel(b, m, 54.6, 87.4);
    // ox skull on a pole + the range's lane east of the shop
    b.box(m.woodDark, r.maxX + 0.8, 0, 88.6, r.maxX + 0.94, 5.0, 88.74);
    P.oxSkull(b, m, r.maxX + 0.87, 88.67, 5.05);
    // north wall: MAIN corner board + poster (K7 E / K8 W views)
    b.decal(signMat(["MAIN"], 1.2, 0.4, { bg: "#2c2014", fg: "#d8cba6" }), 57.4, 2.9, r.minZ - DECOR_GAP, 1.2, 0.4, "N");
    // back veranda: red posts + pergola along the yard (K8 S view)
    for (const px of [57.2, 59.6, 62.0]) {
      b.box(m.curioRed, px - 0.1, 0, r.minZ - 2.2, px + 0.1, 2.6, r.minZ - 2.0, { collide: true });
    }
    b.box(m.woodBlack, 56.8, 2.6, r.minZ - 2.3, r.maxX + 0.2, 2.8, r.minZ - 1.9, { collide: false });
    P.porchRoof(b, m, 56.8, r.minZ - 2.2, r.maxX + 0.2, r.minZ, 2.75, 3.1, "N", m.roofDark);
    b.decal(posterMat("wanted"), 58.6, 1.9, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.decal(posterMat("circus"), 61.2, 2.05, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.cyl(m.iron, 60.5, r.minZ - 1.2, 0, 0.18, 0.2, { seg: 8 }); // dog bowl
  }

  /* ---------- the tall dark barn east of Curiosities + the board fence (K8 S / K9 S) ---------- */
  {
    const r = LOTS.rangeBarn;
    solidBuilding(b, m, r, 5.4, m.barnDark, "gableX", m.roofDark, 1.8);
    b.decal(posterMat("wanted"), 64.3, 2.1, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.decal(posterMat("circus"), 65.9, 1.95, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.decal(posterMat("wanted2"), 67.4, 2.1, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.decal(posterMat("wanted"), r.maxX + DECOR_GAP, 2.5, 90.2, 0.85, 1.15, "E");
    P.barrel(b, m, 64.2, r.minZ - 0.7);
    P.barrel(b, m, 66.8, r.minZ - 0.6);
    // the tall uneven board fence closing the range's west end (K9 S)
    for (let x = r.maxX; x < 74; x += 0.34) {
      const hh = 2.3 + (((x * 5.1) % 1) - 0.5) * 0.45;
      b.box(m.fenceGray, x, 0, 88.0, Math.min(74, x + 0.28), hh, 88.25, { collide: false });
    }
    b.solid({ minX: r.maxX, minY: 0, minZ: 87.95, maxX: 74, maxY: 2.4, maxZ: 88.3 });
    b.box(m.woodDark, r.maxX, 0.6, 88.25, 74, 0.72, 88.32, { collide: false });
    b.box(m.woodDark, r.maxX, 1.7, 88.25, 74, 1.82, 88.32, { collide: false });
  }

  /* ---------- Cactus Bed Hotel (E7+F7 east) ---------- */
  {
    const r = LOTS.hotel;
    const d = streetDoor("hotel");
    const top = 8.2;
    shell(b, m.oliveHotel, r, 0, top, {
      W: [doorGapOf(d), ...winGaps("hotel", "W")],
      S: winGaps("hotel", "S"),
    });
    buildWindows(b, m, "hotel", m.oliveHotel);
    b.box(m.oliveHotel, r.minX - 0.04, top, r.minZ, r.maxX, 9.2, r.maxZ);
    flatRoof(b, m, r, top);
    b.box(m.woodDark, r.minX - 0.34, 9.2, r.minZ - 0.15, r.minX + 0.42, 9.36, r.maxZ + 0.15, { collide: false });
    b.box(m.woodDark, r.minX - 0.15, 9.2, r.maxZ - 0.42, r.maxX + 0.15, 9.36, r.maxZ + 0.34, { collide: false });
    const fx = r.minX - 0.04 - DECOR_GAP;
    // painted sign across the E7+F7 face with the sunburst emblem
    b.decal(
      signMat(["CACTUS BED", "HOTEL"], 8.6, 2.2, { bg: "#6e7155", fg: "#e3d9b8" }),
      fx,
      7.0,
      41,
      8.6,
      2.2,
      "W",
    );
    b.decal(m.sunFace, fx, 7.3, 34.6, 1.6, 1.6, "W");
    // arched double door surround
    b.box(m.woodDark, r.minX - 0.1, 0, d.z - 1.12, r.minX - 0.02, 3.1, d.z - 0.98, { collide: false });
    b.box(m.woodDark, r.minX - 0.1, 0, d.z + 0.98, r.minX - 0.02, 3.1, d.z + 1.12, { collide: false });
    b.box(m.woodDark, r.minX - 0.1, 2.95, d.z - 1.12, r.minX - 0.02, 3.2, d.z + 1.12, { collide: false });
    const sz = r.maxZ + DECOR_GAP;
    b.decal(signMat(["CACTUS BED HOTEL"], 7.2, 1.4, { bg: "#6e7155", fg: "#e3d9b8", border: "#4d502f" }), 64, 7.2, sz, 7.2, 1.4, "S");
    b.decal(signMat(["CACTUS BED HOTEL"], 6.6, 1.1, { bg: "#6e7155", fg: "#e3d9b8" }), 64, 6.7, r.minZ - DECOR_GAP, 6.6, 1.1, "N");
    // street furniture: boardwalk, lanterns, bench, potted cactus, rail
    P.boardwalkSlab(b, m, r.minX - 1.5, 32.2, r.minX, 47.8);
    P.wallLantern(b, m, r.minX, 2.45, 33.0, "W");
    P.wallLantern(b, m, r.minX, 2.45, 36.2, "W");
    P.bench(b, m, r.minX - 0.85, 42.4, 1.7, "W");
    P.potPlant(b, m, r.minX - 0.8, 32.9);
    P.barrel(b, m, r.minX - 0.8, 44.0);
    P.crate(b, m, r.minX - 0.7, 47.0, 0.7, 0.6, 0.2);
    P.hitchRail(b, m, r.minX - 2.5, 37.6, r.minX - 2.5, 41.6);
    // south porch along Neely (G8 N / G9 N views)
    P.boardwalkSlab(b, m, 57, r.maxZ, 71.5, r.maxZ + 1.5);
    P.porchPosts(b, m, 0.32, 3.0, [
      [58, r.maxZ + 1.35],
      [61.5, r.maxZ + 1.35],
      [65, r.maxZ + 1.35],
      [68.5, r.maxZ + 1.35],
      [71.2, r.maxZ + 1.35],
    ]);
    P.porchRoof(b, m, 57, r.maxZ, 71.5, r.maxZ + 1.6, 3.0, 3.4, "S");
    P.bench(b, m, 63, r.maxZ + 0.8, 1.8, "N");
    P.spittoon(b, m, 66.4, r.maxZ + 0.7);
    // back porch on Lee with HOTEL letters + price board (F10 W view)
    P.boardwalkSlab(b, m, r.maxX, 42, r.maxX + 1.4, 47);
    P.porchPosts(b, m, 0.32, 2.9, [
      [r.maxX + 1.25, 42.6],
      [r.maxX + 1.25, 46.4],
    ]);
    P.porchRoof(b, m, r.maxX, 42, r.maxX + 1.5, 47, 2.9, 3.3, "E");
    b.decal(signMat(["HOTEL"], 1.9, 0.6, { bg: "#241d16", fg: "#dfb44e" }), r.maxX + DECOR_GAP, 3.6, 44.5, 1.9, 0.6, "E");
    b.decal(
      signMat(["CACTUS BED HOTEL", "Rooms $1 a Night", "Lodging & Board", "Baths 25¢"], 3, 2, { bg: "#3b3a28", fg: "#e3d9b8", border: "#241d16" }),
      r.maxX + DECOR_GAP,
      1.9,
      38.5,
      3,
      2,
      "E",
    );
    P.barrel(b, m, r.maxX + 0.6, 40.4);
  }

  /* ---------- santa marta cantina (north side of Mission street) ---------- */
  {
    const r = LOTS.santaMarta;
    solidBuilding(b, m, r, 4.4, m.brickCream, "flat");
    b.box(m.tileRed, r.minX - 0.2, 4.4, r.maxZ - 0.7, r.maxX + 0.2, 4.75, r.maxZ + 0.3, { collide: false });
    const fz = r.maxZ + DECOR_GAP;
    P.fakeDoor(b, m, 71, 0, r.maxZ, 1.7, 2.6, "S", { mat: m.woodBlack });
    b.decal(signMat(["santa marta"], 1.8, 0.52, { bg: "#3b5233", fg: "#dfb44e" }), 71, 3.2, fz, 1.8, 0.52, "S");
    b.decal(posterMat("wanted"), 68.2, 2, fz, 0.85, 1.15, "S");
    P.wallLantern(b, m, 69.7, 2.3, r.maxZ, "S");
    P.potPlant(b, m, 74.4, r.maxZ + 0.85);
    // "TO santa marta" road sign at the Main corner points east (D7 E view)
    b.box(m.woodDark, 55.2, 0, 27.6, 55.36, 3, 27.76);
    b.decal(signMat(["TO", "santa marta →"], 1.3, 0.8, { bg: "#3b5233", fg: "#dfb44e" }), 55.28, 2.5, 27.9, 1.3, 0.8, "S");
  }

  /* ---------- Mission (terminates the north view) ---------- */
  {
    const r = LOTS.mission;
    const d = streetDoor("mission");
    const wingTop = 4.8;
    const frontTop = 7.2;
    // south wall: portico stretch (west), tall door block (centre), sign stretch (east)
    wallX(b, m.adobeMission, r.minX, 46, r.maxZ, 0, wingTop, [], 0.5);
    wallX(b, m.adobeMission, 46, 58.5, r.maxZ, 0, frontTop, [doorGapOf(d, 0.04)], 0.5);
    wallX(b, m.adobeMission, 58.5, r.maxX, r.maxZ, 0, wingTop, [], 0.5);
    // west + east + north outer walls (the padre's window west, the
    // schoolhouse's two arched windows north)
    wallZ(b, m.adobeMission, r.minZ, r.maxZ, r.minX, 0, wingTop, winGaps("padre", "W"), 0.5);
    wallZ(b, m.adobeMission, r.minZ, r.maxZ, r.maxX, 0, wingTop, [], 0.5);
    wallX(b, m.adobeMission, r.minX, r.maxX, r.minZ, 0, wingTop, winGaps("school", "N"), 0.5);
    buildWindows(b, m, "school", m.adobeMission);
    buildWindows(b, m, "padre", m.adobeMission);
    // espadaña gable over the doors, centred on Main Street (x 52):
    // stepped adobe + bell niche + cross
    b.box(m.adobeMission, 47.25, frontTop, r.maxZ - 0.6, 56.75, 8.6, r.maxZ + 0.1, { collide: false });
    b.box(m.adobeMission, 48.75, 8.6, r.maxZ - 0.6, 55.25, 9.8, r.maxZ + 0.1, { collide: false });
    b.archWall(m.adobeMission, "x", 50.35, 53.65, r.maxZ - 0.25, 9.8, 11.2, 52, 0.9, 10.9, 0.7, { collide: false });
    b.box(m.woodDark, 51.85, 11.2, r.maxZ - 0.35, 52.15, 12.0, r.maxZ - 0.15, { collide: false });
    b.box(m.woodDark, 51.45, 11.6, r.maxZ - 0.35, 52.55, 11.8, r.maxZ - 0.15, { collide: false });
    P.bell(b, m, 52, 10.15, r.maxZ - 0.25, 0.28);
    // red tile copings
    b.box(m.tileRed, r.minX - 0.2, wingTop, r.maxZ - 0.75, 46.2, wingTop + 0.35, r.maxZ + 0.35, { collide: false });
    b.box(m.tileRed, 58.3, wingTop, r.maxZ - 0.75, r.maxX + 0.2, wingTop + 0.35, r.maxZ + 0.35, { collide: false });
    b.box(m.tileRed, 46, frontTop, r.maxZ - 0.75, 58.7, frontTop + 0.35, r.maxZ + 0.35, { collide: false });
    b.box(m.tileRed, r.minX - 0.35, wingTop, r.minZ - 0.2, r.minX + 0.35, wingTop + 0.35, r.maxZ + 0.2, { collide: false });
    b.box(m.tileRed, r.maxX - 0.35, wingTop, r.minZ - 0.2, r.maxX + 0.35, wingTop + 0.35, r.maxZ + 0.2, { collide: false });
    // pots along the parapet
    for (const px of [47, 49.5, 55, 57.3, 36, 40, 62]) {
      b.cyl(m.brickMayor, px, r.maxZ - 0.2, px > 46 && px < 58.5 ? frontTop + 0.35 : wingTop + 0.35, (px > 46 && px < 58.5 ? frontTop : wingTop) + 0.8, 0.26, { rTop: 0.3, seg: 8 });
    }
    // carved sun discs flanking the doors + one further west (D6 N view)
    for (const sx of [47.6, 56.4, 42.5]) {
      P.sunDisc(b, m, sx, 2.4, r.maxZ, "S", 0.6);
    }
    // studded door surround
    b.box(m.woodDark, d.x - 1.95, 0, r.maxZ - 0.1, d.x - 1.75, 3.7, r.maxZ + 0.12, { collide: false });
    b.box(m.woodDark, d.x + 1.75, 0, r.maxZ - 0.1, d.x + 1.95, 3.7, r.maxZ + 0.12, { collide: false });
    b.box(m.woodDark, d.x - 1.95, 3.55, r.maxZ - 0.1, d.x + 1.95, 3.8, r.maxZ + 0.12, { collide: false });
    // MISSION board + lamp post east of the doors (E7 N view)
    b.box(m.woodDark, 60.2, 0, r.maxZ + 0.9, 60.36, 2.7, r.maxZ + 1.06);
    b.decal(signMat(["MISSION"], 1.2, 0.45, { bg: "#4f382a", fg: "#e6dcba" }), 60.28, 2.3, r.maxZ + 1.1, 1.2, 0.45, "S");
    b.decal(posterMat("wanted"), 61.8, 2.0, r.maxZ + DECOR_GAP, 0.7, 0.95, "S");
    P.lampPost(b, m, 62.5, r.maxZ + 1.3, 3.3);
    // pots + bowls at the base (D6 N)
    for (const [px, pz, pr] of [
      [43.6, 24.7, 0.22], [44.6, 24.8, 0.16], [59.4, 24.7, 0.2], [45.8, 24.6, 0.12],
    ] as const) {
      b.cyl(m.brickMayor, px, pz, 0, pr * 1.3, pr, { rTop: pr * 1.15, seg: 8 });
    }
    // hanging lamp arm (D7 W view)
    b.box(m.woodDark, 45.2, 3.0, r.maxZ + 0.5, 45.35, 3.15, r.maxZ + 1.6, { collide: false });
    b.box(m.glassWarm, 45.18, 2.6, r.maxZ + 1.3, 45.38, 2.9, r.maxZ + 1.5, { collide: false });
    // bell gantry at the SW corner (D5 N view): beam + three bells
    b.box(m.woodDark, 33.7, 0, 25.0, 34.0, 3.6, 25.3);
    b.box(m.woodDark, 39.6, 0, 25.0, 39.9, 3.6, 25.3);
    b.box(m.woodDark, 33.6, 3.3, 24.6, 39.9, 3.6, 24.9, { collide: false });
    P.bell(b, m, 35.1, 2.55, 24.75, 0.34);
    P.bell(b, m, 36.8, 2.45, 24.75, 0.42);
    P.bell(b, m, 38.5, 2.55, 24.75, 0.34);
    // iron cage cart by the west wing (D4 N / E4 N views)
    {
      const cx = 29.5;
      const cz = 27;
      b.box(m.woodDark, cx - 1.5, 0.62, cz - 0.95, cx + 1.5, 0.8, cz + 0.95, { collide: true });
      const axle = new THREE.CylinderGeometry(0.05, 0.05, 2.3, 8);
      axle.rotateX(Math.PI / 2);
      axle.translate(cx, 0.6, cz);
      b.mesh(m.iron, axle);
      for (let i = 0; i <= 6; i += 1) {
        const bx = cx - 1.35 + (i / 6) * 2.7;
        b.box(m.iron, bx - 0.03, 0.8, cz - 0.9, bx + 0.03, 2.2, cz - 0.84, { collide: false });
        b.box(m.iron, bx - 0.03, 0.8, cz + 0.84, bx + 0.03, 2.2, cz + 0.9, { collide: false });
      }
      b.box(m.iron, cx - 1.4, 2.2, cz - 0.95, cx + 1.4, 2.35, cz + 0.95, { collide: false });
      P.spokedWheel(b, m, cx, cz - 1.08, 0.6);
      P.spokedWheel(b, m, cx, cz + 1.08, 0.6);
      // shafts fixed under the bed, tips resting on the ground ahead
      {
        const run = 2.0;
        const slope = Math.atan2(0.06 - 0.55, run);
        const len = Math.hypot(run, 0.49) + 0.1;
        for (const side of [-0.6, 0.6]) {
          b.rotBox(m.woodDark, cx + 1.3 + run / 2, 0.305, cz + side, len, 0.09, 0.09, 0, { rotZ: slope, collide: false });
        }
        b.box(m.woodDark, cx + 2.86, 0.12, cz - 0.64, cx + 2.94, 0.2, cz + 0.64, { collide: false });
      }
    }
    // bell tower with its dome, rising over the padre's room at the
    // north-west (the dome the cemetery and Neely stills see)
    {
      const tx = 41.5;
      const tz = -4.5;
      b.box(m.adobeMission, tx - 1.9, wingTop, tz - 1.9, tx + 1.9, 10.0, tz + 1.9, { collide: false });
      b.box(m.tileRed, tx - 2.2, 10.0, tz - 2.2, tx + 2.2, 10.4, tz + 2.2, { collide: false });
      b.box(m.adobeMission, tx - 1.5, 10.4, tz - 1.5, tx + 1.5, 12.6, tz + 1.5, { collide: false });
      for (const f of ["N", "S", "E", "W"] as const) {
        const off = 1.51;
        const dx = f === "E" ? off : f === "W" ? -off : 0;
        const dz = f === "S" ? off : f === "N" ? -off : 0;
        b.decal(signMat([""], 0.8, 1.5, { bg: "#241d16", fg: "#241d16" }), tx + dx, 11.5, tz + dz, 0.8, 1.5, f);
      }
      P.bell(b, m, tx, 11.1, tz, 0.3);
      b.cyl(m.adobeMission, tx, tz, 12.6, 13.0, 1.7, { seg: 12 });
      b.sphere(m.cream, tx, 13.3, tz, 1.55, 12);
      b.box(m.woodDark, tx - 0.08, 14.7, tz - 0.08, tx + 0.08, 15.6, tz + 0.08, { collide: false });
      b.box(m.woodDark, tx - 0.4, 15.15, tz - 0.08, tx + 0.4, 15.3, tz + 0.08, { collide: false });
    }
    // pumpkins + baskets along the base
    for (const [px, pz] of [
      [47, 24.9],
      [55.8, 24.8],
      [35.5, 25.2],
    ] as const) {
      b.sphere(m.brass, px, 0.25, pz, 0.26, 8);
    }
  }

  /* =========== NEELY STREET WEST =========== */

  /* ---------- Sidewinder (G1 S): dark storefront, barber pole, coffins ---------- */
  {
    const r = LOTS.sidewinder;
    const d = streetDoor("sidewinder");
    shell(b, m.woodBlack, r, 0, 3.5, { N: [doorGapOf(d), ...winGaps("sidewinder", "N")] });
    buildWindows(b, m, "sidewinder", m.woodBlack);
    b.box(m.woodBlack, r.minX, 3.5, r.minZ - 0.04, r.maxX, 4.7, r.minZ + WALL_T);
    flatRoof(b, m, r, 3.5);
    capFace(b, m.woodDark, r, "N", 4.7, m, 3.5);
    const fz = r.minZ - 0.04 - DECOR_GAP;
    b.decal(
      signMat(["HIRAM SIDEWINDER", "Undertaking & Barbering"], 6.4, 1.2, { bg: "#4a2a1c", fg: "#ded6b6", border: "#2a160c" }),
      4,
      4.1,
      fz,
      6.4,
      1.2,
      "N",
    );
    P.boardwalkSlab(b, m, r.minX, r.minZ - 1.3, r.maxX, r.minZ);
    P.barberPole(b, m, 1.2, r.minZ - 1.0);
    // coffins leaning outside + one on the ground (east alley)
    P.coffin(b, m, r.maxX + 0.6, 57.6, 0.15, true);
    P.coffin(b, m, r.maxX + 0.9, 59.8, 0.3, true);
    P.coffin(b, m, r.maxX + 1.6, 61.6, 0.5);
    P.barrel(b, m, r.maxX + 0.5, 63.4);
    // black shed behind (G2 S / G3 W)
    solidBuilding(b, m, { minX: 1, minZ: 63, maxX: 7, maxZ: 68 }, 2.8, m.woodBlack, "gableX", m.roofDark, 1.2);
  }

  /* ---------- The Rattler (H4 W): a small green storefront ---------- */
  {
    const r = LOTS.rattler;
    const d = streetDoor("rattler");
    shell(b, m.rattlerGreen, r, 0, 3.5, { E: [doorGapOf(d), ...winGaps("rattler", "E")] });
    buildWindows(b, m, "rattler", m.rattlerGreen);
    b.box(m.rattlerGreen, r.maxX - WALL_T, 3.5, r.minZ, r.maxX + 0.04, 5.0, r.maxZ);
    flatRoof(b, m, r, 3.5);
    capFace(b, m.woodDark, r, "E", 5.0, m, 3.5);
    const fx = r.maxX + 0.04 + DECOR_GAP;
    b.decal(
      signMat(["The Rattler", "Chott Flippo, Editor"], 4.4, 1.05, { bg: "#ded6b6", fg: "#241d16", border: "#8a7a52" }),
      fx,
      4.45,
      59.25,
      4.4,
      1.05,
      "E",
    );
    b.decal(signMat(["WE PRINT", "ANYTHING"], 3.0, 0.85, { bg: "#49513a", fg: "#efeadb" }), fx, 3.5, 59.25, 3.0, 0.85, "E");
    b.decal(
      signMat(["THE NEWS TODAY", "The Rattler  5¢"], 1.1, 0.9, { bg: "#ddd2b0", fg: "#241d16", border: "#8a7a52" }),
      fx,
      1.9,
      61.6,
      1.1,
      0.9,
      "E",
    );
    // flat canopy porch
    P.boardwalkSlab(b, m, r.maxX, r.minZ + 0.2, r.maxX + 1.5, r.maxZ - 0.2, 0.2);
    P.porchPosts(b, m, 0.2, 3.0, [
      [r.maxX + 1.35, 56.6],
      [r.maxX + 1.35, 62.0],
    ]);
    b.box(m.rattlerGreen, r.maxX, 3.0, r.minZ, r.maxX + 1.6, 3.2, r.maxZ, { collide: false });
    P.spittoon(b, m, r.maxX + 0.5, 57.2);
    P.tableSquare(b, m, r.maxX + 2.6, 61.6, 1.3, 0.6, 0.8);
    // rail fence along the lane edge south of the storefront (H4 W)
    P.railFence(b, m, 24.5, 63.2, 24.5, 70.5, 3, 1.15);
    // north wall on Neely: olive-green poster wall (G3 S / G4 S)
    const nz = r.minZ - DECOR_GAP;
    b.decal(posterMat("wanted"), 18.4, 2.1, nz, 0.85, 1.15, "N");
    b.decal(posterMat("circus"), 19.9, 1.9, nz, 0.85, 1.15, "N");
    b.decal(posterMat("wanted2"), 23.1, 1.95, nz, 0.85, 1.15, "N");
    P.crate(b, m, 20.8, 55.1, 0.9, 0.7, 0.15, m.woodStage);
    b.decal(signMat(["AMMUNITION"], 0.8, 0.28, { bg: "#a98e66", fg: "#33261a" }), 20.8, 0.45, 54.63, 0.8, 0.28, "N");
    P.barrel(b, m, 22.4, 55.2);
    P.barrel(b, m, 18.2, 55.3);
  }

  /* ---------- behind the Rattler: rock-city shed, outhouse, cart, hide ---------- */
  {
    const r = LOTS.rockCityShed;
    solidBuilding(b, m, r, 2.7, m.woodGray, "gableX", m.roofDark, 1.2);
    b.decal(signMat(["SEE ROCK CITY"], 2.6, 0.8, { bg: "#8a8478", fg: "#efeadb", border: "#5a554a" }), 17, 1.8, r.maxZ + DECOR_GAP, 2.6, 0.8, "S");
    b.decal(signMat(["SEE", "ROCK", "CITY"], 1.4, 1.5, { bg: "#8a8478", fg: "#efeadb", border: "#5a554a" }), 17, 1.5, r.minZ - DECOR_GAP, 1.4, 1.5, "N");
    // outhouse
    b.box(m.barnDark, 8.9, 0, 66.4, 10.1, 2.5, 67.6);
    b.cone(m.roofDark, 9.5, 67, 2.5, 2.9, 0.95, 4);
    P.fakeDoor(b, m, 9.5, 0, 67.6, 0.7, 1.8, "S", { mat: m.woodGray });
    // two-wheel canopy cart
    P.buckboard(b, m, 12.5, 62.6, 0.4);
    // hide stretched on a frame + antlers (J4 W view)
    b.box(m.woodDark, 15.4, 0, 74.8, 15.56, 2.6, 74.96);
    b.box(m.woodDark, 18.4, 0, 74.8, 18.56, 2.6, 74.96);
    b.box(m.woodDark, 15.3, 2.4, 74.8, 18.7, 2.56, 74.96, { collide: false });
    b.decal(signMat([""], 2.4, 1.7, { bg: "#5a4632", fg: "#5a4632" }), 17, 1.4, 74.98, 2.4, 1.7, "S");
    b.rotBox(m.bone, 17, 2.8, 74.9, 0.9, 0.3, 0.12, 0, { collide: false });
  }

  /* ---------- Shady Acres cemetery ---------- */
  {
    const r = LOTS.cemetery;
    const fence = (x0: number, z0: number, x1: number, z1: number): void => {
      P.picketFence(b, m, x0, z0, x1, z1, 1.3, m.woodBlack, { slat: 0.09, gap: 0.09, pointed: true, postEvery: 2.6 });
    };
    fence(r.minX, r.maxZ, r.maxX, r.maxZ); // south, along Neely
    fence(r.minX, r.minZ, r.maxX, r.minZ); // north
    fence(r.minX, r.minZ, r.minX, r.maxZ); // west
    // east fence with the SHADY ACRES gate opening (E4 W pose)
    fence(r.maxX, r.minZ, r.maxX, 33.5);
    fence(r.maxX, 39.5, r.maxX, r.maxZ);
    b.box(m.woodDark, r.maxX - 0.16, 0, 33.2, r.maxX + 0.16, 3.2, 33.52);
    b.box(m.woodDark, r.maxX - 0.16, 0, 39.48, r.maxX + 0.16, 3.2, 39.8);
    b.box(m.woodDark, r.maxX - 0.2, 3.05, 32.9, r.maxX + 0.2, 3.35, 40.1, { collide: false });
    b.box(m.woodSaloon, r.maxX - 0.08, 2.35, 34.1, r.maxX + 0.08, 3.05, 38.9, { collide: false });
    b.decal(signMat(["SHADY ACRES"], 4.6, 0.68, { bg: "#33261a", fg: "#efeadb" }), r.maxX + 0.08 + DECOR_GAP, 2.7, 36.5, 4.6, 0.68, "E");
    b.decal(signMat(["SHADY ACRES"], 4.6, 0.68, { bg: "#33261a", fg: "#efeadb" }), r.maxX - 0.08 - DECOR_GAP, 2.7, 36.5, 4.6, 0.68, "W");
    P.oxSkull(b, m, r.maxX, 33.36, 3.37);
    // adobe gate posts near the Neely corner (G3 N view)
    b.box(m.brickCream, 17.6, 0, r.maxZ - 0.5, 18.5, 1.9, r.maxZ + 0.4);
    b.box(m.brickCream, 20.6, 0, r.maxZ - 0.5, 21.5, 1.9, r.maxZ + 0.4);
    // graves: lettered slate, granite, boards and crosses, in rough rows
    const stones: [number, number, P.StoneKind, string[] | undefined, "E" | "S" | "N" | "W", number][] = [
      [19.2, 31.6, "slate", ["HERE", "LIES", "LESTER MOORE", "FOUR SLUGS", "FROM A .44", "NO LES", "NO MORE"], "E", 0.02],
      [16.4, 33.0, "granite", ["JOHN", "HEATH", "1882"], "E", 0],
      [13.4, 31.2, "slate", ["GEORGE", "JOHNSON", "HANGED BY", "MISTAKE", "1882", "HE WAS RIGHT", "WE WAS WRONG"], "E", -0.03],
      [10.2, 32.4, "wood", ["UNKNOWN", "STRANGER", "1881"], "E", 0.06],
      [7.0, 31.4, "granite", ["MARTHA", "ANN", "1841-1879"], "E", 0],
      [4.0, 33.2, "slate", ["SACRED TO", "THE MEMORY OF", "SILAS PIKE", "SHOT", "IN THE BACK"], "E", 0.04],
      [18.6, 36.8, "slate", ["RED RIVER", "BILL", "DIED OF", "LEAD", "POISONING"], "S", 0],
      [15.2, 37.6, "cross", undefined, "S", -0.05],
      [12.0, 36.4, "granite", ["ISAAC", "HOLLIDAY", "1839-1880"], "S", 0],
      [8.6, 37.9, "slate", ["HERE LIES", "A GAMBLER", "HE DREW", "ACES AND", "A BULLET"], "S", 0.03],
      [5.2, 36.6, "wood", ["OLD DAN", "MINER", "CAVE IN", "1875"], "S", -0.08],
      [19.6, 42.2, "granite", ["ELIZA", "GRANT", "1855-1878"], "E", 0],
      [16.0, 43.4, "slate", ["FOUND DEAD", "ON THE", "TRAIL", "NAME", "UNKNOWN"], "E", -0.02],
      [12.6, 42.0, "cross", undefined, "E", 0.04],
      [9.4, 43.6, "slate", ["HERE LIES", "BUTCH", "SHOT WHILE", "RUSTLING", "1880"], "E", 0.05],
      [6.0, 42.4, "granite", ["INFANT", "SON", "1877"], "E", 0],
      [3.0, 43.8, "wood", ["A GOOD", "HORSE", "1879"], "E", -0.06],
      [17.8, 46.2, "slate", ["CHOTT", "FLIPPO SR.", "EDITOR", "PRINTED", "HIS LAST", "1876"], "N", 0],
      [12.8, 46.4, "granite", ["DIED", "1881"], "N", 0],
      [7.2, 46.0, "cross", undefined, "N", 0.07],
      [3.4, 38.6, "cross", undefined, "E", -0.03],
    ];
    for (const [gx, gz, kind, text, facing, lean] of stones) {
      P.gravestone(b, m, gx, gz, kind, { text, facing, lean });
    }
    // low mounds before the slabs
    for (const [gx, gz] of [
      [18.2, 31.6],
      [12.4, 31.2],
      [3.0, 33.2],
      [15.0, 43.4],
      [8.4, 43.6],
    ] as const) {
      const mound = new THREE.SphereGeometry(0.6, 8, 5);
      mound.scale(1.1, 0.25, 0.55);
      mound.translate(gx, 0, gz);
      b.mesh(m.dirt, mound);
    }
    P.deadTree(b, m, 9.8, 39.0, 5.2);
    P.buckboard(b, m, 4.6, 40.2, 0.15);
    P.saguaro(b, m, 21.4, 30.2, 2.6);
    P.saguaro(b, m, 1.9, 34.8, 3.4);
    P.saguaro(b, m, 14.6, 29.6, 2.2);
  }

  /* ---------- Neely west props ---------- */
  {
    P.wagonWheel(b, m, 21.2, 0, 47.9, 0.7, 0.2);
    // hand pump + trough north of G4 (F4 field)
    b.box(m.iron, 27.9, 0, 43.9, 28.2, 1.1, 44.2);
    b.rotBox(m.iron, 28.35, 1.05, 44.05, 0.5, 0.08, 0.08, 0, { collide: false });
    P.trough(b, m, 29.2, 44.6, 1.6);
    P.railFence(b, m, 24, 40, 24, 47.5, 3, 1.25);
    P.railFence(b, m, 24, 47.5, 22.5, 47.5, 3, 1.25);
  }

  /* =========== LEE STREET / EAST =========== */

  /* ---------- Livery (F10 E) ---------- */
  {
    const r = LOTS.livery;
    const d = streetDoor("livery");
    shell(b, m.woodStage, r, 0, 3.6, { W: [doorGapOf(d), ...winGaps("livery", "W")] });
    buildWindows(b, m, "livery", m.woodStage);
    b.box(m.woodStage, r.minX - 0.04, 3.6, r.minZ, r.minX + WALL_T, 5.2, r.maxZ);
    P.gableRoof(b, m, r.minX, r.minZ, r.maxX, r.maxZ, 3.6, 5.4, "x", m.roofDark, m.woodStage);
    capFace(b, m.woodDark, r, "W", 5.2, m, 3.6);
    const fx = r.minX - 0.04 - DECOR_GAP;
    b.decal(signMat(["LIVERY"], 4.6, 1.2, { bg: "#241d16", fg: "#dfb44e", border: "#0f0c08" }), fx, 4.4, 43.7, 4.6, 1.2, "W");
    // sacks + barrel + crate + chair out front
    P.sack(b, m, r.minX - 0.8, 46.6);
    P.sack(b, m, r.minX - 1.3, 46.9);
    P.sack(b, m, r.minX - 0.95, 47.3, 0.4);
    P.barrel(b, m, r.minX - 0.7, 48.4);
    P.crate(b, m, r.minX - 0.8, 41.9, 0.85, 0.7, 0.15);
    P.chair(b, m, r.minX - 0.7, 40.4, Math.PI / 2);
    b.cyl(m.white, r.minX - 1.4, 39.6, 0, 0.55, 0.16, { seg: 8 }); // milk can
    // south wall + posters over the G11 alley
    b.decal(posterMat("wanted"), 84, 2.1, r.maxZ + DECOR_GAP, 0.85, 1.15, "S");
    b.decal(posterMat("circus"), 86, 1.9, r.maxZ + DECOR_GAP, 0.85, 1.15, "S");
    b.decal(posterMat("wanted2"), 88.2, 2.05, r.maxZ + DECOR_GAP, 0.85, 1.15, "S");
    P.bench(b, m, 85, r.maxZ + 0.9, 1.7, "S");
  }

  /* ---------- mayor compound: pillar fence, iron gate, mansion ---------- */
  {
    const f = LOTS.mayorFence;
    const gate = streetDoor("mayor");
    const pillar = (px: number, pz: number): void => {
      b.box(m.brickMayor, px - 0.42, 0, pz - 0.42, px + 0.42, 2.6, pz + 0.42);
      b.box(m.white, px - 0.5, 2.6, pz - 0.5, px + 0.5, 2.78, pz + 0.5, { collide: false });
      b.cone(m.white, px, pz, 2.78, 3.3, 0.52, 4);
    };
    // west run on the Lee street line with the gate opening (I10 E pose)
    const gz0 = gate.z - gate.width / 2 - 0.45;
    const gz1 = gate.z + gate.width / 2 + 0.45;
    const westPosts = [f.minZ, 61.2, gz0, gz1, 73.6, f.maxZ];
    for (const pz of westPosts) {
      pillar(f.minX, pz);
    }
    const scallop = (x0: number, z0: number, x1: number, z1: number): void => {
      P.boardFence(b, m, x0, z0, x1, z1, 2.45, 1.75, m.woodBlack);
    };
    scallop(f.minX, f.minZ + 0.42, f.minX, 61.2 - 0.42);
    scallop(f.minX, 61.2 + 0.42, f.minX, gz0 - 0.42);
    scallop(f.minX, gz1 + 0.42, f.minX, 73.6 - 0.42);
    scallop(f.minX, 73.6 + 0.42, f.minX, f.maxZ - 0.42);
    // north run with LEE board + MACINTOSH graffiti (G10 E / G11 S views)
    const eastPosts = [84.8, 89.6, 94.4, f.maxX];
    let prev = f.minX;
    for (const px of eastPosts) {
      pillar(px, f.minZ);
      scallop(prev + 0.42, f.minZ, px - 0.42, f.minZ);
      prev = px;
    }
    b.decal(signMat(["NEELY"], 1.2, 0.45, { bg: "#efeadb", fg: "#241d16" }), 82.6, 1.7, f.minZ - 0.06 - DECOR_GAP, 1.2, 0.45, "N");
    b.decal(
      signMat(["MACINTOSH IS A", "SON OF A B——"], 3.4, 1.0, { bg: "#241d16", fg: "#efeadb", font: "cursive" }),
      91.8,
      1.35,
      f.minZ - 0.06 - DECOR_GAP,
      3.4,
      1.0,
      "N",
    );
    // south + east runs
    prev = f.minX;
    for (const px of eastPosts) {
      pillar(px, f.maxZ);
      scallop(prev + 0.42, f.maxZ, px - 0.42, f.maxZ);
      prev = px;
    }
    prev = f.minZ;
    for (const pz of [62, 68, 74, f.maxZ]) {
      if (pz !== f.maxZ) {
        pillar(f.maxX, pz);
      }
      scallop(f.maxX, prev + 0.42, f.maxX, pz - 0.42);
      prev = pz;
    }
    // lanterns on the gate pillars + the M plaque over the gate
    for (const pz of [gz0, gz1]) {
      P.wallLantern(b, m, f.minX - 0.42, 1.9, pz, "W");
    }
    P.potPlant(b, m, f.minX - 0.9, gz1 + 1.1);
    b.box(m.iron, f.minX - 0.08, 2.9, gate.z - 1.65, f.minX + 0.08, 3.05, gate.z + 1.65, { collide: false });
    b.decal(signMat(["M"], 0.7, 0.55, { bg: "#241d16", fg: "#dfb44e", border: "#dfb44e" }), f.minX - 0.08 - DECOR_GAP, 3.35, gate.z, 0.7, 0.55, "W");
    b.box(m.iron, f.minX - 0.06, 3.05, gate.z - 0.5, f.minX + 0.06, 3.7, gate.z + 0.5, { collide: false });
    // brick walk from gate to the mansion door
    b.flat(m.brickMayor, f.minX, gate.z - 1.1, LOTS.mansion.minX, gate.z + 1.1, 0.02);

    // mansion: cream two-story, brown shutters, gable + chimneys, porch
    const r = LOTS.mansion;
    const front = { from: 65.75, to: 67.45, top: 2.72 };
    shell(b, m.woodWhite, r, 0, 7.2, { W: [front, ...winGaps("mansion", "W")] });
    buildWindows(b, m, "mansion", m.woodWhite);
    P.gableRoof(b, m, r.minX, r.minZ, r.maxX, r.maxZ, 7.2, 9.6, "z", m.roofDark, m.woodWhite);
    for (const chz of [60, 74]) {
      b.box(m.brickMayor, 93 - 0.45, 8.4, chz - 0.45, 93 + 0.45, 10.6, chz + 0.45, { collide: false });
    }
    // gable-end cornice returns on the street face
    b.box(m.woodDark, r.minX - 0.3, 7.2, r.minZ - 0.2, r.minX + 0.2, 7.4, r.maxZ + 0.2, { collide: false });
    const fx = r.minX - DECOR_GAP;
    // brown shutters flanking every front window
    for (const wz of [59.5, 62, 71, 74]) {
      for (const wy of [1.9, 5.3]) {
        b.box(m.woodMid, r.minX - 0.06, wy - 0.75, wz - 0.85, r.minX - 0.02, wy + 0.75, wz - 0.55, { collide: false });
        b.box(m.woodMid, r.minX - 0.06, wy - 0.75, wz + 0.55, r.minX - 0.02, wy + 0.75, wz + 0.85, { collide: false });
      }
    }
    for (const wy of [5.3]) {
      b.box(m.woodMid, r.minX - 0.06, wy - 0.75, 66.6 - 0.85, r.minX - 0.02, wy + 0.75, 66.6 - 0.55, { collide: false });
      b.box(m.woodMid, r.minX - 0.06, wy - 0.75, 66.6 + 0.55, r.minX - 0.02, wy + 0.75, 66.6 + 0.85, { collide: false });
    }
    // porch around the front door (aligned with the gate walk)
    P.boardwalkSlab(b, m, r.minX - 1.8, 64.2, r.minX, 69, 0.3);
    P.porchPosts(b, m, 0.3, 3.0, [
      [r.minX - 1.6, 64.6],
      [r.minX - 1.6, 68.6],
    ], m.woodWhite);
    P.porchRoof(b, m, r.minX - 1.9, 64, r.minX, 69.2, 3.0, 3.4, "W");
    b.decal(signMat(["M"], 0.6, 0.5, { bg: "#efeadb", fg: "#dfb44e", border: "#b08d3f" }), fx, 3.9, 66.6, 0.6, 0.5, "W");
    b.box(m.marble, r.minX - 2.3, 0, 65.4, r.minX - 1.8, 0.15, 67.8); // step
    // grounds: trees
    for (const [tx, tz] of [
      [83.4, 61.5],
      [83.8, 74.5],
      [97.5, 54.5],
    ] as const) {
      b.cyl(m.woodDark, tx, tz, 0, 1.9, 0.18, { seg: 7, collide: true });
      b.sphere(m.cactusDark, tx, 2.8, tz, 1.5, 8);
    }
  }

  /* ---------- Day street east + rifle range ---------- */
  {
    // DAY/LEE sign gantry over Day at the Lee corner
    b.box(m.woodDark, 73.4, 0, 72.3, 73.7, 3.4, 72.6);
    b.box(m.woodDark, 79.4, 0, 72.3, 79.7, 3.4, 72.6);
    b.box(m.woodDark, 73.3, 3.2, 72.32, 79.8, 3.45, 72.58, { collide: false });
    b.decal(signMat(["DAY"], 1.3, 0.45, { bg: "#2c2014", fg: "#d8cba6" }), 75.4, 2.85, 72.62 + DECOR_GAP, 1.3, 0.45, "S");
    b.decal(signMat(["DAY"], 1.3, 0.45, { bg: "#2c2014", fg: "#d8cba6" }), 75.4, 2.85, 72.28 - DECOR_GAP, 1.3, 0.45, "N");
    b.decal(signMat(["LEE"], 1.3, 0.45, { bg: "#2c2014", fg: "#d8cba6" }), 77.6, 2.4, 72.62 + DECOR_GAP, 1.3, 0.45, "S");
    // The range is the `_TARGET` set: tiles L9..O13 (x 64..104, z 88..120),
    // entered through the gate on the K11 axis (x 84). Rail fences either
    // side of the gate (K10 S / K11 S), the banner over it; nothing
    // stands inside but the booth, the tank, the windmill and cacti.
    P.railFence(b, m, 74, 88.3, 82.4, 88.3, 3, 1.25, m.woodGray);
    P.railFence(b, m, 85.6, 88.3, 100, 88.3, 3, 1.25, m.woodGray);
    b.box(m.woodDark, 82.25, 0, 88.1, 82.55, 3.6, 88.4);
    b.box(m.woodDark, 85.45, 0, 88.1, 85.75, 3.6, 88.4);
    b.decal(
      signMat(["TARGET AND RIFLE RANGE"], 4.6, 0.7, { bg: "#8d7350", fg: "#241d16", border: "#4f382a" }),
      84,
      3.2,
      88.05 - DECOR_GAP,
      4.6,
      0.7,
      "N",
    );
    b.box(m.woodDark, 81.6, 3.5, 88.1, 86.4, 3.65, 88.4, { collide: false });
    // east + south rails, and the yard rail extended to close the west
    P.railFence(b, m, 100, 88.3, 100, 116, 2, 1.2, m.woodGray);
    P.railFence(b, m, 66, 116, 100, 116, 2, 1.2, m.woodGray);
    P.railFence(b, m, 66, PALISADE.zSouth, 66, 116, 2, 1.2, m.woodGray);
    P.railFence(b, m, 88, 94.6, 98, 94.6, 3, 1.2, m.woodGray);
    // Skiz Sheraton's shooting-gallery booth at the far end, as the
    // _TARGET still films it: white body, navy teepee band, bird
    // targets, lettering, a plank walk up from the gate
    {
      const bx0 = 77;
      const bx1 = 91;
      const bz0 = 110;
      const bz1 = 112.4;
      b.box(m.white, bx0, 0, bz0, bx1, 2.65, bz1);
      b.box(m.glassCold, bx0 - 0.12, 2.55, bz0 - 0.06, bx1 + 0.12, 2.72, bz1 + 0.12, { collide: false });
      b.box(m.glassCold, bx0 - 0.1, 1.42, bz0 - 0.08, bx1 + 0.1, 1.58, bz0 + 0.2, { collide: false });
      b.decal(
        new THREE.MeshLambertMaterial({ map: teepeeBandTex(7) }),
        (bx0 + bx1) / 2,
        2.05,
        bz0 - DECOR_GAP,
        bx1 - bx0 - 1.4,
        1.0,
        "N",
      );
      b.box(m.white, bx0, 1.28, bz0 - 0.45, bx1, 1.5, bz0, { collide: false });
      b.decal(
        signMat(["SKIZ SHERATON'S", "TARGET AND RIFLE RANGE"], 12.6, 1.1, {
          bg: "#efeadb",
          fg: "#9e2f24",
          border: "#2b3a5c",
        }),
        (bx0 + bx1) / 2,
        0.72,
        bz0 - DECOR_GAP,
        12.6,
        1.1,
        "N",
      );
      for (const [bxT, byT, sc] of [
        [78.3, 2.2, 1], [80.1, 1.9, 0.8], [82.4, 2.35, 0.9], [84.8, 1.75, 1],
        [87.1, 2.25, 0.8], [88.9, 1.95, 0.9], [90.4, 2.4, 0.8],
      ] as const) {
        b.rotBox(m.brickMayor, bxT, byT, bz0 - 0.07, 0.22 * sc, 0.14 * sc, 0.1, 0.4, { collide: false });
      }
      for (const bxT of [79.1, 81.7, 83.9, 86.4, 88.6, 90.1]) {
        b.rotBox(m.brickMayor, bxT, 1.58, bz0 - 0.22, 0.24, 0.16, 0.12, -0.3, { collide: false });
      }
      b.flat(m.woodWatson, 82.9, 89.5, 85.1, bz0, 0.06);
      b.box(m.iron, 82.6, 0.02, 108.3, 85.4, 0.12, 109.9);
      b.box(m.woodDark, 92.6, 0, 109.3, 92.75, 3.4, 109.45);
    }
    // SEE ROCK CITY tank on its tower + the windmill in the south-east
    {
      const tx = 74;
      const tz = 104.5;
      for (const [sx2, sz2] of [
        [-0.8, -0.8],
        [-0.8, 0.8],
        [0.8, 0.8],
        [0.8, -0.8],
      ] as const) {
        b.box(m.woodDark, tx + sx2 - 0.09, 0, tz + sz2 - 0.09, tx + sx2 + 0.09, 3.4, tz + sz2 + 0.09);
      }
      b.cyl(m.woodSaloon, tx, tz, 3.4, 5.2, 1.25, { seg: 12 });
      b.decal(signMat(["SEE", "ROCK", "CITY"], 1.6, 1.5, { bg: "#3a2b1f", fg: "#efeadb" }), tx, 4.3, tz - 1.3, 1.6, 1.5, "N");
    }
    for (const [cx2, cz2] of [
      [70, 98.5],
      [75.5, 103],
      [90.5, 92.5],
      [93, 106.5],
      [97.5, 98],
      [72, 107.5],
      [88.5, 111],
      [68.5, 104.5],
      [80.5, 93.5],
      [95, 84],
      [90, 80],
    ] as const) {
      P.saguaro(b, m, cx2, cz2, 2.4 + ((cx2 + cz2) % 3) * 0.5);
    }
    P.oxSkull(b, m, 86.6, 90.6);
  }

  /* =========== FARM SOUTH-WEST + DAY WEST =========== */
  {
    solidBuilding(b, m, LOTS.wheelwright, 3.8, m.woodBlack, "gableX", m.roofDark, 1.6);
    P.fakeDoor(b, m, 11, 0, LOTS.wheelwright.maxZ, 1.5, 2.4, "S", { mat: m.woodBlack });
    P.wallLantern(b, m, 10.6, 3.1, LOTS.wheelwright.maxZ, "S");
    windowRow(b, winCold, "S", LOTS.wheelwright.maxZ + DECOR_GAP, [7.4, 14.6], 1.9, 1.2, 1.4);
    // antlers on the east gable (K3 W view)
    b.rotBox(m.bone, LOTS.wheelwright.maxX + 0.08, 3.6, 76, 0.1, 0.4, 0.9, 0, { collide: false });

    // low white stable, two dark doorways with stone ramps (K2 W view)
    const st = LOTS.whiteStable;
    solidBuilding(b, m, st, 2.6, m.adobeMission, "flat", m.roofDark);
    for (const dz of [81.5, 85.5]) {
      b.decal(signMat([""], 1.1, 1.9, { bg: "#17120d", fg: "#17120d" }), st.maxX + DECOR_GAP, 1.0, dz, 1.1, 1.9, "E");
      b.flat(m.marble, st.maxX, dz - 0.55, st.maxX + 1.2, dz + 0.55, 0.03);
    }
    P.wagonWheel(b, m, st.maxX + 0.4, 0, 79.2, 0.7, 0.25);
    P.saguaro(b, m, st.maxX + 2.2, 78.6, 2.8);

    // gray barn south of Day with the X-door facing the L3 spur
    const gb = LOTS.grayBarn;
    solidBuilding(b, m, gb, 3.4, m.woodGray, "gableZ", m.roofDark, 2.2);
    b.decal(
      signMat([""], 2.6, 2.9, { bg: "#5a2b1e", fg: "#5a2b1e", planked: true }),
      gb.maxX + DECOR_GAP,
      1.5,
      92.5,
      2.6,
      2.9,
      "E",
    );
    b.decal(signMat(["X"], 2.6, 2.9, { bg: "#5a2b1e", fg: "#3a1c12", font: "Georgia" }), gb.maxX + DECOR_GAP * 2, 1.5, 92.5, 2.6, 2.9, "E");
    b.decal(signMat(["U U"], 1.3, 0.5, { bg: "#8a8478", fg: "#3a3630" }), gb.maxX + DECOR_GAP, 3.15, 92.5, 1.3, 0.5, "E");
    P.crate(b, m, gb.maxX + 0.9, 95.2, 0.9, 0.7, 0.2);
    P.sack(b, m, gb.maxX + 0.8, 90);
    b.decal(posterMat("wanted"), 12, 2.0, gb.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.decal(posterMat("bishop"), 10.2, 1.9, gb.minZ - DECOR_GAP, 0.85, 1.15, "N");
    P.wagonWheel(b, m, 13.6, 0, gb.minZ - 0.45, 0.7, 0.15);
    P.hitchRail(b, m, 8.5, gb.minZ - 1, 13.5, gb.minZ - 1);

    // farmhouse (K4 S): gray clapboard, horseshoe over the brown door
    const fh = LOTS.farmhouse;
    solidBuilding(b, m, fh, 3.2, m.woodGray, "gableX", m.roofRed, 1.8);
    const fhz = fh.minZ - DECOR_GAP;
    P.fakeDoor(b, m, 29, 0, fh.minZ, 1.2, 2.3, "N", { mat: m.woodMid });
    b.decal(signMat(["U"], 0.5, 0.4, { bg: "#8a8478", fg: "#3a3630" }), 29, 2.65, fhz, 0.5, 0.4, "N");
    b.decal(winWarm, 26.6, 1.7, fhz, 1.1, 1.2, "N");
    b.decal(winCold, 31.6, 1.7, fhz, 1.1, 1.2, "N");
    b.flat(m.boardwalk, 28.3, fh.minZ - 0.9, 29.7, fh.minZ, 0.05);

    // black barn on the L3 spur
    solidBuilding(b, m, LOTS.blackBarn, 3.6, m.woodBlack, "gableZ", m.roofRed, 2);

    // the well, just south of the L5 pose (it looks straight at it)
    P.well(b, m, 37.4, 97.6);
    P.railFence(b, m, 34.3, 94.8, 34.3, 99.8, 2, 1.15);
    P.railFence(b, m, 34.3, 99.8, 40.6, 99.8, 2, 1.15);
    P.saguaro(b, m, 33.1, 90.2, 2.4);

    // freight wagon parked on Day (K4 E / K5 N views)
    P.wagon(b, m, 31.5, 81.5, 0.08);
    // buckboard + rails near K3
    P.buckboard(b, m, 22.5, 76.5, -0.2);
    P.hitchRail(b, m, 18, 79.6, 23, 79.6);
    P.railFence(b, m, 16, 100, 30, 100, 2, 1.2);
    P.barrel(b, m, 25.4, 97.8);
    P.barrel(b, m, 27.2, 98.2);
  }

  /* =========== NE FARM (Mission street east end) =========== */
  {
    const nb2 = LOTS.neBarn;
    solidBuilding(b, m, nb2, 3.8, m.woodGray, "gableZ", m.roofRed, 2.6);
    b.decal(signMat([""], 2.4, 2.7, { bg: "#4a3320", fg: "#4a3320", planked: true }), nb2.minX - DECOR_GAP, 1.4, 27, 2.4, 2.7, "W");
    b.decal(signMat(["X"], 2.4, 2.7, { bg: "#4a3320", fg: "#33200f", font: "Georgia" }), nb2.minX - DECOR_GAP * 2, 1.4, 27, 2.4, 2.7, "W");
    P.wagonWheel(b, m, nb2.minX + 0.3, 0, 30.4, 0.8, 0.22);
    solidBuilding(b, m, LOTS.redStable, 2.6, m.barnDark, "gableX", m.tileRed, 1.2);
    P.railFence(b, m, 66.2, 13.8, 80, 13.8, 3, 1.3);
    P.railFence(b, m, 80, 13.8, 80, 20, 3, 1.3);
    P.railFence(b, m, 76.2, 14, 76.2, 15.8, 2, 1.2);
    P.railFence(b, m, 76.2, 24.15, 79.6, 24.15, 3, 1.25);
    // GLUE crates by the livery's north corner (E10 E view)
    P.crate(b, m, 81.2, 35.1, 0.95, 0.85, 0.1, m.woodStage);
    P.crate(b, m, 81.0, 34.7, 0.8, 0.7, 0.25, m.woodStage);
    b.decal(signMat(["GLUE"], 0.8, 0.4, { bg: "#a98e66", fg: "#33261a" }), 81.2, 0.55, 35.65 + DECOR_GAP, 0.8, 0.4, "S");
    b.decal(signMat(["GLUE"], 0.7, 0.35, { bg: "#a98e66", fg: "#33261a" }), 81.0, 1.1, 35.15 + DECOR_GAP, 0.7, 0.35, "S");
    b.cyl(m.white, 82.4, 34.6, 0, 0.55, 0.16, { seg: 8 });
    P.wagonWheel(b, m, 83.2, 0, 35.8, 0.7, 0.28);
  }

  /* ---------- door frames on every street door ---------- */
  for (const spec of STREET_DOORS) {
    const t = spec.id === "mission" ? 0.5 : WALL_T;
    const extra = spec.id === "mission" ? 0.04 : 0.12;
    if (spec.gate) {
      continue;
    }
    P.doorFrame(b, m, spec, extra, t, spec.id === "mission" ? m.woodBlack : m.woodDark);
  }

  /* ---------- stovepipes + boardwalk joins ---------- */
  {
    const pipe = (x: number, z: number, y0: number, y1: number): void => {
      b.cyl(m.iron, x, z, y0, y1, 0.09, { seg: 7 });
      b.cyl(m.iron, x, z, y1, y1 + 0.06, 0.16, { seg: 7 });
    };
    pipe(41.9, 95.0, 3.5, 5.0); // jail office stove
    pipe(64.6, 73.4, 5.42, 6.4); // Bolivar's store
    pipe(44.2, 37.6, 3.5, 5.0); // doctor's waiting room
    pipe(6.8, 57.2, 3.4, 4.9); // Sidewinder
    pipe(81.6, 41.0, 3.5, 6.0); // livery office
    pipe(30, 90.5, 4.4, 5.6); // farmhouse
    b.box(m.brickBank, 71.0, 9.2, 41.4, 71.9, 10.5, 42.4, { collide: false }); // hotel fireplace flue

    // continuous boardwalk along the packed east row
    P.boardwalkSlab(b, m, 54.5, 64.8, 56, 65.2);
    P.boardwalkSlab(b, m, 54.5, 72.3, 56, 72.7);
  }

  /* ---------- street lamps + name boards ---------- */
  {
    const lamps: [number, number, [string, string] | null][] = [
      [48.7, 48.7, ["NEELY", "MAIN"]],
      [55.3, 48.7, ["NEELY", "MAIN"]],
      [55.3, 55.3, ["NEELY", "MAIN"]],
      [48.7, 55.3, null],
      [47.1, 79.2, ["DAY", "MAIN"]],
      [55.3, 87.3, ["DAY", "MAIN"]],
      [48.7, 87.3, ["MAIN", "DAY"]],
      [55.2, 30.8, ["MISSION", "MAIN"]],
      [48.8, 31.2, ["MISSION", "MAIN"]],
      [71.3, 48.9, ["NEELY", "LEE"]],
    ];
    for (const [lx, lz, names] of lamps) {
      P.lampPost(b, m, lx, lz, 3.5);
      if (names) {
        P.streetSign(b, m, lx, lz, 3.05, names);
      }
    }
  }

  /* ---------- scattered cacti + skulls + barrels ---------- */
  {
    for (const [cx, cz, ch] of [
      [42.5, 97.5, 3.2], [45.5, 99.5, 2.4], [30, 22.6, 3.0], [26.5, 30.5, 2.2],
      [24.5, 25, 3.4], [69.5, 11.5, 3.0], [92, 60, 2.6], [2, 51.5, 2.8],
      [30.5, 51, 2.2], [72, 17, 2.4], [82.5, 12.5, 3.0], [44, 84.5, 2.8],
    ] as const) {
      P.saguaro(b, m, cx, cz, ch);
    }
    P.barrel(b, m, 46.6, 54.8);
    P.barrel(b, m, 57.2, 49.2);
    P.barrel(b, m, 55, 30.2);
    P.trough(b, m, 54.6, 73, 2.0, false);
  }

  b.build(group);
  nb.build(nightGroup, { shadows: false });
  // night colliders join the main set
  for (const c of nb.colliders) {
    b.colliders.push(c);
  }

  return { group, nightGroup, builder: b };
}

export { STREET_DOORS };
