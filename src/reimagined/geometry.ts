import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { buildSignAtlas, isAtlasableMaterial, isAtlasableTexture } from "./atlas";
import type { Facing } from "./coords";

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface DecalRecord {
  facing: Facing;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

export interface DecalOpts {
  /** Skip the dressing audit (a label on a drum, a bill pinned inside a window). */
  audit?: boolean;
}

export interface DecalOpts {
  /** Skip the dressing audit (a label on a drum, a bill pinned inside a window). */
  audit?: boolean;
}

export function aabb(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): Aabb {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Scale BoxGeometry UVs to world units so tiling textures stay square. */
function worldUvBox(geom: THREE.BoxGeometry, w: number, h: number, d: number, texWorld: number): void {
  const uv = geom.getAttribute("uv") as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z; 4 verts each.
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f += 1) {
    const [du, dv] = dims[f];
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * du) / texWorld, (uv.getY(i) * dv) / texWorld);
    }
  }
  uv.needsUpdate = true;
}

const FACING_ROT_Y: Record<Facing, number> = {
  N: Math.PI, // plane +Z normal turned to look north (−Z)
  S: 0,
  E: Math.PI / 2,
  W: -Math.PI / 2,
};

/**
 * Accumulates boxes / cylinders / planes per material, merges them into
 * one mesh per material, and collects static collision AABBs.
 */
export class Builder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** Materials used by `decal` quads and nothing else — atlas candidates. */
  private quadOnly = new Set<THREE.Material>();

  readonly colliders: Aabb[] = [];

  /** Every axis-aligned box, collidable or not: the surfaces decals can hang on. */
  readonly boxes: Aabb[] = [];

  /** Every decal placed, for the dressing audit (see `auditDecor`). */
  readonly decals: DecalRecord[] = [];

  private push(mat: THREE.Material, geom: THREE.BufferGeometry, quad = false): void {
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
      if (quad) {
        this.quadOnly.add(mat);
      }
    } else if (!quad) {
      this.quadOnly.delete(mat);
    }
    list.push(geom);
  }

  solid(box: Aabb): void {
    this.colliders.push(box);
  }

  /** Axis-aligned box from min/max corners. */
  box(
    mat: THREE.Material,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    opts: { collide?: boolean; texWorld?: number } = {},
  ): void {
    const w = maxX - minX;
    const h = maxY - minY;
    const d = maxZ - minZ;
    if (w <= 0 || h <= 0 || d <= 0) {
      return;
    }
    const geom = new THREE.BoxGeometry(w, h, d);
    const texWorld = opts.texWorld ?? (mat.userData?.texWorld as number | undefined) ?? 2.5;
    worldUvBox(geom, w, h, d, texWorld);
    geom.translate(minX + w / 2, minY + h / 2, minZ + d / 2);
    this.push(mat, geom);
    this.boxes.push(aabb(minX, minY, minZ, maxX, maxY, maxZ));
    if (opts.collide !== false) {
      this.solid(aabb(minX, minY, minZ, maxX, maxY, maxZ));
    }
  }

  /** Box given centre + size + yaw (decor / props; AABB approximated). */
  rotBox(
    mat: THREE.Material,
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    rotY = 0,
    opts: { collide?: boolean; rotZ?: number; rotX?: number; texWorld?: number } = {},
  ): void {
    const geom = new THREE.BoxGeometry(w, h, d);
    const texWorld = opts.texWorld ?? (mat.userData?.texWorld as number | undefined) ?? 2.5;
    worldUvBox(geom, w, h, d, texWorld);
    if (opts.rotX) {
      geom.rotateX(opts.rotX);
    }
    if (opts.rotZ) {
      geom.rotateZ(opts.rotZ);
    }
    if (rotY) {
      geom.rotateY(rotY);
    }
    geom.translate(cx, cy, cz);
    this.push(mat, geom);
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (bb) {
      this.boxes.push(aabb(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z));
      if (opts.collide) {
        this.solid(aabb(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z));
      }
    }
  }

  /** Push an already-positioned geometry for merging. */
  mesh(mat: THREE.Material, geom: THREE.BufferGeometry): void {
    this.push(mat, geom);
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (bb) {
      this.boxes.push(aabb(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z));
    }
  }

  cyl(
    mat: THREE.Material,
    x: number,
    z: number,
    y0: number,
    y1: number,
    r: number,
    opts: { rTop?: number; seg?: number; collide?: boolean } = {},
  ): void {
    const geom = new THREE.CylinderGeometry(opts.rTop ?? r, r, y1 - y0, opts.seg ?? 10);
    geom.translate(x, (y0 + y1) / 2, z);
    this.push(mat, geom);
    this.boxes.push(aabb(x - r, y0, z - r, x + r, y1, z + r));
    if (opts.collide) {
      this.solid(aabb(x - r, y0, z - r, x + r, y1, z + r));
    }
  }

  cone(mat: THREE.Material, x: number, z: number, y0: number, y1: number, r: number, seg = 10, rotY = 0): void {
    const geom = new THREE.ConeGeometry(r, y1 - y0, seg);
    if (rotY) {
      geom.rotateY(rotY);
    }
    geom.translate(x, (y0 + y1) / 2, z);
    this.push(mat, geom);
  }

  sphere(mat: THREE.Material, x: number, y: number, z: number, r: number, seg = 8): void {
    const geom = new THREE.SphereGeometry(r, seg, seg);
    geom.translate(x, y, z);
    this.push(mat, geom);
  }

  /**
   * A one-sided vertical plane for signs / posters / windows. `facing`
   * is the outward normal; keep it OUTSIDE the wall AABB it dresses.
   */
  decal(
    mat: THREE.Material,
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    facing: Facing,
    opts: DecalOpts = {},
  ): void {
    const geom = new THREE.PlaneGeometry(w, h);
    geom.rotateY(FACING_ROT_Y[facing]);
    geom.translate(cx, cy, cz);
    // Untouched 0..1 UVs: the only shape the sign atlas can retarget.
    this.push(mat, geom, true);
    if (opts.audit !== false) {
      this.decals.push({ facing, x: cx, y: cy, z: cz, w, h });
    }
  }

  /** Horizontal plane (ground patches, rugs). Normal +Y. */
  flat(
    mat: THREE.Material,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    y: number,
    opts: { texWorld?: number } = {},
  ): void {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const geom = new THREE.PlaneGeometry(w, d);
    const texWorld = opts.texWorld ?? (mat.userData?.texWorld as number | undefined) ?? 2.5;
    const uv = geom.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, (uv.getX(i) * w) / texWorld, (uv.getY(i) * d) / texWorld);
    }
    geom.rotateX(-Math.PI / 2);
    geom.translate(minX + w / 2, y, minZ + d / 2);
    this.push(mat, geom);
  }

  /**
   * Wall slab with a round-arched opening (mission arcades, the bank's
   * teller window, backbar niches). The wall runs along `along` from
   * `from` to `to` at `fixed` on the other axis; the opening is
   * centred at `at`, `w` wide, with its crown at `top` (the arch
   * springs at `top − w/2`). Built as one extruded shape so the
   * curve is real, plus jamb + lintel colliders.
   */
  archWall(
    mat: THREE.Material,
    along: "x" | "z",
    from: number,
    to: number,
    fixed: number,
    y0: number,
    y1: number,
    at: number,
    w: number,
    top: number,
    t = 0.3,
    opts: { collide?: boolean; texWorld?: number } = {},
  ): void {
    const u0 = Math.min(from, to);
    const u1 = Math.max(from, to);
    const half = w / 2;
    const spring = Math.min(top - half, y1 - 0.05);
    const shape = new THREE.Shape();
    shape.moveTo(u0, y0);
    shape.lineTo(u1, y0);
    shape.lineTo(u1, y1);
    shape.lineTo(u0, y1);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(at - half, y0);
    hole.lineTo(at - half, spring);
    hole.absarc(at, spring, half, Math.PI, 0, true);
    hole.lineTo(at + half, y0);
    hole.closePath();
    shape.holes.push(hole);
    // Extrude output is non-indexed; every other primitive here is
    // indexed and mergeGeometries refuses to mix them (it would drop
    // the whole material group), so index it first.
    const geom = mergeVertices(
      new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 12 }),
    );
    const texWorld = opts.texWorld ?? (mat.userData?.texWorld as number | undefined) ?? 2.5;
    const uv = geom.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, uv.getX(i) / texWorld, uv.getY(i) / texWorld);
    }
    uv.needsUpdate = true;
    if (along === "x") {
      geom.translate(0, 0, fixed - t / 2);
    } else {
      geom.rotateY(-Math.PI / 2);
      geom.translate(fixed + t / 2, 0, 0);
    }
    this.push(mat, geom);
    {
      const lo = fixed - t / 2;
      const hi = fixed + t / 2;
      this.boxes.push(along === "x" ? aabb(u0, y0, lo, u1, y1, hi) : aabb(lo, y0, u0, hi, y1, u1));
    }
    if (opts.collide !== false) {
      const lo = fixed - t / 2;
      const hi = fixed + t / 2;
      if (along === "x") {
        this.solid(aabb(u0, y0, lo, at - half, y1, hi));
        this.solid(aabb(at + half, y0, lo, u1, y1, hi));
        this.solid(aabb(at - half, top - 0.35, lo, at + half, y1, hi));
      } else {
        this.solid(aabb(lo, y0, u0, hi, y1, at - half));
        this.solid(aabb(lo, y0, at + half, hi, y1, u1));
        this.solid(aabb(lo, top - 0.35, at - half, hi, y1, at + half));
      }
    }
  }

  /** Straight stair run along one axis, with collision per step. */
  stairs(
    mat: THREE.Material,
    x0: number,
    z0: number,
    width: number,
    rise: number,
    run: number,
    dir: Facing,
    baseY = 0,
    steps = 12,
    hollow = false,
  ): void {
    const stepRise = rise / steps;
    const stepRun = run / steps;
    for (let i = 0; i < steps; i += 1) {
      const y1 = baseY + stepRise * (i + 1);
      const d0 = stepRun * i;
      const d1 = stepRun * (i + 1);
      // a hollow flight shows only riser + tread under each step and
      // keeps the space beneath open; the walker still meets a solid block
      const yb = hollow ? Math.max(baseY, y1 - 0.32) : baseY;
      let box: Aabb;
      if (dir === "N") {
        box = aabb(x0, yb, z0 - d1, x0 + width, y1, z0 - d0);
      } else if (dir === "S") {
        box = aabb(x0, yb, z0 + d0, x0 + width, y1, z0 + d1);
      } else if (dir === "E") {
        box = aabb(x0 + d0, yb, z0, x0 + d1, y1, z0 + width);
      } else {
        box = aabb(x0 - d1, yb, z0, x0 - d0, y1, z0 + width);
      }
      this.box(mat, box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ);
      if (hollow) {
        this.solid(aabb(box.minX, baseY, box.minZ, box.maxX, y1, box.maxZ));
      }
    }
  }

  /**
   * Fold the plain sign quads into shared atlas pages, then merge
   * everything into one mesh per material and add it to `parent`.
   */
  build(parent: THREE.Object3D, opts: { shadows?: boolean } = {}): void {
    this.atlasSigns();
    for (const [mat, geoms] of this.parts) {
      const merged = mergeGeometries(geoms, false);
      if (!merged) {
        // never silently lose a whole material: fall back to one mesh each
        for (const g of geoms) {
          const mesh = new THREE.Mesh(g, mat);
          mesh.castShadow = opts.shadows !== false;
          mesh.receiveShadow = true;
          parent.add(mesh);
        }
        continue;
      }
      for (const g of geoms) {
        g.dispose();
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = opts.shadows !== false;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.parts.clear();
    this.quadOnly.clear();
  }

  /**
   * Re-key every plain lit sign onto one material per atlas page. ~230
   * one-quad draws with ~230 material binds become one per page.
   */
  private atlasSigns(): void {
    const entries: { material: THREE.MeshLambertMaterial; geoms: THREE.BufferGeometry[] }[] = [];
    for (const mat of this.quadOnly) {
      if (!isAtlasableMaterial(mat) || !isAtlasableTexture((mat as THREE.MeshLambertMaterial).map)) {
        continue;
      }
      const geoms = this.parts.get(mat);
      if (geoms?.length) {
        entries.push({ material: mat as THREE.MeshLambertMaterial, geoms });
      }
    }
    if (entries.length < 2) {
      return;
    }
    const { pages, byEntry } = buildSignAtlas(entries);
    for (let i = 0; i < entries.length; i += 1) {
      const page = pages[byEntry[i].page];
      let list = this.parts.get(page.material);
      if (!list) {
        list = [];
        this.parts.set(page.material, list);
      }
      for (const geom of entries[i].geoms) {
        list.push(geom);
      }
      this.parts.delete(entries[i].material);
      entries[i].material.dispose();
    }
  }
}
