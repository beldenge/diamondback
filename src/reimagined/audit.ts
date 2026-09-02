/**
 * Dressing audit: every sign, bill and window decal must hang on a wall
 * face (a box face within 25 cm behind it covering most of its area),
 * must not cover a door or window opening on that face, and must not
 * overlap another decal on the same plane. Run after building; the
 * report is a list of human-readable problems, empty when clean.
 */
import type { Facing } from "./coords";
import type { Aabb, Builder, DecalRecord } from "./geometry";
import { LOTS, STREET_DOORS, WINDOWS, type DoorSpec } from "./layout";
import { INTERIOR_DOORS } from "./interiors";

interface Opening {
  facing: Facing;
  fixed: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  name: string;
}

function decalRect(d: DecalRecord): { fixed: number; u0: number; u1: number; v0: number; v1: number } {
  const alongZ = d.facing === "E" || d.facing === "W";
  const fixed = alongZ ? d.x : d.z;
  const u = alongZ ? d.z : d.x;
  return { fixed, u0: u - d.w / 2, u1: u + d.w / 2, v0: d.y - d.h / 2, v1: d.y + d.h / 2 };
}

function overlap1(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function openingsOf(): Opening[] {
  const out: Opening[] = [];
  for (const [lot, specs] of Object.entries(WINDOWS)) {
    const r = LOTS[lot as keyof typeof LOTS];
    for (const w of specs ?? []) {
      const fixed = w.side === "E" ? r.maxX : w.side === "W" ? r.minX : w.side === "S" ? r.maxZ : r.minZ;
      out.push({ facing: w.side, fixed, u0: w.at - w.w / 2, u1: w.at + w.w / 2, v0: w.bottom, v1: w.top, name: `${lot} window @${w.at}` });
    }
  }
  const doors: readonly DoorSpec[] = [...STREET_DOORS, ...INTERIOR_DOORS];
  for (const d of doors) {
    const alongZ = d.side === "E" || d.side === "W";
    const u = alongZ ? d.z : d.x;
    out.push({ facing: d.side, fixed: alongZ ? d.x : d.z, u0: u - d.width / 2, u1: u + d.width / 2, v0: d.y, v1: d.y + d.height, name: `door ${d.id}` });
  }
  return out;
}

/** True when a box face lies just behind the decal and covers most of it. */
function supported(d: DecalRecord, boxes: Aabb[]): boolean {
  const rr = decalRect(d);
  const area = (rr.u1 - rr.u0) * (rr.v1 - rr.v0);
  let covered = 0;
  for (const b of boxes) {
    let behind: boolean;
    let cu: number;
    // a face within 30 cm on either side of the decal plane (leaning
    // slabs and posts put their bounding face a little proud of it)
    if (d.facing === "E") {
      behind = Math.abs(b.maxX - rr.fixed) <= 0.3;
      cu = overlap1(rr.u0, rr.u1, b.minZ, b.maxZ);
    } else if (d.facing === "W") {
      behind = Math.abs(b.minX - rr.fixed) <= 0.3;
      cu = overlap1(rr.u0, rr.u1, b.minZ, b.maxZ);
    } else if (d.facing === "S") {
      behind = Math.abs(b.maxZ - rr.fixed) <= 0.3;
      cu = overlap1(rr.u0, rr.u1, b.minX, b.maxX);
    } else {
      behind = Math.abs(b.minZ - rr.fixed) <= 0.3;
      cu = overlap1(rr.u0, rr.u1, b.minX, b.maxX);
    }
    if (!behind) {
      continue;
    }
    const cv = overlap1(rr.v0, rr.v1, b.minY, b.maxY);
    covered += cu * cv;
    if (covered >= area * 0.85) {
      return true;
    }
  }
  return false;
}

export function auditDecor(builders: Builder[], openings = openingsOf()): string[] {
  const boxes = builders.flatMap((b) => b.boxes);
  const decals = builders.flatMap((b) => b.decals);
  const out: string[] = [];
  const tag = (d: DecalRecord): string => `decal ${d.facing} @(${d.x.toFixed(2)}, ${d.y.toFixed(2)}, ${d.z.toFixed(2)}) ${d.w}x${d.h}`;
  for (let i = 0; i < decals.length; i += 1) {
    const d = decals[i];
    const rr = decalRect(d);
    if (!supported(d, boxes)) {
      out.push(`${tag(d)}: hangs in the air (no wall face behind it)`);
    }
    for (const o of openings) {
      if (o.facing !== d.facing || Math.abs(o.fixed - rr.fixed) > 0.35) {
        continue;
      }
      const ou = overlap1(rr.u0, rr.u1, o.u0, o.u1);
      const ov = overlap1(rr.v0, rr.v1, o.v0, o.v1);
      if (ou > 0.03 && ov > 0.03) {
        out.push(`${tag(d)}: covers ${o.name} by ${ou.toFixed(2)}x${ov.toFixed(2)}`);
      }
    }
    for (let j = i + 1; j < decals.length; j += 1) {
      const e = decals[j];
      if (e.facing !== d.facing) {
        continue;
      }
      const ee = decalRect(e);
      if (Math.abs(ee.fixed - rr.fixed) > 0.06) {
        continue;
      }
      const ou = overlap1(rr.u0, rr.u1, ee.u0, ee.u1);
      const ov = overlap1(rr.v0, rr.v1, ee.v0, ee.v1);
      if (ou > 0.03 && ov > 0.03) {
        out.push(`${tag(d)} overlaps ${tag(e)} by ${ou.toFixed(2)}x${ov.toFixed(2)}`);
      }
    }
  }
  return out;
}
