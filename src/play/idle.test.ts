import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { actorSprite, calcDeg, cameraWorldPoint, dirToDeg, visibleOctant } from "./facing";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

function extractExists(...rels: string[]): boolean {
  return rels.every((rel) => existsSync(resolve("dfextract/out", rel)));
}

function scriptFrames(host: DustHost, n: number): void {
  host.tickScriptClock((n * host.framerateValue) / 60 + 0.0001);
}

async function bootLeroy(rng: () => number, pose = { x: 6, y: 14, facing: "N" as const }) {
  if (!extractExists("CST/_GANG/Cast.json", "CST/_GANG/Leroy/Script.json")) {
    return undefined;
  }
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
    const boot = await bootLeroy(() => 0);
    if (!boot) {
      return;
    }
    const { host, vm, leroy } = boot;
    expect(leroy.pose).toBe("drink");
    scriptFrames(host, 25);
    await host.runQueued(vm);
    expect(leroy.pose).toBe("stand");
  });

  it("adds 2 deg when the player is outside hotdist", async () => {
    const boot = await bootLeroy(() => 0.5, { x: 0, y: 0, facing: "N" });
    if (!boot) {
      return;
    }
    const { leroy } = boot;
    expect(leroy.deg).toBe(2);
    expect(leroy.pose).toBe("stand");
  });

  it("turns toward the camera instead of spinning when in range", async () => {
    const pose = { x: 6, y: 14, facing: "N" as const };
    const boot = await bootLeroy(() => 0.5, pose);
    if (!boot) {
      return;
    }
    const { leroy } = boot;
    const want = calcDeg(leroy, cameraWorldPoint(pose));
    expect(leroy.turning || leroy.deg === want).toBe(true);
    if (leroy.turning) {
      expect(leroy.degTarget).toBe(want);
    }
    expect(leroy.pose).toBe("stand");
  });

  it("re-aims when the player steps to O6", async () => {
    const boot = await bootLeroy(() => 0.5);
    if (!boot) {
      return;
    }
    const { host, vm, leroy } = boot;
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
    expect(visibleOctant(want, dirToDeg("N"))).not.toBe(
      visibleOctant(calcDeg(leroy, cameraWorldPoint({ x: 6, y: 14, facing: "N" })), dirToDeg("N")),
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
    expect(leroy.deg).toBe(dirToDeg("N"));
    expect(visibleOctant(leroy.deg, dirToDeg("N"))).toBe(4);
  });

  it("faces the walk vector to playerxyz, not a forced camera heading", () => {
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
    expect(leroy.deg).toBe(calcDeg(leroy, { x: 1664, y: 3712 }));
    expect(leroy.turning).toBe(false);
    expect([0, 7]).toContain(visibleOctant(leroy.deg, dirToDeg("N")));
  });

  it("does not keep an idle turn running after startWalk", () => {
    const host = new DustHost({} as PuppetUi);
    host.view = {
      pose: { x: 6, y: 12, facing: "N" },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
    };
    const help = host.namedActor("help");
    help.x = 1760;
    help.y = 3034;
    help.deg = 0;
    help.turning = true;
    help.degTarget = dirToDeg("N");
    const dest = { x: 6 * 256 + 128, y: 12 * 256 + 128 };
    host.startWalk(help, dest.x, dest.y, 0);
    host.advanceActorsOnce();
    expect(help.turning).toBe(false);
    expect(help.deg).toBe(calcDeg({ x: 1760, y: 3034 }, dest));
  });
});

describe("drink CST frames", () => {
  it("holds each pose for 6 script frames and does not loop", async () => {
    const boot = await bootLeroy(() => 0);
    if (!boot) {
      return;
    }
    const { host, leroy } = boot;
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

  it("starts dialog via hasattention if you wait in range instead of clicking", async () => {
    if (
      !extractExists(
        "CST/_GANG/Cast.json",
        "CST/_GANG/Leroy/Script.json",
        "PUP/_LEROY/Boot Script.json",
        "PUP/_LEROY/day1.json",
      )
    ) {
      return;
    }
    const calls: string[] = [];
    const ui = {
      async speak(text: string) {
        calls.push(`speak:${text.slice(0, 40)}`);
      },
      open() {
        calls.push("open");
      },
      close() {},
      preloadVoices: async () => undefined,
      setViseme() {},
      clear() {},
      addBevel() {},
      waitEvent: async () => -1,
      root: {} as HTMLDivElement,
    } as unknown as PuppetUi;

    const host = new DustHost(ui);
    host.rng = () => 0.5;
    const realCall = host.call.bind(host);
    host.call = async (name, args, ctx) => {
      const op = name.toLowerCase();
      if (op === "openpuppetfile" || op === "puppetspeak" || op === "runpuppet") {
        calls.push(op);
      }
      return realCall(name, args, ctx);
    };
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof requestAnimationFrame;
    globalThis.fetch = (async () =>
      ({
        ok: false,
        json: async () => ({}),
        text: async () => "",
      }) as Response) as typeof fetch;

    for (const proc of loadProcs("CST/_GANG/Cast.json")) {
      host.index.add("cast:gang", proc, "cast");
    }
    for (const proc of loadProcs("CST/_GANG/Leroy/Script.json")) {
      host.index.add("actor:leroy", proc, "leroy");
    }
    for (const proc of loadProcs("PUP/_LEROY/Boot Script.json")) {
      host.index.add("puppet:boot script", proc, "boot");
    }
    for (const proc of loadProcs("PUP/_LEROY/day1.json")) {
      host.index.add("puppet:day1", proc, "day1");
    }
    host.waypoints.set("town.leroy1", { x: 1740, y: 3536, name: "town.leroy1" });
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
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("leroyphase", 0);
    vm.globalNames.add("leroyphase");
    vm.globals.set("day", 1);
    vm.globalNames.add("day");
    vm.globals.set("clock", 3);
    vm.globalNames.add("clock");
    vm.globals.set("curattention", "");
    vm.globalNames.add("curattention");
    vm.globals.set("playerdeath", "");
    vm.globalNames.add("playerdeath");
    const leroy = await host.placeLeroyAtSign(vm);
    expect(leroy.visible).toBe(true);
    expect(leroy.star).toBe("town.leroy1");

    for (let i = 0; i < 240; i++) {
      scriptFrames(host, 1);
      await host.runQueued(vm);
      if (calls.includes("openpuppetfile") || calls.includes("puppetspeak")) {
        break;
      }
    }
    expect(calls.some((c) => c === "openpuppetfile" || c === "puppetspeak" || c.startsWith("speak:"))).toBe(
      true,
    );
    expect(leroy.y).toBeGreaterThan(3536);
  }, 60_000);

  it("pausewalk freezes NPC walks and drops queued endwalk", async () => {
    const host = new DustHost({} as PuppetUi);
    const leroy = host.namedActor("leroy");
    leroy.walking = true;
    leroy.x = 0;
    leroy.y = 0;
    leroy.destX = 100;
    leroy.destY = 0;
    leroy.speed = 3;
    const intern = host as unknown as { walkEnds: string[] };
    intern.walkEnds.push("leroy");
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    await host.call("pausewalk", ["all", true], vm);
    expect(intern.walkEnds).toEqual([]);
    host.advanceActorsOnce();
    expect(leroy.x).toBe(0);
    expect(leroy.walking).toBe(true);
    await host.call("pausewalk", ["all", false], vm);
    host.advanceActorsOnce();
    expect(leroy.x).toBe(3);
  });

  it("does not start a second idle runQueued on top of hasattention", async () => {
    const boot = await bootLeroy(() => 0.5);
    if (!boot) {
      return;
    }
    const { host, vm, leroy } = boot;
    vm.globals.set("curattention", "leroy");
    vm.globalNames.add("curattention");
    vm.globals.set("attentionspan", 0);
    vm.globalNames.add("attentionspan");
    host.frameCounter = 400;
    host.scriptBusy = true;
    scriptFrames(host, 1);
    const y0 = leroy.y;
    await host.runQueued(vm);
    expect(leroy.walking).toBe(false);
    expect(leroy.y).toBe(y0);
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
    const place = actorSprite(leroy, { x: 0, y: 0, deg: 128 });
    expect(place?.path).toBe("d8");
  });
});

describe("EXTRA idle makeloop", () => {
  it("dog doright arms lookright then alt", async () => {
    const dogScript = resolve("dfextract/out/CST/_EXTRA/dog/Script.json");
    if (!existsSync(dogScript)) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.rng = () => 0;
    for (const proc of loadProcs("CST/_EXTRA/dog/Script.json")) {
      host.index.add("actor:dog", proc, "dog");
    }
    const dog = host.namedActor("dog");
    dog.cast = "extra";
    dog.visible = true;
    dog.set = "town";
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await vm.inObject("actor", "dog", () => vm.evalCall("doright", []));
    expect(dog.pose).toBe("stand");
    scriptFrames(host, 60);
    await host.runQueued(vm);
    expect(dog.pose).toBe("alt");
  });
});
