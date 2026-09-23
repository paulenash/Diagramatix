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
import { ID_REF_PREFIX, spokenNumbersAsDigits } from "./resolveRef";
import { phoneticMatches } from "./phonetic";
import { leadingContainerWord } from "./containerWords";
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
  // THE NAME IS READ FIRST. The question names the candidates, so answering
  // with one of them is the obvious thing to do — and the prompt that raised
  // the picker asked for exactly that (Paul, 2026-09-23: `Pool three.` came
  // back "didn't understand that" immediately after being asked which "pool
  // three" was meant).
  //
  // Before the number, because `leadingSpokenNumber` forgives a mis-heard
  // number word, and "lane" is one of the words it forgives — so "Lane 2" was
  // read as the number ONE and picked the wrong candidate. Reading the name
  // first costs nothing: a bare number is never a label.
  //
  // Safe here in a way it is not in general: the field is two or three known
  // labels, so a loose match cannot reach anything else on the diagram. A
  // phrase that fits more than one of them is no answer at all, and the
  // question stands.
  const byName = matchTargetByName(utterance, flow.targets);
  if (byName) return byName;

  // A container word that named none of them in particular — "lane", when the
  // question was "which lane?" — is not an answer, and must not fall through
  // to the number pass, which forgives "lane" as a mis-heard "one" and would
  // pick the first candidate. The question stands instead.
  if (leadingContainerWord(utterance.trim().toLowerCase())) return null;

  // `leadingSpokenNumber` also tolerates a filler prefix ("number 3") and a
  // misheard number word, which is the same forgiveness the rename pick gets.
  const said = leadingSpokenNumber(utterance.trim());
  return said ? flow.targets.find((t) => t.n === said.n) ?? null : null;
}

/**
 * The candidate a spoken phrase names, or null when it names none or more
 * than one. Exact label first, then a contained phrase, then how it sounds —
 * the same ladder `resolveRef` climbs, over a field of two or three.
 */
export function matchTargetByName(utterance: string, targets: readonly RenameTarget[]): RenameTarget | null {
  const said = spokenNumbersAsDigits(
    utterance.trim().toLowerCase().replace(/[.,!?;:]+$/g, "").replace(/^(?:the|a|an|it'?s|that'?s)\s+/i, "").trim(),
  );
  if (!said) return null;
  const labelOf = (t: RenameTarget) => spokenNumbersAsDigits((t.label ?? "").trim().toLowerCase());
  const only = (hits: RenameTarget[]) => (hits.length === 1 ? hits[0] : null);

  const exact = only(targets.filter((t) => labelOf(t) === said));
  if (exact) return exact;
  const contains = only(targets.filter((t) => labelOf(t).includes(said) || said.includes(labelOf(t))));
  if (contains) return contains;
  return only(phoneticMatches(said, [...targets], (t) => t.label ?? undefined));
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
