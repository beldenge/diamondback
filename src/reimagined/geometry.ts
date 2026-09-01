import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Facing } from "./coords";

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
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

  readonly colliders: Aabb[] = [];

  /** Walkable elevated surfaces (boardwalks, floors, stairs) reuse colliders. */

  private push(mat: THREE.Material, geom: THREE.BufferGeometry): void {
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
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
    if (opts.collide) {
      geom.computeBoundingBox();
      const b = geom.boundingBox;
      if (b) {
        this.solid(aabb(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z));
      }
    }
  }

  /** Push an already-positioned geometry for merging. */
  mesh(mat: THREE.Material, geom: THREE.BufferGeometry): void {
    this.push(mat, geom);
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
    if (opts.collide) {
      this.solid(aabb(x - r, y0, z - r, x + r, y1, z + r));
    }
  }

  cone(mat: THREE.Material, x: number, z: number, y0: number, y1: number, r: number, seg = 10): void {
    const geom = new THREE.ConeGeometry(r, y1 - y0, seg);
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
  ): void {
    const geom = new THREE.PlaneGeometry(w, h);
    geom.rotateY(FACING_ROT_Y[facing]);
    geom.translate(cx, cy, cz);
    this.push(mat, geom);
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
  ): void {
    const stepRise = rise / steps;
    const stepRun = run / steps;
    for (let i = 0; i < steps; i += 1) {
      const y1 = baseY + stepRise * (i + 1);
      const d0 = stepRun * i;
      const d1 = stepRun * (i + 1);
      if (dir === "N") {
        this.box(mat, x0, baseY, z0 - d1, x0 + width, y1, z0 - d0);
      } else if (dir === "S") {
        this.box(mat, x0, baseY, z0 + d0, x0 + width, y1, z0 + d1);
      } else if (dir === "E") {
        this.box(mat, x0 + d0, baseY, z0, x0 + d1, y1, z0 + width);
      } else {
        this.box(mat, x0 - d1, baseY, z0, x0 - d0, y1, z0 + width);
      }
    }
  }

  /** Merge everything into one mesh per material, added to `parent`. */
  build(parent: THREE.Object3D, opts: { shadows?: boolean } = {}): void {
    for (const [mat, geoms] of this.parts) {
      const merged = mergeGeometries(geoms, false);
      if (!merged) {
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
  }
}
