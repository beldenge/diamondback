/**
 * A fixed pool of point lights, re-aimed at whatever is nearest.
 *
 * Every fragment of every lit material loops over the scene's point
 * lights. The interiors and the mine define 111 of them, so the whole
 * town — street included — shaded with `NUM_POINT_LIGHTS 111`. They are
 * all short-range (radius 4–11) room and lantern lights: at most a
 * handful can reach the camera at once.
 *
 * The pool size never changes. Three bakes the light count into every
 * shader, so adding or removing one recompiles all of them — a visible
 * stall. Unused slots stay in the scene at zero intensity instead.
 */
import * as THREE from "three";
import type { PointLightSpec } from "./interiors";

/**
 * Live slots. Three's `decay = 2` falloff is exactly zero past a light's
 * `distance`, so only lights whose sphere is close enough to hold
 * on-screen surfaces can matter. Sampling the town, at most three
 * spheres ever contain the camera and never more than ~20 sit within
 * `FADE_END` of it, so 24 slots never clip a light that is doing work.
 */
export const LIGHT_POOL = 24;

/** Gap (distance to a light's own sphere) where it starts to fade out. */
const FADE_START = 8;

/** …and where it reaches zero. A slot only ever swaps at zero intensity. */
const FADE_END = 12;

function fade(gap: number): number {
  if (gap <= FADE_START) {
    return 1;
  }
  if (gap >= FADE_END) {
    return 0;
  }
  const t = (FADE_END - gap) / (FADE_END - FADE_START);
  return t * t * (3 - 2 * t);
}

export class LightPool {
  readonly group = new THREE.Group();

  private readonly slots: THREE.PointLight[] = [];

  private specs: PointLightSpec[] = [];

  /** `specs` index chosen per slot, plus its gap, rebuilt each update. */
  private readonly rank: { spec: PointLightSpec; gap: number }[] = [];

  constructor(specs: PointLightSpec[]) {
    this.specs = specs;
    for (let i = 0; i < LIGHT_POOL; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      // Three counts a light only while it is visible; keeping every slot
      // visible is what holds `NUM_POINT_LIGHTS` steady.
      light.visible = true;
      this.slots.push(light);
      this.group.add(light);
    }
  }

  /** Aim the pool at the lights nearest `eye`. Cheap enough to run every frame. */
  update(eye: THREE.Vector3): void {
    this.rank.length = 0;
    for (const spec of this.specs) {
      const dx = spec.x - eye.x;
      const dy = spec.y - eye.y;
      const dz = spec.z - eye.z;
      const gap = Math.sqrt(dx * dx + dy * dy + dz * dz) - spec.distance;
      if (gap >= FADE_END) {
        continue;
      }
      // Insertion sort into a list capped at the pool size: 111 specs
      // against 16 slots, so this stays well under a microsecond.
      if (this.rank.length === LIGHT_POOL && gap >= this.rank[LIGHT_POOL - 1].gap) {
        continue;
      }
      let at = this.rank.length;
      while (at > 0 && this.rank[at - 1].gap > gap) {
        at -= 1;
      }
      this.rank.splice(at, 0, { spec, gap });
      if (this.rank.length > LIGHT_POOL) {
        this.rank.length = LIGHT_POOL;
      }
    }
    for (let i = 0; i < LIGHT_POOL; i += 1) {
      const slot = this.slots[i];
      const pick = this.rank[i];
      if (!pick) {
        slot.intensity = 0;
        continue;
      }
      slot.position.set(pick.spec.x, pick.spec.y, pick.spec.z);
      slot.color.setHex(pick.spec.color);
      slot.distance = pick.spec.distance;
      slot.intensity = pick.spec.intensity * fade(pick.gap);
    }
  }
}
