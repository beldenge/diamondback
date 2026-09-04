import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { PointLightSpec } from "./interiors";
import { LIGHT_POOL, LightPool } from "./lights";

function spec(x: number, z: number, distance = 6, intensity = 4): PointLightSpec {
  return { x, y: 2, z, color: 0xffd2a0, intensity, distance };
}

function slots(pool: LightPool): THREE.PointLight[] {
  return pool.group.children.filter((o): o is THREE.PointLight => (o as THREE.PointLight).isPointLight);
}

describe("LightPool", () => {
  it("holds the slot count steady — the shader bakes it in", () => {
    const one = new LightPool([spec(0, 0)]);
    const many = new LightPool(Array.from({ length: 200 }, (_, i) => spec(i * 3, 0)));
    expect(slots(one)).toHaveLength(LIGHT_POOL);
    expect(slots(many)).toHaveLength(LIGHT_POOL);
    for (const light of slots(many)) {
      expect(light.visible).toBe(true);
    }
    many.update(new THREE.Vector3(0, 2, 0));
    expect(slots(many)).toHaveLength(LIGHT_POOL);
    expect(slots(many).every((l) => l.visible)).toBe(true);
  });

  it("lights the nearest specs and leaves the far slots dark", () => {
    const near = Array.from({ length: 4 }, (_, i) => spec(i, 0));
    const far = Array.from({ length: 40 }, (_, i) => spec(500 + i * 20, 0));
    const pool = new LightPool([...far, ...near]);
    pool.update(new THREE.Vector3(0, 2, 0));
    const lit = slots(pool).filter((l) => l.intensity > 0);
    expect(lit).toHaveLength(near.length);
    for (const light of lit) {
      expect(Math.abs(light.position.x)).toBeLessThan(10);
    }
  });

  it("fades a light out before its slot can be taken", () => {
    // One light, walked away from: intensity must reach 0 before the
    // spec drops off the candidate list, so a swap is never a pop.
    const pool = new LightPool([spec(0, 0, 6, 4)]);
    const at = (d: number): number => {
      pool.update(new THREE.Vector3(0, 2, d));
      return slots(pool)[0].intensity;
    };
    expect(at(6)).toBeCloseTo(4, 5); // inside the sphere: full
    expect(at(13)).toBeCloseTo(4, 5); // gap 7, still inside FADE_START
    const mid = at(16); // gap 10, mid-fade
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(4);
    expect(at(18)).toBe(0); // gap 12, the cutoff
    expect(at(40)).toBe(0);
  });

  it("copies colour, range and intensity off the spec it picks", () => {
    const pool = new LightPool([{ x: 3, y: 1, z: -4, color: 0x00ff80, intensity: 7, distance: 9 }]);
    pool.update(new THREE.Vector3(3, 1, -4));
    const light = slots(pool)[0];
    expect(light.position.toArray()).toEqual([3, 1, -4]);
    expect(light.color.getHex()).toBe(0x00ff80);
    expect(light.distance).toBe(9);
    expect(light.intensity).toBeCloseTo(7, 5);
  });

  it("orders slots nearest-first so a clipped light is always the farthest", () => {
    const specs = Array.from({ length: LIGHT_POOL + 6 }, (_, i) => spec(i * 0.4, 0));
    const pool = new LightPool(specs);
    pool.update(new THREE.Vector3(0, 2, 0));
    const xs = slots(pool)
      .filter((l) => l.intensity > 0)
      .map((l) => l.position.x);
    expect(xs.length).toBeLessThanOrEqual(LIGHT_POOL);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    }
  });
});
