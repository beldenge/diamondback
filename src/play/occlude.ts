import { STILL_HEIGHT, STILL_WIDTH } from "../world/set/types";
import {
  CAMERA_SETBACK,
  engineStillScale,
  PRP_SCALE_FIELD,
  spriteStillTopLeft,
  STILL_CENTER_Y,
} from "./facing";

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

/**
 * TARGET `actoris3d` livestock (pig, chicken, gila). Flying crows keep
 * a world `z` and stay on computed sprite Z.
 */
export function isRangeGroundWalker(actor: {
  is3d?: boolean;
  screen?: boolean;
  z?: number;
}): boolean {
  return Boolean(actor.is3d) && !actor.screen && (actor.z ?? 0) === 0;
}

/**
 * TARGET gallery / cactus still Z is 3–4, same 24-level bucket as the
 * livestock walk (`lensForward` 224–272 → sprite Z 4). `actorBlitZ`
 * then pulls one plane onto a cactus, so the sprite draws *on* it.
 * Ground walkers blit one plane farther so those painted occluders win.
 */
export function rangeGroundBlitZ(
  computed: number,
  zPlane: Uint8Array | null,
  hx: number,
  hy: number,
  actor: { is3d?: boolean; screen?: boolean; z?: number },
  width = STILL_WIDTH,
  height = STILL_HEIGHT,
): number {
  const z = actorBlitZ(computed, zPlane, hx, hy, width, height);
  if (!isRangeGroundWalker(actor)) {
    return z;
  }
  return Math.min(Z_SKY, z + 1);
}

/**
 * HOUSE door overlays sit at SET camZ (salout z=174, sallower +26=180).
 * They replace the still's door. Pinning to the hotspot wall Z (often 4)
 * still loses the lower leaf: floor/wainscot or a stale street Z is 2–3,
 * so `spriteZ ≤ stillZ` keeps only the top of the opening. Blit at Z=1
 * so every overlay pixel wins against the closed-door still.
 */
export const WALL_OVERLAY_Z = 48;

export function isWallOverlay(objZ: number, camZ: number): boolean {
  return Math.abs(objZ - camZ) <= WALL_OVERLAY_Z;
}

/** HOUSE `door` group — salout / hotout / pharm / … still replacements. */
export function isDoorOverlay(name: string): boolean {
  return name.toLowerCase() === "door";
}

/** HOUSE door overlays replace one photographed still (the pose they opened on). */
export function doorOpenedStillMatches(
  opened: { scene: string; facing: string } | undefined,
  scene: string,
  facing: string,
): boolean {
  if (!opened) {
    return false;
  }
  return (
    opened.scene.trim().toLowerCase() === scene.trim().toLowerCase() &&
    opened.facing.toUpperCase() === facing.toUpperCase()
  );
}

/** Blit HOUSE `door` only on the still `setupprop` opened. Other props always pass. */
export function shouldBlitDoorOverlay(
  prop: { name: string; openedAt?: { scene: string; facing: string } },
  scene: string,
  facing: string,
): boolean {
  if (!isDoorOverlay(prop.name)) {
    return true;
  }
  return doorOpenedStillMatches(prop.openedAt, scene, facing);
}

/** Always in front of SET Z 2–24. `computed` / hotspot unused on purpose. */
export function wallOverlayBlitZ(
  _computed: number,
  _zPlane: Uint8Array | null,
  _hx: number,
  _hy: number,
  _width = STILL_WIDTH,
  _height = STILL_HEIGHT,
): number {
  return 1;
}

/**
 * HOUSE door overlays are still-plane replacements. setInfo +0x2a is
 * **160** (not INVEN 96). `stdscale` 1450 × 96 / (1000 × lens-forward)
 * shrinks sallower `salout` ~11% and leaves a strip of closed door
 * above the HUD. 1450 × 160 overshoots (~1.49×). The header is 252px
 * on a 264 still; blit 1:1 with the projected hotspot.
 *
 * Only the `door` prop. Bar drinks (`buildrand*`, z≈147) sit near camZ
 * but use script `propscale` 800–1100.
 */
export function propStillScale(
  prop: { name: string; scale?: number },
  lensForward: number,
): number {
  if (isDoorOverlay(prop.name)) {
    return 1;
  }
  return engineStillScale(prop.scale || 1450, lensForward, PRP_SCALE_FIELD);
}

/**
 * Full-still-height door PNGs (`rice`, `underout`) are still replacements.
 * Authored z a few units off camZ shifts dest ~5px and leaves a closed
 * strip above the HUD. Pin Y to the still center. Shorter leaves
 * (`salout` 252, `padre` 212) keep projected Y (`0x415271`).
 *
 * `padre` header is origin (256,192): dest TL is the projected hotspot
 * of `propxyz (32, 412, 157)` on school A2 west → ~202,51. The 28px
 * above `pointindoor` y=79 is the T lintel. Do not pin to the hitbox.
 */
export function doorOverlayHotspotY(placeH: number, projectedY: number): number {
  if (placeH >= STILL_HEIGHT) {
    return STILL_CENTER_Y;
  }
  return projectedY;
}

export function doorOverlayTopLeft(
  hx: number,
  hy: number,
  place: { x: number; y: number; w: number; h: number },
  stillScale: number,
): { x: number; y: number } {
  return spriteStillTopLeft(hx, doorOverlayHotspotY(place.h, hy), place, stillScale);
}

export function doorOverlayDestRect(
  hx: number,
  hy: number,
  place: { x: number; y: number; w: number; h: number },
  stillScale: number,
): { left: number; top: number; right: number; bottom: number } {
  const tl = doorOverlayTopLeft(hx, hy, place, stillScale);
  return {
    left: tl.x,
    top: tl.y,
    right: tl.x + place.w * stillScale,
    bottom: tl.y + place.h * stillScale,
  };
}

/** Painter’s algorithm: farther still-forward first, nearer last (on top). */
export function paintFarToNear<T extends { forward: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.forward - a.forward);
}

/**
 * SET Z identity for the actor overlay. Do not skip a blit across a
 * still/Z pair swap. Color and Z must be the same plate.
 */
export function occlusionStamp(
  zWant: string,
  zPlane: Uint8Array | null,
  cached: boolean,
): string {
  if (!zWant) {
    return zPlane ? "last" : "none";
  }
  if (cached) {
    return zPlane ? `ready:${zWant}` : `empty:${zWant}`;
  }
  return zPlane ? `hold:${zWant}` : `wait:${zWant}`;
}

export type ActorBlitDraw = {
  name: string;
  x: number;
  y: number;
  stillScale: number;
  z: number;
  bitsW: number;
  bitsH: number;
  bitsId: number;
};

/** Same stamp → same pixels. Skip `putImageData`, do not skip Z hold-last. */
export function actorLayerStamp(draws: readonly ActorBlitDraw[], zStamp: string): string {
  let stamp = zStamp;
  for (const draw of draws) {
    stamp += `|${draw.name}:${draw.x.toFixed(3)}:${draw.y.toFixed(3)}:${draw.stillScale.toFixed(4)}:${draw.z}:${draw.bitsW}x${draw.bitsH}:${draw.bitsId}`;
  }
  return stamp;
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

/**
 * Color still and SET Z must swap together. `zKnown` is `cache.has(zUrl)`
 * (a cached `null` means that still has no Z — show the color). Showing
 * dest HQ / the next film plate while Z is still the previous plate draws
 * people through walls (saloon bars, town facades).
 */
export function stillZPairReady(colorCached: boolean, zKnown: boolean): boolean {
  return colorCached && zKnown;
}

/**
 * Filmstrip plates swap the color still immediately. Matching `FRAMES/z`
 * is async. `null` for that gap draws every sprite through walls. Use the
 * cached plane for this still when it is ready; otherwise keep `last`.
 * A cached `null` means that still has no Z (do not hold a stale town
 * plane onto an interior).
 */
export function liveZPlaneForStill(
  want: string,
  cache: Map<string, Uint8Array | null>,
  last: Uint8Array | null,
): Uint8Array | null {
  if (!want) {
    return last;
  }
  if (cache.has(want)) {
    return cache.get(want) ?? null;
  }
  return last;
}

export function spriteBitsFromImageData(
  image: ImageData,
  opts?: { restoreShadow?: boolean },
): SpriteBits {
  const data = new Uint8ClampedArray(image.data);
  if (opts?.restoreShadow !== false) {
    restoreSpriteAlpha(data, image.width, image.height);
  }
  return { data, w: image.width, h: image.height };
}
