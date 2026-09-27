/**
 * What the AI fallback may not do on its own initiative.
 *
 * THE AI NEVER INVENTS A RENAME. Paul's test-diagram session, 2026-09-27: the
 * recogniser returned "Coverage Check? claim" for "convert Check Claim to a
 * task" (the diagram's own "Check Coverage" pulled "convert" towards it). The
 * grammar rightly understood nothing, and the AI answered "rename Check
 * Coverage to Coverage Check?" — and the app renamed his task. The next
 * command then found the new name and converted the wrong element. A garbled
 * sentence is a question, not a licence to change what something is called.
 *
 * So a rename that comes back from the AI is applied only when the user said
 * a naming word. The AI keeps its real job — "Pass Check claim to a
 * subprocess" → "convert Check Claim to a subprocess" — because that repairs
 * a mis-heard VERB; it may not supply a verb nobody said.
 *
 * Pure.
 */
import type { AssistOp } from "./ops";

/** The words a person uses when they mean to name something. */
const NAMING_WORDS = /\b(?:re-?nam\w*|relabel\w*|call(?:ed|s)?|nam(?:e|ed|es)|label(?:led|ed|s)?|titl(?:e|ed)|chang(?:e|ed|es))\b/i;

/** Ops that change what something is called. */
const RENAMES = new Set<AssistOp["op"]>(["rename", "labelSelected"]);

/** True when the AI answered with a rename the user never asked for. */
export function aiInventedRename(heard: string, ops: readonly AssistOp[]): boolean {
  return ops.some((o) => RENAMES.has(o.op)) && !NAMING_WORDS.test(heard);
}

/** What the log says instead. */
export const INVENTED_RENAME_REFUSAL = "didn’t understand that — nothing was renamed (to rename, say “rename … to …”)";
