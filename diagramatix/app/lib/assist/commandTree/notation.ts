/**
 * The command-tree notation — what Voice Assist Help is built from.
 *
 * Plan: new features/voice-assist-help-plan-2026-10-01.md (slice 1).
 *
 * A pattern is one line of words that says what may be spoken, word by word:
 *
 *     rename <existing_element_name> (to|as) <new_element_name>
 *     move <existing_element_name> [<number> {step_words}] {directions}
 *
 *   word            a literal word
 *   a|b|c           ONE of these (single items, no spaces round the bars)
 *   ( x y | z )     a group: inside parentheses a bar ALWAYS separates branches,
 *                   and a branch may be several items
 *   [ x y ]         optional — shown in [ ] by the help
 *   <slot>          a variable (<existing_element_name>, <number>, <target> …);
 *                   what it means is defined in the conventions, not here
 *   {list}          a named list of words or phrases ({directions}, {type_words})
 *   # …             a comment, to the end of the line
 *
 * Patterns sit in sections:
 *
 *   ## commands     (the default — what can be said with nothing open)
 *   ## assist       only while Assist ghost suggestions are on screen
 *   ## voice        the microphone words (stop, yes, no) — not parser commands
 *   ## flow <id>    what can be said while a guided flow is open
 *
 *   ## aliases     word: alias alias — shown in grey beside the word in the first-words list
 *   ## hidden      first words the list never shows (they still work)
 *
 * A pattern line may end with  @on pool lane  (the kinds it is about — see kinds.ts) or  @nosel  (it never
 * acts on a selection). With something selected the help shows only the commands that apply to it.
 *
 * Pure. No React, no DOM.
 */
import { expandKindToken } from "./kinds";

export type Node =
  | { t: "word"; w: string }
  | { t: "list"; name: string }
  | { t: "slot"; name: string }
  | { t: "alt"; branches: Node[][] }
  | { t: "opt"; seq: Node[] };

export interface Pattern {
  /** The source line, trimmed — shown in the tile and in reports. */
  source: string;
  /** 1-based line number in the text it came from. */
  line: number;
  seq: Node[];
  /**
   * `@on pool lane` at the end of the line: the kinds (or kind groups — see kinds.ts) of thing this command is
   * about. When something is selected, the help shows the command only if the selection is one of them.
   */
  on?: string[];
  /** `@nosel` at the end of the line: the command never acts on a selection — hidden once something is selected. */
  noSel?: boolean;
}

export interface NotationError {
  line: number;
  message: string;
}

export interface Sections {
  /** Section id ("commands", "assist", "voice", "flow <id>") → its patterns, in order. */
  sections: Record<string, Pattern[]>;
  /**
   * `## aliases` — lines like `add: insert create put`. The first word is the one shown; the rest are shown in
   * grey beside it in the first-words list instead of as words of their own.
   */
  aliases: Record<string, string[]>;
  /** `## hidden` — first words the list never shows (they still work). */
  hidden: string[];
  errors: NotationError[];
}

const CHUNK = /\[|\]|\(|\)|[^\s\[\]()]+/g;
const WORD = /^[a-z0-9][a-z0-9'’.\-]*$/i;

class Reader {
  private i = 0;
  constructor(private readonly chunks: string[]) {}
  peek(): string | undefined { return this.chunks[this.i]; }
  next(): string | undefined { return this.chunks[this.i++]; }
  done(): boolean { return this.i >= this.chunks.length; }
}

function atom(raw: string): Node {
  if (raw.startsWith("<") && raw.endsWith(">") && raw.length > 2) return { t: "slot", name: raw.slice(1, -1) };
  if (raw.startsWith("{") && raw.endsWith("}") && raw.length > 2) return { t: "list", name: raw.slice(1, -1) };
  if (!WORD.test(raw)) throw new Error(`"${raw}" is not a word, <slot> or {list}`);
  return { t: "word", w: raw.toLowerCase() };
}

/** One chunk outside parentheses: `word`, or a tight alternation `a|b|c` of single atoms. */
function chunkNode(raw: string): Node {
  if (raw === "|") throw new Error("a bar needs parentheses round it, or no spaces: (a b | c) or a|b");
  if (!raw.includes("|")) return atom(raw);
  const parts = raw.split("|");
  if (parts.some((p) => !p)) throw new Error(`"${raw}" has an empty choice`);
  return { t: "alt", branches: parts.map((p) => [atom(p)]) };
}

/** A sequence, up to (not including) a closing bracket/paren, or the end. */
function readSeq(r: Reader, close: "]" | ")" | null, inParens: boolean): Node[][] {
  const branches: Node[][] = [[]];
  for (;;) {
    const c = r.peek();
    if (c === undefined) {
      if (close) throw new Error(`missing ${close}`);
      break;
    }
    if (c === "]" || c === ")") {
      if (c !== close) throw new Error(`unexpected ${c}`);
      r.next();
      break;
    }
    r.next();
    if (c === "[") {
      const inner = readSeq(r, "]", false)[0];
      if (!inner.length) throw new Error("empty [ ]");
      branches[branches.length - 1].push({ t: "opt", seq: inner });
    } else if (c === "(") {
      const bs = readSeq(r, ")", true);
      if (bs.some((b) => !b.length)) throw new Error("empty choice in ( )");
      branches[branches.length - 1].push(bs.length === 1 ? { t: "alt", branches: [bs[0]] } : { t: "alt", branches: bs });
    } else if (inParens && c.includes("|")) {
      // Inside parentheses a bar separates branches — even in the middle of a chunk.
      const parts = c.split("|");
      parts.forEach((p, k) => {
        if (k > 0) branches.push([]);
        if (p) branches[branches.length - 1].push(atom(p));
      });
    } else {
      branches[branches.length - 1].push(chunkNode(c));
    }
  }
  return branches;
}

/** Parse ONE pattern line. Throws Error with a plain-English message. */
export function parsePattern(source: string): Node[] {
  const text = source.replace(/#.*$/, "").trim();
  const chunks = text.match(CHUNK) ?? [];
  const r = new Reader(chunks);
  const seq = readSeq(r, null, false)[0];
  if (!seq.length) throw new Error("empty pattern");
  return seq;
}

/** Parse a whole block of text into sections. Never throws: problems come back as `errors`. */
/** Split a trailing `@on kind kind` / `@nosel` off a pattern line. */
function splitAnnotation(t: string): { text: string; on?: string[]; noSel?: boolean; error?: string } {
  const m = t.match(/^(.*?)\s+@(nosel|on\s+[a-z0-9 \-]+?)\s*$/i);
  if (!m) return { text: t };
  if (m[2].toLowerCase() === "nosel") return { text: m[1].trim(), noSel: true };
  const tokens = m[2].replace(/^on\s+/i, "").trim().split(/\s+/).map((x) => x.toLowerCase());
  const bad = tokens.find((x) => !expandKindToken(x));
  if (bad) return { text: m[1].trim(), error: `@on: "${bad}" is not a kind or a group of kinds` };
  return { text: m[1].trim(), on: tokens };
}

export function parseSections(text: string): Sections {
  const sections: Record<string, Pattern[]> = { commands: [] };
  const aliases: Record<string, string[]> = {};
  const hidden: string[] = [];
  const errors: NotationError[] = [];
  let current = "commands";
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const trimmed = raw.trim();
    // A line that STARTS with ## is a section header (and may carry a trailing # comment);
    // anything else has its # comment stripped.
    const h = trimmed.match(/^##\s*([^#]+?)\s*(?:#.*)?$/);
    const t = h ? trimmed : raw.replace(/#.*$/, "").trim();
    if (!t) return;
    if (h) {
      const name = h[1].trim().toLowerCase().replace(/\s+/g, " ");
      if (!/^(commands|assist|voice|aliases|hidden|flow [a-z0-9-]+)$/.test(name)) {
        errors.push({ line, message: `unknown section "${h[1].trim()}" — use commands, assist, voice, aliases, hidden or flow <id>` });
        current = "?";
        return;
      }
      current = name;
      sections[current] ??= [];
      return;
    }
    if (current === "?") return;
    if (current === "aliases") {
      const a = t.match(/^([a-z0-9'’.\-]+)\s*:\s*(.+)$/i);
      if (!a) { errors.push({ line, message: "an alias line is  word: alias alias" }); return; }
      const main = a[1].toLowerCase();
      aliases[main] = [...(aliases[main] ?? []), ...a[2].trim().toLowerCase().split(/\s+/)];
      return;
    }
    if (current === "hidden") {
      hidden.push(...t.toLowerCase().split(/\s+/).filter(Boolean));
      return;
    }
    try {
      const a = splitAnnotation(t);
      if (a.error) { errors.push({ line, message: a.error }); return; }
      sections[current].push({ source: t, line, seq: parsePattern(a.text), ...(a.on ? { on: a.on } : {}), ...(a.noSel ? { noSel: true } : {}) });
    } catch (e) {
      errors.push({ line, message: (e as Error).message });
    }
  });
  return { sections, aliases, hidden, errors };
}
