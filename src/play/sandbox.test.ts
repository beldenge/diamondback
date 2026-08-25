import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import {
  applySandboxStoryFlags,
  hideRangeCastOffSet,
  hideSandboxGroundPickups,
  hideSandboxStoryActors,
  sandboxKeepWorldProp,
  SANDBOX_STORY_FLAGS,
  sandboxClockFromSearch,
  sandboxGraphFolder,
  sandboxKeepActor,
  sandboxLeroyRangeRunyoself,
  sandboxLeroyRangeTalk,
  SANDBOX_RANGE_ANIMAL_SEEDS,
  sandboxRangeAnimalsToSeed,
  sandboxSkipRangeWalkWait,
  sandboxTownAnimalsToSeed,
  sandboxTownSetFile,
} from "./sandbox";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

function dummyView(): NonNullable<DustHost["view"]> {
  return {
    pose: { x: 6, y: 14, facing: "N" },
    world: "town",
    graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
    walk() {},
    async setPose() {},
    log() {},
    refreshActors() {},
  };
}

describe("sandboxKeepActor", () => {
  it("keeps minigame NPCs and the shooting-range cast", () => {
    expect(sandboxKeepActor({ name: "leroy", cast: "gang" })).toBe(true);
    expect(sandboxKeepActor({ name: "bolivar", cast: "gang" })).toBe(true);
    expect(sandboxKeepActor({ name: "target3", cast: "target" })).toBe(true);
    expect(sandboxKeepActor({ name: "bottle1targ", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "chicken1targ", cast: "target" })).toBe(true);
    expect(sandboxKeepActor({ name: "pigtarg", cast: "target" })).toBe(true);
    expect(sandboxKeepActor({ name: "birdtarg", cast: "target" })).toBe(true);
  });

  it("keeps town livestock and still drops the dog", () => {
    expect(sandboxKeepActor({ name: "pig", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "cow", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "chicken1", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "chicken2", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "bird1", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "bird5", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "dog", cast: "extra" })).toBe(false);
    expect(sandboxKeepActor({ name: "horse1", cast: "extra" })).toBe(false);
    expect(sandboxKeepActor({ name: "birdcage", cast: "extra" })).toBe(false);
    expect(sandboxKeepActor({ name: "gus", cast: "gang" })).toBe(false);
    expect(sandboxKeepActor({ name: "help", cast: "gang" })).toBe(false);
    expect(sandboxKeepActor({ name: "oona", cast: "gang" })).toBe(false);
  });
});

describe("sandbox animal seeds", () => {
  it("asks for the afternoon pig and any livestock EXTRA did not place", () => {
    const placed = [
      { name: "cow", visible: true },
      { name: "chicken1", visible: true },
      { name: "pig", visible: false },
    ];
    expect(sandboxTownAnimalsToSeed("town", placed).map((row) => row.name)).toEqual([
      "pig",
      "chicken2",
      "chicken3",
      "bird1",
    ]);
    expect(sandboxTownAnimalsToSeed("target", placed)).toEqual([]);
  });

  it("asks for the range chicken, pig, and crows when TARGET left them hidden", () => {
    const seeded = sandboxRangeAnimalsToSeed("target", [
      { name: "bottle1targ", visible: true },
      { name: "chicken1targ", visible: false },
    ]);
    expect(seeded.map((row) => row.name)).toEqual([
      "chicken1targ",
      "pigtarg",
      "birdtarg",
      "birdtarg2",
      "birdtarg3",
    ]);
    expect(sandboxRangeAnimalsToSeed("town", [{ name: "chicken1targ", visible: false }])).toEqual([]);
  });

  it("puts range crows on-camera in flight, not off-still birdstar1", () => {
    const crows = SANDBOX_RANGE_ANIMAL_SEEDS.filter((row) => row.name.startsWith("bird"));
    expect(crows.map((row) => row.star)).toEqual(["birdstar2", "birdstar4", "birdstar5"]);
    expect(crows.every((row) => row.pose === "flight" && row.z === 180)).toBe(true);
  });
});

describe("sandbox clock query", () => {
  it("reads Unlocked ?clock= and maps the SET file", () => {
    expect(sandboxClockFromSearch("?mode=unlocked&clock=1")).toBe(1);
    expect(sandboxClockFromSearch("?clock=3")).toBe(3);
    expect(sandboxClockFromSearch("?mode=unlocked")).toBeUndefined();
    expect(sandboxTownSetFile(2)).toBe("town.set");
    expect(sandboxTownSetFile(3)).toBe("nite.set");
    expect(sandboxGraphFolder(2)).toBe("_TOWN");
    expect(sandboxGraphFolder(3)).toBe("_NITE");
  });
});

describe("sandbox advanceday", () => {
  it("suppresses the extracted story proc and unlocks doors via debugging", async () => {
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    host.sandboxClock = 2;
    host.index.add(
      "stage",
      {
        name: "advanceday",
        params: [],
        body: [
          {
            type: "assign",
            target: { type: "var", name: "story" },
            value: { type: "num", value: 1 },
          },
        ],
      },
      "story",
    );
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.object = "stage";
    vm.globals.set("clock", 2);
    vm.globalNames.add("clock");
    expect(host.lookup("advanceday", vm)).toBeUndefined();
    expect(host.lookupChain("advanceday", vm)).toEqual([]);
    await vm.evalCall("advanceday", []);
    expect(vm.globals.get("story")).toBeUndefined();
    expect(vm.globals.get("debugging")).toBe(true);
    expect(vm.globals.get("playercash")).toBe(999);
    expect(vm.globals.get("clock")).toBe(2);
    expect(vm.globals.get("dayrobber")).toBe(1);
    expect(vm.globals.get("oonaphase")).toBe(3);
    expect(vm.globals.get("mwifephase")).toBe(1);
  });

  it("marks saloon and mansion stair talks as already done", () => {
    const globals = new Map<string, number>();
    const names = new Set<string>();
    applySandboxStoryFlags(globals, names);
    expect(SANDBOX_STORY_FLAGS.oonaphase).toBe(3);
    expect(SANDBOX_STORY_FLAGS.mwifephase).toBe(1);
    expect(globals.get("oonaphase")).toBe(3);
    expect(globals.get("mwifephase")).toBe(1);
  });

  it("leaves extracted advanceday in place for Resurrected", () => {
    const host = new DustHost({} as PuppetUi);
    host.index.add(
      "stage",
      { name: "advanceday", params: [], body: [] },
      "story",
    );
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.object = "stage";
    expect(host.lookup("advanceday", vm)?.name).toBe("advanceday");
  });

  it("hides story extras and keeps Leroy / Bolivar / livestock", () => {
    const dog = {
      name: "dog",
      cast: "extra",
      visible: true,
      walking: false,
      turning: false,
      route: [],
    };
    const pig = {
      name: "pig",
      cast: "extra",
      visible: true,
      walking: true,
      turning: false,
      route: [{ x: 1 }],
    };
    const gus = {
      name: "gus",
      cast: "gang",
      visible: true,
      walking: true,
      turning: false,
      route: [{ x: 1 }],
    };
    const leroy = {
      name: "leroy",
      cast: "gang",
      visible: true,
      walking: false,
      turning: false,
      route: [],
    };
    const bolivar = {
      name: "bolivar",
      cast: "gang",
      visible: true,
      walking: false,
      turning: false,
      route: [],
    };
    expect(hideSandboxStoryActors([dog, pig, gus, leroy, bolivar])).toEqual(["dog", "gus"]);
    expect(dog.visible).toBe(false);
    expect(gus.visible).toBe(false);
    expect(gus.walking).toBe(false);
    expect(gus.route).toEqual([]);
    expect(pig.visible).toBe(true);
    expect(pig.walking).toBe(true);
    expect(leroy.visible).toBe(true);
    expect(bolivar.visible).toBe(true);
  });

  it("hides range bottles and plates once the SET is no longer TARGET", () => {
    const bottle = {
      name: "bottle1targ",
      cast: "target",
      visible: true,
      walking: false,
      turning: false,
      route: [],
    };
    const vane = {
      name: "vanetarg",
      cast: "target",
      visible: true,
      walking: false,
      turning: false,
      route: [],
    };
    const pig = {
      name: "pig",
      cast: "extra",
      visible: true,
      walking: true,
      turning: false,
      route: [{ x: 1 }],
    };
    expect(hideRangeCastOffSet("target", [bottle, vane, pig])).toEqual([]);
    expect(bottle.visible).toBe(true);
    expect(hideRangeCastOffSet("town", [bottle, vane, pig])).toEqual(["bottle1targ", "vanetarg"]);
    expect(bottle.visible).toBe(false);
    expect(vane.visible).toBe(false);
    expect(pig.visible).toBe(true);
    expect(pig.walking).toBe(true);
  });

  it("hides INVEN ground pickups and keeps doors, tables, and the held gun", () => {
    const jug = { name: "jug", shop: "inven", view: "small", visible: true };
    const bone = { name: "bone", shop: "inven", view: "small", visible: true };
    const door = { name: "door", shop: "house", view: "salout", visible: true };
    const cards = { name: "blackjack", shop: "house", view: "bar", visible: true };
    const weed = { name: "tumbleweed", shop: "house", view: "town", visible: true };
    const gun = { name: "gun", shop: "inven", view: "large", visible: true };
    expect(sandboxKeepWorldProp(jug, "")).toBe(false);
    expect(hideSandboxGroundPickups([jug, bone, door, cards, weed, gun], "gun")).toEqual([
      "jug",
      "bone",
    ]);
    expect(jug.visible).toBe(false);
    expect(door.visible).toBe(true);
    expect(cards.visible).toBe(true);
    expect(weed.visible).toBe(true);
    expect(gun.visible).toBe(true);
  });
});

describe("sandbox Leroy range talk", () => {
  it("only rewrites Leroy's day1 runyoself", () => {
    expect(sandboxLeroyRangeTalk("leroy.pup", "puppet", "day1")).toBe(true);
    expect(sandboxLeroyRangeTalk("LEROY.PUP", "puppet", "day1")).toBe(true);
    expect(sandboxLeroyRangeTalk("leroy.pup", "puppet", "boot script")).toBe(false);
    expect(sandboxLeroyRangeTalk("bolivar.pup", "puppet", "day1")).toBe(false);
  });

  it("uses beforetarget, then aftertarget when leroyphase is 3", async () => {
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    host.currentPuppet = "leroy.pup";
    const ran: string[] = [];
    host.index.add(
      "puppet:day1",
      {
        name: "beforetarget",
        params: [],
        body: [{ type: "call", call: { type: "call", name: "markbefore", args: [] } }],
      },
      "day1",
    );
    host.index.add(
      "puppet:day1",
      {
        name: "aftertarget",
        params: [],
        body: [{ type: "call", call: { type: "call", name: "markafter", args: [] } }],
      },
      "day1",
    );
    const vm = new VM({
      async call(name) {
        ran.push(name);
        return 0;
      },
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("leroyphase", 0);
    vm.globalNames.add("leroyphase");
    expect(sandboxLeroyRangeRunyoself().body.length).toBeGreaterThanOrEqual(2);
    await vm.inObject("puppet", "day1", () => vm.evalCall("runyoself", []));
    expect(ran).toContain("markbefore");
    expect(ran).not.toContain("markafter");
    ran.length = 0;
    vm.globals.set("leroyphase", 3);
    await vm.inObject("puppet", "day1", () => vm.evalCall("runyoself", []));
    expect(ran).toContain("markafter");
    expect(ran).not.toContain("markbefore");
    expect(vm.globals.get("leroyphase")).toBe(0);
  });

  it("does not put a gun in the sandbox seed flags", () => {
    expect("gun" in SANDBOX_STORY_FLAGS).toBe(false);
  });

  it("does not wait on Leroy's return walk after he loans the gun", () => {
    expect(sandboxSkipRangeWalkWait(true, "town", "leroy", 2)).toBe(true);
    expect(sandboxSkipRangeWalkWait(true, "town", "Leroy", 2)).toBe(true);
    expect(sandboxSkipRangeWalkWait(false, "town", "leroy", 2)).toBe(false);
    expect(sandboxSkipRangeWalkWait(true, "target", "leroy", 2)).toBe(false);
    expect(sandboxSkipRangeWalkWait(true, "town", "leroy", 0)).toBe(false);
    expect(sandboxSkipRangeWalkWait(true, "town", "pig", 2)).toBe(false);
  });

  it("clears Leroy's walk so gotointerior is not stuck on watch", async () => {
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    host.currentSet = "town";
    const leroy = host.namedActor("leroy");
    leroy.walking = true;
    leroy.turning = true;
    leroy.route = [{ x: 1, y: 2, z: 0 }];
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("leroyphase", 2);
    vm.globalNames.add("leroyphase");
    expect(await host.call("iswalk", ["leroy"], vm)).toBe(false);
    expect(leroy.walking).toBe(false);
    expect(leroy.turning).toBe(false);
    expect(leroy.route).toEqual([]);
  });
});

describe("sandbox animal placement", () => {
  it("setupactor(town) puts the pig on the street", async () => {
    const extra = resolve("dfextract/out/CST/_EXTRA/Cast.json");
    const gang = resolve("dfextract/out/CST/_GANG/Cast.json");
    const pig = resolve("dfextract/out/CST/_EXTRA/pig/Script.json");
    if (![extra, gang, pig].every((p) => existsSync(p))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    host.rng = () => 0;
    host.currentSet = "town";
    host.view = dummyView();
    for (const proc of loadProcs("CST/_GANG/Cast.json")) {
      host.index.add("cast:gang", proc, "cast");
    }
    for (const proc of loadProcs("CST/_EXTRA/Cast.json")) {
      host.index.add("cast:extra", proc, "extra");
    }
    for (const proc of loadProcs("CST/_EXTRA/pig/Script.json")) {
      host.index.add("actor:pig", proc, "pig");
    }
    host.namedActor("pig").cast = "extra";
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("day", 1);
    vm.globalNames.add("day");
    await (host as DustHost & { seedSandboxAnimals(ctx: VM): Promise<void> }).seedSandboxAnimals(vm);
    const actor = host.namedActor("pig");
    expect(actor.visible).toBe(true);
    expect(actor.set).toBe("town");
  });

  it("places the range chicken and pig the way TARGET day 2 does", async () => {
    const chicken = resolve("dfextract/out/CST/_TARGET/chicken1targ/Script.json");
    const pig = resolve("dfextract/out/CST/_TARGET/pigtarg/Script.json");
    if (![chicken, pig].every((p) => existsSync(p))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    host.currentSet = "target";
    host.view = dummyView();
    host.waypoints.set("chickenstar1", { x: 2520, y: 3152, name: "chickenstar1" });
    host.waypoints.set("pigstar1", { x: 2224, y: 3104, name: "pigstar1" });
    host.waypoints.set("pigstar2", { x: 3224, y: 3120, name: "pigstar2" });
    for (const proc of loadProcs("CST/_TARGET/chicken1targ/Script.json")) {
      host.index.add("actor:chicken1targ", proc, "chicken");
    }
    for (const proc of loadProcs("CST/_TARGET/pigtarg/Script.json")) {
      host.index.add("actor:pigtarg", proc, "pig");
    }
    host.namedActor("chicken1targ").cast = "target";
    host.namedActor("pigtarg").cast = "target";
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await (host as DustHost & { seedSandboxAnimals(ctx: VM): Promise<void> }).seedSandboxAnimals(vm);
    const hen = host.namedActor("chicken1targ");
    expect(hen.visible).toBe(true);
    expect(hen.is3d).toBe(true);
    expect(hen.star).toBe("chickenstar1");
    expect(hen.x).toBe(2520);
    expect(hen.y).toBe(3152);
    const hog = host.namedActor("pigtarg");
    expect(hog.visible).toBe(true);
    expect(hog.is3d).toBe(true);
    expect(hog.walking).toBe(true);
  });
});
