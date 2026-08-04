/**
 * Abracadabra Mode — deterministic (no-LLM) parser for common spoken editing
 * commands. Returns an op list for phrasings it recognises, or null so the
 * caller falls back to the AI interpreter. Pure + tested.
 */
import type { AssistOp } from "./ops";
import { SYMBOL_SYNONYMS, SYMBOL_PHRASES } from "./ops";
import type { SymbolType, EventType, GatewayType } from "../diagram/types";

const clean = (s: string) => s.trim().replace(/[.,!?;:]+$/g, "").trim();
const stripArticle = (s: string) => s.replace(/^(a|an|the)\s+/i, "").trim();
/** "Sales Team and Marketing Team" / "A, B and C" → ["…"] (handles Oxford comma). */
const splitLabels = (s: string) => s.split(/\s*,\s*(?:and\s+)?|\s+and\s+/i).map(clean).filter(Boolean);

const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toCount = (s: string | undefined): number => {
  if (!s) return 1;
  const t = s.trim().toLowerCase();
  return WORD_NUM[t] ?? (Number.isFinite(Number(t)) ? Math.max(1, Math.round(Number(t))) : 1);
};

/** Find a symbol type mentioned in `text` (longest phrase wins). */
function matchSymbol(text: string): { symbolType: SymbolType; eventType?: EventType; gatewayType?: GatewayType; phrase: string } | null {
  const t = ` ${text.toLowerCase()} `;
  for (const phrase of SYMBOL_PHRASES) {
    if (t.includes(` ${phrase} `)) return { ...SYMBOL_SYNONYMS[phrase], phrase };
  }
  return null;
}

/** Parse a single utterance into ops, or null if unrecognised. */
export function parseCommand(utterance: string): AssistOp[] | null {
  const raw = clean(utterance);
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // ── Undo ──
  if (/^(undo|undo that|undo last|undo the last|scratch that|never mind)\b/.test(lower)) {
    return [{ op: "undo" }];
  }

  // ── Clear the whole diagram ──
  if (/^(clear|empty|wipe|reset|blank)\s+(the\s+)?(current\s+|whole\s+|entire\s+)?(diagram|canvas|everything|it all|all|page)\b/.test(lower)
      || /^(start over|start again|new diagram|clear all|delete everything|remove everything)\b/.test(lower)) {
    return [{ op: "clear" }];
  }

  // ── Export to JSON ──
  if (/^(export|download|save)\b.*\b(json)\b/.test(lower)
      || /^(export|download)\s+(the\s+)?diagram\b/.test(lower)) {
    return [{ op: "export", format: "json" }];
  }

  // ── Disconnect (before delete, so "remove the link from X to Y" isn't a delete) ──
  let m = raw.match(/^(?:disconnect|unlink|remove (?:the )?(?:connection|link|arrow|flow|line))\s+(?:from\s+)?(.+?)\s+(?:to|and|from)\s+(.+)$/i);
  if (m) return [{ op: "disconnect", fromRef: clean(m[1]), toRef: clean(m[2]) }];

  // ── Connect ──
  if (/^(connect|link|join)\s+(them|these|those|it up)\b/.test(lower) || /^(connect|link|join)\s+the (last two|previous two)\b/.test(lower)) {
    return [{ op: "connect", fromRef: "the previous", toRef: "the last" }];
  }
  m = raw.match(/^(?:connect|link|join)\s+(.+?)\s+(?:to|and|with|into)\s+(.+)$/i);
  if (m) return [{ op: "connect", fromRef: clean(m[1]), toRef: clean(m[2]) }];
  m = raw.match(/^(?:draw|add)\s+(?:a\s+)?(?:line|arrow|flow|connection|sequence(?: flow)?)\s+from\s+(.+?)\s+to\s+(.+)$/i);
  if (m) return [{ op: "connect", fromRef: clean(m[1]), toRef: clean(m[2]) }];
  m = raw.match(/^(.+?)\s+(?:goes to|flows to|connects to|then goes to|leads to)\s+(.+)$/i);
  if (m) return [{ op: "connect", fromRef: clean(m[1]), toRef: clean(m[2]) }];

  // ── Rename ──
  m = raw.match(/^(?:rename|relabel)\s+(.+?)\s+(?:to|as)\s+(.+)$/i);
  if (m) return [{ op: "rename", ref: clean(m[1]), label: clean(m[2]) }];
  m = raw.match(/^(?:change|set)\s+(?:the )?(?:name|label)(?: of)?\s+(.+?)\s+(?:to|as)\s+(.+)$/i);
  if (m) return [{ op: "rename", ref: clean(m[1]), label: clean(m[2]) }];
  m = raw.match(/^call\s+(.+?)\s+(.+)$/i);
  if (m && !matchSymbol(m[1])) return [{ op: "rename", ref: clean(m[1]), label: clean(m[2]) }];

  // ── Wrap / grow a pool around everything ("poll"/"pull" mishear "pool") ──
  // Broad: "add/put/draw a pool [around|to|over] [all elements|everything|the
  // diagram]", a bare "add a pool", "wrap everything in a pool", and
  // "extend/grow the pool to include/accommodate all elements".
  {
    const P = "(?:pool|poll|pull)";
    const ALL = "(?:everything|all(?:\\s+(?:the\\s+)?elements?)?|the\\s+(?:lot|whole\\s+thing|diagram)|it\\s+all)";
    if (
      new RegExp(`^(?:put|wrap|draw|add|create|make)\\s+(?:a\\s+)?(?:new\\s+)?${P}(?:\\s+(?:around|round|over|to(?:\\s+include|\\s+cover|\\s+contain)?|including|containing)\\s+${ALL})?(?:\\s+on\\s+the\\s+diagram)?$`, "i").test(raw)
      || new RegExp(`^wrap\\s+${ALL}\\s+(?:in|with|inside|into)\\s+(?:a\\s+)?${P}\\b`, "i").test(raw)
      || new RegExp(`^(?:extend|expand|grow|stretch|enlarge)\\s+(?:the\\s+)?${P}\\s+(?:to\\s+)?(?:include|around|cover|contain|fit|accommodate|accomodate|encompass|hold)\\s+${ALL}`, "i").test(raw)
    ) {
      return [{ op: "wrapInPool" }];
    }
  }

  // ── Move ──
  m = raw.match(/^move\s+(.+?)\s+(?:(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:elements?|steps?|places?|spaces?|cells?)\s+)?(?:to\s+the\s+)?(left|right|up|down)\b/i);
  if (m) {
    return [{ op: "move", ref: clean(m[1]), direction: m[3].toLowerCase() as "left" | "right" | "up" | "down", count: toCount(m[2]) }];
  }

  // ── Delete (+ optional compact) ──
  m = raw.match(/^(?:delete|remove|get rid of|drop|erase)\s+(.+)$/i);
  if (m) {
    let ref = stripArticle(clean(m[1]));
    let compact = false;
    const andCompact = ref.match(/\s+and\s+(?:compact|close the gap|tidy(?:\s+up)?|collapse|clean up)(?:\s+.*)?$/i);
    if (andCompact) { compact = true; ref = clean(ref.slice(0, andCompact.index)); }
    return [{ op: "delete", ref, ...(compact ? { compact: true } : {}) }];
  }

  // ── Boundary event (before the generic add) ──
  m = raw.match(/^(?:add|put|attach|create|place)\s+(?:a\s+)?boundary\s+event\s+(.+)$/i);
  if (m) {
    const rest = clean(m[1]);
    const calledTo = rest.match(/^called\s+(.+?)\s+(?:to|on|onto)\s+(.+)$/i);
    const toCalled = rest.match(/^(?:to|on|onto)\s+(.+?)\s+called\s+(.+)$/i);
    const onlyTo = rest.match(/^(?:to|on|onto)\s+(.+)$/i);
    let hostRef: string | undefined, label: string | undefined;
    if (calledTo) { label = clean(calledTo[1]); hostRef = clean(calledTo[2]); }
    else if (toCalled) { hostRef = clean(toCalled[1]); label = clean(toCalled[2]); }
    else if (onlyTo) { hostRef = clean(onlyTo[1]); }
    if (hostRef) return [{ op: "addBoundary", hostRef, ...(label ? { label } : {}) }];
  }

  const COUNT = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|some)";
  // ── Sublanes (before lanes: "sublanes" must not match the lane rule) ──
  // "line" mishears "lane". Optional count, optional "new", optional target
  // (defaults to "the lane"), optional names (default Sublane 1..N).
  m = raw.match(new RegExp(`^(?:add|insert|create|split)\\s+${COUNT}?\\s*(?:new\\s+|another\\s+|extra\\s+)?(?:sub-?lanes?|sub lanes?|sub-?lines?|sub lines?)(?:\\s+(?:to|in|into|onto|on|under|below|inside)\\s+(.+?))?(?:\\s+(?:called|named|labell?ed)\\s+(.+))?$`, "i"));
  if (m) {
    let labels = m[3] ? splitLabels(m[3]) : [];
    if (!labels.length) labels = Array.from({ length: Math.max(1, toCount(m[1])) }, (_, i) => `Sublane ${i + 1}`);
    return [{ op: "addSublanes", laneRef: m[2] ? clean(m[2]) : "the lane", labels }];
  }

  // ── Lanes ──
  m = raw.match(new RegExp(`^(?:add|insert|create|split)\\s+${COUNT}?\\s*(?:new\\s+|another\\s+|extra\\s+)?(?:lanes?|lines?)(?:\\s+(?:to|in|into|onto|on|inside)\\s+(.+?))?(?:\\s+(?:called|named|labell?ed)\\s+(.+))?$`, "i"));
  if (m) {
    let labels = m[3] ? splitLabels(m[3]) : [];
    if (!labels.length) labels = Array.from({ length: Math.max(1, toCount(m[1])) }, (_, i) => `Lane ${i + 1}`);
    return [{ op: "addLanes", poolRef: m[2] ? clean(m[2]) : "the pool", labels }];
  }

  // ── Add ──
  m = raw.match(/^(?:add|insert|create|put|place|drop in|give me|new)\s+(?:(?:a|an|the)\s+)?(.+)$/i);
  if (m) {
    let rest = clean(m[1]);
    // Container words are handled by the pool/lane rules above; if one slips
    // through here it's a malformed phrasing — send it to the AI rather than
    // creating a task literally named "pool to all elements on the diagram".
    if (/^(?:new\s+|another\s+)?(?:pool|poll|pull|lanes?|lines?|sub-?lanes?|sub-?lines?)\b/i.test(rest)) return null;
    let afterRef: string | undefined;
    const after = rest.match(/\s+(?:after|following|behind|next to|onto)\s+(.+)$/i);
    if (after) { afterRef = clean(after[1]); rest = rest.slice(0, after.index).trim(); }

    let label: string | undefined;
    const named = rest.match(/\s+(?:called|named|labell?ed|titled)\s+(.+)$/i);
    if (named) { label = clean(named[1]); rest = rest.slice(0, named.index).trim(); }
    const quoted = rest.match(/["'“”‘’](.+?)["'“”‘’]/);
    if (!label && quoted) { label = clean(quoted[1]); rest = rest.replace(quoted[0], "").trim(); }

    const sym = matchSymbol(rest);
    if (sym) {
      // leftover after removing the matched phrase is an implicit label
      if (!label) {
        const leftover = clean(stripArticle(rest.toLowerCase().replace(sym.phrase, " ").replace(/\s+/g, " ")));
        if (leftover) label = clean(rest.replace(new RegExp(sym.phrase, "i"), "").replace(/^(a|an|the)\s+/i, "").trim());
      }
      const op: AssistOp = { op: "add", symbolType: sym.symbolType };
      if (sym.eventType) op.eventType = sym.eventType;
      if (sym.gatewayType) op.gatewayType = sym.gatewayType;
      if (label) op.label = label;
      if (afterRef) op.afterRef = afterRef;
      return [op];
    }
    // "add Approve after Review" — no type word → a task named by the rest.
    if (rest) {
      const op: AssistOp = { op: "add", symbolType: "task", label: label ?? clean(stripArticle(rest)) };
      if (afterRef) op.afterRef = afterRef;
      return [op];
    }
  }

  return null; // → AI fallback
}
