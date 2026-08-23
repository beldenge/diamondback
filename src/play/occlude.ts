import { STILL_HEIGHT, STILL_WIDTH } from "../world/set/types";
import { CAMERA_SETBACK } from "./facing";

/**
 * Dust SET Z is 1–24 (DFET: 24 levels, 24 = sky, 0 unused / “super close”).
 * South-gate road is 3 at your feet … 7 up the street. Smaller = closer.
 * Draw a sprite pixel when `actorZ <= stillZ` (equal = standing on that ground).
 */
export const Z_SKY = 24;

/**
 * DF.EXE `0x415213` / PRP `0x428173` sprite Z:
 * `(lensForward − zclip − setback + 128) >> 6` (24-level).
 */
export function exeSpriteZ(
  lensForward: number,
  zclip = 32,
  setback = CAMERA_SETBACK,
): number {
  let raw = Math.trunc(lensForward) - Math.trunc(zclip) - setback + 128;
  if (raw < 0) {
    raw = 0;
  }
  return raw >> 6;
}

export function spriteOverZ(actorZ: number, stillZ: number): boolean {
  return actorZ <= stillZ;
}

/**
 * How many SET Z planes closer than EXE sprite Z the hotspot may pull
 * the billboard. A building in front of a far actor is many planes
 * closer — keep `computed` so the wall wins.
 */
export const GROUND_Z_SLACK = 1;

/**
 * Pin the billboard to the still Z under the hotspot only when that
 * pixel is the ground he stands on. Unconditional `min(computed, feet)`
 * put Leroy at the facade’s Z when his hotspot landed on a building
 * toward the range, so he drew through every wall.
 */
export function actorBlitZ(
  computed: number,
  zPlane: Uint8Array | null,
  hx: number,
  hy: number,
  width = STILL_WIDTH,
  height = STILL_HEIGHT,
): number {
  if (!zPlane || zPlane.length < width * height) {
    return computed;
  }
  const x = Math.min(width - 1, Math.max(0, Math.round(hx)));
  const y = Math.min(height - 1, Math.max(0, Math.round(hy)));
  const feet = zPlane[y * width + x];
  if (feet <= 0 || feet >= Z_SKY) {
    return computed;
  }
  if (computed - feet > GROUND_Z_SLACK) {
    return computed;
  }
  return Math.min(computed, feet);
}

/** Painter’s algorithm: farther still-forward first, nearer last (on top). */
export function paintFarToNear<T extends { forward: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.forward - a.forward);
}

export interface SpriteBits {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

/** Extract writes the foot pancake as (0,0,0,120). */
export const CONTACT_SHADOW_ALPHA = 120;
const SHADOW_A_MIN = 80;
const SHADOW_A_MAX = 160;

function isFootShadowPixel(r: number, g: number, b: number, a: number): boolean {
  return r === 0 && g === 0 && b === 0 && a >= SHADOW_A_MIN && a <= SHADOW_A_MAX;
}

/**
 * Contact shadow is a small (0,0,0,~120) blob 4-connected to the bottom
 * edge. Help's robe is also (0,0,0) — canvas premultiply can punch it to
 * a<255, which used to keep the coat see-through. Only the foot blob
 * stays translucent; every other drawn pixel is opaque.
 */
export function restoreSpriteAlpha(data: Uint8ClampedArray, w: number, h: number): void {
  if (w <= 0 || h <= 0) {
    return;
  }
  const shadow = new Uint8Array(w * h);
  const stack: number[] = [];
  const y0 = Math.floor((h * 3) / 4);
  for (let y = h - 1; y >= y0 && stack.length === 0; y--) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (isFootShadowPixel(data[o], data[o + 1], data[o + 2], data[o + 3])) {
        stack.push(i);
      }
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    if (shadow[i]) {
      continue;
    }
    const y = Math.floor(i / w);
    if (y < y0) {
      continue;
    }
    shadow[i] = 1;
    const x = i - y * w;
    if (x > 0) {
      const j = i - 1;
      const o = j * 4;
      if (!shadow[j] && isFootShadowPixel(data[o], data[o + 1], data[o + 2], data[o + 3])) {
        stack.push(j);
      }
    }
    if (x + 1 < w) {
      const j = i + 1;
      const o = j * 4;
      if (!shadow[j] && isFootShadowPixel(data[o], data[o + 1], data[o + 2], data[o + 3])) {
        stack.push(j);
      }
    }
    if (y > y0) {
      const j = i - w;
      const o = j * 4;
      if (!shadow[j] && isFootShadowPixel(data[o], data[o + 1], data[o + 2], data[o + 3])) {
        stack.push(j);
      }
    }
    if (y + 1 < h) {
      const j = i + w;
      const o = j * 4;
      if (!shadow[j] && isFootShadowPixel(data[o], data[o + 1], data[o + 2], data[o + 3])) {
        stack.push(j);
      }
    }
  }
  for (let i = 0, p = 0; i < shadow.length; i++, p += 4) {
    const a = data[p + 3];
    if (a === 0) {
      continue;
    }
    if (shadow[i]) {
      data[p] = 0;
      data[p + 1] = 0;
      data[p + 2] = 0;
      data[p + 3] = CONTACT_SHADOW_ALPHA;
      continue;
    }
    data[p + 3] = 255;
  }
}

/**
 * Nearest-neighbor blit onto the 512×264 still. Skip transparent sprite
 * pixels and any pixel whose SET Z is closer than the actor (the O8 fence).
 */
export function blitSpriteZ(
  dest: Uint8ClampedArray,
  pick: Uint16Array,
  pickId: number,
  zPlane: Uint8Array | null,
  actorZ: number,
  sprite: SpriteBits,
  dx: number,
  dy: number,
  scale: number,
): void {
  if (scale <= 0 || sprite.w <= 0 || sprite.h <= 0 || pickId === 0) {
    return;
  }
  const destW = sprite.w * scale;
  const destH = sprite.h * scale;
  const x0 = Math.max(0, Math.floor(dx));
  const y0 = Math.max(0, Math.floor(dy));
  const x1 = Math.min(STILL_WIDTH, Math.ceil(dx + destW));
  const y1 = Math.min(STILL_HEIGHT, Math.ceil(dy + destH));
  const inv = 1 / scale;
  for (let y = y0; y < y1; y++) {
    const srcY = Math.min(sprite.h - 1, Math.max(0, Math.floor((y - dy) * inv)));
    const row = y * STILL_WIDTH;
    for (let x = x0; x < x1; x++) {
      const srcX = Math.min(sprite.w - 1, Math.max(0, Math.floor((x - dx) * inv)));
      const si = (srcY * sprite.w + srcX) * 4;
      const r = sprite.data[si];
      const g = sprite.data[si + 1];
      const b = sprite.data[si + 2];
      let a = sprite.data[si + 3];
      if (a === 0) {
        continue;
      }
      // Foot pancake only. Help's robe is (0,0,0) — do not keep it translucent.
      if (!(r === 0 && g === 0 && b === 0 && a >= SHADOW_A_MIN && a <= SHADOW_A_MAX)) {
        a = 255;
      }
      if (zPlane && !spriteOverZ(actorZ, zPlane[row + x])) {
        continue;
      }
      const di = (row + x) * 4;
      dest[di] = r;
      dest[di + 1] = g;
      dest[di + 2] = b;
      dest[di + 3] = a;
      pick[row + x] = pickId;
    }
  }
}

/** Read the 8-bit Z plane from a grayscale (or RGB) image of the still. */
export function zPlaneFromImageData(image: ImageData): Uint8Array {
  const z = new Uint8Array(image.width * image.height);
  const src = image.data;
  for (let i = 0; i < z.length; i++) {
    z[i] = src[i * 4];
  }
  return z;
}

export function spriteBitsFromImageData(image: ImageData): SpriteBits {
  const data = new Uint8ClampedArray(image.data);
  restoreSpriteAlpha(data, image.width, image.height);
  return { data, w: image.width, h: image.height };
}
