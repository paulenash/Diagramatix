/**
 * R2 — the disambiguation picker.
 *
 * `resolveRef` has always RETURNED the candidates when a reference matches more
 * than one element. The editor threw the list away and said "is ambiguous",
 * which left the user to guess what it had found; the first half of R2 made it
 * name them. This is the second half: park the command, number the candidates
 * on the canvas, and let a spoken number finish it.
 *
 * The machinery is the numbered-badge flow that already exists for "rename
 * tasks" and "add message" — same `RenameTarget` shape, same renderer, same
 * reading-order numbering. The point of R2 was never new UI; it was that a
 * mechanism the product already had was not reached from the one place that
 * most needed it.
 *
 * How the answer is applied: the chosen id is substituted back into the parked
 * command as an `#id:` reference, which `resolveRef` resolves exactly. So the
 * command re-runs through the ordinary path — no second code path that could
 * behave differently from the first.
 *
 * Pure.
 */
import type { DiagramElement } from "../diagram/types";
import type { AssistOp } from "./ops";
import { numberTargets, type RenameTarget } from "./renameTargets";
import { ID_REF_PREFIX } from "./resolveRef";
import { leadingSpokenNumber } from "./spokenNumber";

export interface PickFlow {
  /** The command, held until a number arrives. */
  ops: AssistOp[];
  /** The reference that matched more than one thing. */
  ref: string;
  /** What the user is choosing between, numbered in reading order. */
  targets: RenameTarget[];
  /** Shown in the log: "which task? say a number". */
  prompt: string;
}

/**
 * Park a command whose reference was ambiguous. Returns null when there is
 * nothing worth asking about — fewer than two candidates means the caller
 * should report an error rather than draw a picker with one badge on it.
 */
export function buildPickFlow(
  ops: readonly AssistOp[],
  ref: string,
  candidateIds: readonly string[],
  elements: readonly DiagramElement[],
): PickFlow | null {
  const els = candidateIds
    .map((id) => elements.find((e) => e.id === id))
    .filter((e): e is DiagramElement => !!e);
  if (els.length < 2) return null;
  return {
    ops: [...ops],
    ref,
    targets: numberTargets(els),
    prompt: `which “${ref}”? say a number (1–${els.length}), or “cancel”`,
  };
}

/**
 * The number the user said, as an index into the flow's targets — or null when
 * the utterance is not an answer to this question.
 */
export function parsePickAnswer(utterance: string, flow: PickFlow): RenameTarget | null {
  // `leadingSpokenNumber` also tolerates a filler prefix ("number 3") and a
  // misheard number word, which is the same forgiveness the rename pick gets.
  const said = leadingSpokenNumber(utterance.trim());
  if (!said) return null;
  return flow.targets.find((t) => t.n === said.n) ?? null;
}

/**
 * Put the chosen element back into the parked command.
 *
 * Every string field equal to the ambiguous reference is replaced, which covers
 * `ref`, `hostRef`, `poolRef`, `laneA`/`laneB` and the rest without this module
 * needing to know the shape of all 23 ops. Substituting an `#id:` reference
 * rather than a name means the re-run resolves to exactly the element that was
 * picked, even where two elements share a label — which is the situation that
 * raised the question.
 */
export function substituteRef(ops: readonly AssistOp[], ref: string, id: string): AssistOp[] {
  const idRef = `${ID_REF_PREFIX}${id}`;
  return ops.map((op) => {
    const out: Record<string, unknown> = { ...(op as unknown as Record<string, unknown>) };
    for (const [k, v] of Object.entries(out)) {
      if (typeof v === "string" && v === ref) out[k] = idRef;
    }
    return out as unknown as AssistOp;
  });
}
