import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { buildSetGraph, SET_SPAWN } from "../world/set/graph";
import type { SceneRecord, TransitionRecord } from "../world/set/types";
import { cameraFromPose, worldToStill } from "./facing";
import {
  dirWord,
  DustHost,
  puppetClipKey,
  puppetFolder,
  resolveFlatLoopWho,
  soundFileUrl,
} from "./host";
import type { PuppetUi, VisemeLine } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

function visemePath(folder: string, ident = "idle 1"): string {
  return resolve("dfextract/out", folder, "AUDIO/visemes", `${ident}.json`);
}

function makePuppetHost(): {
  host: DustHost;
  intern: {
    currentPuppetFolder: string;
    puppetLines: Map<string, { text: string; wav: string }>;
    loadVisemeLine(ident: string): Promise<VisemeLine | undefined>;
    fidgetSilent(ident: string): void;
    speak(ident: string): Promise<void>;
  };
  spoken: VisemeLine[];
  fidgeted: VisemeLine[];
  late: VisemeLine[];
} {
  const spoken: VisemeLine[] = [];
  const fidgeted: VisemeLine[] = [];
  const late: VisemeLine[] = [];
  const host = new DustHost({
    skipLine() {},
    clear() {},
    addBevel() {},
    async speak(_text: string, _wav: string | undefined, viseme: unknown) {
      if (viseme) {
        spoken.push(viseme as VisemeLine);
      }
    },
    async fidget(_wav, viseme) {
      if (viseme) {
        fidgeted.push(viseme);
      }
    },
    async preloadVoices() {},
    open() {},
    close() {},
    setViseme(viseme: VisemeLine) {
      late.push(viseme);
    },
  } as unknown as PuppetUi);
  const intern = host as unknown as {
    currentPuppetFolder: string;
    puppetLines: Map<string, { text: string; wav: string }>;
    loadVisemeLine(ident: string): Promise<VisemeLine | undefined>;
    fidgetSilent(ident: string): void;
    speak(ident: string): Promise<void>;
  };
  return { host, intern, spoken, fidgeted, late };
}

function mockExtractDisk(): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const decoded = decodeURIComponent(String(input));
    const marker = "/extract/";
    const at = decoded.indexOf(marker);
    if (at < 0) {
      return orig(input);
    }
    const rel = decoded.slice(at + marker.length).split("?")[0];
    if (rel.toLowerCase().endsWith(".wav")) {
      return { ok: false, status: 404 } as Response;
    }
    const disk = resolve("dfextract/out", rel);
    if (!existsSync(disk)) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" } as Response;
    }
    const text = readFileSync(disk, "utf8");
    return {
      ok: true,
      json: async () => JSON.parse(text),
      text: async () => text,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    } as Response;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

describe("SET script reload", () => {
  it("reinstalls nite SET scripts after removePrefix from an interior hop", async () => {
    const rel = "SET/_NITE/Boot Script.json";
    const disk = resolve("dfextract/out", rel);
    if (!existsSync(disk)) {
      return;
    }
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!decodeURIComponent(url).includes("Boot Script.json")) {
        return orig(input);
      }
      return {
        ok: true,
        json: async () => JSON.parse(readFileSync(disk, "utf8")),
      } as Response;
    }) as typeof fetch;
    try {
      const host = new DustHost({} as PuppetUi);
      const intern = host as unknown as {
        addScriptFile(key: string, rel: string): Promise<void>;
      };
      await intern.addScriptFile("set", rel);
      expect(host.index.lookup(["set"], "keydown")).toBeDefined();
      host.index.removePrefix("set");
      expect(host.index.lookup(["set"], "keydown")).toBeUndefined();
      await intern.addScriptFile("set", rel);
      expect(host.index.lookup(["set"], "keydown")).toBeDefined();
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("closesetfile hides the street door", () => {
  it("runs closescene so doorclose plays once on interior arrive, not on turns", async () => {
    const calls: string[] = [];
    const host = new DustHost({} as PuppetUi);
    host.currentScene = "scene g12";
    host.index.add("scene:scene g12", {
      name: "closescene",
      params: [],
      body: [{ type: "call", call: { type: "call", name: "hidethedoor", args: [] } }],
    }, "scene");
    const vm = new VM({
      async call(name) {
        calls.push(name);
        return 0;
      },
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await host.call("closesetfile", [], vm);
    expect(calls).toContain("hidethedoor");
    expect(host.currentSet).toBe("none");
  });
});

describe("choice-line visemes", () => {
  it("waits for the per-line viseme track before starting the WAV", async () => {
    const spoken: unknown[] = [];
    const host = new DustHost({
      skipLine() {},
      clear() {},
      addBevel() {},
      async speak(_text: string, _wav: string | undefined, viseme: unknown) {
        spoken.push(viseme);
      },
    } as unknown as PuppetUi);
    const intern = host as unknown as {
      currentPuppetFolder: string;
      puppetLines: Map<string, { text: string; wav: string; viseme?: unknown }>;
      speak(ident: string): Promise<void>;
    };
    intern.currentPuppetFolder = "PUP/_LEROY";
    intern.puppetLines.set("leroy.12", { text: "Howdy", wav: "/extract/x.wav" });
    const viseme = { ticks: 10, frames: [{ t: 0, layers: { Jaw: 3 } }] };
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("visemes/leroy.12.json")) {
        return orig(input);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        ok: true,
        json: async () => viseme,
      } as Response;
    }) as typeof fetch;
    try {
      await intern.speak("leroy.12");
    } finally {
      globalThis.fetch = orig;
    }
    expect(spoken).toEqual([viseme]);
  });
});

describe("skip remaining speech", () => {
  it("drops later puppetspeak until puppetclear", async () => {
    const spoken: string[] = [];
    const host = new DustHost({
      skipLine() {},
      clear() {},
      addBevel() {},
      async speak(text: string) {
        spoken.push(text);
      },
    } as unknown as PuppetUi);
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    host.skipRemainingSpeech();
    await host.call("puppetspeak", ["leroy.12"], vm);
    await host.call("puppetspeak", ["leroy.13"], vm);
    expect(spoken).toEqual([]);
    await host.call("puppetclear", [], vm);
    await host.call("puppetspeak", ["leroy.11"], vm);
    expect(spoken).toEqual(["leroy.11"]);
  });
});

describe("puppet folders", () => {
  it("maps any actor name to the extract folder", () => {
    expect(puppetFolder("leroy")).toBe("PUP/_LEROY");
    expect(puppetFolder("jenix.pup")).toBe("PUP/_JENIX");
    expect(puppetFolder("ISAO")).toBe("PUP/_ISAO");
  });

  it("keys shared idle idents per PUP folder", () => {
    expect(puppetClipKey("PUP/_LEROY", "idle 1")).toBe("PUP/_LEROY/idle 1");
    expect(puppetClipKey("PUP/_HELP1", "Idle 1")).toBe("PUP/_HELP1/idle 1");
    expect(puppetClipKey("PUP/_LEROY", "idle 1")).not.toBe(
      puppetClipKey("PUP/_HELP1", "idle 1"),
    );
  });
});

describe("per-puppet viseme cache", () => {
  it("does not reuse a boot-warmed Leroy idle 1 on Help or Dell", async () => {
    const folders = ["PUP/_LEROY", "PUP/_HELP1", "PUP/_DELL1"] as const;
    if (folders.some((folder) => !existsSync(visemePath(folder)))) {
      return;
    }
    const { host, intern, fidgeted } = makePuppetHost();
    const restore = mockExtractDisk();
    try {
      intern.currentPuppetFolder = "PUP/_LEROY";
      const leroyJob = intern.loadVisemeLine("idle 1");
      intern.currentPuppetFolder = "PUP/_HELP1";
      const helpJob = intern.loadVisemeLine("idle 1");
      const [leroy, help] = await Promise.all([leroyJob, helpJob]);
      expect(leroy?.frames[0]?.layers.Background).toBe(0);
      expect(leroy?.frames[0]?.at?.Head).toEqual([249, 120]);
      expect(help?.frames[0]?.layers.Background).toBe(-1);
      expect(help?.frames[0]?.at?.Head).toEqual([253, 44]);
      expect(help).not.toBe(leroy);

      await host.preloadPuppet("help1.pup");
      const helpAgain = await intern.loadVisemeLine("idle 1");
      expect(helpAgain).toBe(help);
      intern.fidgetSilent("idle 1");
      expect(fidgeted[0]).toBe(help);

      intern.currentPuppetFolder = "PUP/_DELL1";
      const dell = await intern.loadVisemeLine("idle 1");
      expect(dell?.frames[0]?.layers.Background).toBe(-1);
      expect(dell?.frames[0]?.at?.Head).toEqual([253, 97]);
    } finally {
      restore();
    }
  });

  it("restores outdoor Help1 after indoor Help2 (same ident, two PUPs)", async () => {
    if (
      !existsSync(visemePath("PUP/_HELP1")) ||
      !existsSync(visemePath("PUP/_HELP2"))
    ) {
      return;
    }
    const { host, intern, fidgeted } = makePuppetHost();
    const restore = mockExtractDisk();
    try {
      await host.preloadPuppet("help2.pup");
      const indoor = await intern.loadVisemeLine("idle 1");
      expect(indoor?.frames[0]?.layers.Background).toBe(0);
      intern.fidgetSilent("idle 1");
      expect(fidgeted.at(-1)?.frames[0]?.at?.Background).toEqual([256, 132]);

      await host.preloadPuppet("help1.pup");
      const outdoor = await intern.loadVisemeLine("idle 1");
      expect(outdoor).not.toBe(indoor);
      expect(outdoor?.frames[0]?.layers.Background).toBe(-1);
      intern.fidgetSilent("idle 1");
      expect(fidgeted.at(-1)?.frames[0]?.layers.Background).toBe(-1);
      expect(fidgeted.at(-1)?.frames[0]?.at?.Head).toEqual([253, 44]);
    } finally {
      restore();
    }
  });

  it("keeps idle 2 glances and idle 4 speech on the open PUP", async () => {
    const needed = [
      visemePath("PUP/_LEROY", "idle 2"),
      visemePath("PUP/_LEROY", "idle 4"),
      visemePath("PUP/_HELP1", "idle 2"),
      visemePath("PUP/_HELP1", "idle 4"),
    ];
    if (needed.some((path) => !existsSync(path))) {
      return;
    }
    const { host, intern, spoken, fidgeted } = makePuppetHost();
    const restore = mockExtractDisk();
    try {
      await host.preloadPuppet("leroy.pup");
      const leroyGlance = await intern.loadVisemeLine("idle 2");
      const leroySpeak = await intern.loadVisemeLine("idle 4");
      expect(leroyGlance?.frames[1]?.layers.Head).toBe(6);
      expect(leroySpeak?.ticks).toBe(77);
      expect(leroySpeak?.frames[0]?.layers.Background).toBe(0);

      await host.preloadPuppet("help1.pup");
      const helpGlance = await intern.loadVisemeLine("idle 2");
      const helpSpeak = await intern.loadVisemeLine("idle 4");
      expect(helpGlance).not.toBe(leroyGlance);
      expect(helpSpeak).not.toBe(leroySpeak);
      expect(helpGlance?.frames[0]?.layers.Background).toBe(-1);
      expect(helpGlance?.frames[1]?.layers.Head).toBe(3);
      intern.fidgetSilent("idle 2");
      expect(fidgeted.at(-1)).toBe(helpGlance);
      await intern.speak("idle 4");
      expect(spoken.at(-1)).toBe(helpSpeak);
      expect(spoken.at(-1)?.ticks).toBe(102);
      expect(spoken.at(-1)?.frames[0]?.layers.Background).toBe(-1);
      expect(spoken.at(-1)?.frames[0]?.at?.Head).toEqual([253, 44]);
    } finally {
      restore();
    }
  });

  it("restores each PUP's texts.csv when reopening", async () => {
    if (
      !existsSync(visemePath("PUP/_LEROY")) ||
      !existsSync(visemePath("PUP/_HELP1"))
    ) {
      return;
    }
    const { host, intern } = makePuppetHost();
    const restore = mockExtractDisk();
    try {
      await host.preloadPuppet("leroy.pup");
      expect(intern.puppetLines.has("leroy.12")).toBe(true);
      expect(intern.puppetLines.has("help.1")).toBe(false);
      expect(intern.puppetLines.get("idle 4")?.wav).toMatch(/_LEROY/);

      await host.preloadPuppet("help1.pup");
      expect(intern.puppetLines.has("help.1")).toBe(true);
      expect(intern.puppetLines.has("leroy.12")).toBe(false);
      expect(intern.puppetLines.get("idle 4")?.wav).toMatch(/_HELP1/);

      await host.preloadPuppet("leroy.pup");
      expect(intern.puppetLines.has("leroy.12")).toBe(true);
      expect(intern.puppetLines.has("help.1")).toBe(false);
      expect(intern.puppetLines.get("idle 4")?.wav).toMatch(/_LEROY/);
    } finally {
      restore();
    }
  });

  it("late idle fetch after a folder switch is still that PUP's track", async () => {
    if (
      !existsSync(visemePath("PUP/_LEROY")) ||
      !existsSync(visemePath("PUP/_HELP1"))
    ) {
      return;
    }
    const { intern, fidgeted, late } = makePuppetHost();
    const restore = mockExtractDisk();
    try {
      intern.currentPuppetFolder = "PUP/_LEROY";
      const leroy = await intern.loadVisemeLine("idle 1");
      expect(leroy?.frames[0]?.layers.Background).toBe(0);

      intern.currentPuppetFolder = "PUP/_HELP1";
      intern.fidgetSilent("idle 1");
      expect(fidgeted).toEqual([]);
      const help = await intern.loadVisemeLine("idle 1");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(help).not.toBe(leroy);
      expect(help?.frames[0]?.layers.Background).toBe(-1);
      expect(late[0]).toBe(help);
    } finally {
      restore();
    }
  });

  it("does not reuse Leroy idle 1 on Cobb", async () => {
    if (
      !existsSync(visemePath("PUP/_LEROY")) ||
      !existsSync(visemePath("PUP/_COBB"))
    ) {
      return;
    }
    const { intern } = makePuppetHost();
    const restore = mockExtractDisk();
    try {
      intern.currentPuppetFolder = "PUP/_LEROY";
      await intern.loadVisemeLine("idle 1");
      intern.currentPuppetFolder = "PUP/_COBB";
      const cobb = await intern.loadVisemeLine("idle 1");
      expect(cobb?.frames[0]?.layers.Background).toBe(-1);
      expect(cobb?.frames[0]?.at?.Head).toEqual([233, 82]);
    } finally {
      restore();
    }
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

  it("accepts east as a facing, not only E", async () => {
    const host = new DustHost({} as PuppetUi);
    const poses: { facing: string }[] = [];
    host.view = {
      pose: { x: 6, y: 7, facing: "W" },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose(_world, pose) {
        host.view!.pose = pose;
        poses.push(pose);
      },
      log() {},
      refreshActors() {},
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    await host.call("currentview", ["east"], vm);
    expect(host.currentDir).toBe("E");
    expect(host.view.pose.facing).toBe("E");
    expect(poses).toEqual([expect.objectContaining({ x: 6, y: 7, facing: "E" })]);
  });
});

describe("interior scene lookup", () => {
  it("does not map street g8 onto the saloon grid", () => {
    const scenesPath = resolve("dfextract/out/SET/_SALLOWER/scenes.json");
    const transPath = resolve("dfextract/out/SET/_SALLOWER/transitions.json");
    if (!existsSync(scenesPath) || !existsSync(transPath)) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
    const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
    const graph = buildSetGraph(scenes, records, SET_SPAWN._SALLOWER);
    expect(host.scenePose("scene g8", graph)).toBeUndefined();
    expect(host.scenePose("scene d1", graph)).toEqual({ x: 3, y: 0 });
  });
});

describe("saloon piano player", () => {
  it("seats Isao facing south into the keys, not an east/west profile", () => {
    const disk = resolve("dfextract/out/CST/_GANG/Isao/Script.json");
    if (!existsSync(disk)) {
      return;
    }
    const procs = loadProcs("CST/_GANG/Isao/Script.json");
    const setup = procs.find((proc) => proc.name === "setupactor");
    const idle = procs.find((proc) => proc.name === "isaoidle");
    expect(JSON.stringify(setup)).toContain(
      '"name":"actordeg","args":[{"type":"me"},{"type":"num","value":0}]',
    );
    expect(JSON.stringify(setup)).not.toContain('"value":64');
    expect(JSON.stringify(setup)).not.toContain('"value":192');
    expect(JSON.stringify(idle)).toContain('"value":20');
    expect(JSON.stringify(idle)).toContain('"value":236');
    expect(JSON.stringify(idle)).not.toContain('"value":192');
  });
});

describe("interior door setupprop", () => {
  it("places salout on sallower and keeps it in nearbyProps", async () => {
    const doorScript = resolve("dfextract/out/PRP/_HOUSE/setcursor _arg__562.json");
    if (!existsSync(doorScript)) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.currentSet = "sallower";
    host.currentScene = "scene d1";
    host.currentDir = "E";
    for (const proc of loadProcs("PRP/_HOUSE/setcursor _arg__562.json")) {
      host.index.add("prop:door", proc, "door");
    }
    const door = host.ensureProp("door");
    door.shop = "house";
    door.spriteRoot = "PRP/_HOUSE";
    door.sprites = {
      salout: [{ path: "FRAMES/door/salout/00_c623.png", x: 138, y: 60, w: 232, h: 252 }],
    };
    host.view = {
      pose: { x: 3, y: 0, facing: "E" },
      world: "_SALLOWER",
      graph: {
        scenes: new Map(),
        cameraTiles: new Set(["3,0"]),
        transitions: [],
        byFrom: new Map(),
        cameraZ: 180,
      },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
      projectWorld(obj) {
        return worldToStill(obj, cameraFromPose(this.pose, 180));
      },
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false }) as Response) as typeof fetch;
    try {
      await vm.inObject("prop", "door", () =>
        vm.evalCall("setupprop", [{ type: "str", value: "salout" }]),
      );
    } finally {
      globalThis.fetch = origFetch;
    }
    expect(door.visible).toBe(true);
    expect(door.view).toBe("salout");
    expect(door.owner).toBe("salout");
    expect(door.set).toBe("sallower");
    expect(door.x).toBe(988);
    expect(door.y).toBe(134);
    expect(door.z).toBe(174);
    expect(door.openedAt).toEqual({ scene: "scene d1", facing: "E" });
    host.currentSet = "_SALLOWER";
    expect(host.nearbyProps().some((prop) => prop.name === "door")).toBe(true);
  });

  it("shuts the D1 east overlay once when leaving that still", async () => {
    const doorScript = resolve("dfextract/out/PRP/_HOUSE/setcursor _arg__562.json");
    if (!existsSync(doorScript)) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.currentScene = "scene d1";
    host.currentDir = "E";
    for (const proc of loadProcs("PRP/_HOUSE/setcursor _arg__562.json")) {
      host.index.add("prop:door", proc, "door");
    }
    const door = host.ensureProp("door");
    door.visible = true;
    door.owner = "salout";
    door.value = 1;
    door.openedAt = { scene: "scene d1", facing: "E" };
    door.x = 988;
    door.y = 134;
    door.z = 174;
    const closes: string[] = [];
    const origCall = host.call.bind(host);
    host.call = async (name, args, ctx) => {
      if (name === "voicesound") {
        closes.push(String(args[0]));
      }
      return origCall(name, args, ctx);
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false }) as Response) as typeof fetch;
    try {
      await host.closeDoorIfLeftOpening(vm, "scene d1", "E");
      expect(door.visible).toBe(true);
      expect(closes).toEqual([]);
      await host.closeDoorIfLeftOpening(vm, "scene d1", "W");
      expect(door.visible).toBe(false);
      expect(door.owner).toBe("none");
      expect(closes).toEqual(["doorclose1"]);
      await host.closeDoorIfLeftOpening(vm, "scene c1", "E");
      await host.closeDoorIfLeftOpening(vm, "scene d1", "N");
      expect(closes).toEqual(["doorclose1"]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("does not replay close when D1 closescene runs after the overlay already shut", async () => {
    const doorScript = resolve("dfextract/out/PRP/_HOUSE/setcursor _arg__562.json");
    const d1 = resolve("dfextract/out/SET/_SALLOWER/Scene D1.json");
    if (!existsSync(doorScript) || !existsSync(d1)) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.currentScene = "scene d1";
    for (const proc of loadProcs("PRP/_HOUSE/setcursor _arg__562.json")) {
      host.index.add("prop:door", proc, "door");
    }
    for (const proc of loadProcs("SET/_SALLOWER/Scene D1.json")) {
      host.index.add("scene:scene d1", proc, "d1");
    }
    const door = host.ensureProp("door");
    door.visible = true;
    door.owner = "salout";
    door.value = 1;
    door.openedAt = { scene: "scene d1", facing: "E" };
    const closes: string[] = [];
    const origCall = host.call.bind(host);
    host.call = async (name, args, ctx) => {
      if (name === "voicesound") {
        closes.push(String(args[0]));
      }
      return origCall(name, args, ctx);
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false }) as Response) as typeof fetch;
    try {
      await host.closeDoorIfLeftOpening(vm, "scene c1", "W");
      expect(closes).toEqual(["doorclose1"]);
      await host.onLeave(vm);
      expect(closes).toEqual(["doorclose1"]);
      expect(door.visible).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("shuts a chin A2 overlay on turn, not only saloon D1", async () => {
    const doorScript = resolve("dfextract/out/PRP/_HOUSE/setcursor _arg__562.json");
    if (!existsSync(doorScript)) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    for (const proc of loadProcs("PRP/_HOUSE/setcursor _arg__562.json")) {
      host.index.add("prop:door", proc, "door");
    }
    const door = host.ensureProp("door");
    door.visible = true;
    door.owner = "chin";
    door.value = 1;
    door.openedAt = { scene: "scene a2", facing: "W" };
    const closes: string[] = [];
    const origCall = host.call.bind(host);
    host.call = async (name, args, ctx) => {
      if (name === "voicesound") {
        closes.push(String(args[0]));
      }
      return origCall(name, args, ctx);
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false }) as Response) as typeof fetch;
    try {
      await host.closeDoorIfLeftOpening(vm, "scene a2", "W");
      expect(door.visible).toBe(true);
      await host.closeDoorIfLeftOpening(vm, "scene a2", "E");
      expect(door.visible).toBe(false);
      expect(closes).toEqual(["doorclose1"]);
      await host.closeDoorIfLeftOpening(vm, "scene a1", "W");
      expect(closes).toEqual(["doorclose1"]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("unilib clips after opentrackfile", () => {
  it("plays swingdoor from UNILIB while the saloon track is open", () => {
    expect(soundFileUrl("swingdoor", "_SALOON1")).toContain("SND/_UNILIB/swingdoor.wav");
    expect(soundFileUrl("knock1", "_SALOON1")).toContain("SND/_UNILIB/knock1.wav");
    expect(soundFileUrl("doorclose1", "_NIGHT")).toContain("SND/_UNILIB/doorclose1.wav");
    expect(soundFileUrl("crowdnoise", "_SALOON1")).toContain("SND/_SALOON1/crowdnoise.wav");
    expect(soundFileUrl("saloonsep.snd", "_SALOON1")).toContain("SND/_SALOON1/saloonsep.snd.wav");
  });
});

describe("fade does not halt theme", () => {
  it("leaves playtheme running through gotospecial's visualeffect", async () => {
    const host = new DustHost({} as PuppetUi);
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    await host.call("playtheme", ["saloonsep.snd"], vm);
    expect(host.currentTheme).toBe("saloonsep.snd");
    await host.call("visualeffect", ["plain", 0], vm);
    await host.call("screentoblack", ["current", 30], vm);
    expect(host.currentTheme).toBe("saloonsep.snd");
    await host.call("halttheme", [], vm);
    expect(host.currentTheme).toBe("none");
  });

  it("runs screentoblack then blacktoscreen with the script tick counts", async () => {
    const fades: string[] = [];
    const host = new DustHost({} as PuppetUi);
    host.view = {
      pose: { x: 3, y: 0, facing: "E" },
      world: "_SALLOWER",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
      async fadeToBlack(ticks) {
        fades.push(`out${ticks}`);
      },
      async fadeFromBlack(ticks) {
        fades.push(`in${ticks}`);
      },
      cutToBlack() {
        fades.push("cut");
      },
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    await host.call("screentoblack", ["current", 30], vm);
    await host.call("blacktoscreen", ["set", 30], vm);
    await host.call("blackscreen", [], vm);
    expect(fades).toEqual(["out30", "in30", "cut"]);
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

describe("hold-to-repeat key dispatch", () => {
  const bootKeydown = {
    name: "keydown",
    params: ["arg"],
    body: [{
      type: "call" as const,
      call: {
        type: "call" as const,
        name: "sendtoscene",
        args: [
          { type: "call" as const, name: "currentscene", args: [] },
          { type: "call" as const, name: "keydown", args: [{ type: "var" as const, name: "arg" }] },
        ],
      },
    }],
  };
  const bootKeyrepeat = {
    name: "keyrepeat",
    params: ["arg"],
    body: [
      { type: "global" as const, names: ["isrepeat"] },
      {
        type: "assign" as const,
        target: { type: "var" as const, name: "isrepeat" },
        value: { type: "bool" as const, value: true },
      },
      {
        type: "call" as const,
        call: { type: "call" as const, name: "keydown", args: [{ type: "var" as const, name: "arg" }] },
      },
      {
        type: "assign" as const,
        target: { type: "var" as const, name: "isrepeat" },
        value: { type: "bool" as const, value: false },
      },
    ],
  };
  const setWalk = {
    name: "keydown",
    params: ["arg"],
    body: [{
      type: "call" as const,
      call: { type: "call" as const, name: "currentscene", args: [{ type: "str" as const, value: "strait" }] },
    }],
  };

  function emptyView(walk: (kind: "strait" | "left" | "right") => void) {
    return {
      pose: { x: 6, y: 11, facing: "N" as const },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk,
      async setPose() {},
      log() {},
      refreshActors() {},
    };
  }

  function vmFor(host: DustHost) {
    return new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
  }

  it("runs scene keydown on keyrepeat so a G12-style gate still holds", async () => {
    const host = new DustHost({} as PuppetUi);
    let walked = "";
    host.currentScene = "scene g12";
    host.currentDir = "N";
    host.currentSet = "town";
    host.view = emptyView((kind) => {
      walked = kind;
    });
    host.index.add("boot", bootKeydown, "boot");
    host.index.add("boot", bootKeyrepeat, "boot");
    host.index.add("scene:scene g12", {
      name: "keydown",
      params: ["arg"],
      body: [
        { type: "global", names: ["isrepeat"] },
        {
          type: "if",
          cond: {
            type: "binary",
            op: "&",
            left: {
              type: "binary",
              op: "=",
              left: { type: "var", name: "arg" },
              right: { type: "str", value: "uparrow" },
            },
            right: {
              type: "binary",
              op: "=",
              left: { type: "call", name: "currentview", args: [] },
              right: { type: "str", value: "north" },
            },
          },
          then: [
            { type: "assign", target: { type: "var", name: "saw" }, value: { type: "var", name: "isrepeat" } },
            { type: "exitcode" },
          ],
        },
        { type: "passcode" },
      ],
    }, "scene");
    host.index.add("set", setWalk, "set");
    const vm = vmFor(host);
    vm.globalNames.add("saw");
    await host.dispatchKey(vm, "uparrow", true);
    expect(walked).toBe("");
    expect(vm.globals.get("saw")).toBe(true);
    expect(vm.globals.get("isrepeat")).toBe(false);
  });

  it("falls through to the SET walk on keyrepeat when the scene passes", async () => {
    const host = new DustHost({} as PuppetUi);
    let walked = "";
    host.currentScene = "scene g15";
    host.currentSet = "town";
    host.view = emptyView((kind) => {
      walked = kind;
    });
    host.index.add("boot", bootKeydown, "boot");
    host.index.add("scene:scene g15", {
      name: "keydown",
      params: ["arg"],
      body: [{ type: "passcode" }],
    }, "scene");
    host.index.add("set", setWalk, "set");
    const vm = vmFor(host);
    await host.dispatchKey(vm, "uparrow", true);
    expect(walked).toBe("strait");
  });

  it("extracted G12 dog keydown blocks a held uparrow", async () => {
    const scene = resolve("dfextract/out/SET/_NITE/Scene G12.json");
    const set = resolve("dfextract/out/SET/_NITE/Boot Script.json");
    const boot = resolve("dfextract/out/BOOT/_BOOTFILE/Script 1.json");
    if (![scene, set, boot].every((p) => existsSync(p))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    let walked = "";
    host.currentScene = "scene g12";
    host.currentDir = "N";
    host.currentSet = "town";
    host.view = emptyView((kind) => {
      walked = kind;
    });
    host.namedActor("dog").visible = true;
    for (const proc of loadProcs("BOOT/_BOOTFILE/Script 1.json")) {
      host.index.add("boot", proc, "boot");
    }
    for (const proc of loadProcs("SET/_NITE/Boot Script.json")) {
      host.index.add("set", proc, "set");
    }
    for (const proc of loadProcs("SET/_NITE/Scene G12.json")) {
      host.index.add("scene:scene g12", proc, "scene");
    }
    const vm = vmFor(host);
    vm.globals.set("day", 1);
    vm.globalNames.add("day");
    await host.dispatchKey(vm, "uparrow", true);
    expect(walked).toBe("");
  });
});

describe("scene setcursor", () => {
  it("sets touch on the G14 warning-sign and firearms hotspots", async () => {
    const scene = resolve("dfextract/out/SET/_NITE/Scene G14.json");
    const set = resolve("dfextract/out/SET/_NITE/Boot Script.json");
    if (![scene, set].every((p) => existsSync(p))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    for (const proc of loadProcs("SET/_NITE/Scene G14.json")) {
      host.index.add("scene:scene g14", proc, "scene");
    }
    for (const proc of loadProcs("SET/_NITE/Boot Script.json")) {
      host.index.add("set", proc, "set");
    }
    host.currentScene = "scene g14";
    host.currentDir = "N";
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await host.dispatchCursor(vm, { kind: "point", x: 50, y: 150, z: 0 });
    expect(host.cursorName).toBe("touch");
    await host.dispatchCursor(vm, { kind: "point", x: 256, y: 200, z: 0 });
    expect(host.cursorName).toBe("arrow");
    await host.dispatchCursor(vm, { kind: "point", x: 400, y: 150, z: 0 });
    expect(host.cursorName).toBe("touch");
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

describe("flat makeloop who", () => {
  it("maps button me onto the current SALGAMES flat", () => {
    const flats = ["flat 0", "flat 2", "flat 3"];
    expect(resolveFlatLoopWho("flat", "flat 2:stay", "flat 2", flats)).toBe("flat 2");
    expect(resolveFlatLoopWho("flat", "stay", "flat 2", flats)).toBe("flat 2");
    expect(resolveFlatLoopWho("flat", "flat 0", "flat 2", flats)).toBe("flat 0");
    expect(resolveFlatLoopWho("prop", "handle", "flat 3", flats)).toBe("handle");
  });
});

describe("saloon SALGAMES scripts", () => {
  it("parses extracted orchestrator, poker, blackjack, and slots", () => {
    const stageRel = "FLT/_SALGAMES/setcursor _arg__1.json";
    if (!existsSync(resolve("dfextract/out", stageRel))) {
      return;
    }
    const names = (rel: string) => loadProcs(rel).map((proc) => proc.name);
    expect(names(stageRel)).toEqual(
      expect.arrayContaining([
        "playcardsblackjack",
        "playcardspoker",
        "playslots",
        "closecards",
        "shuffle",
        "drawcash",
      ]),
    );
    expect(names("FLT/_SALGAMES/initgame_11.json")).toEqual(
      expect.arrayContaining(["newgame", "pickpieces", "quitgame", "inithandle"]),
    );
    expect(names("FLT/_SALGAMES/initgame_2.json")).toEqual(
      expect.arrayContaining(["initgame", "newgame", "dealcards", "makehands"]),
    );
    expect(names("FLT/_SALGAMES/initgame_8.json")).toEqual(
      expect.arrayContaining(["initgame", "newgame", "dealcards", "mainbetbj"]),
    );
  });

  it("implements putword, substring, stringlength, and button()", async () => {
    const host = new DustHost({} as PuppetUi);
    host.stillDown = true;
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    expect(await host.call("putword", ["ah kd qs", " ", 2, "2h"], vm)).toBe("ah 2h qs");
    expect(await host.call("substring", ["dust:data:", "dust:"], vm)).toBe(1);
    expect(await host.call("substring", ["2h 3h ah", "ah"], vm)).toBeGreaterThan(0);
    expect(await host.call("substring", ["2h 3h", "kd"], vm)).toBe(-1);
    expect(await host.call("stringlength", ["1234"], vm)).toBe(4);
    expect(await host.call("button", [], vm)).toBe(true);
  });

  it("sendtobutton three-arg runs the named button mousedown", async () => {
    const host = new DustHost({} as PuppetUi);
    const ran: string[] = [];
    host.index.add("button:flat 3:quit", {
      name: "mousedown",
      params: ["arg"],
      body: [{ type: "call", call: { type: "call", name: "quitgame", args: [] } }],
    }, "test");
    const vm = new VM({
      async call(name) {
        ran.push(name);
        return 0;
      },
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await vm.evalCall("sendtobutton", [
      { type: "str", value: "flat 3" },
      { type: "str", value: "quit" },
      { type: "call", name: "mousedown", args: [] },
    ]);
    expect(ran).toContain("quitgame");
  });

  it("pointinbutton uses SALGAMES Mac rects", async () => {
    const host = new DustHost({} as PuppetUi);
    const intern = host as unknown as { stageHits: Map<string, { name: string; top: number; left: number; bottom: number; right: number }[]> };
    intern.stageHits.set("flat 3", [
      { name: "pull", top: 26, left: 431, bottom: 105, right: 517 },
    ]);
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    expect(
      await host.call("pointinbutton", ["flat 3", "pull", { kind: "point", x: 450, y: 50, z: 0 }], vm),
    ).toBe(true);
    expect(
      await host.call("pointinbutton", ["flat 3", "pull", { kind: "point", x: 10, y: 10, z: 0 }], vm),
    ).toBe(false);
  });

  it("deals four cards on the first and second blackjack hands", async () => {
    if (!existsSync(resolve("dfextract/out/FLT/_SALGAMES/initgame_8.json"))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.currentFlatName = "flat 2";
    host.currentStageName = "salgames";
    const origCall = host.call.bind(host);
    const log: string[] = [];
    host.call = async (name, args, ctx) => {
      const op = name.toLowerCase();
      if (
        op === "delay" ||
        op === "forceupdate" ||
        op === "screentoblack" ||
        op === "blacktoscreen" ||
        op === "blackscreen" ||
        op === "singlesound" ||
        op === "message" ||
        op === "drawstring"
      ) {
        if (op === "delay" || op === "forceupdate") {
          log.push(op);
        }
        return 0;
      }
      if (op === "propview" || op === "propvisible") {
        log.push(`${op}:${String(args[0])}:${String(args[1])}`);
      }
      return origCall(name, args, ctx);
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    for (const proc of loadProcs("FLT/_SALGAMES/initgame_8.json")) {
      host.index.add("flat:flat 2", proc, "initgame_8");
    }
    for (const proc of loadProcs("FLT/_SALGAMES/setcursor _arg__1.json")) {
      host.index.add("stage", proc, "salgames-stage");
    }
    host.index.add(
      "flat:flat 2",
      { name: "mainbetbj", params: [], body: [{ type: "return", value: { type: "num", value: 0 } }] },
      "stub",
    );
    vm.globals.set("playercash", 20);
    vm.globalNames.add("playercash");
    await vm.inObject("flat", "flat 2", () => vm.evalCall("initgame", []));
    await vm.inObject("flat", "flat 2", () => vm.evalCall("newgame", []));
    expect(vm.globals.get("playercount")).toBe(2);
    expect(vm.globals.get("dealercount")).toBe(2);
    vm.globals.set("winner", "draw");
    await vm.inObject("flat", "flat 2", () => vm.evalCall("newgame", []));
    expect(vm.globals.get("playercount"), log.join(" | ")).toBe(2);
    expect(vm.globals.get("dealercount"), log.join(" | ")).toBe(2);
    const cards: string[] = [];
    for (const line of log) {
      const m = /^propvisible:([0-9jqka]{1,2}[hdsc]):true$/i.exec(line);
      if (m?.[1]) {
        cards.push(m[1].toLowerCase());
      }
    }
    expect(new Set(cards).size).toBe(8);
    expect(vm.globals.get("usedcount")).toBe(9);
  }, 10000);

  it("makeloop after pauseloop all still runs (blackjack resetgame)", async () => {
    const host = new DustHost({} as PuppetUi);
    host.currentFlatName = "flat 2";
    const ran: string[] = [];
    host.index.add(
      "flat:flat 2",
      {
        name: "resetgame",
        params: [],
        body: [{ type: "call", call: { type: "call", name: "note", args: [] } }],
      },
      "test",
    );
    const orig = host.call.bind(host);
    host.call = async (name, args, ctx) => {
      if (name === "note") {
        ran.push("resetgame");
        return 0;
      }
      return orig(name, args, ctx);
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await vm.evalCall("pauseloop", [
      { type: "str", value: "flat" },
      { type: "str", value: "all" },
      { type: "bool", value: true },
    ]);
    await vm.evalCall("makeloop", [
      { type: "str", value: "flat" },
      { type: "str", value: "flat 2" },
      { type: "str", value: "resetgame" },
      { type: "num", value: 1 },
    ]);
    host.tickScriptClock(1);
    await host.runQueued(vm);
    expect(ran).toEqual(["resetgame"]);
  });

  it("pauseloop all drops already-due loops of that kind", async () => {
    const host = new DustHost({} as PuppetUi);
    const ran: string[] = [];
    host.index.add(
      "scene:scene d1",
      {
        name: "soundfxs",
        params: [],
        body: [{ type: "call", call: { type: "call", name: "note", args: [] } }],
      },
      "test",
    );
    const orig = host.call.bind(host);
    host.call = async (name, args, ctx) => {
      if (name === "note") {
        ran.push("soundfxs");
        return 0;
      }
      return orig(name, args, ctx);
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await vm.evalCall("makeloop", [
      { type: "str", value: "scene" },
      { type: "str", value: "scene d1" },
      { type: "str", value: "soundfxs" },
      { type: "num", value: 1 },
    ]);
    host.tickScriptClock(1);
    await vm.evalCall("pauseloop", [
      { type: "str", value: "scene" },
      { type: "str", value: "all" },
      { type: "bool", value: true },
    ]);
    await host.runQueued(vm);
    expect(ran).toEqual([]);
  });

  it("tick runQueued does not drain makeloop while scriptBusy even if scriptPump > 0", async () => {
    const host = new DustHost({} as PuppetUi);
    const ran: string[] = [];
    host.index.add(
      "scene:town",
      {
        name: "idlefx",
        params: [],
        body: [{ type: "call", call: { type: "call", name: "noteidle", args: [] } }],
      },
      "test",
    );
    const vm = new VM({
      call: async (name, args, ctx) => {
        if (name === "noteidle") {
          ran.push("idle");
          return 0;
        }
        return host.call(name, args, ctx);
      },
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await vm.evalCall("makeloop", [
      { type: "str", value: "scene" },
      { type: "str", value: "town" },
      { type: "str", value: "idlefx" },
      { type: "num", value: 1 },
    ]);
    host.tickScriptClock(1);
    host.scriptBusy = true;
    host.scriptPump = 1;
    await host.runQueued(vm);
    expect(ran).toEqual([]);
    host.scriptPump = 0;
    host.scriptBusy = false;
    await host.runQueued(vm);
    expect(ran).toEqual(["idle"]);
  });

  it("forceupdate does not run a nested makeloop during resetgame", async () => {
    const host = new DustHost({} as PuppetUi);
    const ran: string[] = [];
    host.index.add(
      "scene:town",
      {
        name: "idlefx",
        params: [],
        body: [{ type: "call", call: { type: "call", name: "noteidle", args: [] } }],
      },
      "test",
    );
    const vm = new VM({
      call: async (name, args, ctx) => {
        if (name === "noteidle") {
          ran.push("idle");
          return 0;
        }
        return host.call(name, args, ctx);
      },
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await vm.evalCall("makeloop", [
      { type: "str", value: "scene" },
      { type: "str", value: "town" },
      { type: "str", value: "idlefx" },
      { type: "num", value: 1 },
    ]);
    host.tickScriptClock(1);
    host.scriptBusy = true;
    host.scriptPump = 1;
    await host.runQueued(vm, true);
    expect(ran).toEqual([]);
    host.scriptPump = 0;
    host.scriptBusy = false;
    await host.runQueued(vm);
    expect(ran).toEqual(["idle"]);
  });

  it("shuffles the 52-card SALGAMES deck without hanging", async () => {
    if (!existsSync(resolve("dfextract/out/FLT/_SALGAMES/setcursor _arg__1.json"))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.rng = () => 0.5;
    for (const proc of loadProcs("FLT/_SALGAMES/setcursor _arg__1.json")) {
      host.index.add("stage", proc, "salgames-stage");
    }
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const deck =
      "2h 3h 4h 5h 6h 7h 8h 9h 10h jh qh kh ah 2d 3d 4d 5d 6d 7d 8d 9d 10d jd qd kd ad 2s 3s 4s 5s 6s 7s 8s 9s 10s js qs ks as 2c 3c 4c 5c 6c 7c 8c 9c 10c jc qc kc ac ";
    const out = String(
      await vm.inObject("stage", "", () =>
        vm.evalCall("shuffle", [{ type: "str", value: deck }]),
      ),
    );
    const words = out.split(" ").filter((part) => part.length > 0);
    expect(words).toHaveLength(52);
    expect(new Set(words).size).toBe(52);
    const source = deck.split(" ").filter((part) => part.length > 0);
    expect(new Set(words)).toEqual(new Set(source));
    expect(await host.call("findword", [out, " ", 1], vm)).not.toBe("");
    expect(await host.call("findword", [out, " ", 52], vm)).not.toBe("");
    expect(await host.call("findword", [out, " ", 53], vm)).toBe("");
  });

  it("extracted cardtovalue fall-through maps ranks", async () => {
    if (!existsSync(resolve("dfextract/out/FLT/_SALGAMES/initgame_8.json"))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    for (const proc of loadProcs("FLT/_SALGAMES/initgame_8.json")) {
      host.index.add("flat:flat 2", proc, "initgame_8");
    }
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const value = (card: string) =>
      vm.inObject("flat", "flat 2", () =>
        vm.evalCall("cardtovalue", [{ type: "str", value: card }]),
      );
    expect(await value("2h")).toBe(2);
    expect(await value("2c")).toBe(2);
    expect(await value("10h")).toBe(10);
    expect(await value("qh")).toBe(10);
    expect(await value("ah")).toBe(1);
  });
});
