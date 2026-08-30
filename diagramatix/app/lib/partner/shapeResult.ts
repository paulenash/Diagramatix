/**
 * The Partner API's published payload.
 *
 * This is a HAND-WRITTEN mapping, and that is the point. `extractSkeleton`
 * produces a `SopSkeleton`, which already contains everything a partner asked
 * for — ordered activities with their role, systems, inputs and outputs — and it
 * would be tempting to serialise it directly. Do not. `SopSkeleton` is internal:
 * it exists to ground SOP prose, it will grow fields for reasons that have
 * nothing to do with this API, and a partner writing code against it would be
 * broken by our own refactoring.
 *
 * So the contract is stated once, here, and a test asserts the payload's keys
 * against an explicit allow-list — a new `SopStep` field cannot leak into a
 * published contract by accident.
 */
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { extractSkeleton } from "@/app/lib/sop/extractSkeleton";

export interface PartnerLane {
  id: string;
  name: string;
  sublanes: PartnerLane[];
}
export interface PartnerPool {
  id: string;
  name: string;
  /** A black-box pool: an external party or an IT system, not our own work. */
  external: boolean;
  lanes: PartnerLane[];
}
export interface PartnerActivity {
  no: number;
  id: string;
  name: string;
  pool: string | null;
  lane: string | null;
  taskType: string | null;
  systems: string[];
  inputs: string[];
  outputs: string[];
  /** The gateway immediately after this step, when there is one. */
  decision: { question: string; branches: { label: string; toStep: number | null }[] } | null;
}
export interface PartnerHandoff {
  from: string | null;
  to: string | null;
  what: string | null;
  /** The step number the hand-off happens at, so it can be placed in the list. */
  atStep: number | null;
}
export interface PartnerWarning {
  code: string;
  message: string;
}
export interface PartnerProcessShape {
  pools: PartnerPool[];
  roles: string[];
  activities: PartnerActivity[];
  decisions: { afterStep: number; question: string; branches: { label: string; toStep: number | null }[] }[];
  handoffs: PartnerHandoff[];
  systems: string[];
  warnings: PartnerWarning[];
}

/** Every key the payload may contain. The test reads this, so adding a field to
 *  the contract is a deliberate edit in two places rather than a side effect. */
export const PARTNER_SHAPE_KEYS = [
  "pools", "roles", "activities", "decisions", "handoffs", "systems", "warnings",
] as const;
export const PARTNER_ACTIVITY_KEYS = [
  "no", "id", "name", "pool", "lane", "taskType", "systems", "inputs", "outputs", "decision",
] as const;

const isPool = (e: DiagramElement) => e.type === "pool";
const isLane = (e: DiagramElement) => e.type === "lane" || e.type === "sublane";

/** Walk up the parent chain to the pool an element sits in. */
function poolOf(el: DiagramElement | undefined, byId: Map<string, DiagramElement>): DiagramElement | null {
  let cur = el;
  for (let d = 0; cur && d < 16; d++) {
    if (isPool(cur)) return cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
}

/** Pools with their lanes nested, in the order they appear down the canvas —
 *  which is the order a reader sees, not the order the model happened to emit. */
function buildPools(data: DiagramData): PartnerPool[] {
  const els = data.elements ?? [];
  const lanesOf = (parentId: string): PartnerLane[] =>
    els
      .filter((e) => isLane(e) && e.parentId === parentId)
      .sort((a, b) => a.y - b.y)
      .map((l) => ({ id: l.id, name: l.label ?? "", sublanes: lanesOf(l.id) }));

  return els
    .filter(isPool)
    .sort((a, b) => a.y - b.y)
    .map((p) => ({
      id: p.id,
      name: p.label ?? "",
      // A black-box pool is somebody else — an external party or an IT system.
      external: (p.properties?.poolType as string | undefined) === "black-box",
      lanes: lanesOf(p.id),
    }))
    // A pool with no name and no lanes is the auto-injected wrapper the layout
    // adds when a plan gave none — an internal detail, not something a partner
    // asked about.
    .filter((p) => p.name.trim() !== "" || p.lanes.length > 0);
}

/**
 * Turn a laid-out diagram into the partner payload.
 *
 * Ordering and every per-step fact come from `extractSkeleton`, which is
 * deterministic and does no AI — so two calls on the same diagram give the same
 * answer, which matters when the caller is scoring it.
 */
export function shapeResult(data: DiagramData, opts: { diagramId?: string; diagramName?: string } = {}): PartnerProcessShape {
  const skeleton = extractSkeleton(data, { scope: "whole", ...opts });
  const byId = new Map((data.elements ?? []).map((e) => [e.id, e]));

  const activities: PartnerActivity[] = skeleton.steps.map((s) => {
    const el = byId.get(s.id);
    const pool = poolOf(el, byId);
    return {
      no: s.globalNo,
      id: s.id,
      name: s.label,
      pool: pool?.label ?? null,
      lane: s.role || null,
      taskType: s.taskType ?? null,
      systems: s.systems ?? [],
      inputs: s.inputs ?? [],
      outputs: s.outputs ?? [],
      decision: s.decision
        ? {
            question: s.decision.question,
            branches: s.decision.branches.map((b) => ({ label: b.label, toStep: b.toStep ?? null })),
          }
        : null,
    };
  });

  const decisions = activities
    .filter((a) => a.decision)
    .map((a) => ({ afterStep: a.no, question: a.decision!.question, branches: a.decision!.branches }));

  // Hand-offs are reported per step AND at the top level: a partner scoring
  // co-ordination cost wants the count, one drawing a swim-lane wants the step.
  const handoffs: PartnerHandoff[] = [];
  for (const s of skeleton.steps) {
    if (s.handoffOut) {
      handoffs.push({
        from: s.handoffOut.from ?? s.role ?? null,
        to: s.handoffOut.to ?? null,
        what: s.handoffOut.what ?? null,
        atStep: s.globalNo,
      });
    }
  }

  const warnings: PartnerWarning[] = [];
  const laneCount = buildPools(data).reduce((t, p) => t + (p.external ? 0 : p.lanes.length), 0);
  if (laneCount <= 1) {
    // Worth saying rather than leaving the caller to discover it: a role
    // analysis over one lane returns nothing, and the usual cause is a
    // description that never said who does what.
    warnings.push({
      code: "single_lane",
      message: "The description did not identify separate roles, so everything is in one lane. Naming who performs each step will produce a richer model.",
    });
  }
  if (activities.length === 0) {
    warnings.push({ code: "no_activities", message: "No activities could be identified in what was supplied." });
  }

  return {
    pools: buildPools(data),
    roles: skeleton.roles ?? [],
    activities,
    decisions,
    handoffs,
    systems: skeleton.systems ?? [],
    warnings,
  };
}
