/**
 * A tiny, SAFE expression language for BPSim PropertyParameters / Condition.
 *
 * The BPSim examples carry token properties and route on expressions like
 * `getProperty('noOfIssues') - 1` and `getProperty('noOfIssues') > 0` (BPSim
 * uses `=` for equality). We need to evaluate those WITHOUT `eval`/`Function`
 * or any access to the host — so this is a hand-written tokenizer + recursive-
 * descent parser + interpreter over a fixed function whitelist and a per-token
 * property bag. No globals, no member access, no calls outside the whitelist.
 */

export type Value = number | string | boolean;

/** Per-token property bag carried through the simulation. */
export type PropertyBag = Record<string, Value>;

export interface EvalContext {
  props: PropertyBag;
}

// ── AST ──────────────────────────────────────────────────────────────────
type Node =
  | { t: "lit"; v: Value }
  | { t: "var"; name: string }
  | { t: "call"; name: string; args: Node[] }
  | { t: "unary"; op: string; e: Node }
  | { t: "bin"; op: string; l: Node; r: Node };

// ── Tokenizer ──────────────────────────────────────────────────────────────
type Tok = { k: "num" | "str" | "id" | "op" | "punc"; v: string };

const TWO_CHAR = new Set(["<=", ">=", "==", "!=", "<>", "&&", "||"]);
const ONE_CHAR = new Set(["+", "-", "*", "/", "%", "<", ">", "=", "!", "(", ")", ","]);

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c >= "0" && c <= "9") {
      let j = i + 1;
      while (j < src.length && ((src[j] >= "0" && src[j] <= "9") || src[j] === ".")) j++;
      toks.push({ k: "num", v: src.slice(i, j) }); i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1; let s = "";
      while (j < src.length && src[j] !== c) { s += src[j]; j++; }
      if (j >= src.length) throw new Error("Unterminated string in expression");
      toks.push({ k: "str", v: s }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ k: "id", v: src.slice(i, j) }); i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR.has(two)) { toks.push({ k: "op", v: two }); i += 2; continue; }
    if (ONE_CHAR.has(c)) {
      toks.push({ k: c === "(" || c === ")" || c === "," ? "punc" : "op", v: c });
      i++; continue;
    }
    throw new Error(`Unexpected character '${c}' in expression`);
  }
  return toks;
}

// ── Parser (precedence climbing) ───────────────────────────────────────────
class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}
  private peek(): Tok | undefined { return this.toks[this.p]; }
  private next(): Tok | undefined { return this.toks[this.p++]; }
  private eat(v: string): void {
    const t = this.next();
    if (!t || t.v !== v) throw new Error(`Expected '${v}' in expression`);
  }
  private isKw(t: Tok | undefined, kw: string): boolean { return !!t && t.k === "id" && t.v.toLowerCase() === kw; }

  parse(): Node {
    const e = this.parseOr();
    if (this.peek()) throw new Error("Unexpected trailing tokens in expression");
    return e;
  }
  private parseOr(): Node {
    let l = this.parseAnd();
    for (;;) {
      const t = this.peek();
      if ((t && t.v === "||") || this.isKw(t, "or")) { this.next(); l = { t: "bin", op: "or", l, r: this.parseAnd() }; }
      else break;
    }
    return l;
  }
  private parseAnd(): Node {
    let l = this.parseEquality();
    for (;;) {
      const t = this.peek();
      if ((t && t.v === "&&") || this.isKw(t, "and")) { this.next(); l = { t: "bin", op: "and", l, r: this.parseEquality() }; }
      else break;
    }
    return l;
  }
  private parseEquality(): Node {
    let l = this.parseComparison();
    for (;;) {
      const t = this.peek();
      if (t && t.k === "op" && (t.v === "=" || t.v === "==" || t.v === "!=" || t.v === "<>")) {
        this.next(); l = { t: "bin", op: t.v === "!=" || t.v === "<>" ? "!=" : "==", l, r: this.parseComparison() };
      } else break;
    }
    return l;
  }
  private parseComparison(): Node {
    let l = this.parseAdditive();
    for (;;) {
      const t = this.peek();
      if (t && t.k === "op" && (t.v === "<" || t.v === "<=" || t.v === ">" || t.v === ">=")) {
        this.next(); l = { t: "bin", op: t.v, l, r: this.parseAdditive() };
      } else break;
    }
    return l;
  }
  private parseAdditive(): Node {
    let l = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t && t.k === "op" && (t.v === "+" || t.v === "-")) { this.next(); l = { t: "bin", op: t.v, l, r: this.parseMultiplicative() }; }
      else break;
    }
    return l;
  }
  private parseMultiplicative(): Node {
    let l = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t && t.k === "op" && (t.v === "*" || t.v === "/" || t.v === "%")) { this.next(); l = { t: "bin", op: t.v, l, r: this.parseUnary() }; }
      else break;
    }
    return l;
  }
  private parseUnary(): Node {
    const t = this.peek();
    if (t && t.k === "op" && (t.v === "-" || t.v === "!")) { this.next(); return { t: "unary", op: t.v, e: this.parseUnary() }; }
    if (this.isKw(t, "not")) { this.next(); return { t: "unary", op: "!", e: this.parseUnary() }; }
    return this.parsePrimary();
  }
  private parsePrimary(): Node {
    const t = this.next();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.k === "num") return { t: "lit", v: parseFloat(t.v) };
    if (t.k === "str") return { t: "lit", v: t.v };
    if (t.v === "(") { const e = this.parseOr(); this.eat(")"); return e; }
    if (t.k === "id") {
      const low = t.v.toLowerCase();
      if (low === "true") return { t: "lit", v: true };
      if (low === "false") return { t: "lit", v: false };
      if (this.peek()?.v === "(") {
        this.next();
        const args: Node[] = [];
        if (this.peek()?.v !== ")") {
          args.push(this.parseOr());
          while (this.peek()?.v === ",") { this.next(); args.push(this.parseOr()); }
        }
        this.eat(")");
        return { t: "call", name: t.v, args };
      }
      return { t: "var", name: t.v };
    }
    throw new Error(`Unexpected token '${t.v}' in expression`);
  }
}

// ── Whitelisted functions (no host access) ─────────────────────────────────
const FUNCS: Record<string, (args: Value[], ctx: EvalContext) => Value> = {
  getproperty: (a, ctx) => {
    const name = String(a[0]);
    // Forgiving: a property that was never assigned reads as 0 rather than
    // throwing. An un-initialised per-token counter (e.g. a fresh event-
    // subprocess handler token that didn't inherit the parent's counter) then
    // behaves sensibly — arithmetic is 0-based, comparisons like `> 0` are
    // false — instead of crashing the whole run. The pre-run readiness check
    // (checkSimReadiness) surfaces properties that are USED but never
    // initialised so the user can set them up before running.
    return name in ctx.props ? ctx.props[name] : 0;
  },
  min: (a) => Math.min(...a.map(Number)),
  max: (a) => Math.max(...a.map(Number)),
  abs: (a) => Math.abs(Number(a[0])),
  floor: (a) => Math.floor(Number(a[0])),
  ceil: (a) => Math.ceil(Number(a[0])),
  round: (a) => Math.round(Number(a[0])),
  sqrt: (a) => Math.sqrt(Number(a[0])),
};

function evalNode(n: Node, ctx: EvalContext): Value {
  switch (n.t) {
    case "lit": return n.v;
    case "var": {
      if (n.name in ctx.props) return ctx.props[n.name];
      throw new Error(`Unknown identifier '${n.name}'`);
    }
    case "call": {
      const fn = FUNCS[n.name.toLowerCase()];
      if (!fn) throw new Error(`Unknown function '${n.name}'`);
      return fn(n.args.map((a) => evalNode(a, ctx)), ctx);
    }
    case "unary": {
      const v = evalNode(n.e, ctx);
      return n.op === "-" ? -Number(v) : !truthy(v);
    }
    case "bin": {
      if (n.op === "and") return truthy(evalNode(n.l, ctx)) && truthy(evalNode(n.r, ctx));
      if (n.op === "or") return truthy(evalNode(n.l, ctx)) || truthy(evalNode(n.r, ctx));
      const l = evalNode(n.l, ctx), r = evalNode(n.r, ctx);
      switch (n.op) {
        case "+": return typeof l === "string" || typeof r === "string" ? String(l) + String(r) : Number(l) + Number(r);
        case "-": return Number(l) - Number(r);
        case "*": return Number(l) * Number(r);
        case "/": return Number(l) / Number(r);
        case "%": return Number(l) % Number(r);
        case "<": return Number(l) < Number(r);
        case "<=": return Number(l) <= Number(r);
        case ">": return Number(l) > Number(r);
        case ">=": return Number(l) >= Number(r);
        case "==": return l === r || Number(l) === Number(r);
        case "!=": return !(l === r || Number(l) === Number(r));
      }
      throw new Error(`Unknown operator '${n.op}'`);
    }
  }
}

function truthy(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v.length > 0;
}

/** A parsed expression ready to evaluate against many contexts. */
export interface CompiledExpr {
  readonly source: string;
  eval(ctx: EvalContext): Value;
  evalNumber(ctx: EvalContext): number;
  evalBool(ctx: EvalContext): boolean;
}

/** Parse `source` once; throws on syntax errors so they surface at validation. */
export function compileExpr(source: string): CompiledExpr {
  const ast = new Parser(tokenize(source)).parse();
  return {
    source,
    eval: (ctx) => evalNode(ast, ctx),
    evalNumber: (ctx) => Number(evalNode(ast, ctx)),
    evalBool: (ctx) => truthy(evalNode(ast, ctx)),
  };
}
