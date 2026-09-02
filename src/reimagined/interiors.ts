/**
 * Interiors. Each room follows its interior SET: the walkable tile
 * grid (scaled by that SET's camZ, see layout.ts) fixes the plan, the
 * stills fix where the bar, stairs, counters and doors are, and the
 * whole thing nests inside the exterior footprint. Room builders live
 * in rooms-west.ts / rooms-east.ts / rooms-far.ts; this module owns
 * the shared helpers, the interior door registry and the assembly.
 */
import * as THREE from "three";
import type { Facing } from "./coords";
import { Builder } from "./geometry";
import { STOREY, WALL_T, type DoorSpec } from "./layout";
import type { Mats } from "./materials";
import * as P from "./props";
import { boardTex, posterTex, type BoardOpts, type PosterKind } from "./textures";
import { doorGapOf, wallX, wallZ, type Gap } from "./town";
import { buildWestRooms } from "./rooms-west";
import { buildEastRooms } from "./rooms-east";
import { buildFarRooms } from "./rooms-far";

/** Default room height under a ceiling slab. */
export const CEIL = 3.3;

export interface PointLightSpec {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}

export interface InteriorsResult {
  group: THREE.Group;
  builder: Builder;
  lights: PointLightSpec[];
}

/**
 * Interior doors (clickable, swing). y > 0 for upper floors. `side`
 * is the face the player meets first (the leaf's outward normal).
 */
export const INTERIOR_DOORS: readonly DoorSpec[] = [
  { id: "doctorInner", pose: "doctor1 B1 W", side: "E", x: 43, y: 0, z: 35.3, width: 1.2, height: 2.45, swing: 1, label: "Dr. Rodham — office" },
  { id: "jailCell", pose: "jail A1 E", side: "E", x: 42.9, y: 0, z: 90.2, width: 0.9, height: 2.5, swing: 1, label: "Cell", gate: true },
  { id: "school", pose: "court C3 N", side: "S", x: 52, y: 0, z: 2.5, width: 2.5, height: 2.9, swing: -1, label: "Schoolhouse", double: true },
  { id: "padre", pose: "school A2 W", side: "E", x: 44.5, y: 0, z: -1, width: 1.2, height: 2.4, swing: 1, label: "Padre's room" },
  { id: "salUp4", pose: "salupper A1 N", side: "S", x: 36.7, y: STOREY, z: 62.5, width: 1.1, height: 2.3, swing: 1, label: "Room 4 — Ruby" },
  { id: "salUp1", pose: "salupper A3 E", side: "W", x: 38.3, y: STOREY, z: 69.9, width: 1.05, height: 2.3, swing: -1, label: "Room 1 — Oona" },
  { id: "hotRoom", pose: "hotupper C4 W", side: "E", x: 64, y: STOREY, z: 45.3, width: 1.15, height: 2.3, swing: 1, label: "Room 3" },
  { id: "mayorFront", pose: "mayhall C4 S", side: "W", x: 86, y: 0, z: 67.9, width: 1.5, height: 2.6, swing: 1, label: "Mansion door", glazed: true },
  { id: "mayorStudy", pose: "mayhall C3 W", side: "S", x: 89.5, y: 0, z: 65.7, width: 1.6, height: 2.5, swing: 1, label: "Study", double: true },
  { id: "mayorDine", pose: "mayhall C3 E", side: "N", x: 89.5, y: 0, z: 70.1, width: 1.6, height: 2.5, swing: -1, label: "Dining room", double: true },
  { id: "mayorBed", pose: "mayupper B1 N", side: "S", x: 89.6, y: STOREY, z: 64.0, width: 1.2, height: 2.4, swing: 1, label: "Bedroom" },
];

export function interiorDoor(id: string): DoorSpec {
  const d = INTERIOR_DOORS.find((s) => s.id === id);
  if (!d) {
    throw new Error(`no interior door ${id}`);
  }
  return d;
}

export interface RoomOpts {
  /** null skips the floor plane (upper rooms sit on slab boxes). */
  floor?: THREE.Material | null;
  ceil?: THREE.Material | null;
  ceilY?: number;
  y0?: number;
  wainscot?: THREE.Material;
  wainscotH?: number;
  gaps?: { N?: Gap[]; S?: Gap[]; E?: Gap[]; W?: Gap[] };
  /** Skip lining panels on these sides (open arcades, shared walls). */
  skip?: Facing[];
}

/** Everything a room builder needs. */
export interface Ctx {
  b: Builder;
  m: Mats;
  lights: PointLightSpec[];
  /** Warm point light. */
  warm: (x: number, y: number, z: number, intensity?: number, distance?: number) => void;
  /** Cool / green lamp light. */
  light: (x: number, y: number, z: number, color: number, intensity?: number, distance?: number) => void;
  signMat: (lines: string[], w: number, h: number, opts?: BoardOpts) => THREE.MeshLambertMaterial;
  posterMat: (kind: PosterKind) => THREE.MeshLambertMaterial;
  /**
   * Wall linings + floor + ceiling for a room's AIR volume: x0..x1 and
   * z0..z1 are the inner wall faces (a lot edge + WALL_T, or a
   * partition face). Panels hang 6 cm inside those faces.
   */
  lining: (mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, opts?: RoomOpts) => void;
  /** Interior partition along X at z, or along Z at x (0.2 thick). */
  partX: (mat: THREE.Material, x0: number, x1: number, z: number, y0: number, y1: number, gaps?: Gap[], t?: number) => void;
  partZ: (mat: THREE.Material, z0: number, z1: number, x: number, y0: number, y1: number, gaps?: Gap[], t?: number) => void;
  gapOf: (spec: DoorSpec, extra?: number) => Gap;
  door: (id: string) => DoorSpec;
}

function matOf(tex: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: tex });
}

/* ------------------------------------------------------------------ */

export function buildInteriors(m: Mats): InteriorsResult {
  const group = new THREE.Group();
  const b = new Builder();
  const lights: PointLightSpec[] = [];
  const posterCache = new Map<PosterKind, THREE.MeshLambertMaterial>();

  const ctx: Ctx = {
    b,
    m,
    lights,
    warm: (x, y, z, intensity = 16, distance = 9) => {
      lights.push({ x, y, z, color: 0xffd2a0, intensity, distance });
    },
    light: (x, y, z, color, intensity = 10, distance = 7) => {
      lights.push({ x, y, z, color, intensity, distance });
    },
    signMat: (lines, w, h, opts) => matOf(boardTex(lines, w, h, opts)),
    posterMat: (kind) => {
      let mm = posterCache.get(kind);
      if (!mm) {
        mm = matOf(posterTex(kind));
        posterCache.set(kind, mm);
      }
      return mm;
    },
    lining: (mat, x0, z0, x1, z1, opts = {}) => {
      const y0 = opts.y0 ?? 0;
      const ceilY = opts.ceilY ?? y0 + CEIL;
      const g = opts.gaps ?? {};
      const skip = new Set(opts.skip ?? []);
      // The panel sits mostly inside the shell / partition it dresses
      // and stands 1 cm proud of the air face, so wall props placed at
      // that face (frames, shelves, decals at +0.012) are never buried.
      const t = 0.06;
      const off = -0.02;
      if (!skip.has("N")) {
        wallX(b, mat, x0, x1, z0 + off, y0, ceilY, g.N ?? [], t);
      }
      if (!skip.has("S")) {
        wallX(b, mat, x0, x1, z1 - off, y0, ceilY, g.S ?? [], t);
      }
      if (!skip.has("W")) {
        wallZ(b, mat, z0, z1, x0 + off, y0, ceilY, g.W ?? [], t);
      }
      if (!skip.has("E")) {
        wallZ(b, mat, z0, z1, x1 - off, y0, ceilY, g.E ?? [], t);
      }
      if (opts.wainscot) {
        const wt = 0.05;
        const woff = 0.035; // 0.01..0.06 proud of the air face
        const wh = y0 + (opts.wainscotH ?? 1.0);
        if (!skip.has("N")) {
          wallX(b, opts.wainscot, x0, x1, z0 + woff, y0, wh, g.N ?? [], wt);
        }
        if (!skip.has("S")) {
          wallX(b, opts.wainscot, x0, x1, z1 - woff, y0, wh, g.S ?? [], wt);
        }
        if (!skip.has("W")) {
          wallZ(b, opts.wainscot, z0, z1, x0 + woff, y0, wh, g.W ?? [], wt);
        }
        if (!skip.has("E")) {
          wallZ(b, opts.wainscot, z0, z1, x1 - woff, y0, wh, g.E ?? [], wt);
        }
      }
      if (opts.floor !== null) {
        b.flat(opts.floor ?? m.floorWood, x0, z0, x1, z1, y0 + 0.03);
      }
      if (opts.ceil !== null) {
        b.box(opts.ceil ?? m.woodDark, x0, ceilY, z0, x1, ceilY + 0.12, z1);
      }
    },
    partX: (mat, x0, x1, z, y0, y1, gaps = [], t = 0.2) => wallX(b, mat, x0, x1, z, y0, y1, gaps, t),
    partZ: (mat, z0, z1, x, y0, y1, gaps = [], t = 0.2) => wallZ(b, mat, z0, z1, x, y0, y1, gaps, t),
    gapOf: (spec, extra = 0.1) => doorGapOf(spec, extra),
    door: interiorDoor,
  };

  buildWestRooms(ctx);
  buildEastRooms(ctx);
  buildFarRooms(ctx);

  // every swung leaf hangs in a real frame: jambs + head in the gap
  for (const spec of INTERIOR_DOORS) {
    if (spec.gate) {
      continue;
    }
    const mission = spec.id === "school" || spec.id === "padre";
    const t = mission ? 0.5 : spec.id === "mayorFront" ? WALL_T : 0.2;
    const extra = spec.id === "school" ? 0.15 : spec.id === "padre" ? 0.1 : 0.08;
    P.doorFrame(b, m, spec, extra, t, mission ? m.woodBlack : m.woodDark);
  }

  b.build(group);
  return { group, builder: b, lights };
}
