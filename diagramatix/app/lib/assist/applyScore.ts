/**
 * L4 for one case: apply the parsed ops to a headless copy of the fixture with
 * the SAME `applyAssistOps` the editor runs, then ask `opEffects` whether the
 * diagram came out the way the sentence promised.
 *
 * Runs only after L1–L3 have passed, so a failure here is unambiguous: the
 * words were heard, parsed and resolved correctly, and the edit was still
 * wrong. That is a finding about the apply layer or the reducer, and nothing a
 * keyword boost or a grammar rule can fix.
 *
 * Two ways to fail:
 * - the apply layer REFUSED ("everything is already in a pool") — its own
 *   summary is the detail, because it already says why;
 * - it reported success and the diagram disagrees — the check's detail.
 * A command that opens a picker is not a failure: live, the user answers it.
 */
import { applyAssistOps } from "./applyAssistOps";
import { headlessDiagram } from "./headlessDiagram";
import { checkEffect, checkAlign, type EffectCheck, type ResolvedRefs } from "./opEffects";
import { resolveRef } from "./resolveRef";
import { refKind } from "./refKinds";
import type { AssistOp } from "./ops";
import type { DiagramData } from "../diagram/types";

/** Every field of an op that holds a REF, including swapPools' a/b. */
const REF_FIELDS = ["ref", "fromRef", "toRef", "afterRef", "hostRef", "poolRef", "refLane", "laneRef", "laneA", "laneB", "relativeTo"];

const refFieldsOf = (op: AssistOp) => (op.op === "swapPools" ? [...REF_FIELDS, "a", "b"] : REF_FIELDS);

/** Resolve like the app: the same kind table (refKinds.ts) and the case's selection. */
function resolveField(op: AssistOp, f: string, d: DiagramData, selected: readonly string[]) {
  const v = (op as unknown as Record<string, unknown>)[f];
  if (typeof v !== "string" || !v) return undefined;
  return resolveRef(v, d.elements, null, selected, { kind: refKind(op.op, f) });
}

function resolveAll(op: AssistOp, d: DiagramData, selected: readonly string[]): ResolvedRefs {
  const out: ResolvedRefs = {};
  for (const f of refFieldsOf(op)) {
    const r = resolveField(op, f, d, selected);
    if (r && "id" in r) out[f] = r.id;
  }
  return out;
}

/** Does any ref in these ops genuinely name more than one thing — the only honest reason for a picker? */
function reallyAmbiguous(ops: AssistOp[], d: DiagramData, selected: readonly string[]): boolean {
  return ops.some((op) => refFieldsOf(op).some((f) => {
    const r = resolveField(op, f, d, selected);
    return !!r && "ambiguous" in r;
  }));
}

export interface ApplyVerdict extends EffectCheck {
  /** What the apply layer said, as the live log would show it. */
  summary: string;
}

/**
 * Apply `ops` to a fresh copy of `diagram` and check the result.
 * `selected` is the case's `needsSelection`, standing in for the mouse.
 */
export function scoreApply(ops: AssistOp[], diagram: DiagramData, selected: string[] = []): ApplyVerdict {
  const h = headlessDiagram(structuredClone(diagram));
  // "Before" is the diagram as opened — after the load heal — so a heal is
  // never mistaken for an effect of the command.
  const before = structuredClone(h.data);
  const refs = ops.map((op) => resolveAll(op, before, selected));
  const { ok, summary } = applyAssistOps(ops, h.context({ selectedIds: selected }));
  if (h.screen.includes("pick")) {
    // Live, the user picks — but only a ref that really names several things
    // should raise one. "compress pool three" asking "Pool 3 or Lane 3?" was
    // counted as a pass here, which is why the harness never saw Paul's bug.
    if (reallyAmbiguous(ops, before, selected)) return { ok: true, detail: "", summary };
    return { ok: false, detail: `asked which, though every ref names one thing: ${summary}`, summary };
  }
  if (!ok) return { ok: false, detail: `refused: ${summary}`, summary };
  const after = h.data;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const r = op.op === "alignSelection" ? checkAlign(op.mode, selected, after) : checkEffect(op, before, after, refs[i]);
    if (r && !r.ok) return { ...r, summary };
  }
  return { ok: true, detail: "", summary };
}
