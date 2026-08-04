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

  // ── Delete ──
  m = raw.match(/^(?:delete|remove|get rid of|drop|erase)\s+(.+)$/i);
  if (m) return [{ op: "delete", ref: stripArticle(clean(m[1])) }];

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

  // ── Add ──
  m = raw.match(/^(?:add|insert|create|put|place|drop in|give me|new)\s+(?:(?:a|an|the)\s+)?(.+)$/i);
  if (m) {
    let rest = clean(m[1]);
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
