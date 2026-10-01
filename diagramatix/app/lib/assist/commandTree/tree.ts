/**
 * The command tree: given the words heard so far, what can come next?
 *
 * Plan: new features/voice-assist-bubble-help-plan-2026-10-01.md (slice 1).
 *
 * A LENS, not the parser (Paul's ruling, 2026-10-01). `parseCommand` is still what
 * acts on a command; this answers "what could be said next" for the bubble, and a
 * test keeps the two honest (tests/assist/command-tree-consistency.test.ts).
 *
 * The state is a pure function of the tokens, recomputed from scratch every time, so a
 * recogniser revising an interim word can never leave it stuck.
 *
 * How it walks: a state is the REST of a pattern (a list of nodes still to say), plus,
 * while a <variable> is taking words, which variable and what it has taken. Words are
 * matched exactly; a <variable> takes as many words as its convention allows, and at
 * every word BOTH "the variable goes on" and "the variable ended here" stay alive, so
 * "rename Review Claim to" is understood whether or not "to" could have been in a name.
 *
 * Pure.
 */
import type { Node, Pattern, Sections } from "./notation";
import { parsePattern, parseSections } from "./notation";
import { DISTANCE_WORDS, isNumberToken, NUMBER_WORD_SET, slotDefOf, type Conventions, type SlotDef } from "./conventions";
import { nameFits, type DiagramNames } from "./names";

export type Lists = Record<string, readonly string[]>;

export interface WalkContext {
  /**
   * Names on the diagram. When given, <existing_element_name> / <existing_label_name> take only
   * words that belong to a real name (or a pointing phrase); when absent they take any words.
   */
  names?: DiagramNames;
  /** Assist ghost suggestions are on screen — the "assist" section counts. */
  ghost?: boolean;
  /** A guided flow is open: ONLY that flow's patterns apply ("flow rename-pick" → "rename-pick"). */
  flow?: string | null;
  /** Include the microphone words (stop, yes, no). */
  voice?: boolean;
}

export interface NextItem {
  kind: "word" | "slot";
  /** The word, or the variable's name without brackets. */
  text: string;
  /** Said only if the speaker chooses to — shown in [ ]. */
  optional: boolean;
  /** For a variable that is already open: the speaker may keep going ("<new_element_name> …"). */
  more?: boolean;
}

export interface NextResult {
  /** At least one pattern still fits what was heard. */
  ok: boolean;
  next: NextItem[];
  /** The variable currently taking words, if any. */
  openSlot: string | null;
  /** What was heard is already a whole command (it could stop here). */
  complete: boolean;
}

interface Open { def: SlotDef; tokens: string[] }
/** `viaSlot`: a <variable> has taken words on the way here. A reading that used only command words is preferred for display. */
interface State { seq: Node[]; open?: Open; viaSlot?: boolean }
interface Head { kind: "word" | "slot"; text: string; rest: Node[]; optional: boolean }

const MAX_STATES = 400;
const wordNode = (w: string): Node => ({ t: "word", w });

export class CommandTree {
  readonly errors: { line: number; message: string }[] = [];
  private readonly sub = new Map<string, Node[]>();

  constructor(
    readonly sections: Sections["sections"],
    readonly conventions: Conventions,
    readonly lists: Lists,
    errors: { line: number; message: string }[] = [],
  ) {
    this.errors.push(...errors);
    for (const def of conventions) {
      if (def.kind !== "pattern") continue;
      try { this.sub.set(def.name, parsePattern(def.pattern ?? "")); }
      catch (e) { this.errors.push({ line: 0, message: `convention <${def.name}>: ${(e as Error).message}` }); }
    }
    this.validate();
  }

  /** Every <slot> and {list} a pattern uses must exist. */
  private validate(): void {
    const check = (seq: Node[], line: number, where: string) => {
      for (const n of seq) {
        if (n.t === "slot" && !slotDefOf(this.conventions, n.name)) this.errors.push({ line, message: `${where}: no convention for <${n.name}>` });
        else if (n.t === "list" && !this.lists[n.name]) this.errors.push({ line, message: `${where}: no list called {${n.name}}` });
        else if (n.t === "alt") n.branches.forEach((b) => check(b, line, where));
        else if (n.t === "opt") check(n.seq, line, where);
      }
    };
    for (const [id, ps] of Object.entries(this.sections)) for (const p of ps) check(p.seq, p.line, `${id}`);
    for (const [name, seq] of this.sub) check(seq, 0, `<${name}>`);
  }

  // ── expanding what can come next ─────────────────────────────────────────

  /**
   * The first things that can be said from `seq`, and whether it can END here.
   * `optN` is how many leading nodes are inside a [ ] — so a word is flagged optional
   * only when it is itself in the brackets, not when it merely follows them.
   */
  private expand(seq: Node[], optN: number): { heads: Head[]; end: boolean } {
    if (!seq.length) return { heads: [], end: true };
    const n = seq[0];
    const rest = seq.slice(1);
    const restOpt = Math.max(0, optN - 1);
    switch (n.t) {
      case "word":
        return { heads: [{ kind: "word", text: n.w, rest, optional: optN > 0 }], end: false };
      case "slot":
        return { heads: [{ kind: "slot", text: n.name, rest, optional: optN > 0 }], end: false };
      case "list": {
        const heads: Head[] = [];
        for (const phrase of this.lists[n.name] ?? []) {
          const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
          if (!words.length) continue;
          heads.push({ kind: "word", text: words[0], rest: [...words.slice(1).map(wordNode), ...rest], optional: optN > 0 });
        }
        return { heads, end: false };
      }
      case "alt": {
        const out = { heads: [] as Head[], end: false };
        for (const b of n.branches) {
          const e = this.expand([...b, ...rest], optN > 0 ? b.length + restOpt : 0);
          out.heads.push(...e.heads);
          out.end ||= e.end;
        }
        return out;
      }
      case "opt": {
        const taken = this.expand([...n.seq, ...rest], n.seq.length + restOpt);
        const skipped = this.expand(rest, restOpt);
        return { heads: [...taken.heads, ...skipped.heads], end: taken.end || skipped.end };
      }
    }
  }

  // ── variables ────────────────────────────────────────────────────────────

  /** Could `tokens` be (the start of) what this variable takes? */
  private slotOk(def: SlotDef, tokens: string[], ctx: WalkContext): boolean {
    switch (def.kind) {
      case "free":
        return tokens.length <= (def.maxWords ?? 12);
      case "names": {
        if (tokens.length > (def.maxWords ?? 8)) return false;
        // With the diagram's names known, a name is a real name (or a pointing phrase). Without
        // them (no diagram to ask) any words may be a name — the lenient reading.
        const list = ctx.names ? (def.source === "labels" ? ctx.names.labels : ctx.names.elements) : null;
        return list ? nameFits(tokens, list).ok : true;
      }
      case "number":
        return tokens.length <= 2 && tokens.every(isNumberToken);
      case "distance":
        return tokens.length <= (def.maxWords ?? 10)
          && tokens.every((t) => isNumberToken(t) || DISTANCE_WORDS.has(t) || /^\d+(?:\.\d+)?(?:px)?$/.test(t));
      case "pattern": {
        const seq = this.sub.get(def.name);
        return !!seq && this.walkSeq(seq, tokens, ctx).length > 0;
      }
    }
  }

  /** Could the variable end after `tokens`? */
  private slotComplete(def: SlotDef, tokens: string[], ctx: WalkContext): boolean {
    if (!tokens.length) return false;
    switch (def.kind) {
      case "free":
        return true;
      case "names": {
        const list = ctx.names ? (def.source === "labels" ? ctx.names.labels : ctx.names.elements) : null;
        return list ? nameFits(tokens, list).complete : true;
      }
      case "number":
        return tokens.every(isNumberToken);
      case "distance": {
        const last = tokens[tokens.length - 1];
        return !["and", "by", "a", "an", "half", "more", "again"].includes(last) && tokens.some((t) => !["a", "an", "and", "by", "more", "again"].includes(t));
      }
      case "pattern": {
        const seq = this.sub.get(def.name);
        return !!seq && this.walkSeq(seq, tokens, ctx).some((s) => this.stateCanEnd(s, ctx));
      }
    }
  }

  /** Could the variable take another word after `tokens`? (For the "…" the bubble shows.) */
  private slotMore(def: SlotDef, tokens: string[], ctx: WalkContext): boolean {
    switch (def.kind) {
      case "free": return tokens.length < (def.maxWords ?? 12);
      case "names": return tokens.length < (def.maxWords ?? 8);
      case "number": return tokens.length < 2 && ["twenty", "thirty", "forty", "fourty", "fifty", "sixty", "seventy", "eighty", "ninety"].includes(tokens[0] ?? "");
      case "distance": return tokens.length < (def.maxWords ?? 10);
      case "pattern": {
        const seq = this.sub.get(def.name);
        if (!seq) return false;
        return this.walkSeq(seq, tokens, ctx).some((s) => this.stateHasHeads(s, ctx));
      }
    }
  }

  private stateCanEnd(s: State, ctx: WalkContext): boolean {
    if (s.open && !this.slotComplete(s.open.def, s.open.tokens, ctx)) return false;
    return this.expand(s.seq, 0).end;
  }

  private stateHasHeads(s: State, ctx: WalkContext): boolean {
    if (s.open && this.slotMore(s.open.def, s.open.tokens, ctx)) return true;
    if (s.open && !this.slotComplete(s.open.def, s.open.tokens, ctx)) return false;
    return this.expand(s.seq, 0).heads.length > 0;
  }

  // ── walking the words ────────────────────────────────────────────────────

  private stepPlain(st: State, token: string, ctx: WalkContext): State[] {
    const out: State[] = [];
    for (const h of this.expand(st.seq, 0).heads) {
      if (h.kind === "word") {
        if (h.text === token) out.push({ seq: h.rest, ...(st.viaSlot ? { viaSlot: true } : {}) });
      } else {
        const def = slotDefOf(this.conventions, h.text);
        if (def && this.slotOk(def, [token], ctx)) out.push({ seq: h.rest, open: { def, tokens: [token] }, viaSlot: true });
      }
    }
    return out;
  }

  private step(states: State[], token: string, ctx: WalkContext): State[] {
    const out: State[] = [];
    for (const st of states) {
      if (st.open) {
        const toks = [...st.open.tokens, token];
        if (this.slotOk(st.open.def, toks, ctx)) out.push({ seq: st.seq, open: { def: st.open.def, tokens: toks }, viaSlot: true });
        // …or the variable ended before this word, and this word is what follows it.
        if (this.slotComplete(st.open.def, st.open.tokens, ctx)) out.push(...this.stepPlain({ seq: st.seq, viaSlot: true }, token, ctx));
      } else {
        out.push(...this.stepPlain(st, token, ctx));
      }
      if (out.length > MAX_STATES) return out.slice(0, MAX_STATES);
    }
    return out;
  }

  private walkSeq(seq: Node[], tokens: readonly string[], ctx: WalkContext): State[] {
    return this.walkFrom([{ seq }], tokens, ctx);
  }

  private walkFrom(initial: State[], tokens: readonly string[], ctx: WalkContext): State[] {
    let states = initial;
    for (const t of tokens) {
      states = this.step(states, t, ctx);
      if (!states.length) break;
    }
    return states;
  }

  /** The patterns that apply right now. */
  activePatterns(ctx: WalkContext = {}): Pattern[] {
    if (ctx.flow) return this.sections[`flow ${ctx.flow}`] ?? [];
    return [
      ...(this.sections.commands ?? []),
      ...(ctx.ghost ? this.sections.assist ?? [] : []),
      ...(ctx.voice ? this.sections.voice ?? [] : []),
    ];
  }

  // ── the public questions ─────────────────────────────────────────────────

  /** What can come after these words? `[]` gives the first words. */
  next(tokens: readonly string[], ctx: WalkContext = {}): NextResult {
    const toks = tokens.map((t) => t.toLowerCase());
    const states = this.walkFrom(this.activePatterns(ctx).map((p) => ({ seq: p.seq })), toks, ctx);
    const items = new Map<string, NextItem>();
    let complete = false;
    let openSlot: string | null = null;
    const add = (it: NextItem) => {
      const key = `${it.kind}:${it.text}`;
      const have = items.get(key);
      if (!have) items.set(key, it);
      else { have.optional = have.optional && it.optional; have.more = have.more || it.more; }
    };
    // A reading that used only command words beats one that took some of the words as a NAME:
    // "move dividers" is the command, not "move" + an element called dividers (Paul,
    // 2026-10-01). The name reading is the fallback — it takes over the moment no command
    // word fits ("move top floor up" with a lane called Top Floor). What counts as COMPLETE
    // still looks at every reading, so no real command is ever called unfinished.
    const literal = states.filter((s) => !s.viaSlot);
    const shown = literal.length ? literal : states;
    for (const st of states) {
      if (st.open) {
        if (!this.slotComplete(st.open.def, st.open.tokens, ctx)) continue;
      }
      if (this.expand(st.seq, 0).end && toks.length) complete = true;
    }
    for (const st of shown) {
      if (st.open) {
        openSlot = st.open.def.name;
        if (this.slotMore(st.open.def, st.open.tokens, ctx)) add({ kind: "slot", text: st.open.def.name, optional: false, more: true });
        if (!this.slotComplete(st.open.def, st.open.tokens, ctx)) continue;
      }
      for (const h of this.expand(st.seq, 0).heads) add({ kind: h.kind, text: h.text, optional: h.optional });
    }
    return { ok: states.length > 0, next: [...items.values()], openSlot, complete };
  }

  firstWords(ctx: WalkContext = {}): NextItem[] {
    return this.next([], ctx).next;
  }

  /** Is this whole sentence a command the tree knows? */
  accepts(sentence: string, ctx: WalkContext = {}): boolean {
    const r = this.next(tokenise(sentence), ctx);
    return r.ok && r.complete;
  }

  /** Each first word, with the words that can follow it — the tile's summary table. */
  summary(ctx: WalkContext = {}): { word: string; next: NextItem[] }[] {
    return this.firstWords(ctx)
      .filter((i) => i.kind === "word")
      .map((i) => ({ word: i.text, next: this.next([i.text], ctx).next }))
      .sort((a, b) => a.word.localeCompare(b.word, "en", { sensitivity: "base" })); // A–Z, as the lists are
  }

  /**
   * Whole sentences the patterns describe, with every <variable> replaced by a sample —
   * the consistency tests feed these to `parseCommand`. `fill` gives the samples per
   * variable; a variable without samples is left as <name>. At most `cap` per pattern.
   */
  samples(section: string, fill: Record<string, readonly string[]>, cap = 300): { pattern: Pattern; sentence: string }[] {
    const out: { pattern: Pattern; sentence: string }[] = [];
    const gen = (seq: Node[], budget: number): string[][] => {
      let acc: string[][] = [[]];
      for (const n of seq) {
        let options: string[][];
        switch (n.t) {
          case "word": options = [[n.w]]; break;
          case "list": options = (this.lists[n.name] ?? []).map((p) => [p.toLowerCase()]); break;
          case "slot": options = (fill[n.name] ?? [`<${n.name}>`]).map((s) => [s]); break;
          case "alt": options = n.branches.flatMap((b) => gen(b, budget)); break;
          case "opt": options = [[], ...gen(n.seq, budget)]; break;
        }
        const next: string[][] = [];
        outer: for (const a of acc) for (const o of options) { next.push([...a, ...o]); if (next.length >= budget) break outer; }
        acc = next.length ? next : acc;
        if (acc.length > budget) acc = acc.slice(0, budget);
      }
      return acc;
    };
    for (const p of this.sections[section] ?? []) {
      for (const words of gen(p.seq, cap)) out.push({ pattern: p, sentence: words.join(" ").trim() });
    }
    return out;
  }
}

/** Words as the tree takes them: lower case, no end punctuation, split on spaces. */
export function tokenise(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/[,.;:!?]+$/g, ""))
    .filter(Boolean);
}

export { NUMBER_WORD_SET };

/** Compile pattern text. Problems are in `.errors` — the tree still works for the lines that parsed. */
export function compileTree(text: string, conventions: Conventions, lists: Lists): CommandTree {
  const { sections, errors } = parseSections(text);
  return new CommandTree(sections, conventions, lists, errors);
}
