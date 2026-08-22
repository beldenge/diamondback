import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { actorSprite, calcDeg, cameraWorldPoint, visibleOctant } from "./facing";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

function scriptFrames(host: DustHost, n: number): void {
  host.tickScriptClock((n * host.framerateValue) / 60 + 0.0001);
}

async function bootLeroy(rng: () => number, pose = { x: 6, y: 14, facing: "N" as const }) {
  const host = new DustHost({} as PuppetUi);
  host.rng = rng;
  host.waypoints.set("town.leroy1", { x: 1740, y: 3536, name: "town.leroy1" });
  for (const proc of loadProcs("CST/_GANG/Cast.json")) {
    host.index.add("cast:gang", proc, "cast");
  }
  for (const proc of loadProcs("CST/_GANG/Leroy/Script.json")) {
    host.index.add("actor:leroy", proc, "leroy");
  }
  host.currentSet = "town";
  host.view = {
    pose,
    world: "town",
    graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
    walk() {},
    async setPose() {},
    log() {},
    refreshActors() {},
  };
  const vm = new VM({
    call: (name, args, ctx) => host.call(name, args, ctx),
    lookup: (name, ctx) => host.lookup(name, ctx),
  });
  vm.globals.set("leroyphase", 0);
  vm.globalNames.add("leroyphase");
  vm.globals.set("day", 1);
  vm.globalNames.add("day");
  const leroy = await host.placeLeroyAtSign(vm);
  return { host, vm, leroy };
}

describe("Leroy idle from CST scripts", () => {
  it("drinks when leroyidle rolls < 8, then toidle stands", async () => {
    const { host, vm, leroy } = await bootLeroy(() => 0);
    expect(leroy.pose).toBe("drink");
    scriptFrames(host, 25);
    await host.runQueued(vm);
    expect(leroy.pose).toBe("stand");
  });

  it("adds 2 deg when the player is outside hotdist", async () => {
    const { leroy } = await bootLeroy(() => 0.5, { x: 0, y: 0, facing: "N" });
    expect(leroy.deg).toBe(2);
    expect(leroy.pose).toBe("stand");
  });

  it("turns toward the camera instead of spinning when in range", async () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    const { leroy } = await bootLeroy(() => 0.5, pose);
    const want = calcDeg(leroy, cameraWorldPoint(pose));
    expect(leroy.turning || leroy.deg === want).toBe(true);
    if (leroy.turning) {
      expect(leroy.degTarget).toBe(want);
    }
    expect(leroy.pose).toBe("stand");
  });

  it("re-aims when the player steps to O6", async () => {
    const { host, vm, leroy } = await bootLeroy(() => 0.5);
    let steps = 0;
    while (leroy.turning && steps < 2000) {
      host.advanceActors(1 / 60);
      steps += 1;
    }
    expect(leroy.turning).toBe(false);
    const o6 = { x: 5, y: 14, facing: "N" as const };
    host.view!.pose = o6;
    host.noticeCamera();
    scriptFrames(host, 2);
    await host.runQueued(vm);
    const want = calcDeg(leroy, cameraWorldPoint(o6));
    expect(leroy.turning || leroy.deg === want).toBe(true);
    if (leroy.turning) {
      expect(leroy.degTarget).toBe(want);
    }
    expect(visibleOctant(want, 128)).not.toBe(
      visibleOctant(calcDeg(leroy, cameraWorldPoint({ x: 6, y: 14, facing: "N" })), 128),
    );
  });
});

describe("approach walk", () => {
  it("faces the road when a hop lands on the player's tile", () => {
    const host = new DustHost({} as PuppetUi);
    host.view = {
      pose: { x: 6, y: 11, facing: "N" },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
    };
    const leroy = host.namedActor("leroy");
    leroy.x = 1664;
    leroy.y = 12 * 256 + 128;
    leroy.route = [{ x: 6 * 256 + 128, y: 10 * 256 + 128, z: 0 }];
    host.startWalk(leroy, 6 * 256 + 128, 11 * 256 + 128, 0);
    expect(leroy.deg).toBe(128);
    expect(visibleOctant(leroy.deg, 128)).toBe(4);
  });

  it("faces the camera when walking to playerxyz", () => {
    const host = new DustHost({} as PuppetUi);
    host.view = {
      pose: { x: 6, y: 14, facing: "N" },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
    };
    const leroy = host.namedActor("leroy");
    leroy.x = 1740;
    leroy.y = 3536;
    host.startWalk(leroy, 1664, 3712, 0);
    expect(leroy.pose).toBe("walk");
    expect(leroy.deg).toBe(0);
    expect(visibleOctant(leroy.deg, 128)).toBe(0);
  });
});

describe("drink CST frames", () => {
  it("holds each pose for 6 script frames and does not loop", async () => {
    const { host, leroy } = await bootLeroy(() => 0);
    leroy.drinkSprites = Array.from({ length: 32 }, (_, i) => ({
      path: `d${i}`,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    }));
    expect(leroy.pose).toBe("drink");
    expect(leroy.walkStep).toBe(0);
    scriptFrames(host, 6);
    expect(leroy.walkStep).toBe(0);
    scriptFrames(host, 1);
    expect(leroy.walkStep).toBe(1);
    scriptFrames(host, 18);
    expect(leroy.pose).toBe("drink");
    expect(leroy.walkStep).toBe(3);
  });

  it("uses the 8-dir × 4-pose strip like walk", () => {
    const host = new DustHost({} as PuppetUi);
    const leroy = host.namedActor("leroy");
    leroy.pose = "drink";
    leroy.deg = 0;
    leroy.drinkSprites = Array.from({ length: 32 }, (_, i) => ({
      path: `d${i}`,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    }));
    leroy.walkStep = 1;
    const place = actorSprite(leroy, 128);
    expect(place?.path).toBe("d8");
  });
});
