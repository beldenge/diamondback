import { describe, expect, it } from "vitest";
import type { ActorState } from "./host";
import {
  actorCssHeight,
  actorPerspective,
  actorStillHeight,
  ACTOR_SCALE_REF,
  calcDeg,
  calcVect,
  CAMERA_FOCAL,
  CAMERA_SETBACK,
  cameraFromPose,
  cameraWorldPoint,
  degDelta,
  lerpViewCamera,
  degToOctant,
  dirToDeg,
  spriteStillTopLeft,
  SPRITE_HOTSPOT_X,
  stillGroundY,
  visibleOctant,
  gameFrameSec,
  poseFromTable,
  timingForPose,
  walkFrame,
  worldToStill,
} from "./facing";
import { TILE_SPAN } from "../world/set/path";
import { playStageRect, STAGE_HEIGHT, STAGE_WIDTH } from "./stage";

function actor(x: number, y: number, deg = 0): ActorState {
  return {
    name: "leroy",
    cast: "gang",
    visible: true,
    set: "town",
    star: "town.leroy1",
    x,
    y,
    z: 0,
    deg,
    scale: 1100,
    pose: "stand",
    owner: "none",
    value: 0,
    speed: 3,
    turnSpeed: 7,
    walking: false,
    turning: false,
    destX: 0,
    destY: 0,
    destZ: 0,
    route: [],
    degTarget: 0,
    walkStep: 0,
    walkAcc: 0,
    poseTiming: {},
    walkTiming: [],
    zclip: 32,
    standSprites: [],
    walkSprites: [],
    drinkSprites: [],
    spriteRoot: "",
  };
}

describe("actordeg octants", () => {
  it("maps 0=S 64=E 128=N 192=W", () => {
    expect(degToOctant(0)).toBe(0);
    expect(degToOctant(64)).toBe(2);
    expect(degToOctant(128)).toBe(4);
    expect(degToOctant(192)).toBe(6);
    expect(dirToDeg("N")).toBe(128);
  });

  it("shows the front when the actor faces the camera", () => {
    expect(visibleOctant(0, 128)).toBe(0);
    expect(visibleOctant(128, 128)).toBe(4);
  });

  it("walks east to the right of a north-facing still", () => {
    // walk/frame_5 (oct 2) faces left; walk/frame_9 (oct 6) faces right.
    expect(visibleOctant(64, 128)).toBe(6);
    expect(visibleOctant(192, 128)).toBe(2);
  });

  it("points calcdeg at the camera from the south-gate sign", () => {
    // town.leroy1 in TOWN.SET (1740, 3536); O7 N feet (1664, 3712).
    const leroy = { x: 1740, y: 3536 };
    const camera = { x: 6 * TILE_SPAN + 128, y: 14 * TILE_SPAN + 128 };
    const deg = calcDeg(leroy, camera);
    // 82 east of O7 → SSW. Clockwise CST plates: 0 front, 1 slight ¾.
    expect([0, 1]).toContain(visibleOctant(deg, 128));
  });

  it("walks south as +y", () => {
    const v = calcVect(0, 100);
    expect(v.y).toBeGreaterThan(90);
    expect(Math.abs(v.x)).toBeLessThan(1);
  });

  it("puts cameraxyz one tile behind the feet along the view", () => {
    const o7n = cameraWorldPoint({ x: 6, y: 14, facing: "N" });
    const feet = { x: 6 * TILE_SPAN + 128, y: 14 * TILE_SPAN + 128 };
    expect(o7n.x).toBeCloseTo(feet.x);
    expect(o7n.y).toBeCloseTo(feet.y + 256);
    const o6e = cameraWorldPoint({ x: 5, y: 14, facing: "E" });
    expect(o6e.x).toBeLessThan(5 * TILE_SPAN + 128);
  });

  it("turns the short way across 0", () => {
    expect(degDelta(250, 10)).toBe(16);
    expect(degDelta(10, 250)).toBe(-16);
  });

  it("maps boot framerate 3 to a 20 Hz game frame", () => {
    expect(gameFrameSec(3)).toBeCloseTo(3 / 60, 10);
    expect(gameFrameSec(1)).toBeCloseTo(1 / 60, 10);
  });

  it("holds Leroy walk poses two engine ticks each", () => {
    const table = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8];
    expect(poseFromTable(table, 0, 8)).toBe(0);
    expect(poseFromTable(table, 1, 8)).toBe(0);
    expect(poseFromTable(table, 2, 8)).toBe(1);
    expect(poseFromTable(table, 15, 8)).toBe(7);
    expect(poseFromTable(table, 16, 8)).toBe(0);
  });

  it("uses each CST pose table, including extra 2-pose walks", () => {
    const pig = [1, 1, 2, 2];
    expect(poseFromTable(pig, 0, 2)).toBe(0);
    expect(poseFromTable(pig, 2, 2)).toBe(1);
    const tables = { walk: pig, stand: [1] };
    expect(timingForPose(tables, "walk")).toEqual(pig);
    expect(timingForPose(tables, "stand")).toEqual([1]);
    expect(timingForPose(tables, "drink")).toEqual([]);
  });

  it("stores 8 facings per walk pose, not 8 poses per facing", () => {
    const frames = Array.from({ length: 64 }, (_, i) => i);
    expect(walkFrame(frames, 0, 0)).toBe(0);
    expect(walkFrame(frames, 0, 1)).toBe(8);
    expect(walkFrame(frames, 4, 0)).toBe(4);
    expect(walkFrame(frames, 4, 3)).toBe(3 * 8 + 4);
  });

  it("keeps 8 facings on a 4-pose drink strip", () => {
    const frames = Array.from({ length: 32 }, (_, i) => i);
    expect(walkFrame(frames, 0, 1)).toBe(8);
    expect(walkFrame(frames, 4, 0)).toBe(4);
  });
});

describe("worldToStill", () => {
  it("puts Leroy ahead of the south-gate camera", () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    const at = worldToStill(actor(1740, 3536), pose);
    expect(at).not.toBeNull();
    const feetX = 6 * TILE_SPAN + 128;
    const feetY = 14 * TILE_SPAN + 128;
    const feetForward = feetY - 3536;
    const lensY = feetY + CAMERA_SETBACK;
    const right = 1740 - feetX;
    const lensForward = lensY - 3536;
    expect(at!.x).toBeCloseTo(SPRITE_HOTSPOT_X + (CAMERA_FOCAL * right) / lensForward);
    // Original O7 N midline ≈353 still-px; DF.EXE lands at 354.
    expect(at!.x).toBeCloseTo(354, 0);
    expect(at!.y).toBeCloseTo(stillGroundY(feetForward));
    expect(at!.y).toBeGreaterThan(194);
    expect(at!.y).toBeLessThan(210);
  });

  it("uses 1/z for Y (scale), matching O7 N Z bands", () => {
    // Z=5 band is y=194–209; 1/z at O7 N feet-forward 176 lands at ~199.
    const y = stillGroundY(176);
    expect(y).toBeCloseTo(128 + (248 - 128) * actorPerspective(176));
    expect(y).toBeGreaterThan(194);
    expect(y).toBeLessThan(210);
  });

  it("blits CST frames from the header hotspot, not bbox center", () => {
    const front = spriteStillTopLeft(256, 192, { x: 220, y: 9 }, 1);
    expect(front).toEqual({ x: 220, y: 9 });
    const threeQ = spriteStillTopLeft(256, 192, { x: 215, y: 9 }, 1);
    expect(threeQ.x).toBe(215);
    expect(threeQ.x).not.toBe(220);
  });

  it("hides someone behind the camera", () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    expect(worldToStill(actor(1740, 4000), pose)).toBeNull();
  });

  it("keeps someone 4 tiles down the street in view", () => {
    // K7 looking east: Leroy on the range road at K11 (10,10).
    const k7e = { x: 6, y: 10, facing: "E" as const };
    const at = worldToStill(actor(10 * TILE_SPAN + 128, 10 * TILE_SPAN + 128), k7e);
    expect(at).not.toBeNull();
    expect(at!.x).toBeCloseTo(SPRITE_HOTSPOT_X);
    expect(at!.forward).toBeCloseTo(4 * TILE_SPAN);
  });

  it("does not plant a cross-street walker in the north still", () => {
    // K7 looking north: same man is to the east, not in that photo.
    const k7n = { x: 6, y: 10, facing: "N" as const };
    expect(worldToStill(actor(10 * TILE_SPAN + 128, 10 * TILE_SPAN + 128), k7n)).toBeNull();
  });

  it("lerps look yaw on an O7 right turn but keeps camera XY", () => {
    const o7n = { x: 6, y: 14, facing: "N" as const };
    const o7e = { x: 6, y: 14, facing: "E" as const };
    const start = cameraFromPose(o7n);
    const end = cameraFromPose(o7e);
    expect(lerpViewCamera(o7n, o7e, 0)).toEqual(start);
    expect(lerpViewCamera(o7n, o7e, 1).deg).toBe(end.deg);
    expect(lerpViewCamera(o7n, o7e, 1).x).toBe(start.x);
    expect(lerpViewCamera(o7n, o7e, 1).y).toBe(start.y);
    const mid = lerpViewCamera(o7n, o7e, 0.5);
    expect(mid.deg).toBeGreaterThan(64);
    expect(mid.deg).toBeLessThan(128);
  });

  it("does not plant the south-gate actor on the O7 east still", () => {
    // Off-axis of a 310-focal still (|right| / forward > 256/310).
    const o7e = { x: 6, y: 14, facing: "E" as const };
    expect(worldToStill(actor(1740, 3536), o7e)).toBeNull();
  });

  it("keeps feet on the still, not in the HUD band", () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    const close = worldToStill(actor(6 * TILE_SPAN + 128, 14 * TILE_SPAN + 128), pose);
    expect(close).not.toBeNull();
    expect(close!.y).toBeLessThanOrEqual(264);
  });
});

describe("actor sprite size", () => {
  it("is native height at stdscale on the camera plane", () => {
    expect(actorStillHeight(199, ACTOR_SCALE_REF, 0)).toBeCloseTo(199);
  });

  it("uses Leroy's setupactor 1100 and 1/z in 256-unit tiles", () => {
    // town.leroy1 (1740, 3536) vs O7 N feet (1664, 3712) → forward 176
    const h = actorStillHeight(199, 1100, 176);
    expect(h).toBeCloseTo(199 * (1100 / ACTOR_SCALE_REF) * (256 / (256 + 176)));
    expect(h).toBeLessThan(100);
    expect(h).toBeGreaterThan(70);
  });

  it("tracks the letterboxed still instead of raw CSS pixels", () => {
    const still = actorStillHeight(199, ACTOR_SCALE_REF, 114);
    expect(actorCssHeight(199, ACTOR_SCALE_REF, 114, 264)).toBeCloseTo(still);
    expect(actorCssHeight(199, ACTOR_SCALE_REF, 114, 528)).toBeCloseTo(still * 2);
    expect(actorCssHeight(199, ACTOR_SCALE_REF, 114, 132)).toBeCloseTo(still * 0.5);
  });
});

describe("play stage", () => {
  it("letterboxes a 512×384 framebuffer", () => {
    const rect = playStageRect(1280, 800);
    expect(rect.scale).toBe(2);
    expect(rect.w).toBe(STAGE_WIDTH * 2);
    expect(rect.h).toBe(STAGE_HEIGHT * 2);
    expect(rect.worldH).toBe(264 * 2);
    expect(rect.hudH).toBe(120 * 2);
  });
});
