import { describe, expect, it } from "vitest";
import {
  actorBlitZ,
  CONTACT_SHADOW_ALPHA,
  exeSpriteZ,
  blitSpriteZ,
  paintFarToNear,
  restoreSpriteAlpha,
  spriteBitsFromImageData,
  spriteOverZ,
} from "./occlude";

describe("SET Z vs actor", () => {
  it("uses EXE lens-forward sprite Z (N7 E jug on dirt, O7 N Leroy)", () => {
    // (130 − 0 − 64 + 128) >> 6 = 3, so the jug draws on Z=3 dirt.
    expect(exeSpriteZ(130, 0)).toBe(3);
    expect(exeSpriteZ(130, 32)).toBe(2);
    // (240 − 32 − 64 + 128) >> 6 = 4
    expect(exeSpriteZ(240, 32)).toBe(4);
  });

  it("draws on the ground and sky, not through a closer fence", () => {
    expect(spriteOverZ(5, 3)).toBe(false);
    expect(spriteOverZ(5, 5)).toBe(true);
    expect(spriteOverZ(5, 24)).toBe(true);
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

  it("samples the still edge when the hotspot is below the plate", () => {
    const z = new Uint8Array(512 * 264);
    z.fill(7);
    z[263 * 512 + 303] = 3;
    expect(actorBlitZ(3, z, 303, 279)).toBe(3);
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
    expect(bits.data[11]).toBe(CONTACT_SHADOW_ALPHA);
    expect(bits.data[15]).toBe(255);
  });

  it("paints INVEN unused pal 0 as white, not a hole", () => {
    const data = new Uint8ClampedArray([
      0, 0, 0, 255, 80, 40, 20, 255, 0, 0, 0, 0,
    ]);
    const bits = spriteBitsFromImageData(
      { data, width: 3, height: 1 } as ImageData,
      { unusedWhite: true, restoreShadow: false },
    );
    expect([...bits.data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(bits.data[7]).toBe(255);
    // Codec skip stays transparent — silhouette / ring hole.
    expect(bits.data[11]).toBe(0);
  });

  it("does not treat punched black robe as a contact shadow", () => {
    const w = 2;
    const h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    // Chest (top) punched to the shadow alpha — still clothes.
    data[0] = 0;
    data[1] = 0;
    data[2] = 0;
    data[3] = 120;
    data[4] = 75;
    data[5] = 87;
    data[6] = 37;
    data[7] = 200;
    // Foot pancake on the last row.
    const foot = ((h - 1) * w + 1) * 4;
    data[foot] = 0;
    data[foot + 1] = 0;
    data[foot + 2] = 0;
    data[foot + 3] = 120;
    restoreSpriteAlpha(data, w, h);
    expect(data[3]).toBe(255);
    expect(data[7]).toBe(255);
    expect(data[foot + 3]).toBe(CONTACT_SHADOW_ALPHA);
  });
});
