import { describe, expect, it } from "vitest";
import { actorPerspective } from "./facing";
import {
  actorWorldZ,
  blitSpriteZ,
  sampleNearZ,
  spriteOverZ,
  STILL_NEAR_Z,
} from "./occlude";

describe("SET Z vs actor", () => {
  it("matches 3/persp on the south-gate road", () => {
    expect(actorWorldZ(0)).toBe(STILL_NEAR_Z);
    expect(actorWorldZ(162)).toBe(5);
    expect(actorWorldZ(162)).toBe(
      Math.round(STILL_NEAR_Z / actorPerspective(162)),
    );
  });

  it("draws on the ground and sky, not through a closer fence", () => {
    expect(spriteOverZ(5, 3)).toBe(false);
    expect(spriteOverZ(5, 5)).toBe(true);
    expect(spriteOverZ(5, 24)).toBe(true);
  });

  it("reads near Z from the bottom of the still", () => {
    const z = new Uint8Array(512 * 264);
    z.fill(24);
    for (let y = 256; y < 264; y++) {
      for (let x = 240; x < 280; x++) {
        z[y * 512 + x] = 3;
      }
    }
    expect(sampleNearZ(z)).toBe(3);
  });

  it("skips sprite pixels the still occludes", () => {
    const dest = new Uint8ClampedArray(512 * 264 * 4);
    const pick = new Uint16Array(512 * 264);
    const z = new Uint8Array(512 * 264);
    z.fill(5);
    z[10 * 512 + 10] = 3;
    const sprite = {
      data: Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255]),
      w: 2,
      h: 1,
    };
    blitSpriteZ(dest, pick, 1, z, 5, sprite, 10, 10, 1);
    expect(pick[10 * 512 + 10]).toBe(0);
    expect(dest[(10 * 512 + 10) * 4 + 3]).toBe(0);
    expect(pick[10 * 512 + 11]).toBe(1);
    expect(dest[(10 * 512 + 11) * 4]).toBe(0);
    expect(dest[(10 * 512 + 11) * 4 + 1]).toBe(255);
  });
});
