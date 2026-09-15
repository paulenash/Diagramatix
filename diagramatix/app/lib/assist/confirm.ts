/**
 * Which commands ask before they act, and what counts as an answer.
 *
 * "clear the diagram" used to execute the instant it was heard — from a mis-hear
 * as easily as on purpose. Undo recovers it, but a person should not have to
 * know that. The rule: a command that removes MORE than one thing asks first —
 * the whole diagram, a container and what is inside it, a multi-selection, or a
 * delete that also closes the gap. A single named element still deletes
 * immediately; asking there would make the feature slower than the mouse.
 *
 * Pure. The editor parks the ops, logs the question, and feeds the next
 * utterance to `parseConfirmation`.
 */
import type { DiagramElement } from "../diagram/types";
import type { AssistOp } from "./ops";
import { resolveRef, resolveSelectionRefs } from "./resolveRef";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A one-line description of what the command would destroy, or null when it may run unasked. */
export function needsConfirmation(
  ops: readonly AssistOp[],
  elements: readonly DiagramElement[],
  lastAddedId?: string | null,
  selectedIds?: readonly string[],
): string | null {
  for (const op of ops) {
    if (op.op === "clear") {
      return elements.length ? `clear the whole diagram (${plural(elements.length, "element")})` : null;
    }
    if (op.op !== "delete") continue;

    const sel = resolveSelectionRefs(op.ref, elements as DiagramElement[], selectedIds);
    if (sel && sel.length > 1) return `delete the ${plural(sel.length, "selected element")}${op.compact ? " and close the gap" : ""}`;

    if (op.compact) return `delete ${op.ref} and close the gap`;

    const r = resolveRef(op.ref, elements as DiagramElement[], lastAddedId, selectedIds);
    if (!r || !("id" in r)) continue;
    const e = elements.find((x) => x.id === r.id);
    if (!e || (e.type !== "pool" && e.type !== "lane")) continue;
    const parentIsLane = elements.find((p) => p.id === e.parentId)?.type === "lane";
    const kind = e.type === "pool" ? "pool" : parentIsLane ? "sub-lane" : "lane";
    const inside = elements.filter((x) => x.parentId === e.id).length;
    return `delete the ${kind} “${e.label?.trim() || kind}”${inside ? ` and the ${plural(inside, "element")} inside it` : ""}`;
  }
  return null;
}

const YES = /^(?:yes|yes please|yep|yeah|yup|confirm|confirmed|do it|go ahead|go on|ok|okay|sure|proceed|affirmative)\b/i;
const NO = /^(?:no|nope|nah|cancel|never mind|nevermind|don'?t|do not|abort|forget it|leave it|stop)\b/i;

/** "yes" / "no" / null (the utterance is something else — treat it as a new command). */
export function parseConfirmation(utterance: string): "yes" | "no" | null {
  const s = utterance.trim().toLowerCase().replace(/[.,!?;:]+$/g, "");
  if (!s) return null;
  if (YES.test(s)) return "yes";
  if (NO.test(s)) return "no";
  return null;
}
