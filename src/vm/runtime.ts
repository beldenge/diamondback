import type { Expr, Proc, Stmt } from "./ast";

export type Point = { kind: "point"; x: number; y: number; z: number };
export type Value = number | string | boolean | Point | undefined;

export type Flow = "next" | "return" | "exitcode" | "passcode";

export interface RunResult {
  flow: Flow;
  value: Value;
}

export interface Frame {
  locals: Map<string, Value>;
  me: string;
  target: string;
  object: string;
  procName: string;
}

export interface OpcodeHost {
  call(name: string, args: Value[], ctx: VM): Promise<Value>;
  lookup?(name: string, ctx: VM): Proc | undefined;
  /** Procs in inheritance order (scene → set, actor → cast). `passcode` tries the next. */
  lookupChain?(name: string, ctx: VM): Proc[];
  log?(message: string): void;
}

const SEND_ONE = new Set([
  "sendtostage",
  "sendtostagefx",
  "sendtoset",
  "sendtosetfx",
  "sendtoboot",
  "sendtobootfx",
]);

const SEND_NAMED = new Set([
  "sendtoactor",
  "sendtoactorfx",
  "sendtopuppet",
  "sendtopuppetfx",
  "sendtoshop",
  "sendtoshopfx",
  "sendtocast",
  "sendtocastfx",
  "sendtoscene",
  "sendtoscenefx",
  "sendtoprop",
  "sendtopropfx",
  "sendtoflat",
  "sendtoflatfx",
  "sendtobutton",
  "sendtobuttonfx",
  "sendtofloor",
  "sendtofloorfx",
]);

export class VMError extends Error {}

/** Dust scripts wait on engine flags (`currentvoice`, `iswalk`). A stub
 * that never flips those flags would freeze the tab. Cap the spin. */
/** Empty `while true` must not freeze the tab. Yielding waits (`forceupdate`)
 * need many more ticks — a town walk is hundreds of frames. */
const WHILE_CAP = 2048;

export class VM {
  readonly globals = new Map<string, Value>();
  readonly globalNames = new Set<string>();
  readonly frames: Frame[] = [];
  object = "boot";
  me = "";
  target = "";
  lastResult: Value = 0;
  lastFlow: Flow = "next";
  unimplemented = new Set<string>();

  constructor(readonly host: OpcodeHost) {}

  frame(): Frame | undefined {
    return this.frames.at(-1);
  }

  async runProc(proc: Proc, args: Value[] = []): Promise<RunResult> {
    const locals = new Map<string, Value>();
    for (let i = 0; i < proc.params.length; i += 1) {
      locals.set(proc.params[i] ?? "", args[i]);
    }
    const frame: Frame = {
      locals,
      me: this.me,
      target: this.target,
      object: this.object,
      procName: proc.name,
    };
    this.frames.push(frame);
    try {
      const result = await this.execBlock(proc.body);
      return result;
    } finally {
      this.frames.pop();
    }
  }

  async execBlock(body: Stmt[]): Promise<RunResult> {
    for (const stmt of body) {
      const result = await this.execStmt(stmt);
      if (result.flow !== "next") {
        return result;
      }
    }
    return { flow: "next", value: 0 };
  }

  private async execStmt(stmt: Stmt): Promise<RunResult> {
    switch (stmt.type) {
      case "global":
        for (const name of stmt.names) {
          this.globalNames.add(name);
          if (!this.globals.has(name)) {
            this.globals.set(name, 0);
          }
        }
        return { flow: "next", value: 0 };
      case "local": {
        const frame = this.frame();
        if (frame) {
          for (const name of stmt.names) {
            if (!frame.locals.has(name)) {
              frame.locals.set(name, 0);
            }
          }
        }
        return { flow: "next", value: 0 };
      }
      case "dumpglobal":
        this.host.log?.(
          stmt.names.map((n) => `${n}=${stringify(this.globals.get(n))}`).join(" "),
        );
        return { flow: "next", value: 0 };
      case "assign": {
        const value = await this.evalExpr(stmt.value);
        await this.assign(stmt.target, value);
        return { flow: "next", value };
      }
      case "call": {
        const value = await this.evalCall(stmt.call.name, stmt.call.args);
        return { flow: "next", value };
      }
      case "if": {
        const cond = await this.evalExpr(stmt.cond);
        if (truthy(cond)) {
          return this.execBlock(stmt.then);
        }
        if (stmt.else) {
          return this.execBlock(stmt.else);
        }
        return { flow: "next", value: 0 };
      }
      case "switch": {
        const disc = await this.evalExpr(stmt.expr);
        for (const arm of stmt.cases) {
          const match = await this.evalExpr(arm.match);
          if (eq(disc, match)) {
            return this.execBlock(arm.body);
          }
        }
        return { flow: "next", value: 0 };
      }
      case "while": {
        let spins = 0;
        for (;;) {
          if (!truthy(await this.evalExpr(stmt.cond))) {
            return { flow: "next", value: 0 };
          }
          spins += 1;
          if (spins > WHILE_CAP) {
            this.host.log?.(`while-loop cap (${WHILE_CAP})`);
            return { flow: "next", value: 0 };
          }
          const result = await this.execBlock(stmt.body);
          if (result.flow !== "next") {
            return result;
          }
        }
      }
      case "for": {
        const from = num(await this.evalExpr(stmt.from));
        const to = num(await this.evalExpr(stmt.to));
        const step = num(await this.evalExpr(stmt.step)) || 1;
        const frame = this.frame();
        for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
          if (frame) {
            frame.locals.set(stmt.name, i);
          } else {
            this.globals.set(stmt.name, i);
          }
          const result = await this.execBlock(stmt.body);
          if (result.flow !== "next") {
            return result;
          }
        }
        return { flow: "next", value: 0 };
      }
      case "return":
        return {
          flow: "return",
          value: stmt.value ? await this.evalExpr(stmt.value) : 0,
        };
      case "exitcode":
        return { flow: "exitcode", value: 0 };
      case "passcode":
        return { flow: "passcode", value: 0 };
      default:
        return { flow: "next", value: 0 };
    }
  }

  async evalExpr(expr: Expr): Promise<Value> {
    switch (expr.type) {
      case "num":
        return expr.value;
      case "str":
        return expr.value;
      case "bool":
        return expr.value;
      case "me":
        return this.me || this.frame()?.me || "";
      case "target":
        return this.target || this.frame()?.target || "";
      case "var":
        return this.getVar(expr.name);
      case "unary": {
        const inner = await this.evalExpr(expr.inner);
        if (expr.op === "not") {
          return !truthy(inner);
        }
        return -num(inner);
      }
      case "binary": {
        const left = await this.evalExpr(expr.left);
        const right = await this.evalExpr(expr.right);
        return binary(expr.op, left, right);
      }
      case "call":
        return this.evalCall(expr.name, expr.args);
      default:
        return 0;
    }
  }

  async evalCall(name: string, args: Expr[]): Promise<Value> {
    const lower = name.toLowerCase();
    if (SEND_ONE.has(lower)) {
      return this.sendOne(lower, args);
    }
    if (SEND_NAMED.has(lower)) {
      return this.sendNamed(lower, args);
    }
    const values: Value[] = [];
    for (const arg of args) {
      values.push(await this.evalExpr(arg));
    }
    const chain = this.host.lookupChain?.(name, this);
    const procs =
      chain && chain.length
        ? chain
        : (() => {
            const one = this.host.lookup?.(name, this);
            return one ? [one] : [];
          })();
    for (const proc of procs) {
      const result = await this.runProc(proc, values);
      this.lastFlow = result.flow;
      if (result.flow !== "passcode") {
        this.lastResult = result.value;
        return result.value;
      }
    }
    if (procs.length) {
      this.lastFlow = "passcode";
      return 0;
    }
    this.lastFlow = "next";
    return this.host.call(name, values, this);
  }

  private async sendOne(kind: string, args: Expr[]): Promise<Value> {
    const object = objectForSend(kind);
    return this.inObject(object, "", async () => {
      if (args[0]) {
        return this.evalExpr(args[0]);
      }
      return 0;
    });
  }

  private async sendNamed(kind: string, args: Expr[]): Promise<Value> {
    const name = str(await this.evalExpr(args[0] ?? { type: "str", value: "" }));
    const object = objectForSend(kind);
    return this.inObject(object, name, async () => {
      if (args[1]) {
        return this.evalExpr(args[1]);
      }
      return 0;
    });
  }

  async inObject<T>(object: string, me: string, fn: () => Promise<T>): Promise<T> {
    const prevObject = this.object;
    const prevMe = this.me;
    const prevTarget = this.target;
    this.object = object;
    if (me) {
      this.me = me;
      this.target = me;
    }
    try {
      return await fn();
    } finally {
      this.object = prevObject;
      this.me = prevMe;
      this.target = prevTarget;
    }
  }

  getVar(name: string): Value {
    const frame = this.frame();
    if (frame?.locals.has(name)) {
      return frame.locals.get(name);
    }
    if (this.globals.has(name) || this.globalNames.has(name)) {
      return this.globals.get(name) ?? 0;
    }
    if (frame?.locals.has(name.toLowerCase())) {
      return frame.locals.get(name.toLowerCase());
    }
    const lower = name.toLowerCase();
    for (const [key, value] of this.globals) {
      if (key.toLowerCase() === lower) {
        return value;
      }
    }
    return 0;
  }

  setVar(name: string, value: Value): void {
    const frame = this.frame();
    if (frame?.locals.has(name) && !this.globalNames.has(name)) {
      frame.locals.set(name, value);
      return;
    }
    if (this.globalNames.has(name) || this.globals.has(name)) {
      this.globals.set(name, value);
      this.globalNames.add(name);
      return;
    }
    if (frame) {
      frame.locals.set(name, value);
      return;
    }
    this.globals.set(name, value);
  }

  private async assign(target: Expr, value: Value): Promise<void> {
    if (target.type === "var") {
      this.setVar(target.name, value);
      return;
    }
    if (target.type === "call") {
      const args: Value[] = [];
      for (const arg of target.args) {
        args.push(await this.evalExpr(arg));
      }
      args.push(value);
      await this.host.call(target.name, args, this);
      return;
    }
    throw new VMError("invalid assignment target");
  }
}

function objectForSend(kind: string): string {
  if (kind.startsWith("sendtostage")) {
    return "stage";
  }
  if (kind.startsWith("sendtoset")) {
    return "set";
  }
  if (kind.startsWith("sendtoboot")) {
    return "boot";
  }
  if (kind.startsWith("sendtoactor")) {
    return "actor";
  }
  if (kind.startsWith("sendtopuppet")) {
    return "puppet";
  }
  if (kind.startsWith("sendtoshop")) {
    return "shop";
  }
  if (kind.startsWith("sendtocast")) {
    return "cast";
  }
  if (kind.startsWith("sendtoscene")) {
    return "scene";
  }
  if (kind.startsWith("sendtoprop")) {
    return "prop";
  }
  if (kind.startsWith("sendtoflat")) {
    return "flat";
  }
  if (kind.startsWith("sendtobutton")) {
    return "button";
  }
  if (kind.startsWith("sendtofloor")) {
    return "floor";
  }
  return "boot";
}

export function truthy(value: Value): boolean {
  if (value === undefined || value === false || value === 0 || value === "") {
    return false;
  }
  return true;
}

export function num(value: Value): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function str(value: Value): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return `${value.x},${value.y},${value.z}`;
  }
  return String(value);
}

export function eq(a: Value, b: Value): boolean {
  if (typeof a === "string" || typeof b === "string") {
    return str(a).toLowerCase() === str(b).toLowerCase();
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return truthy(a) === truthy(b);
  }
  return num(a) === num(b);
}

function binary(op: string, left: Value, right: Value): Value {
  switch (op) {
    case "+":
      return num(left) + num(right);
    case "-":
      return num(left) - num(right);
    case "*":
      return num(left) * num(right);
    case "/":
      return num(right) === 0 ? 0 : Math.trunc(num(left) / num(right));
    case "@":
      return str(left) + str(right);
    case "&":
    case "and":
      return truthy(left) && truthy(right);
    case "|":
    case "or":
      return truthy(left) || truthy(right);
    case "=":
      return eq(left, right);
    case "!=":
      return !eq(left, right);
    case ">":
      return num(left) > num(right);
    case "<":
      return num(left) < num(right);
    case ">=":
      return num(left) >= num(right);
    case "<=":
      return num(left) <= num(right);
    default:
      return 0;
  }
}

export function stringify(value: Value): string {
  if (value === undefined) {
    return "0";
  }
  if (typeof value === "object") {
    return `${value.x},${value.y},${value.z}`;
  }
  return String(value);
}
