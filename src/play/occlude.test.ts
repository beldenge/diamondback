import { describe, expect, it } from "vitest";
import { actorPerspective } from "./facing";
import {
  actorBlitZ,
  actorWorldZ,
  blitSpriteZ,
  paintFarToNear,
  sampleNearZ,
  spriteBitsFromImageData,
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

  it("paints farther sprites first so nearer ones win", () => {
    const order = paintFarToNear([
      { name: "leroy", forward: 176 },
      { name: "jug", forward: 236 },
      { name: "dog", forward: 964 },
    ]);
    expect(order.map((item) => item.name)).toEqual(["dog", "jug", "leroy"]);
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

  it("does not sit behind the still Z under the hotspot", () => {
    const z = new Uint8Array(512 * 264);
    z.fill(7);
    z[200 * 512 + 300] = 4;
    expect(actorBlitZ(5, z, 300, 200)).toBe(4);
    expect(actorBlitZ(3, z, 300, 200)).toBe(3);
  });

  it("does not pull a far actor onto a foreground wall", () => {
    const z = new Uint8Array(512 * 264);
    z.fill(3);
    z[200 * 512 + 300] = 3;
    expect(actorBlitZ(10, z, 300, 200)).toBe(10);
    expect(actorBlitZ(5, z, 300, 200)).toBe(5);
  });

  it("keeps Help-black clothing opaque after a canvas round-trip", () => {
    const data = new Uint8ClampedArray([
      0, 0, 0, 255, 0, 0, 0, 4, 0, 0, 0, 120, 75, 87, 37, 180,
    ]);
    const bits = spriteBitsFromImageData({ data, width: 4, height: 1 } as ImageData);
    expect(bits.data[3]).toBe(255);
    expect(bits.data[7]).toBe(255);
    expect(bits.data[11]).toBe(120);
    expect(bits.data[15]).toBe(255);
  });
});
