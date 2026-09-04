import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { DustHost } from "./host";
import { isMenuFlat } from "./puzzle";
import { MemorySavePort } from "./save";
import type { PuppetUi } from "./ui";

function loadTxt(rel: string): string | undefined {
  const path = resolve("dfextract/out", rel);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

describe("extracted later-day story", () => {
  it("advanceday names every day-change movie and the day-5 chest spawn", () => {
    const txt = loadTxt("FLT/_NEW/setcursor _arg_.txt");
    if (!txt) {
      return;
    }
    expect(txt).toMatch(/playmovie \("d1nd2m\.mov"\)/);
    expect(txt).toMatch(/playmovie \("d2md2a\.mov"\)/);
    expect(txt).toMatch(/playmovie \("d2ad2n\.mov"\)/);
    expect(txt).toMatch(/initall \("jail", "jail\.set"\)/);
    expect(txt).toMatch(/playmovie \("d2nd3m\.mov"\)/);
    expect(txt).toMatch(/playmovie \("d3md3a\.mov"\)/);
    expect(txt).toMatch(/playmovie \("d3ad3n\.mov"\)/);
    expect(txt).toMatch(/playmovie \("d3nd4m\.mov"\)/);
    expect(txt).toMatch(/sendtoset \(openfight \(\)\)/);
    expect(txt).toMatch(/playmovie \("d4ad4n\.mov"\)/);
    expect(txt).toMatch(/playmovie \("d4nd5m\.mov"\)/);
    expect(txt).toMatch(/addinven \("chest"\)/);
    expect(txt).toMatch(/currentscene \("scene g4"\)/);
  });

  it("canadvance encodes the gun/boots/bullets and Yunni item gates", () => {
    const txt = loadTxt("FLT/_NEW/setcursor _arg_.txt");
    if (!txt) {
      return;
    }
    expect(txt).toMatch(/code canadvance/);
    expect(txt).toMatch(/day2items \(\) > 1/);
    expect(txt).toMatch(/propowner \("ring"\) = "jones"/);
    expect(txt).toMatch(/propowner \("pages"\) = "stranger"/);
    expect(txt).toMatch(/propowner \("mask"\) = "stranger"/);
    expect(txt).toMatch(/propowner \("yunnibook"\) = "stranger"/);
    expect(txt).toMatch(/propowner \("flute"\) = "stranger"/);
    expect(txt).toMatch(/code day3bedtime/);
    expect(txt).toMatch(/propowner \("tbird"\) = "stranger"/);
    expect(txt).toMatch(/propowner \("tstone"\) = "stranger"/);
  });

  it("runs canadvance false until two day-2 kit items are owned", async () => {
    const path = resolve("dfextract/out/FLT/_NEW/setcursor _arg_.json");
    if (!existsSync(path)) {
      return;
    }
    const host = new DustHost({
      addBevel() {},
      clear() {},
      close() {},
    } as unknown as PuppetUi);
    host.savePort = new MemorySavePort();
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    for (const proc of loadProcs("FLT/_NEW/setcursor _arg_.json")) {
      host.index.add("stage", proc, "FLT/_NEW/setcursor _arg_.json");
    }
    const can = host.index.lookup(["stage"], "canadvance");
    expect(can).toBeTruthy();
    vm.globalNames.add("day");
    vm.globalNames.add("clock");
    vm.globalNames.add("phase");
    vm.globals.set("day", 2);
    vm.globals.set("clock", 1);
    vm.globals.set("phase", 0);
    const closed = await vm.inObject("stage", "", () => vm.runProc(can!));
    expect(closed.value).toBe(false);
    host.namedProp("gun").owner = "stranger";
    host.namedProp("boots").owner = "stranger";
    const open = await vm.inObject("stage", "", () => vm.runProc(can!));
    expect(open.value).toBe(true);
  });

  it("day 5 G14 south is the five-ending puppet chain then credits", () => {
    const txt = loadTxt("SET/_TOWN/Scene G14.txt");
    if (!txt) {
      return;
    }
    expect(txt).toMatch(/day = 5 & currentview \(\) = "south"/);
    expect(txt).toMatch(/doamovie \("trottend\.mov"\)/);
    expect(txt).toMatch(/doamovie \("mayorend\.mov"\)/);
    expect(txt).toMatch(/doamovie \("marieend\.mov"\)/);
    expect(txt).toMatch(/doamovie \("yunniend\.mov"\)/);
    expect(txt).toMatch(/doamovie \("deserend\.mov"\)/);
    expect(txt).toMatch(/runcredits \(\)/);
    expect(txt).toMatch(/openstagefile \("credits\.flt"\)/);
  });

  it("death movies and the death-flat New/Open/Quit live in NEW.FLT", () => {
    const death = loadTxt("FLT/_NEW/death.txt");
    const neu = loadTxt("FLT/_NEW/mousedown _arg__33.txt");
    const open = loadTxt("FLT/_NEW/mousedown _arg__34.txt");
    const quit = loadTxt("FLT/_NEW/mousedown _arg__35.txt");
    if (!death || !neu || !open || !quit) {
      return;
    }
    expect(death).toMatch(/gotoflat \("death"\)/);
    expect(death).toMatch(/playmovie \("dies3\.mov"\)/);
    expect(death).toMatch(/playmovie \("diec1\.mov"\)/);
    expect(neu).toMatch(/advanceday \(\)/);
    expect(open).toMatch(/opengame \("dust 0\.3"\)/);
    expect(quit).toMatch(/savegame \("Dust 0\.3"\)/);
    expect(isMenuFlat("death")).toBe(true);
  });

  it("skull score flat is the original Save/Open/Quit/Credits menu", () => {
    const save = loadTxt("FLT/_NEW/mousedown _arg__24.txt");
    const open = loadTxt("FLT/_NEW/mousedown _arg__25.txt");
    const quit = loadTxt("FLT/_NEW/mousedown _arg__31.txt");
    const credits = loadTxt("FLT/_NEW/mousedown _arg__28.txt");
    const horn = loadTxt("FLT/_NEW/mousedown _arg__18.txt");
    if (!save || !open || !quit || !credits || !horn) {
      return;
    }
    expect(horn).toMatch(/gotoflat \(4\)/);
    expect(horn).toMatch(/visualeffect \(barndooropen, 30\)/);
    expect(save).toMatch(/savegame \("dust 0\.3"\)/);
    expect(open).toMatch(/opengame \("dust 0\.3"\)/);
    expect(quit).toMatch(/questiondialog \("Are you sure you want to quit\?"\)/);
    expect(credits).toMatch(/openstagefile \("credits\.flt"\)/);
    expect(isMenuFlat("score")).toBe(true);
  });

  it("map and inventory HUD flats use the same barn-door wipe as the skull", () => {
    const mapOpen = loadTxt("FLT/_NEW/mousedown _arg__17.txt");
    const mapClose = loadTxt("FLT/_NEW/mousedown _arg__20.txt");
    const invenOpen = loadTxt("FLT/_NEW/mousedown _arg__19.txt");
    const invenClose = loadTxt("FLT/_NEW/mousedown _arg__23.txt");
    const scoreClose = loadTxt("FLT/_NEW/mousedown _arg__22.txt");
    if (!mapOpen || !mapClose || !invenOpen || !invenClose || !scoreClose) {
      return;
    }
    expect(mapOpen).toMatch(/gotoflat \(2\)/);
    expect(mapOpen).toMatch(/visualeffect \(barndooropen, 30\)/);
    expect(mapClose).toMatch(/visualeffect \(barndoorclose, 30\)/);
    expect(invenOpen).toMatch(/gotoflat \(3\)/);
    expect(invenOpen).toMatch(/visualeffect \(barndooropen, 30\)/);
    expect(invenClose).toMatch(/visualeffect \(barndoorclose, 30\)/);
    expect(scoreClose).toMatch(/visualeffect \(barndoorclose, 30\)/);
  });

  it("credits shop scrolls HOUSE-style name plates", () => {
    const txt = loadTxt("PRP/_CREDITS/openshop_1.txt");
    if (!txt) {
      return;
    }
    expect(txt).toMatch(/code scrollnames/);
    expect(txt).toMatch(/propxy \("names", 2\)/);
    expect(txt).toMatch(/makeloop \("prop", "names", "namesup", 1\)/);
  });
});
