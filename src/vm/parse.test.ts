import { existsSync, readFileSync } from "node:fs";
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
const checkersAuto = resolve(here, "../../dfextract/out/PRP/_CHECKERS/automove_1.json");
const checkersPiece = resolve(here, "../../dfextract/out/PRP/_CHECKERS/setcursor _arg__2.json");

function tok(cmd: number, name: string): { off: number; cmd: number; kind: "opcode"; name: string } {
  return { off: 0, cmd, kind: "opcode", name };
}

function int(value: number): { off: number; cmd: number; kind: "integer"; value: number } {
  return { off: 0, cmd: 4, kind: "integer", value };
}

const BREAK = { off: 0, cmd: 6, kind: "break" as const, indent: 1 };

describe("operator precedence (DF.EXE FUN_00409ff0)", () => {
  it("binds = looser than < and @ tighter than comparisons", () => {
    // code t ()  x = 1 < 2 = 3 < 4  endcode
    const tokens = [
      tok(4001, "code"),
      { off: 0, cmd: 5, kind: "variable" as const, value: "t" },
      tok(4018, "("),
      tok(4019, ")"),
      BREAK,
      { off: 0, cmd: 5, kind: "variable" as const, value: "x" },
      tok(8008, "="),
      int(1),
      tok(8011, "<"),
      int(2),
      tok(8008, "="),
      int(3),
      tok(8011, "<"),
      int(4),
      BREAK,
      tok(4004, "endcode"),
    ];
    const [proc] = parseScript(tokens);
    const stmt = proc!.body[0]!;
    expect(stmt.type).toBe("assign");
    if (stmt.type !== "assign") {
      return;
    }
    expect(stmt.value.type).toBe("binary");
    if (stmt.value.type !== "binary") {
      return;
    }
    expect(stmt.value.op).toBe("=");
    expect(stmt.value.left.type === "binary" && stmt.value.left.op).toBe("<");
    expect(stmt.value.right.type === "binary" && stmt.value.right.op).toBe("<");
  });
});

describe("parseScript", () => {
  it("parses Jenix day1 runyoself", () => {
    if (!existsSync(jenixDay1)) {
      return;
    }
    const raw = readFileSync(jenixDay1, "utf8");
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
    const paths = [bootFile, newFlt, gangCast];
    if (!paths.every((path) => existsSync(path))) {
      return;
    }
    const names: string[] = [];
    for (const path of paths) {
      const file = JSON.parse(readFileSync(path, "utf8")) as ScriptFile;
      const procs = parseScript(file.tokens);
      expect(procs.length).toBeGreaterThan(0);
      names.push(...procs.map((p) => p.name));
    }
    expect(names).toEqual(expect.arrayContaining(["boot", "advanceday", "initactors", "runpuppet"]));
  });

  it("parses kidgang1 even though kidgangloop closes switch with endif", () => {
    const path = resolve(here, "../../dfextract/out/CST/_EXTRA/kidgang1/Script.json");
    if (!existsSync(path)) {
      return;
    }
    const file = JSON.parse(readFileSync(path, "utf8")) as ScriptFile;
    const procs = parseScript(file.tokens);
    expect(procs.map((p) => p.name)).toEqual(
      expect.arrayContaining(["setupactor", "kidgangloop", "walkloop", "hit", "deadexits"]),
    );
    const loop = procs.find((p) => p.name === "kidgangloop");
    expect(loop?.body.some((s) => s.type === "switch")).toBe(true);
  });

  it("parses checkers procs that close with endif instead of endcode", () => {
    if (!existsSync(checkersAuto) || !existsSync(checkersPiece)) {
      return;
    }
    const auto = parseScript(
      (JSON.parse(readFileSync(checkersAuto, "utf8")) as ScriptFile).tokens,
    );
    expect(auto.map((p) => p.name)).toEqual(
      expect.arrayContaining(["automove", "makemove", "win", "isking", "goodjump"]),
    );
    const piece = parseScript(
      (JSON.parse(readFileSync(checkersPiece, "utf8")) as ScriptFile).tokens,
    );
    expect(piece.map((p) => p.name)).toEqual(
      expect.arrayContaining(["mousedown", "goodloc", "rowcol2move", "sayjump"]),
    );
  });
});

describe("VM Jenix money", () => {
  it("takes the money when playercash is 5", async () => {
    if (!existsSync(jenixDay1)) {
      return;
    }
    const raw = readFileSync(jenixDay1, "utf8");
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

describe("switch case fall-through", () => {
  it("empty case labels share the next body (cardtovalue / mezphase)", async () => {
    const proc = {
      name: "cardtovalue",
      params: ["thecard"],
      body: [
        {
          type: "switch" as const,
          expr: { type: "var" as const, name: "thecard" },
          cases: [
            { match: { type: "str" as const, value: "2h" }, body: [] },
            { match: { type: "str" as const, value: "2d" }, body: [] },
            {
              match: { type: "str" as const, value: "2c" },
              body: [{ type: "return" as const, value: { type: "num" as const, value: 2 } }],
            },
            { match: { type: "str" as const, value: "3h" }, body: [] },
            {
              match: { type: "str" as const, value: "3c" },
              body: [{ type: "return" as const, value: { type: "num" as const, value: 3 } }],
            },
          ],
        },
      ],
    };
    const vm = new VM({ async call() { return 0; } });
    expect((await vm.runProc(proc, ["2h"])).value).toBe(2);
    expect((await vm.runProc(proc, ["2d"])).value).toBe(2);
    expect((await vm.runProc(proc, ["2c"])).value).toBe(2);
    expect((await vm.runProc(proc, ["3h"])).value).toBe(3);
    expect((await vm.runProc(proc, ["3c"])).value).toBe(3);
  });

  it("mezphase 0 falls into the shared day body, not an empty return", async () => {
    const proc = {
      name: "bootpoker",
      params: [],
      body: [
        { type: "global" as const, names: ["mezphase", "playcards"] },
        {
          type: "switch" as const,
          expr: { type: "var" as const, name: "mezphase" },
          cases: [
            { match: { type: "num" as const, value: 0 }, body: [] },
            {
              match: { type: "num" as const, value: 1 },
              body: [
                {
                  type: "assign" as const,
                  target: { type: "var" as const, name: "playcards" },
                  value: { type: "bool" as const, value: true },
                },
              ],
            },
            {
              match: { type: "num" as const, value: 2 },
              body: [
                {
                  type: "assign" as const,
                  target: { type: "var" as const, name: "playcards" },
                  value: { type: "bool" as const, value: false },
                },
              ],
            },
          ],
        },
      ],
    };
    const vm = new VM({ async call() { return 0; } });
    vm.globals.set("mezphase", 0);
    await vm.runProc(proc);
    expect(vm.globals.get("playcards")).toBe(true);
    vm.globals.set("mezphase", 2);
    await vm.runProc(proc);
    expect(vm.globals.get("playcards")).toBe(false);
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
  it("loads named objects before sendtoactor / inObject", async () => {
    const ensured: string[] = [];
    const host: OpcodeHost = {
      async ensureObject(object, name) {
        ensured.push(`${object}:${name}`);
      },
      async call(): Promise<Value> {
        return 0;
      },
    };
    const vm = new VM(host);
    await vm.inObject("actor", "leroy", async () => 0);
    expect(ensured).toEqual(["actor:leroy"]);
  });

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

describe("VM param vs global", () => {
  const host = { async call() { return 0; } };

  it("reassignment of a param does not clobber a global of the same name", async () => {
    const makemove = {
      name: "makemove",
      params: ["move"],
      body: [
        {
          type: "assign" as const,
          target: { type: "var" as const, name: "move" },
          value: { type: "str" as const, value: "1 -1 " },
        },
        { type: "return" as const, value: { type: "var" as const, name: "move" } },
      ],
    };
    const vm = new VM(host);
    vm.globalNames.add("move");
    vm.globals.set("move", "217,");
    expect((await vm.runProc(makemove, ["217"])).value).toBe("1 -1 ");
    expect(vm.globals.get("move")).toBe("217,");
  });

  it("the call argument is the param even when a leftover global has that name", async () => {
    const read = {
      name: "readmove",
      params: ["move"],
      body: [{ type: "return" as const, value: { type: "var" as const, name: "move" } }],
    };
    const vm = new VM(host);
    vm.globalNames.add("move");
    vm.globals.set("move", "999,");
    expect((await vm.runProc(read, ["525"])).value).toBe("525");
    expect(vm.globals.get("move")).toBe("999,");
  });

  it("assignment still updates a global when the frame has no local of that name", async () => {
    const win = {
      name: "win",
      params: [],
      body: [
        {
          type: "assign" as const,
          target: { type: "var" as const, name: "move" },
          value: { type: "str" as const, value: "done" },
        },
      ],
    };
    const vm = new VM(host);
    vm.globalNames.add("move");
    vm.globals.set("move", "217,");
    await vm.runProc(win);
    expect(vm.globals.get("move")).toBe("done");
  });
});
