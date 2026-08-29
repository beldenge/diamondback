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
  sandboxEquipMineMask,
  sandboxFountainOpensHub,
  sandboxFountainProc,
  sandboxHubSundialScene,
  sandboxApothBottlesClick,
  sandboxBankCrackClick,
  sandboxBankSignMousedown,
  sandboxBindApothBottles,
  sandboxBottlesMousedown,
  sandboxDellTownClick,
  sandboxDellMousedown,
  sandboxFightActor,
  sandboxFightFromSearch,
  sandboxFightKind,
  sandboxFightOn,
  sandboxFightScout,
  sandboxFightPutdown,
  sandboxFightScoutClick,
  sandboxFightScoutHit,
  sandboxFightHotdist,
  sandboxFightScoutMousedown,
  hideSandboxIdleFighters,
  SANDBOX_FIGHT_SCOUTS,
  SANDBOX_TOYS,
  sandboxStreetToy,
  sandboxToyKind,
  sandboxToyLookPose,
  sandboxTownFightHitProc,
  sandboxIsApoth,
  sandboxKidTownClick,
  sandboxKidMousedown,
  sandboxOpenKidProc,
  sandboxPuzzletime,
  sandboxIsMineSet,
  sandboxShowMineMask,
  SANDBOX_INVEN_LAYOUT_DAY,
  SANDBOX_INVEN_SEEDS,
  SANDBOX_STORY_FLAGS,
  sandboxInventoryToSeed,
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
    expect(sandboxKeepActor({ name: "horse1", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "horse2", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "dell", cast: "gang" })).toBe(true);
    expect(sandboxKeepActor({ name: "kid", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "birdcage", cast: "extra" })).toBe(false);
    expect(sandboxKeepActor({ name: "skeleton", cast: "mine" })).toBe(true);
    expect(sandboxKeepActor({ name: "shaman", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "gus", cast: "gang" })).toBe(false);
    expect(sandboxKeepActor({ name: "help", cast: "gang" })).toBe(false);
    expect(sandboxKeepActor({ name: "oona", cast: "gang" })).toBe(false);
    expect(sandboxKeepActor({ name: "bounty1", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "bounty5", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "kidgang1", cast: "extra" })).toBe(true);
    expect(sandboxKeepActor({ name: "kidgang3", cast: "extra" })).toBe(true);
  });
});

describe("sandbox street fights", () => {
  it("names the bounty and kid-gang click-to-start extras", () => {
    expect(SANDBOX_FIGHT_SCOUTS.map((row) => `${row.name}:${row.fight}`)).toEqual([
      "bounty1:bounty",
      "kidgang1:gang",
    ]);
    expect(sandboxFightScout("bounty1")).toBe(true);
    expect(sandboxFightScout("bounty2")).toBe(false);
    expect(sandboxFightActor("kidgang4")).toBe(true);
    expect(sandboxFightActor("kid")).toBe(false);
  });

  it("hides Dell, Kid, and fight extras until a top-bar spawn", () => {
    const bounty1 = {
      name: "bounty1",
      visible: true,
      walking: false,
      turning: false,
      route: [],
    };
    const bounty2 = {
      name: "bounty2",
      visible: true,
      walking: true,
      turning: false,
      route: [{ x: 1 }],
    };
    const dell = {
      name: "dell",
      visible: true,
      walking: false,
      turning: false,
      route: [],
    };
    const kid = {
      name: "kid",
      visible: true,
      walking: false,
      turning: false,
      route: [],
    };
    const leroy = {
      name: "leroy",
      visible: true,
      walking: false,
      turning: false,
      route: [],
    };
    expect(hideSandboxIdleFighters([bounty1, bounty2, dell, kid, leroy], false)).toEqual([
      "bounty1",
      "bounty2",
      "dell",
      "kid",
    ]);
    expect(bounty1.visible).toBe(false);
    expect(bounty2.visible).toBe(false);
    expect(dell.visible).toBe(false);
    expect(kid.visible).toBe(false);
    expect(leroy.visible).toBe(true);
    bounty1.visible = true;
    dell.visible = true;
    kid.visible = true;
    expect(hideSandboxIdleFighters([bounty1, bounty2, dell, kid], false, new Set(["bounty1", "dell"]))).toEqual(
      ["kid"],
    );
    expect(bounty1.visible).toBe(true);
    expect(dell.visible).toBe(true);
    bounty2.visible = true;
    expect(hideSandboxIdleFighters([bounty1, bounty2], true, new Set())).toEqual([]);
    expect(bounty2.visible).toBe(true);
  });

  it("starts each fight from a scout click without advancing day or walking G8", () => {
    expect(sandboxFightScoutClick("town", "actor", "bounty1", 0)).toBe(true);
    expect(sandboxFightScoutClick("town", "actor", "kidgang1", 0)).toBe(true);
    expect(sandboxFightScoutClick("town", "actor", "kid", 0)).toBe(false);
    expect(sandboxFightScoutClick("town", "actor", "bounty1", 1)).toBe(false);
    const bounty = JSON.stringify(sandboxFightScoutMousedown("bounty"));
    expect(bounty).toContain("openfight");
    expect(bounty).toContain('"value":"bounty"');
    expect(bounty).not.toContain("advanceday");
    expect(bounty).not.toContain("scene g8");
    const gang = JSON.stringify(sandboxFightScoutMousedown("gang"));
    expect(gang).toContain('"value":"gang"');
    const hit = JSON.stringify(sandboxTownFightHitProc());
    expect(hit).toContain("by bounty");
    expect(hit).toContain("by gang");
    expect(hit).toContain("sandboxfight");
    expect(hit).not.toContain('"name":"day"');
  });

  it("reads ?fight= and ignores unknown values", () => {
    expect(sandboxFightFromSearch("?mode=unlocked&fight=bounty")).toBe("bounty");
    expect(sandboxFightFromSearch("fight=GANG")).toBe("gang");
    expect(sandboxFightFromSearch("?fight=kid")).toBeUndefined();
    expect(sandboxFightKind("bounty")).toBe("bounty");
    expect(sandboxFightOn(0)).toBe(false);
    expect(sandboxFightOn(undefined)).toBe(false);
    expect(sandboxFightOn(1)).toBe(true);
  });

  it("does not putdown Bolivar when a street fight starts", () => {
    expect(sandboxFightPutdown("leroy")).toBe(true);
    expect(sandboxFightPutdown("dell")).toBe(true);
    expect(sandboxFightPutdown("kid")).toBe(true);
    expect(sandboxFightPutdown("bounty2")).toBe(true);
    expect(sandboxFightPutdown("pig")).toBe(true);
    expect(sandboxFightPutdown("bolivar")).toBe(false);
    expect(sandboxFightPutdown("help")).toBe(false);
    expect(sandboxFightPutdown("jones")).toBe(false);
  });

  it("starts the fight if you shoot a standing scout", () => {
    const json = JSON.stringify(sandboxFightScoutHit("bounty"));
    expect(json).toContain("openfight");
    expect(json).toContain('"value":"bounty"');
  });

  it("uses extracted fight hotdist so 3 hits kill, not town talk 384", () => {
    const json = JSON.stringify(sandboxFightHotdist());
    expect(json).toContain('"value":2');
    expect(json).not.toContain("384");
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
      "horse1",
      "horse2",
      "horse3",
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

  it("clears the fade plate the way extracted postmovie does", async () => {
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    host.sandboxClock = 2;
    let fade: number | undefined;
    host.view = {
      pose: { x: 6, y: 14, facing: "N" },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
      setFadeOpacity(opacity: number) {
        fade = opacity;
      },
    };
    const vm = new VM({
      async call(name) {
        if (name === "initall" || name === "currentscene" || name === "currentview") {
          return 0;
        }
        return 0;
      },
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await host.sandboxAdvanceDay(vm);
    expect(fade).toBe(0);
  });

  it("swaps court/school stills on Unlocked N, not only town", async () => {
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    let lighting = 0;
    host.currentSet = "_SCHOOL";
    host.view = {
      pose: { x: 0, y: 1, facing: "W" },
      world: "_SCHOOL",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      async swapLighting() {
        lighting += 1;
      },
      log() {},
      refreshActors() {},
    };
    const vm = new VM({
      async call() {
        return 0;
      },
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await host.applySandboxClock(vm, 3);
    expect(vm.globals.get("clock")).toBe(3);
    expect(lighting).toBe(1);
    host.currentSet = "town";
    lighting = 0;
    await host.applySandboxClock(vm, 2);
    expect(lighting).toBe(0);
  });

  it("does not swap stills with N during a street fight", async () => {
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    host.currentSet = "_SCHOOL";
    let lighting = 0;
    host.view = {
      pose: { x: 0, y: 1, facing: "W" },
      world: "_SCHOOL",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      async swapLighting() {
        lighting += 1;
      },
      log() {},
      refreshActors() {},
    };
    const vm = new VM({
      async call() {
        return 0;
      },
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("fighton", 1);
    await host.applySandboxClock(vm, 3);
    expect(lighting).toBe(0);
    expect(vm.globals.get("clock")).not.toBe(3);
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
    const horse = {
      name: "horse1",
      cast: "extra",
      visible: true,
      walking: false,
      turning: false,
      route: [],
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
    expect(hideSandboxStoryActors([dog, pig, horse, gus, leroy, bolivar])).toEqual(["dog", "gus"]);
    expect(dog.visible).toBe(false);
    expect(gus.visible).toBe(false);
    expect(gus.walking).toBe(false);
    expect(gus.route).toEqual([]);
    expect(pig.visible).toBe(true);
    expect(pig.walking).toBe(true);
    expect(horse.visible).toBe(true);
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
    expect(SANDBOX_INVEN_SEEDS).not.toContain("gun");
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

describe("sandbox inventory seeds", () => {
  it("grants cave tools and every satchel reader, book last", () => {
    expect(SANDBOX_INVEN_SEEDS).toEqual([
      "mask",
      "flute",
      "blade",
      "tbird",
      "history",
      "pages",
      "yunnibook",
    ]);
    expect(SANDBOX_INVEN_LAYOUT_DAY).toBe(4);
    expect(SANDBOX_INVEN_SEEDS).not.toContain("postcards");
  });

  it("skips items the player already holds", () => {
    expect(
      sandboxInventoryToSeed([
        { name: "mask", owner: "stranger" },
        { name: "flute", owner: "none" },
        { name: "yunnibook", owner: "OONA" },
      ]),
    ).toEqual(["flute", "blade", "tbird", "history", "pages", "yunnibook"]);
  });

  it("addinven seeds yunnibook last so it is the held item", async () => {
    const inven = resolve("dfextract/out/PRP/_INVEN/setcursor _arg__1.json");
    if (!existsSync(inven)) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    for (const proc of loadProcs("PRP/_INVEN/setcursor _arg__1.json")) {
      host.index.add("shop:inven", proc, "inven");
    }
    for (const name of SANDBOX_INVEN_SEEDS) {
      host.namedProp(name).shop = "inven";
    }
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("handitem", "helpbut");
    vm.globalNames.add("handitem");
    await host.seedSandboxInventory(vm);
    expect(host.namedProp("yunnibook").owner).toBe("stranger");
    expect(host.namedProp("history").owner).toBe("stranger");
    expect(host.namedProp("pages").owner).toBe("stranger");
    expect(host.namedProp("postcards").owner).toBe("none");
    expect(host.namedProp("flute").owner).toBe("stranger");
    expect(host.namedProp("blade").owner).toBe("stranger");
    expect(host.namedProp("mask").owner).toBe("stranger");
    expect(host.namedProp("tbird").owner).toBe("stranger");
    expect(vm.globals.get("handitem")).toBe("yunnibook");
    await host.seedSandboxInventory(vm);
    expect(vm.globals.get("handitem")).toBe("yunnibook");
  });

  it("mayroom armchair opens diary.flt without a day gate", () => {
    const rel = "SET/_MAYROOM/Scene B2.txt";
    if (!existsSync(resolve("dfextract/out", rel))) {
      return;
    }
    const txt = readFileSync(resolve("dfextract/out", rel), "utf8");
    expect(txt).toMatch(/currentview \(\) = "south" & pointinarm/);
    expect(txt).toMatch(/openstagefile \("diary\.flt"\)/);
    expect(txt).not.toMatch(/if day = .+pointinarm/);
  });

  it("does not seed inventory in Resurrected", async () => {
    const host = new DustHost({} as PuppetUi);
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await host.seedSandboxInventory(vm);
    expect(host.namedProp("yunnibook").owner).toBe("none");
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

describe("Unlocked fountain → hub", () => {
  it("opens the hub from court or nitecour, not town", () => {
    expect(sandboxFountainOpensHub("court")).toBe(true);
    expect(sandboxFountainOpensHub("nitecour.set")).toBe(true);
    expect(sandboxFountainOpensHub("town")).toBe(false);
    expect(sandboxFountainOpensHub("hub")).toBe(false);
  });

  it("plays openfoun.mov then gotospecial hub D5 west", () => {
    const json = JSON.stringify(sandboxFountainProc());
    expect(json).toContain("openfoun.mov");
    expect(json).toContain("gotospecial");
    expect(json).toContain("hub.set");
    expect(json).toContain("scene d5");
    expect(json).toContain("west");
    expect(json).not.toContain("north");
    expect(json).toContain("mine.snd");
    expect(json).toContain("\"mine\"");
    expect(json).toContain("haltsound");
    expect(json).toContain("halttheme");
    expect(json).not.toContain("tstone");
  });

  it("treats the four hub table tiles as sundial scenes", () => {
    expect(sandboxHubSundialScene("scene d5")).toBe(true);
    expect(sandboxHubSundialScene("Scene C4")).toBe(true);
    expect(sandboxHubSundialScene("scene d7")).toBe(false);
  });

  it("shows the mine mask compass without stealing handitem", () => {
    const mask = { view: "small", visible: false, screen: false, x: 0, y: 0, owner: "none" };
    expect(sandboxShowMineMask("town", mask)).toBe(false);
    expect(mask.visible).toBe(false);
    expect(sandboxShowMineMask("mine.set", mask)).toBe(true);
    expect(mask.view).toBe("eyes");
    expect(mask.visible).toBe(true);
    expect(mask.screen).toBe(true);
    expect(mask.owner).toBe("stranger");
    expect(mask.x).toBe(256);
    expect(mask.y).toBe(132);
  });

  it("keeps INVEN mask eyes as a HUD overlay, not a ground pickup", () => {
    expect(
      sandboxKeepWorldProp({ name: "mask", shop: "inven", view: "eyes" }, ""),
    ).toBe(true);
    expect(
      sandboxKeepWorldProp({ name: "mask", shop: "inven", view: "small" }, ""),
    ).toBe(false);
    expect(
      sandboxKeepWorldProp({ name: "chest", shop: "inven", view: "small", set: "hub" }, ""),
    ).toBe(true);
    expect(
      sandboxKeepWorldProp({ name: "jug", shop: "inven", view: "small", set: "town" }, ""),
    ).toBe(false);
  });

  it("equips the mask as handitem before mine openset", () => {
    const globals = new Map<string, string>();
    expect(sandboxIsMineSet("mine.set")).toBe(true);
    expect(sandboxEquipMineMask("hub", { set: (name, value) => globals.set(name, value) })).toBe(
      false,
    );
    expect(sandboxEquipMineMask("mine", { set: (name, value) => globals.set(name, value) })).toBe(
      true,
    );
    expect(globals.get("handitem")).toBe("mask");
  });

  it("replaces court fountain() with openfoun.mov → hub D5 N", () => {
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    host.currentSet = "court";
    host.index.add(
      "set",
      {
        name: "fountain",
        params: [],
        body: [{ type: "call", call: { type: "call", name: "spotmovie", args: [] } }],
      },
      "court",
    );
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.object = "set";
    const json = JSON.stringify(host.lookup("fountain", vm));
    expect(json).toContain("openfoun.mov");
    expect(json).toContain("hub.set");
    expect(json).not.toContain("spotmovie");
    host.currentSet = "town";
    expect(host.lookup("fountain", vm)?.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "call",
          call: expect.objectContaining({ name: "spotmovie" }),
        }),
      ]),
    );
  });

  it("sundial dump names the four rooms and the chest combo", () => {
    const rel = resolve("dfextract/out/FLT/_SUNDIAL/offerobject _what_.txt");
    if (!existsSync(rel)) {
      return;
    }
    const txt = readFileSync(rel, "utf8");
    expect(txt).toMatch(/nextroom = "mine"/);
    expect(txt).toMatch(/nextroom = "snake"/);
    expect(txt).toMatch(/nextroom = "tbird"/);
    expect(txt).toMatch(/nextroom = "flute"/);
    expect(txt).toMatch(/largedial = 12 & meddial = 4 & smalldial = 12/);
    expect(txt).toMatch(/setupprop \("hub"\)/);
  });
});

describe("Unlocked place toys", () => {
  it("cracks the bank from scene d1, not other bank rooms", () => {
    expect(sandboxBankCrackClick("bank", "scene", "scene d1")).toBe(true);
    expect(sandboxBankCrackClick("bank.set", "scene", "scene d1")).toBe(true);
    expect(sandboxBankCrackClick("bank", "scene", "scene d3")).toBe(false);
    expect(sandboxBankCrackClick("town", "scene", "scene d1")).toBe(false);
    const json = JSON.stringify(sandboxBankSignMousedown());
    expect(json).toContain("docrack");
    expect(json).toContain("pointinsign");
    expect(json).not.toContain("teller.pup");
  });

  it("treats apoth compounding as always in season", () => {
    expect(sandboxIsApoth("apoth")).toBe(true);
    expect(sandboxIsApoth("apoth.set")).toBe(true);
    expect(sandboxIsApoth("doctor1")).toBe(false);
    expect(sandboxPuzzletime().body).toEqual([
      { type: "return", value: { type: "bool", value: true } },
    ]);
  });

  it("retags apoth bottles off drugs so they blit on the shop SET", () => {
    const bottles = { set: "drugs" };
    expect(sandboxBindApothBottles("town", bottles)).toBe(false);
    expect(bottles.set).toBe("drugs");
    expect(sandboxBindApothBottles("apoth.set", bottles)).toBe(true);
    expect(bottles.set).toBe("apoth");
    expect(sandboxApothBottlesClick("apoth", "prop", "bottles")).toBe(true);
    expect(sandboxApothBottlesClick("apoth", "prop", "door")).toBe(false);
    expect(JSON.stringify(sandboxBottlesMousedown())).toContain("dodrugs");
  });

  it("lists four top-bar portraits and parks a spawn on the looked-at tile", () => {
    expect(SANDBOX_TOYS.map((row) => `${row.kind}:${row.actor}`)).toEqual([
      "kid:kid",
      "dell:dell",
      "bounty:bounty1",
      "gang:kidgang1",
    ]);
    expect(sandboxToyKind("Dell")).toBe("dell");
    expect(sandboxStreetToy("bounty3")).toBe(true);
    expect(sandboxStreetToy("leroy")).toBe(false);
    expect(sandboxToyLookPose({ x: 6, y: 14, facing: "N" })).toEqual({
      scene: "scene g14",
      deg: 64,
    });
    expect(sandboxToyLookPose({ x: 6, y: 14, facing: "S" })).toEqual({
      scene: "scene g15",
      deg: 192,
    });
    expect(sandboxToyLookPose({ x: 6, y: 8, facing: "E" })).toEqual({
      scene: "scene h9",
      deg: 128,
    });
    expect(sandboxToyLookPose({ x: 0, y: 5, facing: "W" })).toEqual({
      scene: "scene a6",
      deg: 0,
    });
  });

  it("spawns a toy in the current view without starting the fight", async () => {
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    host.currentSet = "town";
    const view = dummyView();
    for (let i = 0; i < 225; i++) {
      view.graph.scenes.set(`cell${i}`, {
        name: `cell${i}`,
        x: i % 15,
        y: Math.trunc(i / 15),
        interact: 0,
        unknown_c: 0,
        blocked: 0,
        unknown_e: 0,
        script_container: 0,
      });
    }
    host.view = view;
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await host.spawnSandboxToy(vm, "kid");
    const kid = host.namedActor("kid");
    expect(kid.visible).toBe(true);
    expect(kid.set).toBe("town");
    expect(kid.pose).toBe("stand");
    expect(kid.deg).toBe(64);
    expect(kid.is3d).toBe(true);
    expect(kid.x).toBe(6 * 256 + 128);
    expect(kid.y).toBe(13 * 256 + 128);
    expect(vm.globals.get("fighton")).toBeUndefined();
    await host.spawnSandboxToy(vm, "bounty");
    const scout = host.namedActor("bounty1");
    expect(scout.visible).toBe(true);
    expect(scout.scale).toBe(1500);
    vm.object = "actor";
    vm.me = "bounty1";
    vm.globals.set("fighton", 0);
    expect(JSON.stringify(host.lookup("mousedown", vm))).toContain("openfight");
  });

  it("starts Dell's fight from a town click, not Jones phase 8", () => {
    expect(sandboxDellTownClick("town", "actor", "dell")).toBe(true);
    expect(sandboxDellTownClick("town", "actor", "Dell")).toBe(true);
    expect(sandboxDellTownClick("jail", "actor", "dell")).toBe(false);
    expect(sandboxDellTownClick("town", "prop", "dell")).toBe(false);
    const json = JSON.stringify(sandboxDellMousedown());
    expect(json).toContain("scene d7");
    expect(json).toContain("fight");
    expect(json).not.toContain("dell1.pup");
    expect(json).not.toContain("jones");
  });

  it("starts the Kid duel from a G6 click without walking him in or advancing day", () => {
    expect(sandboxKidTownClick("town", "actor", "kid")).toBe(true);
    expect(sandboxKidTownClick("town", "actor", "dell")).toBe(false);
    const click = JSON.stringify(sandboxKidMousedown());
    expect(click).toContain("openkid");
    expect(click).toContain("scene g5");
    const json = JSON.stringify(sandboxOpenKidProc());
    expect(json).toContain("kid.pup");
    expect(json).toContain("kiddie.mov");
    expect(json).toContain("kidinv.mov");
    expect(json).toContain("by kid");
    expect(json).not.toContain("walkin");
    expect(json).not.toContain("advanceday");
  });

  it("replaces those procs on the Unlocked host", () => {
    const host = new DustHost({} as PuppetUi);
    host.sandbox = true;
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    host.currentSet = "bank";
    vm.object = "scene";
    vm.me = "scene d1";
    expect(JSON.stringify(host.lookup("mousedown", vm))).toContain("docrack");
    host.currentSet = "apoth";
    vm.object = "prop";
    vm.me = "bottles";
    expect(host.lookup("puzzletime", vm)?.name).toBe("puzzletime");
    expect(JSON.stringify(host.lookup("mousedown", vm))).toContain("dodrugs");
    expect(JSON.stringify(host.lookup("setcursor", vm))).toContain("touch");
    host.currentSet = "town";
    vm.object = "actor";
    vm.me = "dell";
    expect(JSON.stringify(host.lookup("mousedown", vm))).toContain("scene d7");
    vm.me = "kid";
    expect(JSON.stringify(host.lookup("mousedown", vm))).toContain("openkid");
    expect(JSON.stringify(host.lookup("openkid", vm))).toContain("kid.pup");
    vm.me = "bounty1";
    vm.globals.set("fighton", 0);
    expect(JSON.stringify(host.lookup("mousedown", vm))).toContain("openfight");
    expect(JSON.stringify(host.lookup("mousedown", vm))).toContain("bounty");
    vm.me = "kidgang1";
    expect(JSON.stringify(host.lookup("mousedown", vm))).toContain("gang");
    vm.object = "actor";
    vm.me = "bounty1";
    vm.globals.set("fighton", 0);
    expect(JSON.stringify(host.lookup("hit", vm))).toContain("openfight");
    vm.globals.set("fighton", 1);
    expect(JSON.stringify(host.lookup("mousedown", vm) ?? {})).not.toContain("openfight");
    expect(JSON.stringify(host.lookup("hotdist", vm))).toContain('"value":2');
    vm.object = "set";
    expect(JSON.stringify(host.lookup("hit", vm))).toContain("sandboxfight");
    expect(host.lookup("openfight", vm)).toBeUndefined();
    host.sandbox = false;
    expect(host.lookup("openkid", vm)).toBeUndefined();
  });

  it("leaves Resurrected bank / Dell / Kid scripts in place", () => {
    const host = new DustHost({} as PuppetUi);
    host.index.add(
      "scene:scene d1",
      {
        name: "mousedown",
        params: ["arg"],
        body: [{ type: "call", call: { type: "call", name: "teller", args: [] } }],
      },
      "bank",
    );
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    host.currentSet = "bank";
    vm.object = "scene";
    vm.me = "scene d1";
    expect(JSON.stringify(host.lookup("mousedown", vm))).toContain("teller");
    expect(JSON.stringify(host.lookup("mousedown", vm))).not.toContain("docrack");
  });
});

