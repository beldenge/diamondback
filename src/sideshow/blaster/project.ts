/**
 * World-to-still projection, without the engine's distance cull.
 *
 * `worldToStill` drops anything past `TILE_SPAN * 6` — six tiles. That is
 * right for the faithful engine, where nothing interesting is ever that
 * far down a filmed street. It is wrong here: you hold the north end of
 * Main Street and the gate is **eleven** tiles away, so with that cull the
 * entire wave is invisible until it is nearly on top of you.
 *
 * So this is `rawProject` + `cullStill` from `play/facing.ts` with the
 * far-distance test removed, built out of that module's own exported
 * constants and helpers. The near cull stays: a sprite on or behind the
 * lens still must not draw, and one off the sides is still skipped.
 *
 * DF.EXE `0x40dcd0` (CST `0x415213`, PRP `0x428173`):
 *   x = 256 + 310 * right / forward
 *   y = 132 − 310 * (objZ − camZ) / forward
 * with the lens set back SET +24 (64) along the view axis.
 */

import {
  CAMERA_FOCAL,
  CAMERA_SETBACK,
  SCALE_MIN_FORWARD,
  SPRITE_HOTSPOT_X,
  calcVect,
  enginePinholeY,
  type ViewCamera,
} from "../../play/facing";
import { Z_SKY, actorBlitZ } from "../../play/occlude";
import { STILL_HEIGHT, STILL_WIDTH } from "../../world/set/types";

export interface StillPoint {
  x: number;
  y: number;
  /** Feet-forward, for painter's-algorithm draw order. */
  forward: number;
  /** Lens-forward, which drives both sprite scale and sprite Z. */
  lensForward: number;
}

/** How far off either edge a hotspot may sit and still be worth drawing. */
const SIDE_SLACK = 48;

export function projectSprite(
  actor: { x: number; y: number; z?: number },
  cam: ViewCamera,
): StillPoint | null {
  const f = calcVect(cam.deg, 1);
  const feetForward = (actor.x - cam.x) * f.x + (actor.y - cam.y) * f.y;

  const back = calcVect(cam.deg + 128, CAMERA_SETBACK);
  const dx = actor.x - (cam.x + back.x);
  const dy = actor.y - (cam.y + back.y);
  const lensForward = dx * f.x + dy * f.y;
  const right = dx * -f.y + dy * f.x;

  // DF.EXE `0x40dd48`: forward at or behind the lens does not draw. The
  // EXE also skips the blit below 32.
  if (lensForward < SCALE_MIN_FORWARD) {
    return null;
  }

  const x = SPRITE_HOTSPOT_X + Math.trunc((CAMERA_FOCAL * right) / lensForward);
  if (x < -SIDE_SLACK || x > STILL_WIDTH + SIDE_SLACK) {
    return null;
  }

  return {
    x,
    y: enginePinholeY(actor.z ?? 0, lensForward, cam.z),
    forward: Math.max(0, feetForward),
    lensForward,
  };
}

/**
 * Depth for a sprite at any distance down the street.
 *
 * Two separate things go wrong far away, and the fix is one line each.
 *
 * `exeSpriteZ` buckets `lensForward` into the SET's 24 levels and **runs
 * off the end**: at eleven tiles it returns 45 against a plane of 1..24, so
 * every pixel fails `spriteZ <= stillZ` and the sprite vanishes. Capping at
 * `Z_SKY` fixes that — and it is legitimate, because the plate agrees:
 * sampling `FRAMES/z` down the centre of Main Street gives 3 at your feet,
 * rising to ~15 by mid-street, and **24 from the horizon onward**. Past
 * about five tiles the film simply records the street as sky depth, so a
 * sprite out there belongs at 24 too.
 *
 * The pinning is then the engine's own `actorBlitZ`, unchanged. Do **not**
 * replace it with `min(computed, feet)`: that reads the plane at the
 * hotspot and takes it at face value, so a bird standing *behind* a facade
 * inherits the facade's depth and draws straight through the wall.
 * `actorBlitZ` only pins when the two already agree (`GROUND_Z_SLACK`),
 * which is exactly the near field where a sprite's feet would otherwise be
 * clipped by the ground it stands on.
 */
export function groundSpriteZ(
  computed: number,
  zPlane: Uint8Array | null,
  hx: number,
  hy: number,
  width = STILL_WIDTH,
  height = STILL_HEIGHT,
): number {
  return actorBlitZ(Math.min(computed, Z_SKY), zPlane, hx, hy, width, height);
}
