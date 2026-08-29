import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { calcDeg } from "./facing";
import { DustHost } from "./host";
import type { PuppetUi } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

/** Mouse around the CRACK spin hotspot so `fixdeg256(calcdeg + 64)` is `tick`. */
function vaultPointer(tick: number, radius = 90): { kind: "point"; x: number; y: number; z: number } {
  const dest = ((tick % 50) * 256) / 50;
  const dust = dest - 64;
  const rad = (dust / 256) * 2 * Math.PI;
  return {
    kind: "point",
    x: 256 + radius * Math.cos(rad),
    y: 128 + radius * Math.sin(rad),
    z: 0,
  };
}

describe("bank vault dial", () => {
  const spinRel = "PRP/_CRACK/mousedown _arg__2.json";
  const stageRel = "FLT/_CRACK/setcursor _arg_.json";

  it("maps top of the dial to tick 0 and right to 12", () => {
    const center = { x: 256, y: 128 };
    const top = vaultPointer(0);
    const right = vaultPointer(12);
    const tick = (pt: { x: number; y: number }) => {
      const dest = (((calcDeg(center, pt) + 64) % 256) + 256) % 256;
      return Math.trunc((dest * 50) / 256);
    };
    expect(tick(top)).toBe(0);
    expect(tick(right)).toBeGreaterThanOrEqual(11);
    expect(tick(right)).toBeLessThanOrEqual(13);
  });

  it("tracks one tick per mouse sample and freezes a wrap-sized jump", async () => {
    if (![spinRel, stageRel].every((rel) => existsSync(resolve("dfextract/out", rel)))) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    for (const proc of loadProcs(spinRel)) {
      host.index.add("prop:spin", proc, spinRel);
    }
    for (const proc of loadProcs(stageRel)) {
      host.index.add("stage", proc, stageRel);
    }
    const spin = host.namedProp("spin");
    spin.x = 256;
    spin.y = 128;
    spin.screen = true;
    spin.deg = 0;
    spin.visible = true;
    spin.shop = "crack";

    const realCall = host.call.bind(host);
    let pumps = 0;
    host.call = async (name, args, ctx) => {
      const op = name.toLowerCase();
      if (op === "voicesound" || op === "soundvol" || op === "drawstring") {
        return 0;
      }
      if (op === "forceupdate") {
        pumps += 1;
        if (pumps <= 12) {
          host.pointer = vaultPointer(pumps);
        } else {
          host.stillDown = false;
        }
        return 0;
      }
      return realCall(name, args, ctx);
    };

    const vm = new VM(host);
    vm.globals.set("turnright", 1);
    vm.globalNames.add("turnright");
    vm.globals.set("combo", "-1,-1,-1,");
    vm.globalNames.add("combo");
    vm.globals.set("curtwist", 1);
    vm.globalNames.add("curtwist");

    host.pointer = vaultPointer(0);
    host.stillDown = true;
    await vm.inObject("prop", "spin", () =>
      vm.evalCall("mousedown", [{ type: "call", name: "mouse", args: [] }]),
    );
    // `turnright = 1` only allows decreasing ticks (0 → 49 → …). Twelve
    // clockwise samples from 0 land near 38, not 12.
    expect(spin.deg).toBeGreaterThanOrEqual(36);
    expect(spin.deg).toBeLessThanOrEqual(40);
    expect(String(vm.globals.get("combo"))).toMatch(/^3[6-9],-1,-1,|^40,-1,-1,/);

    spin.deg = 0;
    vm.globals.set("turnright", 1);
    vm.globals.set("curtwist", 1);
    vm.globals.set("combo", "-1,-1,-1,");
    host.pointer = vaultPointer(0);
    host.stillDown = true;
    pumps = 0;
    host.call = async (name, args, ctx) => {
      const op = name.toLowerCase();
      if (op === "voicesound" || op === "soundvol" || op === "drawstring") {
        return 0;
      }
      if (op === "forceupdate") {
        pumps += 1;
        host.pointer = vaultPointer(pumps === 1 ? 30 : 30);
        host.stillDown = pumps < 2;
        return 0;
      }
      return realCall(name, args, ctx);
    };
    await vm.inObject("prop", "spin", () =>
      vm.evalCall("mousedown", [{ type: "call", name: "mouse", args: [] }]),
    );
    expect(spin.deg).toBe(0);
  });
});
