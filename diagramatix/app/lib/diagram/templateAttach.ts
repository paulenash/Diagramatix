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
 * A template picked with nothing to follow — the plain window, the toolbar's
 * template list — goes ON THE END of the current elements (`planTemplateDrop`),
 * by rules 1, 3 and 4 with no join.
 *
 * Pure, apart from the dry run, which asks the real reducer.
 */
import type { Connector, DiagramData, DiagramElement, TemplateData } from "./types";
import { reducer } from "@/app/hooks/useDiagram";
import { SEQUENCE_NODE_TYPES, instantiateTemplate, instantiateTemplateAnchored, isProcessStep, templateAttachData, templateEntryOf } from "./templates";
import { findFreeSlot, followOnParentId, placeInline, planBoundaryFollowOn, type Box, type Center } from "./assistPlacement";
import { canConnect, containerScopeOf, flowScopeOf } from "./canConnect";
import { getElementPoolId } from "./poolUtil";
import { isLaneUnowned } from "./containment";
import { boxOf, isTemplateContainer } from "./templateAdoption";
import { isBlackBoxPool } from "./blackBoxPoolMenu";
import { getLaneHeaderWidth, getPoolHeaderWidth } from "./containerMetrics";
import { MIN_LEFT_GAP } from "./poolLaneBounds";
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
 * pushed off the subprocess by the nudge, which knows nothing of it, and the
 * join is then refused (verdict-5).
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
  if (templateData.elements.some(isTemplateContainer)) {
    return { error: "it brings a pool or lane of its own", blame: "template" };
  }
  const attach = templateAttachData(templateData);
  const entry = attach && attach.data.elements.find((e) => e.id === attach.entryId);
  if (!attach || !entry) return { error: "it has no step a sequence flow can enter", blame: "template" };

  // Rule 1 — or, after a BOUNDARY event, R7: where a step after this event
  // goes, as voice add-after and the ghost accept place one. No obstacles
  // here — the whole fragment is nudged below.
  const c = anchor.boundaryHostId
    ? planBoundaryFollowOn(anchor, base.elements, entry.width, entry.height, []).center
    : placeInline(anchor, entry.width, entry.height);
  const inst = instantiateTemplateAnchored(attach.data, attach.entryId, c.x - entry.width / 2, c.y - entry.height / 2);
  if (!inst.entryNewId) return { error: "it has no step a sequence flow can enter", blame: "template" };

  // A step after a boundary event joins the HOST's container, never the host:
  // adopted into the host, the subprocess grew round the fragment and the
  // entry flow was refused as out of scope.
  const { elements, connectors } = nudgeAndAdopt(inst, base.elements, followOnParentId(anchor, base.elements));
  return {
    elements,
    connectors,
    newIds: inst.newIds,
    entryId: inst.entryNewId,
    join: { sourceId: anchor.id, targetId: inst.entryNewId },
  };
}

type Placed = { elements: DiagramElement[]; connectors: Connector[] };

function translated(p: Placed, dx: number, dy: number): Placed {
  if (!dx && !dy) return p;
  return {
    elements: p.elements.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy })),
    connectors: p.connectors.map((c) => ({ ...c, waypoints: c.waypoints.map((wp) => ({ x: wp.x + dx, y: wp.y + dy })) })),
  };
}

/** templateAdoption.ts `boxOf`, as the width × height box findFreeSlot takes. Callers pass at least one element. */
function boxOfPlaced(els: readonly DiagramElement[]): Box {
  const b = boxOf(els)!;
  return { x: b.x, y: b.y, width: b.right - b.x, height: b.bottom - b.y };
}

/**
 * Every drawn segment of these connectors' SEQUENCE flows (not the hidden
 * leaders into shapes' centres), as a zero-thickness box. Message flows are
 * left out: a message runs from pool to pool through every lane between, and
 * hopping clear of those lines threw templates out of their lane (Paul's Good
 * team, under his two messages to Pool 1).
 */
function flowSegments(connectors: readonly Connector[]): Box[] {
  const out: Box[] = [];
  for (const c of connectors) {
    if (c.type !== "sequence") continue;
    const w = c.waypoints ?? [];
    const from = c.sourceInvisibleLeader ? 1 : 0;
    const to = c.targetInvisibleLeader ? w.length - 2 : w.length - 1;
    for (let i = from; i < to; i++) {
      const p = w[i], q = w[i + 1];
      out.push({ x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), width: Math.abs(q.x - p.x), height: Math.abs(q.y - p.y) });
    }
  }
  return out;
}

/**
 * Rules 3 and 4, shared by the attach and the drop: the whole fragment is
 * nudged clear of other elements — and of the sequence flows among `flows`,
 * which it must not land on — as ONE box (findFreeSlot), and its
 * parentless elements join `adoptInto`. Notes stay unowned, as the lane pass
 * leaves them: a note adopted into a lane travels with the lane.
 */
function nudgeAndAdopt(inst: Placed, existing: readonly DiagramElement[], adoptInto: string | undefined, flows: readonly Connector[] = []): Placed {
  const b = boxOfPlaced(inst.elements);
  const others = [
    ...existing
      .filter((e) => e.type !== "pool" && e.type !== "lane" && e.type !== "sublane")
      .map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height })),
    ...flowSegments(flows),
  ];
  const centre = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const free = findFreeSlot(centre, b.width, b.height, others);
  const moved = translated(inst, free.x - centre.x, free.y - centre.y);
  if (!adoptInto) return moved;
  return { ...moved, elements: moved.elements.map((e) => (e.parentId || isLaneUnowned(e) ? e : { ...e, parentId: adoptInto })) };
}

/**
 * A band a dropped template can go on the end of: a lane or sub-lane with none
 * below it, or a white-box pool with no lanes (`hostId`), or — `hostId`
 * undefined — the flow elements that sit in no pool at all.
 */
export interface DropBand {
  hostId?: string;
  /** Where the band lies, for "under the middle of the screen": a lane across its whole pool, header included. */
  box: Box;
  /** The lane or pool itself — what its elements sit in. */
  body: Box;
  /** Where an empty lane's content starts: the header's right edge plus the half-event gap. */
  contentLeft?: number;
  /** Its last element: the flow node furthest right. */
  last?: DiagramElement;
}

const inBox = (b: Box, p: Center) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
const distToBox = (b: Box, p: Center) =>
  Math.hypot(Math.max(b.x - p.x, 0, p.x - (b.x + b.width)), Math.max(b.y - p.y, 0, p.y - (b.y + b.height)));

/**
 * The band under `at` — failing that, the band nearest it — with its last
 * element. Null when the diagram has no band at all (no white-box pool and no
 * flow element outside a pool).
 */
export function dropBandAt(elements: readonly DiagramElement[], at: Center): DropBand | null {
  const els = elements as DiagramElement[];
  const byId = new Map(els.map((e) => [e.id, e] as const));
  // The steps of the process (`isProcessStep`, the rule a template's first
  // step is chosen by), less the steps inside a subprocess — the subprocess
  // is the step.
  const steps = els.filter((e) => isProcessStep(e) && byId.get(e.parentId ?? "")?.type !== "subprocess-expanded");
  const centreOf = (e: DiagramElement): Center => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });
  const lastOf = (held: DiagramElement[]) => [...held].sort((a, b) =>
    ((b.x + b.width) - (a.x + a.width))
    || (Math.abs(centreOf(a).y - at.y) - Math.abs(centreOf(b).y - at.y)))[0];

  const bands: DropBand[] = [];
  for (const pool of els) {
    if (pool.type !== "pool" || isBlackBoxPool(pool)) continue;
    const lanes = els.filter((l) => (l.type === "lane" || l.type === "sublane") && getElementPoolId(l, els) === pool.id);
    const leaves = lanes.filter((l) => !lanes.some((k) => k.parentId === l.id));
    if (leaves.length === 0) {
      bands.push({ hostId: pool.id, box: pool, body: pool, contentLeft: pool.x + getPoolHeaderWidth(pool) + MIN_LEFT_GAP });
    }
    for (const l of leaves) {
      bands.push({
        hostId: l.id, body: l, contentLeft: l.x + getLaneHeaderWidth(l) + MIN_LEFT_GAP,
        box: { x: pool.x, y: l.y, width: pool.width, height: l.height },
      });
    }
  }
  for (const b of bands) b.last = lastOf(steps.filter((e) => inBox(b.body, centreOf(e))));
  const loose = steps.filter((e) => getElementPoolId(e, els) === null);
  if (loose.length) {
    const box = boxOfPlaced(loose);
    bands.push({ box, body: box, last: lastOf(loose) });
  }
  if (bands.length === 0) return null;
  const area = (b: DropBand) => b.box.width * b.box.height;
  const under = bands.filter((b) => b.hostId && inBox(b.box, at)).sort((a, b) => area(a) - area(b))[0]
    ?? bands.find((b) => !b.hostId && inBox(b.box, at));
  return under ?? [...bands].sort((a, b) => distToBox(a.box, at) - distToBox(b.box, at))[0];
}

/**
 * Where a template picked with nothing to follow goes — the plain template
 * window and the toolbar's template list.
 *
 * Paul, 2026-09-25: "assume the template will go on the end of the current
 * elements". Centred on the middle of the screen instead, his template landed
 * on top of his process, and the drag he made to get it off left it outside
 * his pool, still owned by his lanes (issue 6).
 *
 *   1. the band: the lane (or sub-lane, or white-box pool with no lanes)
 *      under the middle of the screen — failing that, the band nearest it
 *      (`dropBandAt`); the flow elements in no pool are a band of their own;
 *   2. the template's first step (templates.ts `templateEntryOf`) sits ½ Task
 *      width right of that band's last element, level with it — rule 1, with
 *      no join; in a lane with nothing in it, at the lane's left, clear of its
 *      header by the half-event gap and level with its middle;
 *   3. the whole fragment is nudged clear as ONE box — of the elements, and
 *      of the sequence flows too, or it could land on the flow the last
 *      element sends down to the next lane — and joins the band (rules 3 and
 *      4). APPLY_TEMPLATE then makes the room.
 * Level is where it is PLANNED. A template that would reach above its lane's
 * top is then lowered into the lane by APPLY_TEMPLATE, just far enough, and
 * the lane's own content stays where it is — with no join, only the template
 * is lowered (the issue 6 decision; carrying the lane's content down with it
 * is for a joined template, whose join must stay level).
 * An empty diagram, and a template that brings pools or lanes of its own
 * (APPLY_TEMPLATE stacks those under the diagram's pools), go where they
 * always went: centred on the middle of the screen.
 *
 * `base` must be the diagram WITHOUT any template still being previewed.
 */
export function planTemplateDrop(
  templateData: TemplateData,
  base: { elements: DiagramElement[]; connectors: Connector[] },
  viewCentre: Center,
): { elements: DiagramElement[]; connectors: Connector[]; newIds: Set<string> } {
  const centred = instantiateTemplate(templateData, viewCentre.x, viewCentre.y);
  if (centred.elements.length === 0 || templateData.elements.some(isTemplateContainer)) return centred;
  const band = dropBandAt(base.elements, viewCentre);
  if (!band) return { ...nudgeAndAdopt(centred, base.elements, undefined, base.connectors), newIds: centred.newIds };

  // What lines up with the band: the template's first step, else its box.
  const entry = templateEntryOf(templateData);
  const entryNow = entry ? centred.elements[templateData.elements.indexOf(entry)] : undefined;
  const lead = entryNow ?? boxOfPlaced(centred.elements);
  const box = boxOfPlaced(centred.elements);
  let dx: number, dy: number;
  if (band.last) {
    const c = placeInline(band.last, lead.width, lead.height);
    dx = c.x - lead.width / 2 - lead.x;
    dy = c.y - lead.height / 2 - lead.y;
  } else {
    dx = (band.contentLeft ?? box.x) - box.x;
    dy = (band.body.y + band.body.height / 2) - (lead.y + lead.height / 2);
  }
  return { ...nudgeAndAdopt(translated(centred, dx, dy), base.elements, band.hostId, base.connectors), newIds: centred.newIds };
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
    // The band makes room all round a joined template — down, and at its top
    // by carrying its own content down with it (useDiagram `makeRoomInLane`)
    // — so a template reaching above its lane is placed, not refused. The
    // check stays for anything that still ends up outside what owns it.
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
  /** …or is centred on the pointer ("add template here")… */
  at?: { x: number; y: number };
  /** …or goes on the end of the current elements, in the lane under the middle of the screen (`planTemplateDrop`). */
  viewCentre: { x: number; y: number };
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
  const placed = req.at ? instantiateTemplate(tdata, req.at.x, req.at.y) : planTemplateDrop(tdata, pb.base, req.viewCentre);
  return { ...placed, ...(over ? { over } : {}), base: pb.base };
}
