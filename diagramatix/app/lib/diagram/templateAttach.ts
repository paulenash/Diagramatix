/**
 * Attaching a template AFTER an element — the one placement rule, shared by the
 * mouse (the Assist "Template" ghost) and the voice ("add template after X").
 *
 * Paul, 2026-09-25, of "add template after selected": "It should allow user to
 * select a template then place the selected template After the selected
 * gateway." The mouse attach already did exactly that; its placement is moved
 * here, not copied, so the two can never place a template differently:
 *
 *   1. the template's entry (templateAttachData — a Start Event with a single
 *      flow out is dropped) sits ½ Task width (51px) right of the anchor,
 *      vertical centres aligned (rule 1, inline);
 *   2. after a BOUNDARY event it sits where R7 puts a step after one instead —
 *      out of the event's outer face, in the host's own lane;
 *   3. the whole fragment is nudged clear of other elements as ONE box
 *      (findFreeSlot, rule 4);
 *   4. its parentless elements join the container a step after the anchor
 *      joins (followOnParentId), so APPLY_TEMPLATE grows that lane round them;
 *   5. one sequence flow joins anchor → entry, drawn by the reducer's own
 *      ADD_CONNECTOR inside APPLY_TEMPLATE (one action, one undo).
 *
 * Inline even after a decision gateway that already has branches: a fan-out
 * row is spaced by the entry's height, not the template's, and put the
 * template above the lane (verdict-5). Nobody has asked for fan-out here.
 *
 * Known limit, inherited from the mouse attach and recorded rather than hidden:
 * the nudge steps by half the fragment's box, so on a busy diagram a template
 * can land well below its anchor and the lane grows to reach it.
 *
 * Pure, apart from the dry run, which asks the real reducer.
 */
import type { Connector, DiagramData, DiagramElement, TemplateData } from "./types";
import { reducer } from "@/app/hooks/useDiagram";
import { SEQUENCE_NODE_TYPES, instantiateTemplate, instantiateTemplateAnchored, templateAttachData } from "./templates";
import { HALF_TASK_W, findFreeSlot, followOnParentId, planBoundaryFollowOn } from "./assistPlacement";
import { canConnect, containerScopeOf, flowScopeOf } from "./canConnect";
import { getElementPoolId } from "./poolUtil";
import { isLaneUnowned } from "./containment";
import { previewBase, type TemplateIds, type TemplateSnapshot } from "./templatePreview";

/** The sequence flow that joins a template to the element it follows. */
export interface TemplateJoin { sourceId: string; targetId: string }

/** How an element is named in a sentence: its label on one line, else its type. */
export function anchorNameOf(el: DiagramElement): string {
  return (el.label ?? "").replace(/\s+/g, " ").trim() || el.type;
}

/**
 * Can a template follow this element at all? Asked when the window opens, so a
 * window is never offered for an anchor no template could join, and again for
 * every card. The answer is canConnect's: a sequence flow must be able to leave
 * `anchor` into a task placed where the template's entry would go.
 *
 * Inside an expanded subprocess the answer is no, for now: the fragment is
 * pushed off the subprocess by the nudge, or split by the lane pass that runs
 * before the subprocess can grow, and the join is then refused (verdict-5).
 */
export function whyTemplateCantFollow(anchor: DiagramElement, elements: DiagramElement[]): string | null {
  const noFlow = `a template can’t follow “${anchorNameOf(anchor)}” — no sequence flow can leave it`;
  if (!SEQUENCE_NODE_TYPES.has(anchor.type)) return noFlow;
  // The probe sits on the anchor itself, in the container a step after it
  // joins, so this asks only whether a flow can LEAVE the anchor. Where a
  // particular template would actually land is the dry run's question, and it
  // answers with the real reason ("would land in “Us”").
  const parentId = followOnParentId(anchor, elements);
  const probe = {
    id: "\u0000template-entry", type: "task", label: "",
    x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height, properties: {},
    ...(parentId ? { parentId } : {}),
  } as DiagramElement;
  if (!canConnect(anchor, probe, "sequence", [...elements, probe])) return noFlow;
  if (flowScopeOf(anchor, "source", elements) !== null) return "templates can’t be attached inside an expanded subprocess yet";
  return null;
}

export interface TemplateAttachPlan {
  elements: DiagramElement[];
  connectors: Connector[];
  newIds: Set<string>;
  entryId: string;
  join: TemplateJoin;
}

/** `blame: "anchor"` — no template can follow it; `"template"` — this one can't. */
export type TemplateAttachRefusal = { error: string; blame: "anchor" | "template" };

/**
 * Place `templateData` after `anchorId` on `base`. `base` must be the diagram
 * WITHOUT any template still being previewed: planned against one with the old
 * preview on it, the new one is nudged clear of a template that is about to go.
 */
export function planTemplateAttach(
  templateData: TemplateData,
  anchorId: string,
  base: { elements: DiagramElement[]; connectors: Connector[] },
): TemplateAttachPlan | TemplateAttachRefusal {
  const anchor = base.elements.find((e) => e.id === anchorId);
  if (!anchor) return { error: "the element it was to follow is no longer on the diagram", blame: "anchor" };
  const why = whyTemplateCantFollow(anchor, base.elements);
  if (why) return { error: why, blame: "anchor" };
  if (templateData.elements.some((e) => e.type === "pool" || e.type === "lane" || e.type === "sublane")) {
    return { error: "it brings a pool or lane of its own", blame: "template" };
  }
  const attach = templateAttachData(templateData);
  const entry = attach && attach.data.elements.find((e) => e.id === attach.entryId);
  if (!attach || !entry) return { error: "it has no step a sequence flow can enter", blame: "template" };

  let anchorX: number, anchorY: number;
  if (anchor.boundaryHostId) {
    // R7: where a step after this event goes, as voice add-after and the ghost
    // accept place one. No obstacles here — the whole fragment is nudged below.
    const c = planBoundaryFollowOn(anchor, base.elements, entry.width, entry.height, []).center;
    anchorX = c.x - entry.width / 2;
    anchorY = c.y - entry.height / 2;
  } else {
    anchorX = anchor.x + anchor.width + HALF_TASK_W;
    anchorY = (anchor.y + anchor.height / 2) - entry.height / 2;
  }
  const inst = instantiateTemplateAnchored(attach.data, attach.entryId, anchorX, anchorY);
  if (!inst.entryNewId) return { error: "it has no step a sequence flow can enter", blame: "template" };

  // Rule 4, the whole fragment as one box.
  const minX = Math.min(...inst.elements.map((e) => e.x));
  const minY = Math.min(...inst.elements.map((e) => e.y));
  const bw = Math.max(...inst.elements.map((e) => e.x + e.width)) - minX;
  const bh = Math.max(...inst.elements.map((e) => e.y + e.height)) - minY;
  const others = base.elements
    .filter((e) => e.type !== "pool" && e.type !== "lane" && e.type !== "sublane")
    .map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
  const free = findFreeSlot({ x: minX + bw / 2, y: minY + bh / 2 }, bw, bh, others);
  const dx = free.x - (minX + bw / 2), dy = free.y - (minY + bh / 2);
  let elements = dx || dy ? inst.elements.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy })) : inst.elements;
  // A step after a boundary event joins the HOST's container, never the host:
  // adopted into the host, the subprocess grew round the fragment and the
  // entry flow was refused as out of scope. Notes stay unowned, as the lane
  // pass leaves them: a note adopted into a lane travels with the lane.
  const adoptInto = followOnParentId(anchor, base.elements);
  if (adoptInto) elements = elements.map((e) => (e.parentId || isLaneUnowned(e) ? e : { ...e, parentId: adoptInto }));
  const connectors = dx || dy
    ? inst.connectors.map((c) => ({ ...c, waypoints: c.waypoints.map((wp) => ({ x: wp.x + dx, y: wp.y + dy })) }))
    : inst.connectors;
  return {
    elements,
    connectors,
    newIds: inst.newIds,
    entryId: inst.entryNewId,
    join: { sourceId: anchor.id, targetId: inst.entryNewId },
  };
}

/** Which edge of `box` the element sticks out of, or null when it is inside (1px slack). */
function sticksOut(el: DiagramElement, box: DiagramElement): "above" | "below" | "left of" | "right of" | null {
  const slack = 1;
  if (el.y < box.y - slack) return "above";
  if (el.y + el.height > box.y + box.height + slack) return "below";
  if (el.x < box.x - slack) return "left of";
  if (el.x + el.width > box.x + box.width + slack) return "right of";
  return null;
}

/**
 * The dry run: apply the plan with the real reducer and judge what it DID, not
 * what was asked — the same way the apply layer asks `wouldChange`. A join that
 * exists is not enough: a fragment can be joined and still hang outside its
 * lane, land in another pool, or be split across a subprocess's edge. Each
 * failure is reported as what actually went wrong.
 */
export function checkTemplateAttach(base: DiagramData, plan: TemplateAttachPlan): { after: DiagramData } | { error: string } {
  const after = reducer(base, {
    type: "APPLY_TEMPLATE",
    payload: { elements: plan.elements, connectors: plan.connectors, join: plan.join },
  });
  const els = after.elements;
  const byId = new Map(els.map((e) => [e.id, e] as const));
  const anchor = byId.get(plan.join.sourceId);
  const entry = byId.get(plan.join.targetId);
  if (!anchor || !entry) return { error: "it could not be placed" };
  const anchorPool = getElementPoolId(anchor, els);
  const scope = flowScopeOf(anchor, "source", els);
  const plannedParent = new Map(plan.elements.map((e) => [e.id, e.parentId] as const));
  for (const id of plan.newIds) {
    const el = byId.get(id);
    // Notes and markers are not part of the flow and no lane owns them, so
    // where they land is not a reason to refuse a template.
    if (!el || isLaneUnowned(el)) continue;
    const parent = el.parentId ? byId.get(el.parentId) : undefined;
    const meant = plannedParent.get(id);
    if (meant && meant !== el.parentId) {
      const lane = byId.get(meant);
      return { error: `“${anchorNameOf(el)}” would land in “${parent ? anchorNameOf(parent) : "no lane"}”, not “${lane ? anchorNameOf(lane) : "its lane"}”` };
    }
    // A lane — or a pool with no lanes — grows DOWN to take a template; one
    // that reaches above its top hangs over the band above, drawn in one and
    // owned by another.
    const out = parent && !el.boundaryHostId ? sticksOut(el, parent) : null;
    if (parent && out) {
      return { error: `“${anchorNameOf(el)}” would stick out ${out} “${anchorNameOf(parent)}”` };
    }
    const pool = getElementPoolId(el, els);
    if (pool !== anchorPool) {
      const where = pool ? `in “${anchorNameOf(byId.get(pool)!)}”` : "outside every pool";
      return { error: `“${anchorNameOf(el)}” would land ${where}, away from “${anchorNameOf(anchor)}”` };
    }
    const own = (el.parentId && plan.newIds.has(el.parentId)) || el.boundaryHostId;
    if (!own && containerScopeOf(el, els) !== scope) {
      return { error: `“${anchorNameOf(el)}” would land in a different subprocess from “${anchorNameOf(anchor)}”` };
    }
  }
  const joined = after.connectors.some((c) =>
    c.type === "sequence" && c.sourceId === anchor.id && c.targetId === entry.id
    && !base.connectors.some((b) => b.id === c.id));
  if (!joined) return { error: `a sequence flow from “${anchorNameOf(anchor)}” into “${anchorNameOf(entry)}” isn’t legal` };
  return { after };
}

/** What the template window asks for when a number is picked. */
export interface TemplateShowRequest {
  /** The diagram as it is now — possibly with the previous pick still on it. */
  data: DiagramData;
  /** The pick currently showing, if any: the diagram it was applied to, and its ids. */
  provisional: { base: TemplateSnapshot; ids: TemplateIds } | null;
  /** useDiagram's answer: is that pick still exactly what the diagram shows? */
  showing: boolean;
  /** Each pick goes AFTER this element… */
  anchorId?: string;
  /** …or is centred here (the pointer, or the middle of the screen). */
  at: { x: number; y: number };
}

export type TemplateShowPlan =
  | { refused: string; blame: "anchor" | "template" }
  | {
      elements: DiagramElement[];
      connectors: Connector[];
      newIds: Set<string>;
      join?: TemplateJoin;
      /** For applyTemplate: the diagram to put back first, and whether its undo entry already exists. */
      over?: { base: TemplateSnapshot; entry: "kept" | "new" };
      /** The diagram the pick is applied to — kept with it for the next swap. */
      base: TemplateSnapshot;
    };

/**
 * One pick in the template window, decided without React: the diagram to
 * plan on (templatePreview.ts `previewBase` — never one with the previous pick
 * on it), where the template goes, and — after an element — the dry run that
 * refuses a template the reducer would not place cleanly. The editor applies
 * the answer; a test can follow the same steps.
 */
export function planTemplateShow(tdata: TemplateData, req: TemplateShowRequest): TemplateShowPlan {
  const pb = previewBase(req.provisional, req.showing, { elements: req.data.elements, connectors: req.data.connectors });
  const over = pb.mode === "fresh" ? undefined : { base: pb.base, entry: pb.mode === "restore" ? "kept" as const : "new" as const };
  if (req.anchorId) {
    const plan = planTemplateAttach(tdata, req.anchorId, pb.base);
    if ("error" in plan) return { refused: plan.error, blame: plan.blame };
    const checked = checkTemplateAttach({ ...req.data, elements: pb.base.elements, connectors: pb.base.connectors }, plan);
    if ("error" in checked) return { refused: checked.error, blame: "template" };
    return { elements: plan.elements, connectors: plan.connectors, newIds: plan.newIds, join: plan.join, ...(over ? { over } : {}), base: pb.base };
  }
  const placed = instantiateTemplate(tdata, req.at.x, req.at.y);
  return { ...placed, ...(over ? { over } : {}), base: pb.base };
}
