import { describe, expect, it } from "vitest";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";

describe("actor walk wait", () => {
  it("reaches the player before the script while-loop cap", () => {
    const host = new DustHost({} as PuppetUi);
    const actor = host.namedActor("leroy");
    actor.x = 1784;
    actor.y = 3510;
    actor.speed = 3;
    host.startWalk(actor, 1658, 3698, 0);
    let frames = 0;
    while (actor.walking && frames < 2048) {
      host.advanceActors(1 / 60);
      frames += 1;
    }
    expect(actor.walking).toBe(false);
    expect(frames).toBeLessThan(2048);
    expect(actor.x).toBe(1658);
    expect(actor.y).toBe(3698);
  });
});
