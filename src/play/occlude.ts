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

/**
 * How many SET Z planes closer than 1/z the hotspot may pull the
 * billboard (Help’s Z=5 robe on Z=4 dirt). A building in front of a
 * far actor is many planes closer — keep `computed` so the wall wins.
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
  const x = Math.round(hx);
  const y = Math.round(hy);
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return computed;
  }
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
      // Contact shadow is translucent black. Everything else is clothes —
      // Help's robe is (0,0,0). Canvas premultiply must not punch it.
      if (!(r === 0 && g === 0 && b === 0 && a < 255)) {
        a = 255;
      } else if (a < 8) {
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
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) {
      continue;
    }
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r === 0 && g === 0 && b === 0 && a < 255) {
      if (a < 8) {
        data[i + 3] = 255;
      }
      continue;
    }
    data[i + 3] = 255;
  }
  return { data, w: image.width, h: image.height };
}
