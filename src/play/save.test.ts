import { describe, expect, it } from "vitest";
import { VM } from "../vm/runtime";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";
import {
  DEFAULT_SAVE_TITLE,
  MemorySavePort,
  decodeSaveText,
  encodeSaveBlob,
  parseSaveBlob,
  saveFileName,
  saveSlotId,
  storyContinueFromSearch,
  valueToSaveJson,
  saveJsonToValue,
} from "./save";

function dayHost() {
  const host = new DustHost({
    addBevel() {},
    clear() {},
    close() {},
    setVisible() {},
  } as unknown as PuppetUi);
  host.savePort = new MemorySavePort();
  const vm = new VM({
    call: (name, args, ctx) => host.call(name, args, ctx),
    lookup: (name, ctx) => host.lookup(name, ctx),
    lookupChain: (name, ctx) => host.lookupChain(name, ctx),
  });
  host.view = {
    pose: { x: 6, y: 14, facing: "N" },
    world: "town",
    graph: { scenes: new Map(), cameras: new Map(), cameraTiles: new Set(), transitions: [] } as never,
    walk() {},
    async setPose(world, pose) {
      this.world = world;
      this.pose = pose;
    },
    log() {},
    refreshActors() {},
  };
  return { host, vm };
}

describe("save blob", () => {
  it("normalizes Dust 0.3 and dust 0.3 to one slot", () => {
    expect(saveSlotId("Dust 0.3")).toBe("dust 0.3");
    expect(saveSlotId("dust 0.3")).toBe("dust 0.3");
    expect(saveFileName("Dust 0.3")).toBe("dust-0.3.rtd");
  });

  it("roundtrips numbers, strings, and points", () => {
    expect(saveJsonToValue(valueToSaveJson(3))).toBe(3);
    expect(saveJsonToValue(valueToSaveJson("nite.set"))).toBe("nite.set");
    expect(saveJsonToValue(valueToSaveJson({ kind: "point", x: 1, y: 2, z: 3 }))).toEqual({
      kind: "point",
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it("rejects a foreign JSON file", () => {
    expect(parseSaveBlob({ format: 1, engine: "other" })).toBeUndefined();
    expect(decodeSaveText("{not json")).toBeUndefined();
  });

  it("encodes a blob the parser accepts", () => {
    const { host, vm } = dayHost();
    vm.globalNames.add("day");
    vm.globals.set("day", 4);
    const blob = host.captureSnapshot(vm, DEFAULT_SAVE_TITLE);
    const again = decodeSaveText(encodeSaveBlob(blob));
    expect(again?.globals.day).toBe(4);
    expect(again?.engine).toBe("diamondback");
  });
});

describe("story continue query", () => {
  it("is opt-in on resurrected URLs", () => {
    expect(storyContinueFromSearch("?mode=resurrected")).toBe(false);
    expect(storyContinueFromSearch("?mode=resurrected&continue=1")).toBe(true);
    expect(storyContinueFromSearch("?continue=1&mode=resurrected")).toBe(true);
  });
});

describe("savegame / opengame", () => {
  it("writes the slot and restores globals, pose, and actors", async () => {
    const { host, vm } = dayHost();
    vm.globalNames.add("day");
    vm.globalNames.add("clock");
    vm.globalNames.add("playercash");
    vm.globals.set("day", 3);
    vm.globals.set("clock", 2);
    vm.globals.set("playercash", 42);
    host.currentSet = "town";
    host.currentSetFile = "";
    host.currentScene = "scene g8";
    host.currentDir = "E";
    host.view!.pose = { x: 7, y: 6, facing: "E" };
    const leroy = host.namedActor("leroy");
    leroy.visible = true;
    leroy.x = 1740;
    leroy.y = 3536;
    leroy.owner = "town";
    const gun = host.namedProp("gun");
    gun.owner = "stranger";
    gun.visible = true;
    await host.call("savegame", ["dust 0.3"], vm);
    expect(vm.unimplemented.has("savegame")).toBe(false);
    vm.globals.set("day", 1);
    leroy.visible = false;
    gun.owner = "none";
    host.view!.pose = { x: 6, y: 14, facing: "N" };
    await host.call("opengame", ["dust 0.3"], vm);
    expect(vm.unimplemented.has("opengame")).toBe(false);
    expect(vm.globals.get("day")).toBe(3);
    expect(vm.globals.get("clock")).toBe(2);
    expect(vm.globals.get("playercash")).toBe(42);
    expect(host.namedActor("leroy").visible).toBe(true);
    expect(host.namedActor("leroy").x).toBe(1740);
    expect(host.namedProp("gun").owner).toBe("stranger");
    expect(host.view?.pose).toEqual({ x: 7, y: 6, facing: "E" });
  });

  it("questiondialog is false without a view hook so quit does not save", async () => {
    const { host, vm } = dayHost();
    host.view = {
      ...host.view!,
      async questionDialog() {
        return true;
      },
    };
    expect(await host.call("questiondialog", ["Save game before quitting?"], vm)).toBe(1);
    host.view.questionDialog = async () => false;
    expect(await host.call("questiondialog", ["Save game before quitting?"], vm)).toBe(0);
  });

  it("wavevolume and puppetparam stick for the score flat", async () => {
    const { host, vm } = dayHost();
    expect(await host.call("wavevolume", [], vm)).toBe(5);
    await host.call("wavevolume", [7], vm);
    expect(await host.call("wavevolume", [], vm)).toBe(7);
    expect(await host.call("puppetparam", [7], vm)).toBe(0);
    await host.call("puppetparam", [7, 1], vm);
    expect(await host.call("puppetparam", [7], vm)).toBe(1);
    const blob = host.captureSnapshot(vm, "dust 0.3");
    expect(blob.waveVolume).toBe(7);
    expect(blob.puppetParams[7]).toBe(1);
  });
});
