/**
 * What a finished PLAN found — for the summary pop-up that follows the Plan phase (Paul, 2026-10-07), so the person can decide whether to
 * lay it out, plan again, refine the prompt, or stop, BEFORE a diagram is drawn from it.
 *
 * Pure and deterministic: counts, and a handful of warnings that read the plan itself. The warning that matters most is the one found on
 * 2026-10-07 in a real run: the AI listed all 142 elements but its list of CONNECTIONS stopped partway, so the last three lanes had almost
 * none. Nothing flagged it, and the layout stacked 31 unconnected steps in one column. `unconnected` and `cut-off-likely` exist to say so at
 * the one moment it is cheap to act.
 */
export interface SummaryElement {
  id: string;
  type: string;
  label?: string;
  pool?: string;
  lane?: string;
  poolType?: string;
  isSystem?: boolean;
  parentPool?: string;
  parentSubprocess?: string;
  boundaryHost?: string;
}
export interface SummaryConnection { sourceId: string; targetId: string; type?: string }

export interface PlanSummary {
  structured: boolean;
  totals: { elements: number; connections: number; sequence: number; message: number };
  /** Element mix, largest first: { label: "Tasks", count: 52 }. */
  mix: { label: string; count: number }[];
  /** BPMN-shaped plans only. */
  pools: { name: string; kind: "white-box" | "black-box"; system: boolean; lanes: { name: string; elements: number; unconnected: number }[] }[];
  warnings: { code: "unconnected" | "cut-off-likely" | "gateway-branches" | "no-start" | "no-end" | "single-lane"; message: string }[];
}

const FLOW_TYPES = new Set([
  "task", "gateway", "subprocess", "subprocess-expanded", "start-event", "end-event", "intermediate-event",
  // flowchart / EPC shapes
  "process", "decision", "terminator", "event", "function", "connector",
]);
const LABELS: Record<string, string> = {
  task: "Tasks", gateway: "Gateways", "start-event": "Start events", "end-event": "End events", "intermediate-event": "Intermediate events",
  subprocess: "Subprocesses", "subprocess-expanded": "Subprocesses", "data-object": "Data objects", "data-store": "Data stores",
  "text-annotation": "Annotations", group: "Groups",
};
const label = (t: string) => LABELS[t] ?? t.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) + "s";
const nameOf = (e: SummaryElement) => (e.label ?? "").replace(/\s+/g, " ").trim() || `(unnamed ${e.type})`;
const quote = (names: string[], max = 3) => names.slice(0, max).map((n) => `"${n}"`).join(", ") + (names.length > max ? ", …" : "");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function summarisePlan(plan: { elements?: SummaryElement[]; connections?: SummaryConnection[] } | null | undefined, opts: { structured: boolean }): PlanSummary {
  const elements = plan?.elements ?? [];
  const connections = plan?.connections ?? [];
  const warnings: PlanSummary["warnings"] = [];

  const sequence = connections.filter((c) => (c.type ?? "sequence") === "sequence").length;
  const message = connections.filter((c) => c.type === "message").length;

  const counts = new Map<string, number>();
  for (const e of elements) {
    if (e.type === "pool" || e.type === "lane") continue;
    const l = label(e.type);
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const mix = [...counts.entries()].map(([l, count]) => ({ label: l, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // A step is "connected" when something flows into or out of it. A boundary event belongs to its host, so is not judged on its own.
  const touched = new Set<string>();
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const c of connections) {
    touched.add(c.sourceId); touched.add(c.targetId);
    if ((c.type ?? "sequence") === "sequence") {
      outgoing.set(c.sourceId, (outgoing.get(c.sourceId) ?? 0) + 1);
      incoming.set(c.targetId, (incoming.get(c.targetId) ?? 0) + 1);
    }
  }
  const flow = elements.filter((e) => FLOW_TYPES.has(e.type) && !e.boundaryHost);
  const unconnected = flow.filter((e) => !touched.has(e.id));

  // Pools and lanes (BPMN-shaped plans).
  const pools: PlanSummary["pools"] = [];
  if (opts.structured) {
    for (const p of elements.filter((e) => e.type === "pool")) {
      const lanes = elements.filter((e) => e.type === "lane" && (e.parentPool ?? e.pool) === p.id);
      pools.push({
        name: nameOf(p),
        kind: p.poolType === "black-box" ? "black-box" : "white-box",
        system: !!p.isSystem,
        lanes: lanes.map((l) => {
          const inLane = flow.filter((e) => e.lane === l.id);
          return { name: nameOf(l), elements: inLane.length, unconnected: inLane.filter((e) => !touched.has(e.id)).length };
        }),
      });
    }
  }

  // — warnings —
  if (unconnected.length > 0) {
    const names = unconnected.map(nameOf).filter((n) => !n.startsWith("(unnamed"));
    warnings.push({
      code: "unconnected",
      message: `${plural(unconnected.length, "step")} of ${flow.length} ${unconnected.length === 1 ? "has" : "have"} no connection to the rest of the flow${names.length ? ` (for example ${quote(names)})` : ""}. Unconnected steps are stacked at the edge of the diagram instead of being laid out.`,
    });
    const deadLanes = pools.flatMap((p) => p.lanes).filter((l) => l.elements >= 2 && l.unconnected === l.elements);
    if (deadLanes.length > 0 || unconnected.length / Math.max(1, flow.length) >= 0.25) {
      warnings.push({
        code: "cut-off-likely",
        message: `This looks like the AI's answer was cut off before it listed all the connections${deadLanes.length ? ` — ${deadLanes.length === 1 ? "the lane" : "the lanes"} ${quote(deadLanes.map((l) => l.name))} ${deadLanes.length === 1 ? "has" : "have"} none at all` : ""}. Re-plan, or split the prompt into smaller parts.`,
      });
    }
  }
  // A MERGE gateway (two or more flows in, one out) is correct with a single outgoing flow — it joins, it does not decide. Only a gateway
  // that neither splits nor joins is suspect.
  const thin = flow.filter((e) => e.type === "gateway" && (outgoing.get(e.id) ?? 0) < 2 && (incoming.get(e.id) ?? 0) < 2 && touched.has(e.id));
  if (thin.length > 0) {
    const thinNames = thin.map(nameOf).filter((n) => !n.startsWith("(unnamed"));
    warnings.push({
      code: "gateway-branches",
      message: `${plural(thin.length, "gateway")} ${thin.length === 1 ? "has" : "have"} fewer than two outgoing connections${thinNames.length ? ` (for example ${quote(thinNames, 2)})` : ""}, so ${thin.length === 1 ? "it does" : "they do"} not decide anything.`,
    });
  }
  if (flow.length > 0 && !elements.some((e) => e.type === "start-event" && !e.boundaryHost)) {
    warnings.push({ code: "no-start", message: "The plan has no start event." });
  }
  if (flow.length > 0 && !elements.some((e) => e.type === "end-event")) {
    warnings.push({ code: "no-end", message: "The plan has no end event." });
  }
  if (opts.structured) {
    const white = pools.filter((p) => p.kind === "white-box");
    const only = white.length === 1 ? white[0] : null;
    if (only && only.lanes.length <= 1 && flow.filter((e) => e.type === "task").length >= 6) {
      warnings.push({ code: "single-lane", message: "Only one lane was found, so the plan does not say who performs each step. Naming the roles in the prompt gives a much better diagram." });
    }
  }

  return {
    structured: opts.structured,
    totals: { elements: elements.filter((e) => e.type !== "pool" && e.type !== "lane").length, connections: connections.length, sequence, message },
    mix,
    pools,
    warnings,
  };
}
