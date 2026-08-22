import { describe, expect, it } from "vitest";
import { worldToStill } from "./game";
import type { ActorState } from "./host";

function actor(x: number, y: number): ActorState {
  return {
    name: "leroy",
    cast: "gang",
    visible: true,
    set: "town",
    star: "town.leroy1",
    x,
    y,
    z: 0,
    deg: 128,
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
    zclip: 32,
    standSprites: [],
    walkSprites: [],
    drinkSprites: [],
    spriteRoot: "",
  };
}

describe("worldToStill", () => {
  it("puts Leroy ahead of the south-gate camera", () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    const at = worldToStill(actor(1740, 3536), pose);
    expect(at).not.toBeNull();
    expect(at!.x).toBeGreaterThan(320);
    expect(at!.x).toBeLessThan(420);
    expect(at!.y).toBeGreaterThan(160);
    expect(at!.y).toBeLessThan(250);
  });

  it("hides someone behind the camera", () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    expect(worldToStill(actor(1740, 4000), pose)).toBeNull();
  });
});
