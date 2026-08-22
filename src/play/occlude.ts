import { STILL_HEIGHT, STILL_WIDTH } from "../world/set/types";
import { ACTOR_TILE } from "./facing";

/**
 * Dust SET Z is 1–24 (DFET: 24 levels, 24 = sky, 0 unused / “super close”).
 * South-gate road is 3 at your feet … 7 up the street. Smaller = closer.
 * Draw a sprite pixel when `actorZ <= stillZ` (equal = standing on that ground).
 */
export const Z_SKY = 24;
export const STILL_NEAR_Z = 3;

export function actorWorldZ(forward: number, nearZ = STILL_NEAR_Z): number {
  const z = nearZ * ((ACTOR_TILE + Math.max(0, forward)) / ACTOR_TILE);
  return Math.max(1, Math.min(Z_SKY - 1, Math.round(z)));
}

/** Closest ground Z in the bottom rows (camera feet). Fence views still read 3. */
export function sampleNearZ(
  zPlane: Uint8Array | null,
  width = STILL_WIDTH,
  height = STILL_HEIGHT,
): number {
  if (!zPlane || zPlane.length < width * height) {
    return STILL_NEAR_Z;
  }
  let min = 255;
  const mid = width >> 1;
  for (let y = height - 8; y < height; y++) {
    const row = y * width;
    for (let x = mid - 16; x < mid + 32; x++) {
      const z = zPlane[row + x];
      if (z > 0 && z < Z_SKY && z < min) {
        min = z;
      }
    }
  }
  return min === 255 ? STILL_NEAR_Z : min;
}

export function spriteOverZ(actorZ: number, stillZ: number): boolean {
  return actorZ <= stillZ;
}

export interface SpriteBits {
  data: Uint8ClampedArray;
  w: number;
  h: number;
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
      const a = sprite.data[si + 3];
      if (a < 8) {
        continue;
      }
      if (zPlane && !spriteOverZ(actorZ, zPlane[row + x])) {
        continue;
      }
      const di = (row + x) * 4;
      dest[di] = sprite.data[si];
      dest[di + 1] = sprite.data[si + 1];
      dest[di + 2] = sprite.data[si + 2];
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
  return { data: image.data, w: image.width, h: image.height };
}
