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

    // "Put a pool around everything" destroys nothing, but when a pool already
    // exists it does not draw a second one — it GROWS that pool and adopts every
    // loose element into it, which re-homes the whole diagram in one step and is
    // easy to miss on screen. Paul lost a diagram's structure to it (2026-09-18)
    // when the recogniser dropped a word: "surround selected with a pool" became
    // the fragment "selected with a pool", the AI read that as "everything", and
    // the result reported success. The grammar now catches that fragment, but
    // the command is still one word away from restructuring a diagram, so it
    // asks when there is a pool for it to grow.
    if (op.op === "wrapInPool") {
      const pools = elements.filter((e) => e.type === "pool");
      if (pools.length === 0) continue; // a brand-new pool is easy to see and to undo
      const loose = elements.filter(
        (e) => e.type !== "pool" && e.type !== "lane" && e.type !== "sublane"
          && e.type !== "text-annotation" && !e.parentId,
      );
      if (loose.length === 0) continue; // nothing to adopt; the editor says so
      const biggest = pools.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
      const name = biggest.label?.trim() || "the existing pool";
      return `move ${plural(loose.length, "loose element")} into ${name}`;
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
    // WHAT IS INSIDE IS KEPT, and the prompt used to say the opposite.
    //
    // Deleting a container cascade-deletes the container SUBTREE and re-homes
    // every non-container child — tasks, events, gateways, data — to the lane
    // that absorbs the space, or to the pool. The reducer has always done
    // this. The prompt said "delete the sub-lane 'domestic' AND THE 7 ELEMENTS
    // INSIDE IT", so Paul said no (2026-09-21) to an operation that would not
    // have touched his seven elements.
    //
    // A confirmation that overstates the danger is not "being safe": it trains
    // the user to distrust the prompt, and it stops them doing the thing they
    // asked for.
    // Count the real contents ANYWHERE below it, not just the direct children.
    // A pool's only direct child is usually a lane, so "1 element inside it"
    // described the lane — true of nothing the user can see, while the two
    // tasks they are actually worried about went unmentioned.
    const laneLike = new Set(["lane", "sublane"]);
    const inside = (() => {
      const ids = new Set([e.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const x of elements) {
          if (x.parentId && ids.has(x.parentId) && !ids.has(x.id) && laneLike.has(x.type)) {
            ids.add(x.id); grew = true;
          }
        }
      }
      return elements.filter((x) => x.parentId && ids.has(x.parentId) && !laneLike.has(x.type)).length;
    })();
    return `delete the ${kind} “${e.label?.trim() || kind}”${inside ? ` — the ${plural(inside, "element")} inside it will be kept` : ""}`;
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
