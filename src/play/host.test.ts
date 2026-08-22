import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { buildSetGraph } from "../world/set/graph";
import type { SceneRecord, TransitionRecord } from "../world/set/types";
import { DustHost, puppetFolder } from "./host";
import type { PuppetUi } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

describe("puppet folders", () => {
  it("maps any actor name to the extract folder", () => {
    expect(puppetFolder("leroy")).toBe("PUP/_LEROY");
    expect(puppetFolder("jenix.pup")).toBe("PUP/_JENIX");
    expect(puppetFolder("ISAO")).toBe("PUP/_ISAO");
  });
});

describe("Leroy sign star", () => {
  it("uses extracted town.leroy1 via setupactor(sign)", async () => {
    const host = new DustHost({} as PuppetUi);
    host.waypoints.set("town.leroy1", { x: 1740, y: 3536, name: "town.leroy1" });
    for (const proc of loadProcs("CST/_GANG/Cast.json")) {
      host.index.add("cast:gang", proc, "cast");
    }
    for (const proc of loadProcs("CST/_GANG/Leroy/Script.json")) {
      host.index.add("actor:leroy", proc, "leroy");
    }
    host.currentSet = "town";
    host.view = {
      pose: { x: 6, y: 14, facing: "N" },
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
    host.rng = () => 0.5;
    const leroy = await host.placeLeroyAtSign(vm);
    expect(leroy.x).toBe(1740);
    expect(leroy.y).toBe(3536);
    expect(leroy.scale).toBe(1100);
    expect(leroy.star).toBe("town.leroy1");
  });
});

describe("actor walk wait", () => {
  it("reaches the player before the script while-loop cap", () => {
    const host = new DustHost({} as PuppetUi);
    const actor = host.namedActor("leroy");
    actor.x = 1740;
    actor.y = 3536;
    actor.speed = 3;
    host.startWalk(actor, 1664, 3712, 0);
    let frames = 0;
    while (actor.walking && frames < 2048) {
      host.advanceActors(1 / 60);
      frames += 1;
    }
    expect(actor.walking).toBe(false);
    expect(frames).toBeLessThan(2048);
    expect(actor.x).toBe(1664);
    expect(actor.y).toBe(3712);
  });

  it("advances walk poses by distance, not a 0.08s treadmill", () => {
    const host = new DustHost({} as PuppetUi);
    const actor = host.namedActor("leroy");
    actor.x = 1740;
    actor.y = 3536;
    actor.speed = 3;
    actor.walkSprites = Array.from({ length: 64 }, (_, i) => ({
      path: `w${i}`,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    }));
    host.startWalk(actor, 1664, 3712, 0);
    let frames = 0;
    while (actor.walkStep === 0 && actor.walking && frames < 2048) {
      host.advanceActors(1 / 60);
      frames += 1;
    }
    expect(actor.walking).toBe(true);
    expect(actor.walkStep).toBeGreaterThanOrEqual(1);
    // 32 units/pose at 72 units/s ≈ 27 frames, not 5 (the old 0.08s clock).
    expect(frames).toBeGreaterThan(20);
  });

  it("routes walktostar to town.leroy2 along the street", () => {
    const scenesPath = resolve("dfextract/out/SET/_NITE/scenes.json");
    const transPath = resolve("dfextract/out/SET/_NITE/transitions.json");
    if (!existsSync(scenesPath) || !existsSync(transPath)) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
    const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
    host.view = {
      pose: { x: 6, y: 14, facing: "N" },
      world: "town",
      graph: buildSetGraph(scenes, records),
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
    };
    host.waypoints.set("town.leroy2", { x: 2656, y: 2720, name: "town.leroy2" });
    const actor = host.namedActor("leroy");
    actor.x = 1740;
    actor.y = 3536;
    actor.speed = 3;
    void host.call("walktostar", ["leroy", "town.leroy2"], {} as VM);
    expect(actor.walking).toBe(true);
    expect(actor.route.length).toBeGreaterThan(3);
    expect(actor.destX).toBeCloseTo(6 * 256 + 128, 0);
    expect(actor.destY).toBeCloseTo(3536, 0);
    expect(actor.route.at(-1)).toEqual({ x: 2656, y: 2720, z: 0 });
  });
});
