import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { buildSetGraph } from "../world/set/graph";
import type { SceneRecord, TransitionRecord } from "../world/set/types";
import { dirWord, DustHost, puppetFolder } from "./host";
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

  it("advances walk poses one CST table slot per game frame", () => {
    const host = new DustHost({} as PuppetUi);
    const actor = host.namedActor("leroy");
    actor.x = 1740;
    actor.y = 3536;
    actor.speed = 3;
    actor.poseTiming = {
      walk: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8],
    };
    actor.walkSprites = Array.from({ length: 64 }, (_, i) => ({
      path: `w${i}`,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    }));
    host.startWalk(actor, 1664, 3712, 0);
    expect(actor.walkTiming).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
    host.advanceActorsOnce();
    expect(actor.walking).toBe(true);
    expect(actor.walkStep).toBe(1);
    host.advanceActorsOnce();
    expect(actor.walkStep).toBe(2);
  });

  it("moves actorspeed units once per game frame, not per 60 Hz rAF", () => {
    const host = new DustHost({} as PuppetUi);
    const actor = host.namedActor("leroy");
    actor.x = 0;
    actor.y = 0;
    actor.speed = 3;
    host.startWalk(actor, 300, 0, 0);
    host.advanceActors(1 / 60);
    expect(actor.x).toBe(0);
    host.advanceActors(2 / 60);
    expect(actor.x).toBeCloseTo(3, 5);
    host.advanceActorsOnce();
    expect(actor.x).toBeCloseTo(6, 5);
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
    const pathsPath = resolve("dfextract/out/SET/_NITE/paths.json");
    if (existsSync(pathsPath)) {
      host.paths = JSON.parse(readFileSync(pathsPath, "utf8"));
    }
    const actor = host.namedActor("leroy");
    actor.x = 1740;
    actor.y = 3536;
    actor.star = "town.leroy1";
    actor.speed = 3;
    void host.call("walktostar", ["leroy", "town.leroy2"], {} as VM);
    expect(actor.walking).toBe(true);
    expect(actor.route.length).toBeGreaterThan(3);
    expect(actor.destX).toBeCloseTo(1664, 0);
    expect(actor.destY).toBeCloseTo(3476, 0);
    expect(actor.route.at(-1)).toEqual({ x: 2656, y: 2720, z: 0 });
  });
});

describe("currentview words", () => {
  it("returns north not n", async () => {
    const host = new DustHost({} as PuppetUi);
    host.currentDir = "N";
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    expect(dirWord("N")).toBe("north");
    expect(await host.call("currentview", [], vm)).toBe("north");
    expect(await host.call("currentdir", [], vm)).toBe("north");
  });
});

describe("pig pen row/col", () => {
  it("reads script scene b11 as row 11 col 2", async () => {
    const host = new DustHost({} as PuppetUi);
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    expect(await host.call("scenerow", ["scene b11"], vm)).toBe(11);
    expect(await host.call("scenecol", ["scene c12"], vm)).toBe(3);
    expect(await host.call("actorexists", ["scene e11"], vm)).toBe(11);
    expect(await host.call("propexists", ["scene e12"], vm)).toBe(5);
  });

  it("returns 1..n so findscene (random (6)) never hits 0", async () => {
    const host = new DustHost({} as PuppetUi);
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    host.rng = () => 0;
    expect(await host.call("random", [6], vm)).toBe(1);
    host.rng = () => 0.999;
    expect(await host.call("random", [6], vm)).toBe(6);
  });

  it("puts chicken in the day-1 farm between c11 and e11", async () => {
    const host = new DustHost({} as PuppetUi);
    const scenes = new Map();
    for (let y = 0; y < 15; y += 1) {
      for (let x = 0; x < 15; x += 1) {
        scenes.set(`${x},${y}`, {
          x,
          y,
          interact: 0,
          unknown_c: 0,
          blocked: 0,
          unknown_e: 0,
          name: x === 10 && y === 3 ? "chicken" : `Scene ${"ABCDEFGHIJKLMNO"[y]}${x + 1}`,
          script_container: 0,
        });
      }
    }
    host.view = {
      pose: { x: 6, y: 14, facing: "N" },
      world: "town",
      graph: { scenes, cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    expect(host.scenePose("chicken")).toEqual({ x: 3, y: 10 });
    expect(await host.call("scenerow", ["chicken"], vm)).toBe(11);
    expect(await host.call("scenecol", ["chicken"], vm)).toBe(4);
    const cells = [
      ["scene b11", 2, 11],
      ["scene c11", 3, 11],
      ["scene c12", 3, 12],
      ["chicken", 4, 11],
      ["scene e11", 5, 11],
      ["scene e12", 5, 12],
    ] as const;
    const adj = (a: readonly [string, number, number], b: readonly [string, number, number]) =>
      (a[2] === b[2] && Math.abs(a[1] - b[1]) === 1) ||
      (a[1] === b[1] && Math.abs(a[2] - b[2]) === 1);
    expect(cells.every((cell, i) => cells.some((other, j) => i !== j && adj(cell, other)))).toBe(
      true,
    );
  });
});

describe("passcode inheritance", () => {
  it("falls through scene keydown to the SET walk", async () => {
    const host = new DustHost({} as PuppetUi);
    host.index.add("scene:scene g15", {
      name: "keydown",
      params: ["arg"],
      body: [{ type: "passcode" }],
    }, "scene");
    let walked = "";
    host.view = {
      pose: { x: 6, y: 14, facing: "N" },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk(kind) {
        walked = kind;
      },
      async setPose() {},
      log() {},
      refreshActors() {},
    };
    host.index.add("set", {
      name: "keydown",
      params: ["arg"],
      body: [{
        type: "call",
        call: { type: "call", name: "currentscene", args: [{ type: "str", value: "strait" }] },
      }],
    }, "set");
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await vm.inObject("scene", "scene g15", () =>
      vm.evalCall("keydown", [{ type: "str", value: "uparrow" }]),
    );
    expect(walked).toBe("strait");
  });
});

describe("first evening initactors", () => {
  it("places Leroy at the sign and the dog on the street", async () => {
    const gang = resolve("dfextract/out/CST/_GANG/Cast.json");
    const extra = resolve("dfextract/out/CST/_EXTRA/Cast.json");
    const leroy = resolve("dfextract/out/CST/_GANG/Leroy/Script.json");
    const dog = resolve("dfextract/out/CST/_EXTRA/dog/Script.json");
    if (![gang, extra, leroy, dog].every((p) => existsSync(p))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.rng = () => 0;
    host.currentSet = "town";
    host.waypoints.set("town.leroy1", { x: 1740, y: 3536, name: "town.leroy1" });
    host.waypoints.set("town.dog", { x: 1620, y: 2748, name: "town.dog" });
    for (const proc of loadProcs("CST/_GANG/Cast.json")) {
      host.index.add("cast:gang", proc, "cast");
    }
    for (const proc of loadProcs("CST/_EXTRA/Cast.json")) {
      host.index.add("cast:extra", proc, "extra");
    }
    for (const proc of loadProcs("CST/_GANG/Leroy/Script.json")) {
      host.index.add("actor:leroy", proc, "leroy");
    }
    for (const proc of loadProcs("CST/_EXTRA/dog/Script.json")) {
      host.index.add("actor:dog", proc, "dog");
    }
    host.namedActor("leroy").cast = "gang";
    host.namedActor("dog").cast = "extra";
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
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("day", 1);
    vm.globals.set("clock", 3);
    vm.globals.set("phase", 0);
    vm.globalNames.add("day");
    vm.globalNames.add("clock");
    vm.globalNames.add("phase");
    vm.globalNames.add("leroyphase");
    await vm.inObject("cast", "gang", () => vm.evalCall("initactors", []));
    const sign = host.namedActor("leroy");
    expect(sign.visible).toBe(true);
    expect(sign.x).toBe(1740);
    expect(sign.y).toBe(3536);
    expect(sign.star).toBe("town.leroy1");
    const dogActor = host.namedActor("dog");
    expect(dogActor.visible).toBe(true);
    expect(dogActor.star).toBe("town.dog");
    expect(dogActor.x).toBe(1620);
    expect(dogActor.y).toBe(2748);
    expect(dogActor.deg).toBe(32);
    expect(dogActor.scale).toBe(880);
  });
});
