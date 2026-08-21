export type TokenKind = "opcode" | "string" | "integer" | "variable" | "break";

export interface Token {
  off: number;
  cmd: number;
  kind: TokenKind;
  name?: string;
  value?: string | number;
  indent?: number;
  printed?: string;
}

export interface ScriptFile {
  name: string;
  tokens: Token[];
}

export type Expr =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "var"; name: string }
  | { type: "bool"; value: boolean }
  | { type: "me" }
  | { type: "target" }
  | { type: "unary"; op: "not" | "-"; inner: Expr }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "call"; name: string; args: Expr[] };

export type Stmt =
  | { type: "global"; names: string[] }
  | { type: "local"; names: string[] }
  | { type: "assign"; target: Expr; value: Expr }
  | { type: "call"; call: Extract<Expr, { type: "call" }> }
  | { type: "if"; cond: Expr; then: Stmt[]; else?: Stmt[] }
  | { type: "switch"; expr: Expr; cases: { match: Expr; body: Stmt[] }[] }
  | { type: "while"; cond: Expr; body: Stmt[] }
  | { type: "for"; name: string; from: Expr; to: Expr; step: Expr; body: Stmt[] }
  | { type: "return"; value?: Expr }
  | { type: "exitcode" }
  | { type: "passcode" }
  | { type: "dumpglobal"; names: string[] };

export interface Proc {
  name: string;
  params: string[];
  body: Stmt[];
}

const KW = {
  code: 4001,
  global: 4002,
  local: 4003,
  endcode: 4004,
  exitcode: 4005,
  if: 4006,
  endif: 4007,
  else: 4008,
  switch: 4009,
  endswitch: 4010,
  case: 4011,
  for: 4012,
  to: 4013,
  step: 4014,
  endfor: 4015,
  while: 4016,
  endwhile: 4017,
  lparen: 4018,
  rparen: 4019,
  comma: 4020,
  true: 4021,
  false: 4022,
  not: 4023,
  return: 4024,
  passcode: 4025,
  me: 4026,
  target: 4027,
  dumpglobal: 4029,
} as const;

const OP_PREC: Record<number, number> = {
  8006: 1, // |
  8005: 2, // &
  8008: 3, // =
  8009: 3, // !=
  8010: 3, // >
  8011: 3, // <
  8012: 3, // >=
  8013: 3, // <=
  8007: 4, // @
  8001: 5, // +
  8002: 5, // -
  8003: 6, // *
  8004: 6, // /
};

export class ParseError extends Error {
  constructor(
    message: string,
    readonly token?: Token,
  ) {
    super(token ? `${message} (off ${token.off} cmd ${token.cmd})` : message);
  }
}

export function parseScript(tokens: Token[]): Proc[] {
  const p = new Parser(tokens);
  return p.parseFile();
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  parseFile(): Proc[] {
    const procs: Proc[] = [];
    while (!this.done()) {
      this.skipNoise();
      if (this.done()) {
        break;
      }
      if (!this.isCmd(KW.code)) {
        this.i += 1;
        continue;
      }
      procs.push(this.parseProc());
    }
    return procs;
  }

  private parseProc(): Proc {
    this.expectCmd(KW.code);
    const name = this.expectName();
    const params: string[] = [];
    this.expectCmd(KW.lparen);
    while (!this.done() && !this.isCmd(KW.rparen)) {
      if (this.isCmd(KW.comma)) {
        this.i += 1;
        continue;
      }
      params.push(this.expectName());
    }
    this.expectCmd(KW.rparen);
    const body = this.parseBlock([KW.endcode]);
    this.expectCmd(KW.endcode);
    return { name, params, body };
  }

  private parseBlock(stops: number[]): Stmt[] {
    const body: Stmt[] = [];
    while (!this.done() && !this.isAnyCmd(stops)) {
      this.skipBreaks();
      if (this.done() || this.isAnyCmd(stops)) {
        break;
      }
      if (this.isComment()) {
        this.skipComment();
        continue;
      }
      body.push(this.parseStmt(stops));
    }
    return body;
  }

  private parseStmt(stops: number[]): Stmt {
    this.skipBreaks();
    if (this.isCmd(KW.global)) {
      return { type: "global", names: this.parseNameList() };
    }
    if (this.isCmd(KW.local)) {
      return { type: "local", names: this.parseNameList() };
    }
    if (this.isCmd(KW.dumpglobal)) {
      this.i += 1;
      return { type: "dumpglobal", names: this.parseBareNames() };
    }
    if (this.isCmd(KW.if)) {
      return this.parseIf();
    }
    if (this.isCmd(KW.switch)) {
      return this.parseSwitch();
    }
    if (this.isCmd(KW.while)) {
      return this.parseWhile();
    }
    if (this.isCmd(KW.for)) {
      return this.parseFor();
    }
    if (this.isCmd(KW.return)) {
      this.i += 1;
      if (this.atBreak() || this.isAnyCmd(stops) || this.isCmd(KW.endcode)) {
        return { type: "return" };
      }
      return { type: "return", value: this.parseExpr() };
    }
    if (this.isCmd(KW.exitcode)) {
      this.i += 1;
      return { type: "exitcode" };
    }
    if (this.isCmd(KW.passcode)) {
      this.i += 1;
      return { type: "passcode" };
    }
    const left = this.parseUnary();
    this.skipBreaks();
    if (this.isOp("=") && this.isLvalue(left)) {
      this.i += 1;
      return { type: "assign", target: left, value: this.parseExpr() };
    }
    if (left.type === "call") {
      return { type: "call", call: left };
    }
    throw new ParseError("expected statement", this.peek());
  }

  private parseIf(): Stmt {
    this.expectCmd(KW.if);
    const cond = this.parseExpr();
    const then = this.parseBlock([KW.else, KW.endif]);
    let els: Stmt[] | undefined;
    if (this.isCmd(KW.else)) {
      this.i += 1;
      els = this.parseBlock([KW.endif]);
    }
    this.expectCmd(KW.endif);
    return { type: "if", cond, then, else: els };
  }

  private parseSwitch(): Stmt {
    this.expectCmd(KW.switch);
    const expr = this.parseExpr();
    const cases: { match: Expr; body: Stmt[] }[] = [];
    while (!this.done() && !this.isCmd(KW.endswitch)) {
      this.skipBreaks();
      if (this.isCmd(KW.endswitch)) {
        break;
      }
      this.expectCmd(KW.case);
      const match = this.parseExpr();
      const body = this.parseBlock([KW.case, KW.endswitch]);
      cases.push({ match, body });
    }
    this.expectCmd(KW.endswitch);
    return { type: "switch", expr, cases };
  }

  private parseWhile(): Stmt {
    this.expectCmd(KW.while);
    const cond = this.parseExpr();
    const body = this.parseBlock([KW.endwhile]);
    this.expectCmd(KW.endwhile);
    return { type: "while", cond, body };
  }

  private parseFor(): Stmt {
    this.expectCmd(KW.for);
    const name = this.expectName();
    if (!this.isOp("=")) {
      throw new ParseError("expected = in for", this.peek());
    }
    this.i += 1;
    const from = this.parseExpr();
    this.expectCmd(KW.to);
    const to = this.parseExpr();
    let step: Expr = { type: "num", value: 1 };
    if (this.isCmd(KW.step)) {
      this.i += 1;
      step = this.parseExpr();
    }
    const body = this.parseBlock([KW.endfor]);
    this.expectCmd(KW.endfor);
    return { type: "for", name, from, to, step, body };
  }

  private parseExpr(minPrec = 0): Expr {
    let left = this.parseUnary();
    while (!this.done()) {
      const tok = this.peek();
      if (!tok || tok.kind === "break") {
        break;
      }
      const prec = tok.kind === "opcode" ? (OP_PREC[tok.cmd] ?? 0) : 0;
      if (prec < minPrec || prec === 0) {
        break;
      }
      const op = this.opName(tok);
      this.i += 1;
      const right = this.parseExpr(prec + 1);
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseUnary(): Expr {
    this.skipBreaks();
    if (this.isCmd(KW.not)) {
      this.i += 1;
      return { type: "unary", op: "not", inner: this.parseUnary() };
    }
    if (this.isOp("-")) {
      this.i += 1;
      return { type: "unary", op: "-", inner: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    this.skipBreaks();
    const tok = this.peek();
    if (!tok) {
      throw new ParseError("unexpected end of script");
    }
    if (this.isCmd(KW.lparen)) {
      this.i += 1;
      const inner = this.parseExpr();
      this.expectCmd(KW.rparen);
      return inner;
    }
    if (this.isCmd(KW.true)) {
      this.i += 1;
      return { type: "bool", value: true };
    }
    if (this.isCmd(KW.false)) {
      this.i += 1;
      return { type: "bool", value: false };
    }
    if (this.isCmd(KW.me)) {
      this.i += 1;
      return { type: "me" };
    }
    if (this.isCmd(KW.target)) {
      this.i += 1;
      return { type: "target" };
    }
    if (tok.kind === "integer") {
      this.i += 1;
      return { type: "num", value: Number(tok.value ?? 0) };
    }
    if (tok.kind === "string") {
      this.i += 1;
      return { type: "str", value: String(tok.value ?? "") };
    }
    const name = this.tryName();
    if (name !== undefined) {
      this.skipBreaks();
      if (this.isCmd(KW.lparen)) {
        return { type: "call", name, args: this.parseArgs() };
      }
      return { type: "var", name };
    }
    throw new ParseError("expected expression", tok);
  }

  private parseArgs(): Expr[] {
    this.expectCmd(KW.lparen);
    const args: Expr[] = [];
    while (!this.done() && !this.isCmd(KW.rparen)) {
      this.skipBreaks();
      if (this.isCmd(KW.rparen)) {
        break;
      }
      if (this.isCmd(KW.comma)) {
        this.i += 1;
        continue;
      }
      args.push(this.parseExpr());
    }
    this.expectCmd(KW.rparen);
    return args;
  }

  private parseNameList(): string[] {
    this.i += 1;
    return this.parseBareNames();
  }

  private parseBareNames(): string[] {
    const names: string[] = [];
    while (!this.done() && !this.atBreak()) {
      if (this.isCmd(KW.comma)) {
        this.i += 1;
        continue;
      }
      const name = this.tryName();
      if (name === undefined) {
        break;
      }
      names.push(name);
    }
    return names;
  }

  private isLvalue(expr: Expr): boolean {
    return expr.type === "var" || expr.type === "call";
  }

  private skipNoise(): void {
    while (!this.done()) {
      this.skipBreaks();
      if (this.done() || this.isCmd(KW.code)) {
        return;
      }
      if (this.isComment()) {
        this.skipComment();
        continue;
      }
      this.i += 1;
    }
  }

  private skipComment(): void {
    this.i += 2;
    while (!this.done() && !this.atBreak()) {
      this.i += 1;
    }
  }

  private isComment(): boolean {
    const a = this.peek();
    const b = this.tokens[this.i + 1];
    return a?.kind === "opcode" && a.cmd === 8004 && b?.kind === "opcode" && b.cmd === 8004;
  }

  private skipBreaks(): void {
    while (this.peek()?.kind === "break") {
      this.i += 1;
    }
  }

  private atBreak(): boolean {
    return this.peek()?.kind === "break";
  }

  private tryName(): string | undefined {
    const tok = this.peek();
    if (!tok) {
      return undefined;
    }
    if (tok.kind === "variable") {
      this.i += 1;
      return String(tok.value ?? "");
    }
    if (tok.kind === "opcode" && tok.name && !this.isKeyword(tok.cmd)) {
      this.i += 1;
      return tok.name;
    }
    return undefined;
  }

  private expectName(): string {
    const name = this.tryName();
    if (name === undefined) {
      throw new ParseError("expected name", this.peek());
    }
    return name;
  }

  private isKeyword(cmd: number): boolean {
    return (
      cmd === KW.code ||
      cmd === KW.global ||
      cmd === KW.local ||
      cmd === KW.endcode ||
      cmd === KW.exitcode ||
      cmd === KW.if ||
      cmd === KW.endif ||
      cmd === KW.else ||
      cmd === KW.switch ||
      cmd === KW.endswitch ||
      cmd === KW.case ||
      cmd === KW.for ||
      cmd === KW.to ||
      cmd === KW.step ||
      cmd === KW.endfor ||
      cmd === KW.while ||
      cmd === KW.endwhile ||
      cmd === KW.lparen ||
      cmd === KW.rparen ||
      cmd === KW.comma ||
      cmd === KW.true ||
      cmd === KW.false ||
      cmd === KW.not ||
      cmd === KW.return ||
      cmd === KW.passcode ||
      cmd === KW.me ||
      cmd === KW.target ||
      cmd === KW.dumpglobal
    );
  }

  private isOp(name: string): boolean {
    const tok = this.peek();
    return tok?.kind === "opcode" && (tok.name === name || tok.printed === name);
  }

  private opName(tok: Token): string {
    return tok.name ?? tok.printed ?? `op${tok.cmd}`;
  }

  private isCmd(cmd: number): boolean {
    return this.peek()?.kind === "opcode" && this.peek()?.cmd === cmd;
  }

  private isAnyCmd(cmds: number[]): boolean {
    const tok = this.peek();
    return tok?.kind === "opcode" && cmds.includes(tok.cmd);
  }

  private expectCmd(cmd: number): void {
    this.skipBreaks();
    if (!this.isCmd(cmd)) {
      throw new ParseError(`expected cmd ${cmd}`, this.peek());
    }
    this.i += 1;
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  private done(): boolean {
    return this.i >= this.tokens.length;
  }
}
