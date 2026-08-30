/**
 * BPMN → SOP → (the API) → BPMN: what survived?
 *
 * A Diagramatix SOP records the diagram it came from, so when the harness feeds
 * one of our own SOPs back through the API the source diagram is GROUND TRUTH.
 * That is the difference between looking at the output and measuring it — and it
 * is the only honest way to answer "is a small model good enough here?", by
 * running the same fixed input against two models and comparing numbers rather
 * than impressions.
 *
 * Matching is on a normalised label, which is a real limitation and is stated
 * rather than hidden: a model that renames "Check Invoice" to "Verify Invoice"
 * has arguably kept the step, and this will score it as one missing and one
 * invented. That is the conservative direction — it under-reports success rather
 * than flattering it — and a score you can trust to be pessimistic is more
 * useful than one you cannot trust at all.
 */
import type { DiagramData } from "@/app/lib/diagram/types";
import { extractSkeleton } from "@/app/lib/sop/extractSkeleton";

export interface RoundTripActivity {
  name: string;
  lane: string | null;
  /** Position in the source order, 1-based. Null when it only exists in the result. */
  sourceNo: number | null;
  resultNo: number | null;
}

export interface RoundTripScore {
  /** In the source and in the result. */
  matched: RoundTripActivity[];
  /** In the source, absent from the result — work the model dropped. */
  missing: RoundTripActivity[];
  /** In the result, absent from the source — work the model made up. */
  invented: RoundTripActivity[];
  /** Matched activities that came back in a different lane. */
  movedLane: { name: string; from: string | null; to: string | null }[];
  lanes: { matched: string[]; missing: string[]; invented: string[] };
  /** Did the matched activities come back in the same relative order? */
  orderPreserved: boolean;
  /** 0-100. Recall on activities, penalised for invention and lane drift. */
  score: number;
  summary: string;
}

/** Fold away everything that is not the words: case, punctuation, the hard line
 *  breaks the generator inserts, and filler that carries no meaning. */
export function normaliseLabel(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(the|a|an|to|of|for|and|in|on|into)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WORK = new Set(["task", "subprocess", "subprocess-expanded", "call-activity", "transaction"]);

interface Step { name: string; lane: string | null; no: number; key: string }

function stepsOf(data: DiagramData): Step[] {
  const skeleton = extractSkeleton(data, { scope: "whole" });
  const byId = new Map((data.elements ?? []).map((e) => [e.id, e]));
  return skeleton.steps
    .filter((s) => {
      const el = byId.get(s.id);
      return !el || WORK.has(el.type);
    })
    .map((s, i) => ({ name: s.label, lane: s.role || null, no: i + 1, key: normaliseLabel(s.label) }))
    .filter((s) => s.key !== "");
}

/** Is `b` the same sequence as `a` with things removed — i.e. did the surviving
 *  steps keep their relative order? */
function isSubsequenceOrder(sourceKeys: string[], resultKeys: string[]): boolean {
  let i = 0;
  for (const k of sourceKeys) {
    const at = resultKeys.indexOf(k, i);
    if (at < 0) continue;
    i = at + 1;
  }
  // Walk the result and check the matched ones ascend in source order.
  const sourceIndex = new Map(sourceKeys.map((k, idx) => [k, idx]));
  let last = -1;
  for (const k of resultKeys) {
    const idx = sourceIndex.get(k);
    if (idx === undefined) continue;
    if (idx < last) return false;
    last = idx;
  }
  return true;
}

export function scoreRoundTrip(source: DiagramData, result: DiagramData): RoundTripScore {
  const src = stepsOf(source);
  const res = stepsOf(result);

  const resByKey = new Map<string, Step>();
  for (const s of res) if (!resByKey.has(s.key)) resByKey.set(s.key, s);
  const srcByKey = new Map<string, Step>();
  for (const s of src) if (!srcByKey.has(s.key)) srcByKey.set(s.key, s);

  const matched: RoundTripActivity[] = [];
  const missing: RoundTripActivity[] = [];
  const movedLane: RoundTripScore["movedLane"] = [];

  for (const s of src) {
    const hit = resByKey.get(s.key);
    if (hit) {
      matched.push({ name: s.name, lane: hit.lane, sourceNo: s.no, resultNo: hit.no });
      if (normaliseLabel(s.lane ?? "") !== normaliseLabel(hit.lane ?? "")) {
        movedLane.push({ name: s.name, from: s.lane, to: hit.lane });
      }
    } else {
      missing.push({ name: s.name, lane: s.lane, sourceNo: s.no, resultNo: null });
    }
  }
  const invented: RoundTripActivity[] = res
    .filter((r) => !srcByKey.has(r.key))
    .map((r) => ({ name: r.name, lane: r.lane, sourceNo: null, resultNo: r.no }));

  const srcLanes = [...new Set(src.map((s) => s.lane).filter(Boolean) as string[])];
  const resLanes = [...new Set(res.map((s) => s.lane).filter(Boolean) as string[])];
  const resLaneKeys = new Set(resLanes.map(normaliseLabel));
  const srcLaneKeys = new Set(srcLanes.map(normaliseLabel));

  const orderPreserved = isSubsequenceOrder(
    src.map((s) => s.key),
    res.map((s) => s.key),
  );

  // Recall is the headline — did the work survive? Invention and lane drift are
  // penalties rather than the measure, because a model that adds a plausible
  // step has done less damage than one that dropped a real one.
  const recall = src.length ? matched.length / src.length : 0;
  const inventionPenalty = res.length ? invented.length / res.length : 0;
  const lanePenalty = matched.length ? movedLane.length / matched.length : 0;
  const score = Math.max(0, Math.round(100 * (recall - 0.3 * inventionPenalty - 0.2 * lanePenalty)));

  const summary =
    `${matched.length}/${src.length} activities survived` +
    (missing.length ? `, ${missing.length} lost` : "") +
    (invented.length ? `, ${invented.length} invented` : "") +
    (movedLane.length ? `, ${movedLane.length} changed lane` : "") +
    (orderPreserved ? ", order kept" : ", order changed");

  return {
    matched, missing, invented, movedLane,
    lanes: {
      matched: srcLanes.filter((l) => resLaneKeys.has(normaliseLabel(l))),
      missing: srcLanes.filter((l) => !resLaneKeys.has(normaliseLabel(l))),
      invented: resLanes.filter((l) => !srcLaneKeys.has(normaliseLabel(l))),
    },
    orderPreserved,
    score,
    summary,
  };
}
