import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "./ast";
import { VM, type OpcodeHost, type Value } from "./runtime";

const here = dirname(fileURLToPath(import.meta.url));
const jenixDay1 = resolve(here, "../../dfextract/out/PUP/_JENIX/day1.json");
const bootFile = resolve(here, "../../dfextract/out/BOOT/_BOOTFILE/Script 1.json");
const newFlt = resolve(here, "../../dfextract/out/FLT/_NEW/setcursor _arg_.json");
const gangCast = resolve(here, "../../dfextract/out/CST/_GANG/Cast.json");

describe("parseScript", () => {
  it("parses Jenix day1 runyoself", () => {
    let raw: string;
    try {
      raw = readFileSync(jenixDay1, "utf8");
    } catch {
      return;
    }
    const file = JSON.parse(raw) as ScriptFile;
    const procs = parseScript(file.tokens);
    const run = procs.find((p) => p.name === "runyoself");
    expect(run).toBeDefined();
    expect(run?.params).toEqual([]);
    const types = run?.body.map((s) => s.type);
    expect(types).toContain("if");
    expect(types).toContain("switch");
    expect(types).toContain("call");
  });

  it("parses boot, new.flt, and gang cast libraries", () => {
    const names: string[] = [];
    for (const path of [bootFile, newFlt, gangCast]) {
      let raw: string;
      try {
        raw = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      const file = JSON.parse(raw) as ScriptFile;
      const procs = parseScript(file.tokens);
      expect(procs.length).toBeGreaterThan(0);
      names.push(...procs.map((p) => p.name));
    }
    expect(names).toEqual(expect.arrayContaining(["boot", "advanceday", "initactors", "runpuppet"]));
  });
});

describe("VM Jenix money", () => {
  it("takes the money when playercash is 5", async () => {
    let raw: string;
    try {
      raw = readFileSync(jenixDay1, "utf8");
    } catch {
      return;
    }
    const file = JSON.parse(raw) as ScriptFile;
    const procs = parseScript(file.tokens);
    const run = procs.find((p) => p.name === "runyoself");
    if (!run) {
      throw new Error("missing runyoself");
    }
    const spoken: string[] = [];
    const calls: string[] = [];
    const host: OpcodeHost = {
      async call(name, args) {
        calls.push(name);
        if (name === "puppetclear") {
          return 0;
        }
        if (name === "puppetspeak") {
          spoken.push(String(args[0] ?? ""));
          return 0;
        }
        if (name === "puppetbevel") {
          return 0;
        }
        if (name === "puppetevent") {
          return 101;
        }
        return 0;
      },
    };
    const vm = new VM(host);
    vm.globalNames.add("playercash");
    vm.globalNames.add("jenixphase");
    vm.globals.set("playercash", 5);
    vm.globals.set("jenixphase", 0);
    await vm.runProc(run);
    expect(spoken).toContain("jenix.5");
    expect(spoken).toContain("jenix.10");
    expect(vm.globals.get("playercash")).toBe(0);
    expect(vm.globals.get("jenixphase")).toBe(1);
  });
});

describe("VM while cap", () => {
  it("does not spin forever on while true", async () => {
    const host: OpcodeHost = {
      async call(): Promise<Value> {
        return 0;
      },
    };
    const vm = new VM(host);
    const procs = parseScript([
      { off: 0, cmd: 4001, kind: "opcode", name: "code" },
      { off: 8, cmd: 5, kind: "variable", value: "spin" },
      { off: 16, cmd: 4018, kind: "opcode", name: "(" },
      { off: 24, cmd: 4019, kind: "opcode", name: ")" },
      { off: 32, cmd: 4016, kind: "opcode", name: "while" },
      { off: 40, cmd: 4021, kind: "opcode", name: "true" },
      { off: 48, cmd: 4017, kind: "opcode", name: "endwhile" },
      { off: 56, cmd: 4004, kind: "opcode", name: "endcode" },
    ]);
    const result = await vm.runProc(procs[0]!);
    expect(result.flow).toBe("next");
  });
});

describe("VM control flow", () => {
  it("runs for loops and returns", async () => {
    const host: OpcodeHost = {
      async call(): Promise<Value> {
        return 0;
      },
    };
    const vm = new VM(host);
    const procs = parseScript([
      { off: 0, cmd: 4001, kind: "opcode", name: "code" },
      { off: 8, cmd: 5, kind: "variable", value: "sumto" },
      { off: 16, cmd: 4018, kind: "opcode", name: "(" },
      { off: 24, cmd: 5, kind: "variable", value: "n" },
      { off: 32, cmd: 4019, kind: "opcode", name: ")" },
      { off: 40, cmd: 4003, kind: "opcode", name: "local" },
      { off: 48, cmd: 5, kind: "variable", value: "i" },
      { off: 56, cmd: 4020, kind: "opcode", name: "," },
      { off: 64, cmd: 5, kind: "variable", value: "total" },
      { off: 72, cmd: 4002, kind: "opcode", name: "global" },
      { off: 80, cmd: 5, kind: "variable", value: "out" },
      { off: 84, cmd: 6, kind: "break", indent: 1 },
      { off: 88, cmd: 5, kind: "variable", value: "total" },
      { off: 96, cmd: 8008, kind: "opcode", name: "=" },
      { off: 104, cmd: 4, kind: "integer", value: 0 },
      { off: 108, cmd: 6, kind: "break", indent: 1 },
      { off: 112, cmd: 4012, kind: "opcode", name: "for" },
      { off: 120, cmd: 5, kind: "variable", value: "i" },
      { off: 128, cmd: 8008, kind: "opcode", name: "=" },
      { off: 136, cmd: 4, kind: "integer", value: 1 },
      { off: 144, cmd: 4013, kind: "opcode", name: "to" },
      { off: 152, cmd: 5, kind: "variable", value: "n" },
      { off: 156, cmd: 6, kind: "break", indent: 2 },
      { off: 160, cmd: 5, kind: "variable", value: "total" },
      { off: 168, cmd: 8008, kind: "opcode", name: "=" },
      { off: 176, cmd: 5, kind: "variable", value: "total" },
      { off: 184, cmd: 8001, kind: "opcode", name: "+" },
      { off: 192, cmd: 5, kind: "variable", value: "i" },
      { off: 196, cmd: 6, kind: "break", indent: 1 },
      { off: 200, cmd: 4015, kind: "opcode", name: "endfor" },
      { off: 204, cmd: 6, kind: "break", indent: 1 },
      { off: 208, cmd: 5, kind: "variable", value: "out" },
      { off: 216, cmd: 8008, kind: "opcode", name: "=" },
      { off: 224, cmd: 5, kind: "variable", value: "total" },
      { off: 232, cmd: 4024, kind: "opcode", name: "return" },
      { off: 240, cmd: 5, kind: "variable", value: "total" },
      { off: 248, cmd: 4004, kind: "opcode", name: "endcode" },
    ]);
    const result = await vm.runProc(procs[0]!, [3]);
    expect(result.value).toBe(6);
    expect(vm.globals.get("out")).toBe(6);
  });
});
