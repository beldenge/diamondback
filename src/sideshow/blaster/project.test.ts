import { describe, expect, it } from "vitest";
import { cameraFromPose, worldToStill } from "../../play/facing";
import { TILE_SPAN } from "../../world/set/path";
import { STILL_WIDTH } from "../../world/set/types";
import { groundSpriteZ, projectSprite } from "./project";

const CAM_Z = 62;
/** At the mission, looking south down the whole length of Main Street. */
const mission = cameraFromPose({ x: 6, y: 3, facing: "S" }, CAM_Z);

function onMainStreet(tileY: number) {
  return { x: 6 * TILE_SPAN + 128, y: tileY * TILE_SPAN + 128, z: 0 };
}

describe("projectSprite", () => {
  it("agrees with the engine inside the engine's own range", () => {
    for (const tileY of [4, 5, 6, 7, 8]) {
      const here = onMainStreet(tileY);
      const engine = worldToStill(here, mission);
      const ours = projectSprite(here, mission);
      expect(engine, `tile ${tileY} should be in engine range`).not.toBeNull();
      expect(ours).not.toBeNull();
      expect(ours!.x).toBe(engine!.x);
      expect(ours!.y).toBe(engine!.y);
      expect(ours!.lensForward).toBeCloseTo(engine!.lensForward, 6);
    }
  });

  it("still draws what the engine culls for being far away", () => {
    // The gate is eleven tiles from the mission; the engine stops at six,
    // which would leave a whole wave invisible until it was on top of you.
    const gate = onMainStreet(14);
    expect(worldToStill(gate, mission)).toBeNull();
    const ours = projectSprite(gate, mission);
    expect(ours).not.toBeNull();
    expect(ours!.x).toBeGreaterThan(0);
    expect(ours!.x).toBeLessThan(STILL_WIDTH);
  });

  it("shrinks with distance instead of vanishing", () => {
    const near = projectSprite(onMainStreet(5), mission);
    const far = projectSprite(onMainStreet(14), mission);
    expect(far!.lensForward).toBeGreaterThan(near!.lensForward);
    // Same column of the street, so both sit near the centre line.
    expect(Math.abs(far!.x - STILL_WIDTH / 2)).toBeLessThan(8);
  });

  it("keeps the near cull — nothing on or behind the lens draws", () => {
    // North of the mission is behind you when you face south.
    expect(projectSprite(onMainStreet(1), mission)).toBeNull();
    expect(projectSprite(onMainStreet(2), mission)).toBeNull();
  });

  it("culls what is off the sides of the frame", () => {
    const wayEast = { x: 40 * TILE_SPAN, y: 8 * TILE_SPAN, z: 0 };
    expect(projectSprite(wayEast, mission)).toBeNull();
  });

  it("orders sprites front to back by feet-forward", () => {
    const near = projectSprite(onMainStreet(5), mission)!;
    const far = projectSprite(onMainStreet(12), mission)!;
    expect(far.forward).toBeGreaterThan(near.forward);
  });
});

describe("groundSpriteZ", () => {
  const W = 512;
  const H = 264;

  function planeOf(value: number): Uint8Array {
    return new Uint8Array(W * H).fill(value);
  }

  it("caps the engine's saturating depth at the top of the scale", () => {
    // Eleven tiles down Main Street `exeSpriteZ` returns 45, against a
    // plane that only runs 1..24 — uncapped, every pixel fails the test
    // and the sprite is invisible.
    expect(groundSpriteZ(45, null, 256, 200)).toBe(24);
    expect(groundSpriteZ(45, planeOf(24), 256, 140)).toBe(24);
  });

  it("pins to the ground when the plane and the sprite already agree", () => {
    // Near field: this is what stops a sprite's feet being clipped by the
    // very ground it is standing on.
    expect(groundSpriteZ(6, planeOf(5), 256, 220)).toBe(5);
  });

  it("does NOT inherit the depth of a facade it is standing behind", () => {
    // The regression this replaced: taking the hotspot's plane value at
    // face value gave a distant bird the wall's depth, and it drew
    // straight through the wall. The sprite keeps its own depth, so the
    // per-pixel test hides it.
    expect(groundSpriteZ(24, planeOf(5), 256, 200)).toBe(24);
    expect(groundSpriteZ(21, planeOf(4), 256, 160)).toBe(21);
  });

  it("leaves a sprite at horizon depth where the plate records only sky", () => {
    // Past about five tiles the film draws the street as sky depth, so a
    // sprite out there sits at 24 and is still occluded by real geometry.
    expect(groundSpriteZ(30, planeOf(24), 256, 138)).toBe(24);
  });

  it("falls back to the capped value with no usable plane", () => {
    expect(groundSpriteZ(30, null, 10, 10)).toBe(24);
    expect(groundSpriteZ(30, new Uint8Array(4), 10, 10)).toBe(24);
    expect(groundSpriteZ(12, planeOf(0), 256, 200)).toBe(12);
  });

  it("clamps a hotspot that projected outside the frame", () => {
    expect(() => groundSpriteZ(10, planeOf(6), -900, 9999)).not.toThrow();
  });
});
