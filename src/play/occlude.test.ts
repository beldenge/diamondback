import { describe, expect, it } from "vitest";
import {
  actorBlitZ,
  CONTACT_SHADOW_ALPHA,
  doorOpenedStillMatches,
  doorOverlayDestRect,
  doorOverlayHotspotY,
  shouldBlitDoorOverlay,
  exeSpriteZ,
  blitSpriteZ,
  isDoorOverlay,
  isRangeGroundWalker,
  zPlaneFromImageData,
  isWallOverlay,
  paintFarToNear,
  propStillScale,
  rangeGroundBlitZ,
  restoreSpriteAlpha,
  spriteBitsFromImageData,
  spriteOverZ,
  liveZPlaneForStill,
  stillZPairReady,
  wallOverlayBlitZ,
  actorLayerStamp,
  occlusionStamp,
} from "./occlude";
import { engineStillScale, PRP_SCALE_FIELD, spriteDestRect, STILL_CENTER_Y } from "./facing";
import { STILL_HEIGHT } from "../world/set/types";

describe("SET Z vs actor", () => {
  it("uses EXE lens-forward sprite Z (N7 E jug on dirt, O7 N Leroy)", () => {
    // (130 − 0 − 64 + 128) >> 6 = 3, so the jug draws on Z=3 dirt.
    expect(exeSpriteZ(130, 0)).toBe(3);
    expect(exeSpriteZ(130, 32)).toBe(2);
    // (240 − 32 − 64 + 128) >> 6 = 4
    expect(exeSpriteZ(240, 32)).toBe(4);
  });

  it("occlusionStamp distinguishes wait, hold, ready, and missing Z", () => {
    const plane = new Uint8Array([3]);
    expect(occlusionStamp("z/a.png", null, false)).toBe("wait:z/a.png");
    expect(occlusionStamp("z/a.png", plane, false)).toBe("hold:z/a.png");
    expect(occlusionStamp("z/a.png", plane, true)).toBe("ready:z/a.png");
    expect(occlusionStamp("z/a.png", null, true)).toBe("empty:z/a.png");
  });

  it("changes the actor overlay stamp when hold-last Z becomes live", () => {
    const last = new Uint8Array([3]);
    const draw = {
      name: "leroy",
      x: 200,
      y: 100,
      stillScale: 1,
      z: 4,
      bitsW: 8,
      bitsH: 16,
      bitsId: 1,
    };
    const hold = actorLayerStamp([draw], occlusionStamp("z/b.png", last, false));
    const live = actorLayerStamp([draw], occlusionStamp("z/b.png", last, true));
    expect(hold).not.toBe(live);
    expect(actorLayerStamp([draw], occlusionStamp("z/b.png", last, false))).toBe(hold);
    expect(
      actorLayerStamp([{ ...draw, x: 201 }], occlusionStamp("z/b.png", last, false)),
    ).not.toBe(hold);
  });

  it("does not show a still until its Z is known (or known missing)", () => {
    expect(stillZPairReady(true, false)).toBe(false);
    expect(stillZPairReady(false, true)).toBe(false);
    expect(stillZPairReady(true, true)).toBe(true);
    expect(stillZPairReady(false, false)).toBe(false);
  });

  it("holds the last SET Z while the next filmstrip plane decodes", () => {
    const last = new Uint8Array([3]);
    const cache = new Map<string, Uint8Array | null>();
    expect(liveZPlaneForStill("z/a.png", cache, last)).toBe(last);
    cache.set("z/a.png", new Uint8Array([4]));
    expect(liveZPlaneForStill("z/a.png", cache, last)![0]).toBe(4);
    cache.set("z/missing.png", null);
    expect(liveZPlaneForStill("z/missing.png", cache, last)).toBeNull();
    expect(liveZPlaneForStill("", cache, last)).toBe(last);
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

  it("puts TARGET 3d livestock behind the gallery and cactuses", () => {
    const z = new Uint8Array(512 * 264);
    z.fill(7);
    z[200 * 512 + 256] = 4;
    z[180 * 512 + 50] = 3;
    const pig = { is3d: true, z: 0 };
    expect(isRangeGroundWalker(pig)).toBe(true);
    expect(isRangeGroundWalker({ is3d: true, z: 180 })).toBe(false);
    expect(isRangeGroundWalker({ is3d: false, z: 0 })).toBe(false);
    expect(exeSpriteZ(232, 32)).toBe(4);
    expect(rangeGroundBlitZ(4, z, 256, 200, pig)).toBe(5);
    expect(spriteOverZ(5, 4)).toBe(false);
    expect(spriteOverZ(5, 3)).toBe(false);
    expect(spriteOverZ(5, 7)).toBe(true);
    expect(actorBlitZ(4, z, 50, 180)).toBe(3);
    expect(rangeGroundBlitZ(4, z, 50, 180, pig)).toBe(4);
    expect(spriteOverZ(4, 3)).toBe(false);
    expect(rangeGroundBlitZ(4, z, 256, 200, { is3d: true, z: 180 })).toBe(4);
  });

  it("draws a camZ door overlay over closer floor Z, not only the lintel", () => {
    expect(isWallOverlay(174, 180)).toBe(true);
    expect(isWallOverlay(0, 180)).toBe(false);
    const z = new Uint8Array(512 * 264);
    z.fill(4);
    for (let y = 180; y < 264; y++) {
      z.fill(3, y * 512, y * 512 + 512);
    }
    expect(actorBlitZ(7, z, 267, 143)).toBe(7);
    const doorZ = wallOverlayBlitZ(7, z, 267, 143);
    expect(doorZ).toBe(1);
    expect(spriteOverZ(doorZ, 3)).toBe(true);
    expect(spriteOverZ(doorZ, 4)).toBe(true);
    expect(spriteOverZ(4, 3)).toBe(false);
  });

  it("does not perspective-shrink a HOUSE door overlay", () => {
    expect(isDoorOverlay("door")).toBe(true);
    expect(isDoorOverlay("buildrand1")).toBe(false);
    expect(propStillScale({ name: "door", scale: 1450 }, 156)).toBe(1);
    expect(propStillScale({ name: "buildrand1", scale: 800 }, 156)).toBeCloseTo(
      engineStillScale(800, 156, PRP_SCALE_FIELD),
    );
  });

  it("pins full-still-height door overlays to the still Y", () => {
    expect(doorOverlayHotspotY(264, 127)).toBe(STILL_CENTER_Y);
    expect(doorOverlayHotspotY(252, 143)).toBe(143);
    const rice = { x: 102, y: 60, w: 308, h: STILL_HEIGHT };
    const dest = doorOverlayDestRect(256, 127, rice, 1);
    expect(dest).toEqual({
      left: 102,
      top: 0,
      right: 410,
      bottom: 264,
    });
    // Scene A2 `pointinrice` is x>100 y>2 … x<408 y<263.
    expect(dest.top).toBeLessThanOrEqual(2);
    expect(dest.right).toBeGreaterThanOrEqual(408);
    expect(dest.bottom).toBeGreaterThanOrEqual(263);
    const salout = { x: 138, y: 60, w: 232, h: 252 };
    expect(doorOverlayDestRect(267, 143, salout, 1)).toEqual(
      spriteDestRect(267, 143, salout, 1),
    );
    const padre = { x: 256, y: 192, w: 123, h: 212 };
    // setupprop("padre") (32,412,157) on school A2 W, camZ 115 → 202,51.
    // Header origin 256,192 so dest TL is the hotspot (T lintel).
    expect(doorOverlayDestRect(202, 51, padre, 1)).toEqual(
      spriteDestRect(202, 51, padre, 1),
    );
    expect(doorOverlayDestRect(202, 51, padre, 1)).toEqual({
      left: 202,
      top: 51,
      right: 325,
      bottom: 263,
    });
  });

  it("keeps an open door on the still it opened on", () => {
    const opened = { scene: "scene d1", facing: "E" };
    expect(doorOpenedStillMatches(opened, "scene d1", "E")).toBe(true);
    expect(doorOpenedStillMatches(opened, "scene d1", "W")).toBe(false);
    expect(doorOpenedStillMatches(opened, "scene c1", "E")).toBe(false);
    expect(doorOpenedStillMatches(undefined, "scene d1", "E")).toBe(false);
  });

  it("blits HOUSE door only on the opening still, for every building", () => {
    const saloon = { name: "door", openedAt: { scene: "scene d1", facing: "E" } };
    const chin = { name: "door", openedAt: { scene: "scene a2", facing: "W" } };
    expect(shouldBlitDoorOverlay(saloon, "scene d1", "E")).toBe(true);
    expect(shouldBlitDoorOverlay(saloon, "scene d1", "W")).toBe(false);
    expect(shouldBlitDoorOverlay(saloon, "scene c1", "E")).toBe(false);
    expect(shouldBlitDoorOverlay(chin, "scene a2", "W")).toBe(true);
    expect(shouldBlitDoorOverlay(chin, "scene a2", "E")).toBe(false);
    expect(shouldBlitDoorOverlay({ name: "door" }, "scene d1", "E")).toBe(false);
    expect(shouldBlitDoorOverlay({ name: "buildrand1" }, "scene c1", "E")).toBe(true);
  });

  it("does not 1:1-blit bar drinks just because z is near camZ", () => {
    expect(isWallOverlay(147, 180)).toBe(true);
    expect(propStillScale({ name: "buildrand2", scale: 1100 }, 156)).not.toBe(1);
    expect(propStillScale({ name: "buildrand2", scale: 1100 }, 156)).toBeCloseTo(
      engineStillScale(1100, 156, PRP_SCALE_FIELD),
    );
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

  it("keeps INVEN pal 0 black and codec skip transparent", () => {
    const data = new Uint8ClampedArray([
      0, 0, 0, 255, 80, 40, 20, 255, 0, 0, 0, 0,
    ]);
    const bits = spriteBitsFromImageData(
      { data, width: 3, height: 1 } as ImageData,
      { restoreShadow: false },
    );
    // VGA still index 0 is black (gun leather grain). Unused→white
    // was the salt dump. Codec skip stays the ring / outline hole.
    expect([...bits.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect(bits.data[7]).toBe(255);
    expect(bits.data[11]).toBe(0);
  });

  it("does not remap a holster-full of pal 0 black to white", () => {
    const w = 8;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      const p = i * 4;
      if (i % 3 === 0) {
        data[p] = 0;
        data[p + 1] = 0;
        data[p + 2] = 0;
        data[p + 3] = 255;
      } else if (i % 3 === 1) {
        data[p] = 90;
        data[p + 1] = 41;
        data[p + 2] = 18;
        data[p + 3] = 255;
      }
    }
    const bits = spriteBitsFromImageData(
      { data, width: w, height: h } as ImageData,
      { restoreShadow: false },
    );
    let black = 0;
    let white = 0;
    let leather = 0;
    for (let p = 0; p < bits.data.length; p += 4) {
      if (bits.data[p + 3] === 0) {
        continue;
      }
      if (bits.data[p] === 255 && bits.data[p + 1] === 255 && bits.data[p + 2] === 255) {
        white += 1;
      } else if (bits.data[p] === 0 && bits.data[p + 1] === 0 && bits.data[p + 2] === 0) {
        black += 1;
      } else if (bits.data[p] === 90 && bits.data[p + 1] === 41 && bits.data[p + 2] === 18) {
        leather += 1;
      }
    }
    expect(white).toBe(0);
    expect(black).toBeGreaterThan(5);
    expect(leather).toBeGreaterThan(5);
  });

  it("world sprites keep pal 0 black when contact-shadow restore runs", () => {
    const data = new Uint8ClampedArray([
      0, 0, 0, 255, 25, 17, 17, 255, 0, 0, 0, 0,
    ]);
    const bits = spriteBitsFromImageData({ data, width: 3, height: 1 } as ImageData);
    expect([...bits.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
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

describe("zPlaneFromImageData", () => {
  /** What the loop used to be, byte by byte. */
  function referenceZ(image: ImageData): Uint8Array {
    const z = new Uint8Array(image.width * image.height);
    for (let i = 0; i < z.length; i += 1) {
      z[i] = image.data[i * 4];
    }
    return z;
  }

  function make(width: number, height: number, offset = 0): ImageData {
    const buffer = new ArrayBuffer(offset + width * height * 4);
    const data = new Uint8ClampedArray(buffer, offset, width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      data[i * 4] = (i * 7) % 25; // R: the SET Z plane, 1..24
      data[i * 4 + 1] = 200; // G/B/A differ so a wrong channel shows up
      data[i * 4 + 2] = 99;
      data[i * 4 + 3] = 255;
    }
    return { data, width, height, colorSpace: "srgb" } as ImageData;
  }

  it("reads the red channel of a full 512x264 still", () => {
    const image = make(512, 264);
    expect(Array.from(zPlaneFromImageData(image))).toEqual(Array.from(referenceZ(image)));
  });

  it("falls back when the pixels are not 32-bit aligned", () => {
    const image = make(8, 4, 2);
    expect(image.data.byteOffset % 4).not.toBe(0);
    expect(Array.from(zPlaneFromImageData(image))).toEqual(Array.from(referenceZ(image)));
  });

  it("returns one byte per pixel", () => {
    expect(zPlaneFromImageData(make(6, 3))).toHaveLength(18);
  });
});
