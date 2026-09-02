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
  FENCE,
  GATE,
  LOTS,
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
import { registerNight, type Mats } from "./materials";
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

/** Letters painted straight onto a wall (no board): a cut-out decal. */
function letters(lines: string[], w: number, h: number, fg: string, font?: string, spread = false): THREE.MeshLambertMaterial {
  return registerNight(
    new THREE.MeshLambertMaterial({
      map: boardTex(lines, w, h, { bg: "transparent", fg, font, tight: true, spread }),
      alphaTest: 0.2,
      emissive: new THREE.Color(fg),
      emissiveIntensity: 0.3,
    }),
    0.3,
    0.04,
  );
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

/** Flat roof slab kept inside the shell, so a false front's lettering is never clipped by an overhang. */
function flatRoof(b: Builder, m: Mats, r: Rect, y: number, mat?: THREE.Material): void {
  b.box(mat ?? m.roofDark, r.minX, y, r.minZ, r.maxX, y + 0.18, r.maxZ);
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

/**
 * Real windows for a lot: clear glass mid-wall, a wood frame with a
 * muntin grid, an arched head where the film shows one, and iron bars
 * on the jail and bank. The matching wall holes come from `winGaps`
 * fed into the shell + interior linings.
 */
export function buildWindows(b: Builder, m: Mats, key: LotName, wallMat: THREE.Material): void {
  const r = LOTS[key];
  for (const w of WINDOWS[key] ?? []) {
    const glass = w.lit ? m.glassLit : m.glassClear;
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
      b.box(glass, gx - 0.02, w.bottom, w.at - hw, gx + 0.02, glassTop, w.at + hw, { collide: true });
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
      b.box(glass, w.at - hw, w.bottom, gz - 0.02, w.at + hw, glassTop, gz + 0.02, { collide: true });
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
    const mh = hh * 0.32;
    butte(mx, mz, mr, mh);
    if (kind === 0) {
      butte(mx + mr * 0.9, mz + 4, mr * 0.5, mh * 0.7);
    }
    b.solid({ minX: mx - mr, minY: 0, minZ: mz - mr, maxX: mx + mr, maxY: mh, maxZ: mz + mr });
  }

  /* ---------- south gate ---------- */
  {
    // Film O7 N / N7 S / N7 W: each side is a rough post with a brace
    // fore and aft (three poles a side), a crossbeam over the street
    // at 5.4 m and a small DIAMONDBACK board hung on chains under it.
    for (const px of [GATE.westPostX, GATE.eastPostX]) {
      b.rotBox(m.woodSaloon, px, GATE.beamY / 2, GATE.z, 0.32, GATE.beamY, 0.32, 0, { collide: true });
      for (const dz of [-1.1, 1.1]) {
        const rise = GATE.beamY - 0.4;
        b.rotBox(m.woodSaloon, px, rise / 2, GATE.z + dz / 2, 0.18, Math.hypot(dz, rise), 0.18, 0, {
          rotX: -Math.atan2(dz, rise),
          collide: false,
        });
      }
    }
    b.box(m.woodSaloon, GATE.westPostX - 0.6, GATE.beamY, GATE.z - 0.16, GATE.eastPostX + 0.6, GATE.beamY + 0.3, GATE.z + 0.16, {
      collide: false,
    });
    const signW = 3.8;
    const signH = GATE.signTop - GATE.signBottom;
    const sx = 52.1;
    const sy = (GATE.signTop + GATE.signBottom) / 2;
    const sz = GATE.z - 0.3;
    const tilt = 0.1; // the west end hangs low
    for (const side of [-1, 1]) {
      const cx = sx + side * (signW / 2 - 0.15);
      const top = GATE.signTop + side * Math.sin(tilt) * (signW / 2 - 0.15);
      b.box(m.iron, cx - 0.02, top, sz - 0.02, cx + 0.02, GATE.beamY, sz + 0.02, { collide: false });
    }
    b.rotBox(m.woodSaloon, sx, sy, sz, signW, signH, 0.1, 0, { rotZ: tilt, collide: false });
    const gateSign = signMat(["DIAMONDBACK"], signW, signH, { bg: "#3b2b1c", fg: "#e0cf9c", border: "#20150c" });
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(signW, signH);
      g.rotateZ(side * tilt);
      if (side < 0) {
        g.rotateY(Math.PI);
      }
      g.translate(sx, sy, sz + side * (0.05 + DECOR_GAP));
      b.mesh(gateSign, g);
    }

    // WARNING board just inside the gate, on one post at the lane's
    // west edge (N7 N / O7 N: a 2.1 m board lettered from 1 m to 2.45 m)
    b.box(m.woodDark, 49.95, 0, 104.82, 50.15, 2.4, 105.02);
    b.box(m.woodSaloon, 49.0, 0.9, 105.05, 51.1, 2.36, 105.15, { collide: false });
    b.decal(
      signMat(
        ["WARNING!", "Gunmen, Thieves, and", "Dance House Loungers", "Get out of Diamondback", "and Stay Out", "—Otherwise Hang!"],
        2.1,
        1.46,
        { bg: "#33261a", fg: "#d8cba6" },
      ),
      50.05,
      1.63,
      105.15 + DECOR_GAP,
      2.1,
      1.46,
      "S",
    );
    // the ox skull on the ground at the east post (O7 N / O7 E)
    P.oxSkull(b, m, 55.6, 112.9);
  }

  /* ---------- gate fence + yard (windmill, SEE ROCK CITY tank, skull poles) ---------- */
  {
    // Film N7 E / O8 N / M7 E: 2.6 m of uneven grey boards on rails,
    // north from the gate's east post and east along the gate line; the
    // east run stops where O7 E / O8 E show its end, and nothing runs
    // south of the gate line
    const f = FENCE;
    P.boardWall(b, m, f.x, f.zNorth, f.x, f.zSouth, f.height, m.fenceGray, -1);
    P.boardWall(b, m, f.x, GATE.z, f.eastEndX, GATE.z, f.height, m.woodBlack, -1);
    // the run closes on Curiosities' south-west corner (L7 E / K7 S)
    P.boardWall(b, m, f.x, f.zNorth, LOTS.curio.minX, f.zNorth, f.height, m.fenceGray, -1);
    // "Firearms Strickly Prohibited" (film spelling): one long board on
    // two posts in front of the fence, lettered 1.0..1.8 (N7 N / N7 E)
    b.box(m.woodDark, 54.1, 0, 104.75, 54.3, 2.05, 104.95);
    b.box(m.woodDark, 56.0, 0, 104.75, 56.2, 2.05, 104.95);
    b.box(m.woodSaloon, 53.95, 1.35, 104.95, 56.35, 1.9, 105.05, { collide: false });
    b.decal(
      signMat(["Firearms Strickly Prohibited"], 2.4, 0.55, { bg: "#8d7350", fg: "#241d16", tight: true }),
      55.15,
      1.625,
      105.05 + DECOR_GAP,
      2.4,
      0.55,
      "S",
    );
    // yard behind: corral rails, the windmill and the SEE ROCK CITY tank
    // (three-still fix: windmill (60.4, 108.1), tank (68.5, 109.3))
    P.railFence(b, m, f.eastEndX, 96, f.eastEndX, f.zSouth, 3, 1.3, m.woodGray);
    P.railFence(b, m, 59.8, 96.3, f.eastEndX, 96.3, 3, 1.3, m.woodGray);
    P.windmill(b, m, 60.35, 108.1, 12);
    P.waterTower(b, m, 68.5, 109.3, ["SEE", "ROCK", "CITY"], 5.0, 3.0, 1.2);
    // the two ox skulls on poles at Curiosities' corner (M7 E / L7 E)
    P.skullPole(b, m, 58.0, 97.6, 4.7);
    P.skullPole(b, m, 61.0, 98.5, 4.4);
    P.barrel(b, m, 56.1, 96.7);
  }

  /* ---------- west of the gate: rail fence, the shed, cacti (M7 W / N7 W / O6 N) ---------- */
  {
    // one three-rail fence runs north from the gate line at x 40
    P.railFence(b, m, 40, 99, 40, 117, 3, 1.75);
    // the small dark shed with a pyramid roof and an east door
    b.box(m.woodBlack, 38.3, 0, 107.7, 40.7, 1.9, 110.1);
    b.cone(m.roofDark, 39.5, 108.9, 1.85, 2.9, 1.85, 4, Math.PI / 4);
    P.fakeDoor(b, m, 40.7, 0, 108.9, 0.8, 1.7, "E", { mat: m.woodBlack });
    // the two tall saguaros by the lane (O6 N / N7 N / M7 W)
    P.saguaro(b, m, 47.8, 98.8, 4.0);
    P.saguaro(b, m, 49.4, 107.6, 2.85);
  }

  /* =========== MAIN STREET, WEST SIDE =========== */

  /* ---------- Hard Drive Saloon (H7 W): wall x 45.5, porch to 48.4, two storeys ---------- */
  {
    const r = LOTS.saloon;
    const dSaloon = streetDoor("saloon");
    const top = 8.0;
    shell(b, m.woodSaloon, r, 0, top, {
      E: [doorGapOf(dSaloon), ...winGaps("saloon", "E")],
      N: winGaps("saloon", "N"),
      W: [{ from: 65.6, to: 67.0, top: 2.6 }, ...winGaps("saloon", "W")],
    });
    buildWindows(b, m, "saloon", m.woodSaloon);
    flatRoof(b, m, r, top);
    b.box(m.woodDark, r.maxX - WALL_T - 0.1, top, r.minZ - 0.15, r.maxX + 0.25, top + 0.22, r.maxZ + 0.15, { collide: false });
    // porch: boardwalk to x 48.4, posts on x 48 (H7 W / I7 W / K7 N),
    // ceiling at 3.5 with the balcony floor above it and a rail
    const porchX = 48.4;
    const postX = 48.0;
    P.boardwalkSlab(b, m, r.maxX, r.minZ + 0.2, porchX, r.maxZ + 0.2, 0.15);
    const postZ = [56.9, 62.6, 67.1, 71.6, 77.2];
    P.porchPosts(b, m, 0.15, 3.5, postZ.map((pz) => [postX, pz] as [number, number]), m.woodSaloon);
    for (const pz of postZ) {
      b.rotBox(m.woodSaloon, postX - 0.3, 3.12, pz, 0.72, 0.09, 0.09, 0, { rotZ: -0.75, collide: false });
      b.rotBox(m.woodSaloon, postX + 0.22, 3.2, pz, 0.5, 0.09, 0.09, 0, { rotZ: 0.75, collide: false });
    }
    b.box(m.woodSaloon, r.maxX, 3.5, r.minZ + 0.2, porchX + 0.1, 3.78, r.maxZ + 0.2, { collide: false });
    P.balustrade(b, m, porchX + 0.1, r.minZ + 0.2, porchX + 0.1, r.maxZ + 0.2, 3.78, 0.95);
    P.balustrade(b, m, r.maxX + 0.2, r.minZ + 0.2, porchX + 0.1, r.minZ + 0.2, 3.78, 0.95);
    P.balustrade(b, m, r.maxX + 0.2, r.maxZ + 0.2, porchX + 0.1, r.maxZ + 0.2, 3.78, 0.95);
    // the name: a two-line board standing on the balcony's front rail (J7 N / H7 S / I7 W)
    const fx0 = r.maxX + DECOR_GAP;
    b.box(m.woodSaloon, porchX + 0.04, 3.75, 61.3, porchX + 0.12, 5.35, 70.3, { collide: false });
    b.decal(signMat(["HARD DRIVE", "SALOON"], 9.0, 1.6, { bg: "#2c1a10", fg: "#e0b34c", border: "#6b5b3c", tight: true }), porchX + 0.12 + DECOR_GAP, 4.55, 65.8, 9.0, 1.6, "E");
    // boards + lanterns either side of the door (H7 W)
    b.decal(signMat(["Beers &", "Whiskeys"], 1.0, 0.63, { bg: "#2c2014", fg: "#d8cba6", border: "#6b5b3c" }), fx0, 1.5, 61.2, 1.0, 0.63, "E");
    b.decal(signMat(["Liquors &", "Cigars"], 1.0, 0.63, { bg: "#2c2014", fg: "#d8cba6", border: "#6b5b3c" }), fx0, 1.5, 57.8, 1.0, 0.63, "E");
    P.wallLantern(b, m, r.maxX, 2.25, 61.26, "E", 1.7);
    P.wallLantern(b, m, r.maxX, 2.25, 57.7, "E", 1.7);
    // porch chairs + the brass pot against the wall (I7 W), hitch rails out front
    P.chair(b, m, r.maxX + 0.45, 65.1, Math.PI / 2, 0.15);
    P.chair(b, m, r.maxX + 0.45, 68.0, Math.PI / 2, 0.15);
    P.spittoon(b, m, r.maxX + 0.4, 66.8, 0.15, 1.4);
    P.hitchRail(b, m, 48.7, 61.0, 48.7, 64.6, 1.3);
    P.hitchRail(b, m, 48.7, 69.5, 48.7, 73.7, 1.3);
    b.box(m.woodDark, 48.15, 0, 72.9, 49.25, 1.15, 75.3);
    b.box(m.woodBlack, 48.25, 1.0, 73.0, 49.15, 1.16, 75.2, { collide: false });
    // north side on Neely (G7 W / G6 S / G5 S): the porch wraps round to
    // the street corner and runs the whole block west over the backshed;
    // the bills on the wall are the film's — REPENT, Martash, the Winter
    // Girls, the cancelled Manzana exhibition
    const nz = r.minZ - DECOR_GAP;
    P.boardwalkSlab(b, m, LOTS.saloonBackshed.minX + 0.2, r.minZ - 1.7, porchX, r.minZ, 0.15);
    P.porchPosts(b, m, 0.15, 3.4, [
      [47.7, r.minZ - 1.5],
      [45.0, r.minZ - 1.5],
      [40.0, r.minZ - 1.5],
      [36.0, r.minZ - 1.5],
      [32.6, r.minZ - 1.5],
    ], m.woodSaloon);
    b.box(m.woodSaloon, LOTS.saloonBackshed.minX, 3.4, r.minZ - 1.7, porchX + 0.1, 3.65, r.minZ, { collide: false });
    b.decal(posterMat("repent"), 43.14, 2.0, nz, 1.6, 1.9, "N");
    b.decal(posterMat("martash"), 40.56, 1.85, nz, 1.3, 2.0, "N");
    b.decal(posterMat("girls"), 35.74, 2.0, nz, 1.3, 1.9, "N");
    b.decal(posterMat("manzana"), 34.4, 2.0, nz, 1.3, 1.9, "N");
    P.bench(b, m, 41.1, r.minZ - 0.5, 2.6, "N");
    P.bench(b, m, 36.9, r.minZ - 0.5, 2.6, "N");
    P.spittoon(b, m, 44.4, r.minZ - 0.6, 0.15, 1.6);
    P.spittoon(b, m, 38.8, r.minZ - 0.6, 0.15, 1.6);
    // the name in gold along the top of the west face (G4 S / G3 S)
    b.decal(letters(["HARD DRIVE SALOON"], 7.2, 0.8, "#e0b34c"), r.minX - DECOR_GAP, 7.2, 68.0, 7.2, 0.8, "W");
    // south face: red board + lamps near Main (K5 E / K7 W views)
    P.wallLantern(b, m, 44.1, 2.4, r.maxZ, "S");
  }

  /* ---------- saloon backlot (west lane wall, posters, back door) ---------- */
  {
    const r = LOTS.saloonBackshed;
    const back = streetDoor("saloonBack");
    shell(b, m.woodSaloon, r, 0, 6.0, {
      W: [doorGapOf(back)],
      E: [{ from: 65.6, to: 67.0, top: 2.6 }],
    });
    flatRoof(b, m, r, 6.0);
    const px = r.minX - DECOR_GAP;
    // the barn door at the lane's mouth stands open, its leaf swung out
    // across the lane (H4 E / G4 S); bills either side of it (H4 E / I4 E)
    b.decal(signMat([""], 2.6, 3.5, { bg: "#0e0a07", fg: "#0e0a07" }), px, 1.75, 59.9, 2.6, 3.5, "W");
    b.rotBox(m.woodMid, 30.7, 1.75, 58.66, 2.6, 3.5, 0.08, 0, { collide: true });
    b.decal(posterMat("wanted"), px, 2.0, 57.7, 1.0, 1.6, "W");
    b.decal(posterMat("wanted2"), px, 2.3, 62.25, 1.05, 1.6, "W");
    b.decal(posterMat("circus"), px, 3.45, 63.87, 1.3, 1.7, "W");
    b.decal(posterMat("bishop"), px, 1.55, 64.15, 1.3, 1.65, "W");
    b.decal(posterMat("martash"), px, 2.85, 65.95, 1.1, 1.7, "W");
    // "EAT, DRINK AND GO TO BED, OR GIT OUT!" hand-lettered beside the
    // back door, GRANT over it (J4 E / I4 S)
    b.decal(
      signMat(["HARD DRIVE", "SALOON", "EAT, DRINK", "AND GO", "TO BED,", "OR GIT", "OUT!"], 1.3, 1.9, { bg: "#241a12", fg: "#e6dcba", font: "cursive" }),
      px,
      1.95,
      74.3,
      1.3,
      1.9,
      "W",
    );
    b.decal(signMat(["GRANT"], 1.25, 0.6, { bg: "#3c2c1c", fg: "#d8cba6" }), px, 2.75, 75.9, 1.25, 0.6, "W");
    // the DAY plate on the shed's south end (K4 N / K5 N)
    b.decal(signMat(["DAY"], 0.96, 0.45, { bg: "#3a2814", fg: "#e8dcb8", font: "Rockwell, 'Arial Black', Georgia, serif" }), 33.0, 2.88, r.maxZ + DECOR_GAP, 0.96, 0.45, "S");
    b.decal(
      signMat(["SALOON", "steak  .25", "beans  .10", "whiskey .15"], 1.3, 1.3, { bg: "#1c1712", fg: "#cfc4a6", align: "left" }),
      32.5,
      1.95,
      r.maxZ + DECOR_GAP,
      1.3,
      1.3,
      "S",
    );
    // barrels and crates stacked along the lane wall (I4 E / K4 N)
    P.barrel(b, m, 31.3, 65.4, 0.42, 0.95);
    P.barrel(b, m, 31.3, 70.0, 0.42, 0.95);
    P.barrel(b, m, 31.3, 70.0, 0.4, 0.9, 0.95);
    P.crate(b, m, 31.3, 67.5, 1.3, 1.3, 0.05, m.crateLight);
    b.box(m.crateLight, 30.75, 1.3, 66.95, 31.85, 2.4, 68.05);
  }

  /* ---------- the saloon's south face on Day (K5 N / K6 N / L5 N): bills over the wagon, script boards at the corner ---------- */
  {
    const sz = LOTS.saloon.maxZ + DECOR_GAP;
    b.decal(posterMat("girls"), 35.6, 2.8, sz, 1.25, 1.9, "S");
    b.decal(posterMat("wanted"), 37.9, 2.75, sz, 1.0, 1.3, "S");
    b.decal(posterMat("martash"), 39.05, 2.3, sz, 1.1, 1.7, "S");
    b.decal(posterMat("bishop"), 41.55, 2.45, sz, 1.1, 1.5, "S");
    b.decal(posterMat("repent"), 42.65, 1.45, sz, 1.1, 1.4, "S");
    b.decal(posterMat("circus"), 43.75, 2.5, sz, 1.1, 1.6, "S");
    b.decal(signMat(["Beers &", "Whiskeys"], 1.9, 1.35, { bg: "#241a12", fg: "#e6dcba", border: "#0e0a07", font: "cursive" }), 44.0, 4.05, sz, 1.9, 1.35, "S");
    b.decal(signMat(["Liquors", "& Cigars"], 1.9, 1.3, { bg: "#241a12", fg: "#e6dcba", border: "#0e0a07", font: "cursive" }), 44.0, 6.05, sz, 1.9, 1.3, "S");
  }

  /* ---------- Bank (F7 W): dark brick, letters painted on, barred windows ---------- */
  {
    const r = LOTS.bank;
    const d = streetDoor("bank");
    shell(b, m.brickBank, r, 0, 4.6, { E: [doorGapOf(d), ...winGaps("bank", "E")] });
    buildWindows(b, m, "bank", m.brickBank);
    flatRoof(b, m, r, 4.6);
    b.box(m.brickBank, r.maxX - WALL_T, 4.6, r.minZ, r.maxX, 5.6, r.maxZ);
    capFace(b, m.brickMayor, r, "E", 5.6, m, 4.6);
    const fx = r.maxX + DECOR_GAP;
    // cream letters straight on the brick: two wide-tracked lines and the est. flourish (F7 W)
    b.decal(letters(["DIAMONDBACK", "BANK & TRUST"], 5.6, 1.0, "#e6dcc0", undefined, true), fx, 3.9, 44.0, 5.6, 1.0, "E");
    b.decal(letters(["~ est. 1875 ~"], 3.4, 0.28, "#e6dcc0"), fx, 3.24, 44.0, 3.4, 0.28, "E");
    b.decal(signMat(["POST NO BILLS"], 1.4, 0.22, { bg: "#b8481e", fg: "#2c1a10" }), fx, 0.45, 45.9, 1.4, 0.22, "E");
    // heavy dark surround round the double door
    b.box(m.woodBlack, r.maxX - 0.02, 0, d.z - 1.15, r.maxX + 0.08, 3.15, d.z - 1.0, { collide: false });
    b.box(m.woodBlack, r.maxX - 0.02, 0, d.z + 1.0, r.maxX + 0.08, 3.15, d.z + 1.15, { collide: false });
    b.box(m.woodBlack, r.maxX - 0.02, 3.0, d.z - 1.15, r.maxX + 0.08, 3.15, d.z + 1.15, { collide: false });
    // the name again on the north + south brick faces (G7 N sees the "K T"
    // on the Neely corner), a dark board on the lane
    b.decal(signMat(["POST NO BILLS"], 2.6, 0.52, { bg: "#b8481e", fg: "#2c1a10" }), 41.2, 2.8, r.maxZ + DECOR_GAP, 2.6, 0.52, "S");
    b.decal(letters(["DIAMONDBACK", "BANK & TRUST"], 2.3, 0.62, "#c8bea6"), 46.2, 2.44, r.maxZ + DECOR_GAP, 2.3, 0.62, "S");
    // the lane face (F4 E): the name painted small and dim at 2.5 m, a bill low by the corner
    b.decal(letters(["DIAMONDBACK", "BANK & TRUST"], 2.2, 0.6, "#b5a98f"), r.minX - DECOR_GAP, 2.46, 44.35, 2.2, 0.6, "W");
    b.decal(signMat(["POST NO BILLS"], 1.5, 0.32, { bg: "#b8481e", fg: "#2c1a10" }), r.minX - DECOR_GAP, 1.5, 46.36, 1.5, 0.32, "W");
    P.barrel(b, m, 34.0, 48.9);
    P.barrel(b, m, 35.85, 48.9);
  }

  /* ---------- Dr. Rodham (E7 W) + Grant annex ---------- */
  {
    const r = LOTS.doctor;
    const d = streetDoor("doctor");
    shell(b, m.woodDoctor, r, 0, 4.4, {
      E: [doorGapOf(d), ...winGaps("doctor", "E")],
    });
    buildWindows(b, m, "doctor", m.woodDoctor);
    b.box(m.woodDoctor, r.maxX - WALL_T, 4.4, r.minZ, r.maxX + 0.04, 4.75, r.maxZ);
    flatRoof(b, m, r, 4.4);
    capFace(b, m.woodDark, r, "E", 4.75, m, 4.4);
    // brown board with cream letters over the door (E7 W)
    b.box(m.woodDark, r.maxX + 0.04, 3.18, 34.5, r.maxX + 0.1, 4.02, 37.5, { collide: false });
    b.decal(
      signMat(["DR. H. RODHAM", "Medical and Tonsorial Parlour"], 2.95, 0.84, { bg: "#4f382a", fg: "#e6dcba", border: "#33261a" }),
      r.maxX + 0.1 + DECOR_GAP,
      3.6,
      36.0,
      2.95,
      0.84,
      "E",
    );
    // boardwalk 1.7 m into the street, the barrel on it by the door
    P.boardwalkSlab(b, m, r.maxX, r.minZ, r.maxX + 1.7, r.maxZ, 0.15);
    P.barrel(b, m, r.maxX + 0.9, 34.4, 0.4, 0.9, 0.15);
    // north hoarding on Mission street: painted ads (D6 S view)
    const nz = r.minZ - DECOR_GAP;
    b.decal(signMat(["DR. H. RODHAM", "Medical and Tonsorial Parlour"], 3.6, 1.2, { bg: "#4f382a", fg: "#e6dcba" }), 45.6, 2.6, nz, 3.6, 1.2, "N");
    b.decal(posterMat("circus"), 41.9, 1.9, nz, 0.85, 1.15, "N");
    b.decal(posterMat("tonic"), 40.2, 2.2, nz, 0.85, 1.15, "N");

    // Grant annex on the west lane (E4 E): 4.5 m of tan boards, the GRANT
    // board, a tall brown door, the vegetable-compound bill, barrels
    const a = LOTS.doctorAnnex;
    shell(b, m.woodDoctor, a, 0, 4.5, {});
    flatRoof(b, m, a, 4.5);
    const ax = a.minX - DECOR_GAP;
    b.decal(signMat(["GRANT"], 1.3, 0.35, { bg: "#3c2c1c", fg: "#d8cba6" }), ax, 2.5, 32.85, 1.3, 0.35, "W");
    b.decal(signMat(["Medical and", "Tonsorial Parlour"], 1.6, 0.45, { bg: "#d8cba6", fg: "#4a3826", border: "#8a7a52" }), ax, 1.5, 34.5, 1.6, 0.45, "W");
    P.fakeDoor(b, m, a.minX, 0, 36.0, 1.7, 2.95, "W", { mat: m.woodMid });
    b.decal(
      signMat(["DEENA KAOUSIA'S", "VEGETABLE", "COMPOUND", "It's A Positive Cure"], 1.9, 1.1, { bg: "#d8cba6", fg: "#33261a", border: "#6b5b3c" }),
      ax,
      2.65,
      38.4,
      1.9,
      1.1,
      "W",
    );
    P.barrel(b, m, a.minX - 0.6, 33.4, 0.5, 1.0);
    P.crate(b, m, a.minX - 0.65, 35.0, 1.2, 0.6, 0.05, m.woodBlack);
    P.barrel(b, m, a.minX - 0.55, 38.0, 0.4, 0.95);
    P.barrel(b, m, a.minX - 0.9, 31.5, 0.4, 0.95);
  }

  /* ---------- Jail (L7 W): dark adobe, SHERIFF, tall door south of centre ---------- */
  {
    const r = LOTS.jail;
    const d = streetDoor("jail");
    const top = 3.9;
    shell(b, m.adobeJail, r, 0, top, {
      E: [doorGapOf(d), ...winGaps("jail", "E")],
      W: winGaps("jail", "W"),
    });
    buildWindows(b, m, "jail", m.adobeJail);
    flatRoof(b, m, r, top - 0.2, m.adobeJail);
    // vigas along the east + north faces (L7 W / K6 S)
    for (const vx of [41.2, 42.8, 44.4, 46.0, 47.4]) {
      const viga = new THREE.CylinderGeometry(0.13, 0.13, 0.3, 8);
      viga.rotateX(Math.PI / 2);
      viga.translate(vx, top - 0.38, r.minZ - 0.14);
      b.mesh(m.woodDark, viga);
    }
    const fx = r.maxX + DECOR_GAP;
    b.decal(signMat(["SHERIFF"], 1.65, 0.56, { bg: "#4a1f16", fg: "#efeadb", border: "#2a1109" }), fx, 2.0, 91.6, 1.65, 0.56, "E");
    b.decal(posterMat("wanted"), fx, 1.2, 92.2, 0.54, 0.85, "E");
    P.bench(b, m, r.maxX + 0.55, 91.2, 2.05, "E");
    P.spittoon(b, m, r.maxX + 0.8, 89.8, 0, 1.6);
    P.wallLantern(b, m, r.maxX, 1.6, 95.05, "E", 2.2);
    b.box(m.marble, r.maxX, 0, 92.6, r.maxX + 0.9, 0.12, 94.6); // stone stoop
    // a grey iron drum by the north corner (L7 W / K6 S)
    b.cyl(m.iron, 47.7, 87.6, 0, 0.62, 0.24, { seg: 10, collide: true });
    b.sphere(m.iron, 47.7, 0.62, 87.6, 0.24, 8);
    // brick chimney on the west end (M7 W)
    b.box(m.brickMayor, 40.6, top - 0.3, 92.2, 41.6, 5.5, 93.2, { collide: false });
    // west wall: the well-yard pickets (L5 E)
    P.picketFence(b, m, 38.9, 88.4, 38.9, 91.3, 1.5, m.woodMid, { slat: 0.16, gap: 0.1 });
    P.barrel(b, m, 37.9, 95.6);
    // north face on Day: wanted bills, a barrel, the DAY corner (K6 S / K7 W)
    b.decal(posterMat("wanted"), 41.4, 1.7, r.minZ - DECOR_GAP, 0.7, 0.95, "N");
    b.decal(posterMat("wanted2"), 43.6, 1.9, r.minZ - DECOR_GAP, 0.7, 0.95, "N");
    b.decal(posterMat("wanted"), 45.8, 1.85, r.minZ - DECOR_GAP, 0.7, 0.95, "N");
    P.barrel(b, m, 42.3, r.minZ - 0.7);
  }

  /* =========== MAIN STREET, EAST SIDE =========== */

  /* ---------- Stagecoach (H7 E): shallow office, low porch, hitch rail ---------- */
  {
    const r = LOTS.stage;
    const d = streetDoor("stage");
    shell(b, m.woodOffice, r, 0, 3.7, { W: [doorGapOf(d), ...winGaps("stage", "W")] });
    buildWindows(b, m, "stage", m.woodOffice);
    b.box(m.woodOffice, r.minX - 0.04, 3.7, r.minZ, r.minX + WALL_T, 5.6, r.maxZ);
    flatRoof(b, m, r, 3.7);
    capFace(b, m.woodDark, r, "W", 5.6, m, 3.7);
    const fx = r.minX - 0.04 - DECOR_GAP;
    // yellow letters on the dark false front, STAGECOACH board on the fascia (H7 E)
    b.decal(letters(["The Great Southwestern", "STAGECOACH Co."], 5.7, 1.15, "#d9b23c"), fx, 4.76, 59.9, 5.7, 1.15, "W");
    b.decal(letters(["POST OFFICE"], 0.7, 0.36, "#e6dcba"), r.minX + 0.12, 1.82, 58.55, 0.7, 0.36, "W", { audit: false });
    // porch: floor from 56.2, four square posts on 56.3, roof 3.55..3.8 with
    // the STAGECOACH board standing on the fascia
    const postX = 56.3;
    P.boardwalkSlab(b, m, postX - 0.1, r.minZ + 0.2, r.minX, r.maxZ - 0.1, 0.15);
    P.porchPosts(b, m, 0.15, 3.55, [
      [postX, 56.4],
      [postX, 58.3],
      [postX, 61.4],
      [postX, 63.4],
    ]);
    b.box(m.woodOffice, postX - 0.25, 3.55, r.minZ, r.minX, 3.8, r.maxZ, { collide: false });
    b.box(m.woodDark, postX - 0.22, 3.78, 59.35, postX - 0.14, 4.02, 61.65, { collide: false });
    b.decal(signMat(["STAGECOACH"], 2.2, 0.22, { bg: "#a3541d", fg: "#2c2014", border: "#6b3b12" }), postX - 0.22 - DECOR_GAP, 3.9, 60.5, 2.2, 0.22, "W");
    P.wallLantern(b, m, r.minX, 1.65, 61.0, "W", 2.2);
    // rough hitch rail on the street, the black planter, the bench under the north window
    P.hitchRail(b, m, 56.2, 60.8, 56.2, 63.6, 1.05);
    b.box(m.iron, 54.9, 0, 56.3, 56.2, 0.82, 58.0);
    P.bench(b, m, r.minX - 0.4, 57.2, 2.2, "W");
    // north face on Neely (G8 S / G7 E): the coach bills, a leaning wheel,
    // a brass pot, the company board on the porch roof's north edge
    const nz = r.minZ - DECOR_GAP;
    b.decal(
      signMat(["ASBESTOS, DRYROT", "AND SANTA FE", "~", "DAILY LINE OF", "COACHES.", "The Great Southwestern", "STAGECOACH Co."], 1.4, 2.0, {
        bg: "#d8cba6",
        fg: "#33261a",
        border: "#6b5b3c",
      }),
      62.5,
      2.55,
      nz,
      1.4,
      2.0,
      "N",
    );
    b.decal(signMat(["For Through", "Tickets Inquire", "Within"], 1.45, 0.5, { bg: "#5e1713", fg: "#e6dcba" }), 60.1, 2.35, nz, 1.45, 0.5, "N");
    b.decal(posterMat("wanted"), 60.4, 0.95, nz, 0.85, 0.85, "N");
    P.wagonWheel(b, m, 59.15, 0, r.minZ - 0.5, 0.95, 0.25);
    P.spittoon(b, m, 58.4, r.minZ - 0.8, 0, 1.6);
    b.box(m.woodDark, postX - 0.25, 3.17, r.minZ - 0.05, r.minX, 3.55, r.minZ + 0.05, { collide: false });
    b.decal(
      signMat(["The Great Southwestern", "STAGECOACH Co."], 1.25, 0.34, { bg: "#a3541d", fg: "#2c2014" }),
      (postX - 0.25 + r.minX) / 2,
      3.36,
      r.minZ - 0.05 - DECOR_GAP,
      1.25,
      0.34,
      "N",
    );
    // the warehouse behind, set back with a loading dock (G9 S / G10 S)
    const w = LOTS.stageWarehouse;
    solidBuilding(b, m, w, 5.4, m.barnDark, "flat");
    P.fakeDoor(b, m, 69.55, 1.0, w.minZ, 1.3, 2.1, "N", { mat: m.woodBlack });
    b.decal(signMat(["STAGE"], 1.5, 0.55, { bg: "#a3541d", fg: "#2c2014", border: "#6b3b12" }), 67.75, 3.67, w.minZ - DECOR_GAP, 1.5, 0.55, "N");
    b.box(m.woodDark, 64.0, 0, 57.8, w.maxX, 1.0, w.minZ);
    P.barrel(b, m, 66.0, 59.0, 0.36, 0.9, 1.0);
    P.barrel(b, m, 68.5, 59.0, 0.4, 0.95, 1.0);
    b.box(m.crateLight, 69.6, 1.0, 58.4, 70.4, 1.7, 59.4);
    b.box(m.crateLight, 70.6, 1.0, 58.6, 71.4, 1.6, 59.4);
    P.crate(b, m, 64.6, 56.9, 1.0, 0.9, 0.1, m.crateLight);
    P.crate(b, m, 66.1, 57.4, 0.9, 0.8, 0.3, m.crateLight);
    P.crate(b, m, 65.3, 55.9, 0.8, 0.7, 0.2, m.crateLight);
    b.decal(posterMat("notice"), r.maxX + DECOR_GAP, 2.6, 57.7, 1.2, 1.7, "E");
  }

  /* ---------- the grey house on Lee's west side (G10 S) ---------- */
  {
    const wh = LOTS.whiteHouse;
    solidBuilding(b, m, wh, 4.1, m.woodWatson, "flat", m.roofDark);
    const fx = wh.maxX + DECOR_GAP;
    P.boardwalkSlab(b, m, wh.maxX, wh.minZ, wh.maxX + 1.6, wh.maxZ + 0.6, 0.15);
    P.fakeDoor(b, m, wh.maxX, 0.15, 68.0, 1.45, 2.5, "E", { mat: m.woodDark });
    b.decal(posterMat("tonic"), fx, 2.1, 69.8, 1.0, 1.4, "E");
    b.decal(posterMat("circus"), fx, 1.6, 66.05, 0.8, 1.1, "E");
    b.decal(posterMat("notice"), fx, 1.9, 65.0, 1.0, 1.4, "E");
    P.barrel(b, m, wh.maxX + 0.65, 71.4, 0.5, 1.0, 0.15);
    P.barrel(b, m, wh.maxX + 0.6, 64.4, 0.45, 0.95, 0.15);
    P.crate(b, m, wh.maxX + 0.65, 64.9, 1.0, 0.6, 0.05, m.crateLight);
  }

  /* ---------- Watson's Apothecary (I7 E): pale boards, orange letters, deep boardwalk ---------- */
  {
    const r = LOTS.watson;
    const d = streetDoor("watson");
    shell(b, m.woodWatson, r, 0, 4.4, { W: [doorGapOf(d), ...winGaps("watson", "W")] });
    buildWindows(b, m, "watson", m.woodWatson);
    b.box(m.woodWatson, r.minX - 0.04, 4.4, r.minZ, r.minX + WALL_T, 6.4, r.maxZ);
    flatRoof(b, m, r, 4.4);
    capFace(b, m.woodDark, r, "W", 6.4, m, 4.4);
    const fx = r.minX - 0.04 - DECOR_GAP;
    b.decal(letters(["Watson's"], 4.2, 0.62, "#c96f1e", undefined, true), fx, 4.4, 67.9, 4.2, 0.62, "W");
    b.decal(letters(["APOTHECARY"], 7.0, 0.9, "#c96f1e", undefined, true), fx, 3.58, 67.95, 7.0, 0.9, "W");
    P.wallLantern(b, m, r.minX, 1.55, 69.35, "W", 2.2);
    // boardwalk right across the front, out to 55.5
    P.boardwalkSlab(b, m, 55.5, r.minZ + 0.1, r.minX, r.maxZ, 0.15);
    // the chalked A-board at the boardwalk's south edge (I7 E / J7 N)
    b.rotBox(m.woodBlack, 55.85, 1.1, 70.8, 0.08, 1.9, 0.9, 0, { rotZ: 0.2, collide: true });
    b.rotBox(m.woodBlack, 56.2, 1.1, 70.8, 0.08, 1.9, 0.9, 0, { rotZ: -0.2, collide: false });
    b.decal(
      signMat(["TONICS", "POWDERS", "CURES"], 0.8, 1.1, { bg: "#1c1712", fg: "#cfc4a6" }),
      55.62,
      1.25,
      70.8,
      0.8,
      1.1,
      "W",
    );
  }

  /* ---------- Bolivar's Dry Goods (J7 E): red letters on brown boards, log porch ---------- */
  {
    const r = LOTS.bolivar;
    const d = streetDoor("bolivar");
    shell(b, m.woodMid, r, 0, 4.75, { W: [doorGapOf(d)] });
    flatRoof(b, m, r, 4.75, m.roofDark);
    b.box(m.woodDark, r.minX - 0.3, 4.75, r.minZ - 0.15, r.minX + 0.42, 4.9, r.maxZ + 0.15, { collide: false });
    const fx = r.minX - DECOR_GAP;
    b.decal(letters(["BOLIVAR'S", "DRY GOODS"], 5.6, 1.25, "#d63a2c", undefined, true), fx, 4.28, 76.0, 5.6, 1.25, "W");
    // dark shop windows with arched white lettering on the glass (J7 E)
    for (const [wz, text] of [
      [73.5, "SUPERIOR DRY GOODS"],
      [78.1, "CHOICE GROCERIES"],
    ] as const) {
      b.box(m.woodDark, r.minX - 0.06, 1.2 - 0.08, wz - 1.0, r.minX - 0.02, 2.9 + 0.08, wz + 1.0, { collide: false });
      b.decal(signMat([text.split(" ")[0], text.split(" ").slice(1).join(" ")], 1.85, 1.7, { bg: "#0c0a08", fg: "#e8e0cc" }), r.minX - 0.06 - DECOR_GAP, 2.05, wz, 1.85, 1.7, "W");
    }
    b.decal(signMat(["OPEN"], 0.5, 0.3, { bg: "#efeadb", fg: "#33261a" }), fx, 2.95, 75.9, 0.5, 0.3, "W");
    // shallow porch: rough log posts on x 56.3, flat plank roof 3.28..3.6
    const postX = 56.3;
    for (const pz of [72.1, 74.8, 77.1, 79.7]) {
      b.cyl(m.woodDark, postX, pz, 0, 3.3, 0.13, { seg: 7, collide: true });
    }
    b.box(m.woodStage, postX - 0.3, 3.28, r.minZ - 0.2, r.minX, 3.6, r.maxZ + 0.2, { collide: false });
    // pans hung under the porch roof
    for (const [pz, py] of [
      [73.2, 2.75],
      [74.2, 2.95],
      [77.6, 2.8],
      [78.6, 2.95],
    ] as const) {
      b.rotBox(m.iron, postX + 0.3, py, pz, 0.06, 0.5, 0.5, 0, { collide: false });
      b.box(m.iron, postX + 0.28, py + 0.25, pz - 0.01, postX + 0.32, 3.28, pz + 0.01, { collide: false });
    }
    // porch clutter (J7 E): chair, brass pot, barrels, broom sack, box, milk cans, churn
    P.chair(b, m, r.minX - 0.45, 73.4, -Math.PI / 2);
    P.spittoon(b, m, r.minX - 0.5, 74.0, 0, 1.5);
    P.barrel(b, m, r.minX - 0.55, 74.9, 0.36, 0.9);
    P.sack(b, m, r.minX - 0.5, 77.4);
    b.cyl(m.woodDark, r.minX - 0.55, 77.4, 0, 1.75, 0.02, { seg: 5 });
    P.crate(b, m, r.minX - 0.6, 77.9, 0.55, 0.5, 0.1);
    b.cyl(m.white, r.minX - 0.5, 78.35, 0, 0.7, 0.16, { seg: 8 });
    P.barrel(b, m, r.minX - 0.55, 78.95, 0.3, 0.7);
    b.cyl(m.woodGray, r.minX - 0.45, 79.6, 0, 0.95, 0.27, { seg: 10, collide: true });
    b.cyl(m.woodGray, r.minX - 0.45, 79.6, 0.95, 1.1, 0.16, { seg: 8 });
    // the white sandwich board and the black crate at the north end
    b.rotBox(m.white, 55.4, 0.55, 72.3, 0.06, 1.1, 0.9, 0, { rotZ: -0.22, collide: true });
    b.rotBox(m.white, 55.7, 0.55, 72.3, 0.06, 1.1, 0.9, 0, { rotZ: 0.22, collide: false });
    P.crate(b, m, 55.9, 72.9, 0.7, 0.45, 0.1, m.woodBlack);
    // south face over the K7 alley (K7 E / K8 N): the name in red on the
    // boards, a CHOICE GROCERIES board at the corner, a porch of logs
    // along it with pans hung underneath
    b.decal(signMat(["Lumber Yard", "Out Back  ☞"], 1.6, 0.5, { bg: "#1c1712", fg: "#e6dcba" }), 59.9, 3.3, r.maxZ + DECOR_GAP, 1.6, 0.5, "S");
    b.decal(signMat(["CHOICE", "GROCERIES"], 1.6, 0.6, { bg: "#1c1712", fg: "#d8cba6", border: "#6b5b3c" }), 57.9, 2.7, r.maxZ + DECOR_GAP, 1.6, 0.6, "S");
    for (const px of [60.6, 63.4, 65.8]) {
      b.cyl(m.woodDark, px, r.maxZ + 1.5, 0, 3.0, 0.13, { seg: 7, collide: true });
    }
    b.box(m.woodStage, 59.8, 3.0, r.maxZ, 66.0, 3.3, r.maxZ + 1.7, { collide: false });
    for (const [px, py] of [
      [61.6, 2.7],
      [62.6, 2.85],
      [64.4, 2.75],
    ] as const) {
      b.rotBox(m.iron, px, py, r.maxZ + 1.2, 0.5, 0.5, 0.06, 0, { collide: false });
      b.box(m.iron, px - 0.01, py + 0.25, r.maxZ + 1.18, px + 0.01, 3.0, r.maxZ + 1.22, { collide: false });
    }
    P.barrel(b, m, 64.0, r.maxZ + 0.7, 0.4, 0.95);

    // east of the store a board fence with leaning planks closes the yard
    // to the white house; a small board and a barrel on the store's south
    // wall by it (K9 N / K8 E / K9 W)
    // (the yard fence stops at the street: Lee runs on south between the
    // mansion and the range, K10 N / J10 S)
    P.boardWall(b, m, 66.4, 80.2, 71.5, 80.2, 2.4, m.woodSaloon, -1);
    for (const [px, tilt] of [
      [68.8, 0.16],
      [69.25, 0.12],
      [71.0, 0.2],
      [71.4, 0.15],
    ] as const) {
      b.rotBox(m.woodDark, px, 1.55, 80.05, 0.24, 3.1, 0.05, 0, { rotZ: tilt, collide: false });
    }
    b.decal(posterMat("wanted"), 65.25, 2.65, r.maxZ + DECOR_GAP, 0.9, 1.3, "S");
    b.decal(signMat(["GONO", "MANS FRIEND"], 0.9, 0.45, { bg: "#efeadb", fg: "#241d16" }), 63.5, 1.08, r.maxZ + DECOR_GAP, 0.9, 0.45, "S");
    b.decal(posterMat("notice"), 61.3, 2.3, r.maxZ + DECOR_GAP, 0.5, 1.2, "S");
    P.barrel(b, m, 65.7, 81.2, 0.5, 1.1);
  }

  /* ---------- K7 east alley dressing ---------- */
  {
    P.saguaro(b, m, 88, 81.5, 2.6);

  }

  /* ---------- Curiosities (L7 E): black shop, red posts, red pagoda roof, tall sign ---------- */
  {
    const r = LOTS.curio;
    const d = streetDoor("curio");
    const top = 4.6;
    shell(b, m.woodBlack, r, 0, top, { W: [doorGapOf(d), ...winGaps("curio", "W")] });
    buildWindows(b, m, "curio", m.woodBlack);
    // the shop's own red hip roof shows over the south wall (N7 N / K7 S)
    b.box(m.woodBlack, r.minX + 0.2, top, r.minZ, r.maxX, top + 0.12, r.maxZ);
    P.hipRoof(b, r.minX + 0.3, r.minZ, r.maxX, r.maxZ, top, 5.55, m.curioRed);
    // the sign panel: a black false front to 6.1 carrying CURIOSITIES in red
    b.box(m.woodBlack, r.minX, top, r.minZ, r.minX + WALL_T, 6.1, r.maxZ);
    falseFrontBraces(b, m, r, "W", top + 0.18, 6.1);
    const fx = r.minX - DECOR_GAP;
    b.decal(letters(["CURIOSITIES"], 6.4, 0.82, "#c8302a"), fx, 4.75, 92.5, 6.4, 0.82, "W");
    // red window frames + the red door recess
    for (const wz of [89.2, 94.4]) {
      b.box(m.curioRed, r.minX - 0.06, 0.62, wz - 0.4, r.minX - 0.02, 2.88, wz - 0.31, { collide: false });
      b.box(m.curioRed, r.minX - 0.06, 0.62, wz + 0.31, r.minX - 0.02, 2.88, wz + 0.4, { collide: false });
      b.box(m.curioRed, r.minX - 0.06, 2.8, wz - 0.4, r.minX - 0.02, 2.88, wz + 0.4, { collide: false });
      b.box(m.curioRed, r.minX - 0.06, 0.62, wz - 0.4, r.minX - 0.02, 0.7, wz + 0.4, { collide: false });
    }
    b.box(m.curioRed, r.minX - 0.05, 0, d.z - 1.12, r.minX - 0.01, 3.4, d.z - 1.02, { collide: false });
    b.box(m.curioRed, r.minX - 0.05, 0, d.z + 1.02, r.minX - 0.01, 3.4, d.z + 1.12, { collide: false });
    b.box(m.curioRed, r.minX - 0.05, 3.3, d.z - 1.12, r.minX - 0.01, 3.4, d.z + 1.12, { collide: false });
    // red porch posts with black bases on x 56.5; a black fascia at 3.0 with
    // the small red name, the red pagoda slope rising to the wall behind it
    const postX = 56.5;
    for (const pz of [87.6, 90.15, 93.4, 95.2]) {
      b.box(m.woodBlack, postX - 0.14, 0, pz - 0.14, postX + 0.14, 0.35, pz + 0.14, { collide: true });
      b.box(m.curioRed, postX - 0.1, 0.35, pz - 0.1, postX + 0.1, 2.95, pz + 0.1, { collide: false });
    }
    b.box(m.woodBlack, postX - 0.3, 2.95, r.minZ - 0.6, r.minX, 3.07, r.maxZ + 0.6, { collide: false });
    b.box(m.woodBlack, postX - 0.42, 2.95, r.minZ - 0.7, postX - 0.3, 3.27, r.maxZ + 0.7, { collide: false });
    b.decal(letters(["+ CURIOSITIES +"], 4.2, 0.22, "#c8302a"), postX - 0.42 - DECOR_GAP, 3.11, 92.0, 4.2, 0.22, "W");
    {
      const run = r.minX - (postX - 0.36);
      const rise = 0.6;
      b.rotBox(m.curioRed, (postX - 0.36 + r.minX) / 2, 3.27 + rise / 2, 92.0, Math.hypot(run, rise), 0.12, r.maxZ - r.minZ + 1.4, 0, {
        rotZ: Math.atan2(rise, run),
        collide: false,
      });
    }
    for (const cz of [r.minZ - 0.75, r.maxZ + 0.75]) {
      b.rotBox(m.curioRed, postX - 0.3, 3.45, cz, 1.4, 0.15, 1.1, 0, { rotX: cz < 92 ? 0.55 : -0.55, collide: false });
    }
    // stool by the door, the wide pan on the ground at the north inner post
    P.stool(b, m, 58.0, 90.4, 0.55);
    b.cyl(m.iron, 56.9, 90.8, 0, 0.1, 0.42, { seg: 12 });
    // north face on the alley (K8 S / K7 E): plain black boards, three bills
    // and two barrels — no lettering
    b.decal(posterMat("girls"), 63.62, 2.45, r.minZ - DECOR_GAP, 1.25, 1.7, "N");
    b.decal(posterMat("manzana"), 62.45, 1.85, r.minZ - DECOR_GAP, 0.9, 1.5, "N");
    b.decal(posterMat("martash"), 60.0, 2.3, r.minZ - DECOR_GAP, 1.0, 1.45, "N");
    P.barrel(b, m, 61.7, r.minZ - 1.0, 0.42, 1.05);
    P.barrel(b, m, 59.1, r.minZ - 0.8, 0.4, 0.95);
  }

  /* ---------- the tall dark barn east of Curiosities + the board fence across Lee's end (K8 S / K9 S) ---------- */
  {
    const r = LOTS.rangeBarn;
    solidBuilding(b, m, r, 5.4, m.barnDark, "gableX", m.roofBrown, 1.8);
    b.decal(posterMat("girls"), 66.4, 2.5, r.minZ - DECOR_GAP, 0.9, 1.5, "N");
    b.decal(posterMat("wanted"), r.maxX + DECOR_GAP, 2.5, 90.2, 0.85, 1.15, "E");
    P.barrel(b, m, 64.6, r.minZ - 0.7);
    P.boardWall(b, m, r.maxX, 88.0, 72.4, 88.0, 2.55, m.fenceGray, 1);
    b.box(m.woodDark, 72.3, 0, 87.85, 72.6, 3.2, 88.15);
  }

  /* ---------- Cactus Bed Hotel (E7+F7 east): olive boards, arched door, sunburst sign ---------- */
  {
    const r = LOTS.hotel;
    const d = streetDoor("hotel");
    const top = 8.7;
    // the door gap runs up to the transom's head; the frame fills to 3.02
    // and the arched transom the rest
    const doorGap = { ...doorGapOf(d), top: 3.5 };
    shell(b, m.oliveHotel, r, 0, top, {
      W: [doorGap, ...winGaps("hotel", "W")],
      S: winGaps("hotel", "S"),
    });
    buildWindows(b, m, "hotel", m.oliveHotel);
    b.box(m.oliveHotel, r.minX - 0.04, top, r.minZ, r.maxX, top + 0.5, r.maxZ);
    flatRoof(b, m, r, top);
    b.box(m.woodDark, r.minX - 0.34, top + 0.5, r.minZ - 0.15, r.minX + 0.42, top + 0.66, r.maxZ + 0.15, { collide: false });
    b.box(m.woodDark, r.minX - 0.15, top + 0.5, r.maxZ - 0.42, r.maxX + 0.15, top + 0.66, r.maxZ + 0.34, { collide: false });
    const fx = r.minX - 0.04 - DECOR_GAP;
    // cream letters straight on the boards, a sunburst at each end (E7 E / F7 E)
    b.decal(letters(["CACTUS BED"], 8.5, 0.95, "#e3d9b8", undefined, true), fx, 4.55, 39.25, 8.5, 0.95, "W");
    b.decal(letters(["HOTEL"], 7.4, 0.75, "#e3d9b8", undefined, true), fx, 3.7, 39.1, 7.4, 0.75, "W");
    b.decal(m.sunFanN, fx, 4.2, 33.65, 1.55, 1.4, "W");
    b.decal(m.sunFanS, fx, 4.2, 44.6, 1.55, 1.4, "W");
    // the arched transom over the double door + dark surround
    P.archTransom(b, m, "z", d.z, d.width, d.y + d.height + 0.12, 3.2, 3.5, r.minX + WALL_T / 2, WALL_T, m.oliveHotel);
    b.box(m.woodBlack, r.minX - 0.1, 0, d.z - 1.42, r.minX - 0.02, 3.55, d.z - 1.28, { collide: false });
    b.box(m.woodBlack, r.minX - 0.1, 0, d.z + 1.28, r.minX - 0.02, 3.55, d.z + 1.42, { collide: false });
    P.wallLantern(b, m, r.minX, 1.6, 34.5, "W", 2.2);
    P.wallLantern(b, m, r.minX, 1.6, 37.7, "W", 2.2);
    // boardwalk from 55.7 with the potted saguaro, barrel, crate, chair and pumpkin
    P.boardwalkSlab(b, m, 55.7, r.minZ + 0.2, r.minX, r.maxZ + 1.7, 0.15);
    b.cyl(m.brickMayor, 56.6, 33.1, 0.15, 0.55, 0.3, { rTop: 0.36, seg: 8, collide: true });
    b.cyl(m.cactus, 56.6, 33.1, 0.55, 1.5, 0.2, { seg: 7 });
    b.sphere(m.cactus, 56.6, 1.5, 33.1, 0.2, 7);
    b.cyl(m.cactusDark, 56.6, 32.85, 0.9, 1.3, 0.11, { seg: 6 });
    b.sphere(m.cactusDark, 56.6, 1.3, 32.85, 0.11, 6);
    b.cyl(m.cactusDark, 56.6, 33.36, 1.0, 1.25, 0.1, { seg: 6 });
    b.sphere(m.cactusDark, 56.6, 1.25, 33.36, 0.1, 6);
    P.barrel(b, m, 57.05, 43.2, 0.48, 1.2, 0.15);
    P.crate(b, m, 57.1, 44.8, 1.0, 0.95, 0.05, m.crateLight);
    b.sphere(m.pumpkin, 56.7, 0.4, 46.1, 0.24, 8);
    P.hitchRail(b, m, 55.7, 37.8, 55.7, 41.3, 1.1);
    // south porch along Neely (G8 N / G9 N / F7 E): 2 m deep, roof 3.5..3.85,
    // posts on the 48.0 line wrapping the SW corner, benches and brass pots
    P.boardwalkSlab(b, m, 56.3, r.maxZ, r.maxX + 0.3, r.maxZ + 1.7, 0.15);
    P.porchPosts(b, m, 0.15, 3.5, [
      [56.4, 48.0],
      [57.9, 48.0],
      [64.6, 48.0],
      [71.3, 48.0],
    ]);
    b.box(m.woodDark, 56.25, 3.5, r.maxZ, r.maxX + 0.25, 3.85, r.maxZ + 1.8, { collide: false });
    P.chair(b, m, 58.2, r.maxZ + 0.45, Math.PI, 0.15);
    P.spittoon(b, m, 60.0, r.maxZ + 1.0, 0.15, 1.6);
    P.spittoon(b, m, 64.7, r.maxZ + 1.0, 0.15, 1.6);
    P.spittoon(b, m, 67.4, r.maxZ + 1.0, 0.15, 1.6);
    P.bench(b, m, 61.8, r.maxZ + 0.55, 2.0, "N");
    P.bench(b, m, 66.5, r.maxZ + 0.55, 2.0, "N");

    // the porch's east end on Lee (F10 W / G10 N): HOTEL in gold on a board
    // under the roof's east edge, the price board and two crates on the wall
    b.box(m.woodDark, r.maxX + 0.15, 2.62, 47.1, r.maxX + 0.21, 2.98, 48.9, { collide: false });
    b.decal(letters(["HOTEL"], 1.7, 0.32, "#dfb44e"), r.maxX + 0.21 + DECOR_GAP, 2.8, 48.0, 1.7, 0.32, "E");
    b.decal(
      signMat(["CACTUS BED", "HOTEL", "Rooms from", "$1 a Night,", "Long Term", "Lodging", "Available"], 1.4, 2.3, { bg: "#2a2418", fg: "#c9a441", border: "#141008" }),
      r.maxX + DECOR_GAP,
      2.85,
      43.7,
      1.4,
      2.3,
      "E",
    );
    P.crate(b, m, r.maxX + 0.55, 44.3, 0.9, 0.9, 0.05, m.crateLight);
    P.crate(b, m, r.maxX + 0.65, 43.2, 1.1, 1.1, 0.1, m.crateLight);
  }

  /* ---------- Mission street's north side east of the mission: rail fence and corral (D7 E / D10 N / E10 N) ---------- */
  {
    P.railFence(b, m, 64.8, 23.2, 79.8, 23.2, 3, 2.0, m.woodStage);
  }

  /* ---------- Mission (terminates the north view) ---------- */
  {
    const r = LOTS.mission;
    const d = streetDoor("mission");
    const wingTop = 4.8;
    const frontTop = 6.55;
    // the whole front is one 7 m wall (E7 N / F7 N); wings behind are lower
    // the front wall east of x 41.5 is one 7 m wall on the lot edge (E7 N /
    // F7 N); the west wing steps 1.4 m forward under a red tile hip roof
    // (D6 N / D7 W / G3 N) and the east wing behind rises to 7.5
    const wingX = 41.5;
    const wingFront = r.maxZ + 1.4;
    wallX(b, m.adobeMission, wingX, r.maxX, r.maxZ - 0.25, 0, frontTop, [doorGapOf(d, 0.04), { from: 51.3, to: 52.5, top: frontTop, bottom: 5.75 }], 0.5);
    wallX(b, m.adobeMission, r.minX, wingX + 0.5, wingFront - 0.25, 0, frontTop, [], 0.5);
    wallZ(b, m.adobeMission, r.maxZ - 0.5, wingFront, wingX + 0.25, 0, frontTop, [], 0.5);
    b.box(m.adobeJail, wingX + 0.5, frontTop, r.maxZ - 0.5, r.maxX, frontTop + 0.4, r.maxZ - 0.1, { collide: false });
    b.box(m.adobeMission, wingX + 0.5, frontTop + 0.4, r.maxZ - 0.55, r.maxX, frontTop + 0.65, r.maxZ + 0.05, { collide: false });
    P.gableRoof(b, m, r.minX - 0.2, r.minZ + 6.0, wingX + 0.4, wingFront + 0.2, frontTop, 8.35, "z", m.tileRed, m.adobeMission);
    b.box(m.adobeMission, 59.5, wingTop, r.minZ + 0.3, r.maxX - 0.3, 7.05, r.maxZ - 0.5, { collide: false });
    // west + east + north outer walls (the padre's window west, the
    // schoolhouse's two arched windows north)
    wallZ(b, m.adobeMission, r.minZ, r.maxZ, r.minX, 0, wingTop, winGaps("padre", "W"), 0.5);
    wallZ(b, m.adobeMission, r.minZ, r.maxZ, r.maxX, 0, wingTop, [], 0.5);
    wallX(b, m.adobeMission, r.minX, r.maxX, r.minZ, 0, wingTop, winGaps("school", "N"), 0.5);
    buildWindows(b, m, "school", m.adobeMission);
    buildWindows(b, m, "padre", m.adobeMission);
    // the curved bell-gable over the doors, an open niche with the bell, the cross
    P.espadana(b, m, 51.9, r.maxZ - 0.5, 0.52, 5.65, 9.15, 6.8, 2.6, { niche: [1.2, 5.75, 7.45] });
    b.box(m.woodDark, 51.83, 9.15, r.maxZ - 0.33, 51.97, 10.85, r.maxZ - 0.17, { collide: false });
    b.box(m.woodDark, 51.35, 10.15, r.maxZ - 0.33, 52.45, 10.3, r.maxZ - 0.17, { collide: false });
    P.bell(b, m, 51.9, 6.3, r.maxZ - 0.25, 0.26);
    // dark lintel beam sitting on the door head, the big carved sun discs either side
    b.box(m.woodBlack, d.x - 2.95, 4.52, r.maxZ - 0.35, d.x + 2.95, 4.8, r.maxZ + 0.14, { collide: false });
    P.sunDisc(b, m, 48.0, 2.75, r.maxZ, "S", 0.82);
    P.sunDisc(b, m, 55.7, 2.75, r.maxZ, "S", 0.82);
    // pots on the parapet just east of the gable (E7 N)
    for (const px of [55.8, 57.1, 58.4]) {
      b.cyl(m.brickMayor, px, r.maxZ - 0.25, frontTop, frontTop + 0.75, 0.26, { rTop: 0.32, seg: 8 });
    }
    // MISSION board on its post east of the doors, the bill, the corner lamp (E7 N / D7 E)
    {
      const px = 56.7;
      const pz = 24.0;
      b.box(m.woodDark, px - 0.1, 0, pz - 0.1, px + 0.1, 3.7, pz + 0.1);
      // a board on a yaw: box + lettered planes both sides (the audit sees only axis-aligned decals)
      const hung = (mat: THREE.Material, cx: number, cy: number, cz: number, w: number, h: number, yaw: number, t: number): void => {
        b.rotBox(m.woodSaloon, cx, cy, cz, w, h, t, yaw, { collide: false });
        const nx = Math.sin(yaw);
        const nz = Math.cos(yaw);
        for (const side of [1, -1]) {
          const g = new THREE.PlaneGeometry(w, h);
          g.rotateY(side > 0 ? yaw : yaw + Math.PI);
          g.translate(cx + side * nx * (t / 2 + DECOR_GAP), cy, cz + side * nz * (t / 2 + DECOR_GAP));
          b.mesh(mat, g);
        }
      };
      // MISSION: 2.4 m of tan board running ENE from the post, its face turned toward the E7 approach
      const yawM = 0.45;
      const alongM = [Math.cos(yawM), -Math.sin(yawM)];
      hung(signMat(["MISSION"], 2.4, 0.5, { bg: "#c8a868", fg: "#3a2a18", border: "#5a4020" }), px + alongM[0] * 1.3, 3.3, pz + alongM[1] * 1.3, 2.4, 0.5, yawM, 0.06);
      // the "santa marta" arm reaches south-west 2 m from the post at 2.85; its
      // two-sided board hangs under the outer half (D7 E / D8 N)
      const yawS = Math.PI / 4;
      const alongS = [-Math.cos(yawS), Math.sin(yawS)];
      const armLen = 2.0;
      b.rotBox(m.woodDark, px + alongS[0] * armLen / 2, 2.85, pz + alongS[1] * armLen / 2, armLen + 0.1, 0.14, 0.14, yawS, { collide: false });
      for (const dd of [0.6, 1.85]) {
        b.rotBox(m.woodDark, px + alongS[0] * dd, 2.68, pz + alongS[1] * dd, 0.04, 0.24, 0.04, yawS, { collide: false });
      }
      hung(signMat(["santa marta"], 1.5, 0.45, { bg: "#2a2218", fg: "#dfb44e" }), px + alongS[0] * 1.22, 2.33, pz + alongS[1] * 1.22, 1.5, 0.45, yawS, 0.06);
    }
    b.decal(posterMat("wanted"), 61.2, 2.98, r.maxZ + DECOR_GAP, 1.1, 1.9, "S");
    P.lampPost(b, m, 55.65, 31.1, 3.65);
    P.streetSign(b, m, 55.65, 31.1, 2.45, ["MISSION", "MAIN"], "NW");
    // pots, bowls and broken crocks at the wall foot (E7 N / D7 N / D6 N)
    for (const [px, pz, pr] of [
      [42.2, wingFront + 0.4, 0.2],
      [43.6, r.maxZ + 0.4, 0.25],
      [45.3, r.maxZ + 0.4, 0.18],
      [46.1, r.maxZ + 0.4, 0.3],
      [47.4, r.maxZ + 0.4, 0.2],
      [55.2, r.maxZ + 0.4, 0.2],
      [58.4, r.maxZ + 0.4, 0.22],
    ] as const) {
      b.cyl(m.terracotta, px, pz, 0, pr * 1.2, pr * 1.3, { rTop: pr * 1.7, seg: 9 });
    }
    b.rotBox(m.terracotta, 41.4, 0.16, r.maxZ + 3.2, 0.7, 0.3, 0.45, 0.6, { rotZ: 0.4, collide: false });
    b.rotBox(m.bone, 43.0, 0.05, r.maxZ + 2.4, 0.4, 0.05, 0.08, 0.3, { collide: false });
    // bell gantry before the west wing (D5 N / E4 N): two posts, a beam
    // at 4.2 m, one big bell between two small ones
    b.box(m.woodDark, 34.4, 0, wingFront + 1.05, 34.7, 4.4, wingFront + 1.35);
    b.box(m.woodDark, 38.45, 0, wingFront + 1.05, 38.75, 4.4, wingFront + 1.35);
    b.box(m.woodDark, 34.2, 4.1, wingFront + 1.05, 38.95, 4.4, wingFront + 1.35, { collide: false });
    P.bell(b, m, 36.6, 3.15, wingFront + 1.2, 0.68);
    P.bell(b, m, 35.1, 3.1, wingFront + 1.2, 0.45);
    P.bell(b, m, 38.1, 3.1, wingFront + 1.2, 0.45);
    // iron cage cart by the west wing (D4 N / E4 N views)
    {
      const cx = 27.3;
      const cz = 24.7;
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
    // bell tower with its onion dome at the north-west, 21 m to the top
    // (F7 N / G7 N put it at (39, -3.4))
    {
      const tx = 39;
      const tz = -3.4;
      b.box(m.adobeMission, tx - 2.8, wingTop, tz - 2.8, tx + 2.8, 14.5, tz + 2.8, { collide: false });
      b.box(m.tileRed, tx - 3.1, 14.5, tz - 3.1, tx + 3.1, 14.9, tz + 3.1, { collide: false });
      b.box(m.adobeMission, tx - 2.2, 14.9, tz - 2.2, tx + 2.2, 16.8, tz + 2.2, { collide: false });
      for (const f of ["N", "S", "E", "W"] as const) {
        const off = 2.21;
        const dx = f === "E" ? off : f === "W" ? -off : 0;
        const dz = f === "S" ? off : f === "N" ? -off : 0;
        b.decal(signMat([""], 1.0, 1.5, { bg: "#241d16", fg: "#241d16" }), tx + dx, 15.85, tz + dz, 1.0, 1.5, f);
      }
      P.bell(b, m, tx, 15.5, tz, 0.3);
      b.cyl(m.adobeMission, tx, tz, 16.8, 17.4, 2.6, { seg: 14 });
      b.sphere(m.cream, tx, 18.4, tz, 3.0, 14);
      b.cyl(m.cream, tx, tz, 20.8, 21.4, 0.5, { rTop: 0.3, seg: 8 });
      b.box(m.woodDark, tx - 0.08, 21.4, tz - 0.08, tx + 0.08, 22.5, tz + 0.08, { collide: false });
      b.box(m.woodDark, tx - 0.4, 22.0, tz - 0.08, tx + 0.4, 22.15, tz + 0.08, { collide: false });
    }
  }

  /* =========== NEELY STREET WEST =========== */

  /* ---------- Sidewinder (G1 S): dark brown storefront, barber pole, coffins ---------- */
  {
    const r = LOTS.sidewinder;
    const d = streetDoor("sidewinder");
    shell(b, m.woodSaloon, r, 0, 3.6, { N: [doorGapOf(d), ...winGaps("sidewinder", "N")] });
    buildWindows(b, m, "sidewinder", m.woodSaloon);
    b.box(m.woodSaloon, r.minX, 3.6, r.minZ - 0.04, r.maxX, 4.6, r.minZ + WALL_T);
    flatRoof(b, m, r, 3.6);
    capFace(b, m.woodDark, r, "N", 4.6, m, 3.6);
    const fz = r.minZ - 0.04 - DECOR_GAP;
    b.decal(
      signMat(["HIRAM SIDEWINDER", "Undertaking & Barbering"], 6.8, 0.9, { bg: "#6b4a2e", fg: "#efe6cc", border: "#3a2416" }),
      3.7,
      3.78,
      fz,
      6.8,
      0.9,
      "N",
    );
    P.boardwalkSlab(b, m, r.minX, r.minZ - 1.9, r.maxX, r.minZ, 0.15);
    P.barberPole(b, m, 7.65, 55.4, 3.4);
    // the price board and the coffins on the east side (G2 S)
    b.decal(
      signMat(["HAIR CUTS 25¢", "SHAVE 25¢", "HEADSTONES $5", "PLOTS $10"], 1.4, 1.4, { bg: "#22301f", fg: "#d8e0b0", border: "#101810" }),
      r.maxX + DECOR_GAP,
      2.33,
      58.1,
      1.4,
      1.4,
      "E",
    );
    P.coffin(b, m, 10.6, 56.6, 0);
    P.coffin(b, m, 9.4, 57.0, 0.2, true);
    P.barrel(b, m, 10.7, 63.3);
    // black shed behind (G2 S / G3 W)
    solidBuilding(b, m, { minX: 1, minZ: 65.5, maxX: 7, maxZ: 70 }, 2.8, m.woodBlack, "gableX", m.roofDark, 1.2);
  }

  /* ---------- The Rattler (H4 W): grey-green office 2.4 m behind a deep porch, poster wall ---------- */
  {
    const r = LOTS.rattler;
    const d = streetDoor("rattler");
    const top = 5.0;
    shell(b, m.rattlerGreen, r, 0, top, { E: [doorGapOf(d), ...winGaps("rattler", "E")] });
    buildWindows(b, m, "rattler", m.rattlerGreen);
    // the east false front rises to 6.0 with white letters straight on the boards (H4 W / G4 S)
    b.box(m.rattlerGreen, r.maxX - WALL_T, top, r.minZ, r.maxX + 0.04, 6.0, r.maxZ);
    flatRoof(b, m, r, top);
    capFace(b, m.woodDark, r, "E", 6.0, m, top);
    const fx = r.maxX + 0.04 + DECOR_GAP;
    // dark corner boards flank the storefront
    for (const cz of [r.minZ + 0.16, r.maxZ - 0.16]) {
      b.box(m.woodDark, r.maxX - 0.02, 0, cz - 0.16, r.maxX + 0.08, top, cz + 0.16, { collide: false });
    }
    // porch: boardwalk 2.4 m deep, roof 2.9..3.1 on two posts a metre in from
    // its ends, and a green panel 3.1..4.45 across its front carrying every
    // line of lettering — PERIODICALS, The Rattler, the editor, WE PRINT
    // ANYTHING (H4 W / G4 S / G3 S)
    const px = r.maxX + 2.4;
    P.boardwalkSlab(b, m, r.maxX, r.minZ, px, r.maxZ, 0.15);
    P.porchPosts(b, m, 0.15, 2.9, [
      [px - 0.15, r.minZ + 1.1],
      [px - 0.15, r.maxZ - 1.0],
    ]);
    b.box(m.rattlerGreen, r.maxX, 2.9, r.minZ - 0.05, px + 0.1, 3.1, r.maxZ + 0.05, { collide: false });
    b.box(m.rattlerGreen, px - 0.02, 3.1, r.minZ - 0.05, px + 0.1, 4.3, r.maxZ + 0.05, { collide: false });
    b.box(m.woodDark, px - 0.06, 4.25, r.minZ - 0.1, px + 0.14, 4.37, r.maxZ + 0.1, { collide: false });
    const pfx = px + 0.1 + DECOR_GAP;
    b.decal(letters(["PERIODICALS and PRINTING"], 2.6, 0.2, "#e8e2d2"), fx, 4.6, 60.0, 2.6, 0.2, "E");
    b.decal(letters(["The Rattler"], 2.9, 0.34, "#e8e2d2", "'Old English Text MT', 'UnifrakturMaguntia', Georgia, serif"), pfx, 4.13, 60.0, 2.9, 0.34, "E");
    b.decal(letters(["Chott Flippo, Editor"], 2.4, 0.16, "#e8e2d2"), pfx, 3.87, 60.0, 2.4, 0.16, "E");
    b.decal(letters(["WE PRINT", "ANYTHING"], 2.6, 0.7, "#e8e2d2"), pfx, 3.42, 60.0, 2.6, 0.7, "E");
    // THE NEWS TODAY pinned inside the south pane, the brass pot by the door,
    // the hitch rail out on the street
    b.decal(
      signMat(["THE NEWS TODAY", "The Rattler  5¢"], 1.5, 1.7, { bg: "#ddd2b0", fg: "#241d16", border: "#8a7a52" }),
      fx,
      1.62,
      58.4,
      1.5,
      1.7,
      "E",
      { audit: false },
    );
    P.spittoon(b, m, r.maxX + 1.7, 61.4, 0.15, 1.6);
    P.hitchRail(b, m, px + 0.9, 57.0, px + 0.9, 58.6, 1.15);
    // the two-rail fence running west along 64.5 south of the porch and the
    // wagon behind it (H4 W / G4 S)
    P.railFence(b, m, 19.7, 64.5, 24.7, 64.5, 2, 1.4);
    // the poster wall on Neely (G3 S / G2 S): Manzana, Martash, REPENT,
    // the Winter Girls and a wanted bill, crates and barrels before it
    const nz = r.minZ - DECOR_GAP;
    b.decal(posterMat("manzana"), 20.85, 2.45, nz, 1.4, 1.8, "N");
    b.decal(posterMat("martash"), 19.45, 2.85, nz, 1.3, 2.0, "N");
    b.decal(posterMat("repent"), 18.3, 2.25, nz, 1.0, 1.7, "N");
    b.decal(posterMat("girls"), 16.8, 2.65, nz, 1.4, 1.8, "N");
    b.decal(posterMat("wanted"), 15.3, 2.45, nz, 0.95, 1.35, "N");
    P.crate(b, m, 21.05, 55.3, 1.1, 1.0, 0.05, m.crateLight);
    b.box(m.woodBlack, 20.85, 1.0, 55.1, 21.25, 1.55, 55.5);
    P.crate(b, m, 20.05, 55.3, 0.9, 0.94, 0.0, m.crateLight);
    P.barrel(b, m, 18.15, 55.5, 0.35, 0.94);
    P.barrel(b, m, 16.85, 55.4, 0.5, 1.17);
  }

  /* ---------- behind the Rattler: rock-city shed, outhouse, cart, hide ---------- */
  {
    const r = LOTS.rockCityShed;
    solidBuilding(b, m, r, 3.4, m.woodGray, "gableX", m.roofDark, 0.5);
    b.decal(letters(["SEE", "ROCK", "CITY"], 1.7, 1.5, "#e8e2d2"), 12.4, 2.35, r.minZ - DECOR_GAP, 1.7, 1.5, "N");
    P.fakeDoor(b, m, 13.6, 0, r.maxZ, 1.2, 2.2, "S", { mat: m.woodGray });
    // the yard fences: north-south along the lane, east-west across its head (J4 W / K3 W)
    P.railFence(b, m, 24.7, 64.5, 24.7, 82.0, 2, 1.4);
    P.hitchRail(b, m, 17.0, 82.0, 22.5, 82.0, 1.2);
    // outhouse
    b.box(m.barnDark, 8.9, 0, 66.4, 10.1, 2.5, 67.6);
    b.cone(m.roofDark, 9.5, 67, 2.5, 2.9, 0.95, 4);
    P.fakeDoor(b, m, 9.5, 0, 67.6, 0.7, 1.8, "S", { mat: m.woodGray });
    // two-wheel canopy cart in the yard (J4 W)
    P.tipCart(b, m, 20.5, 71.0, 0.35);
  }

  /* ---------- Shady Acres cemetery ---------- */
  {
    const r = LOTS.cemetery;
    // film G2 N / G4 W: tall pointed pickets on Neely, a three-rail fence
    // up the lane side with a heavy timber post on the corner
    const fence = (x0: number, z0: number, x1: number, z1: number): void => {
      P.picketFence(b, m, x0, z0, x1, z1, 1.75, m.woodSaloon, { slat: 0.09, gap: 0.4, pointed: true, postEvery: 2.6 });
    };
    fence(r.minX, r.maxZ, r.maxX, r.maxZ); // south, along Neely
    fence(r.minX, r.minZ, r.minX, r.maxZ); // west, far out in the desert
    // the yard is open to the north (D4 W); the lane side carries pickets
    // north of the gate and rails south of it, with a heavy corner post
    fence(r.maxX, r.minZ, r.maxX, 31.0);
    P.railFence(b, m, r.maxX, 31.0, r.maxX, 33.5, 3, 1.75, m.woodSaloon);
    P.railFence(b, m, r.maxX, 39.5, r.maxX, r.maxZ, 3, 1.75, m.woodSaloon);
    b.box(m.woodSaloon, r.maxX - 0.2, 0, r.maxZ - 0.2, r.maxX + 0.2, 2.7, r.maxZ + 0.2);
    b.box(m.brickMayor, r.maxX - 0.3, 0, r.minZ - 0.3, r.maxX + 0.3, 1.6, r.minZ + 0.3);
    b.cyl(m.woodDark, r.maxX, r.minZ, 1.6, 1.95, 0.2, { rTop: 0.24, seg: 8 });
    b.cyl(m.cactus, r.maxX, r.minZ, 1.95, 2.9, 0.09, { seg: 6 });
    // the SHADY ACRES gate frame (F4 N): posts to 4 m, the board at 2.9..3.45, the skull on the beam
    b.box(m.woodDark, r.maxX - 0.16, 0, 33.2, r.maxX + 0.16, 4.8, 33.52);
    b.box(m.woodDark, r.maxX - 0.16, 0, 39.48, r.maxX + 0.16, 4.8, 39.8);
    b.box(m.woodDark, r.maxX - 0.2, 4.55, 32.9, r.maxX + 0.2, 4.8, 40.1, { collide: false });
    for (const hz of [33.9, 38.3]) {
      b.box(m.iron, r.maxX - 0.02, 4.5, hz - 0.02, r.maxX + 0.02, 4.55, hz + 0.02, { collide: false });
    }
    b.box(m.woodSaloon, r.maxX - 0.08, 3.65, 33.5, r.maxX + 0.08, 4.5, 38.7, { collide: false });
    b.decal(signMat(["SHADY ACRES"], 5.2, 0.85, { bg: "#33261a", fg: "#efeadb", tight: true }), r.maxX + 0.08 + DECOR_GAP, 4.08, 36.1, 5.2, 0.85, "E");
    b.decal(signMat(["SHADY ACRES"], 5.2, 0.85, { bg: "#33261a", fg: "#efeadb", tight: true }), r.maxX - 0.08 - DECOR_GAP, 4.08, 36.1, 5.2, 0.85, "W");
    P.oxSkull(b, m, r.maxX, 34.0, 4.9, 0.2);
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
      // the yard runs far out west (E3 W / G1 N)
      [-2.5, 30.5, "granite", ["JOHN", "DOE"], "E", 0],
      [-6.0, 34.0, "slate", ["HERE LIES", "A STRANGER", "1878"], "E", 0.03],
      [-10.5, 31.0, "cross", undefined, "E", -0.04],
      [-14.0, 36.5, "granite", ["MARY", "ELLEN", "1880"], "E", 0],
      [-18.5, 33.0, "slate", ["SHOT", "IN A", "FAIR FIGHT", "1879"], "E", 0.05],
      [-8.0, 41.5, "wood", ["A", "MINER", "1877"], "E", -0.06],
      [-16.0, 42.0, "cross", undefined, "E", 0.02],
      [-3.5, 44.5, "granite", ["DIED", "1882"], "N", 0],
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
    P.deadTree(b, m, 4.5, 36.0, 10);
    P.saguaro(b, m, 21.4, 30.2, 2.6);
    P.saguaro(b, m, 1.9, 34.8, 3.4);
    P.saguaro(b, m, 14.6, 29.6, 2.2);
    P.saguaro(b, m, -9.0, 27.5, 3.6);
    P.saguaro(b, m, -20.0, 38.0, 3.0);
  }

  /* ---------- Neely west end: the wagon and coffins outside Sidewinder's (G1 W / G4 W) ---------- */
  {
    P.wagon(b, m, -0.5, 51.9, Math.PI / 2, m.woodDark);
    P.coffin(b, m, 0.1, 54.95, Math.PI / 2);
    // (no pump or trough in the lane: E4 S / G4 N film it empty)
    P.railFence(b, m, 24, 40, 24, 47.5, 3, 1.25);
    P.railFence(b, m, 24, 47.5, 22.5, 47.5, 3, 1.25);
  }

  /* =========== LEE STREET / EAST =========== */

  /* ---------- Livery (F10 E): pale boards, gold LIVERY board, red roof ---------- */
  {
    const r = LOTS.livery;
    const d = streetDoor("livery");
    shell(b, m.woodStage, r, 0, 3.8, { W: [doorGapOf(d), ...winGaps("livery", "W")] });
    buildWindows(b, m, "livery", m.woodStage);
    b.box(m.woodStage, r.minX - 0.04, 3.8, r.minZ, r.minX + WALL_T, 5.5, r.maxZ);
    P.gableRoof(b, m, r.minX, r.minZ, r.maxX, r.maxZ, 3.8, 5.6, "x", m.roofRed, m.woodStage);
    capFace(b, m.woodDark, r, "W", 5.5, m, 3.8);
    b.box(m.woodBlack, r.minX - 0.1, 3.3, 42.35, r.minX - 0.04, 4.2, 45.25, { collide: false });
    b.decal(signMat(["LIVERY"], 2.9, 0.9, { bg: "#3a3814", fg: "#c8a84a", border: "#26240c" }), r.minX - 0.1 - DECOR_GAP, 3.75, 43.8, 2.9, 0.9, "W");
    P.lampPost(b, m, 80.0, 47.8, 3.65);
    // hay, crates, barrels and the milk can out front (G10 N)
    P.sack(b, m, r.minX - 0.8, 46.3);
    P.sack(b, m, r.minX - 1.3, 46.7);
    P.sack(b, m, r.minX - 0.95, 47.1, 0.4);
    P.barrel(b, m, r.minX - 0.4, 47.6);
    P.barrel(b, m, r.minX + 0.3, 48.7);
    P.crate(b, m, r.minX - 0.8, 42.7, 0.85, 0.7, 0.15);
    P.crate(b, m, r.minX - 1.1, 43.4, 0.6, 0.5, 0.3);
    b.cyl(m.white, r.minX - 1.3, 41.5, 0, 0.55, 0.16, { seg: 8 }); // milk can
    // south face over the G11 alley: two bills and a long rough table
    b.decal(posterMat("girls"), 82.5, 2.5, r.maxZ + DECOR_GAP, 1.06, 1.6, "S");
    b.decal(posterMat("wanted"), 88.3, 2.3, r.maxZ + DECOR_GAP, 0.8, 1.05, "S");
    b.decal(posterMat("manzana"), 89.8, 2.35, r.maxZ + DECOR_GAP, 0.9, 1.2, "S");
    b.box(m.woodDark, 81.0, 1.0, r.maxZ + 0.6, 84.1, 1.1, r.maxZ + 1.1);
    for (const lx of [81.2, 82.55, 83.9]) {
      b.box(m.woodDark, lx - 0.05, 0, r.maxZ + 0.8, lx + 0.05, 1.0, r.maxZ + 0.9, { collide: false });
    }
    P.barrel(b, m, 80.2, r.maxZ + 1.0);
    // the rail fence and gate closing Neely's east end (G10 E / G11 E)
    P.railFence(b, m, 88, 47.5, 88, 50.0, 3, 1.95, m.woodStage);
    P.railFence(b, m, 88, 53.3, 88, 56.5, 3, 1.95, m.woodStage);
    for (const gz of [50.0, 53.3]) {
      b.box(m.woodStage, 87.85, 0, gz - 0.15, 88.15, 2.3, gz + 0.15);
    }
    P.railFence(b, m, 88.15, 53.3, 91.3, 53.3, 3, 1.75, m.woodStage); // the leaf, swung open eastward
  }

  /* ---------- mayor compound: pillar fence, iron gate, mansion ---------- */
  {
    const f = LOTS.mayorFence;
    const gate = streetDoor("mayor");
    const pillar = (px: number, pz: number): void => {
      b.box(m.brickMayor, px - 0.385, 0, pz - 0.385, px + 0.385, 3.5, pz + 0.385);
      b.box(m.white, px - 0.47, 3.5, pz - 0.47, px + 0.47, 3.68, pz + 0.47, { collide: false });
      b.cone(m.white, px, pz, 3.68, 3.95, 0.62, 4, Math.PI / 4);
    };
    // west run on the Lee street line with the gate opening (I10 E pose)
    const gz0 = gate.z - gate.width / 2 - 0.45;
    const gz1 = gate.z + gate.width / 2 + 0.45;
    const westPosts = [f.minZ, 59.3, 62.5, gz0, gz1, 73.1, 76.8, f.maxZ];
    for (const pz of westPosts) {
      pillar(f.minX, pz);
    }
    const scallop = (x0: number, z0: number, x1: number, z1: number): void => {
      P.boardFence(b, m, x0, z0, x1, z1, 2.95, 2.2, m.fenceBrown);
    };
    for (let i = 0; i + 1 < westPosts.length; i += 1) {
      const a = westPosts[i];
      const bz = westPosts[i + 1];
      if (a === gz0) {
        continue;
      }
      scallop(f.minX, a + 0.42, f.minX, bz - 0.42);
    }
    // north run with LEE board + MACINTOSH graffiti (G10 E / G11 S views)
    const eastPosts = [83.85, 87.6, 91.35, 95.1, f.maxX];
    let prev = f.minX;
    for (const px of eastPosts) {
      pillar(px, f.minZ);
      scallop(prev + 0.42, f.minZ, px - 0.42, f.minZ);
      prev = px;
    }
    b.decal(signMat(["NEELY"], 0.74, 0.27, { bg: "#efeadb", fg: "#241d16" }), f.minX, 2.52, f.minZ - 0.385 - DECOR_GAP, 0.74, 0.27, "N");
    b.decal(signMat(["NEELY"], 0.74, 0.27, { bg: "#efeadb", fg: "#241d16" }), f.minX - 0.385 - DECOR_GAP, 2.45, f.minZ, 0.74, 0.27, "W");
    b.box(m.woodDark, 79.45, 0, 54.55, 79.6, 2.8, 54.7);
    b.box(m.woodDark, 79.1, 2.35, 54.5, 79.95, 2.75, 54.56, { collide: false });
    b.decal(signMat(["LEE"], 0.8, 0.36, { bg: "#3a2814", fg: "#e8dcb8", font: "Rockwell, 'Arial Black', Georgia, serif" }), 79.52, 2.55, 54.5 - DECOR_GAP, 0.8, 0.36, "N");
    b.decal(letters(["MACINTOSH IS", "A SON OF A B"], 2.2, 1.05, "#e8e2d2", "cursive"), 81.5, 1.42, f.minZ - 0.04 - DECOR_GAP, 2.2, 1.05, "N");
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
    b.cyl(m.brickMayor, 78.6, 64.7, 0, 0.55, 0.3, { rTop: 0.38, seg: 9, collide: true });
    b.cyl(m.cactus, 78.5, 64.7, 0.55, 1.5, 0.15, { seg: 6 });
    b.cyl(m.cactus, 78.8, 64.85, 0.55, 1.2, 0.12, { seg: 6 });
    b.decal(signMat(["DAY"], 0.8, 0.3, { bg: "#efeadb", fg: "#241d16" }), f.minX - 0.385 - DECOR_GAP, 2.5, f.maxZ, 0.8, 0.3, "W");
    b.decal(signMat(["LEE"], 0.74, 0.27, { bg: "#efeadb", fg: "#241d16" }), f.minX, 2.6, f.maxZ + 0.385 + DECOR_GAP, 0.74, 0.27, "S");
    b.box(m.iron, f.minX - 0.08, 2.9, gate.z - 1.65, f.minX + 0.08, 3.05, gate.z + 1.65, { collide: false });
    b.decal(signMat(["M"], 0.7, 0.55, { bg: "#241d16", fg: "#dfb44e", border: "#dfb44e" }), f.minX - 0.08 - DECOR_GAP, 3.35, gate.z, 0.7, 0.55, "W");
    b.box(m.iron, f.minX - 0.06, 3.05, gate.z - 0.5, f.minX + 0.06, 3.7, gate.z + 0.5, { collide: false });
    // brick walk from gate to the mansion door
    b.flat(m.brickMayor, f.minX, gate.z - 1.1, LOTS.mansion.minX, gate.z + 1.1, 0.02);

    // mansion: cream two-story, brown shutters, gable + chimneys, porch
    const r = LOTS.mansion;
    const front = { from: 67.05, to: 68.75, top: 2.72 };
    shell(b, m.woodWhite, r, 0, 7.2, { W: [front, ...winGaps("mansion", "W")] });
    buildWindows(b, m, "mansion", m.woodWhite);
    P.gableRoof(b, m, r.minX, r.minZ, r.maxX, r.maxZ, 7.2, 9.6, "z", m.roofDark, m.woodWhite);
    for (const chz of [60, 74]) {
      b.box(m.brickMayor, 93 - 0.45, 8.4, chz - 0.45, 93 + 0.45, 10.6, chz + 0.45, { collide: false });
    }
    // gable-end cornice returns on the street face
    b.box(m.woodDark, r.minX - 0.3, 7.2, r.minZ - 0.2, r.minX + 0.2, 7.4, r.maxZ + 0.2, { collide: false });
    const fx = r.minX - DECOR_GAP;
    // brown shutters flanking every front window (I10 E)
    for (const [wz, wy] of [
      [65.6, 1.6], [70.3, 1.6], [62.5, 5.2], [65.6, 5.2], [70.3, 5.2], [73.2, 5.2],
    ] as const) {
      b.box(m.woodMid, r.minX - 0.06, wy - 0.75, wz - 0.85, r.minX - 0.02, wy + 0.75, wz - 0.55, { collide: false });
      b.box(m.woodMid, r.minX - 0.06, wy - 0.75, wz + 0.55, r.minX - 0.02, wy + 0.75, wz + 0.85, { collide: false });
    }
    // the door bay: a low porch on the gate axis under a front-facing gable
    P.boardwalkSlab(b, m, r.minX - 1.8, 65.7, r.minX, 70.1, 0.3);
    P.porchPosts(b, m, 0.3, 3.0, [
      [r.minX - 1.6, 65.9],
      [r.minX - 1.6, 69.9],
    ], m.woodWhite);
    P.porchRoof(b, m, r.minX - 1.9, 65.5, r.minX, 70.3, 3.0, 3.4, "W");
    P.gableRoof(b, m, r.minX - 0.4, 64.4, r.minX + 6.0, 71.3, 7.2, 8.7, "x", m.roofDark, m.woodWhite);
    b.decal(signMat(["M"], 0.6, 0.5, { bg: "#efeadb", fg: "#dfb44e", border: "#b08d3f" }), fx, 3.9, 67.9, 0.6, 0.5, "W");
    b.box(m.marble, r.minX - 2.3, 0, 66.7, r.minX - 1.8, 0.15, 69.1); // step
  }

  /* ---------- Day street east + rifle range ---------- */
  {
    // The range is the `_TARGET` set: tiles L9..O13 (x 64..104, z 88..120),
    // entered through the gate on the K11 axis (x 84). Rail fences either
    // side of the gate (K10 S / K11 S), the banner over it; nothing
    // stands inside but the booth, the tank, the windmill and cacti.
    P.railFence(b, m, 72.6, 88.3, 73.3, 88.3, 3, 1.85, m.woodStage);
    P.railFence(b, m, 75.7, 88.3, 80.8, 88.3, 3, 1.85, m.woodStage);
    P.saguaro(b, m, 75.3, 90.2, 2.6);
    for (const gx of [73.3, 75.7]) {
      b.box(m.woodDark, gx - 0.12, 0, 88.18, gx + 0.12, 2.6, 88.42);
    }
    P.railFence(b, m, 88.2, 88.3, 91.4, 88.3, 3, 1.85, m.woodStage);
    // the gate: posts 7.2 m apart carrying SKIZ SHERATON'S board at 4.35 m
    b.box(m.woodDark, 80.6, 0, 88.1, 81.0, 4.9, 88.5);
    b.box(m.woodDark, 87.8, 0, 88.1, 88.2, 4.9, 88.5);
    b.box(m.woodDark, 80.4, 4.6, 88.1, 88.4, 4.9, 88.5, { collide: false });
    b.box(m.woodSaloon, 81.9, 3.9, 88.22, 86.9, 4.8, 88.38, { collide: false });
    const rangeSign = signMat(["SKIZ SHERATON'S", "TARGET AND RIFLE RANGE"], 5.0, 0.9, { bg: "#3a2814", fg: "#d8cba6", border: "#20150c" });
    b.decal(rangeSign, 84.4, 4.35, 88.22 - DECOR_GAP, 5.0, 0.9, "N");
    b.decal(rangeSign, 84.4, 4.35, 88.38 + DECOR_GAP, 5.0, 0.9, "S");
    // Skiz Sheraton's shooting-gallery booth at the far end, as the
    // _TARGET still films it: white body, navy teepee band, bird
    // targets, lettering, a plank walk up from the gate
    {
      const bx0 = 81.2;
      const bx1 = 86.9;
      const bz0 = 95.0;
      const bz1 = 97.4;
      b.box(m.white, bx0, 0, bz0, bx1, 1.4, bz1);
      b.box(m.glassCold, bx0 - 0.12, 1.32, bz0 - 0.06, bx1 + 0.12, 1.45, bz1 + 0.12, { collide: false });
      b.decal(
        new THREE.MeshLambertMaterial({ map: teepeeBandTex(7) }),
        (bx0 + bx1) / 2,
        0.95,
        bz0 - DECOR_GAP,
        bx1 - bx0 - 0.6,
        0.55,
        "N",
      );
      b.decal(
        signMat(["SKIZ SHERATON'S", "TARGET AND RIFLE RANGE"], 5.0, 0.55, {
          bg: "#efeadb",
          fg: "#9e2f24",
          border: "#2b3a5c",
        }),
        (bx0 + bx1) / 2,
        0.34,
        bz0 - DECOR_GAP,
        5.0,
        0.55,
        "N",
      );
      for (const [bxT, byT, sc] of [
        [81.9, 1.55, 0.8], [82.9, 1.5, 0.7], [84.0, 1.58, 0.8], [85.1, 1.5, 0.7], [86.2, 1.55, 0.8],
      ] as const) {
        b.rotBox(m.brickMayor, bxT, byT, bz0 - 0.07, 0.2 * sc, 0.13 * sc, 0.1, 0.4, { collide: false });
      }
      b.flat(m.woodWatson, 83.0, 89.5, 85.0, bz0, 0.06);
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
    P.oxSkull(b, m, 80.1, 87.4);
  }

  /* =========== FARM SOUTH-WEST + DAY WEST =========== */
  {
    // the wheelwright's black shop (K3 W): lantern and window on the east face
    const ww = LOTS.wheelwright;
    solidBuilding(b, m, ww, 3.8, m.woodBlack, "flat", m.roofDark);
    b.box(m.woodBlack, ww.maxX - WALL_T, 3.8, ww.minZ, ww.maxX + 0.04, 5.2, ww.maxZ);
    for (let cz = ww.minZ + 0.35; cz < ww.maxZ; cz += 1.0) {
      b.box(m.woodBlack, ww.maxX - 0.12, 5.2, cz - 0.2, ww.maxX + 0.04, 5.45, cz + 0.2, { collide: false });
    }
    // south face on the lane (K3 W): wagon door, a lantern high beside it, two windows
    P.fakeDoor(b, m, 13.7, 0, ww.maxZ, 2.24, 3.2, "S", { mat: m.woodBlack });
    P.wallLantern(b, m, 13.9, 3.55, ww.maxZ, "S");
    b.decal(winCold, 11.5, 1.67, ww.maxZ + DECOR_GAP, 1.2, 1.75, "S");
    b.decal(winCold, 15.5, 1.67, ww.maxZ + DECOR_GAP, 1.2, 1.75, "S");
    P.spittoon(b, m, 18.2, 79.6, 0, 1.5);
    // the east gable carries a stretched hide under a rack of antlers (J4 W)
    b.decal(m.hide, ww.maxX + 0.04 + DECOR_GAP, 2.3, 77.8, 3.4, 3.0, "E");
    b.decal(m.antler, ww.maxX + 0.04 + DECOR_GAP, 4.5, 79.0, 1.1, 0.8, "E");
    b.decal(letters(["SEE", "ROCK", "CITY"], 1.25, 1.7, "#e8e2d2"), ww.maxX + 0.04 + DECOR_GAP, 2.45, 73.2, 1.25, 1.7, "E");
    b.decal(letters(["SEE", "ROCK", "CITY"], 1.7, 1.5, "#e8e2d2"), 13.2, 2.5, ww.minZ - DECOR_GAP, 1.7, 1.5, "N");

    // the low dark stable with two doorways and stone ramps (K2 W / K3 W)
    const st = LOTS.whiteStable;
    solidBuilding(b, m, st, 2.3, m.adobeJail, "flat", m.roofDark);
    b.box(m.woodDark, st.minX - 0.1, 2.25, st.minZ - 0.1, st.maxX + 0.1, 2.55, st.maxZ + 0.1, { collide: false });
    for (const dz of [82.0, 85.1]) {
      b.decal(signMat([""], 1.1, 1.9, { bg: "#17120d", fg: "#17120d" }), st.maxX + DECOR_GAP, 1.0, dz, 1.1, 1.9, "E");
      b.flat(m.crateLight, st.maxX, dz - 0.55, st.maxX + 1.3, dz + 0.55, 0.03);
    }
    P.saguaro(b, m, -3.0, 77.0, 3.4);
    P.saguaro(b, m, 1.5, 75.5, 2.6);

    // grey barn under a red roof, its north end into the K3 lane (K3 W / K2 W / G2 S)
    const gb = LOTS.grayBarn;
    solidBuilding(b, m, gb, 4.6, m.woodGray, "gableZ", m.roofDark, 2.4);
    // the east front on the L3 spur (L3 W / K3 S): the big X door, two
    // horseshoes, a crate, sacks, the stone box at the corner
    const ex = gb.maxX + DECOR_GAP;
    b.decal(signMat(["X"], 3.6, 3.9, { bg: "#5a2b1e", fg: "#3a1c12", font: "Georgia", planked: true }), ex, 1.95, 91.8, 3.6, 3.9, "E");
    b.flat(m.crateLight, gb.maxX, 90.2, gb.maxX + 1.3, 93.4, 0.03);
    b.decal(letters(["U"], 0.45, 0.4, "#3a3630"), ex, 2.85, 89.3, 0.45, 0.4, "E");
    b.decal(letters(["U"], 0.45, 0.4, "#3a3630"), ex, 2.35, 88.2, 0.45, 0.4, "E");
    P.crate(b, m, 16.0, 88.8, 0.9, 0.8, 0.1, m.woodDark);
    P.sack(b, m, 16.3, 94.6);
    P.sack(b, m, 16.5, 95.3, 0.3);
    b.box(m.wellStone, 15.5, 0, 86.6, 16.6, 1.3, 87.9);
    b.box(m.woodDark, 15.6, 1.3, 86.7, 16.5, 1.95, 87.8);
    // the long north face on the lane (K2 W / K3 W / J4 W): horseshoes, a blue
    // hide and two bills, the leaning wheel, a stone box by the east end
    const gz = gb.minZ - DECOR_GAP;
    for (const [hx, hy] of [
      [9.45, 3.0],
      [8.55, 2.95],
      [7.85, 2.9],
    ] as const) {
      b.decal(letters(["U"], 0.45, 0.4, "#3a3630"), hx, hy, gz, 0.45, 0.4, "N");
    }
    b.decal(signMat([""], 1.25, 0.95, { bg: "#2a2e44", fg: "#2a2e44" }), 14.3, 2.68, gz, 1.25, 0.95, "N");
    b.decal(posterMat("bishop"), 13.1, 2.4, gz, 1.1, 1.4, "N");
    b.decal(posterMat("wanted2"), 11.45, 2.8, gz, 1.1, 1.5, "N");
    P.hitchRail(b, m, 8.5, gb.minZ - 0.8, 15.0, gb.minZ - 0.8, 1.05);
    P.wagonWheel(b, m, 7.6, 0, gb.minZ - 0.5, 0.9, 0.15);
    P.sack(b, m, gb.maxX + 0.8, 90);

    // farmhouse (K4 S / L5 S): grey clapboard, north gable, a lit curtained
    // window beside the door, the horseshoe over it
    const fh = LOTS.farmhouse;
    solidBuilding(b, m, fh, 3.5, m.woodGray, "gableZ", m.roofDark, 1.2);
    b.box(m.barnDark, fh.minX - 0.02, 0, fh.minZ, fh.minX, 3.5, fh.maxZ, { collide: false });
    b.box(m.barnDark, fh.maxX, 0, fh.minZ, fh.maxX + 0.02, 3.5, fh.maxZ, { collide: false });
    const fhz = fh.minZ - DECOR_GAP;
    P.fakeDoor(b, m, 28.1, 0, fh.minZ, 1.6, 2.85, "N", { mat: m.woodBlack });
    b.decal(signMat(["U"], 0.5, 0.4, { bg: "#8a8478", fg: "#3a3630" }), 28.1, 3.3, fhz, 0.5, 0.4, "N");
    b.decal(winWarm, 30.3, 2.15, fhz, 1.14, 1.9, "N");
    b.box(m.woodDark, 29.65, 1.12, fh.minZ - 0.06, 30.95, 1.2, fh.minZ, { collide: false });
    b.decal(winCold, 25.95, 2.15, fhz, 1.05, 1.9, "N");
    b.flat(m.marble, 27.0, fh.minZ - 0.9, 29.2, fh.minZ, 0.05);
    P.crate(b, m, 32.4, 88.5, 0.9, 0.7, 0.1, m.woodBlack);
    P.sack(b, m, 33.4, 91.6);
    P.sack(b, m, 32.8, 92.2, 0.3);

    // the well yard (L5 S / K4 S): the roofed well, a four-rail fence behind it
    P.well(b, m, 36.5, 95.4);
    P.railFence(b, m, 32.2, 96.6, 39.6, 96.6, 4, 2.2);
    // the L3 spur closes on a four-rail fence with two barrels (L3 S)
    P.railFence(b, m, 15.5, 95.8, 24.1, 95.8, 4, 2.25, m.woodMid);
    P.barrel(b, m, 20.7, 95.2, 0.4, 1.06);
    P.barrel(b, m, 17.85, 95.3, 0.4, 1.17);
    P.sack(b, m, 15.4, 87.2);

    // freight wagon parked on Day (K4 E / K5 N views)
    P.wagon(b, m, 35.8, 81.4, 0.0);
  }

  /* =========== NE FARM (Mission street east end) =========== */
  {
    const nb2 = LOTS.neBarn;
    solidBuilding(b, m, nb2, 5.0, m.woodWatson, "gableX", m.roofBrown, 3.0);
    // the X-braced door and the loft door above it on the west gable end, seen down Mission street (D9 E / D10 E)
    const barnDoor = (w: number, h: number): THREE.MeshLambertMaterial => signMat(["X"], w, h, { bg: "#8a8070", fg: "#3a3028", border: "#3a3028", font: "Georgia", planked: true });
    b.decal(barnDoor(3.2, 3.6), nb2.minX - DECOR_GAP, 1.8, 28.0, 3.2, 3.6, "W");
    b.decal(barnDoor(3.4, 1.9), nb2.minX - DECOR_GAP, 5.3, 28.0, 3.4, 1.9, "W");
    b.decal(barnDoor(2.3, 2.8), 85, 1.4, nb2.maxZ + DECOR_GAP, 2.3, 2.8, "S");
    P.wagonWheel(b, m, nb2.minX - 0.35, 0, 32.5, 0.8, 0.22);
    // the pale stable with its red tile roof (D10 N / E10 N)
    solidBuilding(b, m, LOTS.redStable, 5.0, m.woodWatson, "gableX", m.tileRed, 1.6);
    P.railFence(b, m, 66.2, 13.8, 80, 13.8, 3, 1.75, m.woodStage);
    P.railFence(b, m, 80, 13.8, 80, 20, 3, 1.75, m.woodStage);
    // GLUE crates by the livery's north corner (E10 E view)
    P.crate(b, m, 81.2, 35.1, 0.95, 0.85, 0.1, m.woodStage);
    P.crate(b, m, 81.0, 34.7, 0.8, 0.7, 0.25, m.woodStage);
    b.decal(signMat(["GLUE"], 0.8, 0.4, { bg: "#a98e66", fg: "#33261a" }), 81.2, 0.55, 35.65 + DECOR_GAP, 0.8, 0.4, "S");
    b.cyl(m.white, 82.4, 34.6, 0, 0.55, 0.16, { seg: 8 });
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
    pipe(64.6, 73.4, 4.9, 6.0); // Bolivar's store
    pipe(44.2, 37.6, 4.5, 5.6); // doctor's waiting room
    pipe(6.8, 57.2, 3.4, 4.9); // Sidewinder
    pipe(81.6, 41.0, 3.5, 6.0); // livery office
    pipe(30, 90.5, 4.4, 5.6); // farmhouse
    b.box(m.brickBank, 71.0, 9.2, 41.4, 71.9, 10.8, 42.4, { collide: false }); // hotel fireplace flue

  }

  /* ---------- street lamps + name boards ---------- */
  {
    // Film: the Neely/Main corners (G7 N / F7 E), the Day/Main corners at
    // (55.4, 80.5) and (48.7, 86.7) (K7 N / K7 S / J7 E), Mission/Main
    // (E7 N: (55.5, 31.5), built with the mission), Lee/Neely
    const lamps: [number, number, [string, string], "NE" | "NW" | "SE" | "SW"][] = [
      // Neely/Main: the NE and SW corners, each bar turned to face the crossing (G7 N / G7 E / G7 S / G7 W)
      [55.6, 48.4, ["NEELY", "MAIN"], "SW"],
      [48.7, 55.3, ["NEELY", "MAIN"], "NE"],
      // Day/Main (K7 N / K7 S)
      [55.4, 80.5, ["DAY", "MAIN"], "SW"],
      [48.7, 86.7, ["DAY", "MAIN"], "NE"],
    ];
    for (const [lx, lz, names, facing] of lamps) {
      P.lampPost(b, m, lx, lz, 3.5);
      P.streetSign(b, m, lx, lz, 2.45, names, facing);
    }
  }

  /* ---------- night: lit windows and lamp halos (_NITE stills) ---------- */
  {
    // the saloon's and hotel's panes glow through their own glass (glassLit)
    // the mission's door lamp
    P.wallLantern(b, m, 52, 5.1, LOTS.mission.maxZ, "S", 1.4);
    const glow = (x: number, y: number, z: number, i: number, d: number): void => {
      const l = new THREE.PointLight(0xffd9a0, i * 0.6, d, 1.6);
      l.position.set(x, y, z);
      nightGroup.add(l);
    };
    for (const [lx, lz] of [
      [55.6, 48.4],
      [48.7, 55.3],
      [55.4, 80.5],
      [48.7, 86.7],
      [55.65, 31.1],
      [80.0, 47.8],
    ] as const) {
      glow(lx, 3.2, lz, 3, 10);
    }
    glow(52, 4.8, LOTS.mission.maxZ + 0.6, 1.5, 6);
  }

  /* ---------- scattered cacti + skulls + barrels ---------- */
  {
    for (const [cx, cz, ch] of [
      [22.8, 20.5, 4.2], [29.2, 18.7, 4.5], [20.0, 20.0, 3.5], [14.8, 14.0, 3.2],
      [69.5, 11.5, 3.0], [92, 60, 2.6],
      [72, 17, 2.4], [82.5, 12.5, 3.0],
    ] as const) {
      P.saguaro(b, m, cx, cz, ch);
    }
    P.barrel(b, m, 46.6, 54.8);
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
