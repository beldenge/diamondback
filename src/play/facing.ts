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
 * 8-dir index from look-deg vs actordeg. Sprite blit does **not** use
 * this — `pickCstFrame` matches authored frame deg (`0x4154c0`).
 * Octant 0 is the front (actor facing the camera).
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

/** Draw lens for CST sprite pick: feet minus `calcvect(look, SET+24)`. */
export function drawLensPoint(cam: ViewCamera): { x: number; y: number } {
  const back = calcVect(cam.deg + 128, CAMERA_SETBACK);
  return { x: cam.x + back.x, y: cam.y + back.y };
}

/**
 * DF.EXE `0x411f20`: shortest circular distance on the 256-deg circle.
 * Sprite pick (`0x4154c0`) keeps the frame with the strictly smaller value.
 */
export function angularDistance(a: number, b: number): number {
  return Math.abs(degDelta(a, b));
}

/**
 * Relative facing the CST picker wants.
 *
 * Camera-to-actor on the view axis is `look + 128` (from the actor back
 * to the lens). Frame deg 0 is the front. CST +0x28 **32** is the west
 * ¾ plate (head screen-left); world `actordeg 32` is SE, which from the
 * south is the **east** ¾ (head screen-right, plate 224). Subtract
 * actordeg from the camera-relative heading so those two 32s are not
 * treated as the same way. Use the view axis, not XY `calcdeg` to the
 * 64-unit setback — that sitting *beside* a near dog flipped the ¾.
 */
export function spriteWantedDeg(
  actorDeg: number,
  _actor: { x: number; y: number },
  camera: ViewCamera,
): number {
  return wrapDeg(wrapDeg(camera.deg + 128) - actorDeg);
}

interface CstFrame {
  deg?: number;
  pose?: number;
  index?: number;
}

function packedDirs(count: number): number | null {
  return count >= 8 && count % 8 === 0 ? 8 : null;
}

/** Only the dog uses 7 plates; authored degs at setInfo +0x28. */
const DOG_STREET_DEGS = [0, 16, 32, 48, 208, 224, 240];

function framePoseOf(frame: CstFrame, index: number, count: number): number {
  if (typeof frame.pose === "number" && Number.isFinite(frame.pose)) {
    return frame.pose;
  }
  const dirs = packedDirs(count);
  if (dirs == null) {
    return 0;
  }
  return Math.floor((frame.index ?? index) / dirs);
}

function frameDegOf(frame: CstFrame, index: number, count: number): number {
  if (typeof frame.deg === "number" && Number.isFinite(frame.deg)) {
    return wrapDeg(frame.deg);
  }
  const dirs = packedDirs(count);
  if (dirs != null) {
    return wrapDeg(((frame.index ?? index) % dirs) * 32);
  }
  if (count === 7) {
    return DOG_STREET_DEGS[(frame.index ?? index) % 7] ?? 0;
  }
  return 0;
}

function poseCountOf(frames: CstFrame[]): number {
  let max = 0;
  for (let i = 0; i < frames.length; i++) {
    max = Math.max(max, framePoseOf(frames[i], i, frames.length) + 1);
  }
  return Math.max(1, max);
}

/**
 * DF.EXE `0x4154c0`: among frames whose +8 pose matches the +0x2e table,
 * copy the one with the smallest `0x411f20` distance to the wanted deg.
 * Exact match (`dist == 0`) stops the scan. Ties keep the earlier record.
 */
export function pickCstFrame<T extends CstFrame>(
  frames: T[],
  actorDeg: number,
  actor: { x: number; y: number },
  camera: ViewCamera,
  step: number,
  table?: number[],
): T | undefined {
  if (frames.length === 0) {
    return undefined;
  }
  const wanted = spriteWantedDeg(actorDeg, actor, camera);
  const poseId = poseFromTable(table, step, poseCountOf(frames));
  const n = frames.length;
  let best: T | undefined;
  let bestDist = 0x3e8;
  for (let i = 0; i < n; i++) {
    const frame = frames[i];
    if (framePoseOf(frame, i, n) !== poseId) {
      continue;
    }
    const dist = angularDistance(frameDegOf(frame, i, n), wanted);
    if (dist < bestDist) {
      bestDist = dist;
      best = frame;
      if (dist === 0) {
        break;
      }
    }
  }
  return best;
}

export function walkFrame<T>(
  frames: T[],
  octant: number,
  step: number,
  perDir = 8,
  table?: number[],
): T | undefined {
  if (frames.length < perDir) {
    return pickCyclic(frames, octant);
  }
  const poses = Math.max(1, Math.floor(frames.length / perDir));
  const pose = poseFromTable(table, step, poses);
  return frames[pose * perDir + (octant % perDir)];
}

/** CST setInfo +0x2e table for this `actorpose` name (walk, drink, lowwalk, …). */
export function timingForPose(
  tables: Record<string, number[]> | undefined,
  pose: string,
): number[] {
  if (!tables) {
    return [];
  }
  return tables[pose] ?? tables[pose.toLowerCase()] ?? [];
}

/** CST setInfo +0x2e is 1-based pose ids, length at +0x70. One slot per engine tick. */
export function poseFromTable(table: number[] | undefined, step: number, poses: number): number {
  const n = Math.max(1, poses);
  if (table && table.length > 0) {
    const raw = table[((step % table.length) + table.length) % table.length] ?? 1;
    return ((raw - 1) % n + n) % n;
  }
  return ((step % n) + n) % n;
}

/** `stdscale("town")` in `CST/_GANG/Cast.txt`. Indoor sets use 2400–5800. */
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
 * `timeGetTime * 3 / 50` (`0x438210`) is a 60 Hz counter. The frame loop
 * (`0x40e1d2`) waits `framerate` of those ticks — boot `framerate (3)` →
 * **20 Hz** game frames. `actorspeed` is units per game frame. CST draw
 * (`0x415040`) is on that same frame, so the +0x2e pose table is 20 Hz too.
 */
export const TIME_TICK_HZ = 60;

export function gameFrameSec(framerate: number): number {
  return Math.max(1, Math.trunc(framerate) || 1) / TIME_TICK_HZ;
}

/** Script frames each drink pose is held (`toidle` 25 / 4-pose strip). */
export const DRINK_HOLD_FRAMES = 6;

/**
 * CST setInfo record +0x2a. Every GANG frame is **114**; INVEN world
 * props (jug, bone, …) are **96**. dest = bbox * actorscale * field
 * / (1000 * lens-forward) (`0x415271` / PRP `0x4281d1`).
 */
export const CST_SCALE_FIELD = 114;
export const PRP_SCALE_FIELD = 96;

/** EXE skips the blit when lens-forward < 32 (`cmp [esp+0x12], 0x20`). */
export const SCALE_MIN_FORWARD = 32;

export function engineStillScale(
  actorScale: number,
  lensForward: number,
  field: number = CST_SCALE_FIELD,
): number {
  const fwd = Math.max(SCALE_MIN_FORWARD, lensForward);
  return (actorScale * field) / (1000 * fwd);
}

/** Sprite height in 512×264 still pixels. `forward` is lens-forward. */
export function actorStillHeight(
  spriteH: number,
  actorScale: number,
  lensForward: number,
  field: number = CST_SCALE_FIELD,
): number {
  return spriteH * engineStillScale(actorScale, lensForward, field);
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

/**
 * CST/PRP dest Mac Rect (`0x415271`): projected hotspot minus the
 * scaled header hotspot, then header `w`×`h`. `pointinactor` /
 * `hittest` use this, not a chest-high 80px box around the feet.
 */
export function spriteDestRect(
  hx: number,
  hy: number,
  place: { x: number; y: number; w: number; h: number },
  stillScale: number,
): { left: number; top: number; right: number; bottom: number } {
  const tl = spriteStillTopLeft(hx, hy, place, stillScale);
  return {
    left: tl.x,
    top: tl.y,
    right: tl.x + place.w * stillScale,
    bottom: tl.y + place.h * stillScale,
  };
}

export function pointInSpriteDest(
  px: number,
  py: number,
  rect: { left: number; top: number; right: number; bottom: number },
): boolean {
  return px >= rect.left && px < rect.right && py >= rect.top && py < rect.bottom;
}

/** World click/hover: dest rect when the frame is known; hotspot box if not. */
export function worldSpriteHitsPoint(
  px: number,
  py: number,
  hx: number,
  hy: number,
  place: { x: number; y: number; w: number; h: number } | undefined,
  actorScale: number,
  lensForward: number,
  field: number,
): boolean {
  if (!place || place.w <= 0 || place.h <= 0) {
    return Math.abs(hx - px) < 40 && hy - py < 80 && py <= hy + 10;
  }
  return pointInSpriteDest(
    px,
    py,
    spriteDestRect(hx, hy, place, engineStillScale(actorScale, lensForward, field)),
  );
}

/** World-space camera: tile center + `actordeg` (0=S). */
export interface ViewCamera {
  x: number;
  y: number;
  deg: number;
  /** SET header +26. Town 62; Help's shop 230. */
  z?: number;
}

/** Projected hotspot on the 512×264 still. */
export interface StillHit {
  x: number;
  y: number;
  /** Feet-forward, for draw order. */
  forward: number;
  /** Lens-forward from `0x40dcd0` (X, Y, and dest size). */
  lensForward: number;
}

/** SET +26. Town/nite 62. DF.EXE `0x40dcd0` Y uses this as camZ. */
export const CAMERA_HEIGHT = 62;

/** Mac dest-rect half-height. DF.EXE `0x40d279`. */
export const STILL_CENTER_Y = STILL_HEIGHT / 2;

export function cameraFromPose(
  pose: { x: number; y: number; facing: string },
  cameraZ: number = CAMERA_HEIGHT,
): ViewCamera {
  const feet = playerWorldPoint(pose);
  return { x: feet.x, y: feet.y, deg: dirToDeg(pose.facing as Dir), z: cameraZ };
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/**
 * Progress along a SET filmstrip. DF.EXE `0x40dd90` walks `index*64` and
 * turns `index*16` over 5 motion frames (`index / 4`). Dest HQ is an
 * extra plate at t=1.
 */
export function filmstripT(index: number, frameCount: number): number {
  if (frameCount <= 1) {
    return 1;
  }
  const motionFrames = Math.min(5, frameCount);
  return clamp01(Math.min(index, motionFrames - 1) / (motionFrames - 1));
}

/** SET filmstrip camera: lerp feet on walks, yaw look-deg on in-place turns. */
export function lerpViewCamera(
  from: { x: number; y: number; facing: string },
  to: { x: number; y: number; facing: string },
  t: number,
  cameraZ: number = CAMERA_HEIGHT,
): ViewCamera {
  const a = cameraFromPose(from, cameraZ);
  const b = cameraFromPose(to, cameraZ);
  const u = clamp01(t);
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    deg: wrapDeg(a.deg + degDelta(a.deg, b.deg) * u),
    z: cameraZ,
  };
}

/** DF.EXE `0x40dcd0` Y: `centerY − focal*(objZ − camZ)/lensForward` (`idiv`). */
export function enginePinholeY(
  objZ: number,
  lensForward: number,
  cameraZ: number = CAMERA_HEIGHT,
): number {
  const fwd = lensForward === 0 ? 1 : lensForward;
  return STILL_CENTER_Y - Math.trunc((CAMERA_FOCAL * (objZ - cameraZ)) / fwd);
}

interface RawProject {
  x: number;
  y: number;
  forward: number;
  lensForward: number;
  right: number;
}

function asViewCamera(
  view: { x: number; y: number; facing: string } | ViewCamera,
): ViewCamera {
  return "deg" in view ? view : cameraFromPose(view);
}

function rawProject(
  actor: { x: number; y: number; z?: number },
  view: { x: number; y: number; facing: string } | ViewCamera,
): RawProject {
  const cam = asViewCamera(view);
  const f = calcVect(cam.deg, 1);
  const feetDx = actor.x - cam.x;
  const feetDy = actor.y - cam.y;
  const feetForward = feetDx * f.x + feetDy * f.y;
  const back = calcVect(cam.deg + 128, CAMERA_SETBACK);
  const dx = actor.x - (cam.x + back.x);
  const dy = actor.y - (cam.y + back.y);
  const lensForward = dx * f.x + dy * f.y;
  const right = dx * -f.y + dy * f.x;
  const objZ = actor.z ?? 0;
  const camZ = cam.z ?? CAMERA_HEIGHT;
  if (lensForward <= 0) {
    return {
      x: SPRITE_HOTSPOT_X + right,
      y: enginePinholeY(objZ, SCALE_MIN_FORWARD, camZ),
      forward: 0,
      lensForward,
      right,
    };
  }
  return {
    x: SPRITE_HOTSPOT_X + Math.trunc((CAMERA_FOCAL * right) / lensForward),
    y: enginePinholeY(objZ, lensForward, camZ),
    forward: Math.max(0, feetForward),
    lensForward,
    right,
  };
}

function cullStill(hit: RawProject): StillHit | null {
  if (hit.lensForward > TILE_SPAN * 6) {
    return null;
  }
  if (hit.lensForward <= 0) {
    if (hit.lensForward < -16 || Math.abs(hit.right) > 48) {
      return null;
    }
    return { x: hit.x, y: hit.y, forward: 0, lensForward: hit.lensForward };
  }
  if (hit.lensForward < SCALE_MIN_FORWARD) {
    return null;
  }
  if (hit.x < -48 || hit.x > STILL_WIDTH + 48) {
    return null;
  }
  return {
    x: hit.x,
    y: hit.y,
    forward: hit.forward,
    lensForward: hit.lensForward,
  };
}

/**
 * Project a world point onto the 512×264 still.
 *
 * **X** is DF.EXE `0x40dcd0` (CST `0x415213` and PRP `0x428173`):
 *   x = 256 + 310 * right / forward
 * after yaw-rotate (TRIG/16384) with lens set back SET +24 (64).
 *
 * **Y** is the same `0x40dcd0` pinhole:
 *   y = 132 − 310 * (objZ − camZ) / forward
 * camZ is SET +26 (town 62, chin 230). Do not hardcode 62 indoors.
 * Ground z=0 at N7 E lands the jug hotspot at **279** (sprite sits on
 * the HUD). Do not clamp Y into the still — a hotspot below 264 still blits.
 */
export function worldToStill(
  actor: { x: number; y: number; z?: number },
  view: { x: number; y: number; facing: string } | ViewCamera,
): StillHit | null {
  return cullStill(rawProject(actor, view));
}

/**
 * Sprite still-position during a SET filmstrip.
 *
 * Walks translate the camera `index*64`. Turns yaw `index*16`. Both
 * reproject with `0x40dcd0` every plate — the same path as standing.
 */
export function worldToStillFilmstrip(
  actor: { x: number; y: number; z?: number },
  from: { x: number; y: number; facing: string },
  to: { x: number; y: number; facing: string },
  t: number,
  cameraZ: number = CAMERA_HEIGHT,
): StillHit | null {
  return worldToStill(actor, lerpViewCamera(from, to, t, cameraZ));
}

/**
 * CST sprite for the current pose. DF.EXE `0x4154c0` matches the +0x2e
 * pose id, then picks the closest authored frame deg — not `octant % n`.
 * The dog is 7 plates at 16° around south; `% 7` wrapped the street
 * `actordeg 32` view back to the head-on plate.
 */
export function actorSprite(
  actor: ActorState,
  camera: ViewCamera,
): ActorState["standSprites"][number] | undefined {
  const pose = actor.pose || "stand";
  let frames = actor.sprites?.[pose];
  if (!frames?.length) {
    if (pose === "walk") {
      frames = actor.walkSprites.length ? actor.walkSprites : actor.standSprites;
    } else if (pose === "drink") {
      frames = actor.drinkSprites?.length ? actor.drinkSprites : actor.standSprites;
    } else {
      frames = actor.standSprites;
    }
  }
  if (!frames?.length) {
    return undefined;
  }
  const table =
    actor.walkTiming.length > 0 ? actor.walkTiming : timingForPose(actor.poseTiming, pose);
  return pickCstFrame(frames, actor.deg, actor, camera, actor.walkStep, table);
}
