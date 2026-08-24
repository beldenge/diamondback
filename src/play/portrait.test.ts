import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { AVATAR_SLOT } from "./hud";
import { DustHost, resolveFlatName } from "./host";
import type { PuppetUi } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

describe("mainpanel HUD portrait", () => {
  it("noface parks nitefaces on the HUD slot and arms makeface", async () => {
    const rel = "FLT/_NEW/openflat_2.json";
    if (!existsSync(resolve("dfextract/out", rel))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    for (const proc of loadProcs(rel)) {
      host.index.add("flat:mainpanel", proc, rel);
    }
    const avatar = host.namedProp("avatar");
    avatar.shop = "house";
    avatar.visible = false;
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("clock", 3);
    vm.globalNames.add("clock");
    vm.globals.set("day", 1);
    vm.globalNames.add("day");

    await vm.inObject("flat", "mainpanel", () => vm.evalCall("noface", []));
    expect(avatar.visible).toBe(true);
    expect(avatar.view).toBe("nitefaces");
    expect(avatar.deg).toBe(0);
    expect(avatar.x).toBe(AVATAR_SLOT.x);
    expect(avatar.y).toBe(AVATAR_SLOT.y);
    const intern = host as unknown as { loops: Map<string, { proc: string }> };
    expect(intern.loops.get("flat:mainpanel")?.proc).toBe("makeface");
  });

  it("makeface fidgets propdeg or a glance view, then returns to noface", async () => {
    const rel = "FLT/_NEW/openflat_2.json";
    if (!existsSync(resolve("dfextract/out", rel))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.rng = () => 0;
    for (const proc of loadProcs(rel)) {
      host.index.add("flat:mainpanel", proc, rel);
    }
    const avatar = host.namedProp("avatar");
    avatar.view = "nitefaces";
    avatar.visible = true;
    avatar.x = AVATAR_SLOT.x;
    avatar.y = AVATAR_SLOT.y;
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("clock", 3);
    vm.globalNames.add("clock");

    await vm.inObject("flat", "mainpanel", () => vm.evalCall("makeface", []));
    expect(avatar.view).toBe("nitefaces");
    expect(avatar.deg).toBe(1);

    host.rng = () => 0.45;
    await vm.inObject("flat", "mainpanel", () => vm.evalCall("makeface", []));
    expect(avatar.view).toBe("niterite");
  });

  it("re-runs openflat after stoploop so initall cannot freeze the portrait", async () => {
    const rel = "FLT/_NEW/openflat_2.json";
    if (!existsSync(resolve("dfextract/out", rel))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    for (const proc of loadProcs(rel)) {
      host.index.add("flat:mainpanel", proc, rel);
    }
    const avatar = host.namedProp("avatar");
    avatar.shop = "house";
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("clock", 3);
    vm.globalNames.add("clock");
    vm.globals.set("day", 1);
    vm.globalNames.add("day");

    await vm.inObject("flat", "mainpanel", () => vm.evalCall("noface", []));
    await host.call("stoploop", ["flat", "all"], vm);
    const intern = host as unknown as {
      loops: Map<string, { proc: string }>;
      rearmHudFlat(ctx: VM): Promise<void>;
    };
    expect(intern.loops.has("flat:mainpanel")).toBe(false);
    await intern.rearmHudFlat(vm);
    expect(avatar.visible).toBe(true);
    expect(intern.loops.get("flat:mainpanel")?.proc).toBe("makeface");
  });

  it("stoploop drops due makeface so initall can re-arm noface", async () => {
    const rel = "FLT/_NEW/openflat_2.json";
    if (!existsSync(resolve("dfextract/out", rel))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    for (const proc of loadProcs(rel)) {
      host.index.add("flat:mainpanel", proc, rel);
    }
    const intern = host as unknown as {
      loops: Map<string, { kind: string; who: string; proc: string }>;
      dueLoops: { kind: string; who: string; proc: string }[];
    };
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("clock", 3);
    vm.globalNames.add("clock");
    vm.globals.set("day", 1);
    vm.globalNames.add("day");
    await vm.inObject("flat", "mainpanel", () => vm.evalCall("noface", []));
    const armed = intern.loops.get("flat:mainpanel");
    expect(armed).toBeDefined();
    intern.loops.delete("flat:mainpanel");
    intern.dueLoops.push(armed!);
    await host.call("stoploop", ["flat", "all"], vm);
    expect(intern.dueLoops.length).toBe(0);
    await host.ensureHudPortrait(vm);
    expect(intern.loops.get("flat:mainpanel")?.proc).toBe("makeface");
  });

  it("gotoflat uses 1-based FLT flats (2=map, 3=avatar)", () => {
    const flats = ["mainpanel", "map", "avatar", "score", "death"];
    expect(resolveFlatName(2, flats, "mainpanel")).toBe("map");
    expect(resolveFlatName(3, flats, "mainpanel")).toBe("avatar");
    expect(resolveFlatName("mainpanel", flats, "map")).toBe("mainpanel");
  });

  it("script clock runs the armed makeface fidget", async () => {
    const rel = "FLT/_NEW/openflat_2.json";
    if (!existsSync(resolve("dfextract/out", rel))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.rng = () => 0;
    for (const proc of loadProcs(rel)) {
      host.index.add("flat:mainpanel", proc, rel);
    }
    const avatar = host.namedProp("avatar");
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("clock", 3);
    vm.globalNames.add("clock");
    vm.globals.set("day", 1);
    vm.globalNames.add("day");

    await vm.inObject("flat", "mainpanel", () => vm.evalCall("noface", []));
    expect(avatar.deg).toBe(0);
    // noface: random(30)+30 with rng 0 → 31 script frames at framerate 3.
    const frameSec = 3 / 60;
    for (let i = 0; i < 40; i += 1) {
      host.tickScriptClock(frameSec);
      await host.runQueued(vm);
    }
    expect(avatar.deg).toBe(1);
  });
});
