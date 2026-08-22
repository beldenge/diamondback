import { TILE_SPAN } from "../world/set/path";
import { STILL_HEIGHT, STILL_WIDTH, type Dir } from "../world/set/types";
import type { ActorState } from "./host";

/** Dust `actordeg` / `currentdeg`: 256 units per turn, 0 = south, 64 = east. */
export const DEG_SOUTH = 0;
export const DEG_EAST = 64;
export const DEG_NORTH = 128;
export const DEG_WEST = 192;

export const DIR_DEG: Record<Dir, number> = {
  S: DEG_SOUTH,
  E: DEG_EAST,
  N: DEG_NORTH,
  W: DEG_WEST,
};

const OCTANT_DEG = [0, 32, 64, 96, 128, 160, 192, 224];

export function wrapDeg(deg: number): number {
  return ((Math.round(deg) % 256) + 256) % 256;
}

export function dirToDeg(facing: Dir): number {
  return DIR_DEG[facing];
}

/** 0=S, 1=SE, 2=E, 3=NE, 4=N, 5=NW, 6=W, 7=SW — matches CST stand frame order. */
export function degToOctant(deg: number): number {
  return wrapDeg(deg + 16) >> 5;
}

/**
 * Which of the 8 CST stand/walk frames the camera sees.
 * Octant 0 is the front (actor facing the camera).
 *
 * CST east/west plates are drawn with east facing *left* on the PNG
 * (clockwise around the actor, opposite increasing `actordeg`).
 * `camOct - actorOct` keeps front/back and puts eastward travel to the
 * *right* of a north-facing still. The old `actorOct - camOct` moonwalked
 * the K7 corner toward the range.
 */
export function visibleOctant(actorDeg: number, cameraDeg: number): number {
  return (degToOctant(cameraDeg) - degToOctant(actorDeg) + 4) & 7;
}

/** Shortest signed step from `from` to `to` on the 0–255 circle. */
export function degDelta(from: number, to: number): number {
  let d = wrapDeg(to) - wrapDeg(from);
  if (d > 128) {
    d -= 256;
  }
  if (d < -128) {
    d += 256;
  }
  return d;
}

/** Direction from `from` toward `to` (world +x east, +y south). */
export function calcDeg(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return 0;
  }
  const rad = Math.atan2(dx, dy);
  return wrapDeg((rad / (2 * Math.PI)) * 256);
}

export function calcVect(
  deg: number,
  dist: number,
): { x: number; y: number } {
  const rad = (wrapDeg(deg) / 256) * 2 * Math.PI;
  return { x: dist * Math.sin(rad), y: dist * Math.cos(rad) };
}

/** Player feet: tile center (`tile * 256 + 128`), same as `playerxyz`. */
export function playerWorldPoint(pose: { x: number; y: number }): { x: number; y: number } {
  return { x: pose.x * TILE_SPAN + 128, y: pose.y * TILE_SPAN + 128 };
}

/**
 * Stills camera on the view axis, one tile *behind* the feet.
 * `calcdeg(actor, cameraxyz)` then faces the lens — same idea as
 * `walktopuppet`'s `currentdeg + 128` — instead of the sub-tile
 * diagonal to the tile center (Leroy sits 76 east of O7).
 */
export function cameraWorldPoint(pose: {
  x: number;
  y: number;
  facing: string;
}): { x: number; y: number } {
  const feet = playerWorldPoint(pose);
  const facing = pose.facing as Dir;
  const back = calcVect(dirToDeg(facing) + 128, ACTOR_TILE);
  return { x: feet.x + back.x, y: feet.y + back.y };
}

export function pickCyclic<T>(frames: T[], octant: number): T | undefined {
  if (frames.length === 0) {
    return undefined;
  }
  return frames[octant % frames.length];
}

export function walkFrame<T>(
  frames: T[],
  octant: number,
  step: number,
  perDir = 8,
): T | undefined {
  if (frames.length < perDir) {
    return pickCyclic(frames, octant);
  }
  const poses = Math.max(1, Math.floor(frames.length / perDir));
  const pose = step % poses;
  return frames[pose * perDir + (octant % perDir)];
}

/**
 * `stdscale("town")` in `CST/_GANG/Cast.txt`. Native CST frames (~200px,
 * hotspot 256,192 on the 384 stage) are 1:1 at this scale on the camera
 * plane. Indoor sets use 2400–5800 — closer photos, not a different codec.
 */
export const ACTOR_SCALE_REF = 1450;

/** Scripts treat world xyz as tiles of 256 (`walktopuppet` divides by 256). */
export const ACTOR_TILE = 256;

/**
 * DF.EXE world→still (`0x40dcd0`). Focal is hardcoded `0x136` = 310
 * (`0x40d255` / `0x40d488`). Not 256 (90° on 512) and not 192 (half of 384).
 * Screen X is `256 + 310 * right / forward`.
 */
export const CAMERA_FOCAL = 310;

/**
 * SET header +24 is 64 on every Dust map (TOWN, NITE, interiors).
 * After `tile*256+128`, DF.EXE subtracts `calcvect(facing, setback)`
 * (`0x40e081` / `0x40e08e`, TRIG * dist / 16384). Looking north that
 * moves the lens south — the patent’s set-back camera, Dust’s distance.
 */
export const CAMERA_SETBACK = 64;

/** DFET CST/PUP header: blit top-left so this hotspot lands on the stage point. */
export const SPRITE_HOTSPOT_X = 256;
export const SPRITE_HOTSPOT_Y = 192;

/**
 * Distance falloff. Dust scripts never compute this — DF.EXE does, via
 * SET Z (DFET) and BitBlt (no StretchBlt import). Z at the south-gate
 * road is 3 (at your feet) … 7 (up the street). `256/(256+forward)` is
 * the same 1/z in the units the scripts use; sampled Z matches
 * `3 / persp` on that road.
 */
export function actorPerspective(forward: number): number {
  return ACTOR_TILE / (ACTOR_TILE + Math.max(0, forward));
}

/**
 * Still Y of the ground. Same 1/z as scale (not pinhole X).
 * NITE O7 N SET Z: 3 at y=236–263, 5 at y=194–209 (Leroy’s star),
 * 7 at y=176–183. Horizon 128 is half the 256 tile. Near plane **248**
 * is mid Z=3 — the still bottom (264) put the sign hotspot in Z=4 while
 * `actorWorldZ` is 5, so the closer ground clipped his feet. Do not scan
 * Z for Y (O8 N’s fence has no ground at the actor’s depth).
 */
export const STILL_HORIZON_Y = 128;
export const STILL_NEAR_Y = 248;

export function stillGroundY(forward: number): number {
  return STILL_HORIZON_Y + (STILL_NEAR_Y - STILL_HORIZON_Y) * actorPerspective(forward);
}

/** World units per walk pose. One CST cycle covers a 256-unit tile. */
export function walkStride(frameCount: number, perDir = 8): number {
  const poses = Math.max(1, Math.floor(frameCount / perDir));
  return ACTOR_TILE / poses;
}

/** Script frames each drink pose is held (`toidle` 25 / 4-pose strip). */
export const DRINK_HOLD_FRAMES = 6;

/** Sprite height in 512×264 still pixels (Dust’s framebuffer). */
export function actorStillHeight(
  spriteH: number,
  actorScale: number,
  forward: number,
): number {
  return spriteH * (actorScale / ACTOR_SCALE_REF) * actorPerspective(forward);
}

/**
 * CSS height on the letterboxed still. The still canvas is already
 * `STILL_HEIGHT * stageScale`; do not size sprites in raw CSS pixels.
 */
export function actorCssHeight(
  spriteH: number,
  actorScale: number,
  forward: number,
  stillCssHeight: number,
): number {
  if (stillCssHeight <= 0) {
    return 0;
  }
  return actorStillHeight(spriteH, actorScale, forward) * (stillCssHeight / STILL_HEIGHT);
}

/**
 * Still top-left so the CST header hotspot (256, 192) lands on `(hx, hy)`.
 * Same rule as PUP `spriteTopLeft`, with the in-world scale applied.
 * Do not bbox-center: ¾ frames are not centered on the hotspot.
 */
export function spriteStillTopLeft(
  hx: number,
  hy: number,
  place: { x: number; y: number },
  stillScale: number,
): { x: number; y: number } {
  return {
    x: hx + (place.x - SPRITE_HOTSPOT_X) * stillScale,
    y: hy + (place.y - SPRITE_HOTSPOT_Y) * stillScale,
  };
}

/** World-space camera: tile center + `actordeg` (0=S). */
export interface ViewCamera {
  x: number;
  y: number;
  deg: number;
}

export function cameraFromPose(pose: { x: number; y: number; facing: string }): ViewCamera {
  const feet = playerWorldPoint(pose);
  return { x: feet.x, y: feet.y, deg: dirToDeg(pose.facing as Dir) };
}

/**
 * SET filmstrips are 5 motion frames then dest HQ. Lerp the camera
 * through that so sprites don't sit on the start pose until a snap —
 * a right turn at O7 looked like he jumped onto the O8 road.
 */
export function lerpViewCamera(
  from: { x: number; y: number; facing: string },
  to: { x: number; y: number; facing: string },
  t: number,
): ViewCamera {
  const a = cameraFromPose(from);
  const b = cameraFromPose(to);
  const u = Math.min(1, Math.max(0, t));
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    deg: wrapDeg(a.deg + degDelta(a.deg, b.deg) * u),
  };
}

/**
 * Project a world-space actor onto the 512×264 still.
 * `x,y` is the **hotspot** (ground point), not the PNG bbox.
 *
 * **X** is DF.EXE `0x40dcd0`: rotate by TRIG sin/cos / 16384, then
 * `centerX + focal * right / forward` with focal **310**. The lens is
 * set back `CAMERA_SETBACK` along the view from the tile-center feet
 * (`0x40e081`). O7 N + `town.leroy1` → still-x **354**, matching the
 * original midline (~353). A 90° pinhole from the feet (focal 256,
 * tile 255) was 386 — too far right. 1/z X was ~306 — too far left.
 *
 * **Y and scale** still use 1/z from the *feet* forward so size and
 * ground Y stay in the SET Z=5 band (y=194–209). Engine Y is
 * `132 + camZ * 310 / forward` (town camZ = SET +26 = 62) which puts
 * the hotspot in Z=4 and clips feet; do not switch Y to that.
 */
export function worldToStill(
  actor: ActorState,
  view: { x: number; y: number; facing: string } | ViewCamera,
): { x: number; y: number; forward: number } | null {
  const cam: ViewCamera =
    "deg" in view ? view : cameraFromPose(view);
  const f = calcVect(cam.deg, 1);
  const feetDx = actor.x - cam.x;
  const feetDy = actor.y - cam.y;
  const feetForward = feetDx * f.x + feetDy * f.y;
  const back = calcVect(cam.deg + 128, CAMERA_SETBACK);
  const dx = actor.x - (cam.x + back.x);
  const dy = actor.y - (cam.y + back.y);
  const forward = dx * f.x + dy * f.y;
  const right = dx * -f.y + dy * f.x;
  // DF.EXE `cmp bx, 0x600` after setback (6×256).
  if (forward > TILE_SPAN * 6) {
    return null;
  }
  // `walktopuppet` dest is the camera plane. Pinhole X is undefined at
  // forward=0; keep a near-plane blit only if he's on-axis at your feet.
  if (forward <= 0) {
    if (forward < -16 || Math.abs(right) > 48) {
      return null;
    }
    return {
      x: SPRITE_HOTSPOT_X + right,
      y: Math.min(STILL_HEIGHT, Math.max(0, stillGroundY(0))),
      forward: 0,
    };
  }
  const x = SPRITE_HOTSPOT_X + (CAMERA_FOCAL * right) / forward;
  if (x < -48 || x > STILL_WIDTH + 48) {
    return null;
  }
  return {
    x,
    y: Math.min(STILL_HEIGHT, Math.max(0, stillGroundY(Math.max(0, feetForward)))),
    forward: Math.max(0, feetForward),
  };
}

/**
 * CST sprite for the current pose. Walk and drink are facing-major
 * strips (8 dirs × N poses), same layout as stand's 8 facings.
 */
export function actorSprite(
  actor: ActorState,
  cameraDeg: number,
): ActorState["standSprites"][number] | undefined {
  const oct = visibleOctant(actor.deg, cameraDeg);
  if (actor.pose === "walk") {
    return (
      walkFrame(actor.walkSprites, oct, actor.walkStep) ??
      pickCyclic(actor.standSprites, oct)
    );
  }
  const drink = actor.drinkSprites;
  if (actor.pose === "drink" && drink && drink.length > 0) {
    const frame =
      drink.length >= 16
        ? walkFrame(drink, oct, actor.walkStep)
        : pickCyclic(drink, oct);
    if (frame) {
      return frame;
    }
  }
  return pickCyclic(actor.standSprites, oct);
}

export { OCTANT_DEG };
