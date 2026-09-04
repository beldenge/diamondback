import { describe, expect, it } from "vitest";
import { VM } from "../vm/runtime";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";
import {
  DEFAULT_SAVE_TITLE,
  MemorySavePort,
  decodeSaveText,
  encodeSaveBlob,
  navigationType,
  parseSaveBlob,
  saveBlobToDisk,
  saveFileName,
  saveSlotId,
  saveTitleFromGlobals,
  shouldRestoreAutosave,
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
  it("names JSON files from day and clock, not dust 0.3.rtd", () => {
    expect(saveSlotId("Dust 0.3")).toBe("dust 0.3");
    expect(saveTitleFromGlobals({ day: 1, clock: 3 })).toBe("Day 1 night");
    const { host, vm } = dayHost();
    vm.globals.set("day", 1);
    vm.globals.set("clock", 3);
    const blob = host.captureSnapshot(vm, DEFAULT_SAVE_TITLE);
    expect(saveFileName(blob)).toBe("day-1-night.json");
    vm.globals.set("day", 2);
    vm.globals.set("clock", 2);
    expect(saveFileName(host.captureSnapshot(vm, "x"))).toBe("day-2-afternoon.json");
    vm.globals.set("clock", 1);
    expect(saveFileName(host.captureSnapshot(vm, "x"))).toBe("day-2-morning.json");
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

  it("restores autosave on Continue or a refresh, not a fresh card click", () => {
    expect(shouldRestoreAutosave("?mode=resurrected", "navigate")).toBe(false);
    expect(shouldRestoreAutosave("?mode=resurrected", "reload")).toBe(true);
    expect(shouldRestoreAutosave("?mode=resurrected&continue=1", "navigate")).toBe(true);
    // Landing F5 leaves type `reload` for later in-page card clicks.
    expect(shouldRestoreAutosave("?mode=resurrected", "reload", "in-page")).toBe(false);
    expect(
      shouldRestoreAutosave("?mode=resurrected&continue=1", "reload", "in-page"),
    ).toBe(true);
  });

  it("reads reload from PerformanceNavigationTiming or the old API", () => {
    expect(
      navigationType({
        getEntriesByType: () => [{ type: "reload" }] as never,
      }),
    ).toBe("reload");
    expect(
      navigationType({
        getEntriesByType: () => [] as never,
        navigation: { type: 1 },
      }),
    ).toBe("reload");
    expect(
      navigationType({
        getEntriesByType: () => [{ type: "navigate" }] as never,
      }),
    ).toBe("navigate");
  });
});

describe("saveBlobToDisk", () => {
  it("uses the file picker, treats AbortError as cancel, and falls back to download", async () => {
    const { host, vm } = dayHost();
    vm.globals.set("day", 1);
    vm.globals.set("clock", 3);
    const blob = host.captureSnapshot(vm, "x");
    const g = globalThis as {
      showSaveFilePicker?: (opts: unknown) => Promise<{
        name?: string;
        createWritable: () => Promise<{
          write: (data: string) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    };
    const previous = g.showSaveFilePicker;
    const writes: string[] = [];
    try {
      g.showSaveFilePicker = async () => ({
        name: "day-1-night.json",
        createWritable: async () => ({
          write: async (data: string) => {
            writes.push(data);
          },
          close: async () => {},
        }),
      });
      await expect(saveBlobToDisk(blob)).resolves.toEqual({
        ok: true,
        via: "picker",
        name: "day-1-night.json",
      });
      expect(writes[0]).toContain('"engine": "diamondback"');
      g.showSaveFilePicker = async () => {
        const err = new Error("cancel");
        err.name = "AbortError";
        throw err;
      };
      await expect(saveBlobToDisk(blob)).resolves.toEqual({
        ok: false,
        cancelled: true,
        name: "day-1-night.json",
      });
      delete g.showSaveFilePicker;
      await expect(saveBlobToDisk(blob)).resolves.toEqual({
        ok: true,
        via: "download",
        name: "day-1-night.json",
      });
    } finally {
      if (previous) {
        g.showSaveFilePicker = previous;
      } else {
        delete g.showSaveFilePicker;
      }
    }
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
    expect((host.savePort as MemorySavePort).autosave?.globals.day).toBe(3);
  });

  it("Save cancel does not write autosave", async () => {
    const { host, vm } = dayHost();
    vm.globals.set("day", 2);
    host.view = {
      ...host.view!,
      async exportSave() {
        return false;
      },
    };
    await host.call("savegame", ["dust 0.3"], vm);
    expect((host.savePort as MemorySavePort).autosave).toBeUndefined();
  });

  it("file Open cancel leaves the current game; a load replaces autosave", async () => {
    const { host, vm } = dayHost();
    vm.globalNames.add("day");
    vm.globals.set("day", 2);
    await host.call("savegame", ["dust 0.3"], vm);
    vm.globals.set("day", 5);
    host.view = {
      ...host.view!,
      async importSave() {
        return { kind: "cancel" as const };
      },
    };
    await host.call("opengame", ["dust 0.3"], vm);
    expect(vm.globals.get("day")).toBe(5);
    const loaded = host.captureSnapshot(vm, "x");
    loaded.globals.day = 4;
    host.view.importSave = async () => ({ kind: "ok", blob: loaded });
    await host.call("opengame", ["dust 0.3"], vm);
    expect(vm.globals.get("day")).toBe(4);
    expect((host.savePort as MemorySavePort).autosave?.globals.day).toBe(4);
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
