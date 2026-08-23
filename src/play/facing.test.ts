import { describe, expect, it } from "vitest";
import type { ActorState } from "./host";
import {
  actorCssHeight,
  actorStillHeight,
  ACTOR_SCALE_REF,
  CST_SCALE_FIELD,
  enginePinholeY,
  engineStillScale,
  calcDeg,
  calcVect,
  CAMERA_FOCAL,
  CAMERA_HEIGHT,
  CAMERA_SETBACK,
  cameraFromPose,
  cameraWorldPoint,
  degDelta,
  filmstripT,
  lerpViewCamera,
  degToOctant,
  dirToDeg,
  spriteDestRect,
  spriteStillTopLeft,
  SPRITE_HOTSPOT_X,
  worldSpriteHitsPoint,
  visibleOctant,
  angularDistance,
  pickCstFrame,
  spriteWantedDeg,
  actorSprite,
  gameFrameSec,
  poseFromTable,
  timingForPose,
  walkFrame,
  worldToStill,
  worldToStillFilmstrip,
  wrapDeg,
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
    sprites: {},
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

describe("CST sprite pick (DF.EXE 0x4154c0)", () => {
  const dogStand = [
    { path: "dog0", deg: 0, pose: 0 },
    { path: "dog16", deg: 16, pose: 0 },
    { path: "dog32", deg: 32, pose: 0 },
    { path: "dog48", deg: 48, pose: 0 },
    { path: "dog208", deg: 208, pose: 0 },
    { path: "dog224", deg: 224, pose: 0 },
    { path: "dog240", deg: 240, pose: 0 },
  ];

  it("is shortest circular distance (0x411f20)", () => {
    expect(angularDistance(32, 32)).toBe(0);
    expect(angularDistance(224, 228)).toBe(4);
    expect(angularDistance(0, 240)).toBe(16);
    expect(angularDistance(250, 10)).toBe(16);
  });

  it("uses the dog's 16° south arc even when sidecar deg is missing", () => {
    const unlabeled = dogStand.map(({ path }) => ({ path }));
    const dog = { x: 1620, y: 2748 };
    const l7n = cameraFromPose({ x: 6, y: 11, facing: "N" });
    const frame = pickCstFrame(unlabeled, 32, dog, l7n, 0, [1]);
    expect(frame?.path).toBe("dog224");
  });

  it("does not wrap 7 street plates through octant % 7 to the front", () => {
    // Looking north at L7, town.dog is ahead and a bit west. actordeg 32
    // is SE — the east ¾ (plate 224), not the west ¾ (plate 32).
    const dog = { x: 1620, y: 2748 };
    const l7n = cameraFromPose({ x: 6, y: 11, facing: "N" });
    const wanted = spriteWantedDeg(32, dog, l7n);
    expect(wanted).toBeGreaterThan(200);
    expect(wanted).toBeLessThan(240);
    const frame = pickCstFrame(dogStand, 32, dog, l7n, 0, [1]);
    expect(frame?.path).toBe("dog224");
    expect(frame?.path).not.toBe("dog0");
    expect(frame?.path).not.toBe("dog32");
  });

  it("keeps the east ¾ on the dog's tile instead of flipping", () => {
    const dog = { x: 1620, y: 2748 };
    const o7n = cameraFromPose({ x: 6, y: 14, facing: "N" });
    const k7n = cameraFromPose({ x: 6, y: 10, facing: "N" });
    expect(pickCstFrame(dogStand, 32, dog, o7n, 0, [1])?.path).toBe("dog224");
    expect(pickCstFrame(dogStand, 32, dog, k7n, 0, [1])?.path).toBe("dog224");
  });

  it("uses alt/left plates by deg too — not extra[0] when length < 8", () => {
    const alt = dogStand.map((frame) => ({ ...frame, path: `alt${frame.deg}` }));
    const dog = actor(1620, 2748, 32);
    dog.pose = "alt";
    dog.sprites = { alt };
    dog.standSprites = dogStand.map((frame) => ({
      path: frame.path,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      deg: frame.deg,
      pose: frame.pose,
    }));
    dog.sprites.alt = alt.map((frame) => ({
      path: frame.path,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      deg: frame.deg,
      pose: frame.pose,
    }));
    const l7n = cameraFromPose({ x: 6, y: 11, facing: "N" });
    const place = actorSprite(dog, l7n);
    expect(place?.path).toBe("alt224");
    expect(place?.path).not.toBe("alt0");
    expect(place?.path).not.toBe("alt32");
  });

  it("still picks the front 8-dir plate when the actor faces the lens", () => {
    const stand = Array.from({ length: 8 }, (_, i) => ({
      path: `s${i}`,
      deg: i * 32,
      pose: 0,
    }));
    const leroy = { x: 1740, y: 3536 };
    const o7n = cameraFromPose({ x: 6, y: 14, facing: "N" });
    const front = pickCstFrame(stand, 0, leroy, o7n, 0, [1]);
    expect(front?.path).toBe("s0");
  });
});

describe("worldToStill", () => {
  it("puts Leroy ahead of the south-gate camera", () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    const at = worldToStill(actor(1740, 3536), pose);
    expect(at).not.toBeNull();
    const feetX = 6 * TILE_SPAN + 128;
    const feetY = 14 * TILE_SPAN + 128;
    const lensY = feetY + CAMERA_SETBACK;
    const right = 1740 - feetX;
    const lensForward = lensY - 3536;
    expect(at!.x).toBe(SPRITE_HOTSPOT_X + Math.trunc((CAMERA_FOCAL * right) / lensForward));
    // Original O7 N midline ≈353 still-px; DF.EXE lands at 354.
    expect(at!.x).toBe(354);
    expect(at!.y).toBe(enginePinholeY(0, lensForward));
    expect(at!.y).toBe(212);
  });

  it("uses EXE pinhole Y, not 1/z, so same-tile ground sits on the HUD", () => {
    // 0x40dcd0: 132 − 310*(objZ−62)/forward. Ground z=0, forward 130 → 279.
    expect(enginePinholeY(0, 130)).toBe(279);
    expect(enginePinholeY(0, 240)).toBe(212);
  });

  it("drops Help onto the shop floor when camZ is SET +26, not town 62", () => {
    const chin = cameraFromPose({ x: 0, y: 1, facing: "E" }, 230);
    const help = worldToStill({ x: 708, y: 220, z: 0 }, chin);
    expect(help).not.toBeNull();
    const townY = enginePinholeY(0, help!.lensForward, CAMERA_HEIGHT);
    expect(help!.y).toBe(enginePinholeY(0, help!.lensForward, 230));
    expect(help!.y).toBeGreaterThan(townY);
    expect(help!.y).toBeGreaterThan(220);
  });

  it("blits CST frames from the header hotspot, not bbox center", () => {
    const front = spriteStillTopLeft(256, 192, { x: 220, y: 9 }, 1);
    expect(front).toEqual({ x: 220, y: 9 });
    const threeQ = spriteStillTopLeft(256, 192, { x: 215, y: 9 }, 1);
    expect(threeQ.x).toBe(215);
    expect(threeQ.x).not.toBe(220);
  });

  it("click-tests the dest rect so the head hits and the ground below the feet does not", () => {
    // Leroy stand: header (219, 14, 72×200), hotspot (256, 192). O7 N
    // scale 1450 / forward 240. A chest-high 80px box misses the hat.
    const place = { x: 219, y: 14, w: 72, h: 200 };
    const hx = 354;
    const hy = 212;
    const scale = engineStillScale(1450, 240);
    const rect = spriteDestRect(hx, hy, place, scale);
    expect(rect.top).toBeLessThan(hy - 80);
    expect(worldSpriteHitsPoint(hx, rect.top + 8, hx, hy, place, 1450, 240, CST_SCALE_FIELD)).toBe(
      true,
    );
    expect(worldSpriteHitsPoint(hx, hy - 80, hx, hy, place, 1450, 240, CST_SCALE_FIELD)).toBe(true);
    expect(worldSpriteHitsPoint(hx, rect.bottom + 12, hx, hy, place, 1450, 240, CST_SCALE_FIELD)).toBe(
      false,
    );
    // Chin Help: actorscale 5800. Same 80px box starts at the chest.
    const help = { x: 232, y: 57, w: 47, h: 138 };
    const helpScale = engineStillScale(5800, 200);
    const helpRect = spriteDestRect(256, 230, help, helpScale);
    expect(helpRect.top).toBeLessThan(230 - 80);
    expect(worldSpriteHitsPoint(256, 40, 256, 230, help, 5800, 200, CST_SCALE_FIELD)).toBe(true);
    expect(worldSpriteHitsPoint(256, helpRect.bottom + 8, 256, 230, help, 5800, 200, CST_SCALE_FIELD)).toBe(
      false,
    );
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

  it("yaws look-deg on an in-place turn but keeps camera XY", () => {
    const n7e = { x: 6, y: 13, facing: "E" as const };
    const n7s = { x: 6, y: 13, facing: "S" as const };
    const start = cameraFromPose(n7e);
    const mid = lerpViewCamera(n7e, n7s, 0.5);
    expect(mid.x).toBe(start.x);
    expect(mid.y).toBe(start.y);
    expect(mid.deg).toBe(wrapDeg(start.deg + degDelta(start.deg, cameraFromPose(n7s).deg) * 0.5));
    expect(mid.deg).not.toBe(start.deg);
  });

  it("reprojects the jug through pan yaw", () => {
    const n7e = { x: 6, y: 13, facing: "E" as const };
    const n7s = { x: 6, y: 13, facing: "S" as const };
    const jug = actor(1730, 3476);
    const start = worldToStillFilmstrip(jug, n7e, n7s, 0);
    const mid = worldToStillFilmstrip(jug, n7e, n7s, 0.5);
    const end = worldToStillFilmstrip(jug, n7e, n7s, 1);
    expect(start).toEqual(worldToStill(jug, n7e));
    expect(end).toEqual(worldToStill(jug, n7s));
    expect(mid).not.toBeNull();
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    expect(mid!.x).not.toBe(start!.x);
    // Pinhole at 45° is not the average of the two standing 1/z stills.
    expect(mid!.x).not.toBeCloseTo((start!.x + end!.x) / 2, 0);
  });

  it("steps a 5-frame walk as index/4 (EXE index*64)", () => {
    expect(filmstripT(0, 5)).toBe(0);
    expect(filmstripT(2, 5)).toBe(0.5);
    expect(filmstripT(4, 5)).toBe(1);
    expect(filmstripT(4, 6)).toBe(1);
    expect(filmstripT(5, 6)).toBe(1);
  });

  it("puts the N7 E jug on the HUD line (screenshot oracle)", () => {
    // N7_east_original.png: overlay bbox ~still (304,248)–(316,264) after
    // mapping 3× letterbox. Hotspot 279 sits 3px under the still; the
    // 64px jug (field 96, scale 800) paints up onto the dirt.
    const jug = actor(1730, 3476);
    const n7e = { x: 6, y: 13, facing: "E" as const };
    const n7s = { x: 6, y: 13, facing: "S" as const };
    const east = worldToStill(jug, n7e);
    expect(east).not.toBeNull();
    expect(east!.x).toBe(303);
    expect(east!.y).toBe(279);
    expect(east!.lensForward).toBeCloseTo(130, 0);
    const south = worldToStill(jug, n7s);
    expect(south).not.toBeNull();
    expect(south!.y).toBeGreaterThan(264);
    expect(n7e.x).toBe(n7s.x);
    expect(n7e.y).toBe(n7s.y);
  });

  it("still lerps camera XY on a forward walk", () => {
    const o7n = { x: 6, y: 14, facing: "N" as const };
    const n7n = { x: 6, y: 13, facing: "N" as const };
    const mid = lerpViewCamera(o7n, n7n, 0.5);
    expect(mid.y).toBeLessThan(cameraFromPose(o7n).y);
    expect(mid.y).toBeGreaterThan(cameraFromPose(n7n).y);
    expect(mid.y).toBeCloseTo((cameraFromPose(o7n).y + cameraFromPose(n7n).y) / 2);
    expect(mid.deg).toBe(dirToDeg("N"));
    const leroy = actor(1740, 3536);
    expect(worldToStillFilmstrip(leroy, o7n, n7n, 0)).toEqual(worldToStill(leroy, o7n));
    const midStill = worldToStillFilmstrip(leroy, o7n, n7n, 0.5);
    expect(midStill).not.toBeNull();
    expect(midStill!.x).toBeGreaterThan(worldToStill(leroy, o7n)!.x);
  });

  it("does not plant the south-gate actor on the O7 east still", () => {
    // Off-axis of a 310-focal still (|right| / forward > 256/310).
    const o7e = { x: 6, y: 14, facing: "E" as const };
    expect(worldToStill(actor(1740, 3536), o7e)).toBeNull();
  });

  it("slides the south-gate actor off during an O7 north-to-east pan", () => {
    const o7n = { x: 6, y: 14, facing: "N" as const };
    const o7e = { x: 6, y: 14, facing: "E" as const };
    const leroy = actor(1740, 3536);
    const start = worldToStillFilmstrip(leroy, o7n, o7e, 0);
    const mid = worldToStillFilmstrip(leroy, o7n, o7e, 0.5);
    expect(start).not.toBeNull();
    expect(start!.x).toBeCloseTo(354, 0);
    expect(mid).not.toBeNull();
    expect(mid!.x).toBeLessThan(start!.x);
    expect(worldToStillFilmstrip(leroy, o7n, o7e, 1)).toBeNull();
  });

  it("puts the camera-tile feet in the HUD band (pinhole, not 1/z near plane)", () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    const close = worldToStill(actor(6 * TILE_SPAN + 128, 14 * TILE_SPAN + 128), pose);
    expect(close).not.toBeNull();
    expect(close!.y).toBeGreaterThan(264);
  });
});

describe("actor sprite size", () => {
  it("uses CST +0x2a field 114 over lens-forward (0x415271)", () => {
    expect(engineStillScale(ACTOR_SCALE_REF, 240, CST_SCALE_FIELD)).toBeCloseTo(
      (1450 * 114) / (1000 * 240),
    );
    expect(actorStillHeight(199, 1100, 240)).toBeCloseTo((199 * 1100 * 114) / (1000 * 240));
  });

  it("uses Leroy's setupactor 1100 and lens-forward 240 at the south gate", () => {
    const h = actorStillHeight(199, 1100, 240);
    expect(h).toBeCloseTo(104, 0);
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
