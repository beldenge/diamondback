import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { AVATAR_SLOT } from "./hud";
import { DustHost } from "./host";
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
});
