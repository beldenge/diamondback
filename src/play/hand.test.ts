import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { HAND_SLOT, hitsHandSlot, hitMacRect, MAINPANEL_BUTTONS } from "./hud";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";
import { worldToStill } from "./facing";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

describe("held item vs HUD chrome", () => {
  it("puts the INVEN large slot on the skull, not beside it", () => {
    expect(hitMacRect(MAINPANEL_BUTTONS, HAND_SLOT.x, HAND_SLOT.y)?.name).toBe("horn");
    expect(hitsHandSlot(HAND_SLOT.x, HAND_SLOT.y)).toBe(true);
  });

  it("does not treat a map click as the held item", () => {
    expect(hitsHandSlot(80, 320)).toBe(false);
    expect(hitMacRect(MAINPANEL_BUTTONS, 80, 320)?.name).toBe("map");
  });
});

describe("stdmouse drag onto an actor", () => {
  it("offers the bone to the dog on mouse-up", async () => {
    const inven = resolve("dfextract/out/PRP/_INVEN/setcursor _arg__1.json");
    const bone = resolve("dfextract/out/PRP/_INVEN/initprop_2.json");
    const dog = resolve("dfextract/out/CST/_EXTRA/dog/Script.json");
    if (![inven, bone, dog].every((p) => existsSync(p))) {
      return;
    }

    const host = new DustHost({} as PuppetUi);
    const realCall = host.call.bind(host);
    let fu = 0;
    host.call = async (name, args, ctx) => {
      const op = name.toLowerCase();
      if (op === "delay") {
        return 0;
      }
      if (op === "forceupdate") {
        fu += 1;
        if (fu === 2) {
          const still = worldToStill({ x: 1740, y: 3536 }, host.view!.pose);
          host.pointer = { kind: "point", x: still!.x, y: still!.y, z: 0 };
          host.stillDown = false;
        }
        return realCall(name, args, ctx);
      }
      return realCall(name, args, ctx);
    };
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof requestAnimationFrame;

    for (const proc of loadProcs("PRP/_INVEN/setcursor _arg__1.json")) {
      host.index.add("shop:inven", proc, "inven");
    }
    for (const proc of loadProcs("PRP/_INVEN/initprop_2.json")) {
      host.index.add("prop:bone", proc, "bone");
    }
    for (const proc of loadProcs("CST/_EXTRA/dog/Script.json")) {
      host.index.add("actor:dog", proc, "dog");
    }
    host.currentSet = "town";
    host.currentDir = "E";
    host.view = {
      pose: { x: 6, y: 14, facing: "N" },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
    };

    const boneProp = host.namedProp("bone");
    boneProp.shop = "inven";
    boneProp.visible = true;
    boneProp.view = "large";
    boneProp.owner = "stranger";
    boneProp.x = HAND_SLOT.x;
    boneProp.y = HAND_SLOT.y;

    const dogActor = host.namedActor("dog");
    dogActor.visible = true;
    dogActor.set = "town";
    dogActor.x = 1740;
    dogActor.y = 3536;

    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    vm.globals.set("handitem", "bone");
    vm.globalNames.add("handitem");
    vm.globals.set("day", 1);
    vm.globalNames.add("day");
    vm.globals.set("phase", 1);
    vm.globalNames.add("phase");

    const at = { kind: "point" as const, x: HAND_SLOT.x, y: HAND_SLOT.y, z: 0 };
    expect(host.hitsHeldItem(at, "bone")).toBe(true);
    host.pointer = at;
    const hit = await vm.evalCall("hittest", []);
    expect(hit).toBe("bone");
    expect(host.hitKind).toBe("prop");

    host.stillDown = true;
    await vm.inObject("prop", "bone", () =>
      vm.evalCall("mousedown", [{ type: "call", name: "mouse", args: [] }]),
    );
    expect(dogActor.visible).toBe(false);
    expect(String(vm.globals.get("handitem") ?? "")).toBe("");
    expect(boneProp.owner).toBe("none");
  }, 20_000);
});
