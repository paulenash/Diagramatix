/**
 * Deterministic vertical layout for AI-generated Event-driven Process Chains.
 *
 * Phase 2 of the EPC AI pipeline: takes a validated (possibly hand-edited) plan
 * and lays it out top-to-bottom, ARIS-style. No model call happens here.
 *
 * Two things make this different from `layoutFlowchartDiagram`, which it is
 * otherwise adapted from:
 *
 * 1. **Satellites.** Org units and positions sit to the RIGHT of the function
 *    they are assigned to; information objects and application systems sit to
 *    the LEFT. They are never part of the vertical spine, so they are pulled out
 *    of the rank layout entirely and placed against their anchor afterwards —
 *    the same shape as the flowchart's F4.08 database pass.
 *
 * 2. **The plan carries assignment as an ATTRIBUTE, not as an edge.** A function
 *    declares `org`, `data` and `system`, and this file synthesises the satellite
 *    elements and their arcs. That is not a convenience: it makes E6 (satellites
 *    attach to functions only) and E7 (one responsible org unit) impossible to
 *    violate rather than merely detectable, because there is nowhere in the plan
 *    to express the violation. Explicitly-drawn satellite elements are still
 *    accepted — a hand-built or imported plan has them — and they converge on
 *    the same placement pass.
 *
 * Everything the layout could not take at face value is REPORTED through
 * `onDiagnostic` rather than repaired. An EPC that silently gains an invented
 * event to fix its alternation is worse than one that says which two functions
 * are adjacent: the first looks like a success.
 */

import type { DiagramData, DiagramElement, Connector, Point, SymbolType } from "./types";
import type { LayoutDiagnostic } from "./bpmnLayout";
import { getSymbolDefinition } from "./symbols/definitions";
import { computeWaypoints } from "./routing";
import { epcFitSize } from "./textMetrics";

export interface AiEpcElement {
  id: string;
  /** Free-form AI type, mapped to an `epc-*` symbol below. */
  type: string;
  label?: string;
  name?: string;
  /** Functions only — who is responsible. One value: E7 says a function has at
   *  most one RESPONSIBLE org unit, and lane derivation needs one answer. */
  org?: string;
  /** Functions only — information objects the function reads or writes. */
  data?: string[];
  /** Functions only — application systems the work happens in. */
  system?: string[];
  /**
   * Functions only — the wider ARIS object set.
   *
   * One field per kind rather than a tagged list, for the same reason `org` is
   * a single string: the SHAPE of the plan is where the rules live. A KPI can
   * only ever be drawn as a KPI, and there is nowhere here to hang one off an
   * event.
   */
  kpi?: string[];
  risk?: string[];
  product?: string[];
  knowledge?: string[];
  businessRule?: string[];
  screen?: string[];
  objective?: string[];
  machine?: string[];
  location?: string[];
  requirement?: string[];
}

/** Plan field → the symbol it is drawn as. The single place that pairing lives. */
export const EPC_ANNOTATION_FIELDS: ReadonlyArray<readonly [keyof AiEpcElement, SymbolType]> = [
  ["kpi", "epc-kpi"],
  ["risk", "epc-risk"],
  ["product", "epc-product"],
  ["knowledge", "epc-knowledge"],
  ["businessRule", "epc-business-rule"],
  ["screen", "epc-screen"],
  ["objective", "epc-objective"],
  ["machine", "epc-machine"],
  ["location", "epc-location"],
  ["requirement", "epc-requirement"],
];
export interface AiEpcConnection {
  sourceId: string;
  targetId: string;
  label?: string;
}
export interface AiEpcPlan {
  elements: AiEpcElement[];
  connections: AiEpcConnection[];
}

const START_X = 460;   // band centre
const START_Y = 60;
const ROW_GAP = 44;    // vertical gap between ranks — EPC chains are long
const COL_GAP = 64;    // horizontal gap between nodes sharing a rank
const SAT_GAP = 70;    // gap between a function and its first satellite
const SAT_STACK = 18;  // extra gap when a function has several of one kind

const CONNECTOR_TYPES = new Set<SymbolType>(["epc-xor", "epc-and", "epc-or"]);
const DECISION_TYPES = new Set<SymbolType>(["epc-xor", "epc-or"]);
const ORG_TYPES = new Set<SymbolType>(["epc-org-unit", "epc-position"]);
/**
 * The wider ARIS object set. Every one hangs off a function and is drawn beside
 * it, exactly as an information object is — so it joins DATA_TYPES rather than
 * getting a placement rule of its own.
 */
const ANNOTATION_TYPES = new Set<SymbolType>([
  "epc-kpi", "epc-risk", "epc-product", "epc-knowledge", "epc-business-rule",
  "epc-screen", "epc-objective", "epc-machine", "epc-location", "epc-requirement",
]);
const DATA_TYPES = new Set<SymbolType>(["epc-data", "epc-application", ...ANNOTATION_TYPES]);

/** Map a free-form AI element type onto a concrete EPC symbol type. */
export function mapEpcType(raw: string): SymbolType {
  const k = (raw || "").toLowerCase().replace(/[^a-z]/g, "");
  if (/^(xor|exclusive|either|choice|decision)$/.test(k)) return "epc-xor";
  if (/^(and|parallel|fork|join|split|concurrent)$/.test(k)) return "epc-and";
  if (/^(or|inclusive|oneormore)$/.test(k)) return "epc-or";
  if (/(processinterface|interface|link|callprocess|subprocesslink)/.test(k)) return "epc-interface";
  if (/(orgunit|organisationalunit|organizationalunit|organisation|organization|department|team)/.test(k)) return "epc-org-unit";
  if (/(position|role|jobtitle|person)/.test(k)) return "epc-position";
  if (/(applicationsystem|application|system|itsystem|software)/.test(k)) return "epc-application";
  if (/(informationobject|information|data|document|record|dataobject)/.test(k)) return "epc-data";
  // The wider ARIS set, before the function catch-all: "business rule" and
  // "process interface" both contain words the function test would swallow.
  if (/(businessrule|policy|rule)/.test(k)) return "epc-business-rule";
  if (/(kpi|keyperformanceindicator|measure|metric)/.test(k)) return "epc-kpi";
  if (/(risk|hazard|threat)/.test(k)) return "epc-risk";
  if (/(productservice|product|service|deliverable)/.test(k)) return "epc-product";
  if (/(knowledge|skill|competency)/.test(k)) return "epc-knowledge";
  if (/(screen|form|userinterface|ui)/.test(k)) return "epc-screen";
  if (/(objective|goal|target)/.test(k)) return "epc-objective";
  if (/(machine|equipment|resource|plant)/.test(k)) return "epc-machine";
  if (/(location|site|region|place)/.test(k)) return "epc-location";
  if (/(requirement|obligation|compliance)/.test(k)) return "epc-requirement";
  if (/(function|activity|task|step|action|process)/.test(k)) return "epc-function";
  // event / state / trigger / anything else. An EPC is event-bounded, and an
  // unrecognised label is far more often a state than a step.
  return "epc-event";
}

/**
 * Wrap first, grow second — the rule lives in epcFitSize so the renderer can
 * apply the same one. The WIDTH never changes: the three-column band below
 * only holds if the middle column is a known size, so a long function name
 * grows the box downward rather than shoving every branch's assignments out
 * of column.
 */
const sizeFor = epcFitSize;

/** One satellite to be placed beside a function, on a named side. */
interface Satellite {
  id: string;
  type: SymbolType;
  label: string;
  anchorId: string;
  side: "left" | "right";
}

export function layoutEpcDiagram(
  plan: AiEpcPlan,
  opts?: { onDiagnostic?: (d: LayoutDiagnostic) => void },
): DiagramData {
  // A reporter must never break a layout.
  const diagnose = (d: LayoutDiagnostic) => { try { opts?.onDiagnostic?.(d); } catch { /* ignore */ } };

  const aiElements = plan.elements ?? [];
  const aiConnections = plan.connections ?? [];
  if (aiElements.length === 0) {
    return { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 0.8 }, fontSize: 12, connectorFontSize: 10 };
  }

  const typeById = new Map<string, SymbolType>();
  for (const e of aiElements) typeById.set(e.id, mapEpcType(e.type));
  const labelOf = (e: AiEpcElement) => e.label ?? e.name ?? "";

  const idSet = new Set(aiElements.map((e) => e.id));
  const edges = aiConnections.filter((c) => idSet.has(c.sourceId) && idSet.has(c.targetId));

  // ── Satellites ────────────────────────────────────────────────────────────
  // Two sources, one list. Attribute shorthand on a function is synthesised
  // here; an explicitly-drawn satellite element is adopted from the plan and
  // pulled out of the spine, anchored to the function it touches.
  const satellites: Satellite[] = [];
  const satelliteIds = new Set<string>();
  let synth = 0;

  for (const e of aiElements) {
    const t = typeById.get(e.id)!;
    if (t !== "epc-function") {
      // E6 — assignment belongs to a function. A model that hangs a system off
      // an event is describing something real, so say what was dropped.
      if (e.org || e.data?.length || e.system?.length) {
        diagnose({
          kind: "epc-assignment-not-on-function", elementId: e.id, label: labelOf(e),
          detail: `only a function carries an org / data / system assignment; this is a ${t.replace("epc-", "")}, so the assignment was dropped`,
        });
      }
      continue;
    }
    const push = (label: string, type: SymbolType, side: "left" | "right") => {
      const trimmed = (label ?? "").trim();
      if (!trimmed) return;
      const id = `sat-${++synth}`;
      satellites.push({ id, type, label: trimmed, anchorId: e.id, side });
      satelliteIds.add(id);
    };
    if (e.org) push(e.org, "epc-org-unit", "right");
    for (const d of e.data ?? []) push(d, "epc-data", "left");
    for (const s of e.system ?? []) push(s, "epc-application", "left");
    // The wider ARIS set goes on the RIGHT, beside the org unit. They say
    // something ABOUT the function — who is measured, what can go wrong, what
    // it delivers — which is the same side of the sentence the responsible
    // party is on. The left stays for what the function reads and writes.
    for (const [field, type] of EPC_ANNOTATION_FIELDS) {
      for (const v of (e[field] as string[] | undefined) ?? []) push(v, type, "right");
    }
  }

  // Explicitly-drawn satellites: anchor each to the function it connects to.
  for (const e of aiElements) {
    const t = typeById.get(e.id)!;
    if (!ORG_TYPES.has(t) && !DATA_TYPES.has(t)) continue;
    const touching = edges
      .map((c) => (c.sourceId === e.id ? c.targetId : c.targetId === e.id ? c.sourceId : null))
      .filter((x): x is string => x !== null);
    const anchorId = touching.find((n) => typeById.get(n) === "epc-function");
    if (!anchorId) {
      // E6 again, from the other direction: a satellite attached to an event or
      // a connector, or to nothing at all. It stays in the spine layout, where
      // it is visible and obviously wrong, rather than vanishing.
      diagnose({
        kind: "epc-assignment-not-on-function", elementId: e.id, label: labelOf(e),
        detail: touching.length
          ? "attached to something that is not a function — an EPC assignment arc runs to a function only"
          : "not attached to any function",
      });
      continue;
    }
    satellites.push({ id: e.id, type: t, label: labelOf(e), anchorId, side: ORG_TYPES.has(t) ? "right" : "left" });
    satelliteIds.add(e.id);
  }

  // E7 — one RESPONSIBLE org unit per function. Extra org units are
  // participants, and lane derivation on conversion needs one answer.
  {
    const orgCount = new Map<string, number>();
    for (const s of satellites) {
      if (!ORG_TYPES.has(s.type)) continue;
      orgCount.set(s.anchorId, (orgCount.get(s.anchorId) ?? 0) + 1);
    }
    for (const [fnId, n] of orgCount) {
      if (n < 2) continue;
      const fn = aiElements.find((e) => e.id === fnId);
      diagnose({
        kind: "epc-multiple-org", elementId: fnId, label: fn ? labelOf(fn) : fnId,
        detail: `${n} organisational units are assigned; only one can be the responsible party, and converting to BPMN needs to know which lane this becomes`,
      });
    }
  }

  // ── The spine ─────────────────────────────────────────────────────────────
  const spine = aiElements.filter((e) => !satelliteIds.has(e.id));
  const spineIds = spine.map((e) => e.id);
  const spineSet = new Set(spineIds);
  const flowEdges = edges.filter((c) => spineSet.has(c.sourceId) && spineSet.has(c.targetId));

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of spineIds) { outgoing.set(id, []); incoming.set(id, []); indeg.set(id, 0); }
  for (const c of flowEdges) {
    outgoing.get(c.sourceId)!.push(c.targetId);
    incoming.get(c.targetId)!.push(c.sourceId);
    indeg.set(c.targetId, (indeg.get(c.targetId) ?? 0) + 1);
  }

  reportEpcRuleBreaches(spine, typeById, outgoing, incoming, labelOf, diagnose);

  let sources = spineIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  if (sources.length === 0) sources = spineIds.length ? [spineIds[0]] : [];

  // A rework loop is the most common thing an EPC draws, and a loop-back edge
  // looks like forward progress to a longest-path ranker: the relaxation keeps
  // pushing the loop's head down a rank at a time until the iteration cap, and
  // the function ends up BELOW the branch that returns to it, with its arcs
  // snaking around the whole chain. So back edges are found first and excluded
  // from RANKING. They remain real arcs, and they still count for every rule
  // check — a loop-back is part of the process, it just is not what decides
  // which row something sits in.
  const backEdges = new Set<string>();
  {
    const WHITE = 0, GREY = 1, BLACK = 2;
    const colour = new Map<string, number>(spineIds.map((id) => [id, WHITE]));
    const walk = (id: string) => {
      colour.set(id, GREY);
      for (const next of outgoing.get(id) ?? []) {
        const c = colour.get(next);
        if (c === GREY) backEdges.add(`${id}->${next}`);  // reaches an ancestor still on the stack
        else if (c === WHITE) walk(next);
      }
      colour.set(id, BLACK);
    };
    for (const s0 of sources) if (colour.get(s0) === WHITE) walk(s0);
    // A cycle no source can reach still needs an entry point, or none of it ranks.
    for (const id of spineIds) if (colour.get(id) === WHITE) walk(id);
  }
  const rankEdges = flowEdges.filter((c) => !backEdges.has(`${c.sourceId}->${c.targetId}`));

  // Longest-path rank (y-layer). Bounded relaxation is cycle-safe.
  const rank = new Map<string, number>(spineIds.map((id) => [id, 0]));
  for (let iter = 0; iter < spineIds.length; iter++) {
    let changed = false;
    for (const c of rankEdges) {
      const nr = (rank.get(c.sourceId) ?? 0) + 1;
      if (nr > (rank.get(c.targetId) ?? 0)) { rank.set(c.targetId, nr); changed = true; }
    }
    if (!changed) break;
  }

  // DFS pre-order — a stable seed that keeps a split's branches adjacent in x
  // before the barycentre sweeps refine it.
  const fwdOut = new Map<string, string[]>();
  const fwdIn = new Map<string, string[]>();
  for (const id of spineIds) { fwdOut.set(id, []); fwdIn.set(id, []); }
  for (const c of rankEdges) { fwdOut.get(c.sourceId)!.push(c.targetId); fwdIn.get(c.targetId)!.push(c.sourceId); }

  const order = new Map<string, number>();
  let orderCounter = 0;
  const visited = new Set<string>();
  const dfs = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    order.set(id, orderCounter++);
    for (const next of fwdOut.get(id) ?? []) dfs(next);
  };
  for (const s of sources) dfs(s);
  for (const id of spineIds) if (!visited.has(id)) order.set(id, orderCounter++);

  const byRank = new Map<number, string[]>();
  for (const id of spineIds) {
    const r = rank.get(id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(id);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);

  const rankOrder = new Map<number, string[]>();
  for (const r of ranks) {
    rankOrder.set(r, [...byRank.get(r)!].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
  }
  const pos = new Map<string, number>();
  for (const r of ranks) rankOrder.get(r)!.forEach((id, i) => pos.set(id, i));
  for (let s = 0; s < 4; s++) {
    const down = s % 2 === 0;
    for (const r of (down ? ranks : [...ranks].reverse())) {
      const arr = rankOrder.get(r)!;
      const bary = new Map<string, number>();
      arr.forEach((id, i) => {
        const ns = down ? fwdIn.get(id)! : fwdOut.get(id)!;
        const vals = ns.map((n) => pos.get(n)).filter((v): v is number => v !== undefined);
        bary.set(id, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : (pos.get(id) ?? i));
      });
      const sorted = arr
        .map((id, i) => ({ id, i }))
        .sort((a, b) => (bary.get(a.id)! - bary.get(b.id)!) || (a.i - b.i))
        .map((o) => o.id);
      rankOrder.set(r, sorted);
      sorted.forEach((id, i) => pos.set(id, i));
    }
  }

  // ── Placement ─────────────────────────────────────────────────────────────
  const aiById = new Map(aiElements.map((e) => [e.id, e]));
  const sizeById = new Map<string, { w: number; h: number }>();
  for (const e of aiElements) sizeById.set(e.id, sizeFor(typeById.get(e.id)!, labelOf(e)));
  for (const s of satellites) if (!sizeById.has(s.id)) sizeById.set(s.id, sizeFor(s.type, s.label));

  /**
   * THREE COLUMNS PER BRANCH.
   *
   * A function has assignments on BOTH sides — data and systems left, org units
   * right. Lay the branches out on their own widths and branch A's right-hand
   * org unit lands on top of branch B's left-hand data object, because the two
   * branches only know about their own boxes.
   *
   * So every element in the spine is given the SAME three-column band:
   *
   *     [  left gutter  ][  spine  ][  right gutter  ]
   *
   * sized from the widest assignment anywhere in the diagram. Uniform bands
   * mean the columns line up down the page as well as across it, so nothing a
   * branch hangs off itself can reach into the branch beside it — and it holds
   * for a rank of events, which have no assignments at all and would otherwise
   * be laid out to a different width from the functions above and below them.
   *
   * The cost is horizontal space on a diagram where only one function carries
   * an assignment. That is the right trade: a wide diagram is readable, and an
   * overlapping one is not.
   */
  const satExtent = (anchorId: string, side: "left" | "right") => {
    const kin = satellites.filter((s) => s.anchorId === anchorId && s.side === side);
    if (kin.length === 0) return 0;
    const widest = Math.max(...kin.map((s) => sizeById.get(s.id)!.w));
    return SAT_GAP + kin.length * widest + (kin.length - 1) * SAT_STACK;
  };
  let gutterLeft = 0, gutterRight = 0;
  for (const e of spine) {
    gutterLeft = Math.max(gutterLeft, satExtent(e.id, "left"));
    gutterRight = Math.max(gutterRight, satExtent(e.id, "right"));
  }
  const spineW = Math.max(...spineIds.map((id) => sizeById.get(id)!.w), 0);
  const bandW = gutterLeft + spineW + gutterRight;

  const elements: DiagramElement[] = [];
  let cursorY = START_Y;
  for (const r of ranks) {
    const rowIds = rankOrder.get(r)!;
    const sizes = rowIds.map((id) => sizeById.get(id)!);
    const rowH = Math.max(...sizes.map((s) => s.h));
    const totalW = rowIds.length * bandW + COL_GAP * (rowIds.length - 1);
    let bandX = START_X - totalW / 2;
    rowIds.forEach((id, i) => {
      const e = aiById.get(id)!, s = sizes[i];
      // Centred in the band's MIDDLE column, so a 44px connector and a 160px
      // event share an axis instead of both hugging the left gutter.
      const cx = bandX + gutterLeft + spineW / 2;
      elements.push({
        id, type: typeById.get(id)!,
        x: Math.round(cx - s.w / 2), y: Math.round(cursorY + (rowH - s.h) / 2),
        width: s.w, height: s.h,
        label: labelOf(e), properties: {},
      });
      bandX += bandW + COL_GAP;
    });
    cursorY += rowH + ROW_GAP;
  }

  // Satellites, against their anchor. Several of one kind stack outward, away
  // from the spine, so the spine's own column is never crowded.
  const placedById = new Map(elements.map((e) => [e.id, e]));
  const perAnchorSide = new Map<string, number>();
  for (const sat of satellites) {
    const a = placedById.get(sat.anchorId);
    if (!a) {
      diagnose({
        kind: "unplaced", elementId: sat.id, label: sat.label,
        detail: `assigned to "${sat.anchorId}", which was not placed`,
      });
      continue;
    }
    const s = sizeById.get(sat.id)!;
    const key = `${sat.anchorId}|${sat.side}`;
    const n = perAnchorSide.get(key) ?? 0;
    perAnchorSide.set(key, n + 1);
    const step = n * (s.w + SAT_STACK);
    const el: DiagramElement = {
      id: sat.id, type: sat.type,
      x: Math.round(sat.side === "right"
        ? a.x + a.width + SAT_GAP + step
        : a.x - SAT_GAP - s.w - step),
      y: Math.round(a.y + a.height / 2 - s.h / 2 + n * 6),
      width: s.w, height: s.h,
      label: sat.label, properties: {},
    };
    elements.push(el);
    placedById.set(sat.id, el);
  }

  // ── Arcs ──────────────────────────────────────────────────────────────────
  // Three kinds, and only one of them carries sequence. The kind is deduced
  // from the endpoints exactly as Canvas.tsx deduces it when a user draws one,
  // so a generated arc and a hand-drawn one between the same two shapes are
  // indistinguishable.
  const elMap = new Map(elements.map((e) => [e.id, e]));
  const outCount = new Map<string, number>();
  for (const c of flowEdges) outCount.set(c.sourceId, (outCount.get(c.sourceId) ?? 0) + 1);

  const connectors: Connector[] = [];
  const pushArc = (
    sourceId: string, targetId: string, label: string,
    kind: "control" | "info" | "org",
  ) => {
    const src = elMap.get(sourceId), tgt = elMap.get(targetId);
    if (!src || !tgt) return;
    const srcCx = src.x + src.width / 2, tgtCx = tgt.x + tgt.width / 2;
    const srcCy = src.y + src.height / 2, tgtCy = tgt.y + tgt.height / 2;

    let srcSide: string, tgtSide: string;
    if (kind === "control") {
      const srcIsSplit = CONNECTOR_TYPES.has(src.type as SymbolType) && (outCount.get(src.id) ?? 0) >= 2;
      if (srcIsSplit) {
        // A split's branches leave its left / right sides; a branch heading
        // straight down keeps the bottom.
        const dx = tgtCx - srcCx;
        srcSide = Math.abs(dx) < src.width * 0.6
          ? (tgtCy >= srcCy ? "bottom" : "top")
          : (dx > 0 ? "right" : "left");
        tgtSide = tgtCy >= srcCy ? "top" : "bottom";
      } else if (Math.abs(tgtCy - srcCy) >= Math.abs(tgtCx - srcCx)) {
        srcSide = tgtCy >= srcCy ? "bottom" : "top";
        tgtSide = tgtCy >= srcCy ? "top" : "bottom";
      } else {
        srcSide = tgtCx > srcCx ? "right" : "left";
        tgtSide = tgtCx > srcCx ? "left" : "right";
      }
    } else {
      // Assignment and information arcs run HORIZONTALLY, orthogonal to the
      // spine — that is what makes the spine readable as the process.
      srcSide = tgtCx >= srcCx ? "right" : "left";
      tgtSide = tgtCx >= srcCx ? "left" : "right";
    }

    const hasLabel = !!label.trim();
    connectors.push({
      id: `conn-${sourceId}-${targetId}`,
      sourceId, targetId,
      sourceSide: srcSide as Connector["sourceSide"],
      targetSide: tgtSide as Connector["targetSide"],
      type: kind === "control" ? "epc-control-flow" : kind === "info" ? "epc-information-flow" : "epc-org-assignment",
      // Control flow and information flow both carry an OPEN head; only the
      // assignment arc has none. They stay apart by ROUTING — control flow is
      // rectilinear and runs down the spine, an information arc is direct and
      // runs horizontally — which is how an EPC distinguishes them on paper too.
      directionType: kind === "org" ? "non-directed" : "open-directed",
      routingType: kind === "control" ? "rectilinear" : "direct",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [] as Point[],
      label,
      ...(hasLabel ? { labelAnchor: "source" as const } : {}),
    } as Connector);
  };

  for (const c of flowEdges) pushArc(c.sourceId, c.targetId, c.label ?? "", "control");

  for (const sat of satellites) {
    if (!elMap.has(sat.id) || !elMap.has(sat.anchorId)) continue;
    if (ORG_TYPES.has(sat.type)) {
      // No arrowhead: responsibility is not a direction.
      pushArc(sat.anchorId, sat.id, "", "org");
    } else {
      // Data → function reads it. The plan cannot say "writes" yet, and
      // guessing would be worse than the safe reading.
      pushArc(sat.id, sat.anchorId, "", "info");
    }
  }

  // Which SHAPES deflect a route is decided once, by type, in routing.ts
  // (SEQ_OBSTACLE_TYPES): the EPC spine is solid, while the three connectors
  // sit ON the flow and the satellites sit beside it, so neither deflects an
  // arc. Re-filtering here would be a second copy of that rule which cannot
  // fail — and would go stale the moment the list there changes.
  const obstacles = elements;
  const computed = connectors.map((conn) => {
    const src = elMap.get(conn.sourceId), tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    try {
      const r = computeWaypoints(
        src, tgt, obstacles, conn.sourceSide, conn.targetSide, conn.routingType,
        conn.sourceOffsetAlong ?? 0.5, conn.targetOffsetAlong ?? 0.5,
      );
      return { ...conn, waypoints: r.waypoints, sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
    } catch { return conn; }
  });

  return {
    elements,
    connectors: computed,
    viewport: { x: 0, y: 0, zoom: 0.8 },
    fontSize: 12,
    connectorFontSize: 10,
  };
}

/**
 * E1–E5, reported rather than repaired.
 *
 * `canConnect` vetoes these while a person draws, but an AI plan never passes
 * through `canConnect` — the layout builds the arcs directly. So the rules have
 * to be checked here as well, or a generated EPC can break the very rules the
 * editor will not let you draw.
 */
function reportEpcRuleBreaches(
  spine: AiEpcElement[],
  typeById: Map<string, SymbolType>,
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
  labelOf: (e: AiEpcElement) => string,
  diagnose: (d: LayoutDiagnostic) => void,
): void {
  const byId = new Map(spine.map((e) => [e.id, e]));
  const t = (id: string) => typeById.get(id)!;
  const name = (id: string) => { const e = byId.get(id); return e ? labelOf(e) : id; };

  for (const e of spine) {
    const type = t(e.id);
    const outs = outgoing.get(e.id) ?? [];
    const ins = incoming.get(e.id) ?? [];

    // E1 — strict alternation. Two functions may never be adjacent, nor two
    // events. Connectors are transparent to this rule, which is why it is
    // checked only on a direct edge.
    if (type === "epc-event" || type === "epc-function") {
      for (const next of outs) {
        if (t(next) === type) {
          diagnose({
            kind: "epc-alternation", elementId: e.id, label: labelOf(e),
            detail: `runs straight into "${name(next)}", which is also ${type === "epc-event" ? "an event" : "a function"} — an EPC alternates event, function, event`,
          });
        }
      }
    }

    // E3 — an event may not decide. This is THE classic EPC rule: an event is
    // passive, so it cannot choose a branch. An AND split after an event is
    // fine, because it is not a choice.
    if (type === "epc-event") {
      for (const next of outs) {
        if (DECISION_TYPES.has(t(next)) && (outgoing.get(next) ?? []).length >= 2) {
          diagnose({
            kind: "epc-event-decides", elementId: e.id, label: labelOf(e),
            detail: `is followed by an ${t(next) === "epc-xor" ? "XOR" : "OR"} split — an event is passive and cannot make a decision; only a function can`,
          });
        }
      }
    }

    // E4 — a connector is either a split or a join, never both.
    if (CONNECTOR_TYPES.has(type) && ins.length >= 2 && outs.length >= 2) {
      diagnose({
        kind: "epc-connector-both-ways", elementId: e.id, label: labelOf(e),
        detail: `has ${ins.length} inputs and ${outs.length} outputs — a connector either splits or joins, and one that does both says nothing about which arrives before which`,
      });
    }
  }

  // E2 — an EPC begins and ends with an event (a process interface may stand in
  // for one at either end).
  const bounded = (id: string) => t(id) === "epc-event" || t(id) === "epc-interface";
  const starts = spine.filter((e) => (incoming.get(e.id) ?? []).length === 0);
  const ends = spine.filter((e) => (outgoing.get(e.id) ?? []).length === 0);
  for (const e of starts) {
    if (!bounded(e.id)) {
      diagnose({
        kind: "epc-not-event-bounded", elementId: e.id, label: labelOf(e),
        detail: "starts the chain but is not an event — an EPC begins with the state that triggers it",
      });
    }
  }
  for (const e of ends) {
    if (!bounded(e.id)) {
      diagnose({
        kind: "epc-not-event-bounded", elementId: e.id, label: labelOf(e),
        detail: "ends the chain but is not an event — an EPC finishes on the state it brought about",
      });
    }
  }

  // E5 — a split should be matched by a join of the same type. Real EPCs
  // violate this constantly, so it is reported and NEVER repaired: the shape of
  // the fix depends on what the process actually does.
  const splits = new Map<SymbolType, number>();
  const joins = new Map<SymbolType, number>();
  for (const e of spine) {
    const type = t(e.id);
    if (!CONNECTOR_TYPES.has(type)) continue;
    if ((outgoing.get(e.id) ?? []).length >= 2) splits.set(type, (splits.get(type) ?? 0) + 1);
    if ((incoming.get(e.id) ?? []).length >= 2) joins.set(type, (joins.get(type) ?? 0) + 1);
  }
  for (const type of CONNECTOR_TYPES) {
    const s = splits.get(type) ?? 0, j = joins.get(type) ?? 0;
    if (s === j) continue;
    const kind = type === "epc-xor" ? "XOR" : type === "epc-and" ? "AND" : "OR";
    diagnose({
      kind: "epc-unbalanced-connector", elementId: "", label: kind,
      detail: `${s} ${kind} split${s === 1 ? "" : "s"} and ${j} ${kind} join${j === 1 ? "" : "s"} — branches that open and never close leave the process with no single end`,
    });
  }
}
