import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { examineHandName, inventorySpriteView } from "./hud";
import { DustHost } from "./host";
import {
  HOUSE_GROUPS,
  INVEN_GROUPS,
  propScriptRels,
  puzzlePropScriptRels,
  puzzleShopScriptRels,
  shopScriptRels,
  stageScriptRels,
} from "./propCatalog";
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

  it("EXAMINE uses handitem, or the first owned prop if helpbut is held", () => {
    expect(examineHandName("jug", ["bone", "jug"])).toBe("jug");
    expect(examineHandName("helpbut", ["bone", "jug"])).toBe("bone");
    expect(examineHandName("", ["bone"])).toBe("bone");
  });

  it("yunnibook moveyoself has no day-1 slot; day 4 places the panel icon", async () => {
    const rel = "PRP/_INVEN/initprop_294.json";
    if (!existsSync(resolve("dfextract/out", rel))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    for (const proc of loadProcs(rel)) {
      host.index.add("prop:yunnibook", proc, "yunnibook");
    }
    const book = host.namedProp("yunnibook");
    book.shop = "inven";
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("day", 1);
    await vm.inObject("prop", "yunnibook", () => vm.evalCall("moveyoself", []));
    expect(book.x).toBe(0);
    expect(book.y).toBe(0);
    vm.globals.set("day", 4);
    await vm.inObject("prop", "yunnibook", () => vm.evalCall("moveyoself", []));
    expect(book.x).toBe(95);
    expect(book.y).toBe(320);
  });
});

describe("prop script dump names", () => {
  it("does not probe INVEN setcursor files that were never extracted", () => {
    const mask = INVEN_GROUPS.find((group) => group.name === "mask");
    expect(mask).toBeTruthy();
    expect(propScriptRels(mask!)).toEqual(["PRP/_INVEN/initprop_83.json"]);
  });

  it("uses the HOUSE first-proc dump name, not both spellings", () => {
    const door = HOUSE_GROUPS.find((group) => group.name === "door");
    const star = HOUSE_GROUPS.find((group) => group.name === "shootingstar");
    expect(door).toBeTruthy();
    expect(star).toBeTruthy();
    expect(propScriptRels(door!)).toEqual(["PRP/_HOUSE/setcursor _arg__562.json"]);
    expect(propScriptRels(star!)).toEqual(["PRP/_HOUSE/initprop_2.json"]);
  });

  it("does not probe shop-level initprop_1.json", () => {
    expect(shopScriptRels("house")).toEqual(["PRP/_HOUSE/setcursor _arg__1.json"]);
    expect(shopScriptRels("inven")).toEqual(["PRP/_INVEN/setcursor _arg__1.json"]);
  });

  it("loads only dumps extract wrote for each HOUSE/INVEN group", () => {
    const root = resolve("dfextract/out");
    if (!existsSync(resolve(root, "PRP/_HOUSE/setcursor _arg__1.json"))) {
      return;
    }
    for (const group of [...HOUSE_GROUPS, ...INVEN_GROUPS]) {
      const rels = propScriptRels(group);
      expect(rels, group.name).toHaveLength(1);
      expect(existsSync(resolve(root, rels[0])), rels[0]).toBe(true);
    }
    for (const rel of [...shopScriptRels("house"), ...shopScriptRels("inven")]) {
      expect(existsSync(resolve(root, rel)), rel).toBe(true);
    }
  });

  it("does not probe TARGET/CHECKERS extras on NEW.FLT", () => {
    expect(stageScriptRels("new")).toEqual(["FLT/_NEW/setcursor _arg_.json"]);
    expect(stageScriptRels("target")).toEqual([
      "FLT/_TARGET/setcursor _arg_.json",
      "FLT/_TARGET/gototown _dirname_.json",
    ]);
    expect(stageScriptRels("checkers")).toEqual([
      "FLT/_CHECKERS/setcursor _arg_.json",
      "FLT/_CHECKERS/playcheckers.json",
    ]);
    expect(stageScriptRels("flute")).toEqual(["FLT/_FLUTE/setcursor _arg_.json"]);
    expect(stageScriptRels("sundial")).toEqual([
      "FLT/_SUNDIAL/setcursor _arg_.json",
      "FLT/_SUNDIAL/offerobject _what_.json",
    ]);
    expect(stageScriptRels("yunnibox")).toEqual(["FLT/_YUNNIBOX/setcursor _arg_.json"]);
  });

  it("loads only dumps extract wrote for FLT stage extras", () => {
    const root = resolve("dfextract/out");
    if (!existsSync(resolve(root, "FLT/_NEW/setcursor _arg_.json"))) {
      return;
    }
    for (const stem of [
      "new",
      "target",
      "checkers",
      "salgames",
      "credits",
      "fight",
      "sundial",
      "flute",
      "snake",
      "tumble",
      "yunnibox",
    ]) {
      for (const rel of stageScriptRels(stem)) {
        expect(existsSync(resolve(root, rel)), rel).toBe(true);
      }
    }
  });

  it("loads only dumps extract wrote for puzzle PRP containers", () => {
    const root = resolve("dfextract/out");
    if (!existsSync(resolve(root, "PRP/_CHECKERS/automove_1.json"))) {
      return;
    }
    expect(puzzleShopScriptRels("checkers")).toEqual(["PRP/_CHECKERS/automove_1.json"]);
    expect(puzzlePropScriptRels("checkers", 2)).toEqual(["PRP/_CHECKERS/setcursor _arg__2.json"]);
    expect(puzzlePropScriptRels("checkers", 14)).toEqual([]);
    for (const stem of [
      "checkers",
      "salgames",
      "target",
      "crack",
      "fight",
      "flute",
      "scorp",
      "hub",
      "sundial",
      "snake",
      "tumble",
    ]) {
      for (const rel of puzzleShopScriptRels(stem)) {
        expect(existsSync(resolve(root, rel)), rel).toBe(true);
      }
    }
    for (const id of [2, 8, 14, 522, 540]) {
      for (const rel of [
        ...puzzlePropScriptRels("checkers", id),
        ...puzzlePropScriptRels("salgames", id),
      ]) {
        expect(existsSync(resolve(root, rel)), rel).toBe(true);
      }
    }
  });
});
