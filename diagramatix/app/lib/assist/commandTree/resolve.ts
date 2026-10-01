/**
 * Which command tree is in force: the shipped one, or the SuperAdmin's override from the
 * tile — and what to do when the override does not compile. Pure and client-safe (no
 * database): the tile compiles drafts with this, the server resolves what is stored.
 *
 * The rule (plan, "A SuperAdmin edit breaks the tree"): an override that has ANY error is
 * not used; the shipped tree is, and the reason is reported. A broken edit can therefore
 * never leave the bubble empty or half-working.
 */
import { DEFAULT_CONVENTIONS, type Conventions } from "./conventions";
import { DEFAULT_LISTS, DEFAULT_PATTERNS } from "./defaults";
import { compileTree, type CommandTree, type Lists } from "./tree";

export interface BubbleHelpConfig {
  /** The patterns text in force. */
  patterns: string;
  /** The conventions in force. */
  conventions: Conventions;
  lists: Lists;
  usingPatternsOverride: boolean;
  usingConventionsOverride: boolean;
  /** Why an override was NOT used, or null. */
  fallback: string | null;
  tree: CommandTree;
}

const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();

export const isDefaultPatterns = (text: string): boolean => norm(text) === norm(DEFAULT_PATTERNS);
export const isDefaultConventions = (c: Conventions): boolean => JSON.stringify(c) === JSON.stringify(DEFAULT_CONVENTIONS);

const shipped = (fallback: string | null): BubbleHelpConfig => ({
  patterns: DEFAULT_PATTERNS,
  conventions: DEFAULT_CONVENTIONS,
  lists: DEFAULT_LISTS,
  usingPatternsOverride: false,
  usingConventionsOverride: false,
  fallback,
  tree: compileTree(DEFAULT_PATTERNS, DEFAULT_CONVENTIONS, DEFAULT_LISTS),
});

export function resolveBubbleHelp(over: { patterns?: string | null; conventions?: Conventions | null }): BubbleHelpConfig {
  const wantPatterns = typeof over.patterns === "string" && over.patterns.trim() !== "" && !isDefaultPatterns(over.patterns);
  const wantConventions = !!over.conventions && !isDefaultConventions(over.conventions);
  if (!wantPatterns && !wantConventions) return shipped(null);

  const patterns = wantPatterns ? over.patterns! : DEFAULT_PATTERNS;
  const conventions = wantConventions ? over.conventions! : DEFAULT_CONVENTIONS;
  const tree = compileTree(patterns, conventions, DEFAULT_LISTS);
  if (!tree.errors.length) {
    return { patterns, conventions, lists: DEFAULT_LISTS, usingPatternsOverride: wantPatterns, usingConventionsOverride: wantConventions, fallback: null, tree };
  }
  const first = tree.errors[0];
  const n = tree.errors.length;
  return shipped(`the saved edit has ${n} problem${n === 1 ? "" : "s"} (first: ${first.line ? `line ${first.line}: ` : ""}${first.message}) — the shipped tree is in use`);
}
