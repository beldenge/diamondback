import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

describe("first talk delay", () => {
  it("counts forceupdate between click and first puppetspeak", async () => {
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
    const realCall = host.call.bind(host);
    let fu = 0;
    host.call = async (name, args, ctx) => {
      const op = name.toLowerCase();
      if (op === "forceupdate") {
        fu += 1;
      }
      if (op === "openpuppetfile" || op === "puppetspeak" || op === "runpuppet") {
        calls.push(`${op} fu=${fu}`);
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

    host.view = {
      pose: { x: 6, y: 14, facing: "N" },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
    };
    host.currentSet = "town";
    const leroy = host.namedActor("leroy");
    leroy.visible = true;
    leroy.set = "town";
    leroy.star = "town.leroy1";
    leroy.x = 1740;
    leroy.y = 3536;
    leroy.speed = 3;
    leroy.turnSpeed = 7;

    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
    });
    vm.globals.set("day", 1);
    vm.globals.set("clock", 3);
    vm.globals.set("leroyphase", 0);
    vm.object = "actor";
    vm.me = "leroy";
    vm.target = "leroy";

    const t0 = Date.now();
    await vm.evalCall("mousedown", [{ type: "num", value: 0 }]);
    const ms = Date.now() - t0;

    expect(fu, `forceupdate ran ${fu} times (${ms}ms). calls=${calls.join(" | ")}`).toBeLessThan(400);
    const speakAt = calls.find((c) => c.startsWith("puppetspeak"));
    const openAt = calls.find((c) => c.startsWith("openpuppetfile"));
    expect(openAt).toBe(speakAt?.replace("puppetspeak", "openpuppetfile"));
  }, 60_000);
});
