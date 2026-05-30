/**
 * BPMN diagram structural-invariant checker — the single source of truth for
 * the diagram "rules".
 *
 * Operates on a laid-out diagram ({ elements, connectors }) — the same shape
 * the layout engine emits and that an exported `.json` carries under
 * diagrams[].data. It is layout-agnostic: it validates the RESULT, so it
 * catches problems no matter whether the diagram came from the AI generator,
 * a Visio import, or hand editing.
 *
 * Consumed by:
 *   - the layout-engine regression tests + the dropped-export tests
 *     (assert zero violations),
 *   - the in-app "Scan Diagrams for Issues" route
 *     (app/api/projects/[id]/scan-pool-connectors) — it runs this registry
 *     and maps the violations back into its response shape,
 *   - the admin "View Scanner Issues Rules" viewer — lists RULES metadata.
 *
 * Each rule is `{ id, title, description, severity, category, check }`.
 * Adding a rule = add one entry to RULES; it then runs in the tests AND the
 * in-app scan, and shows up in the admin viewer automatically.
 */
import type { DiagramElement, Connector } from "../types";

export interface DiagramLike {
  elements: DiagramElement[];
  connectors: Connector[];
}

export type Severity = "error" | "warning";

/** A rule's "bucket" — maps onto the in-app scanner's response sections. */
export type RuleCategory =
  | "pool-lane-connector"
  | "duplicate-name"
  | "single-lane-pool"
  | "hanging-message"
  | "bpmn-structure";

export interface Violation {
  rule: string;
  severity: Severity;
  ids: string[];
  message: string;
  /** Optional rich payload for the in-app UI (matches the legacy per-category
   *  item shape). The tests ignore it. */
  data?: Record<string, unknown>;
}

export interface Rule {
  id: string;
  title: string;
  description: string;
  /** Nominal severity for the rules viewer. A rule may still emit individual
   *  violations at a different severity (hanging messages do). */
  severity: Severity;
  category: RuleCategory;
  check: (d: DiagramLike) => Violation[];
}

// ── shared helpers ───────────────────────────────────────────────────────────

const PAD_TOLERANCE = 1; // sub-pixel rounding slack when comparing bounds
const rightOf = (e: DiagramElement) => e.x + e.width;
const bottomOf = (e: DiagramElement) => e.y + e.height;

function contains(parent: DiagramElement, child: DiagramElement): boolean {
  return (
    child.x >= parent.x - PAD_TOLERANCE &&
    child.y >= parent.y - PAD_TOLERANCE &&
    rightOf(child) <= rightOf(parent) + PAD_TOLERANCE &&
    bottomOf(child) <= bottomOf(parent) + PAD_TOLERANCE
  );
}

const isEventSub = (e: DiagramElement) =>
  e.type === "subprocess-expanded" &&
  (e.properties?.subprocessType as string | undefined) === "event";

const poolTypeOf = (e: DiagramElement) => (e.properties?.poolType as string | undefined) ?? "";
const labelOrType = (e: DiagramElement | undefined) => e?.label || e?.type || "(unknown)";
// Human-readable name for messages: prefer the user-visible label, fall back
// to the internal id only when the element has no label set.
const nameOf = (e: DiagramElement | undefined) => (e?.label?.trim()) || e?.id || "(unknown)";
const normaliseName = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const num = (v: unknown): v is number => typeof v === "number";

// ── BPMN structural rules (also run by the harness) ─────────────────────────

/** Every connector endpoint and every parentId / boundaryHostId resolves. */
export function checkReferentialIntegrity(d: DiagramLike): Violation[] {
  const ids = new Set(d.elements.map((e) => e.id));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (!ids.has(c.sourceId)) out.push({ rule: "ref-integrity", severity: "error", ids: [c.id], message: `connector ${c.id} source "${c.sourceId}" does not exist` });
    if (!ids.has(c.targetId)) out.push({ rule: "ref-integrity", severity: "error", ids: [c.id], message: `connector ${c.id} target "${c.targetId}" does not exist` });
  }
  for (const e of d.elements) {
    if (e.parentId && !ids.has(e.parentId)) out.push({ rule: "ref-integrity", severity: "error", ids: [e.id], message: `element ${e.id} parentId "${e.parentId}" does not exist` });
    if (e.boundaryHostId && !ids.has(e.boundaryHostId)) out.push({ rule: "ref-integrity", severity: "error", ids: [e.id], message: `element ${e.id} boundaryHostId "${e.boundaryHostId}" does not exist` });
  }
  return out;
}

/** Every container (pool, lane, expanded subprocess) fully encloses each of
 *  its direct children. Boundary events straddle their host edge and are exempt.
 *
 *  Severity: overflowing a POOL or SUBPROCESS is a structural ERROR (the
 *  element escapes the process boundary). Overflowing only a LANE while still
 *  inside the pool is a WARNING — the element is correctly in the process
 *  hierarchy, it just crosses a swimlane divider (common for cross-lane
 *  gateways, and the symptom of a lane sized smaller than its content). */
export function checkContainment(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const CONTAINERS = new Set(["pool", "lane", "subprocess-expanded"]);
  const poolAncestor = (e: DiagramElement): DiagramElement | undefined => {
    let cur: DiagramElement | undefined = e.parentId ? byId.get(e.parentId) : undefined;
    for (let i = 0; i < 32 && cur; i++) {
      if (cur.type === "pool") return cur;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };
  const out: Violation[] = [];
  for (const child of d.elements) {
    if (!child.parentId || child.boundaryHostId) continue;
    const parent = byId.get(child.parentId);
    if (!parent || !CONTAINERS.has(parent.type)) continue;
    if (contains(parent, child)) continue;
    // Lane overflow that's still inside the pool → warning; anything else → error.
    const pool = parent.type === "lane" ? poolAncestor(parent) : undefined;
    const withinPool = !!pool && contains(pool, child);
    const note = withinPool ? " — outside its lane but still within the pool" : "";
    out.push({
      rule: "containment",
      severity: withinPool ? "warning" : "error",
      ids: [parent.id, child.id],
      message: `${parent.type} "${nameOf(parent)}" does not fully contain "${nameOf(child)}"${note}`,
    });
  }
  return out;
}

/** No fabricated "Main Process" wrapper. A pool-level event subprocess must
 *  render directly in its pool, not inside an auto-generated container. */
export function checkNoFabricatedWrapper(d: DiagramLike): Violation[] {
  return d.elements
    .filter((e) => e.id.startsWith("_wrapper_") || (e.type === "subprocess-expanded" && e.label === "Main Process"))
    .map((e) => ({ rule: "no-fabricated-wrapper", severity: "error" as const, ids: [e.id], message: `fabricated wrapper "${nameOf(e)}" present — pool-level event sub-processes should not be wrapped` }));
}

/** BPMN: an Event Sub-Process is triggered by an event, never by sequence or
 *  message flow — so no connector may touch it (R6.12/R7.03). */
export function checkEventSubHasNoConnectors(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const eventSubIds = new Set(d.elements.filter(isEventSub).map((e) => e.id));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (eventSubIds.has(c.sourceId) || eventSubIds.has(c.targetId)) {
      const evId = eventSubIds.has(c.sourceId) ? c.sourceId : c.targetId;
      out.push({ rule: "event-sub-no-connectors", severity: "error", ids: [c.id], message: `connector touches event sub-process "${nameOf(byId.get(evId))}" — forbidden` });
    }
  }
  return out;
}

/** BPMN: boundary (intermediate) events may only mount on an Activity
 *  (task / subprocess) — never on a Pool or Lane. */
export function checkNoBoundaryEventsOnPool(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const out: Violation[] = [];
  for (const e of d.elements) {
    if (!e.boundaryHostId) continue;
    const host = byId.get(e.boundaryHostId);
    if (host && (host.type === "pool" || host.type === "lane")) {
      out.push({ rule: "no-boundary-on-pool", severity: "error", ids: [e.id, host.id], message: `event "${nameOf(e)}" is mounted on ${host.type} "${nameOf(host)}" — boundary events may only attach to a task or subprocess` });
    }
  }
  return out;
}

/** A merge gateway must sit to the RIGHT of its forward (non-loop) inputs.
 *  A loop / rework back-edge (source physically to the right of the merge) is
 *  ignored. Flags the column-collapse bug where a loop drags the merge to the
 *  far right, left of its real upstream. */
export function checkMergeRightOfForwardInputs(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const incoming = new Map<string, Connector[]>();
  const outgoing = new Map<string, Connector[]>();
  for (const c of d.connectors) {
    if (c.type === "messageBPMN" || c.type === "associationBPMN") continue;
    (incoming.get(c.targetId) ?? incoming.set(c.targetId, []).get(c.targetId)!).push(c);
    (outgoing.get(c.sourceId) ?? outgoing.set(c.sourceId, []).get(c.sourceId)!).push(c);
  }
  const out: Violation[] = [];
  for (const g of d.elements) {
    if (g.type !== "gateway") continue;
    const ins = incoming.get(g.id) ?? [];
    const outs = outgoing.get(g.id) ?? [];
    if (!(ins.length >= 2 && outs.length <= 1)) continue; // not a merge
    const gcx = g.x + g.width / 2;
    const forward = ins
      .map((c) => byId.get(c.sourceId))
      .filter((s): s is DiagramElement => !!s && s.x + s.width / 2 < gcx);
    if (forward.length === 0) {
      out.push({ rule: "merge-placement", severity: "error", ids: [g.id], message: `merge gateway "${nameOf(g)}" sits left of ALL its inputs (loop back-edge likely dragged its column)` });
    }
  }
  return out;
}

// ── Import-hygiene / pool rules (ported from the in-app scanner) ─────────────

const SEQUENCE_LIKE = new Set<string>(["sequence", "flow", "associationBPMN", "association"]);
const CONTAINER_TYPES = new Set<string>(["pool", "lane"]);

/** Sequence / association / flow connectors whose source or target is a Pool
 *  or Lane — in BPMN these must attach to flow elements, not the container. */
export function checkConnectorOnContainer(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    const cType = (c.type ?? "").toString();
    if (!SEQUENCE_LIKE.has(cType)) continue;
    const src = byId.get(c.sourceId);
    const tgt = byId.get(c.targetId);
    const srcIsContainer = !!src && CONTAINER_TYPES.has(src.type);
    const tgtIsContainer = !!tgt && CONTAINER_TYPES.has(tgt.type);
    if (!srcIsContainer && !tgtIsContainer) continue;
    out.push({
      rule: "connector-on-container",
      severity: "error",
      ids: [c.id],
      message: `${cType} connector ${labelOrType(src)} [${src?.type ?? "?"}] → ${labelOrType(tgt)} [${tgt?.type ?? "?"}] attaches to a Pool/Lane`,
      data: {
        connectorId: c.id,
        type: cType,
        sourceName: labelOrType(src),
        sourceType: src?.type ?? "(unknown)",
        targetName: labelOrType(tgt),
        targetType: tgt?.type ?? "(unknown)",
        sourceIsContainer: srcIsContainer,
        targetIsContainer: tgtIsContainer,
      },
    });
  }
  return out;
}

/** Pools / Lanes that share an identical (case- and whitespace-insensitive)
 *  label within the same diagram. */
export function checkDuplicateContainerName(d: DiagramLike): Violation[] {
  const buckets = new Map<string, { id: string; type: string }[]>();
  for (const e of d.elements) {
    if (!CONTAINER_TYPES.has(e.type)) continue;
    const key = normaliseName(e.label ?? "");
    if (!key) continue;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push({ id: e.id, type: e.type });
  }
  const out: Violation[] = [];
  for (const [, list] of buckets) {
    if (list.length < 2) continue;
    const sampleLabel = (d.elements.find((e) => e.id === list[0].id)?.label ?? "").replace(/\s+/g, " ").trim();
    out.push({
      rule: "duplicate-container-name",
      severity: "error",
      ids: list.map((x) => x.id),
      message: `${list.length} containers share the name "${sampleLabel}" (${list.map((x) => x.type).join(", ")})`,
      data: { name: sampleLabel, elements: list },
    });
  }
  return out;
}

/** A Pool with exactly one child Lane — usually an import remnant; the lane
 *  should be absorbed into the pool. */
export function checkSingleLanePool(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const lanesByPool = new Map<string, DiagramElement[]>();
  for (const e of d.elements) {
    if (e.type !== "lane" || !e.parentId) continue;
    const parent = byId.get(e.parentId);
    if (!parent || parent.type !== "pool") continue;
    (lanesByPool.get(parent.id) ?? lanesByPool.set(parent.id, []).get(parent.id)!).push(e);
  }
  const out: Violation[] = [];
  for (const [poolId, lanes] of lanesByPool) {
    if (lanes.length !== 1) continue;
    const pool = byId.get(poolId);
    if (!pool) continue;
    out.push({
      rule: "single-lane-pool",
      severity: "error",
      ids: [poolId, lanes[0].id],
      message: `pool "${nameOf(pool)}" contains a single lane "${nameOf(lanes[0])}"`,
      data: { poolId, poolName: pool.label ?? "", laneId: lanes[0].id, laneName: lanes[0].label ?? "" },
    });
  }
  return out;
}

/** Hanging messages — messageBPMN connectors that render badly: attached to an
 *  empty white-box pool (error), attached to a white-box pool that has children
 *  (warning), no x-axis overlap between ends (error), or attached to the wrong
 *  top/bottom edge (error). Faithful port of the in-app scanner. */
export function checkHangingMessage(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const poolHasChildren = new Map<string, boolean>();
  for (const e of d.elements) {
    if (!e.parentId) continue;
    const parent = byId.get(e.parentId);
    if (parent?.type === "pool") poolHasChildren.set(parent.id, true);
  }
  const getContainerBox = (el: DiagramElement): { x: number; y: number; w: number; h: number } | null => {
    if (!num(el.x) || !num(el.y) || !num(el.width) || !num(el.height)) return null;
    let cur: DiagramElement | undefined = el;
    while (cur?.parentId) {
      const p = byId.get(cur.parentId);
      if (!p) break;
      if (p.type === "pool" && num(p.x) && num(p.y) && num(p.width) && num(p.height)) {
        return { x: p.x, y: p.y, w: p.width, h: p.height };
      }
      cur = p;
    }
    return { x: el.x, y: el.y, w: el.width, h: el.height };
  };
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if ((c.type ?? "") !== "messageBPMN") continue;
    const src = byId.get(c.sourceId);
    const tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    const srcIsWhitePool = src.type === "pool" && poolTypeOf(src) === "white-box";
    const tgtIsWhitePool = tgt.type === "pool" && poolTypeOf(tgt) === "white-box";
    let reason = "";
    let severity: Severity = "error";
    if (srcIsWhitePool || tgtIsWhitePool) {
      const srcEmpty = srcIsWhitePool && !poolHasChildren.get(src.id);
      const tgtEmpty = tgtIsWhitePool && !poolHasChildren.get(tgt.id);
      if (srcEmpty || tgtEmpty) {
        reason = "white-box pool has no contents — should be black-box";
        severity = "error";
      } else {
        reason = "message is attached to white-box pool";
        severity = "warning";
      }
    } else if (num(src.x) && num(src.width) && num(tgt.x) && num(tgt.width)) {
      const overlapMax = Math.min(src.x + src.width, tgt.x + tgt.width);
      const overlapMin = Math.max(src.x, tgt.x);
      if (overlapMax <= overlapMin) {
        reason = "no x-axis overlap between source and target";
        severity = "error";
      }
    }
    if (!reason) {
      const checkEnd = (endEl: DiagramElement, endSide: string | undefined, otherEl: DiagramElement): string | null => {
        if (endSide !== "top" && endSide !== "bottom") return null;
        const box = getContainerBox(endEl);
        if (!box || !num(otherEl.y) || !num(otherEl.height)) return null;
        const otherCenterY = otherEl.y + otherEl.height / 2;
        if (endSide === "top" && otherCenterY > box.y + box.h) {
          return endEl.type === "pool"
            ? "message attached to top of pool but other end is below"
            : "message attached to top of element but other end is below the containing pool";
        }
        if (endSide === "bottom" && otherCenterY < box.y) {
          return endEl.type === "pool"
            ? "message attached to bottom of pool but other end is above"
            : "message attached to bottom of element but other end is above the containing pool";
        }
        return null;
      };
      const srcReason = checkEnd(src, c.sourceSide, tgt);
      const tgtReason = srcReason ? null : checkEnd(tgt, c.targetSide, src);
      const msg = srcReason ?? tgtReason;
      if (msg) { reason = msg; severity = "error"; }
    }
    if (!reason) continue;
    out.push({
      rule: "hanging-message",
      severity,
      ids: [c.id],
      message: `${labelOrType(src)} [${src.type}] → ${labelOrType(tgt)} [${tgt.type}]: ${reason}`,
      data: {
        connectorId: c.id,
        sourceName: labelOrType(src),
        sourceType: src.type,
        targetName: labelOrType(tgt),
        targetType: tgt.type,
        reason,
        severity,
      },
    });
  }
  return out;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const RULES: Rule[] = [
  {
    id: "connector-on-container",
    title: "Sequence/association connector on a Pool or Lane",
    description: "A sequence, association or flow connector attaches to a Pool or Lane. In BPMN these must connect to flow elements inside the container, not to the container boundary.",
    severity: "error",
    category: "pool-lane-connector",
    check: checkConnectorOnContainer,
  },
  {
    id: "duplicate-container-name",
    title: "Duplicate Pool/Lane names",
    description: "Two or more Pools or Lanes in the same diagram share an identical name (ignoring case and whitespace) — usually an import remnant.",
    severity: "error",
    category: "duplicate-name",
    check: checkDuplicateContainerName,
  },
  {
    id: "single-lane-pool",
    title: "Pool with a single Lane",
    description: "A Pool contains exactly one Lane. Usually the lane should be absorbed into the pool.",
    severity: "error",
    category: "single-lane-pool",
    check: checkSingleLanePool,
  },
  {
    id: "hanging-message",
    title: "Hanging / misconnected message flow",
    description: "A message flow renders badly: attached to an empty white-box pool (should be black-box), attached to a white-box pool (warning), no horizontal overlap between its ends, or attached to the wrong top/bottom edge.",
    severity: "error",
    category: "hanging-message",
    check: checkHangingMessage,
  },
  {
    id: "containment",
    title: "Element outside its container",
    description: "An element is rendered outside the bounds of its parent Pool, Lane or expanded Sub-Process.",
    severity: "error",
    category: "bpmn-structure",
    check: checkContainment,
  },
  {
    id: "ref-integrity",
    title: "Dangling reference",
    description: "A connector endpoint, parentId or boundaryHostId points at an element id that does not exist.",
    severity: "error",
    category: "bpmn-structure",
    check: checkReferentialIntegrity,
  },
  {
    id: "no-fabricated-wrapper",
    title: "Fabricated 'Main Process' wrapper",
    description: "A pool-level event sub-process is wrapped in an auto-generated 'Main Process' container. It should render directly in its pool.",
    severity: "error",
    category: "bpmn-structure",
    check: checkNoFabricatedWrapper,
  },
  {
    id: "event-sub-no-connectors",
    title: "Connector on an Event Sub-Process",
    description: "A sequence or message flow touches an Event Sub-Process. Event sub-processes are triggered by events, never by flow.",
    severity: "error",
    category: "bpmn-structure",
    check: checkEventSubHasNoConnectors,
  },
  {
    id: "no-boundary-on-pool",
    title: "Boundary event on a Pool or Lane",
    description: "A boundary (intermediate) event is mounted on a Pool or Lane. Boundary events may only attach to an activity (Task or Sub-Process).",
    severity: "error",
    category: "bpmn-structure",
    check: checkNoBoundaryEventsOnPool,
  },
  {
    id: "merge-placement",
    title: "Merge gateway left of its inputs",
    description: "A merge gateway is positioned to the left of all its forward inputs — typically a rework loop's back-edge dragging its column to the far right.",
    severity: "error",
    category: "bpmn-structure",
    check: checkMergeRightOfForwardInputs,
  },
];

/** Run every rule and return the combined violation list. */
export function checkDiagram(d: DiagramLike): Violation[] {
  return RULES.flatMap((rule) => rule.check(d));
}

/** Rule metadata for the admin viewer (no check functions). */
export function rulesMetadata(): Omit<Rule, "check">[] {
  return RULES.map(({ check: _check, ...meta }) => meta);
}

/** Pretty-print violations for test output / CLI. */
export function formatViolations(violations: Violation[]): string {
  if (violations.length === 0) return "no violations";
  return violations.map((v) => `  [${v.severity}] [${v.rule}] ${v.message}`).join("\n");
}
