import type { Connector, ConnectorType, DiagramElement, SymbolType } from "./types";

const FLOW_ELEMENT_TYPES: Set<SymbolType> = new Set<SymbolType>([
  "task",
  "subprocess",
  "subprocess-expanded",
  "gateway",
  "start-event",
  "intermediate-event",
  "end-event",
  "data-object",
  "data-store",
  "text-annotation",
  "group",
]);

/**
 * Reverse-engineer a BPMN diagram into a structured textual prompt that
 * follows the canonical 6-section order:
 *   1. Pools, Lanes, Sublanes
 *   2. Pool properties (Black-box/White-box, System flag, Multiplicity)
 *   3. Pool layout (relative positions)
 *   4. Per-lane elements in left-to-right flow order
 *   5. Edge-mounted (boundary) events and their hosts
 *   6. Connectors grouped by type, listing source → target [+label]
 *
 * The output is plain markdown-flavoured text designed to be re-fed into
 * the BPMN AI generator to recreate (or adapt) the diagram.
 */
export function buildBpmnPrompt(elements: DiagramElement[], connectors: Connector[]): string {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const labelOf = (e: DiagramElement | undefined): string =>
    e ? (e.label?.trim() || `<unnamed ${e.type}>`) : "<missing>";

  const pools = elements
    .filter((e) => e.type === "pool")
    .sort((a, b) => a.x - b.x || a.y - b.y);

  const lines: string[] = [];

  if (pools.length === 0) {
    return "(No pools in this diagram — nothing to describe in the BPMN structured format.)";
  }

  // ── 1. Pools, Lanes, Sublanes ──
  lines.push("# 1. Pools, Lanes, and Sublanes");
  lines.push("");
  const childLanesOf = (parentId: string) =>
    elements
      .filter((e) => e.type === "lane" && e.parentId === parentId)
      .sort((a, b) => a.y - b.y);

  const renderSublanes = (parentLaneId: string, indent: number) => {
    for (const sl of childLanesOf(parentLaneId)) {
      lines.push(`${"  ".repeat(indent)}- Sublane: "${labelOf(sl)}"`);
      renderSublanes(sl.id, indent + 1);
    }
  };

  for (const pool of pools) {
    lines.push(`Pool: "${labelOf(pool)}"`);
    const lanes = childLanesOf(pool.id);
    if (lanes.length === 0) {
      lines.push(`  (no lanes — flat pool)`);
    } else {
      for (const lane of lanes) {
        lines.push(`  - Lane: "${labelOf(lane)}"`);
        renderSublanes(lane.id, 2);
      }
    }
    lines.push("");
  }

  // ── 2. Pool properties ──
  lines.push("# 2. Pool Properties");
  lines.push("");
  for (const pool of pools) {
    const ptype = (pool.properties?.poolType as string | undefined) ?? "black-box";
    const isSys = !!pool.properties?.isSystem;
    const mult = (pool.properties?.multiplicity as string | undefined) ?? "single";
    const parts = [ptype];
    if (ptype === "black-box" && isSys) parts.push("System");
    parts.push(`multiplicity=${mult}`);
    lines.push(`- "${labelOf(pool)}": ${parts.join(", ")}`);
  }
  lines.push("");

  // ── 3. Pool layout ──
  lines.push("# 3. Pool Layout");
  lines.push("");
  if (pools.length === 1) {
    lines.push(`- "${labelOf(pools[0])}" is the only pool.`);
  } else {
    for (let i = 0; i < pools.length; i++) {
      const p = pools[i];
      const rels: string[] = [];
      for (let j = 0; j < pools.length; j++) {
        if (i === j) continue;
        const q = pools[j];
        const dirs: string[] = [];
        if (p.x + p.width <= q.x) dirs.push("left of");
        else if (q.x + q.width <= p.x) dirs.push("right of");
        if (p.y + p.height <= q.y) dirs.push("above");
        else if (q.y + q.height <= p.y) dirs.push("below");
        if (dirs.length === 0) dirs.push("overlapping");
        rels.push(`${dirs.join(" and ")} "${labelOf(q)}"`);
      }
      lines.push(`- "${labelOf(p)}" is ${rels.join("; ")}.`);
    }
  }
  lines.push("");

  // ── 4. Per-lane elements (left to right) ──
  lines.push("# 4. Lane Contents (left to right)");
  lines.push("");
  // Walk each pool to find its leaf containers (deepest sublane on each
  // branch) — that's where flow elements actually live.
  type LeafCtx = { container: DiagramElement; pool: DiagramElement };
  const leaves: LeafCtx[] = [];
  for (const pool of pools) {
    const topLanes = childLanesOf(pool.id);
    if (topLanes.length === 0) {
      leaves.push({ container: pool, pool });
      continue;
    }
    const walk = (laneId: string) => {
      const subs = childLanesOf(laneId);
      if (subs.length === 0) {
        const lane = byId.get(laneId);
        if (lane) leaves.push({ container: lane, pool });
      } else {
        for (const sl of subs) walk(sl.id);
      }
    };
    for (const lane of topLanes) walk(lane.id);
  }

  for (const { container, pool } of leaves) {
    const isPool = container.type === "pool";
    const heading = isPool
      ? `Pool "${labelOf(container)}":`
      : `Lane "${labelOf(container)}" (in pool "${labelOf(pool)}"):`;
    const items = elements
      .filter(
        (e) =>
          FLOW_ELEMENT_TYPES.has(e.type) &&
          e.parentId === container.id &&
          !e.boundaryHostId,
      )
      .sort((a, b) => a.x - b.x || a.y - b.y);
    if (items.length === 0) {
      lines.push(`${heading} (empty)`);
    } else {
      lines.push(heading);
      for (const it of items) {
        lines.push(`  - ${describeElement(it)}: "${labelOf(it)}"`);
      }
    }
  }
  lines.push("");

  // ── 5. Edge-mounted (boundary) events ──
  lines.push("# 5. Edge-Mounted (Boundary) Events");
  lines.push("");
  const boundary = elements.filter((e) => !!e.boundaryHostId);
  if (boundary.length === 0) {
    lines.push("- None.");
  } else {
    for (const ev of boundary) {
      const host = byId.get(ev.boundaryHostId!);
      lines.push(
        `- ${describeElement(ev)} "${labelOf(ev)}" attached to ${describeElement(host)} "${labelOf(host)}"`,
      );
    }
  }
  lines.push("");

  // ── 6. Connectors grouped by type ──
  lines.push("# 6. Connectors");
  lines.push("");
  if (connectors.length === 0) {
    lines.push("- No connectors.");
  } else {
    const groups = new Map<string, Connector[]>();
    for (const c of connectors) {
      const g = friendlyConnectorType(c.type);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(c);
    }
    for (const [type, conns] of groups) {
      lines.push(`## ${type}`);
      for (const c of conns) {
        const src = byId.get(c.sourceId);
        const tgt = byId.get(c.targetId);
        const lbl = c.label?.trim();
        lines.push(
          `- "${labelOf(src)}" → "${labelOf(tgt)}"${lbl ? ` (label: "${lbl}")` : ""}`,
        );
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

function describeElement(e: DiagramElement | undefined): string {
  if (!e) return "(missing)";
  switch (e.type) {
    case "task": {
      const tt = e.taskType ?? "none";
      return tt === "none" ? "Task" : `${cap(tt)} Task`;
    }
    case "subprocess":
      return "Subprocess";
    case "subprocess-expanded": {
      const st = (e.properties?.subprocessType as string | undefined) ?? "embedded";
      return `${cap(st)} Expanded Subprocess`;
    }
    case "gateway": {
      const gt = e.gatewayType ?? "exclusive";
      return `${cap(gt)} Gateway`;
    }
    case "start-event":
      return eventLabel("Start", e);
    case "intermediate-event":
      return eventLabel("Intermediate", e);
    case "end-event":
      return eventLabel("End", e);
    case "data-object":
      return "Data Object";
    case "data-store":
      return "Data Store";
    case "text-annotation":
      return "Text Annotation";
    case "group":
      return "Group";
    case "pool":
      return "Pool";
    case "lane":
      return "Lane";
    default:
      return e.type;
  }
}

function eventLabel(prefix: string, e: DiagramElement): string {
  const et = e.eventType ?? "none";
  const flow = e.flowType ?? "none";
  const repeat = e.repeatType ?? "none";
  const segs: string[] = [prefix];
  if (et !== "none") segs.push(cap(et));
  if (flow === "throwing") segs.push("(throwing)");
  if (flow === "catching") segs.push("(catching)");
  segs.push("Event");
  if (repeat !== "none") segs.push(`[${repeat}]`);
  return segs.join(" ");
}

function cap(s: string): string {
  if (!s) return s;
  return s
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function friendlyConnectorType(t: ConnectorType): string {
  switch (t) {
    case "sequence":
      return "Sequence Flows";
    case "messageBPMN":
      return "Message Flows";
    case "associationBPMN":
      return "Associations";
    case "flow":
      return "Flows";
    case "transition":
      return "Transitions";
    case "association":
      return "Associations";
    case "message":
      return "Messages";
    case "uml-association":
      return "UML Associations";
    case "uml-aggregation":
      return "UML Aggregations";
    case "uml-composition":
      return "UML Compositions";
    case "uml-generalisation":
      return "UML Generalisations";
    default:
      return t;
  }
}
