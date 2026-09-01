/**
 * Outdoor Diamondback, block by filmed block. Layout follows the 52
 * camera poses of `_TOWN` (see layout.ts); materials are Dust-palette
 * tiling textures — no stills are pasted anywhere.
 */
import * as THREE from "three";
import { Builder } from "./geometry";
import {
  DECOR_GAP,
  GATE,
  LOTS,
  PALISADE,
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
import { boardTex, posterTex, type BoardOpts, type PosterKind } from "./textures";

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

/** Wall running along X at z, or along Z at x, with door gaps. */
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
  const sorted = [...gaps].sort((a, g) => a.from - g.from);
  let cur = Math.min(x0, x1);
  const end = Math.max(x0, x1);
  for (const g of sorted) {
    // clamp each gap to this wall's run; skip gaps outside it
    const from = Math.max(g.from, cur);
    const to = Math.min(g.to, end);
    if (to <= from) {
      continue;
    }
    if (from > cur) {
      b.box(mat, cur, y0, z - t / 2, from, y1, z + t / 2);
    }
    if (g.top < y1) {
      b.box(mat, from, g.top, z - t / 2, to, y1, z + t / 2);
    }
    if (g.bottom !== undefined && g.bottom > y0) {
      b.box(mat, from, y0, z - t / 2, to, g.bottom, z + t / 2);
    }
    cur = to;
  }
  if (cur < end) {
    b.box(mat, cur, y0, z - t / 2, end, y1, z + t / 2);
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
  const sorted = [...gaps].sort((a, g) => a.from - g.from);
  let cur = Math.min(z0, z1);
  const end = Math.max(z0, z1);
  for (const g of sorted) {
    const from = Math.max(g.from, cur);
    const to = Math.min(g.to, end);
    if (to <= from) {
      continue;
    }
    if (from > cur) {
      b.box(mat, x - t / 2, y0, cur, x + t / 2, y1, from);
    }
    if (g.top < y1) {
      b.box(mat, x - t / 2, g.top, from, x + t / 2, y1, to);
    }
    if (g.bottom !== undefined && g.bottom > y0) {
      b.box(mat, x - t / 2, y0, from, x + t / 2, g.bottom, to);
    }
    cur = to;
  }
  if (cur < end) {
    b.box(mat, x - t / 2, y0, cur, x + t / 2, y1, end);
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
function shell(
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
    P.gableRoof(b, m, r.minX, r.minZ, r.maxX, r.maxZ, h, h + (ridge || 2), roof === "gableX" ? "x" : "z", roofMat);
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
 * Real windows for a lot: clear glass mid-wall, wood frame + muntin
 * cross, optional iron bars on the street face. The matching wall
 * holes come from `winGaps` fed into the shell + interior linings.
 */
function buildWindows(b: Builder, m: Mats, key: LotName): void {
  const r = LOTS[key];
  for (const w of WINDOWS[key] ?? []) {
    const hw = w.w / 2;
    const midY = (w.bottom + w.top) / 2;
    if (w.side === "E" || w.side === "W") {
      const face = w.side === "E" ? r.maxX : r.minX;
      const inner = w.side === "E" ? face - WALL_T : face + WALL_T;
      const gx = (face + inner) / 2;
      const f0 = Math.min(face, inner) - 0.05;
      const f1 = Math.max(face, inner) + 0.05;
      b.box(m.glassClear, gx - 0.02, w.bottom, w.at - hw, gx + 0.02, w.top, w.at + hw, { collide: true });
      b.box(m.woodDark, f0, w.bottom - 0.1, w.at - hw - 0.07, f1, w.bottom, w.at + hw + 0.07, { collide: false });
      b.box(m.woodDark, f0, w.top, w.at - hw - 0.07, f1, w.top + 0.1, w.at + hw + 0.07, { collide: false });
      b.box(m.woodDark, f0, w.bottom, w.at - hw - 0.07, f1, w.top, w.at - hw, { collide: false });
      b.box(m.woodDark, f0, w.bottom, w.at + hw, f1, w.top, w.at + hw + 0.07, { collide: false });
      b.box(m.woodDark, gx - 0.035, w.bottom, w.at - 0.025, gx + 0.035, w.top, w.at + 0.025, { collide: false });
      b.box(m.woodDark, gx - 0.035, midY - 0.025, w.at - hw, gx + 0.035, midY + 0.025, w.at + hw, { collide: false });
      if (w.bars) {
        const bx = w.side === "E" ? face + 0.07 : face - 0.13;
        for (let i = 0; i <= 4; i += 1) {
          const bz = w.at - hw + (i / 4) * w.w;
          b.box(m.iron, bx, w.bottom - 0.05, bz - 0.025, bx + 0.06, w.top + 0.05, bz + 0.025, { collide: false });
        }
      }
    } else {
      const face = w.side === "S" ? r.maxZ : r.minZ;
      const inner = w.side === "S" ? face - WALL_T : face + WALL_T;
      const gz = (face + inner) / 2;
      const f0 = Math.min(face, inner) - 0.05;
      const f1 = Math.max(face, inner) + 0.05;
      b.box(m.glassClear, w.at - hw, w.bottom, gz - 0.02, w.at + hw, w.top, gz + 0.02, { collide: true });
      b.box(m.woodDark, w.at - hw - 0.07, w.bottom - 0.1, f0, w.at + hw + 0.07, w.bottom, f1, { collide: false });
      b.box(m.woodDark, w.at - hw - 0.07, w.top, f0, w.at + hw + 0.07, w.top + 0.1, f1, { collide: false });
      b.box(m.woodDark, w.at - hw - 0.07, w.bottom, f0, w.at - hw, w.top, f1, { collide: false });
      b.box(m.woodDark, w.at + hw, w.bottom, f0, w.at + hw + 0.07, w.top, f1, { collide: false });
      b.box(m.woodDark, w.at - 0.025, w.bottom, gz - 0.035, w.at + 0.025, w.top, gz + 0.035, { collide: false });
      b.box(m.woodDark, w.at - hw, midY - 0.025, gz - 0.035, w.at + hw, midY + 0.025, gz + 0.035, { collide: false });
    }
  }
}

/* ------------------------------------------------------------------ */

export function buildTown(m: Mats, nightGroup: THREE.Group): TownResult {
  const group = new THREE.Group();
  const b = new Builder();
  const nb = new Builder(); // night-only glow decals

  const winCold = m.winCold;
  const winWarm = m.winWarm;

  /* ---------- ground + desert ---------- */
  b.flat(m.dirt, -80, -80, 200, 220, 0, { texWorld: 7 });
  // distant mesa ring: rounded hills + a few flat-top buttes
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
  for (const [mx, mz, mr, mh, kind] of [
    [-42, 172, 34, 10, 0], [8, 182, 30, 8, 0], [52, 188, 38, 13, 1], [98, 180, 30, 9, 0],
    [138, 172, 26, 11, 1], [182, 118, 30, 9, 0], [188, 60, 34, 12, 1], [186, 4, 30, 8, 0],
    [156, -48, 36, 11, 0], [96, -58, 30, 9, 1], [30, -62, 34, 8, 0], [-48, -44, 30, 10, 1],
    [-62, 22, 28, 8, 0], [-58, 92, 32, 9, 0],
  ] as const) {
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
    // two small notice boards flanking the street inside the gate
    for (const sx of [50.4, 54.2]) {
      b.box(m.woodDark, sx - 0.06, 0, 110.6, sx + 0.06, 1.5, 110.72);
      b.decal(posterMat("repent"), sx, 1.7, 110.72, 0.7, 0.9, "S");
      b.box(m.woodSaloon, sx - 0.4, 1.25, 110.58, sx + 0.4, 2.15, 110.7, { collide: false });
    }
    P.oxSkull(b, m, 58.2, 114.2);
  }

  /* ---------- palisade + gate yard (windmill, water tower) ---------- */
  {
    // tall black palisade: west face on x, ends at Curiosities' row
    b.box(m.palisade, PALISADE.x - 0.15, 0, PALISADE.zNorth, PALISADE.x + 0.15, PALISADE.height, PALISADE.zSouth);
    b.box(m.palisade, PALISADE.x - 0.15, 0, PALISADE.zSouth - 0.3, PALISADE.eastEndX, PALISADE.height, PALISADE.zSouth);
    // "FIREARMS STRICKLY PROHIBITED" boards on the street face (film spelling)
    for (const bz of [105.6, 109.4]) {
      b.decal(
        signMat(["FIREARMS", "STRICKLY", "PROHIBITED"], 1.9, 1.5, { bg: "#d8cba6", fg: "#33261a", border: "#6b5b3c" }),
        PALISADE.x - 0.15 - DECOR_GAP,
        2.5,
        bz,
        1.9,
        1.5,
        "W",
      );
    }
    P.oxSkull(b, m, PALISADE.x - 0.55, 110.9);
    // weathered gray fence continues north to the Curiosities corner
    P.picketFence(b, m, PALISADE.x, 96, PALISADE.x, PALISADE.zNorth, 2.4, m.fenceGray);
    // skull posts on the gray run
    for (const sz of [97.5, 101]) {
      b.box(m.woodDark, PALISADE.x - 0.09, 2.3, sz - 0.09, PALISADE.x + 0.09, 3.1, sz + 0.09, { collide: false });
      P.oxSkull(b, m, PALISADE.x, sz, 3.12);
    }
    // yard behind: corral rails, windmill, water tower
    P.railFence(b, m, PALISADE.eastEndX, 96, PALISADE.eastEndX, PALISADE.zSouth, 3, 1.3, m.woodGray);
    P.railFence(b, m, PALISADE.x, 96, PALISADE.eastEndX, 96, 3, 1.3, m.woodGray);
    P.windmill(b, m, 60, 102.5, 9.5);
    P.waterTower(b, m, 64.2, 107.5, "DIAMONDBACK CITY");
  }

  /* ---------- west of the gate: rails + barns ---------- */
  {
    P.railFence(b, m, 26, 111.8, 47.5, 111.8, 3, 1.3);
    P.railFence(b, m, 26, 104, 26, 111.8, 3, 1.3);
    solidBuilding(b, m, LOTS.swBarn, 3.6, m.woodGray, "gableZ", m.roofDark, 2);
    solidBuilding(b, m, { minX: 26, minZ: 96, maxX: 33, maxZ: 103 }, 2.9, m.woodGray, "gableX", m.roofDark, 1.4);
    // tall narrow outhouse-ish shed by the fence
    b.box(m.barnDark, 45, 0, 107.5, 46.6, 2.6, 109.1);
    P.saguaro(b, m, 43, 113.5, 3);
    P.saguaro(b, m, 24.5, 108, 2.6);
  }

  /* =========== MAIN STREET, WEST SIDE =========== */

  /* ---------- Hard Drive Saloon (H7+I7): door at H7, porch fills I7 ---------- */
  {
    const r = LOTS.saloon;
    const dSaloon = streetDoor("saloon");
    const top = 7.4;
    shell(b, m.woodSaloon, r, 0, top, {
      E: [doorGapOf(dSaloon), ...winGaps("saloon", "E")],
      // doorway through to the backshed corridor (J4 back door route)
      W: [{ from: 71.4, to: 72.8, top: 2.6 }],
    });
    buildWindows(b, m, "saloon");
    // parapet on the street face + big sign band over the porch (I7 half)
    b.box(m.woodSaloon, r.maxX - WALL_T, top, r.minZ, r.maxX + 0.05, 8.5, r.maxZ);
    flatRoof(b, m, r, top);
    // "HARD DRIVE SALOON" parapet letters near the north corner (G7/H7 views)
    b.decal(
      signMat(["HARD DRIVE", "SALOON"], 6, 1.9, { bg: "#241a12", fg: "#e0b34c" }),
      r.maxX + 0.05 + DECOR_GAP,
      7.6,
      r.minZ + 3.6,
      6,
      1.9,
      "E",
    );
    // porch along the whole front, boardwalk + posts + roof + balcony
    const porchX = r.maxX + 2.2;
    P.boardwalkSlab(b, m, r.maxX, 56.2, porchX, r.maxZ + 0.2);
    P.porchPosts(b, m, 0.32, 3.4, [
      [porchX - 0.12, 57],
      [porchX - 0.12, 60.5],
      [porchX - 0.12, 64],
      [porchX - 0.12, 67.5],
      [porchX - 0.12, 71],
      [porchX - 0.12, 74.2],
    ]);
    b.box(m.woodSaloon, r.maxX, 3.4, 56.2, porchX + 0.15, 3.7, r.maxZ + 0.2, { collide: false });
    // balcony rail above the porch roof
    P.balustrade(b, m, r.maxX + 0.2, 74.4, porchX, 74.4, 3.7);
    P.balustrade(b, m, porchX, 56.4, porchX, 74.4, 3.7);
    P.balustrade(b, m, r.maxX + 0.2, 56.4, porchX, 56.4, 3.7);
    // "SALOON·" band on the porch fascia under the balcony (I7 half)
    b.box(m.woodSaloon, porchX - 0.05, 2.9, 64.6, porchX + 0.1, 3.42, 72.6, { collide: false });
    b.decal(
      signMat(["· SALOON ·"], 5.4, 0.9, { bg: "#241a12", fg: "#e0b34c" }),
      porchX + 0.1 + DECOR_GAP,
      3.16,
      68.6,
      5.4,
      0.9,
      "E",
    );
    // glowing multi-pane windows on the I7 porch stretch (warm day+night)
    const wx = r.maxX + DECOR_GAP;
    for (const wz of [63.4, 65.4, 68.6, 70.6, 72.4]) {
      b.decal(winWarm, wx, 1.9, wz, 1.35, 1.7, "E");
    }
    // door dressing: poster boards + lanterns each side of the H7 door
    b.decal(signMat(["Beers &", "Whiskeys"], 1, 1.2, { bg: "#2c2014", fg: "#d8cba6", border: "#6b5b3c" }), wx, 2, 57.9, 1, 1.2, "E");
    b.decal(signMat(["Wines &", "Liquors"], 1, 1.2, { bg: "#2c2014", fg: "#d8cba6", border: "#6b5b3c" }), wx, 2, 61.3, 1, 1.2, "E");
    for (const lz of [58.5, 60.9]) {
      b.box(m.iron, r.maxX + 0.3, 2.9, lz - 0.06, r.maxX + 0.42, 3.2, lz + 0.06, { collide: false });
      b.box(m.glassWarm, r.maxX + 0.28, 2.62, lz - 0.09, r.maxX + 0.44, 2.9, lz + 0.09, { collide: false });
    }
    // porch furniture: chairs, table, spittoon
    P.chair(b, m, r.maxX + 1.3, 66.6, Math.PI / 2);
    P.chair(b, m, r.maxX + 1.3, 69.8, Math.PI / 2);
    b.cyl(m.woodMid, r.maxX + 1.5, 68.2, 0.32, 0.85, 0.4, { seg: 8, collide: true });
    b.cyl(m.brass, r.maxX + 1.1, 64.6, 0.32, 0.62, 0.16, { seg: 8 });
    // north gable: gold corner letters + painted bank ghost-sign (H7 N / G7 S stills)
    b.decal(
      signMat(["HARD DRIVE SALOON"], 5.6, 1.0, { bg: "#241a12", fg: "#e0b34c" }),
      45.1,
      7.5,
      r.minZ - DECOR_GAP,
      5.6,
      1.0,
      "N",
    );
    b.decal(
      signMat(["NEELY", "DIAMONDBACK BANK & TRUST"], 6.4, 2.2, { bg: "#241a12", fg: "#cfc4a6" }),
      r.minX + 3.6,
      5.2,
      r.minZ - DECOR_GAP,
      6.4,
      2.2,
      "N",
    );
    // south face: red board + lamps near Main (K5 E view)
    b.decal(signMat(["HARD DRIVE SALOON"], 4.4, 0.8, { bg: "#5e1713", fg: "#e0cf9c" }), 45.6, 3.1, r.maxZ + DECOR_GAP, 4.4, 0.8, "S");
  }

  /* ---------- saloon backlot (west lane wall, posters, back door) ---------- */
  {
    const r = LOTS.saloonBackshed;
    const back = streetDoor("saloonBack");
    shell(b, m.woodSaloon, r, 0, 3.4, {
      W: [doorGapOf(back)],
      E: [{ from: 71.4, to: 72.8, top: 2.6 }],
    });
    flatRoof(b, m, r, 3.4);
    const px = r.minX - DECOR_GAP;
    // "EAT, DRINK AND GO TO BED, OR GIT OUT!" stencil by the back door
    b.decal(
      signMat(["HARD DRIVE SALOON", "EAT, DRINK AND GO TO BED,", "OR GIT OUT!"], 4.4, 1.5, {
        bg: "#2c2014",
        fg: "#e6dcba",
      }),
      px,
      2.5,
      72.6,
      4.4,
      1.5,
      "W",
    );
    b.decal(signMat(["GRANT"], 1.1, 0.45, { bg: "#3c2c1c", fg: "#d8cba6" }), px, 3.05, 75.6, 1.1, 0.45, "W");
    // poster wall along the lane (H4 E / I4 E)
    b.decal(posterMat("wanted"), px, 2.1, 58.5, 0.85, 1.15, "W");
    b.decal(posterMat("circus"), px, 1.9, 60.2, 0.85, 1.15, "W");
    b.decal(posterMat("bishop"), px, 2.2, 62.4, 0.85, 1.15, "W");
    b.decal(posterMat("repent"), px, 1.8, 64.1, 0.85, 1.15, "W");
    b.decal(posterMat("wanted2"), px, 2.15, 66.3, 0.85, 1.15, "W");
    // decorative barred door shape on the lane wall (never opens)
    b.decal(signMat([""], 1.2, 2.5, { bg: "#1e150d", fg: "#1e150d", planked: true }), px, 1.3, 68.6, 1.2, 2.5, "W");
    // chalk menu board (I4 S view)
    b.decal(
      signMat(["SALOON", "steak  .25", "beans  .10", "whiskey .15"], 1.3, 1.6, { bg: "#1c1712", fg: "#cfc4a6", align: "left" }),
      px,
      1.9,
      78.2,
      1.3,
      1.6,
      "W",
    );
    P.barrel(b, m, 33.2, 69.6);
    P.barrel(b, m, 33.9, 70.3);
    P.crate(b, m, 33.4, 61.2, 0.9, 1.1, 0.2, m.woodWatson);
    // south face on Day street: Beers & Whiskeys posters
    b.decal(signMat(["Beers & Whiskeys"], 2.4, 0.7, { bg: "#2c2014", fg: "#d8cba6", border: "#6b5b3c" }), 37, 2.6, r.maxZ + DECOR_GAP, 2.4, 0.7, "S");
    b.decal(posterMat("wanted"), 34, 1.9, r.maxZ + DECOR_GAP, 0.85, 1.15, "S");
  }

  /* ---------- Bank (F7 W): brick, no porch, barred windows ---------- */
  {
    const r = LOTS.bank;
    const d = streetDoor("bank");
    shell(b, m.brickBank, r, 0, 5.2, { E: [doorGapOf(d), ...winGaps("bank", "E")] });
    buildWindows(b, m, "bank");
    flatRoof(b, m, r, 5.2);
    const fx = r.maxX + DECOR_GAP;
    b.decal(
      signMat(["DIAMONDBACK", "BANK & TRUST", "est. 1875"], 5.6, 1.7, { bg: "#5b3d2c", fg: "#efeadb" }),
      fx,
      4.2,
      44,
      5.6,
      1.7,
      "E",
    );
    b.decal(signMat(["POST NO BILLS"], 1.5, 0.4, { bg: "#7e1f1c", fg: "#efeadb" }), fx, 0.6, 41, 1.5, 0.4, "E");
    // painted signs on north + south brick faces, dark board on west
    b.decal(signMat(["DIAMONDBACK BANK & TRUST"], 6.5, 1.1, { bg: "#6b4732", fg: "#efeadb" }), 44, 4.3, r.minZ - DECOR_GAP, 6.5, 1.1, "N");
    b.decal(signMat(["DIAMONDBACK BANK & TRUST"], 6.5, 1.1, { bg: "#6b4732", fg: "#efeadb" }), 44, 4.3, r.maxZ + DECOR_GAP, 6.5, 1.1, "S");
    b.decal(signMat(["DIAMONDBACK", "BANK & TRUST"], 3.4, 1.4, { bg: "#2c2014", fg: "#cfc4a6", border: "#6b5b3c" }), r.minX - DECOR_GAP, 3.4, 44, 3.4, 1.4, "W");
    b.decal(winCold, 42, 3.9, r.maxZ + DECOR_GAP, 1, 1.3, "S");
  }

  /* ---------- Dr. Rodham (E7 W) + Grant annex ---------- */
  {
    const r = LOTS.doctor;
    const d = streetDoor("doctor");
    shell(b, m.woodDoctor, r, 0, 3.6, {
      E: [doorGapOf(d), ...winGaps("doctor", "E")],
      W: [{ from: 35.4, to: 36.8, top: 2.6 }],
    });
    buildWindows(b, m, "doctor");
    b.box(m.woodDoctor, r.maxX - WALL_T, 3.6, r.minZ, r.maxX + 0.04, 4.9, r.maxZ);
    flatRoof(b, m, r, 3.6);
    const fx = r.maxX + 0.04 + DECOR_GAP;
    b.decal(
      signMat(["DR. H. RODHAM", "Medical and Tonsorial Parlour"], 6.2, 1.3, { bg: "#4f382a", fg: "#e6dcba", border: "#33261a" }),
      fx,
      4.15,
      36,
      6.2,
      1.3,
      "E",
    );
    P.boardwalkSlab(b, m, r.maxX, 32.2, r.maxX + 1.5, 39.8);
    P.barrel(b, m, r.maxX + 0.9, 37.2);
    // north hoarding on Mission street: painted ads (D6 S view)
    const nz = r.minZ - DECOR_GAP;
    b.decal(signMat(["DR. H. RODHAM", "Medical and Tonsorial Parlour"], 3.6, 1.2, { bg: "#4f382a", fg: "#e6dcba" }), 45.6, 2.6, nz, 3.6, 1.2, "N");
    b.decal(posterMat("repent"), 43.2, 2.1, nz, 0.85, 1.15, "N");
    b.decal(posterMat("circus"), 41.9, 1.9, nz, 0.85, 1.15, "N");
    b.decal(posterMat("tonic"), 40.7, 2.2, nz, 0.85, 1.15, "N");

    // Grant annex on the west lane
    const a = LOTS.doctorAnnex;
    shell(b, m.woodMid, a, 0, 3.4, {});
    flatRoof(b, m, a, 3.4);
    const ax = a.minX - DECOR_GAP;
    b.decal(signMat(["GRANT"], 1.4, 0.5, { bg: "#3c2c1c", fg: "#d8cba6" }), ax, 3.0, 36, 1.4, 0.5, "W");
    b.decal(signMat([""], 1.2, 2.4, { bg: "#2c2014", fg: "#2c2014", planked: true }), ax, 1.25, 36, 1.2, 2.4, "W");
    b.decal(
      signMat(["DEENA KAOUSIA'S", "VEGETABLE COMPOUND"], 2.4, 1.1, { bg: "#d8cba6", fg: "#33261a", border: "#6b5b3c" }),
      ax,
      2.1,
      33.8,
      2.4,
      1.1,
      "W",
    );
    b.decal(posterMat("tonic"), a.minX - DECOR_GAP, 1.9, 38.4, 0.85, 1.15, "W");
    b.decal(posterMat("circus"), 37, 2.1, a.minZ - DECOR_GAP, 0.85, 1.15, "N");
    P.barrel(b, m, a.minX + 0.7, 38.9);
  }

  /* ---------- Jail (L7 W): adobe, SHERIFF, door south-of-centre ---------- */
  {
    const r = LOTS.jail;
    const d = streetDoor("jail");
    shell(b, m.adobeJail, r, 0, 3.6, {
      E: [doorGapOf(d), ...winGaps("jail", "E")],
      W: winGaps("jail", "W"),
    });
    buildWindows(b, m, "jail");
    flatRoof(b, m, r, 3.6);
    // vigas (beam ends) along the front
    for (const vz of [88.7, 89.9, 91.1, 92.3, 94.6, 95.4]) {
      b.box(m.woodDark, r.maxX, 3.15, vz - 0.09, r.maxX + 0.3, 3.35, vz + 0.09, { collide: false });
    }
    const fx = r.maxX + DECOR_GAP;
    b.decal(signMat(["SHERIFF"], 2.2, 0.75, { bg: "#6e3423", fg: "#efeadb", border: "#40190f" }), fx, 2.75, 91.2, 2.2, 0.75, "E");
    b.decal(posterMat("wanted"), fx, 1.75, 92.6, 0.7, 0.95, "E");
    P.bench(b, m, r.maxX + 0.9, 91.1, 1.7, "E");
    b.cyl(m.brass, r.maxX + 0.7, 94.4, 0, 0.32, 0.16, { seg: 8 });
    // lantern left of the door
    b.box(m.iron, r.maxX + 0.26, 2.5, 94.35, r.maxX + 0.38, 2.62, 94.47, { collide: false });
    b.box(m.glassWarm, r.maxX + 0.24, 2.24, 94.32, r.maxX + 0.4, 2.5, 94.5, { collide: false });
    // west wall graffiti + well-yard dressing (M7 W / J4 E / L5 E views)
    b.decal(
      signMat(["≠  ∴  ϟ  ⌂"], 2.6, 1.5, { bg: "#b3a288", fg: "#6b5b3c", font: "Georgia" }),
      r.minX - DECOR_GAP,
      1.95,
      89.8,
      2.6,
      1.5,
      "W",
    );
    P.picketFence(b, m, 39.85, 89, 39.85, 91, 1.15, m.woodMid);
    P.barrel(b, m, 39.4, 95.9);
  }

  /* =========== MAIN STREET, EAST SIDE =========== */

  /* ---------- Stagecoach (H7 E) ---------- */
  {
    const r = LOTS.stage;
    const d = streetDoor("stage");
    shell(b, m.woodStage, r, 0, 3.6, { W: [doorGapOf(d)] });
    b.box(m.woodStage, r.minX - 0.04, 3.6, r.minZ, r.minX + WALL_T, 5.4, r.maxZ);
    flatRoof(b, m, r, 3.6);
    const fx = r.minX - 0.04 - DECOR_GAP;
    b.decal(
      signMat(["The Great Southwestern", "STAGECOACH Co."], 6.6, 1.6, { bg: "#8d7350", fg: "#2c2014" }),
      fx,
      4.5,
      60,
      6.6,
      1.6,
      "W",
    );
    b.decal(signMat(["STAGECOACH"], 2.6, 0.6, { bg: "#a3541d", fg: "#2c2014", border: "#6b3b12" }), fx, 3.0, 60.7, 2.6, 0.6, "W");
    // POST OFFICE on the door is painted by the door itself; add board
    b.decal(signMat(["POST OFFICE"], 1.3, 0.35, { bg: "#4f382a", fg: "#efeadb" }), fx, 2.4, 59.2, 1.3, 0.35, "W");
    P.boardwalkSlab(b, m, r.minX - 1.6, 56.2, r.minX, 63.8);
    P.porchPosts(b, m, 0.32, 3.1, [
      [r.minX - 1.45, 56.8],
      [r.minX - 1.45, 60],
      [r.minX - 1.45, 63.2],
    ]);
    P.porchRoof(b, m, r.minX - 1.7, 56.2, r.minX, 63.8, 3.1, 3.55, "W");
    P.hitchRail(b, m, r.minX - 2.4, 57.4, r.minX - 2.4, 62.6);
    b.box(m.iron, r.minX - 1.3, 0.32, 62.6, r.minX - 0.4, 0.9, 63.4); // planter
    P.wagonWheel(b, m, r.minX - 0.6, 0.3, 56.9, 0.75, 0.18);
    // north wall ad on Neely (G7 E view)
    b.decal(signMat(["The Great Southwestern STAGECOACH Co."], 6.4, 0.9, { bg: "#8d7350", fg: "#2c2014" }), 60, 3.0, r.minZ - DECOR_GAP, 6.4, 0.9, "N");
    // south + back coach posters (G8 S view)
    b.decal(
      signMat(["ASBESTOS, DETROIT AND SANTA FE", "— COACHES —", "For Through Tickets Inquire Within"], 5.4, 1.7, {
        bg: "#2c2014",
        fg: "#d8cba6",
      }),
      60,
      2.4,
      r.maxZ + DECOR_GAP,
      5.4,
      1.7,
      "S",
    );
    b.decal(posterMat("wanted2"), 57.2, 2.2, r.maxZ + DECOR_GAP, 0.85, 1.15, "S");
  }

  /* ---------- stage warehouse + white boarding house (Lee west side) ---------- */
  {
    const r = LOTS.stageWarehouse;
    solidBuilding(b, m, r, 3.8, m.barnDark, "flat");
    b.decal(
      signMat(["STAGECOACH", "For Through Tickets", "Inquire Within"], 3.0, 1.5, { bg: "#2c2014", fg: "#d8cba6" }),
      r.maxX + DECOR_GAP,
      2.3,
      58.6,
      3.0,
      1.5,
      "E",
    );
    b.decal(signMat([""], 1.3, 2.4, { bg: "#241d16", fg: "#241d16", planked: true }), r.maxX + DECOR_GAP, 1.25, 61.2, 1.3, 2.4, "E");
    b.decal(posterMat("news"), r.maxX + DECOR_GAP, 2.1, 57.2, 0.85, 1.15, "E");
    P.barrel(b, m, r.maxX + 0.55, 60);

    const wh = LOTS.whiteHouse;
    solidBuilding(b, m, wh, 6.6, m.woodWhite, "gableZ", m.roofDark, 1.7);
    const fx = wh.maxX + DECOR_GAP;
    b.decal(signMat([""], 1.2, 2.4, { bg: "#2c2014", fg: "#2c2014", planked: true }), fx, 1.25, 66.2, 1.2, 2.4, "E");
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
    buildWindows(b, m, "watson");
    b.box(m.woodWatson, r.minX - 0.04, 3.6, r.minZ, r.minX + WALL_T, 5.6, r.maxZ);
    flatRoof(b, m, r, 3.6);
    const fx = r.minX - 0.04 - DECOR_GAP;
    b.decal(
      signMat(["Watson's", "APOTHECARY"], 6.4, 1.8, { bg: "#b5b2a0", fg: "#c96f1e" }),
      fx,
      4.55,
      68,
      6.4,
      1.8,
      "W",
    );
    // transom + lantern by the door
    b.box(m.iron, r.minX - 0.3, 2.7, 69.9, r.minX - 0.18, 2.82, 70.02, { collide: false });
    b.box(m.glassWarm, r.minX - 0.32, 2.44, 69.86, r.minX - 0.16, 2.7, 70.06, { collide: false });
    P.boardwalkSlab(b, m, r.minX - 1.5, 64.2, r.minX, 71.8);
    // sandwich boards + planters on the street (J7 N view)
    for (const [sx, sz] of [
      [54.4, 66.2],
      [54.8, 69.4],
    ] as const) {
      b.rotBox(m.white, sx, 0.55, sz, 0.7, 1.0, 0.08, 0.3, { rotX: 0.18, collide: true });
      b.rotBox(m.white, sx + 0.18, 0.55, sz, 0.7, 1.0, 0.08, 0.3, { rotX: -0.18, collide: false });
    }
    b.box(m.iron, r.minX - 1.2, 0.32, 64.4, r.minX - 0.3, 0.85, 65.2);
    // blackboard sign on the porch
    b.decal(
      signMat(["TONICS", "POWDERS", "CURES"], 0.9, 1.1, { bg: "#1c1712", fg: "#cfc4a6" }),
      fx,
      1.4,
      71.2,
      0.9,
      1.1,
      "W",
    );
  }

  /* ---------- Bolivar's Dry Goods (J7 E) + annex + lumber yard ---------- */
  {
    const r = LOTS.bolivar;
    const d = streetDoor("bolivar");
    shell(b, m.woodMid, r, 0, 3.5, { W: [doorGapOf(d), ...winGaps("bolivar", "W")] }, { S: m.brickCream });
    buildWindows(b, m, "bolivar");
    // tan brick upper with red letters
    b.box(m.brickCream, r.minX - 0.04, 3.5, r.minZ, r.maxX, 5.5, r.maxZ);
    flatRoof(b, m, r, 3.5, m.roofDark);
    const fx = r.minX - 0.04 - DECOR_GAP;
    b.decal(
      signMat(["BOLIVAR'S", "DRY GOODS"], 6.6, 1.9, { bg: "#d9cfb2", fg: "#b03024" }),
      fx,
      4.5,
      76,
      6.6,
      1.9,
      "W",
    );
    b.decal(signMat(["OPEN"], 0.5, 0.3, { bg: "#efeadb", fg: "#33261a" }), fx, 2.1, 77.3, 0.5, 0.3, "W");
    // rustic log porch
    P.boardwalkSlab(b, m, r.minX - 1.6, 72.2, r.minX, 79.8);
    for (const pz of [72.8, 76, 79.2]) {
      b.cyl(m.woodDark, r.minX - 1.45, pz, 0.32, 3.2, 0.11, { seg: 7, collide: true });
    }
    P.porchRoof(b, m, r.minX - 1.7, 72.2, r.minX, 79.8, 3.2, 3.5, "W");
    // hanging round signs + pans
    b.decal(signMat(["DRY", "GOODS"], 0.8, 0.8, { bg: "#1c1712", fg: "#d8cba6", border: "#6b5b3c" }), fx, 2.6, 73.4, 0.8, 0.8, "W");
    b.decal(signMat(["CHOICE", "GROCERIES"], 0.8, 0.8, { bg: "#1c1712", fg: "#d8cba6", border: "#6b5b3c" }), fx, 2.6, 79, 0.8, 0.8, "W");
    b.box(m.iron, r.minX - 1.1, 2.6, 74.8, r.minX - 0.7, 3.0, 74.9, { collide: false });
    b.box(m.iron, r.minX - 1.1, 2.5, 78.2, r.minX - 0.75, 2.95, 78.3, { collide: false });
    // porch clutter
    P.barrel(b, m, r.minX - 0.9, 72.9);
    b.cyl(m.white, r.minX - 0.5, 79.3, 0.32, 0.95, 0.2, { seg: 8 });
    b.cyl(m.white, r.minX - 0.95, 79.1, 0.32, 0.85, 0.18, { seg: 8 });
    P.chair(b, m, r.minX - 0.8, 75.2, -Math.PI / 2);
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
    // the lumber yard itself is "out back", implied behind the annex
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

  /* ---------- Curiosities (L7 E): blackwood, red posts, pagoda ---------- */
  {
    const r = LOTS.curio;
    const d = streetDoor("curio");
    shell(b, m.woodBlack, r, 0, 3.7, { W: [doorGapOf(d), ...winGaps("curio", "W")] });
    buildWindows(b, m, "curio");
    flatRoof(b, m, r, 3.7, m.roofDark);
    // tall black parapet so the big red band clears the porch roof
    b.box(m.woodBlack, r.minX, 3.7, r.minZ, r.minX + WALL_T, 6.5, r.maxZ);
    const fx = r.minX - DECOR_GAP;
    // two red sign bands
    b.decal(signMat(["CURIOSITIES"], 7, 1.15, { bg: "#a3261d", fg: "#e0cf9c", border: "#5e1713" }), fx, 5.75, 92, 7, 1.15, "W");
    b.decal(signMat(["+ CURIOSITIES +"], 5.2, 0.7, { bg: "#241d16", fg: "#c33a2b" }), fx, 3.2, 92, 5.2, 0.7, "W");
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
    for (const pz of [88.8, 92, 95.2]) {
      b.box(m.woodBlack, r.minX - 1.42, 0.32, pz - 0.14, r.minX - 1.14, 1.1, pz + 0.14, { collide: true });
      b.box(m.curioRed, r.minX - 1.38, 1.1, pz - 0.1, r.minX - 1.18, 4.5, pz + 0.1, { collide: false });
    }
    P.porchRoof(b, m, r.minX - 1.6, 88.2, r.minX, 95.8, 4.1, 4.5, "W", m.roofDark);
    // red window frames + stool
    for (const wz of [89.3, 94.4]) {
      b.box(m.curioRed, r.minX - 0.06, 1.14, wz - 0.56, r.minX - 0.02, 2.66, wz - 0.48, { collide: false });
      b.box(m.curioRed, r.minX - 0.06, 1.14, wz + 0.48, r.minX - 0.02, 2.66, wz + 0.56, { collide: false });
    }
    b.cyl(m.woodBlack, r.minX - 0.9, 90.6, 0.32, 0.75, 0.25, { seg: 8, collide: true });
    P.barrel(b, m, 54.6, 87.4);
    // north wall: MAIN corner board + poster (K7 E / K8 W views)
    b.decal(signMat(["MAIN"], 1.2, 0.4, { bg: "#2c2014", fg: "#d8cba6" }), 58, 2.9, r.minZ - DECOR_GAP, 1.2, 0.4, "N");
    b.decal(posterMat("circus"), 60.5, 2, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    // back veranda: red posts + pergola along the yard (K8 S view)
    for (const px of [58, 61, 64, 67, 70]) {
      b.box(m.curioRed, px - 0.1, 0, r.minZ - 2.2, px + 0.1, 2.6, r.minZ - 2.0, { collide: true });
    }
    b.box(m.woodBlack, 57.6, 2.6, r.minZ - 2.3, 70.4, 2.8, r.minZ - 1.9, { collide: false });
    P.porchRoof(b, m, 57.6, r.minZ - 2.2, 70.4, r.minZ, 2.75, 3.1, "N", m.roofDark);
    b.decal(posterMat("wanted"), 59.4, 1.9, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.decal(posterMat("circus"), 66.2, 2.05, r.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.cyl(m.iron, 68.5, r.minZ - 1.2, 0, 0.18, 0.2, { seg: 8 }); // dog bowl
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
    buildWindows(b, m, "hotel");
    b.box(m.oliveHotel, r.minX - 0.04, top, r.minZ, r.maxX, 9.2, r.maxZ);
    flatRoof(b, m, r, top);
    const fx = r.minX - 0.04 - DECOR_GAP;
    // painted sign across the E7+F7 face + arched service door at F7
    b.decal(
      signMat(["CACTUS BED", "HOTEL"], 8.2, 2.2, { bg: "#6e7155", fg: "#e3d9b8" }),
      fx,
      6.9,
      40,
      8.2,
      2.2,
      "W",
    );
    b.decal(signMat([""], 2.2, 2.9, { bg: "#241d16", fg: "#241d16", planked: true }), fx, 1.5, 43.6, 2.2, 2.9, "W");
    const sz = r.maxZ + DECOR_GAP;
    b.decal(signMat(["CACTUS BED HOTEL"], 7.2, 1.4, { bg: "#6e7155", fg: "#e3d9b8", border: "#4d502f" }), 64, 6.9, sz, 7.2, 1.4, "S");
    // north face letters partial (D7 S view)
    b.decal(signMat(["CACTUS BED HOTEL"], 6.6, 1.1, { bg: "#6e7155", fg: "#e3d9b8" }), 64, 6.7, r.minZ - DECOR_GAP, 6.6, 1.1, "N");
    // street furniture: boardwalk, lanterns, bench, potted cactus, rail
    P.boardwalkSlab(b, m, r.minX - 1.5, 32.2, r.minX, 47.8);
    for (const lz of [35.6, 38.2]) {
      b.box(m.iron, r.minX - 0.3, 2.75, lz - 0.06, r.minX - 0.18, 2.87, lz + 0.06, { collide: false });
      b.box(m.glassWarm, r.minX - 0.32, 2.5, lz - 0.09, r.minX - 0.16, 2.75, lz + 0.09, { collide: false });
    }
    P.bench(b, m, r.minX - 0.85, 39.6, 1.7, "W");
    P.potPlant(b, m, r.minX - 0.8, 34.4);
    P.barrel(b, m, r.minX - 0.8, 45.4);
    P.crate(b, m, r.minX - 0.7, 46.6, 0.7, 0.6, 0.2);
    P.hitchRail(b, m, r.minX - 2.5, 41, r.minX - 2.5, 46);
    // south porch along Neely (G8 N view)
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
    b.cyl(m.brass, 66.4, r.maxZ + 0.7, 0, 0.3, 0.15, { seg: 8 });
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
  }

  /* ---------- santa marta cantina (north side of Mission street) ---------- */
  {
    const r = LOTS.santaMarta;
    solidBuilding(b, m, r, 4.4, m.brickCream, "flat");
    const fz = r.maxZ + DECOR_GAP;
    b.decal(signMat([""], 1.9, 2.7, { bg: "#241d16", fg: "#241d16", planked: true }), 71, 1.4, fz, 1.9, 2.7, "S");
    b.decal(signMat(["santa marta"], 1.8, 0.52, { bg: "#3b5233", fg: "#dfb44e" }), 71, 3.2, fz, 1.8, 0.52, "S");
    b.decal(posterMat("wanted"), 68.2, 2, fz, 0.85, 1.15, "S");
    b.box(m.iron, 69.7, 2.55, r.maxZ + 0.1, 69.84, 2.67, r.maxZ + 0.22, { collide: false });
    b.box(m.glassWarm, 69.68, 2.3, r.maxZ + 0.08, 69.86, 2.55, r.maxZ + 0.24, { collide: false });
    P.potPlant(b, m, 74.4, r.maxZ + 0.85);
    // "TO santa marta" road sign at the Main corner points east (D7 E view)
    b.box(m.woodDark, 55.2, 0, 27.6, 55.36, 3, 27.76);
    b.decal(signMat(["TO", "santa marta →"], 1.3, 0.8, { bg: "#3b5233", fg: "#dfb44e" }), 55.28, 2.5, 27.9, 1.3, 0.8, "S");
  }

  /* ---------- Mission (terminates the north view) ---------- */
  {
    const r = LOTS.mission;
    const d = streetDoor("mission");
    const wingTop = 4.6;
    const frontTop = 7.2;
    // south wall: portico stretch (west), tall door block (centre), sign stretch (east)
    wallX(b, m.adobeMission, r.minX, 46, r.maxZ, 0, wingTop, [], 0.5);
    wallX(b, m.adobeMission, 46, 58.5, r.maxZ, 0, frontTop, [doorGapOf(d, 0.04)], 0.5);
    wallX(b, m.adobeMission, 58.5, r.maxX, r.maxZ, 0, wingTop, [], 0.5);
    // west + east + north outer walls
    wallZ(b, m.adobeMission, r.minZ, r.maxZ, r.minX, 0, wingTop, [], 0.5);
    wallZ(b, m.adobeMission, r.minZ, r.maxZ, r.maxX, 0, wingTop, [], 0.5);
    wallX(b, m.adobeMission, r.minX, r.maxX, r.minZ, 0, wingTop, [], 0.5);
    // espadaña gable over the doors: stepped adobe + bell arches + cross
    b.box(m.adobeMission, 47.5, frontTop, r.maxZ - 0.6, 57, 8.6, r.maxZ + 0.1, { collide: false });
    b.box(m.adobeMission, 49, 8.6, r.maxZ - 0.6, 55.5, 9.8, r.maxZ + 0.1, { collide: false });
    b.box(m.adobeMission, 50.8, 9.8, r.maxZ - 0.6, 53.7, 10.7, r.maxZ + 0.1, { collide: false });
    b.box(m.woodDark, 52.1, 10.7, r.maxZ - 0.35, 52.4, 11.5, r.maxZ - 0.15, { collide: false });
    b.box(m.woodDark, 51.7, 11.1, r.maxZ - 0.35, 52.8, 11.3, r.maxZ - 0.15, { collide: false });
    P.bell(b, m, 51, 7.7, r.maxZ - 0.3, 0.3);
    P.bell(b, m, 53.4, 7.7, r.maxZ - 0.3, 0.3);
    // red tile copings
    b.box(m.tileRed, r.minX - 0.2, wingTop, r.maxZ - 0.75, 46.2, wingTop + 0.35, r.maxZ + 0.35, { collide: false });
    b.box(m.tileRed, 58.3, wingTop, r.maxZ - 0.75, r.maxX + 0.2, wingTop + 0.35, r.maxZ + 0.35, { collide: false });
    b.box(m.tileRed, 46, frontTop, r.maxZ - 0.75, 58.7, frontTop + 0.35, r.maxZ + 0.35, { collide: false });
    // sun-face disks flanking the doors + one further west (D6 N view)
    for (const sx of [47.8, 56.7, 42.5]) {
      b.decal(m.sunFace, sx, 2.4, r.maxZ + 0.28, 1.4, 1.4, "S");
    }
    // MISSION board + lamp post east of the doors (E7 N view)
    b.box(m.woodDark, 60.2, 0, r.maxZ + 0.9, 60.36, 2.7, r.maxZ + 1.06);
    b.decal(signMat(["MISSION"], 1.2, 0.45, { bg: "#4f382a", fg: "#e6dcba" }), 60.28, 2.3, r.maxZ + 1.1, 1.2, 0.45, "S");
    P.lampPost(b, m, 62.5, r.maxZ + 1.3, 3.3);
    // portico along the west stretch: tile shed roof on posts, pots below
    P.porchPosts(b, m, 0, 2.5, [
      [38, r.maxZ + 1.5],
      [41, r.maxZ + 1.5],
      [44, r.maxZ + 1.5],
    ], m.woodDark);
    P.porchRoof(b, m, 36.5, r.maxZ, 45.5, r.maxZ + 1.7, 2.5, 3.1, "S", m.tileRed);
    for (const px of [37.2, 39.5, 42.8]) {
      b.cyl(m.brickMayor, px, r.maxZ + 0.7, 0, 0.45, 0.3, { rTop: 0.36, seg: 8, collide: true });
    }
    // chili ristras on the wall under the portico
    for (const rx of [38.6, 41.8]) {
      b.box(m.curioRed, rx - 0.09, 1.3, r.maxZ + 0.52, rx + 0.09, 2.2, r.maxZ + 0.66, { collide: false });
    }
    // hanging lamp arm (D7 W view)
    b.box(m.woodDark, 45.2, 3.0, r.maxZ + 0.5, 45.35, 3.15, r.maxZ + 1.6, { collide: false });
    b.box(m.glassWarm, 45.18, 2.6, r.maxZ + 1.3, 45.38, 2.9, r.maxZ + 1.5, { collide: false });
    // bell gantry at the SW corner (E4 N / D5 N views): beam + three bells
    b.box(m.woodDark, 33.7, 0, 25.0, 34.0, 3.6, 25.3);
    b.box(m.woodDark, 33.6, 3.3, 24.6, 38.6, 3.6, 24.9, { collide: false });
    P.bell(b, m, 34.8, 2.55, 24.75, 0.34);
    P.bell(b, m, 36.2, 2.5, 24.75, 0.38);
    P.bell(b, m, 37.6, 2.55, 24.75, 0.34);
    // iron cage cart by the west wing (D4 N / E4 N views)
    {
      const cx = 29.5;
      const cz = 27;
      b.box(m.woodDark, cx - 1.5, 0.55, cz - 0.95, cx + 1.5, 0.75, cz + 0.95, { collide: true });
      for (let i = 0; i <= 6; i += 1) {
        const bx = cx - 1.35 + (i / 6) * 2.7;
        b.box(m.iron, bx - 0.03, 0.75, cz - 0.9, bx + 0.03, 2.15, cz - 0.84, { collide: false });
        b.box(m.iron, bx - 0.03, 0.75, cz + 0.84, bx + 0.03, 2.15, cz + 0.9, { collide: false });
      }
      b.box(m.iron, cx - 1.4, 2.15, cz - 0.95, cx + 1.4, 2.3, cz + 0.95, { collide: false });
      b.cyl(m.woodMid, cx - 1.1, cz - 1.05, 0, 1.1, 0.55, { seg: 10 });
      b.cyl(m.woodMid, cx + 1.1, cz + 1.05, 0, 1.1, 0.55, { seg: 10 });
      b.rotBox(m.woodDark, cx + 2.2, 0.5, cz, 1.5, 0.1, 0.1, 0.3, { collide: false });
    }
    // bell tower dome, rising inside the west courtyard corner
    {
      const tx = 44;
      const tz = 18;
      b.box(m.adobeMission, tx - 1.6, 0, tz - 1.6, tx + 1.6, 9.6, tz + 1.6);
      b.box(m.tileRed, tx - 1.9, 9.6, tz - 1.9, tx + 1.9, 10.0, tz + 1.9, { collide: false });
      b.cyl(m.adobeMission, tx, tz, 10.0, 12.2, 1.35, { seg: 8 });
      // arched openings suggested by dark decals
      for (const f of ["N", "S", "E", "W"] as const) {
        const off = 1.36;
        const dx = f === "E" ? off : f === "W" ? -off : 0;
        const dz = f === "S" ? off : f === "N" ? -off : 0;
        b.decal(signMat([""], 0.8, 1.5, { bg: "#241d16", fg: "#241d16" }), tx + dx, 11.1, tz + dz, 0.8, 1.5, f);
      }
      b.sphere(m.cream, tx, 12.9, tz, 1.45, 12);
      b.box(m.woodDark, tx - 0.08, 13.9, tz - 0.08, tx + 0.08, 14.7, tz + 0.08, { collide: false });
      b.box(m.woodDark, tx - 0.4, 14.3, tz - 0.08, tx + 0.4, 14.45, tz + 0.08, { collide: false });
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

  /* ---------- Sidewinder (G1 S) ---------- */
  {
    const r = LOTS.sidewinder;
    const d = streetDoor("sidewinder");
    shell(b, m.woodBlack, r, 0, 3.5, { N: [doorGapOf(d), ...winGaps("sidewinder", "N")] });
    buildWindows(b, m, "sidewinder");
    b.box(m.woodBlack, r.minX, 3.5, r.minZ - 0.04, r.maxX, 4.7, r.minZ + WALL_T);
    flatRoof(b, m, r, 3.5);
    const fz = r.minZ - 0.04 - DECOR_GAP;
    b.decal(
      signMat(["HIRAM SIDEWINDER", "Undertaking & Barbering"], 6.4, 1.4, { bg: "#ded6b6", fg: "#33261a", border: "#8a7a52" }),
      4.5,
      4.05,
      fz,
      6.4,
      1.4,
      "N",
    );
    P.boardwalkSlab(b, m, 0.2, r.minZ - 1.4, 8.8, r.minZ);
    P.barberPole(b, m, 1.1, r.minZ - 1.05);
    // coffins leaning outside + one on the ground (east alley)
    P.coffin(b, m, r.maxX + 0.6, 58, 0.15, true);
    P.coffin(b, m, r.maxX + 0.9, 60.5, 0.3, true);
    P.coffin(b, m, r.maxX + 1.6, 63.4, 0.5);
    P.barrel(b, m, r.maxX + 0.5, 64.8);
  }

  /* ---------- The Rattler (H4 W) ---------- */
  {
    const r = LOTS.rattler;
    const d = streetDoor("rattler");
    shell(b, m.rattlerGreen, r, 0, 3.5, { E: [doorGapOf(d), ...winGaps("rattler", "E")] });
    buildWindows(b, m, "rattler");
    b.box(m.rattlerGreen, r.maxX - WALL_T, 3.5, r.minZ, r.maxX + 0.04, 4.6, r.maxZ);
    flatRoof(b, m, r, 3.5);
    const fx = r.maxX + 0.04 + DECOR_GAP;
    b.decal(
      signMat(["The Rattler", "Chott Flippo, Editor"], 4.6, 1.15, { bg: "#ded6b6", fg: "#241d16", border: "#8a7a52" }),
      fx,
      4.0,
      60,
      4.6,
      1.15,
      "E",
    );
    b.decal(signMat(["WE PRINT ANYTHING"], 3.9, 0.42, { bg: "#49513a", fg: "#efeadb" }), fx, 2.79, 60.7, 3.9, 0.42, "E");
    b.decal(
      signMat(["THE NEWS TODAY", "The Rattler  5¢"], 1.2, 1.0, { bg: "#ddd2b0", fg: "#241d16", border: "#8a7a52" }),
      fx,
      1.7,
      63.4,
      1.2,
      1.0,
      "E",
    );
    // flat canopy porch
    P.boardwalkSlab(b, m, r.maxX, 56.2, r.maxX + 1.6, 64.4);
    P.porchPosts(b, m, 0.32, 3.0, [
      [r.maxX + 1.45, 56.7],
      [r.maxX + 1.45, 60.5],
      [r.maxX + 1.45, 64],
    ]);
    b.box(m.rattlerGreen, r.maxX, 3.0, 56, r.maxX + 1.7, 3.2, 64.6, { collide: false });
    b.cyl(m.brass, r.maxX + 0.5, 57.6, 0, 0.3, 0.15, { seg: 8 });
    // north wall on Neely: olive-green poster wall + news bundles
    const nz = r.minZ - DECOR_GAP;
    b.decal(posterMat("wanted"), 12.4, 2.1, nz, 0.85, 1.15, "N");
    b.decal(posterMat("circus"), 14.2, 1.9, nz, 0.85, 1.15, "N");
    b.decal(posterMat("repent"), 16.3, 2.15, nz, 0.85, 1.15, "N");
    b.decal(posterMat("news"), 18.1, 1.95, nz, 0.85, 1.15, "N");
    b.decal(posterMat("bishop"), 20.4, 2.1, nz, 0.85, 1.15, "N");
    b.decal(posterMat("wanted2"), 22.3, 1.9, nz, 0.85, 1.15, "N");
    for (let i = 0; i < 3; i += 1) {
      b.box(m.paper, 21.5 + i * 0.5, 0, 55.6 - 1.1, 22.1 + i * 0.5, 0.35 + (i % 2) * 0.15, 55.6 - 0.5);
    }
  }

  /* ---------- behind the Rattler: rock-city shed, outhouse, cart, hide ---------- */
  {
    const r = LOTS.rockCityShed;
    solidBuilding(b, m, r, 2.7, m.woodGray, "gableX", m.roofDark, 1.2);
    b.decal(signMat(["SEE ROCK CITY"], 2.6, 0.8, { bg: "#8a8478", fg: "#efeadb", border: "#5a554a" }), 17, 1.8, r.maxZ + DECOR_GAP, 2.6, 0.8, "S");
    // outhouse
    b.box(m.barnDark, 17.9, 0, 66.4, 19.1, 2.5, 67.6);
    b.cone(m.roofDark, 18.5, 67, 2.5, 2.9, 0.95, 4);
    b.decal(signMat([""], 0.6, 1.7, { bg: "#1e150d", fg: "#1e150d" }), 18.5, 1.0, 67.6 + DECOR_GAP, 0.6, 1.7, "S");
    // two-wheel canopy cart
    P.buckboard(b, m, 10.5, 66, 0.4);
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
    P.picketFence(b, m, r.minX, r.maxZ, r.maxX, r.maxZ, 1.2, m.woodDark); // south, along Neely
    P.picketFence(b, m, r.minX, r.minZ, r.maxX, r.minZ, 1.2, m.woodDark); // north
    P.picketFence(b, m, r.minX, r.minZ, r.minX, r.maxZ, 1.2, m.woodDark); // west
    // east fence with the SHADY ACRES gate opening (E4 W pose)
    P.picketFence(b, m, r.maxX, r.minZ, r.maxX, 33.5, 1.2, m.woodDark);
    P.picketFence(b, m, r.maxX, 39.5, r.maxX, r.maxZ, 1.2, m.woodDark);
    b.box(m.woodDark, r.maxX - 0.15, 0, 33.2, r.maxX + 0.15, 3.1, 33.55);
    b.box(m.woodDark, r.maxX - 0.15, 0, 39.45, r.maxX + 0.15, 3.1, 39.8);
    b.box(m.woodDark, r.maxX - 0.18, 3.0, 32.9, r.maxX + 0.18, 3.3, 40.1, { collide: false });
    b.decal(signMat(["SHADY ACRES"], 4, 0.7, { bg: "#33261a", fg: "#efeadb" }), r.maxX + 0.18 + DECOR_GAP, 2.6, 36.5, 4, 0.7, "E");
    P.oxSkull(b, m, r.maxX, 33.35, 3.32);
    // adobe gate posts near the Neely corner (G3 N view)
    b.box(m.brickCream, 17.6, 0, r.maxZ - 0.5, 18.5, 1.9, r.maxZ + 0.4);
    b.box(m.brickCream, 20.6, 0, r.maxZ - 0.5, 21.5, 1.9, r.maxZ + 0.4);
    // graves + dead tree + old wagon
    P.deadTree(b, m, 7, 38, 4.8);
    let k = 0;
    for (const [gx, gz] of [
      [3, 31.5], [5.5, 33], [8.5, 31], [11, 32.5], [14, 31.2], [17, 33], [19.5, 31.6],
      [3.5, 36.5], [6.5, 38.2], [10, 36.8], [13, 37.5], [16, 36.2], [19, 38],
      [2.5, 42], [5, 44.5], [8, 43], [11.5, 44.8], [14.5, 42.6], [17.5, 44.2], [20, 42.8],
      [4, 46.2], [9.5, 46.5], [15, 46.1], [19.5, 46.4],
    ] as const) {
      P.gravestone(b, m, gx, gz, k);
      k += 1;
    }
    P.buckboard(b, m, 4, 41, 0.15);
    P.saguaro(b, m, 21.5, 30.5, 2.6);
    P.saguaro(b, m, 1.8, 34.8, 3.4);
  }

  /* ---------- Neely west props + green poster wall backdrop ---------- */
  {
    // ammunition crate + barrels along the south side (G3 S view)
    P.crate(b, m, 11, 65.5, 1, 0.8, 0.2, m.woodStage);
    b.decal(signMat(["AMMUNITION"], 0.9, 0.3, { bg: "#a98e66", fg: "#33261a" }), 11, 0.5, 65.0 - DECOR_GAP + 0.06, 0.9, 0.3, "N");
    P.barrel(b, m, 9.8, 64.7);
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
    buildWindows(b, m, "livery");
    b.box(m.woodStage, r.minX - 0.04, 3.6, r.minZ, r.minX + WALL_T, 5.2, r.maxZ);
    P.gableRoof(b, m, r.minX, r.minZ, r.maxX, r.maxZ, 3.6, 5.4, "x", m.roofDark);
    const fx = r.minX - 0.04 - DECOR_GAP;
    b.decal(signMat(["LIVERY"], 4.6, 1.2, { bg: "#241d16", fg: "#dfb44e", border: "#0f0c08" }), fx, 4.4, 45, 4.6, 1.2, "W");
    // sacks + barrel + crate + chair out front
    P.sack(b, m, r.minX - 0.8, 47.6);
    P.sack(b, m, r.minX - 1.3, 47.9);
    P.sack(b, m, r.minX - 0.95, 48.3, 0.4);
    P.barrel(b, m, r.minX - 0.7, 49.6);
    P.crate(b, m, r.minX - 0.8, 41.2, 0.85, 0.7, 0.15);
    P.chair(b, m, r.minX - 0.7, 43.4, Math.PI / 2);
    b.cyl(m.white, r.minX - 1.4, 44.6, 0, 0.55, 0.16, { seg: 8 }); // milk can
    // south brick-ish wall + posters over the G11 alley
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
    for (const pz of [f.minZ, 61, gz0, gz1, 73.5, f.maxZ]) {
      pillar(f.minX, pz);
    }
    const fenceSeg = (x0: number, z0: number, x1: number, z1: number): void => {
      P.picketFence(b, m, x0, z0, x1, z1, 2.15, m.woodBlack);
    };
    fenceSeg(f.minX, f.minZ, f.minX, 61);
    fenceSeg(f.minX, 61, f.minX, gz0);
    fenceSeg(f.minX, gz1, f.minX, 73.5);
    fenceSeg(f.minX, 73.5, f.minX, f.maxZ);
    // north run with LEE board + MACINTOSH graffiti (G10 E / G11 S views)
    for (const px of [84.5, 89, 93.5, f.maxX]) {
      pillar(px, f.minZ);
    }
    fenceSeg(f.minX, f.minZ, f.maxX, f.minZ);
    b.decal(signMat(["LEE"], 1.2, 0.45, { bg: "#efeadb", fg: "#241d16" }), 83, 1.8, f.minZ - 0.05 - DECOR_GAP, 1.2, 0.45, "N");
    b.decal(
      signMat(["MACINTOSH IS A", "SON OF A B——"], 3.4, 1.0, { bg: "#241d16", fg: "#efeadb", font: "cursive" }),
      90.5,
      1.5,
      f.minZ - 0.05 - DECOR_GAP,
      3.4,
      1.0,
      "N",
    );
    // south + east runs
    for (const px of [84.5, 89, 93.5, f.maxX]) {
      pillar(px, f.maxZ);
    }
    fenceSeg(f.minX, f.maxZ, f.maxX, f.maxZ);
    fenceSeg(f.maxX, f.minZ, f.maxX, f.maxZ);
    // lanterns on the gate pillars + lantern arm over the gate
    for (const pz of [gz0, gz1]) {
      b.box(m.iron, f.minX - 0.5, 2.15, pz - 0.07, f.minX - 0.38, 2.27, pz + 0.07, { collide: false });
      b.box(m.glassWarm, f.minX - 0.52, 1.9, pz - 0.1, f.minX - 0.36, 2.15, pz + 0.1, { collide: false });
    }
    P.potPlant(b, m, f.minX - 0.9, gz1 + 1.1);
    // gold M plaque above the gate (the gate leaves carry the emblem)
    b.box(m.iron, f.minX - 0.08, 2.9, gate.z - 1.6, f.minX + 0.08, 3.05, gate.z + 1.6, { collide: false });
    b.decal(signMat(["M"], 0.7, 0.55, { bg: "#241d16", fg: "#dfb44e", border: "#dfb44e" }), f.minX - 0.08 - DECOR_GAP, 3.35, gate.z, 0.7, 0.55, "W");
    b.box(m.iron, f.minX - 0.06, 3.05, gate.z - 0.5, f.minX + 0.06, 3.7, gate.z + 0.5, { collide: false });

    // brick walk from gate to the mansion door
    b.flat(m.brickMayor, f.minX, gate.z - 1.1, LOTS.mansion.minX, gate.z + 1.1, 0.02);

    // mansion: cream two-story, brown shutters, gable + chimneys, porch
    const r = LOTS.mansion;
    const front = { from: 65.75, to: 67.45, top: 2.72 };
    shell(b, m.woodWhite, r, 0, 7.2, { W: [front, ...winGaps("mansion", "W")] });
    buildWindows(b, m, "mansion");
    P.gableRoof(b, m, r.minX, r.minZ, r.maxX, r.maxZ, 7.2, 9.4, "x", m.roofDark);
    for (const chx of [90, 96]) {
      b.box(m.brickMayor, chx - 0.45, 8.4, 63 - 0.45, chx + 0.45, 10.4, 63 + 0.45, { collide: false });
    }
    const fx = r.minX - DECOR_GAP;
    // brown shutters flanking every front window
    for (const wz of [59.5, 62, 70, 72.5]) {
      for (const wy of [1.9, 5.3]) {
        b.box(m.woodMid, r.minX - 0.06, wy - 0.75, wz - 0.85, r.minX - 0.02, wy + 0.75, wz - 0.55, { collide: false });
        b.box(m.woodMid, r.minX - 0.06, wy - 0.75, wz + 0.55, r.minX - 0.02, wy + 0.75, wz + 0.85, { collide: false });
      }
    }
    // porch around the front door (aligned with the gate walk)
    P.boardwalkSlab(b, m, r.minX - 1.8, 64.2, r.minX, 69, 0.3);
    P.porchPosts(b, m, 0.3, 3.0, [
      [r.minX - 1.6, 64.6],
      [r.minX - 1.6, 68.6],
    ], m.woodWhite);
    P.porchRoof(b, m, r.minX - 1.9, 64, r.minX, 69.2, 3.0, 3.4, "W");
    b.decal(signMat(["M"], 0.6, 0.5, { bg: "#efeadb", fg: "#dfb44e", border: "#b08d3f" }), fx, 3.9, 66.6, 0.6, 0.5, "W");
    // grounds: trees + a red-roof outbuilding tucked behind the mansion
    solidBuilding(b, m, { minX: 88, minZ: 76, maxX: 96.5, maxZ: 79.6 } as Rect, 2.6, m.woodMid, "gableX", m.roofRed, 1.1);
    for (const [tx, tz] of [
      [83.5, 62],
      [84.2, 74],
      [94, 77.8],
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
    // Day-south dark barn + picket fence + range
    solidBuilding(b, m, { minX: 62, minZ: 88.5, maxX: 74, maxZ: 96 } as Rect, 3.4, m.barnDark, "gableX", m.roofDark, 1.6);
    b.decal(posterMat("wanted"), 63.5, 2, 88.5 - DECOR_GAP, 0.85, 1.15, "N");
    b.decal(posterMat("circus"), 65.2, 1.85, 88.5 - DECOR_GAP, 0.85, 1.15, "N");
    P.picketFence(b, m, 74.5, 88.3, 85.5, 88.3, 1.6, m.fenceGray);
    P.picketFence(b, m, 90.5, 88.3, 96, 88.3, 1.6, m.fenceGray);
    // TARGET AND RIFLE RANGE banner over the gap (K11 S view)
    b.box(m.woodDark, 86, 0, 88.1, 86.3, 3.6, 88.4);
    b.box(m.woodDark, 90, 0, 88.1, 90.3, 3.6, 88.4);
    b.decal(
      signMat(["TARGET AND RIFLE RANGE"], 4.6, 0.7, { bg: "#8d7350", fg: "#241d16", border: "#4f382a" }),
      88.15,
      3.2,
      88.05 - DECOR_GAP,
      4.6,
      0.7,
      "N",
    );
    // target rack: dark board with white diamonds
    b.box(m.woodBlack, 70, 0, 99.4, 82, 1.9, 99.8);
    for (let i = 0; i < 7; i += 1) {
      b.decal(
        signMat(["◆"], 0.8, 0.8, { bg: "#241d16", fg: "#efeadb" }),
        71.4 + i * 1.6,
        1.2,
        99.4 - DECOR_GAP,
        0.8,
        0.8,
        "N",
      );
    }
    b.decal(signMat(["TARGET AND RIFLE RANGE"], 3.4, 0.5, { bg: "#ddd2b0", fg: "#241d16" }), 76, 0.45, 99.4 - DECOR_GAP, 3.4, 0.5, "N");
    // SEE ROCK CITY tank + SE windmill + corral rails + cacti rows
    {
      const tx = 78;
      const tz = 96.5;
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
    P.windmill(b, m, 92.5, 90.5, 8.5);
    P.railFence(b, m, 60, 104, 96, 104, 2, 1.2, m.woodGray);
    P.railFence(b, m, 96, 88.3, 96, 104, 2, 1.2, m.woodGray);
    for (const [cx2, cz2] of [
      [76, 91.5],
      [80, 93],
      [84, 91],
      [88, 94],
      [92, 92],
      [95, 84],
      [90, 80],
    ] as const) {
      P.saguaro(b, m, cx2, cz2, 2.4 + ((cx2 + cz2) % 3) * 0.5);
    }
    P.oxSkull(b, m, 82, 86);
    P.oxSkull(b, m, 96.5, 80.5);
  }

  /* =========== FARM SOUTH-WEST + DAY WEST =========== */
  {
    solidBuilding(b, m, LOTS.wheelwright, 3.8, m.woodBlack, "gableX", m.roofDark, 1.6);
    b.decal(signMat([""], 1.6, 2.4, { bg: "#17120d", fg: "#17120d", planked: true }), 11, 1.25, LOTS.wheelwright.maxZ + DECOR_GAP, 1.6, 2.4, "S");
    b.box(m.iron, 10.6, 3.35, 75 - 0.06, 10.74, 3.47, 75 + 0.06, { collide: false });
    b.box(m.glassWarm, 10.58, 3.1, 75 - 0.09, 10.76, 3.35, 75 + 0.09, { collide: false });
    windowRow(b, winCold, "S", LOTS.wheelwright.maxZ + DECOR_GAP, [7.4, 14.6], 1.9, 1.2, 1.4);

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
    // horseshoes over the door
    b.decal(signMat(["U U"], 1.3, 0.5, { bg: "#8a8478", fg: "#3a3630" }), gb.maxX + DECOR_GAP, 3.15, 92.5, 1.3, 0.5, "E");
    P.crate(b, m, gb.maxX + 0.9, 95.2, 0.9, 0.7, 0.2);
    P.sack(b, m, gb.maxX + 0.8, 90);
    // posters + hitch rail on the north face (K2 S view)
    b.decal(posterMat("wanted"), 12, 2.0, gb.minZ - DECOR_GAP, 0.85, 1.15, "N");
    b.decal(posterMat("bishop"), 10.2, 1.9, gb.minZ - DECOR_GAP, 0.85, 1.15, "N");
    P.hitchRail(b, m, 8.5, gb.minZ - 1, 13.5, gb.minZ - 1);

    // farmhouse (K4 S): gray clapboard, horseshoe over the brown door
    const fh = LOTS.farmhouse;
    solidBuilding(b, m, fh, 3.2, m.woodGray, "gableX", m.roofDark, 1.8);
    const fhz = fh.minZ - DECOR_GAP;
    b.decal(signMat([""], 1.2, 2.3, { bg: "#4a3320", fg: "#4a3320", planked: true }), 29, 1.2, fhz, 1.2, 2.3, "N");
    b.decal(signMat(["U"], 0.5, 0.4, { bg: "#8a8478", fg: "#3a3630" }), 29, 2.65, fhz, 0.5, 0.4, "N");
    b.decal(winWarm, 26.6, 1.7, fhz, 1.1, 1.2, "N");
    b.decal(winCold, 31.6, 1.7, fhz, 1.1, 1.2, "N");
    b.flat(m.boardwalk, 28.3, fh.minZ - 0.9, 29.7, fh.minZ, 0.05);

    // black barn on the L3 spur
    solidBuilding(b, m, LOTS.blackBarn, 3.6, m.woodBlack, "gableZ", m.roofRed, 2);

    // (the pale adobe east of the well IS the jail's west wall — the
    // "gray adobe house" of L5 E / K5 S; its dressing lives with the jail)

    // the well, just south of the L5 pose (it looks straight at it)
    P.well(b, m, 37.8, 97.2);
    P.railFence(b, m, 34.3, 94.8, 34.3, 99.5, 2, 1.15);
    P.railFence(b, m, 34.3, 99.5, 40.6, 99.5, 2, 1.15);
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
    // corral rails north of the cantina, clear of the mission + streets
    P.railFence(b, m, 66.2, 13.8, 80, 13.8, 3, 1.3);
    P.railFence(b, m, 80, 13.8, 80, 20, 3, 1.3);
    P.railFence(b, m, 76.2, 14, 76.2, 15.8, 2, 1.2);
    // rails lining the north edge of Mission street toward the barn
    P.railFence(b, m, 76.2, 24.15, 79.6, 24.15, 3, 1.25);
    // GLUE crates by the livery's north corner (E10 E view)
    P.crate(b, m, 81.2, 35.1, 0.95, 0.85, 0.1, m.woodStage);
    P.crate(b, m, 81.0, 34.7, 0.8, 0.7, 0.25, m.woodStage);
    b.decal(signMat(["GLUE"], 0.8, 0.4, { bg: "#a98e66", fg: "#33261a" }), 81.2, 0.55, 35.65 + DECOR_GAP, 0.8, 0.4, "S");
    b.decal(signMat(["GLUE"], 0.7, 0.35, { bg: "#a98e66", fg: "#33261a" }), 81.0, 1.1, 35.15 + DECOR_GAP, 0.7, 0.35, "S");
    b.cyl(m.white, 82.4, 34.6, 0, 0.55, 0.16, { seg: 8 });
    P.wagonWheel(b, m, 83.2, 0, 35.8, 0.7, 0.28);
  }

  /* ---------- street lamps + name boards ---------- */
  {
    // corner lamps hug the crossings from the street side (never
    // inside a lot footprint)
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
      [42.5, 97.5, 3.2], [45.5, 99.5, 2.4], [30, 27.5, 3.0], [27, 30, 2.2],
      [24.5, 25, 3.4], [69.5, 11.5, 3.0], [92, 60, 2.6], [2, 51.5, 2.8],
      [30.5, 51, 2.2], [72, 17, 2.4], [82.5, 12.5, 3.0],
    ] as const) {
      P.saguaro(b, m, cx, cz, ch);
    }
    P.barrel(b, m, 46.6, 54.8);
    P.barrel(b, m, 57.2, 49.2);
    P.barrel(b, m, 55, 30.2);
    P.trough(b, m, 54.6, 73, 2.0, false);
    P.oxSkull(b, m, 51, 118.5);
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
