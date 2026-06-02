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
  /** Stable short code (B01, B02, …) used in conversation and bug
   *  reports. Assign manually; never derive from array order — adding a
   *  rule in the middle of the list must not renumber the others. */
  code: string;
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

/** BPMN lanes represent PERFORMERS (roles / systems). Only *activities* have
 *  a performer — gateways are pure flow-routing and events are triggers, so
 *  neither needs to sit inside a specific lane. Pools, however, are the
 *  process scope: every flow element must stay inside its pool regardless
 *  of type. */
const ACTIVITY_TYPES = new Set<string>(["task", "subprocess", "subprocess-expanded"]);

/** Every container (pool, lane, expanded subprocess) fully encloses each of
 *  its direct children — with one BPMN-aware exemption: a gateway or event
 *  that overflows only its LANE (while staying inside the pool) is NOT
 *  flagged, because non-activities aren't bound to a performer's lane. They
 *  ARE still required to stay inside the pool.
 *
 *  Severity: overflowing a POOL or SUBPROCESS is a structural ERROR (the
 *  element escapes the process boundary). An activity overflowing only a
 *  LANE while still inside the pool is a WARNING (a lane that's too small
 *  for the work it contains). */
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

    // Lane overflow for a non-activity (gateway / event) is acceptable in
    // BPMN — only the pool boundary matters for these. Verify it didn't
    // escape the pool, then move on.
    if (parent.type === "lane" && !ACTIVITY_TYPES.has(child.type)) {
      const pool = poolAncestor(parent);
      if (pool && !contains(pool, child)) {
        out.push({
          rule: "containment",
          severity: "error",
          ids: [pool.id, child.id],
          message: `${child.type} "${nameOf(child)}" sits outside its pool "${nameOf(pool)}"`,
        });
      }
      continue;
    }

    // Activity overflowing a lane (still inside the pool) → warning. Any
    // overflow of a pool or subprocess (or activity escaping its pool) → error.
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

/** Subprocess-expanded that is acting as a process scope (event sub OR
 *  contains its own Start event — e.g. a "Main Process" wrapper) doesn't
 *  participate in the outer sequence flow, so the activity-no-incoming /
 *  outgoing rules below exempt it. Event sub-processes are trigger-driven
 *  by definition; wrapper subprocesses are containers, not flow steps. */
function isScopeSubprocess(e: DiagramElement, all: DiagramElement[]): boolean {
  if (e.type !== "subprocess-expanded") return false;
  if (isEventSub(e)) return true;
  return all.some((c) => c.parentId === e.id && c.type === "start-event");
}

/** An Expanded Sub-Process is "ad-hoc" when its element.properties.adHoc
 *  flag is true. Activities inside an ad-hoc EP run in any order — no
 *  sequence flow between them, no start/end events on or inside the EP. */
function isAdHocEP(e: DiagramElement | undefined): boolean {
  if (!e) return false;
  return e.type === "subprocess-expanded" &&
    (e.properties?.adHoc as boolean | undefined) === true;
}

/** Walk the parentId chain and return the nearest enclosing expanded
 *  sub-process, if any. Used by the EP-aware activity rules. */
function findEnclosingEP(e: DiagramElement, byId: Map<string, DiagramElement>): DiagramElement | undefined {
  let cur: DiagramElement | undefined = e.parentId ? byId.get(e.parentId) : undefined;
  for (let i = 0; i < 32 && cur; i++) {
    if (cur.type === "subprocess-expanded") return cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return undefined;
}

/** Every Activity (Task / Sub-Process / Expanded Sub-Process) must have at
 *  least one incoming sequence connector — with two EP-aware allowances:
 *    1. Activities inside an ad-hoc EP are NEVER flagged (ad-hoc EPs
 *       have no sequence flow between children by definition).
 *    2. Inside a non-ad-hoc EP up to ONE orphan activity is allowed
 *       (the entry point). The second-and-beyond orphans are errors.
 *  Top-level activities (not inside any EP) keep the strict rule —
 *  every one of them must have an incoming sequence connector. */
export function checkActivityHasIncoming(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const incoming = new Map<string, number>();
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    incoming.set(c.targetId, (incoming.get(c.targetId) ?? 0) + 1);
  }
  const topLevelOrphans: DiagramElement[] = [];
  const epOrphans = new Map<string, DiagramElement[]>();
  for (const e of d.elements) {
    if (!ACTIVITY_TYPES.has(e.type)) continue;
    if (isScopeSubprocess(e, d.elements)) continue;
    if ((incoming.get(e.id) ?? 0) > 0) continue;
    const ep = findEnclosingEP(e, byId);
    if (!ep) { topLevelOrphans.push(e); continue; }
    if (isAdHocEP(ep)) continue;
    (epOrphans.get(ep.id) ?? epOrphans.set(ep.id, []).get(ep.id)!).push(e);
  }
  const out: Violation[] = [];
  for (const e of topLevelOrphans) {
    out.push({
      rule: "activity-no-incoming",
      severity: "error",
      ids: [e.id],
      message: `${e.type} "${nameOf(e)}" has no incoming sequence connector`,
    });
  }
  for (const [epId, orphans] of epOrphans) {
    if (orphans.length <= 1) continue; // one orphan per non-ad-hoc EP is allowed
    const ep = byId.get(epId)!;
    for (let i = 1; i < orphans.length; i++) {
      const e = orphans[i];
      out.push({
        rule: "activity-no-incoming",
        severity: "error",
        ids: [e.id, ep.id],
        message: `${e.type} "${nameOf(e)}" inside Sub-Process "${nameOf(ep)}" has no incoming sequence (only one entry activity allowed per non-ad-hoc Sub-Process)`,
      });
    }
  }
  return out;
}

/** Every Activity must have at least one outgoing sequence connector,
 *  with the same EP-aware allowances as checkActivityHasIncoming. */
export function checkActivityHasOutgoing(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const outgoing = new Map<string, number>();
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    outgoing.set(c.sourceId, (outgoing.get(c.sourceId) ?? 0) + 1);
  }
  const topLevelOrphans: DiagramElement[] = [];
  const epOrphans = new Map<string, DiagramElement[]>();
  for (const e of d.elements) {
    if (!ACTIVITY_TYPES.has(e.type)) continue;
    if (isScopeSubprocess(e, d.elements)) continue;
    if ((outgoing.get(e.id) ?? 0) > 0) continue;
    const ep = findEnclosingEP(e, byId);
    if (!ep) { topLevelOrphans.push(e); continue; }
    if (isAdHocEP(ep)) continue;
    (epOrphans.get(ep.id) ?? epOrphans.set(ep.id, []).get(ep.id)!).push(e);
  }
  const out: Violation[] = [];
  for (const e of topLevelOrphans) {
    out.push({
      rule: "activity-no-outgoing",
      severity: "error",
      ids: [e.id],
      message: `${e.type} "${nameOf(e)}" has no outgoing sequence connector`,
    });
  }
  for (const [epId, orphans] of epOrphans) {
    if (orphans.length <= 1) continue;
    const ep = byId.get(epId)!;
    for (let i = 1; i < orphans.length; i++) {
      const e = orphans[i];
      out.push({
        rule: "activity-no-outgoing",
        severity: "error",
        ids: [e.id, ep.id],
        message: `${e.type} "${nameOf(e)}" inside Sub-Process "${nameOf(ep)}" has no outgoing sequence (only one exit activity allowed per non-ad-hoc Sub-Process)`,
      });
    }
  }
  return out;
}

/** An ad-hoc EP must not contain or boundary-mount Start or End events —
 *  the whole point of ad-hoc is that its activities run in any order with
 *  no defined start / end semantics. */
export function checkAdHocEPHasNoStartEnd(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const out: Violation[] = [];
  for (const e of d.elements) {
    if (e.type !== "start-event" && e.type !== "end-event") continue;
    const host = e.boundaryHostId
      ? byId.get(e.boundaryHostId)
      : (e.parentId ? byId.get(e.parentId) : undefined);
    if (!isAdHocEP(host)) continue;
    const where = e.boundaryHostId ? "is mounted on the boundary of" : "is inside";
    out.push({
      rule: "adhoc-ep-no-start-end",
      severity: "error",
      ids: [e.id, host!.id],
      message: `${e.type} "${nameOf(e)}" ${where} ad-hoc Sub-Process "${nameOf(host!)}" — ad-hoc Sub-Processes cannot have Start or End events`,
    });
  }
  return out;
}

/** Returns the set of element ids touched by ANY association connector
 *  (either side). Shared by the data-object and data-store rules below. */
function associationConnectedIds(d: DiagramLike): Set<string> {
  const ids = new Set<string>();
  for (const c of d.connectors) {
    if (c.type !== "associationBPMN" && c.type !== "association") continue;
    ids.add(c.sourceId);
    ids.add(c.targetId);
  }
  return ids;
}

/** A Data Object that isn't connected to anything via an association
 *  isn't doing any work — flag as a warning so the modeller wires it up
 *  or removes it. */
export function checkDataObjectHasAssociation(d: DiagramLike): Violation[] {
  const connected = associationConnectedIds(d);
  const out: Violation[] = [];
  for (const e of d.elements) {
    if (e.type !== "data-object") continue;
    if (connected.has(e.id)) continue;
    out.push({
      rule: "data-object-no-association",
      severity: "warning",
      ids: [e.id],
      message: `Data Object "${nameOf(e)}" has no association connector — connect it to the activity it informs or attach data flow`,
    });
  }
  return out;
}

/** Same as above for Data Stores. */
export function checkDataStoreHasAssociation(d: DiagramLike): Violation[] {
  const connected = associationConnectedIds(d);
  const out: Violation[] = [];
  for (const e of d.elements) {
    if (e.type !== "data-store") continue;
    if (connected.has(e.id)) continue;
    out.push({
      rule: "data-store-no-association",
      severity: "warning",
      ids: [e.id],
      message: `Data Store "${nameOf(e)}" has no association connector — connect it to the activities that read from or write to it`,
    });
  }
  return out;
}

/** Return the host's side on which an edge-mounted event sits, based on
 *  the event's centre relative to the host's centre. "top"/"bottom"/
 *  "left"/"right" — the side AWAY from the host body, i.e. the outer
 *  attachment side. Used by checkEdgeMountEventOuterRouting. */
function outerSideOfEdgeMountEvent(
  e: DiagramElement,
  host: DiagramElement,
): "top" | "bottom" | "left" | "right" {
  const ecx = e.x + e.width / 2;
  const ecy = e.y + e.height / 2;
  const distTop    = Math.abs(ecy - host.y);
  const distBottom = Math.abs(ecy - (host.y + host.height));
  const distLeft   = Math.abs(ecx - host.x);
  const distRight  = Math.abs(ecx - (host.x + host.width));
  const min = Math.min(distTop, distBottom, distLeft, distRight);
  if (min === distTop) return "top";
  if (min === distBottom) return "bottom";
  if (min === distLeft) return "left";
  return "right";
}

/** Walk an element's parentId chain and return true if `ancestorId`
 *  appears in it (the element is a descendant). Shared by several
 *  edge-mount and EP rules below. */
function isDescendantOfId(
  byId: Map<string, DiagramElement>,
  elId: string | undefined,
  ancestorId: string,
): boolean {
  let cur: DiagramElement | undefined = elId ? byId.get(elId) : undefined;
  const visited = new Set<string>();
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    if (cur.parentId === ancestorId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/** Edge-mounted intermediate events used as the TARGET of an incoming
 *  sequence connector must (a) attach on the OUTER side of the event
 *  and (b) have a source that sits OUTSIDE the host subprocess. This
 *  enforces the "external trigger" pattern. Outgoing connectors from
 *  these events are handled by R8.09 (B27) which requires INNER. */
export function checkEdgeMountEventOuterRouting(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const tgt = byId.get(c.targetId);
    if (!tgt || tgt.type !== "intermediate-event" || !tgt.boundaryHostId) continue;
    const host = byId.get(tgt.boundaryHostId);
    if (!host) continue;
    const outer = outerSideOfEdgeMountEvent(tgt, host);
    if (c.targetSide && c.targetSide !== outer) {
      out.push({
        rule: "edge-mount-event-outer-routing",
        severity: "error",
        ids: [c.id, tgt.id, host.id],
        message: `Incoming sequence on edge-mounted intermediate event "${nameOf(tgt)}" attached on its inner side ("${c.targetSide}") — must attach on the outer side ("${outer}") so the trigger comes from outside the host.`,
      });
      continue;
    }
    const src = byId.get(c.sourceId);
    if (!src) continue;
    if (src.parentId === host.id || isDescendantOfId(byId, src.parentId, host.id)) {
      out.push({
        rule: "edge-mount-event-outer-routing",
        severity: "error",
        ids: [c.id, tgt.id, host.id, src.id],
        message: `Incoming sequence on edge-mounted intermediate event "${nameOf(tgt)}" originates inside its host "${nameOf(host)}" — boundary intermediate events represent external triggers; the source must sit outside the host.`,
      });
    }
  }
  return out;
}

/** A messageBPMN connector is "moveable" — its body can slide
 *  horizontally and its endpoints can re-attach — only when the
 *  structure the renderer + reducer rely on is fully populated:
 *
 *    • exactly 4 waypoints (centre, srcEdge, tgtEdge, centre)
 *    • sourceSide and targetSide set
 *    • sourceOffsetAlong set so recomputeAllConnectors places the edge
 *      points at the correct shared X
 *
 *  Connectors that fail any of these tests render but resist drag and
 *  endpoint move. This typically happens with hand-edited imports or
 *  legacy data from before the messageBPMN structure was finalised. */
export function checkMessageFlowMoveable(d: DiagramLike): Violation[] {
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "messageBPMN") continue;
    const problems: string[] = [];
    if (!c.waypoints || c.waypoints.length !== 4) {
      problems.push(`has ${c.waypoints?.length ?? 0} waypoints (must be 4)`);
    }
    if (!c.sourceSide) problems.push("sourceSide not set");
    if (!c.targetSide) problems.push("targetSide not set");
    if (c.sourceOffsetAlong == null) problems.push("sourceOffsetAlong not set");
    if (problems.length === 0) continue;
    out.push({
      rule: "message-not-moveable",
      severity: "warning",
      ids: [c.id, c.sourceId, c.targetId],
      message: `Message flow ${c.id} cannot be moved or re-attached: ${problems.join(", ")}.`,
    });
  }
  return out;
}

/** R8.04 — Loop-back (rework) sequence connectors. When the target sits
 *  to the LEFT of the source (or directly below and to the left), the
 *  flow is a rework loop and BPMN convention routes it underneath the
 *  forward flow: attach at BOTTOM of both source and target. Flag any
 *  loop-back whose source or target side is not "bottom". */
export function checkLoopBackRouting(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map(e => [e.id, e]));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const src = byId.get(c.sourceId);
    const tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    const srcCx = src.x + src.width / 2;
    const tgtCx = tgt.x + tgt.width / 2;
    // Loop-back = target's centre is to the LEFT of source's centre
    // (using element width as the threshold so neighbouring elements
    // at roughly the same x don't trip it).
    if (tgtCx >= srcCx - src.width / 4) continue;
    if (c.sourceSide !== "bottom" || c.targetSide !== "bottom") {
      out.push({
        rule: "loop-back-routing",
        severity: "warning",
        ids: [c.id, src.id, tgt.id],
        message: `Loop-back sequence "${nameOf(src)}" → "${nameOf(tgt)}" runs from source-side "${c.sourceSide ?? "?"}" to target-side "${c.targetSide ?? "?"}" — rework loops should attach BOTTOM-to-BOTTOM and detour underneath.`,
      });
    }
  }
  return out;
}

/** R8.05 — A sequence connector LEAVING an edge-mounted Start Event
 *  must emit from the INNER side (the side facing into the host EP).
 *  Catches AI-generated diagrams that exit the start event outward,
 *  away from its handler. */
export function checkBoundaryStartOutgoingInner(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map(e => [e.id, e]));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const src = byId.get(c.sourceId);
    if (!src || src.type !== "start-event" || !src.boundaryHostId) continue;
    const host = byId.get(src.boundaryHostId);
    if (!host) continue;
    const outer = outerSideOfEdgeMountEvent(src, host);
    const inner = oppositeSide(outer);
    if (c.sourceSide && c.sourceSide !== inner) {
      out.push({
        rule: "boundary-start-outgoing-inner",
        severity: "error",
        ids: [c.id, src.id, host.id],
        message: `Outgoing sequence from edge-mounted Start Event "${nameOf(src)}" emits from "${c.sourceSide}" — must emit from the INNER side ("${inner}") so the flow runs into the host EP.`,
      });
    }
  }
  return out;
}

/** R8.06 — A sequence connector TARGETING an edge-mounted Start Event
 *  must attach at the OUTER side AND originate from an element OUTSIDE
 *  the host EP. A boundary start represents an external trigger; an
 *  internal element handing flow to it would be nonsensical. */
export function checkBoundaryStartIncomingOuter(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map(e => [e.id, e]));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const tgt = byId.get(c.targetId);
    if (!tgt || tgt.type !== "start-event" || !tgt.boundaryHostId) continue;
    const host = byId.get(tgt.boundaryHostId);
    if (!host) continue;
    const outer = outerSideOfEdgeMountEvent(tgt, host);
    if (c.targetSide && c.targetSide !== outer) {
      out.push({
        rule: "boundary-start-incoming-outer",
        severity: "error",
        ids: [c.id, tgt.id, host.id],
        message: `Incoming sequence to edge-mounted Start Event "${nameOf(tgt)}" attaches at "${c.targetSide}" — must attach on the OUTER side ("${outer}").`,
      });
      continue;
    }
    const src = byId.get(c.sourceId);
    if (!src) continue;
    if (src.parentId === host.id || isDescendantOfId(byId, src.parentId, host.id)) {
      out.push({
        rule: "boundary-start-incoming-outer",
        severity: "error",
        ids: [c.id, tgt.id, host.id, src.id],
        message: `Edge-mounted Start Event "${nameOf(tgt)}" receives flow from "${nameOf(src)}" inside its host "${nameOf(host)}" — boundary start events represent external triggers; the source must sit outside the host.`,
      });
    }
  }
  return out;
}

/** R8.07 — A sequence connector TARGETING an edge-mounted End Event
 *  must attach at the INNER side AND originate from an element INSIDE
 *  the host EP. Boundary end events terminate an internal sub-flow
 *  along the host's boundary — nothing outside the host should hand
 *  flow to them. */
export function checkBoundaryEndIncomingInner(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map(e => [e.id, e]));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const tgt = byId.get(c.targetId);
    if (!tgt || tgt.type !== "end-event" || !tgt.boundaryHostId) continue;
    const host = byId.get(tgt.boundaryHostId);
    if (!host) continue;
    const outer = outerSideOfEdgeMountEvent(tgt, host);
    const inner = oppositeSide(outer);
    if (c.targetSide && c.targetSide !== inner) {
      out.push({
        rule: "boundary-end-incoming-inner",
        severity: "error",
        ids: [c.id, tgt.id, host.id],
        message: `Incoming sequence to edge-mounted End Event "${nameOf(tgt)}" attaches at "${c.targetSide}" — must attach on the INNER side ("${inner}").`,
      });
      continue;
    }
    const src = byId.get(c.sourceId);
    if (!src) continue;
    if (src.parentId !== host.id && !isDescendantOfId(byId, src.parentId, host.id)) {
      out.push({
        rule: "boundary-end-incoming-inner",
        severity: "error",
        ids: [c.id, tgt.id, host.id, src.id],
        message: `Edge-mounted End Event "${nameOf(tgt)}" receives flow from "${nameOf(src)}" outside its host "${nameOf(host)}" — boundary end events terminate an internal sub-flow; the source must sit inside the host.`,
      });
    }
  }
  return out;
}

/** R8.08 — An Expanded Subprocess must never directly auto-connect to
 *  one of its own descendants via a sequence connector. EP-to-child
 *  sequence flow is disallowed regardless of how deeply the child sits
 *  inside the EP. */
export function checkEpNoAutoConnectToDescendant(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map(e => [e.id, e]));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const src = byId.get(c.sourceId);
    const tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    if (src.type !== "subprocess-expanded") continue;
    if (!isDescendantOfId(byId, tgt.id, src.id)) continue;
    out.push({
      rule: "ep-no-autoconnect-descendant",
      severity: "error",
      ids: [c.id, src.id, tgt.id],
      message: `Expanded Sub-Process "${nameOf(src)}" has a sequence connector to its own descendant "${nameOf(tgt)}" — EPs cannot connect directly to anything they contain.`,
    });
  }
  return out;
}

/** R8.09 — A sequence connector LEAVING an edge-mounted Intermediate
 *  Event must emit from the OUTER side (the side facing AWAY from the
 *  host EP). Counterpart to B19 which covers INCOMING flow; both ends
 *  attach OUTER so the path never routes through the host body. */
export function checkBoundaryIntermediateOutgoingOuter(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map(e => [e.id, e]));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const src = byId.get(c.sourceId);
    if (!src || src.type !== "intermediate-event" || !src.boundaryHostId) continue;
    const host = byId.get(src.boundaryHostId);
    if (!host) continue;
    const outer = outerSideOfEdgeMountEvent(src, host);
    if (c.sourceSide && c.sourceSide !== outer) {
      out.push({
        rule: "boundary-intermediate-outgoing-outer",
        severity: "error",
        ids: [c.id, src.id, host.id],
        message: `Outgoing sequence from edge-mounted Intermediate Event "${nameOf(src)}" emits from "${c.sourceSide}" — must emit from the OUTER side ("${outer}") so the flow heads away from the host.`,
      });
    }
  }
  return out;
}

function oppositeSide(side: "top" | "bottom" | "left" | "right"): "top" | "bottom" | "left" | "right" {
  return side === "top" ? "bottom" : side === "bottom" ? "top" : side === "left" ? "right" : "left";
}

/** BPMN forbids more than one sequence connector between the same
 *  ordered (source → target) pair — duplicates are almost always an
 *  accidental drag-create or an import artefact. Direction matters:
 *  A→B and B→A together (a rework loop) is fine. Two A→B is not. */
export function checkDuplicateSequenceConnector(d: DiagramLike): Violation[] {
  const counts = new Map<string, string[]>(); // "src->tgt" → connector ids
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const key = `${c.sourceId}->${c.targetId}`;
    const ids = counts.get(key) ?? [];
    ids.push(c.id);
    counts.set(key, ids);
  }
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const out: Violation[] = [];
  for (const [key, ids] of counts) {
    if (ids.length < 2) continue;
    const [srcId, tgtId] = key.split("->");
    const src = byId.get(srcId);
    const tgt = byId.get(tgtId);
    // Flag every duplicate after the first so the user sees exactly
    // which connectors are redundant — the first is treated as canonical.
    for (let i = 1; i < ids.length; i++) {
      out.push({
        rule: "duplicate-sequence",
        severity: "error",
        ids: [ids[i], srcId, tgtId],
        message: `Duplicate sequence connector from "${nameOf(src)}" to "${nameOf(tgt)}" — only one sequence flow is allowed per (source, target) pair.`,
      });
    }
  }
  return out;
}

/** An ad-hoc EP must not have sequence connectors between its child
 *  activities — children run in any order, no ordering implied. */
export function checkAdHocEPNoSequenceBetweenChildren(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const src = byId.get(c.sourceId);
    const tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    if (!ACTIVITY_TYPES.has(src.type) || !ACTIVITY_TYPES.has(tgt.type)) continue;
    if (!src.parentId || src.parentId !== tgt.parentId) continue;
    const parent = byId.get(src.parentId);
    if (!isAdHocEP(parent)) continue;
    out.push({
      rule: "adhoc-ep-no-sequence-between-children",
      severity: "error",
      ids: [c.id, parent!.id],
      message: `sequence connector between activities inside ad-hoc Sub-Process "${nameOf(parent!)}" — ad-hoc Sub-Processes cannot have sequence flow between their child activities`,
    });
  }
  return out;
}

/** Count direction changes (bends) along an orthogonal connector path.
 *  Zero-length segments are ignored so a duplicated waypoint can't add a
 *  phantom bend. Used by checkConnectorBendiness. */
function countConnectorBends(waypoints: { x: number; y: number }[]): number {
  let bends = 0;
  for (let i = 1; i < waypoints.length - 1; i++) {
    const dx1 = waypoints[i].x - waypoints[i - 1].x;
    const dy1 = waypoints[i].y - waypoints[i - 1].y;
    const dx2 = waypoints[i + 1].x - waypoints[i].x;
    const dy2 = waypoints[i + 1].y - waypoints[i].y;
    if ((Math.abs(dx1) < 0.5 && Math.abs(dy1) < 0.5) || (Math.abs(dx2) < 0.5 && Math.abs(dy2) < 0.5)) continue;
    const horiz1 = Math.abs(dx1) > Math.abs(dy1);
    const horiz2 = Math.abs(dx2) > Math.abs(dy2);
    if (horiz1 !== horiz2) bends++;
  }
  return bends;
}

/** A sequence connector with too many bends is visually noisy and usually
 *  signals a layout problem (cramped detour, misplaced element, etc.). Flag
 *  anything with 4 or more direction changes as a warning. */
export function checkConnectorBendiness(d: DiagramLike): Violation[] {
  const BEND_THRESHOLD = 4;
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "sequence") continue;
    const bends = countConnectorBends(c.waypoints ?? []);
    if (bends >= BEND_THRESHOLD) {
      out.push({
        rule: "connector-bends",
        severity: "warning",
        ids: [c.id],
        message: `connector takes ${bends} bends — consider simplifying the route`,
      });
    }
  }
  return out;
}

/** BPMN convention: a Task/Sub-Process's message flows should drive its
 *  task type.
 *   - Message TO an external entity (non-IT black-box pool, e.g. Customer)
 *     → the task should be a Send task.
 *   - Message FROM an external entity → Receive task.
 *   - Message TO or FROM an IT system pool (e.g. Salesforce, SAP) →
 *     User task (because a human is interacting with the system).
 *  Emits one warning per mismatched message edge; ids include both the task
 *  and the offending connector so the connector can also be highlighted. */
export function checkTaskTypeForMessages(d: DiagramLike): Violation[] {
  const byId = new Map(d.elements.map((e) => [e.id, e]));
  const TASK_LIKE = new Set(["task", "subprocess", "subprocess-expanded"]);
  const poolAncestor = (e: DiagramElement | undefined): DiagramElement | undefined => {
    let cur = e;
    for (let i = 0; i < 32 && cur; i++) {
      if (cur.type === "pool") return cur;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };
  const poolKind = (p: DiagramElement | undefined): "external" | "system" | "white-box" | "unknown" => {
    if (!p) return "unknown";
    const poolType = (p.properties?.poolType as string | undefined) ?? "white-box";
    if (poolType !== "black-box") return "white-box";
    const isSystem = (p.properties?.isSystem as boolean | undefined) ?? false;
    return isSystem ? "system" : "external";
  };

  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (c.type !== "messageBPMN") continue;
    const src = byId.get(c.sourceId);
    const tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    // Identify the task end and the direction relative to the task.
    let task: DiagramElement | undefined;
    let otherEnd: DiagramElement | undefined;
    let dir: "to" | "from";
    if (TASK_LIKE.has(src.type)) { task = src; otherEnd = tgt; dir = "to"; }
    else if (TASK_LIKE.has(tgt.type)) { task = tgt; otherEnd = src; dir = "from"; }
    else continue;
    const otherPool = otherEnd.type === "pool" ? otherEnd : poolAncestor(otherEnd);
    const kind = poolKind(otherPool);
    let expected: "send" | "receive" | "user" | undefined;
    if (kind === "external") expected = dir === "to" ? "send" : "receive";
    else if (kind === "system") expected = "user";
    else continue; // white-box / unknown — no recommendation
    const actual = task.taskType ?? "none";
    if (actual === expected) continue;
    const verb = dir === "to" ? "sends a message to" : "receives a message from";
    const poolKindLabel = kind === "external" ? "external entity" : "IT system";
    out.push({
      rule: "task-type-for-messages",
      severity: "warning",
      ids: [task.id, c.id],
      message: `${task.type} "${nameOf(task)}" ${verb} ${poolKindLabel} "${nameOf(otherPool)}" — task type should be "${expected}" (currently "${actual}")`,
    });
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
    code: "B01",
    id: "connector-on-container",
    title: "Sequence/association connector on a Pool or Lane",
    description: "A sequence, association or flow connector attaches to a Pool or Lane. In BPMN these must connect to flow elements inside the container, not to the container boundary.",
    severity: "error",
    category: "pool-lane-connector",
    check: checkConnectorOnContainer,
  },
  {
    code: "B02",
    id: "duplicate-container-name",
    title: "Duplicate Pool/Lane names",
    description: "Two or more Pools or Lanes in the same diagram share an identical name (ignoring case and whitespace) — usually an import remnant.",
    severity: "error",
    category: "duplicate-name",
    check: checkDuplicateContainerName,
  },
  {
    code: "B03",
    id: "single-lane-pool",
    title: "Pool with a single Lane",
    description: "A Pool contains exactly one Lane. Usually the lane should be absorbed into the pool.",
    severity: "error",
    category: "single-lane-pool",
    check: checkSingleLanePool,
  },
  {
    code: "B04",
    id: "hanging-message",
    title: "Hanging / misconnected message flow",
    description: "A message flow renders badly: attached to an empty white-box pool (should be black-box), attached to a white-box pool (warning), no horizontal overlap between its ends, or attached to the wrong top/bottom edge.",
    severity: "error",
    category: "hanging-message",
    check: checkHangingMessage,
  },
  {
    code: "B05",
    id: "containment",
    title: "Element outside its container",
    description: "An element is rendered outside the bounds of its parent Pool, Lane or expanded Sub-Process.",
    severity: "error",
    category: "bpmn-structure",
    check: checkContainment,
  },
  {
    code: "B06",
    id: "ref-integrity",
    title: "Dangling reference",
    description: "A connector endpoint, parentId or boundaryHostId points at an element id that does not exist.",
    severity: "error",
    category: "bpmn-structure",
    check: checkReferentialIntegrity,
  },
  {
    code: "B07",
    id: "no-fabricated-wrapper",
    title: "Fabricated 'Main Process' wrapper",
    description: "A pool-level event sub-process is wrapped in an auto-generated 'Main Process' container. It should render directly in its pool.",
    severity: "error",
    category: "bpmn-structure",
    check: checkNoFabricatedWrapper,
  },
  {
    code: "B08",
    id: "event-sub-no-connectors",
    title: "Connector on an Event Sub-Process",
    description: "A sequence or message flow touches an Event Sub-Process. Event sub-processes are triggered by events, never by flow.",
    severity: "error",
    category: "bpmn-structure",
    check: checkEventSubHasNoConnectors,
  },
  {
    code: "B09",
    id: "no-boundary-on-pool",
    title: "Boundary event on a Pool or Lane",
    description: "A boundary (intermediate) event is mounted on a Pool or Lane. Boundary events may only attach to an activity (Task or Sub-Process).",
    severity: "error",
    category: "bpmn-structure",
    check: checkNoBoundaryEventsOnPool,
  },
  {
    code: "B10",
    id: "merge-placement",
    title: "Merge gateway left of its inputs",
    description: "A merge gateway is positioned to the left of all its forward inputs — typically a rework loop's back-edge dragging its column to the far right.",
    severity: "error",
    category: "bpmn-structure",
    check: checkMergeRightOfForwardInputs,
  },
  {
    code: "B11",
    id: "activity-no-incoming",
    title: "Activity has no incoming sequence",
    description: "A Task, Sub-Process or Expanded Sub-Process has no incoming sequence connector. Every activity must be reachable from a Start Event via sequence flow.",
    severity: "error",
    category: "bpmn-structure",
    check: checkActivityHasIncoming,
  },
  {
    code: "B12",
    id: "activity-no-outgoing",
    title: "Activity has no outgoing sequence",
    description: "A Task, Sub-Process or Expanded Sub-Process has no outgoing sequence connector. A dead-end activity blocks process completion.",
    severity: "error",
    category: "bpmn-structure",
    check: checkActivityHasOutgoing,
  },
  {
    code: "B13",
    id: "connector-bends",
    title: "Connector takes too many bends",
    description: "A sequence connector has 4 or more direction changes — usually a sign of cramped routing or a misplaced element. Flagged as a warning; the connector itself is highlighted orange on the canvas during Review Mode.",
    severity: "warning",
    category: "bpmn-structure",
    check: checkConnectorBendiness,
  },
  {
    code: "B14",
    id: "task-type-for-messages",
    title: "Task type doesn't match its message flows",
    description: "BPMN convention: a Task/Sub-Process with a message TO a non-IT (external entity) pool should be a Send task; FROM a non-IT pool should be Receive; TO or FROM an IT-system pool should be User. One warning per mismatched message edge.",
    severity: "warning",
    category: "bpmn-structure",
    check: checkTaskTypeForMessages,
  },
  {
    code: "B15",
    id: "adhoc-ep-no-start-end",
    title: "Ad-hoc Sub-Process has Start or End event",
    description: "An Expanded Sub-Process marked Ad-Hoc must not contain or boundary-mount Start or End events — the whole point of ad-hoc is that its activities run in any order with no defined start/end semantics.",
    severity: "error",
    category: "bpmn-structure",
    check: checkAdHocEPHasNoStartEnd,
  },
  {
    code: "B16",
    id: "adhoc-ep-no-sequence-between-children",
    title: "Ad-hoc Sub-Process has sequence flow",
    description: "An Ad-Hoc Expanded Sub-Process must not have sequence connectors between its child activities. Ad-hoc children run in any order; ordering them with sequence flow contradicts the marker.",
    severity: "error",
    category: "bpmn-structure",
    check: checkAdHocEPNoSequenceBetweenChildren,
  },
  {
    code: "B17",
    id: "data-object-no-association",
    title: "Data Object without an association",
    description: "A Data Object is not connected to any activity via an association connector. Either wire it to the task / process step that produces or consumes it, or remove it.",
    severity: "warning",
    category: "bpmn-structure",
    check: checkDataObjectHasAssociation,
  },
  {
    code: "B18",
    id: "data-store-no-association",
    title: "Data Store without an association",
    description: "A Data Store is not connected to any activity via an association connector. Either wire it to the activities that read from or write to it, or remove it.",
    severity: "warning",
    category: "bpmn-structure",
    check: checkDataStoreHasAssociation,
  },
  {
    code: "B19",
    id: "edge-mount-event-outer-routing",
    title: "Edge-mounted intermediate event: incoming trigger must come from outside",
    description: "An incoming sequence connector to an edge-mounted intermediate event must attach on the OUTER side of the event and its source must sit OUTSIDE the host Sub-Process. Boundary intermediate events represent external triggers; any other shape routes the path back through the host body.",
    severity: "error",
    category: "bpmn-structure",
    check: checkEdgeMountEventOuterRouting,
  },
  {
    code: "B20",
    id: "duplicate-sequence",
    title: "Duplicate sequence connectors between two elements",
    description: "Two or more sequence connectors share the same (source, target) pair. Only one sequence flow is allowed per ordered pair — back-edges (A→B and B→A) are fine, but A→B twice is a redundancy.",
    severity: "error",
    category: "bpmn-structure",
    check: checkDuplicateSequenceConnector,
  },
  {
    code: "B21",
    id: "message-not-moveable",
    title: "Message flow can't be moved or re-attached",
    description: "A messageBPMN connector is missing one or more of the fields the editor needs to support body drag and endpoint re-attach (4 waypoints, sourceSide, targetSide, sourceOffsetAlong). Common with hand-edited imports and legacy data.",
    severity: "warning",
    category: "bpmn-structure",
    check: checkMessageFlowMoveable,
  },
  {
    code: "B22",
    id: "loop-back-routing",
    title: "Loop-back sequence not routed underneath",
    description: "A sequence connector runs back to an element to its left (a rework loop) but does not attach BOTTOM-to-BOTTOM. Loop-backs should leave the source's bottom edge, detour below the intervening elements, and re-enter the target's bottom edge so the loop stays clear of the forward flow.",
    severity: "warning",
    category: "bpmn-structure",
    check: checkLoopBackRouting,
  },
  {
    code: "B23",
    id: "boundary-start-outgoing-inner",
    title: "Boundary Start Event outgoing flow not on inner side",
    description: "Outgoing sequence from an edge-mounted Start Event must emit from the INNER side (the side facing into the host EP). A left-edge mount, for instance, must emit from the right-hand connection point.",
    severity: "error",
    category: "bpmn-structure",
    check: checkBoundaryStartOutgoingInner,
  },
  {
    code: "B24",
    id: "boundary-start-incoming-outer",
    title: "Boundary Start Event incoming flow not from outside",
    description: "Incoming sequence to an edge-mounted Start Event must attach on the OUTER side and originate from an element OUTSIDE the host EP — the boundary start represents an external trigger.",
    severity: "error",
    category: "bpmn-structure",
    check: checkBoundaryStartIncomingOuter,
  },
  {
    code: "B25",
    id: "boundary-end-incoming-inner",
    title: "Boundary End Event incoming flow not from inside",
    description: "Incoming sequence to an edge-mounted End Event must attach on the INNER side and originate from an element INSIDE the host EP. Boundary end events terminate an internal sub-flow; no element outside the EP may connect to them.",
    severity: "error",
    category: "bpmn-structure",
    check: checkBoundaryEndIncomingInner,
  },
  {
    code: "B26",
    id: "ep-no-autoconnect-descendant",
    title: "Expanded Sub-Process auto-connected to its own descendant",
    description: "A sequence connector runs directly from an Expanded Sub-Process to one of the elements nested inside it. EPs may never auto-connect to anything they contain — regardless of the child's position inside the EP.",
    severity: "error",
    category: "bpmn-structure",
    check: checkEpNoAutoConnectToDescendant,
  },
  {
    code: "B27",
    id: "boundary-intermediate-outgoing-outer",
    title: "Boundary Intermediate Event outgoing flow not on outer side",
    description: "Outgoing sequence from an edge-mounted Intermediate Event must emit from the OUTER side (the side facing away from the host element). Counterpart to B19 which governs incoming flow.",
    severity: "error",
    category: "bpmn-structure",
    check: checkBoundaryIntermediateOutgoingOuter,
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
