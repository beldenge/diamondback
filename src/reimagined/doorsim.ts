/**
 * Clickable swinging doors. Each door is a Group pivoted at its hinge;
 * clicking toggles a yaw tween. While a door is closed its AABB blocks
 * the player; opening clears it.
 */
import * as THREE from "three";
import { FACING_YAW, type Facing } from "./coords";
import { aabb, type Aabb } from "./geometry";
import type { DoorSpec } from "./layout";
import type { Mats } from "./materials";

const LEAF_T = 0.09;

export class SwingDoor {
  readonly group = new THREE.Group();

  readonly spec: DoorSpec;

  /** Meshes the click raycast tests. */
  readonly hitMeshes: THREE.Mesh[] = [];

  open = false;

  private t = 0; // 0 closed → 1 open

  private leaves: { pivot: THREE.Group; dir: number }[] = [];

  private closedBox: Aabb;

  constructor(spec: DoorSpec, mats: Mats) {
    this.spec = spec;
    const yaw = FACING_YAW[spec.side];
    this.group.position.set(spec.x, spec.y, spec.z);
    this.group.rotation.y = yaw;

    const leafMat = spec.gate ? mats.iron : mats.woodSaloon;
    const width = spec.width;
    const leafW = spec.double ? width / 2 : width;

    const makeLeaf = (offset: number, dir: number): void => {
      const pivot = new THREE.Group();
      // In door-local space +X runs along the wall; hinge at x=offset.
      pivot.position.set(offset, 0, 0);
      const leaf = new THREE.Group();
      if (spec.gate) {
        // iron bars with spear tops
        const bars = Math.max(3, Math.round(leafW / 0.28));
        for (let i = 0; i <= bars; i += 1) {
          const bx = (i / bars) * leafW * dir;
          const bar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.035, spec.height, 6),
            mats.iron,
          );
          bar.position.set(bx, spec.height / 2, 0);
          leaf.add(bar);
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), mats.iron);
          tip.position.set(bx, spec.height + 0.08, 0);
          leaf.add(tip);
        }
        for (const y of [0.25, spec.height - 0.3]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.09, 0.06), mats.iron);
          rail.position.set((leafW / 2) * dir, y, 0);
          leaf.add(rail);
        }
        const hit = new THREE.Mesh(
          new THREE.BoxGeometry(leafW, spec.height, 0.2),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        hit.position.set((leafW / 2) * dir, spec.height / 2, 0);
        leaf.add(hit);
        this.hitMeshes.push(hit);
      } else {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(leafW - 0.04, spec.height - 0.04, LEAF_T),
          leafMat,
        );
        panel.position.set((leafW / 2) * dir, spec.height / 2, 0);
        panel.castShadow = true;
        leaf.add(panel);
        this.hitMeshes.push(panel);
        // planked face lines
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mats.brass);
        knob.position.set((leafW - 0.16) * dir, spec.height * 0.48, LEAF_T / 2 + 0.03);
        leaf.add(knob);
        const knob2 = knob.clone();
        knob2.position.z = -LEAF_T / 2 - 0.03;
        leaf.add(knob2);
      }
      pivot.add(leaf);
      this.group.add(pivot);
      this.leaves.push({ pivot, dir });
    };

    if (spec.double) {
      makeLeaf(-width / 2, 1);
      makeLeaf(width / 2, -1);
    } else {
      makeLeaf(-width / 2, 1);
    }

    // Closed collision box in world space (door local +X along wall).
    const half = width / 2 + 0.05;
    if (spec.side === "N" || spec.side === "S") {
      this.closedBox = aabb(spec.x - half, spec.y, spec.z - 0.16, spec.x + half, spec.y + spec.height, spec.z + 0.16);
    } else {
      this.closedBox = aabb(spec.x - 0.16, spec.y, spec.z - half, spec.x + 0.16, spec.y + spec.height, spec.z + half);
    }

    for (const mesh of this.hitMeshes) {
      mesh.userData.door = this;
    }
    this.apply();
  }

  /** null while fully open — the doorway is passable. */
  get collider(): Aabb | null {
    return this.t < 0.6 ? this.closedBox : null;
  }

  toggle(): void {
    this.open = !this.open;
  }

  update(dt: number): void {
    const target = this.open ? 1 : 0;
    if (this.t === target) {
      return;
    }
    const step = dt / 0.45;
    this.t = target > this.t ? Math.min(target, this.t + step) : Math.max(target, this.t - step);
    this.apply();
  }

  private apply(): void {
    const eased = this.t * this.t * (3 - 2 * this.t);
    for (const leaf of this.leaves) {
      leaf.pivot.rotation.y = eased * 1.85 * leaf.dir * this.spec.swing;
    }
  }
}

/** Café half-doors (saloon): always swingable, never block. */
export function cafeDoors(mats: Mats, x: number, z: number, width: number, side: Facing): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = FACING_YAW[side];
  for (const dir of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set((-width / 2) * dir, 0, 0);
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(width / 2 - 0.03, 1.15, 0.05),
      mats.woodMid,
    );
    leaf.position.set((width / 4) * dir, 1.55, 0);
    pivot.add(leaf);
    g.add(pivot);
  }
  return g;
}
