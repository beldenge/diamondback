import { describe, expect, it } from "vitest";
import type { ActorState } from "./host";
import {
  calcDeg,
  calcVect,
  degDelta,
  degToOctant,
  dirToDeg,
  visibleOctant,
  walkFrame,
  worldToStill,
} from "./facing";
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

  it("points calcdeg at the camera from the south-gate sign", () => {
    const leroy = { x: 1664, y: 3584 };
    const camera = { x: 6 * 255 + 128, y: 14 * 255 + 128 };
    const deg = calcDeg(leroy, camera);
    expect(deg <= 16 || deg >= 240).toBe(true);
    expect(visibleOctant(deg, 128)).toBe(0);
  });

  it("walks south as +y", () => {
    const v = calcVect(0, 100);
    expect(v.y).toBeGreaterThan(90);
    expect(Math.abs(v.x)).toBeLessThan(1);
  });

  it("turns the short way across 0", () => {
    expect(degDelta(250, 10)).toBe(16);
    expect(degDelta(10, 250)).toBe(-16);
  });

  it("stores 8 facings per walk pose, not 8 poses per facing", () => {
    const frames = Array.from({ length: 64 }, (_, i) => i);
    expect(walkFrame(frames, 0, 0)).toBe(0);
    expect(walkFrame(frames, 0, 1)).toBe(8);
    expect(walkFrame(frames, 4, 0)).toBe(4);
    expect(walkFrame(frames, 4, 3)).toBe(3 * 8 + 4);
  });
});

describe("worldToStill", () => {
  it("puts Leroy ahead of the south-gate camera", () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    const at = worldToStill(actor(1664, 3584), pose);
    expect(at).not.toBeNull();
    expect(at!.x).toBeGreaterThan(200);
    expect(at!.x).toBeLessThan(320);
    expect(at!.y).toBeGreaterThan(160);
    expect(at!.y).toBeLessThan(250);
  });

  it("hides someone behind the camera", () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    expect(worldToStill(actor(1664, 4000), pose)).toBeNull();
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
