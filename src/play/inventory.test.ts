import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { inventorySpriteView } from "./hud";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

function loadInventoryHost() {
  const inven = resolve("dfextract/out/PRP/_INVEN/setcursor _arg__1.json");
  const bone = resolve("dfextract/out/PRP/_INVEN/initprop_2.json");
  const jug = resolve("dfextract/out/PRP/_INVEN/initprop_132.json");
  if (![inven, bone, jug].every((p) => existsSync(p))) {
    return null;
  }

  const host = new DustHost({} as PuppetUi);
  for (const proc of loadProcs("PRP/_INVEN/setcursor _arg__1.json")) {
    host.index.add("shop:inven", proc, "inven");
  }
  for (const proc of loadProcs("PRP/_INVEN/initprop_2.json")) {
    host.index.add("prop:bone", proc, "bone");
  }
  for (const proc of loadProcs("PRP/_INVEN/initprop_132.json")) {
    host.index.add("prop:jug", proc, "jug");
  }

  const boneProp = host.namedProp("bone");
  boneProp.shop = "inven";
  boneProp.owner = "stranger";
  boneProp.view = "panel";
  boneProp.x = 416;
  boneProp.y = 191;

  const jugProp = host.namedProp("jug");
  jugProp.shop = "inven";
  jugProp.owner = "stranger";
  jugProp.view = "hilite";
  jugProp.x = 179;
  jugProp.y = 178;

  const vm = new VM({
    call: (name, args, ctx) => host.call(name, args, ctx),
    lookup: (name, ctx) => host.lookup(name, ctx),
    lookupChain: (name, ctx) => host.lookupChain(name, ctx),
  });
  vm.globals.set("handitem", "jug");
  vm.globalNames.add("handitem");
  vm.globals.set("day", 1);
  vm.globalNames.add("day");
  return { host, vm, boneProp, jugProp };
}

describe("avatar inventory select and examine", () => {
  it("stdmouse panel click makes that prop the HUD handitem", async () => {
    const loaded = loadInventoryHost();
    if (!loaded) {
      return;
    }
    const { vm, boneProp, jugProp } = loaded;
    expect(inventorySpriteView("jug", "jug")).toBe("hilite");

    await vm.inObject("prop", "bone", () => vm.evalCall("mousedown", []));

    expect(String(vm.globals.get("handitem") ?? "")).toBe("bone");
    expect(boneProp.view).toBe("hilite");
    expect(jugProp.view).toBe("panel");
    expect(boneProp.x).toBe(416);
    expect(boneProp.y).toBe(191);
  });

  it("infoyoself plays the item inspect movie", async () => {
    const loaded = loadInventoryHost();
    if (!loaded) {
      return;
    }
    const { host, vm } = loaded;
    const realCall = host.call.bind(host);
    let movie = "";
    host.call = async (name, args, ctx) => {
      if (name.toLowerCase() === "playmovie") {
        movie = String(args[0] ?? "");
        return 0;
      }
      return realCall(name, args, ctx);
    };

    vm.globals.set("handitem", "bone");
    await vm.inObject("prop", "bone", () => vm.evalCall("infoyoself", []));
    expect(movie.toLowerCase()).toBe("bone.mov");
  });
});
