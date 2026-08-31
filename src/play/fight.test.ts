import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM, type Point } from "../vm/runtime";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

function extractExists(...rels: string[]): boolean {
  return rels.every((rel) => existsSync(resolve("dfextract/out", rel)));
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

function pt(x: number, y: number): Point {
  return { kind: "point", x, y, z: 0 };
}

function scriptFrames(host: DustHost, n: number): void {
  host.tickScriptClock((n * host.framerateValue) / 60 + 0.0001);
}

type FightIntern = {
  openStage(name: string): Promise<void>;
  openShop(name: string): Promise<void>;
  puzzleItems(): { name: string; x: number; y: number; w: number; h: number }[];
  props: Map<string, { name: string; view: string; x: number; y: number; visible: boolean }>;
  loops: Map<string, { who: string; proc: string; remaining: number }>;
};

async function bootFight(): Promise<{ host: DustHost; intern: FightIntern; vm: VM } | undefined> {
  if (
    !extractExists(
      "FLT/_FIGHT/openflat_2.json",
      "PRP/_FIGHT/setcursor _arg__54.json",
      "PRP/_FIGHT/setcursor _arg__1.json",
      "PRP/_FIGHT/props.json",
      "BOOT/_BOOTFILE/Script 1.json",
    )
  ) {
    return undefined;
  }
  const host = new DustHost({} as PuppetUi);
  host.rng = () => 0.99;
  const intern = host as unknown as FightIntern;
  const vm = new VM({
    call: (name, args, ctx) => host.call(name, args, ctx),
    lookup: (name, ctx) => host.lookup(name, ctx),
    lookupChain: (name, ctx) => host.lookupChain(name, ctx),
  });
  for (const proc of loadProcs("BOOT/_BOOTFILE/Script 1.json")) {
    host.index.add("boot", proc, "boot");
  }
  await intern.openStage("fight.flt");
  await intern.openShop("fight.prp");
  await vm.inObject("shop", "fight", () => vm.evalCall("openshop", []));
  vm.globals.set("fightover", false);
  vm.globals.set("dellpower", 255);
  vm.globals.set("playerpower", 255);
  vm.globalNames.add("fightover");
  vm.globalNames.add("dellpower");
  vm.globalNames.add("playerpower");
  return { host, intern, vm };
}

async function punch(host: DustHost, intern: FightIntern, vm: VM, x: number, y: number): Promise<string> {
  const dell = intern.props.get("dell");
  if (dell) {
    dell.view = "idle1";
  }
  const fists = intern.props.get("fists");
  if (fists) {
    fists.view = "rest";
  }
  await host.dispatchMouse(vm, pt(x, y));
  return intern.props.get("fists")?.view ?? "";
}

describe("Dell fight punches", () => {
  it("getpunch is stage Y bands (eyes / hook / jaw / gut), split at x=246", async () => {
    if (!extractExists("PRP/_FIGHT/setcursor _arg__54.json")) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    const getpunch = loadProcs("PRP/_FIGHT/setcursor _arg__54.json").find((p) => p.name === "getpunch");
    expect(getpunch).toBeDefined();
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    const kind = async (x: number, y: number) =>
      (await vm.runProc(getpunch!, [pt(x, y)])).value;
    expect(await kind(250, 50)).toBe(1);
    expect(await kind(180, 50)).toBe(1);
    expect(await kind(300, 50)).toBe(1);
    expect(await kind(180, 110)).toBe(2);
    expect(await kind(300, 110)).toBe(3);
    expect(await kind(180, 130)).toBe(4);
    expect(await kind(300, 130)).toBe(5);
    expect(await kind(180, 170)).toBe(6);
    expect(await kind(300, 170)).toBe(7);
    expect(await kind(300, 220)).toBe(8);
  });

  it("a jaw click after an eyepoke is still a jaw, not another poke", async () => {
    const restore = mockExtractDisk();
    try {
      const boot = await bootFight();
      if (!boot) {
        return;
      }
      const { host, intern, vm } = boot;
      const dell = intern.puzzleItems().find((item) => item.name === "dell");
      expect(dell, "Dell blit after openshop").toBeDefined();
      expect(dell!.y).toBeLessThan(93);

      expect(await punch(host, intern, vm, 250, 50)).toBe("eyepoke");
      expect(intern.props.get("fists")?.view).toBe("eyepoke");
      expect(intern.loops.get("prop:fists")?.proc).toBe("stop");

      // Click during the poke: fists are not rest, so this must no-op.
      await host.dispatchMouse(vm, pt(180, 130));
      expect(intern.props.get("fists")?.view).toBe("eyepoke");

      scriptFrames(host, 8);
      await host.runQueued(vm);
      expect(intern.props.get("fists")?.view).toBe("rest");

      expect(await punch(host, intern, vm, 180, 130)).toBe("leftjaw");
      scriptFrames(host, 8);
      await host.runQueued(vm);
      expect(intern.props.get("fists")?.view).toBe("rest");
      expect(await punch(host, intern, vm, 300, 110)).toBe("righthook");
    } finally {
      restore();
    }
  });

  it("asPoint(0) must not map every later punch to eyepoke (y=0)", async () => {
    const host = new DustHost({} as PuppetUi);
    host.pointer = pt(180, 130);
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
    });
    expect(await host.call("pointy", [0], vm)).toBe(0);
    expect(await host.call("pointy", [undefined], vm)).toBe(130);
    expect(await host.call("pointx", [undefined], vm)).toBe(180);
  });
});
