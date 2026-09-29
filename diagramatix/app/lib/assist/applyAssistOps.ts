/**
 * Apply interpreted Voice Assist ops to a diagram.
 *
 * Lifted out of DiagramEditor (2026-09-25) so the same code can run WITHOUT the
 * editor: the test harness drives it through `headlessDiagram.ts` to ask the
 * fourth question — "did applying the ops do the right thing?" (L4). The body
 * is the editor's, moved verbatim; everything it used to close over now
 * arrives in the context below, under the same names, so a line here reads
 * exactly as it did there.
 *
 * What stays in the editor, deliberately: "again" (which batch to repeat is
 * editor memory) and the gold-flash / debug snapshots (display concerns taken
 * around the call, never inside it).
 *
 * Two halves of the context, and the split matters:
 * - `actions` EDIT THE DIAGRAM. In the editor they are useDiagram's undoable
 *   helpers; headless, they are the same reducer actions applied to a plain
 *   state. They are what L4 scores.
 * - `ui` is the SCREEN — selection, pickers, the template window. Headless, a
 *   recorder that changes nothing.
 */
import type { MutableRefObject } from "react";
import type { DiagramData, DiagramElement, Connector, Side, SymbolType, EventType, BpmnTaskType, ConnectorType, DirectionType, RoutingType } from "@/app/lib/diagram/types";
import type { PoolPosition } from "@/app/lib/diagram/poolOrder";
import type { WrapIds } from "@/app/lib/diagram/subprocessWrap";
import type { NextStepCandidate } from "@/app/lib/diagram/nextSteps";
import type { RiskCatalogItem } from "@/app/components/canvas/RiskControlSection";
import { nanoid, isContainerType, getAllDescendantIds, reducer, type Action } from "@/app/hooks/useDiagram";
import { sizeOf, placeInline, placeGatewayBranch, placeBoundaryEvent, planBoundaryFollowOn, followOnParentId, findFreeSlot, HALF_TASK_W, HALF_TASK_H, type BoundaryFollowOn } from "@/app/lib/diagram/assistPlacement";
import { planWrapInSubprocess, planUnwrapSubprocess, planWrapInContainer } from "@/app/lib/diagram/subprocessWrap";
import { canConnect, messageFlowRefusal } from "@/app/lib/diagram/canConnect";
import { isBoundaryHost } from "@/app/lib/diagram/boundaryHosts";
import { resolveRef, resolveSelectionRefs, isSelectionRef, nearestRefs, ID_REF_PREFIX, spokenNumbersAsDigits } from "./resolveRef";
import { isPointerElementRef } from "./pointerRef";
import { nextContainerLabels } from "@/app/lib/diagram/containerNames";
import { isAnyLane, isSublane, laneKindWord, sameKindAs } from "@/app/lib/diagram/laneKind";
import { LANE_EXPAND_STEP } from "@/app/lib/diagram/laneFit";
import { containerWordKind } from "./containerWords";
import { convertMatches, matchesForType } from "./convertPhrase";
import { planLabelFill } from "./fillSelection";
import { findRiskCatalogItem } from "./riskCatalogRef";
import { parseGhostPick, resolveGhostPick } from "./ghostPick";
import { looksLikeElementId } from "./refMentions";
import { capitaliseFirstWord, needsCapital, spokenName } from "@/app/lib/diagram/nameCase";
import { goldFlashSummary } from "./goldFlash";
import { planMovePool, planSwapPools, selectedPools, poolsInOrder } from "@/app/lib/diagram/poolOrder";
import { collectMessageTargets, type MessagePick } from "./messageTargets";
import type { AssistOp } from "./ops";
import { boundaryRect } from "./poolBoundaryPhrase";
import { planWrapInPool } from "@/app/lib/diagram/wrapInPoolPlan";
import { syntheticElement, withAdded, withDeleted, withLabel } from "./workingSet";
import { collectRenameTargets, type RenameType, type RenameTarget } from "./renameTargets";
import { buildConnectorPickFlow, buildPickFlow, type PickFlow } from "./disambiguate";
import { getRiskControl, riskControlPatch } from "@/app/lib/diagram/riskControl";
import { simPatch } from "@/app/lib/diagram/simParams";
import { whyTemplateCantFollow } from "@/app/lib/diagram/templateAttach";
import { SEQUENCE_NODE_TYPES } from "@/app/lib/diagram/templates";
import { eventSideRefusal } from "@/app/lib/diagram/eventSides";
import { bandAt, planInsertBetween } from "@/app/lib/diagram/insertBetween";
import { bandOf, planMoveContents, CONTENTS_STEP_PX } from "@/app/lib/diagram/moveContents";
import { buildDividerFlow, type DividerFlow } from "./dividerFlow";
import { contentCrossedBy, cutByLine, dividerRoom, givingBands, laneEdgePlan, poolEdgeRoom, wrapLabelInTwo } from "@/app/lib/diagram/laneBoundary";
import { nextBoundaryMemory, type BoundaryMemory } from "./boundaryFollowUp";
import { laneMetrics } from "@/app/lib/diagram/containerMetrics";
import { checkElementOverlap } from "@/app/lib/diagram/checks/diagramChecks";
import { BOUNDARY_STEP_PX } from "./poolBoundaryPhrase";
import { TEMPLATE_BEFORE_REFUSAL } from "./templatePhrase";
import { refKind, unsaidRef, type RefKind } from "./refKinds";
import { connectorsOverElement } from "./connectorRef";

/** The guided "rename by number" flow — pick a numbered badge, then say the name. */
export type RenameFlow =
  | { phase: "pick"; itemType: RenameType; targets: RenameTarget[] }
  | { phase: "name"; itemType: RenameType; targetId: string; kind: "element" | "connector"; /** "label selected" — one item, no pick loop after */ single?: boolean };

export type AlignMode = "center" | "top" | "bottom" | "vcenter" | "left" | "right" | "smart";

/** The diagram edits — useDiagram's helpers, by the same names and signatures. */
export interface AssistDiagramActions {
  /** The editor passes its element-limit-gated wrapper; headless, the plain add. */
  addElementGated(symbolType: SymbolType, position: { x: number; y: number }, taskType?: BpmnTaskType, eventType?: EventType, id?: string, initial?: { properties?: Record<string, unknown>; width?: number; height?: number; label?: string; parentId?: string; keepInLane?: boolean }): void;
  updateProperties(id: string, properties: Record<string, unknown>): void;
  updateLabel(id: string, label: string): void;
  addConnector(sourceId: string, targetId: string, connectorType?: ConnectorType, directionType?: DirectionType, routingType?: RoutingType, sourceSide?: Side, targetSide?: Side, sourceOffsetAlong?: number, targetOffsetAlong?: number, force?: boolean, initialLabel?: string): void;
  deleteConnector(id: string): void;
  updateConnectorLabel(id: string, label?: string): void;
  deleteElement(id: string): void;
  undo(): void;
  clearDiagram(): void;
  setEventBoundary(id: string, hostId: string | null): void;
  splitPoolEven(poolId: string, labels: string[]): void;
  splitLaneEven(laneId: string, labels: string[]): void;
  wrapInPool(label?: string): void;
  wrapInSubprocess(selectedIds: string[], label: string, ids: WrapIds): void;
  wrapInContainer(selectedIds: string[], container: "pool" | "lane", label: string, ids: { containerId: string }): void;
  unwrapSubprocess(epId: string): void;
  addPool(opts?: { label?: string; poolType?: string; position?: "above" | "below"; relativeToId?: string }): void;
  addLaneAt(poolId: string, position: "above" | "below", refLaneId: string, label?: string): void;
  compressPool(poolId: string): void;
  compressLane(laneId: string): void;
  expandLane(laneId: string, by: number): void;
  extendPools(): void;
  swapLane(laneId: string, direction: "up" | "down"): void;
  moveLane(laneId: string, direction: "up" | "down", distance?: number): void;
  moveElements(ids: string[], dx: number, dy: number): void;
  elementsMoveEnd(): void;
  removeSpace(zone: { x: number; y: number; width: number; height: number }): void;
  /** The mouse's Insert Space, scoped to one container's contents ("insert between"). */
  insertSpace(markerX: number, markerY: number, dx: number, dy: number, scopeId?: string): void;
  /** The right-click menu's task ↔ subprocess toggle. */
  convertTaskSubprocess(id: string): void;
  /** The divider drag: the band above grows by dy, the band below gives way. */
  moveLaneBoundary(aboveLaneId: string, belowLaneId: string, dy: number): void;
  laneBoundaryMoveEnd(): void;
  updateConnectorEndpoint(connectorId: string, endpoint: "source" | "target", newElementId: string, newSide: Side, newOffsetAlong?: number): void;
  movePoolTo(poolId: string, position: PoolPosition, relativeToId: string): void;
  swapPools(aId: string, bId: string): void;
  resizeElement(id: string, x: number, y: number, width: number, height: number): void;
  resizeElementEnd(id: string): void;
  alignElements(ids: string[], mode: AlignMode): void;
}

/** The screen — selection, pickers, windows. Changes nothing on the diagram. */
export interface AssistUi {
  setSelectedElementIds(ids: Set<string>): void;
  setSelectedConnectorId(id: string | null): void;
  setPickFlow(f: PickFlow | null): void;
  setRenameFlow(f: RenameFlow | null): void;
  setMessageFlow(f: MessagePick | null): void;
  /** "move dividers" — open (or close) the numbered-divider flow. */
  setDividerFlow(f: DividerFlow | null): void;
  setGoldFlash(on: boolean): void;
}

/**
 * The diagram's own settings the reducer reads — the fonts its names are
 * measured at, its layout mode. A command that asks the reducer first
 * (`wouldChange`) must ask about THIS diagram: asked at the default fonts, a
 * lane at its 20 px name floor was "compressed" (nothing changed) and one at a
 * 10 px floor was "already fitted" (it would have shrunk).
 */
export type AssistDiagramSettings = Pick<DiagramData, "poolFontSize" | "laneFontSize" | "connectorFontSize" | "relaxedLayout">;

/** A diagram's settings for the apply context — one list, read by the editor and the headless harness alike. */
export function assistSettingsOf(d: AssistDiagramSettings): AssistDiagramSettings {
  return { poolFontSize: d.poolFontSize, laneFontSize: d.laneFontSize, connectorFontSize: d.connectorFontSize, relaxedLayout: d.relaxedLayout };
}

export interface AssistApplyContext {
  /**
   * Auto-connect (the phone's toggle, 2026-09-29): an add that names no
   * "after X" and no pointer is joined by a sequence flow from the element it
   * was placed after (the selection, else the last one added) — when the flow
   * is legal, and silently unconnected when it is not. Off unless asked for.
   */
  autoConnect?: boolean;
  /** The diagram BEFORE the batch. React does not re-render mid-batch, so the
   *  working copy below threads each op's effect forward itself. */
  elements: DiagramElement[];
  connectors: Connector[];
  settings: AssistDiagramSettings;
  riskCatalog: RiskCatalogItem[];
  actions: AssistDiagramActions;
  ui: AssistUi;
  /** Refs, because the editor keeps these in refs and some are WRITTEN here. */
  refs: {
    /** The element the last command was about — "it", and the anchor for the next add. Written. */
    voiceLastId: MutableRefObject<string | null>;
    pointerWorld: MutableRefObject<{ x: number; y: number } | null>;
    selectedIdsRef: MutableRefObject<string[]>;
    selectedConnectorIdRef: MutableRefObject<string | null>;
    nextStepRef: MutableRefObject<{ candidates: NextStepCandidate[]; accept: (c: NextStepCandidate) => void }>;
    /** Opens the numbered window; `anchorId` — each pick goes after it, `at` — at that point. Returns the log line. */
    openTemplateWindowRef: MutableRefObject<(opts?: { anchorId?: string; at?: { x: number; y: number } }) => string>;
    exportJsonRef: MutableRefObject<(() => void) | null>;
    /** The last lane-boundary / pool-edge command and how far it has moved — its follow-up ("sixty pixels") reads it (boundaryFollowUp.ts). Written. */
    boundaryLast?: MutableRefObject<BoundaryMemory | null>;
  };
}

const elBox = (e: DiagramElement) => ({ x: e.x, y: e.y, width: e.width, height: e.height });
/** Whether anything that sat inside its pool in `before` sticks out of it in `after`. */
function leavesItsPool(before: readonly DiagramElement[], after: readonly DiagramElement[]): boolean {
  const byId = new Map(after.map((e) => [e.id, e] as const));
  const poolOf = (e: DiagramElement) => { let c = byId.get(e.parentId ?? ""); for (let i = 0; c && i < 16; i++) { if (c.type === "pool") return c; c = byId.get(c.parentId ?? ""); } return undefined; };
  const out = (e: DiagramElement, p: DiagramElement) => e.x < p.x - 0.5 || e.y < p.y - 0.5 || e.x + e.width > p.x + p.width + 0.5 || e.y + e.height > p.y + p.height + 0.5;
  const was = new Map(before.map((e) => [e.id, e] as const));
  return after.some((e) => {
    const p = poolOf(e);
    if (!p) return false;
    const w = was.get(e.id), wp = w ? was.get(p.id) : undefined;
    return out(e, p) && !(w && wp && out(w, wp));
  });
}
const nameOf = (e: DiagramElement) => (spokenName(e.label) || e.type);
const sameName = (a: string | undefined, b: string | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
/** M7 — how the log says what an align just did. */
const ALIGN_LABEL: Record<string, string> = {
  smart: "tidily", center: "into a row", vcenter: "into a column",
  left: "on their left edges", right: "on their right edges",
  top: "on their top edges", bottom: "on their bottom edges",
};

/** Apply interpreted ops via the granular (undoable) reducer helpers. */
export function applyAssistOps(ops: AssistOp[], ctx: AssistApplyContext): { ok: boolean; summary: string } {
  const data = { elements: ctx.elements, connectors: ctx.connectors };
  const { riskCatalog } = ctx;
  const {
    addElementGated, updateProperties, updateLabel, addConnector, deleteConnector, updateConnectorLabel,
    deleteElement, undo, clearDiagram, setEventBoundary, splitPoolEven, splitLaneEven, wrapInPool,
    wrapInSubprocess, wrapInContainer, unwrapSubprocess, addPool, addLaneAt, compressPool, compressLane, expandLane, extendPools,
    swapLane, moveLane, moveElements, elementsMoveEnd, removeSpace, insertSpace, convertTaskSubprocess, moveLaneBoundary, laneBoundaryMoveEnd, updateConnectorEndpoint, movePoolTo,
    swapPools, resizeElement, resizeElementEnd, alignElements,
  } = ctx.actions;
  const { setSelectedElementIds, setSelectedConnectorId, setPickFlow, setRenameFlow, setMessageFlow, setDividerFlow, setGoldFlash } = ctx.ui;
  const { voiceLastId, pointerWorld, selectedIdsRef, selectedConnectorIdRef, nextStepRef, openTemplateWindowRef, exportJsonRef } = ctx.refs;
  const results: string[] = [];
  let anyFail = false;
  // R2: set when a command has been PARKED for a disambiguation pick. It is
  // not a failure — the user is about to answer — so the log says what it is
  // waiting for rather than reporting an error.
  let pickParked = false;
  // Gold flashing: remember where everything was, so that once React has
  // Working copy: each op's effect is threaded back in (workingSet.ts) so a
  // later op in the same batch can refer to what an earlier one created —
  // "add X and connect it to Y". React has not re-rendered mid-loop, so
  // `data.elements` alone would still be the pre-batch diagram.
  let els: DiagramElement[] = data.elements;
  /**
   * Would this reducer action change the diagram as it stands mid-batch? Some
   * actions decline silently when there is no room — right for a drag, which
   * simply stops — and a spoken command must not report success for them. The
   * REDUCER answers, so its room rule is never copied here — and it answers
   * about this diagram, its own fonts and layout mode included.
   */
  const preview = (action: Action): DiagramData | null => {
    const now = { ...ctx.settings, elements: els, connectors: data.connectors, viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData;
    const next = reducer(now, action);
    return next === now ? null : next;
  };
  const wouldChange = (action: Action): boolean => preview(action) !== null;
  /**
   * One lane, up or down within its stack (MOVE_LANE: it and everything in it
   * move; the neighbour it moves toward gives way). "move the Finance lane up",
   * and since the 2026-09-28 sweep "move Finance up" / "nudge Finance up" too —
   * a lane is never slid as a shape. Says what happened; false when refused.
   */
  const moveLaneInStack = (r: DiagramElement, direction: "up" | "down", distance: number): boolean => {
    if (r.type !== "lane") {
      results.push(`${nameOf(r)} is a sub-lane of its own kind that can't be moved up or down — say “move ${nameOf(r)} top boundary ${direction}” to move its divider`);
      return false;
    }
    const sibs = els.filter((e) => e.type === "lane" && e.parentId === r.parentId).sort((a, b) => a.y - b.y);
    const i = sibs.findIndex((s) => s.id === r.id);
    const toward = direction === "down" ? sibs[i + 1] : sibs[i - 1];
    if (!toward) { results.push(`${nameOf(r)} is against the pool edge — can't move it ${direction}`); return false; }
    // Same trap as addLaneAt. A lane move is a trade between its two
    // neighbours — moving down grows the lane ABOVE and shrinks the one below
    // — so the reducer needs a lane on BOTH sides, and stops where the one
    // giving way runs out (its contents, or sublanes that fill it). The edge
    // check above only looked one way, and either refusal still reported
    // "moved" (found by L4, 2026-09-25).
    if (!wouldChange({ type: "MOVE_LANE", payload: { laneId: r.id, direction, distance } })) {
      const behind = direction === "down" ? sibs[i - 1] : sibs[i + 1];
      results.push(behind
        ? `${nameOf(r)} can't move ${direction} — ${nameOf(toward)} has no room to give`
        : `${nameOf(r)} is the ${direction === "down" ? "top" : "bottom"} lane — moving it ${direction} needs a lane ${direction === "down" ? "above" : "below"} it to take up the gap`);
      return false;
    }
    moveLane(r.id, direction, distance);
    voiceLastId.current = r.id;
    setSelectedElementIds(new Set()); // selection protocol
    results.push(`moved ${nameOf(r)} ${direction}`);
    return true;
  };
  // Multi-modal: "this" / "these" / "the selected task" resolve to the mouse
  // selection — the mouse says WHICH, the voice says WHAT.
  const selectedIds = selectedIdsRef.current;
  /** The op being applied, by index: a parked question re-runs from HERE, so what already ran never runs twice. */
  let opAt = -1;
  /** The last genuine ambiguity `resolve1` met — raised as a picker if the op reported it (`askWhich`). */
  let pendingAsk: { ref: string; ids: string[]; err: string; at: number } | null = null;
  /**
   * `strict` (R3) is for commands that DESTROY something: only the selection
   * settles a bare type noun there. Without it, the one just added by voice
   * does too — "add a task after the gateway" you just made. Otherwise,
   * with several, it asks (bareKindChoice, Paul 2026-09-27).
   *
   * R2: an ambiguity now names the candidates instead of throwing them away.
   * `resolveRef` has always returned the list; the message discarded it and
   * said only "is ambiguous", which left the user to guess what it had found.
   */
  const resolve1 = (ref: string, opts: { strict?: boolean; kind?: RefKind } = {}): DiagramElement | { err: string; ambiguous?: string[] } => {
    const r = resolveRef(ref, els, voiceLastId.current, selectedIds, { ...opts, pointer: pointerWorld.current });
    if (!r) {
      if (isSelectionRef(ref) && selectedIds.length === 0) return { err: "nothing is selected" };
      // R6 — "couldn't find X" on its own leaves the user unable to tell
      // whether they said the wrong name, said the right one and were
      // misheard, or are on the wrong diagram. The passes above computed the
      // answer and discarded it; `nearestRefs` re-runs them loosely, which is
      // safe because the result only ever becomes a question.
      // An id that did not resolve is OUR plumbing leaking, not something
      // the user said — they spoke a name. Echoing `k3f9a2bx` at them is
      // meaningless (Paul, 2026-09-21), and "did you mean" on an id is
      // noise, so neither is offered.
      if (looksLikeElementId(ref)) return { err: "couldn't work out which element that meant — say its name" };
      const near = nearestRefs(ref, els, 3, opts.kind);
      if (!near.length) return { err: `couldn't find “${ref}”` };
      const names = near.map((n) => `“${n.label}”`);
      const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
      return { err: `couldn't find “${ref}” — did you mean ${list}?`, ambiguous: near.map((n) => n.id) };
    }
    if ("ambiguous" in r) {
      if (isSelectionRef(ref)) return { err: `${r.ambiguous.length} elements are selected — select just one for that` };
      const names = r.ambiguous
        .map((id) => els.find((e) => e.id === id))
        .filter((e): e is DiagramElement => !!e)
        .map((e) => (e.label ?? "").trim() || e.type);
      const shown = names.slice(0, 4).map((nm) => `“${nm}”`).join(", ");
      const more = names.length > 4 ? `, and ${names.length - 4} more` : "";
      // The ids travel with the message so a caller can raise the PICKER
      // (R2) instead of only reporting; callers that don't care still get a
      // sentence that names what it found.
      const err = `which “${ref}”? ${names.length} match: ${shown}${more} — say the name`;
      pendingAsk = { ref, ids: r.ambiguous, err, at: opAt };
      return { err, ambiguous: r.ambiguous };
    }
    return els.find((e) => e.id === r.id)!;
  };
  /** Resolve one field of an op, bounded by the kind refKinds.ts says that field names. */
  const resolveField = <O extends AssistOp>(op: O, field: keyof O & string, opts: { strict?: boolean } = {}) =>
    resolve1(String(op[field] ?? ""), { ...opts, kind: refKind(op.op, field) });
  /**
   * A BARE KIND — "compress lane", "expand the lane", "compress the pool" —
   * names no one thing. The mouse may: exactly one of that kind selected is the
   * one meant (the mouse says which, the voice says what). Otherwise the strict
   * resolve asks, numbered, and never takes the newest — compressing the wrong
   * lane is a large, quiet edit. "lane" takes a selected lane of either depth;
   * "sublane" only a sub-lane.
   */
  const selectedOfBareKind = (ref: string): DiagramElement | null => {
    const kind = containerWordKind(ref.trim().replace(/^the\s+/i, ""));
    if (!kind) return null;
    const sel = selectedIds
      .map((id) => els.find((e) => e.id === id))
      .filter((e): e is DiagramElement => !!e)
      .filter((e) => (kind === "pool" ? e.type === "pool" : kind === "sublane" ? isSublane(e, els) : isAnyLane(e)));
    return sel.length === 1 ? sel[0] : null;
  };
  /**
   * Fit a lane (or sub-lane) to its content — laneFit.ts, via the reducer. The
   * reducer is ASKED first: a lane already fitted says so, rather than
   * reporting a change that did not happen.
   */
  const compressTheLane = (lane: DiagramElement) => {
    if (!wouldChange({ type: "COMPRESS_LANE", payload: { laneId: lane.id } })) {
      results.push(`${nameOf(lane)} is already fitted to its content`);
      anyFail = true;
      return;
    }
    compressLane(lane.id);
    results.push(`compressed ${nameOf(lane)} to its content`);
  };
  // "delete selected" on an expanded subprocess DISSOLVES it: the shell and
  // its Start/End go, the contents are spliced back into the flow and the
  // room the shell used is given back — the reverse of "surround selected"
  // (Paul, 2026-09-16). Planned by subprocessWrap.ts, applied by the reducer.
  const unwrapEp = (ep: DiagramElement): boolean => {
    const plan = planUnwrapSubprocess({ elements: els, connectors: data.connectors }, ep.id);
    if ("error" in plan) { results.push(plan.error); return false; }
    unwrapSubprocess(ep.id);
    els = plan.elements;
    if (voiceLastId.current === ep.id) voiceLastId.current = null;
    setSelectedElementIds(new Set()); // selection protocol: nothing stays selected
    results.push(plan.summary);
    return true;
  };
  /** Swap two pools in the stack — "swap Pool 1 with Pool 2", or two bare pool names. */
  const swapTwoPools = (a: DiagramElement, b: DiagramElement): boolean => {
    const plan = planSwapPools(els, data.connectors, a.id, b.id, isContainerType, getAllDescendantIds);
    if ("error" in plan) { results.push(plan.error); return false; }
    swapPools(a.id, b.id);
    els = plan.elements;
    setSelectedElementIds(new Set()); // selection protocol
    results.push(`swapped ${nameOf(a)} and ${nameOf(b)}`);
    return true;
  };
  /** When a name that must be a pool names something else, say what it is. Null when it names nothing. */
  const notAPool = (ref: string): string | null => {
    const r = resolveRef(ref, els, voiceLastId.current, selectedIds, { pointer: pointerWorld.current });
    const e = r && "id" in r ? els.find((x) => x.id === r.id) : undefined;
    if (!e || e.type === "pool") return null;
    if (isAnyLane(e)) return `${nameOf(e)} is a ${laneKindWord(e, els)} — only pools move above or below each other; say “move the ${nameOf(e)} lane up” or “down”`;
    return `${nameOf(e)} is a ${e.type.replace(/-/g, " ")} — only pools move above or below each other`;
  };
  /**
   * A command that names NO pool — "nudge pool down", "move the pool left
   * boundary right" — means "the pool", by the same rule as any bare kind word:
   * the only one, the one selected, the one just added, or the question. Both
   * used to take the newest (black-box first): Claims System on Paul's test
   * diagram (2026-09-27). The parked command carries the words, so the picked
   * number lands in it.
   */
  const thePoolFor = (op: AssistOp & { ref?: string }): DiagramElement | "parked" | null => {
    const ref = op.ref ?? unsaidRef(op.op, "ref") ?? "the pool";
    if (!op.ref && !els.some((e) => e.type === "pool")) { results.push("there's no pool on the diagram"); anyFail = true; return null; }
    const r = resolve1(ref);
    if (!("err" in r)) return r;
    if (!op.ref && r.ambiguous) {
      const flow = buildPickFlow([{ ...op, ref } as AssistOp, ...ops.slice(opAt + 1)], ref, r.ambiguous, els);
      if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; return "parked"; }
    }
    results.push(r.err); anyFail = true;
    return null;
  };
  /**
   * ONE PLACE ASKS "WHICH?" (Paul, 2026-09-27: a bare "the pool" / "the
   * gateway" asks which when there are several). A command that REPORTED an
   * ambiguity — "which “the pool”? 3 match …" — parks for a number instead,
   * whichever op it was. The pickers written into single ops (delete, add
   * after, add lane …) had left every other op answering "say the name".
   * Only a reported ambiguity is raised: an op that met one and dealt with it
   * some other way is left alone.
   */
  const askWhich = (): boolean => {
    const a = pendingAsk;
    pendingAsk = null;
    if (!a || pickParked) return false;
    const i = results.lastIndexOf(a.err);
    if (i < 0) return false;
    const flow = buildPickFlow(ops.slice(a.at), a.ref, a.ids, els);
    if (!flow) return false;
    results[i] = flow.prompt;
    setPickFlow(flow);
    pickParked = true;
    return true;
  };
  /**
   * "insert" goes INTO the flow (Paul, 2026-09-28: "If a connector is selected
   * and "insert task" then the new task should be added into the connector";
   * "insert a Task after selected … should also insert into the outgoing
   * connector on the selected element, if there is one"). Either way it is
   * "insert … between" with both ends given exactly — the same placement, the
   * same room made, the same re-joining. Otherwise the add is left as it was.
   *
   * "add … after X" too (Paul, 2026-09-28: "Should "add … after" also go into
   * the outgoing connector? - Yes!!"). A selected connector is "insert" only.
   */
  // Only what a flow can pass THROUGH goes into one: nothing leaves an end
  // event or enters a start event, so those are added after, as before (the
  // generated set, 2026-09-28: "insert an end event … after Check Claim").
  const FLOWS_THROUGH = new Set<string>(["task", "subprocess", "subprocess-expanded", "gateway", "intermediate-event"]);
  const intoFlow = (op: AssistOp): AssistOp => {
    if (op.op !== "add" || op.at || !FLOWS_THROUGH.has(op.symbolType)) return op;
    const between = (from: string, to: string): AssistOp => ({
      op: "insertBetween", symbolType: op.symbolType, afterRef: `${ID_REF_PREFIX}${from}`, beforeRef: `${ID_REF_PREFIX}${to}`,
      ...(op.label ? { label: op.label } : {}), ...(op.eventType ? { eventType: op.eventType } : {}), ...(op.gatewayType ? { gatewayType: op.gatewayType } : {}),
    });
    if (!op.afterRef) {
      if (!op.insert) return op;
      const c = selectedConnectorIdRef.current ? data.connectors.find((x) => x.id === selectedConnectorIdRef.current) : undefined;
      return c && c.type === "sequence" && els.some((e) => e.id === c.sourceId) && els.some((e) => e.id === c.targetId) ? between(c.sourceId, c.targetId) : op;
    }
    const r = resolveRef(op.afterRef, els, voiceLastId.current, selectedIds, { strict: true, pointer: pointerWorld.current });
    if (!r || !("id" in r)) return op;   // not found, or which one? — the add says so
    const outs = data.connectors.filter((c) => c.type === "sequence" && c.sourceId === r.id && els.some((e) => e.id === c.targetId));
    return outs.length === 1 ? between(r.id, outs[0].targetId) : op;
  };
  for (const op0 of ops) {
    opAt += 1;
    if (askWhich()) break;
    const op = intoFlow(op0);
    if (op.op === "undo") { undo(); results.push("undid the last change"); continue; }
    if (op.op === "clear") { clearDiagram(); voiceLastId.current = null; results.push("cleared the diagram"); continue; }
    if (op.op === "export") { exportJsonRef.current?.(); results.push("exported to JSON"); continue; }
    // Gold flashing is a display preference, not an edit: it changes nothing
    // on the diagram, takes no undo entry, and is remembered per browser.
    if (op.op === "goldFlash") { setGoldFlash(op.on); results.push(goldFlashSummary(op.on)); continue; }

    if (op.op === "add") {
      const { w, h } = sizeOf(op.symbolType);
      let anchor: DiagramElement | null = null;
      // A NAMED ANCHOR THAT DOES NOT RESOLVE STOPS THE COMMAND.
      //
      // This used to report the error and carry straight on to the recency
      // fallback below, so "add a task called Check Stock after Receive
      // Order" with two "Receive Order"s on the diagram printed
      //
      //   which "receive order"? 2 match … — say the name; added check
      //   stock after check stock
      //
      // — the ambiguity named, and the element added anyway, anchored to
      // whatever happened to be added last (Paul's log, 2026-09-21). The
      // recency fallback is right when NO anchor was named; it is never
      // right when one was named and not found. Failing to find what the
      // user asked for is not permission to pick something else.
      if (op.afterRef) {
        const a = resolve1(op.afterRef, { strict: true });
        if ("err" in a && a.ambiguous) {
          // They can see which one they meant — number them and ask, rather
          // than making them rephrase (R2).
          const flow = buildPickFlow(ops.slice(opAt), op.afterRef, a.ambiguous, els);
          if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
        }
        if ("err" in a) { results.push(a.err); anyFail = true; continue; }
        anchor = a;
      }
      if (!anchor && voiceLastId.current) anchor = els.find((e) => e.id === voiceLastId.current) ?? null;
      const others = els.filter((e) => e.type !== "pool" && e.type !== "lane" && e.type !== "sublane").map(elBox);
      let center; let srcSide: Side | undefined;
      let followOn: BoundaryFollowOn | null = null;
      // M5 — "put a task here". The pointer beats every placement rule below,
      // because the user has said exactly where they want it; `findFreeSlot`
      // still nudges it clear of anything already there, so "here" cannot
      // drop one element on top of another.
      //
      // Refused rather than guessed when the pointer has never been over the
      // canvas: placing at (0,0) because the mouse was never seen would look
      // like a bug, and saying so costs one sentence.
      if (op.at === "pointer") {
        if (!pointerWorld.current) {
          results.push("I don't know where “here” is — move the mouse over the canvas first");
          anyFail = true; continue;
        }
        center = findFreeSlot(pointerWorld.current, w, h, others);
        // An explicit position means the user is not asking for a flow, so
        // the anchor is dropped and no connector is drawn.
        anchor = null;
      } else if (anchor && anchor.boundaryHostId) {
        // R7: a step after a boundary event goes where the flow leaves it —
        // the side is R7.02's, the same call the reducer makes when it draws
        // the flow, so no side is passed to addConnector below — and stays in
        // the host's own lane (R7.07).
        followOn = planBoundaryFollowOn(anchor, els, w, h, others);
        center = followOn.center;
      } else if (anchor) {
        const isGw = anchor.type === "gateway";
        const bi = isGw ? data.connectors.filter((cn) => cn.sourceId === anchor!.id).length : 0;
        // Gateway branches are intentionally stacked ½ Task height (32px) apart,
        // so use a matching clearance — the default 51px would treat siblings
        // as collisions and blow the fan-out apart.
        center = findFreeSlot(isGw ? placeGatewayBranch(anchor, bi, w, h) : placeInline(anchor, w, h), w, h, others, isGw ? HALF_TASK_H : HALF_TASK_W);
        if (isGw) {
          // #5: a branch ABOVE the gateway leaves its TOP point, one BELOW its
          // BOTTOM point, one on the same row (overlapping) its RIGHT point.
          srcSide = center.y + h / 2 <= anchor.y ? "top"
            : center.y - h / 2 >= anchor.y + anchor.height ? "bottom"
            : "right";
        }
      } else {
        const rightmost = els.reduce<DiagramElement | null>((m, e) => (!m || e.x + e.width > m.x + m.width ? e : m), null);
        center = findFreeSlot(rightmost ? placeInline(rightmost, w, h) : { x: 240, y: 200 }, w, h, others);
      }
      const newId = nanoid();
      // A newly added task must ALWAYS live inside the white-box pool, even if
      // it isn't connected (Paul). Prefer the anchor's own lane/pool; else the
      // white-box pool's first lane, else the pool itself. The pool then grows
      // to enclose it (ensureContainersEncloseChildren in the reducer).
      // After a boundary event that is the HOST's container, never the host.
      let parentId: string | undefined = followOn ? followOn.parentId : anchor ? followOnParentId(anchor, els) : undefined;
      if (!parentId) {
        const wb = els.find((e) => e.type === "pool" && (((e.properties?.poolType as string | undefined) ?? "white-box") === "white-box"));
        if (wb) {
          const firstLane = els.filter((e) => e.type === "lane" && e.parentId === wb.id).sort((a, b) => a.y - b.y)[0];
          parentId = firstLane?.id ?? wb.id;
        }
      }
      addElementGated(op.symbolType, center, undefined, op.eventType, newId,
        parentId ? { parentId, ...(followOn?.laneId ? { keepInLane: true } : {}) } : undefined);
      if (op.gatewayType) updateProperties(newId, { gatewayType: op.gatewayType });
      // The reducer capitalises an activity / gateway / event label, so the
      // WORKING COPY has to carry the same string — otherwise the log line
      // and the next command's reference describe a name the diagram does
      // not have.
      const addedLabel = op.label && needsCapital(op.symbolType) ? capitaliseFirstWord(op.label) : op.label;
      if (addedLabel) updateLabel(newId, addedLabel);
      const addedEl = syntheticElement(newId, op.symbolType, center, w, h, { label: addedLabel, parentId, eventType: op.eventType });
      // One line per add. A refused auto-connect says so and nothing else:
      // it used to be followed by "added X after Y" as well, so the log
      // contradicted itself ("left it unconnected …; added Fix it after
      // Event 4").
      let leftUnconnected = false;
      const implicitJoin = !op.afterRef && !!ctx.autoConnect && op.at !== "pointer";
      if (anchor && (op.afterRef || implicitJoin)) {
        // R7 — the explicit `connect` op has always been checked against
        // `canConnect`; this auto-connect never was. So "add a task after
        // Done" drew a sequence flow OUT of an end event and reported it with
        // a green tick. Check the same gauntlet the reducer and the ghost
        // suggestions use, against the state that WILL exist — the new
        // element is not in `els` yet.
        if (!canConnect(anchor, addedEl, "sequence", withAdded(els, addedEl))) {
          // An "after X" that cannot be joined says so; an automatic join just does not happen.
          if (op.afterRef) {
            results.push(`added ${nameOf(addedEl)} but left it unconnected — a sequence flow from ${nameOf(anchor)} isn’t legal`);
            leftUnconnected = true;
          }
        } else if (srcSide) {
          addConnector(anchor.id, newId, "sequence", "directed", "rectilinear", srcSide, "left");
        } else {
          addConnector(anchor.id, newId, "sequence");
        }
      }
      // Auto-extend: if the new element overflows its pool's right edge, widen
      // ALL pools to the same width so they stay aligned (Paul).
      const addRight = center.x + w / 2;
      if (parentId && els.some((e) => e.type === "pool" && e.x + e.width < addRight + 40)) extendPools();
      voiceLastId.current = newId;
      els = withAdded(els, addedEl);
      setSelectedElementIds(new Set([newId]));
      if (!leftUnconnected) {
        const outs = op.afterRef && anchor && FLOWS_THROUGH.has(op.symbolType) ? data.connectors.filter((c) => c.type === "sequence" && c.sourceId === anchor!.id).length : 0;
        results.push(`added ${op.label ?? op.symbolType}${anchor && (op.afterRef || (implicitJoin && canConnect(anchor, addedEl, "sequence", els))) ? ` after ${nameOf(anchor)}` : ""}${outs > 1 ? ` — ${nameOf(anchor!)} has ${outs} outgoing flows, so it is on a new one: say “insert a task between ${nameOf(anchor!)} and …” to put it into one` : ""}`);
      }
      continue;
    }

    // "insert a task called C between A and B" (Paul, 2026-09-27). Spliced into
    // the flow A → B when there is one: that connector keeps its label and now
    // ends at C, and C → B is drawn. With no flow between them, A → C → B.
    // Where C goes, and whether A's pool must make room first, is
    // insertBetween.ts; the room is the mouse's Insert Space, scoped to the pool.
    if (op.op === "insertBetween") {
      // A name may have "and" in it ("between Review and Approve and Pay"):
      // the grammar's split first, then every other, the first where both ends
      // name one element each.
      const words = `${op.afterRef} and ${op.beforeRef}`.split(/\s+and\s+/i);
      const splits: [string, string][] = [[op.afterRef, op.beforeRef]];
      for (let k = 1; k < words.length; k++) splits.push([words.slice(0, k).join(" and "), words.slice(k).join(" and ")]);
      const one = (ref: string) => {
        const r = resolveRef(ref, els, voiceLastId.current, selectedIds, { strict: true, pointer: pointerWorld.current });
        return r && "id" in r ? els.find((e) => e.id === r.id) : undefined;
      };
      const found = splits.map(([x, y]) => [one(x), one(y)] as const).find(([x, y]) => x && y);
      if (!found) {
        // Report as the grammar split it — an ambiguity there raises the picker (askWhich).
        const x = resolve1(op.afterRef, { strict: true });
        if ("err" in x) { results.push(x.err); anyFail = true; continue; }
        const y = resolve1(op.beforeRef, { strict: true });
        results.push("err" in y ? y.err : `couldn't tell which two steps “${op.afterRef} and ${op.beforeRef}” means`);
        anyFail = true; continue;
      }
      const a = found[0]!, b0 = found[1]!;
      if (a.id === b0.id) { results.push(`“${nameOf(a)}” twice — say the two steps it goes between`); anyFail = true; continue; }
      const { w, h } = sizeOf(op.symbolType);
      const flow = data.connectors.find((c) => c.type === "sequence" && c.sourceId === a.id && c.targetId === b0.id);
      const plan = planInsertBetween(els, a, b0, flow?.sourceSide, w, h);
      // Legal before anything moves: a refusal changes nothing.
      const newId = nanoid();
      const addedLabel = op.label && needsCapital(op.symbolType) ? capitaliseFirstWord(op.label) : op.label;
      const probe = syntheticElement(newId, op.symbolType, plan.center, w, h, { label: addedLabel, eventType: op.eventType });
      if (!flow && !canConnect(a, probe, "sequence", withAdded(els, probe))) {
        results.push(`can't insert after ${nameOf(a)} — a sequence flow from it isn’t legal`); anyFail = true; continue;
      }
      if (!canConnect(probe, b0, "sequence", withAdded(els, probe))) {
        results.push(`can't insert a ${op.symbolType.replace(/-/g, " ")} before ${nameOf(b0)} — a sequence flow from it to ${nameOf(b0)} isn’t legal`);
        anyFail = true; continue;
      }
      let moved = "";
      if (plan.shift) {
        const { markerX, dx, scopeId } = plan.shift;
        const next = preview({ type: "INSERT_SPACE", payload: { markerX, markerY: 0, dx, dy: 0, ...(scopeId ? { scopeId } : {}) } });
        insertSpace(markerX, 0, dx, 0, scopeId);
        if (next) els = next.elements;
        const pool = scopeId ? els.find((e) => e.id === scopeId) : undefined;
        moved = ` — moved ${pool ? `everything after ${nameOf(a)} in ${nameOf(pool)}` : `everything after ${nameOf(a)}`} ${dx}px right to make room`;
      }
      const b = els.find((e) => e.id === b0.id) ?? b0;
      const parentId = bandAt(plan.center, els)?.id ?? followOnParentId(a, els);
      addElementGated(op.symbolType, plan.center, undefined, op.eventType, newId, parentId ? { parentId } : undefined);
      if (op.gatewayType) updateProperties(newId, { gatewayType: op.gatewayType });
      if (addedLabel) updateLabel(newId, addedLabel);
      const addedEl = syntheticElement(newId, op.symbolType, plan.center, w, h, { label: addedLabel, parentId, eventType: op.eventType });
      els = withAdded(els, addedEl);
      if (flow) updateConnectorEndpoint(flow.id, "target", newId, plan.inSide, 0.5);
      else addConnector(a.id, newId, "sequence", "directed", "rectilinear", undefined, plan.inSide);
      addConnector(newId, b.id, "sequence", "directed", "rectilinear", plan.outSide, flow?.targetSide);
      if (parentId && els.some((e) => e.type === "pool" && e.x + e.width < plan.center.x + w / 2 + 40)) extendPools();
      voiceLastId.current = newId;
      setSelectedElementIds(new Set([newId]));
      setSelectedConnectorId(null);   // the connector it went into is no longer what is selected
      results.push(`inserted ${addedLabel ?? op.symbolType.replace(/-/g, " ")} between ${nameOf(a)} and ${nameOf(b)}${flow ? "" : " — they weren’t connected, so it now joins them"}${moved}`);
      continue;
    }

    if (op.op === "connect") {
      const f = resolve1(op.fromRef), t = resolve1(op.toRef);
      if ("err" in f) { results.push(f.err); anyFail = true; continue; }
      if ("err" in t) { results.push(t.err); anyFail = true; continue; }
      if (!canConnect(f, t, op.connectorType ?? "sequence", els, { connectors: data.connectors })) { results.push(`can’t connect ${nameOf(f)} → ${nameOf(t)}`); anyFail = true; continue; }
      addConnector(f.id, t.id, op.connectorType ?? "sequence");
      results.push(`connected ${nameOf(f)} → ${nameOf(t)}`);
      continue;
    }

    if (op.op === "disconnect") {
      const f = resolve1(op.fromRef), t = resolve1(op.toRef);
      if ("err" in f) { results.push(f.err); anyFail = true; continue; }
      if ("err" in t) { results.push(t.err); anyFail = true; continue; }
      const conn = data.connectors.find((c) => (c.sourceId === f.id && c.targetId === t.id) || (c.sourceId === t.id && c.targetId === f.id));
      if (!conn) { results.push(`no connection between ${nameOf(f)} and ${nameOf(t)}`); anyFail = true; continue; }
      deleteConnector(conn.id);
      results.push(`disconnected ${nameOf(f)} ↮ ${nameOf(t)}`);
      continue;
    }

    if (op.op === "delete") {
      // "delete these" / "delete the selected tasks": every selected element
      // of that kind, in one command (and one undo — the caller groups it).
      const selIds = resolveSelectionRefs(op.ref, els, selectedIds);
      if (selIds && selIds.length > 1) {
        const targets = selIds.map((id) => els.find((x) => x.id === id)).filter((x): x is DiagramElement => !!x);
        for (const t of targets) {
          deleteElement(t.id);
          els = withDeleted(els, t.id);
          if (voiceLastId.current === t.id) voiceLastId.current = null;
        }
        results.push(`deleted ${targets.length} selected elements`);
        continue;
      }
      // R3: a delete never guesses between candidates. "delete the lane"
      // already asked which — containers had their own guard below — while
      // "delete the task" silently took the newest and reported success.
      const e = resolve1(op.ref, { strict: true });
      // A connector named by its label beats an element matched loosely — the
      // rename's rule (connectorRef.ts). Without it, "delete connector
      // Rejection Notification" deleted the END EVENT "Send Rejection
      // Notification" on Paul's test diagram (2026-09-27), and a label typed
      // on two lines was never found.
      // Several connectors named that — Paul's three “Yes” flows — is a
      // question, never the first in the file.
      const conns = connectorsOverElement(data.connectors, op.ref, "err" in e ? null : e);
      if (conns.length > 1) {
        const flow = buildConnectorPickFlow(ops.slice(opAt), op.ref, conns);
        if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
      }
      if (conns.length === 1) {
        const conn = conns[0];
        deleteConnector(conn.id);
        results.push(`deleted ${conn.type === "messageBPMN" ? "message" : "connector"} “${spokenName(conn.label)}”`);
        continue;
      }
      if ("err" in e && e.ambiguous) {
        // R2: number the candidates and wait for a number, rather than
        // making the user rephrase a command that was already unambiguous
        // to THEM — they can see which one they meant.
        const flow = buildPickFlow(ops.slice(opAt), op.ref, e.ambiguous, els);
        if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
      }
      if ("err" in e) { results.push(e.err); anyFail = true; continue; }
      // #7 — never delete a container we can't confidently identify. If the
      // spoken name doesn't actually appear in the resolved container's label
      // and there's more than one of its kind, ask rather than guess.
      if (e.type === "pool" || isAnyLane(e)) {
        // B6 — a sub-lane is `type: "lane"` with a lane parent on every
        // interactive path, and `type: "sublane"` only when the AI or an
        // importer stamped it. Testing the type alone missed the common
        // shape: "delete the sublane Staff" left the word "sublane" in the
        // name (so it matched no label) and counted top-level lanes as
        // siblings, so it answered "which lane? there are 4".
        const kind = e.type === "pool" ? "pool" : laneKindWord(e, els);
        const kindWord = kind === "sub-lane" ? "sub-?lanes?" : `${kind}s?`;
        const named = op.ref.replace(new RegExp(`\\b(?:the|a|an|named|called|${kindWord})\\b`, "gi"), "").trim();
        const siblings = sameKindAs(e, els);
        // A reference that is not a SPOKEN NAME has nothing to check against.
        // An `#id:` (the picker's answer, or a pinned confirmation), the
        // selection, the pointer — each identifies the element exactly, and
        // the check turned all three into "which lane? there are 3 — I
        // couldn't match '#id:il8erk8a'" (Paul's log, 2026-09-23), which also
        // put an internal id in front of the user.
        const exactRef = op.ref.startsWith(ID_REF_PREFIX) || isSelectionRef(op.ref) || isPointerElementRef(op.ref);
        // "one" and "1" are the same word said two ways — the resolver knows
        // that and this check did not, so "delete sublane one" was refused
        // against a lane called "Sublane 1".
        const saidLike = spokenNumbersAsDigits(named).toLowerCase();
        const labelLike = spokenNumbersAsDigits((e.label ?? "")).toLowerCase();
        if (!exactRef && siblings.length > 1 && (!named || !labelLike.includes(saidLike))) {
          results.push(`which ${kind}? there are ${siblings.length}${named ? ` — I couldn't match “${named}”` : ""}; say its exact name`);
          anyFail = true; continue;
        }
      }
      // An expanded subprocess with contents is dissolved, not emptied.
      if (e.type === "subprocess-expanded" && els.some((k) => k.parentId === e.id)) { if (!unwrapEp(e)) anyFail = true; continue; }
      const foot = { x: e.x, y: e.y, width: e.width, height: e.height };
      deleteElement(e.id);
      els = withDeleted(els, e.id);
      if (voiceLastId.current === e.id) voiceLastId.current = null;
      if (!op.compact) { results.push(`deleted ${nameOf(e)}`); continue; }
      // Compact: close the horizontal gap the element left. The mouse's
      // remove-space tool deletes whatever sits wholly in the column, in EVERY
      // lane — right for a zone the user drew, wrong here: "delete Pay Claim
      // and compact" also deleted the gateway above it (the 2026-09-28 sweep).
      // So it is tried first, and only kept when it removes nothing else and
      // puts nothing on top of anything.
      const zone = { x: foot.x, y: foot.y, width: foot.width, height: 0 };
      const trial = preview({ type: "REMOVE_SPACE", payload: { zone } });
      if (!trial) { results.push(`deleted ${nameOf(e)} — there was no gap to close`); continue; }
      const lost = els.filter((x) => !trial.elements.some((y) => y.id === x.id));
      const pairKey = (v: { ids: string[] }) => [...v.ids].sort().join("|");
      const was = new Set(checkElementOverlap({ elements: els, connectors: data.connectors }).map(pairKey));
      const landed = checkElementOverlap({ elements: trial.elements, connectors: trial.connectors }).filter((v) => !was.has(pairKey(v)));
      if (lost.length || landed.length) {
        const nm = (id: string) => `“${nameOf(els.find((x) => x.id === id) ?? trial.elements.find((x) => x.id === id)!)}”`;
        results.push(`deleted ${nameOf(e)} — the gap stays: closing it would ${lost.length
          ? `also delete ${lost.slice(0, 3).map((x) => `“${nameOf(x)}”`).join(", ")}${lost.length > 3 ? `, and ${lost.length - 3} more` : ""}`
          : `put ${nm(landed[0].ids[0])} on ${nm(landed[0].ids[1])}`}`);
        continue;
      }
      removeSpace(zone);
      els = trial.elements;
      results.push(`deleted ${nameOf(e)} and compacted`);
      continue;
    }

    if (op.op === "move") {
      // A selection moves as a group, 100 px per step (Paul, 2026-09-15):
      // "move these right", "move the selected task up two".
      const selIds = resolveSelectionRefs(op.ref, els, selectedIds);
      if (selIds && selIds.length > 0) {
        const step = 100 * (op.count ?? 1);
        const gdx = op.direction === "right" ? step : op.direction === "left" ? -step : 0;
        const gdy = op.direction === "down" ? step : op.direction === "up" ? -step : 0;
        moveElements(selIds, gdx, gdy);
        elementsMoveEnd();
        setSelectedElementIds(new Set()); // selection protocol
        const what = selIds.length === 1 ? nameOf(els.find((x) => x.id === selIds[0])!) : `${selIds.length} selected elements`;
        results.push(`moved ${what} ${op.direction} ${step}px`);
        continue;
      }
      const e = resolve1(op.ref);
      if ("err" in e) { results.push(e.err); anyFail = true; continue; }
      const horiz = op.direction === "left" || op.direction === "right";
      // …nor up or down (the 2026-09-28 sweep: "move Finance up" slid the lane
      // over Office and out of its stack, content out of the pool). Up or down,
      // a lane moves AS a lane — the same move as "move the Finance lane up".
      if (!horiz && isAnyLane(e)) {
        if (!moveLaneInStack(e, op.direction as "up" | "down", 32 * (op.count ?? 1))) anyFail = true;
        continue;
      }
      // A pool or lane is not a shape to slide sideways — its "span" is its
      // whole width, so a lane went ~1,260px and every pool widened with it
      // (the 50-command set, 2026-09-27). What was meant is its contents.
      if (horiz && (e.type === "pool" || isAnyLane(e))) {
        results.push(`${nameOf(e)} is a ${e.type === "pool" ? "pool" : laneKindWord(e, els)} — to move what is in it, say “move everything in ${nameOf(e)} one step to the ${op.direction}”`);
        anyFail = true; continue;
      }
      // "N elements over" → move past the N nearest elements in that direction
      // (same band), else fall back to N element-spans.
      const band = els.filter((x) => x.id !== e.id && x.type !== "pool" && x.type !== "lane" && x.type !== "sublane" && (
        horiz ? (Math.abs((x.y + x.height / 2) - (e.y + e.height / 2)) < e.height && (op.direction === "right" ? x.x > e.x : x.x < e.x))
              : (Math.abs((x.x + x.width / 2) - (e.x + e.width / 2)) < e.width && (op.direction === "down" ? x.y > e.y : x.y < e.y))
      )).sort((a, b) => horiz ? (op.direction === "right" ? a.x - b.x : b.x - a.x) : (op.direction === "down" ? a.y - b.y : b.y - a.y));
      const tgt = band[Math.min(op.count ?? 1, band.length) - 1];
      const SPAN = (horiz ? e.width : e.height) + HALF_TASK_W;
      let dx = 0, dy = 0;
      if (op.direction === "right") dx = tgt ? (tgt.x + tgt.width + HALF_TASK_W) - e.x : (op.count ?? 1) * SPAN;
      else if (op.direction === "left") dx = tgt ? (tgt.x - HALF_TASK_W - e.width) - e.x : -(op.count ?? 1) * SPAN;
      else if (op.direction === "down") dy = tgt ? (tgt.y + tgt.height + HALF_TASK_W) - e.y : (op.count ?? 1) * SPAN;
      else dy = tgt ? (tgt.y - HALF_TASK_W - e.height) - e.y : -(op.count ?? 1) * SPAN;
      moveElements([e.id], dx, dy);
      elementsMoveEnd(); // commit: one undo entry, connectors re-routed (was missing — a voice move left no history)
      setSelectedElementIds(new Set()); // selection protocol: a voice move leaves nothing selected
      results.push(`moved ${nameOf(e)} ${op.direction}`);
      continue;
    }

    if (op.op === "wrapInSubprocess") {
      // Surround the SELECTION with an expanded subprocess (Paul, 2026-09-16).
      // The plan is computed here first so the guard message ("needs one
      // flow in and one out", "X sits in that area") comes from the same
      // code the reducer applies; the ids are minted here so the working
      // set and the reducer agree on them.
      const label = op.label?.trim() || "Subprocess";
      const ids = { epId: nanoid(), startId: nanoid(), endId: nanoid(), startConnId: nanoid(), endConnId: nanoid() };
      const plan = planWrapInSubprocess({ elements: els, connectors: data.connectors }, selectedIds, label, ids);
      if ("error" in plan) { results.push(plan.error); anyFail = true; continue; }
      wrapInSubprocess([...selectedIds], label, ids);
      // The room came out of the lane's right-hand side: widen the pools to fit (they stay one width).
      if (els.some((e) => e.type === "pool" && e.x + e.width < plan.contentRight + 40)) extendPools();
      els = plan.elements;
      voiceLastId.current = ids.epId;
      setSelectedElementIds(new Set()); // selection protocol: nothing stays selected
      results.push(plan.summary);
      continue;
    }
    if (op.op === "wrapInContainer") {
      // Same shape as wrapInSubprocess: plan here so the guard message comes
      // from the code the reducer will run, then dispatch, then widen the
      // pools if the new container pushed past their right edge.
      const label = op.label?.trim() || (op.container === "lane" ? "Lane" : "Pool");
      const ids = { containerId: nanoid() };
      const plan = planWrapInContainer({ elements: els, connectors: data.connectors }, selectedIds, op.container, label, ids);
      if ("error" in plan) { results.push(plan.error); anyFail = true; continue; }
      wrapInContainer([...selectedIds], op.container, label, ids);
      if (els.some((e) => e.type === "pool" && e.x + e.width < plan.contentRight + 40)) extendPools();
      els = plan.elements;
      voiceLastId.current = ids.containerId;
      setSelectedElementIds(new Set()); // selection protocol
      results.push(plan.summary);
      continue;
    }
    if (op.op === "unwrapSubprocess") {
      const eps = selectedIds.map((id) => els.find((x) => x.id === id)).filter((x): x is DiagramElement => !!x && x.type === "subprocess-expanded");
      if (eps.length !== 1) { results.push(eps.length ? "select just the one expanded subprocess" : "select the expanded subprocess first"); anyFail = true; continue; }
      if (!unwrapEp(eps[0])) anyFail = true;
      continue;
    }
    // Reorder the pool stack (Paul, 2026-09-18). Planned first so a refusal
    // says why, then applied by the reducer as one undoable step. The stack is
    // laid out again from the top, so a pool dropped between two others pushes
    // the rest down by its own height — no separate "make room" step.
    if (op.op === "movePoolTo") {
      const m = resolveField(op, "ref"), a = resolveField(op, "relativeTo");
      // The names can be bare now ("move Pool 3 above Customer"), so a name
      // that is not a pool is said to be what it IS, not "couldn't find".
      if ("err" in m) { results.push(notAPool(op.ref) ?? m.err); anyFail = true; continue; }
      if ("err" in a) { results.push(notAPool(op.relativeTo) ?? a.err); anyFail = true; continue; }
      const plan = planMovePool(els, data.connectors, m.id, op.position, a.id, isContainerType, getAllDescendantIds);
      if ("error" in plan) { results.push(plan.error); anyFail = true; continue; }
      movePoolTo(m.id, op.position, a.id);
      els = plan.elements;
      voiceLastId.current = m.id;
      setSelectedElementIds(new Set()); // selection protocol
      results.push(`moved ${nameOf(m)} ${op.position} ${nameOf(a)}`);
      continue;
    }

    if (op.op === "swapPools") {
      let a: DiagramElement | undefined, b: DiagramElement | undefined;
      if (op.a && op.b) {
        const ra = resolveField(op, "a"), rb = resolveField(op, "b");
        if ("err" in ra) { results.push(ra.err); anyFail = true; continue; }
        if ("err" in rb) { results.push(rb.err); anyFail = true; continue; }
        a = ra; b = rb;
      } else {
        const pair = selectedPools(els, selectedIds);
        if (!pair) {
          const pools = poolsInOrder(els);
          results.push(pools.length === 2
            ? `say "swap ${nameOf(pools[0])} with ${nameOf(pools[1])}"`
            : "select exactly two pools, or name them both");
          anyFail = true;
          continue;
        }
        [a, b] = pair;
      }
      if (!swapTwoPools(a, b)) anyFail = true;
      continue;
    }

    if (op.op === "wrapInPool") {
      // Say what will actually happen, from the SAME plan the reducer applies
      // (wrapInPoolPlan.ts) — Paul's four cases, 2026-09-25. Before, this
      // guessed on its own and, with only black-box pools on the diagram,
      // reported "grew Customer" while the reducer drew a new pool.
      const plan = planWrapInPool(els);
      if ("error" in plan) { results.push(plan.error); anyFail = true; continue; }
      wrapInPool(op.label);
      const n = plan.loose.length;
      const things = `${n} element${n === 1 ? "" : "s"}`;
      if (plan.kind === "grow") {
        const grown = els.find((e) => e.id === plan.poolId)!;
        // The grown pool keeps its own name (Paul, 2026-09-25: "grow, ignore
        // the name") — but a name the user SAID must not vanish silently.
        const unused = op.label && !sameName(op.label, grown.label) ? ` — “${op.label}” was not used; the pool keeps its name` : "";
        results.push(`grew ${nameOf(grown)} to take in ${n} loose element${n === 1 ? "" : "s"}${unused}`);
      } else {
        const called = op.label ? ` “${op.label}”` : "";
        results.push(`put ${things} in a new pool${called}${plan.widthFrom ? `, as wide as ${plan.widthFrom}` : ""}`);
      }
      continue;
    }

    if (op.op === "addPool") {
      // "above|below <named pool>" — resolve the anchor pool so we position by it.
      let relativeToId: string | undefined;
      if (op.relativeTo) {
        const r = resolveField(op, "relativeTo");
        if (!("err" in r) && r.type === "pool") relativeToId = r.id;
        else if (!("err" in r)) { results.push(`${op.relativeTo} isn’t a pool`); anyFail = true; continue; }
        else { results.push(r.err); anyFail = true; continue; }
      }
      addPool({ label: op.label, poolType: op.poolType, position: op.position, relativeToId });
      const where = relativeToId ? `${op.position ?? "above"} ${op.relativeTo}` : op.position ? `${op.position} existing pools` : "";
      results.push(`added a ${op.poolType === "black-box" ? "black-box " : ""}pool${op.label ? ` “${op.label}”` : ""}${where ? ` ${where}` : ""}`);
      continue;
    }

    if (op.op === "addLaneAt") {
      const ref = resolve1(op.refLane);
      if ("err" in ref) { results.push(ref.err); anyFail = true; continue; }
      if (ref.type !== "lane") { results.push(`${nameOf(ref)} isn't a lane`); anyFail = true; continue; }
      const poolId = ref.parentId ?? (() => { if (!op.poolRef) return null; const p = resolve1(op.poolRef); return "err" in p ? null : p.id; })();
      if (!poolId) { results.push(`couldn't find the pool for ${nameOf(ref)}`); anyFail = true; continue; }
      // The reducer carves the new lane out of its neighbour and never grows the
      // pool, so with no room it adds NOTHING — and this said "added a lane"
      // anyway (found by L4, 2026-09-25). Ask the reducer rather than
      // re-deriving its room rule here.
      const carved = preview({ type: "ADD_LANE_AT", payload: { poolId, position: op.position, refLaneId: ref.id, label: op.label } });
      // Where the carve would REALLY put it. When the named lane has no room
      // at that edge, the shared carve borrows from another lane — right for a
      // mouse drop, which shows where the lane will go before you let go, and
      // wrong for a sentence that named the place: "above Underwriters" landed
      // at the bottom of the pool (L4, 2026-09-25). Paul, same day: refuse,
      // by voice only; the mouse drop keeps its fallback.
      const newLane = carved?.elements.find((e) => e.type === "lane" && e.parentId === poolId && !els.some((o) => o.id === e.id));
      const refNow = carved?.elements.find((e) => e.id === ref.id);
      const besideIt = !!newLane && !!refNow && (op.position === "above"
        ? Math.abs(newLane.y + newLane.height - refNow.y) <= 1
        : Math.abs(newLane.y - (refNow.y + refNow.height)) <= 1);
      if (!besideIt) {
        // The new lane must be tall enough for its NAME, which runs up its
        // header — "QA" fits where "Quality Assurance" does not — so say so.
        results.push(`no room ${op.position} ${nameOf(ref)} for a lane${op.label ? ` called “${op.label}”` : ""} — it is carved out of ${nameOf(ref)} and the pool does not grow; make ${nameOf(ref)} taller${op.label ? " or use a shorter name" : ""}`);
        anyFail = true; continue;
      }
      addLaneAt(poolId, op.position, ref.id, op.label);
      results.push(`added a lane ${op.position} ${nameOf(ref)}`);
      continue;
    }

    if (op.op === "swapLanes") {
      const a = resolveField(op, "laneA"), b = resolveField(op, "laneB");
      if ("err" in a) { results.push(a.err); anyFail = true; continue; }
      if ("err" in b) { results.push(b.err); anyFail = true; continue; }
      // "swap Customer with Salesforce" names two POOLS without saying so —
      // the same stack swap as "swap the Customer pool with …" (2026-09-27).
      if (a.type === "pool" && b.type === "pool") { if (!swapTwoPools(a, b)) anyFail = true; continue; }
      if (a.type !== "lane" || b.type !== "lane" || a.parentId !== b.parentId) { results.push("both must be lanes in the same pool, or both pools"); anyFail = true; continue; }
      const sibs = els.filter((e) => e.type === "lane" && e.parentId === a.parentId).sort((x, y) => x.y - y.y);
      const ia = sibs.findIndex((e) => e.id === a.id), ib = sibs.findIndex((e) => e.id === b.id);
      if (Math.abs(ia - ib) !== 1) { results.push("lanes must be next to each other to swap"); anyFail = true; continue; }
      swapLane(sibs[Math.min(ia, ib)].id, "down");
      results.push(`swapped ${nameOf(a)} ↔ ${nameOf(b)}`);
      continue;
    }

    if (op.op === "compressPool") {
      // Strict: "compress the pool" with several pools asks which (unless one
      // is selected), never takes the newest — compressing the wrong pool is a
      // large quiet edit.
      const p = selectedOfBareKind(op.poolRef) ?? resolveField(op, "poolRef", { strict: true });
      if ("err" in p && p.ambiguous) {
        const flow = buildPickFlow(ops.slice(opAt), op.poolRef, p.ambiguous, els);
        if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
      }
      if ("err" in p) { results.push(p.err); anyFail = true; continue; }
      // No kind word was said ("compress Underwriters"), so the name decides:
      // a lane is compressed as a lane. This used to dead-end at "isn't a
      // pool", and the AI never saw the sentence.
      if (isAnyLane(p)) { compressTheLane(p); continue; }
      if (p.type !== "pool") { results.push(`${nameOf(p)} isn't a pool`); anyFail = true; continue; }
      compressPool(p.id);
      results.push(`compressed ${nameOf(p)}`);
      continue;
    }

    // "compress the Underwriters lane", "expand lane Claims Team by 100" (Paul,
    // 2026-09-26). The lane word binds (refKinds.ts): only a lane can answer,
    // and a pool of the same name is never touched. Strict, as compress pool
    // is: a bare "compress lane" asks which, numbered, unless one is selected.
    if (op.op === "compressLane" || op.op === "expandLane") {
      const lane = selectedOfBareKind(op.laneRef) ?? resolveField(op, "laneRef", { strict: true });
      if ("err" in lane && lane.ambiguous) {
        const flow = buildPickFlow(ops.slice(opAt), op.laneRef, lane.ambiguous, els);
        if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
      }
      if ("err" in lane) { results.push(lane.err); anyFail = true; continue; }
      if (!isAnyLane(lane)) { results.push(`${nameOf(lane)} isn't a lane`); anyFail = true; continue; }
      if (op.op === "compressLane") { compressTheLane(lane); continue; }
      // One Task row unless a number was said — the default lives here and
      // in laneFit.ts's constant, nowhere else.
      const by = op.distance ?? LANE_EXPAND_STEP;
      expandLane(lane.id, by);
      results.push(`made ${nameOf(lane)} ${by}px taller`);
      continue;
    }

    if (op.op === "extendPools") {
      if (!els.some((e) => e.type === "pool")) { results.push("there are no pools to extend"); anyFail = true; continue; }
      extendPools();
      results.push("extended all pools to the same width");
      continue;
    }

    if (op.op === "again") { continue; } // handled by substitution above; ignore if stray

    if (op.op === "movePoolBoundary") {
      // ONE EDGE of the pool. Deliberately routed through the SAME
      // RESIZE_ELEMENT the mouse uses rather than writing geometry here, so
      // a spoken boundary move obeys every rule a dragged one does: it
      // stops at the first content any locked pool meets (T4627/T4633), the
      // lanes and sublanes follow, the pool stays its lane stack (T4628),
      // and nothing inside moves. One rule, one place — the reducer's.
      const dist = op.distance ?? BOUNDARY_STEP_PX;
      // Remembered for the follow-up — refused (0) or moved — but never for
      // "move dividers", which keeps its own memory (dividerFlow.ts).
      const remember = (id: string, moved: number) => {
        const ref = ctx.refs.boundaryLast;
        if (!ref || op.overContent) return;
        ref.current = nextBoundaryMemory(ref.current, { targetId: id, boundary: op.boundary, direction: op.direction, moved: Math.round(Math.abs(moved)) });
      };
      let target: DiagramElement | undefined;
      if (op.ref) {
        const r = resolveField(op, "ref");
        if ("err" in r) { results.push(r.err); anyFail = true; continue; }
        target = r;
      } else {
        // The mouse says which (Paul's boundary session, 2026-09-27: a lane
        // selected, "top boundary up one hundred" asked "which pool?").
        const selBands = selectedIds.map((id) => els.find((e) => e.id === id)).filter((e): e is DiagramElement => !!e && (e.type === "pool" || isAnyLane(e)));
        if (selBands.length === 1) target = selBands[0];
        else {
          const t = thePoolFor(op);
          if (t === "parked") break;
          if (!t) continue;
          target = t;
        }
      }
      // A LANE'S top or bottom boundary is a divider (Paul, 2026-09-27: "Move
      // <lane_name> {top, bottom} boundary/divider {up, down}") — the line the
      // mouse drags, found by laneBoundary.ts. At the end of the stack it is
      // the pool's own edge, which falls through to the pool move below.
      if (target && isAnyLane(target)) {
        if (op.boundary === "left" || op.boundary === "right") {
          results.push(`${nameOf(target)}'s ${op.boundary} edge is its pool's — say “move <pool> ${op.boundary} boundary ${op.direction}”`);
          anyFail = true; continue;
        }
        const edge = laneEdgePlan(els, target, op.boundary);
        if ("error" in edge) { results.push(edge.error); anyFail = true; continue; }
        if ("divider" in edge) {
          const { aboveId, belowId } = edge.divider;
          const dy = op.direction === "up" ? -dist : dist;
          const above = els.find((e) => e.id === aboveId)!, below = els.find((e) => e.id === belowId)!;
          const moveAction = { type: "MOVE_LANE_BOUNDARY" as const, payload: { aboveLaneId: aboveId, belowLaneId: belowId, dy } };
          let next = preview(moveAction);
          let moved = next ? (next.elements.find((e) => e.id === aboveId)!.height - above.height) : 0;
          const giver = dy < 0 ? above : below;
          // "move dividers" (Paul, 2026-09-28): the names are the floor — but a
          // name may WRAP onto two lines to let its band go narrower. Tried one
          // band at a time (the band giving way, then its edge sub-lanes), and
          // kept only where it lets the divider go further.
          const wrapped: DiagramElement[] = [];
          if (op.overContent && Math.abs(moved) < dist - 0.5) {
            for (const band of givingBands(els, giver, dy < 0 ? "last" : "first")) {
              const two = wrapLabelInTwo(band.label);
              if (!two) continue;
              // The label change as the editor makes it (a two-line name widens
              // the name strips, and everything in the lanes shifts right), then
              // the move — kept only when it goes further AND nothing ends up
              // outside its pool (at larger lane fonts the shift can push an
              // element past the pool's right edge: the 2026-09-28 sweep).
              const now = { ...ctx.settings, elements: els, connectors: data.connectors, viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData;
              const labelled = reducer(now, { type: "UPDATE_LABEL", payload: { id: band.id, label: two } });
              const got = reducer(labelled, moveAction);
              const m2 = got.elements.find((e) => e.id === aboveId)!.height - above.height;
              if (Math.abs(m2) > Math.abs(moved) + 0.5 && !leavesItsPool(els, got.elements)) {
                els = labelled.elements; moved = m2; next = got; wrapped.push(band); updateLabel(band.id, two);
              }
              if (Math.abs(moved) >= dist - 0.5) break;
            }
          }
          // Name the band that really stops it — the band giving way, or the
          // sub-lane at its edge (the sweep: "Underwriters team is as small as
          // its name allows" when it was its sub-lane Tax).
          const edgeOf = dy < 0 ? "last" as const : "first" as const;
          const stopper = (list: DiagramElement[]) => { const b = list.find((x) => x.height <= Math.max(40, laneMetrics(x.label ?? "", ctx.settings.laneFontSize ?? 14).minHeight) + 0.5); return b ?? giver; };
          if (!moved) { results.push(`${nameOf(stopper(givingBands(els, giver, edgeOf)))} is as small as its name allows — the divider can't move ${op.direction}`); anyFail = true; remember(target.id, 0); continue; }
          const crossed = op.overContent ? [] : contentCrossedBy(els, aboveId, belowId, below.y + moved);
          if (crossed.length) {
            // Say how far it CAN go (Paul, 2026-09-27: more flexibility than a
            // bare refusal) — the room before the first thing in the way. The
            // advice is sayable as it stands: "up by 98" is the follow-up
            // (boundaryFollowUp.ts), and so is "sixty pixels".
            const room = Math.floor(dividerRoom(els, aboveId, belowId, op.direction === "up" ? "up" : "down"));
            const names = crossed.slice(0, 3).map((e) => `“${nameOf(e)}”`).join(", ") + (crossed.length > 3 ? `, and ${crossed.length - 3} more` : "");
            const them = crossed.length === 1 ? "it" : "them";
            // Already cut by the line ("move dividers" and the mouse go through
            // elements): it can't go further in — but the other way it can.
            const already = cutByLine(crossed, below.y).length === crossed.length;
            results.push(room > 0
              ? `the divider would run through ${names} — it can move ${op.direction} at most ${room}px: say “${op.direction} by ${room}”`
              : already
                ? `the divider already runs through ${names} — it can't go further ${op.direction}: move ${them} first, or use “move dividers”, which goes through elements`
                : `the divider would run through ${names} — move ${them} first`);
            anyFail = true; remember(target.id, 0); continue;
          }
          moveLaneBoundary(aboveId, belowId, dy);
          laneBoundaryMoveEnd();
          setSelectedElementIds(new Set()); // selection protocol
          if (next) els = next.elements;
          remember(target.id, moved);
          const giverAfter = els.find((x) => x.id === giver.id) ?? giver;
          const short = Math.abs(moved) < dist - 0.5 ? ` — ${nameOf(stopper(givingBands(els, giverAfter, edgeOf)))} is as small as its name allows` : "";
          const wraps = wrapped.length ? ` — ${wrapped.map((b) => `“${nameOf(b)}”`).join(" and ")} now ${wrapped.length === 1 ? "wraps" : "wrap"} onto two lines` : "";
          results.push(`moved ${nameOf(target)}'s ${op.boundary} boundary ${op.direction} ${Math.round(Math.abs(moved))}px${wraps}${short}`);
          continue;
        }
        target = els.find((e) => e.id === edge.poolEdge.poolId);
      }
      if (!target || target.type !== "pool") {
        results.push(op.ref ? `${nameOf(target!)} is not a pool or a lane` : "there's no pool to resize");
        anyFail = true; continue;
      }
      const before = { x: target.x, y: target.y, width: target.width, height: target.height };
      // Growing toward another pool stops short of it (poolEdgeRoom); the
      // reducer stops a shrink at the content. Either way the reply says what
      // REALLY moved — it used to repeat the distance asked for (the
      // 50-command set, 2026-09-27: "moved … 100px" after 7px).
      const outward = (op.boundary === "top" && op.direction === "up") || (op.boundary === "bottom" && op.direction === "down")
        || (op.boundary === "left" && op.direction === "left") || (op.boundary === "right" && op.direction === "right");
      const toward = outward ? poolEdgeRoom(els, target, op.boundary) : { room: Infinity };
      const go = Math.min(dist, toward.room);
      if (go <= 0) {
        results.push(`${nameOf(target)}'s ${op.boundary} boundary can't move ${op.direction} — ${toward.neighbour ? nameOf(toward.neighbour) : "another pool"} is right there`);
        anyFail = true; remember(target.id, 0); continue;
      }
      const want = boundaryRect(before, op.boundary, op.direction, go);
      const wasWhiteBoxAtResizeStart = ((target.properties?.poolType as string | undefined) ?? "black-box") === "white-box";
      const next = preview({ type: "RESIZE_ELEMENT", payload: { id: target.id, x: want.x, y: want.y, width: want.width, height: want.height, wasWhiteBoxAtResizeStart } });
      const after = next?.elements.find((e) => e.id === target!.id);
      const edgeOf = (b: { x: number; y: number; width: number; height: number }) =>
        op.boundary === "left" ? b.x : op.boundary === "right" ? b.x + b.width : op.boundary === "top" ? b.y : b.y + b.height;
      const moved = after ? Math.round(Math.abs(edgeOf(after) - edgeOf(before))) : 0;
      if (!moved) {
        results.push(`${nameOf(target)}'s ${op.boundary} boundary can't move ${op.direction} — something inside is in the way`);
        anyFail = true; remember(target.id, 0); continue;
      }
      remember(target.id, moved);
      resizeElement(target.id, want.x, want.y, want.width, want.height);
      resizeElementEnd(target.id);   // a spoken move is whole; close it, as the mouse does on release
      setSelectedElementIds(new Set()); // selection protocol
      voiceLastId.current = target.id;
      const why = moved >= dist ? "" : go < dist && moved >= go - 1 ? ` — it stops short of ${toward.neighbour ? nameOf(toward.neighbour) : "the next pool"}` : " — it stops at what is inside";
      results.push(`moved ${nameOf(target)}'s ${op.boundary} boundary ${op.direction} ${moved}px${why}`);
      continue;
    }

    if (op.op === "nudgePool") {
      const dist = op.distance ?? 20;
      const dx = op.direction === "left" ? -dist : op.direction === "right" ? dist : 0;
      const dy = op.direction === "up" ? -dist : op.direction === "down" ? dist : 0;
      // A selection nudges as a group ("nudge these left") — the reducer only
      // adds each element's own boundary events and container descendants.
      const selIds = op.ref ? resolveSelectionRefs(op.ref, els, selectedIds) : null;
      if (selIds && selIds.length > 1) {
        moveElements(selIds, dx, dy);
        elementsMoveEnd();
        setSelectedElementIds(new Set()); // selection protocol
        results.push(`nudged ${selIds.length} selected elements ${op.direction} ${dist}px`);
        continue;
      }
      let target: DiagramElement | undefined;
      if (op.ref) {
        const r = resolve1(op.ref);
        if ("err" in r) { results.push(r.err); anyFail = true; continue; }
        target = r;
      } else {
        const t = thePoolFor(op);
        if (t === "parked") break;
        if (!t) continue;
        target = t;
      }
      // A lane is never nudged as a shape (the 2026-09-28 sweep: "nudge Finance
      // up" put it 20px over Office and shrank the pool): up or down it moves
      // as a lane; sideways, what was meant is its contents.
      if (isAnyLane(target)) {
        if (op.direction === "up" || op.direction === "down") { if (!moveLaneInStack(target, op.direction, dist)) anyFail = true; }
        else { results.push(`${nameOf(target)} is a ${laneKindWord(target, els)} — to move what is in it, say “move everything in ${nameOf(target)} one step to the ${op.direction}”`); anyFail = true; }
        continue;
      }
      // MOVE_ELEMENTS auto-includes container descendants, so a white-box pool
      // rides with its lanes/contents; a black-box pool just moves itself.
      moveElements([target.id], dx, dy);
      elementsMoveEnd(); // commit the nudge as its own undo entry
      setSelectedElementIds(new Set()); // selection protocol
      voiceLastId.current = target.id;
      results.push(`nudged ${nameOf(target)} ${op.direction} ${dist}px`);
      continue;
    }

    if (op.op === "moveLane") {
      // B5, the half the grammar cannot decide. "move Pick Line up" is a lane
      // move if there is a lane called "Pick", and an element move if what
      // exists is a task called "Pick Line" — and only the diagram knows
      // which. The grammar guesses lane because the recogniser spells "lane"
      // as "line"; when that guess turns out to be wrong, move the element
      // the user actually named rather than telling them it "isn't a lane".
      const r = resolve1(op.ref);
      if ("err" in r) { results.push(r.err); anyFail = true; continue; }
      if (!isAnyLane(r)) {
        const dy = (op.distance ?? 32) * (op.direction === "down" ? 1 : -1);
        moveElements([r.id], 0, dy);
        elementsMoveEnd();
        voiceLastId.current = r.id;
        setSelectedElementIds(new Set()); // selection protocol
        results.push(`moved ${nameOf(r)} ${op.direction}`);
        continue;
      }
      if (!moveLaneInStack(r, op.direction, op.distance ?? 32)) anyFail = true;
      continue;
    }

    if (op.op === "addMessage") {
      const f = resolve1(op.fromRef), t = resolve1(op.toRef);
      if ("err" in f) { results.push(f.err); anyFail = true; continue; }
      if ("err" in t) { results.push(t.err); anyFail = true; continue; }
      // Ask the message rule first: the reducer refuses an illegal message
      // silently, so without asking this would report "added message" for a
      // message that was never drawn — and give no reason. The rule itself,
      // not canConnect, which says yes to any pair with a review comment in
      // it (the reducer draws a review link for those, never a message).
      const whyNot = messageFlowRefusal(f, t, els, { connectors: data.connectors });
      if (whyNot !== null) {
        results.push(`can’t add a message ${nameOf(f)} → ${nameOf(t)} — ${whyNot}`);
        anyFail = true; continue;
      }
      // #2a — connect the NEAREST facing boundaries (a message runs vertically
      // between an activity and the pool above/below it).
      const fcy = f.y + f.height / 2, tcy = t.y + t.height / 2;
      const fSide: Side = fcy <= tcy ? "bottom" : "top";
      const tSide: Side = fcy <= tcy ? "top" : "bottom";
      // #2c — the connection point sits in the MIDDLE of the activity but at
      // least 20px clear of any other message point on the same boundary. The
      // vertical message shares one x, so we spread on the activity (the non-
      // pool end) and drive it through the source offset.
      const activity = f.type === "pool" ? (t.type === "pool" ? f : t) : f;
      const MIN_GAP = 20;
      const takenX: number[] = [];
      for (const c of data.connectors) {
        if (c.type !== "messageBPMN") continue;
        if (c.sourceId !== activity.id && c.targetId !== activity.id) continue;
        const wx = c.waypoints?.[1]?.x;
        if (typeof wx === "number") takenX.push(wx);
      }
      const midX = activity.x + activity.width / 2;
      const clear = (x: number) => takenX.every((v) => Math.abs(v - x) >= MIN_GAP);
      let sharedX = midX;
      if (!clear(sharedX)) {
        for (let k = 1; k <= 12; k++) {
          const lo = midX - k * MIN_GAP, hi = midX + k * MIN_GAP;
          if (lo >= activity.x + 8 && clear(lo)) { sharedX = lo; break; }
          if (hi <= activity.x + activity.width - 8 && clear(hi)) { sharedX = hi; break; }
        }
      }
      const srcOff = f.width > 0 ? Math.max(0, Math.min(1, (sharedX - f.x) / f.width)) : 0.5;
      addConnector(f.id, t.id, "messageBPMN", "directed", "rectilinear", fSide, tSide, srcOff, 0.5, false, op.label);
      results.push(`added message${op.label ? ` “${op.label}”` : ""} ${nameOf(f)} → ${nameOf(t)}`);
      continue;
    }

    if (op.op === "renameByType") {
      const itemType = op.itemType as RenameType;
      const targets = collectRenameTargets(els, data.connectors, itemType);
      if (targets.length === 0) { results.push(`there are no ${itemType}s to rename`); anyFail = true; continue; }
      setMessageFlow(null);
      setRenameFlow({ phase: "pick", itemType, targets });
      // "Say done to finish" reads as "when you have finished renaming",
      // which is not the sentence someone wants when they are trying to get
      // OUT. Paul said "undo" three times instead (2026-09-21). Name the way
      // out explicitly.
      results.push(`pick a ${itemType} by number, then say the new name — “cancel” to stop, “done” when finished`);
      continue;
    }

    if (op.op === "labelSelected") {
      // The selected CONNECTOR gets the label; with no text, wait for it
      // (a single-item name phase — no pick loop afterwards).
      const cid = selectedConnectorIdRef.current;
      if (!cid || !data.connectors.some((c) => c.id === cid)) { results.push("select a connector first"); anyFail = true; continue; }
      if (op.label) {
        updateConnectorLabel(cid, op.label);
        setSelectedConnectorId(null); // selection protocol
        results.push(`labelled the connector “${op.label}”`);
        continue;
      }
      setMessageFlow(null);
      setRenameFlow({ phase: "name", itemType: "connector", targetId: cid, kind: "connector", single: true });
      results.push("say the label for the selected connector (or “done”)");
      continue;
    }

    // MOVE one connector from one gateway point to another, on every selected
    // gateway (Paul, 2026-09-21). The companion to the swap below, and
    // deliberately its mirror image: a swap exchanges two connectors and
    // needs BOTH points occupied, a move needs the destination FREE.
    //
    // When the user picks the wrong one of the pair, the log says which they
    // meant rather than refusing blankly — they are describing the same
    // rearrangement either way, and having to remember which verb applies is
    // exactly the kind of thing voice is supposed to remove.
    if (op.op === "moveGatewayPoint") {
      const picked = selectedIds.map((id) => els.find((x) => x.id === id)).filter((g): g is DiagramElement => !!g);
      const gws = picked.filter((g) => g.type === "gateway");
      // AN EVENT TOO, inline or on a boundary (Paul, 2026-09-27: "New Voice
      // Assist command for when a gateway OR an event … is selected … Move
      // {left, top, right, bottom} to {left, top, right, bottom}"). Whichever
      // flow sits at the named side moves — in or out, sequence or message —
      // under the one side rule for events (eventSides.ts).
      const evs = picked.filter((e) => /-event$/.test(e.type));
      if (gws.length === 0 && evs.length === 0) { results.push("select a gateway or an event first"); anyFail = true; continue; }
      const moved: string[] = [];
      const missed: string[] = [];
      for (const ev of evs) {
        if (op.from === "middle" || op.to === "middle") { missed.push(`${nameOf(ev)}: say top, bottom, left or right for an event`); continue; }
        const attached = data.connectors.filter((c) => (c.sourceId === ev.id || c.targetId === ev.id) && (c.type === "sequence" || c.type === "messageBPMN"));
        const sideAt = (c: Connector) => (c.sourceId === ev.id ? c.sourceSide : c.targetSide);
        const src: Connector | undefined = attached.find((c) => sideAt(c) === op.from);
        if (!src) { missed.push(`${nameOf(ev)}: no connector at the ${op.from}`); continue; }
        if (attached.some((c) => c.id !== src.id && sideAt(c) === op.to)) { missed.push(`${nameOf(ev)}: the ${op.to} already has one`); continue; }
        const endpoint: "source" | "target" = src.sourceId === ev.id ? "source" : "target";
        const refusal = eventSideRefusal(ev.type, endpoint, op.to);
        if (refusal) { missed.push(`${nameOf(ev)}: ${refusal}`); continue; }
        // ASK THE REDUCER FIRST. It keeps a boundary event's flow on its outer
        // point (R7.02) and moves a flow back whose new route would run through
        // something — right, and until this was asked, reported as "moved".
        const next = preview({ type: "UPDATE_CONNECTOR_ENDPOINT", payload: { connectorId: src.id, endpoint, newElementId: ev.id, newSide: op.to, newOffsetAlong: 0.5 } });
        const kept = next?.connectors.find((c) => c.id === src.id);
        if (!kept || (endpoint === "source" ? kept.sourceSide : kept.targetSide) !== op.to) {
          missed.push(`${nameOf(ev)}: ${ev.boundaryHostId && endpoint === "source"
            ? "a boundary event’s flow leaves from its outer point (R7.02), so it stays"
            : `a flow at the ${op.to} would not route cleanly here, so it stays at the ${op.from}`}`);
          continue;
        }
        updateConnectorEndpoint(src.id, endpoint, ev.id, op.to, 0.5);
        moved.push(nameOf(ev));
      }
      for (const g of gws) {
        const outs = data.connectors.filter((c) => c.sourceId === g.id && c.type === "sequence");
        const ins = data.connectors.filter((c) => c.targetId === g.id && c.type === "sequence");
        // Same reading of the gateway as the swap: an explicit role wins,
        // otherwise the shape of its traffic says which it is.
        const isMerge = (g.properties?.gatewayRole as string | undefined) === "merge" || (ins.length > 1 && outs.length <= 1);
        const endpoint: "source" | "target" = isMerge ? "target" : "source";
        const conns = isMerge ? ins : outs;
        const middle: Side = isMerge ? "left" : "right";
        const sideOf = (p: typeof op.from): Side => (p === "middle" ? middle : p);
        const sideAt = (c: (typeof conns)[number]) => (endpoint === "source" ? c.sourceSide : c.targetSide);
        const sFrom = sideOf(op.from), sTo = sideOf(op.to);
        const src = conns.find((c) => sideAt(c) === sFrom);
        if (!src) { missed.push(`${nameOf(g)}: no ${isMerge ? "incoming" : "outgoing"} connector at the ${op.from}`); continue; }
        const occupied = conns.find((c) => sideAt(c) === sTo);
        if (occupied) { missed.push(`${nameOf(g)}: the ${op.to} already has one — say “swap ${op.from} and ${op.to}”`); continue; }
        updateConnectorEndpoint(src.id, endpoint, g.id, sTo, 0.5);
        moved.push(nameOf(g));
      }
      if (moved.length === 0) anyFail = true;
      results.push(
        (moved.length ? `moved the ${op.from} connector to the ${op.to} on ${moved.length === 1 ? moved[0] : `${moved.length} elements`}` : "") +
        (missed.length ? `${moved.length ? " — " : ""}${missed.join("; ")}` : ""),
      );
      continue;
    }

    if (op.op === "swapGatewayPoints") {
      // Swap two connection points on EVERY selected gateway (Paul, 2026-09-15):
      // the outgoing points of a decision, the incoming points of a merge.
      // "middle" is the side in the flow direction (right for outgoing, left
      // for incoming); top/bottom/left/right are literal. A gateway with no
      // connector at one of the points is reported by name; the others still swap.
      const gws = selectedIds.map((id) => els.find((x) => x.id === id)).filter((g): g is DiagramElement => !!g && g.type === "gateway");
      if (gws.length === 0) { results.push("select a gateway first"); anyFail = true; continue; }
      const swapped: string[] = [];
      const missed: string[] = [];
      for (const g of gws) {
        const outs = data.connectors.filter((c) => c.sourceId === g.id && c.type === "sequence");
        const ins = data.connectors.filter((c) => c.targetId === g.id && c.type === "sequence");
        const isMerge = (g.properties?.gatewayRole as string | undefined) === "merge" || (ins.length > 1 && outs.length <= 1);
        const endpoint: "source" | "target" = isMerge ? "target" : "source";
        const conns = isMerge ? ins : outs;
        const middle: Side = isMerge ? "left" : "right";
        const sideOf = (p: typeof op.a): Side => (p === "middle" ? middle : p);
        const sideAt = (c: (typeof conns)[number]) => (endpoint === "source" ? c.sourceSide : c.targetSide);
        const sa = sideOf(op.a), sb = sideOf(op.b);
        const ca = conns.find((c) => sideAt(c) === sa);
        const cb = conns.find((c) => sideAt(c) === sb);
        if (!ca || !cb) { missed.push(`${nameOf(g)}: no ${isMerge ? "incoming" : "outgoing"} connector at the ${!ca ? op.a : op.b}`); continue; }
        updateConnectorEndpoint(ca.id, endpoint, g.id, sb, 0.5);
        updateConnectorEndpoint(cb.id, endpoint, g.id, sa, 0.5);
        swapped.push(nameOf(g));
      }
      if (swapped.length === 0) anyFail = true;
      results.push(
        (swapped.length ? `swapped the ${op.a} and ${op.b} points of ${swapped.length === 1 ? swapped[0] : `${swapped.length} gateways`}` : "") +
        (missed.length ? `${swapped.length ? " — " : ""}${missed.join("; ")}` : ""),
      );
      continue;
    }

    if (op.op === "addMessageByNumber") {
      // Number the candidates and wait for the pick (messageTargets.ts). The
      // answer arrives as the next utterance, handled by handleMessageUtterance.
      if (op.fromSelection && selectedIds.length === 0) { results.push("select what the message starts or ends at first"); anyFail = true; continue; }
      if (op.fromSelection && selectedIds.length > 1) { results.push("select just one element for that"); anyFail = true; continue; }
      const pick = collectMessageTargets(els, op.fromSelection ? selectedIds[0] : null, data.connectors);
      if ("error" in pick) { results.push(pick.error); anyFail = true; continue; }
      setRenameFlow(null);
      setMessageFlow(pick);
      if (pick.mode === "pair") {
        results.push("numbers on everything a message can start or end at — say “<n> to <m> labelled <text>” (or “done”)");
      } else {
        // Offer only the answers that can work: a receive-only anchor (a catch
        // event, a start event) is never told to say "to <n>".
        const anchor = els.find((e) => e.id === pick.anchorId);
        const forms = [pick.dirs.to ? "“to <n> labelled <text>”" : "", pick.dirs.from ? "“from <n> labelled <text>”" : ""].filter(Boolean);
        results.push(`numbers on what can exchange a message with ${anchor ? nameOf(anchor) : "the selection"} — say ${forms.join(" or ")} (or “done”)`);
      }
      continue;
    }

    if (op.op === "rename") {
      // #7 Reliable split. The grammar split "<name> to <new>" at the FIRST
      // " to ", which is wrong when the name (or the new name) itself contains
      // "to". Reconstruct the full phrase and try every " to " boundary,
      // preferring the LONGEST left side that actually resolves — to an
      // element OR a connector label (#6 "rename connector <label> to <new>").
      const phrase = `${op.ref} to ${op.label}`;
      const parts = phrase.split(/\s+to\s+/i);
      let done = false;
      for (let k = parts.length - 1; k >= 1 && !done; k--) {
        const leftRef = parts.slice(0, k).join(" to ").trim();
        const newLabel = parts.slice(k).join(" to ").trim();
        if (!leftRef || !newLabel) continue;
        const e = resolve1(leftRef);
        // A connector whose label is EXACTLY what was said — whole ("message
        // 4", its default name) or after a leading "message"/"connector" noun
        // ("message Invoice") — beats an element the resolver only matched
        // loosely: "rename message 4 to Request" renamed the event "Event 4"
        // (2026-09-25 repro). An element named exactly what was said still
        // wins. One rule, shared with the delete and both scorers (connectorRef.ts).
        const conns = connectorsOverElement(data.connectors, leftRef, "err" in e ? null : e);
        if (conns.length > 1) {
          // Parked with THIS split, so the number lands on the words that named them.
          const flow = buildConnectorPickFlow([{ ...op, ref: leftRef, label: newLabel }, ...ops.slice(opAt + 1)], leftRef, conns);
          if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; done = true; break; }
        }
        const conn = conns.length === 1 ? conns[0] : undefined;
        if (conn) { updateConnectorLabel(conn.id, newLabel); results.push(`renamed connector “${conn.label}” → ${newLabel}`); done = true; break; }
        if (!("err" in e)) { updateLabel(e.id, newLabel); els = withLabel(els, e.id, newLabel); setSelectedElementIds(new Set()); results.push(`renamed ${nameOf(e)} → ${newLabel}`); done = true; break; }
      }
      if (pickParked) break;
      if (!done) {
        const e = resolve1(op.ref);
        results.push("err" in e ? e.err : `couldn't rename “${op.ref}”`);
        anyFail = true;
      }
      continue;
    }

    // M7 — align the selection, the same dispatch the Alignment ▾ menu makes.
    if (op.op === "alignSelection") {
      const ids = selectedIds.filter((id) => els.some((e) => e.id === id));
      if (ids.length < 2) { results.push("select two or more elements to align"); anyFail = true; continue; }
      alignElements(ids, op.mode);
      setSelectedElementIds(new Set());
      results.push(`aligned ${ids.length} elements ${ALIGN_LABEL[op.mode]}`);
      continue;
    }

    // M8 — take a ghost suggestion. The candidates are live editor state, so
    // the pick is resolved here rather than in the grammar.
    if (op.op === "acceptGhost") {
      const cands = nextStepRef.current.candidates;
      if (!cands.length) {
        results.push(selectedIds.length === 0
          ? "no suggestion showing — select an element with Assist on"
          : "no suggestion showing for that element");
        anyFail = true; continue;
      }
      const idx = resolveGhostPick(parseGhostPick(op.pick), cands);
      if (idx === null) {
        // The ghosts are translucent and easy to misread, so naming what IS
        // on offer is more use than saying the pick was not one of them.
        results.push(`that isn't on offer — ${cands.map((c) => c.label).join(", ")}`);
        anyFail = true; continue;
      }
      nextStepRef.current.accept(cands[idx]);
      results.push(`accepted the ${cands[idx].label} suggestion`);
      continue;
    }

    // ── M4: fill the selection ────────────────────────────────────────────
    // All three take NO target — the selection is the target — so each
    // begins by insisting on one rather than falling back to recency. A
    // command that names nothing must never act on a guess.
    if (op.op === "fillLabels") {
      const chosen = selectedIds.map((id) => els.find((e) => e.id === id)).filter((e): e is DiagramElement => !!e);
      const plan = planLabelFill(chosen, op.labels);
      if (!plan.ok) { results.push(plan.reason); anyFail = true; continue; }
      for (const a of plan.assign) { updateLabel(a.id, a.label); els = withLabel(els, a.id, a.label); }
      setSelectedElementIds(new Set());   // the standing selection protocol
      results.push(`named ${plan.assign.length} in reading order: ${plan.assign.map((a) => a.label).join(", ")}`);
      continue;
    }

    if (op.op === "assignTeam") {
      const chosen = selectedIds.map((id) => els.find((e) => e.id === id)).filter((e): e is DiagramElement => !!e);
      if (!chosen.length) { results.push("nothing is selected"); anyFail = true; continue; }
      // A team is a simulation property of an ACTIVITY. Silently writing one
      // onto a gateway or an event would make the simulator's team harvest
      // disagree with what the diagram shows, so anything else is named.
      const ACTIVITY = new Set(["task", "subprocess", "subprocess-expanded", "call-activity", "transaction"]);
      const ok = chosen.filter((e) => ACTIVITY.has(e.type));
      const skipped = chosen.filter((e) => !ACTIVITY.has(e.type));
      if (!ok.length) { results.push(`a team belongs to an activity — ${nameOf(chosen[0])} is a ${chosen[0].type}`); anyFail = true; continue; }
      for (const e of ok) updateProperties(e.id, simPatch(e, { teamId: op.team }));
      setSelectedElementIds(new Set());
      results.push(
        `put ${ok.length} task${ok.length === 1 ? "" : "s"} in the ${op.team} team`
        + (skipped.length ? ` — skipped ${skipped.map(nameOf).join(", ")}` : ""),
      );
      continue;
    }

    if (op.op === "attachRiskControl") {
      const chosen = selectedIds.map((id) => els.find((e) => e.id === id)).filter((e): e is DiagramElement => !!e);
      if (!chosen.length) { results.push("nothing is selected"); anyFail = true; continue; }
      const item = findRiskCatalogItem(riskCatalog, op.ref);
      if (!item) {
        // Naming the catalogue is the useful half of the failure: "R-012"
        // that does not exist is usually a mis-hear of one that does, or a
        // library that was never adopted into this project.
        results.push(riskCatalog.length
          ? `no risk or control called “${op.ref}” in this project's library`
          : "this project has no Risk & Control library to attach from");
        anyFail = true; continue;
      }
      const key = item.kind === "Risk" ? "riskRefs" : "controlRefs";
      let attached = 0;
      for (const e of chosen) {
        const cur = (getRiskControl(e)[key] ?? []) as { itemId: string }[];
        if (cur.some((r) => r.itemId === item.id)) continue;   // already on it
        updateProperties(e.id, riskControlPatch(e, { [key]: [...cur, { itemId: item.id, code: item.code, label: item.name }] }));
        attached++;
      }
      setSelectedElementIds(new Set());
      results.push(attached
        ? `attached ${item.code} ${item.name} to ${attached} element${attached === 1 ? "" : "s"}`
        : `${item.code} was already on ${chosen.length === 1 ? "it" : "all of them"}`);
      if (!attached) anyFail = true;
      continue;
    }

    // M3 — set a subtype marker: "make this a user task". Writes exactly what
    // the right-click menu writes, from the same table, so the two cannot say
    // different things. Refusals are specific on purpose: "I don't know that
    // subtype" and "I know it, but not for a gateway" are different problems
    // and only the second one tells the user what to do next.
    // "move dividers" (Paul, 2026-09-27): number every lane divider; the next
    // utterance — "2 up 100 pixels" — is the editor's to read (dividerFlow.ts).
    if (op.op === "numberDividers") {
      const flow = buildDividerFlow(els);
      if ("error" in flow) { results.push(flow.error); anyFail = true; continue; }
      setDividerFlow(flow);
      results.push(flow.prompt);
      continue;
    }

    // "convert Review Claim to a subprocess" / "convert selected to a task"
    // (Paul, 2026-09-27) — the right-click menu's toggle (CONVERT_TASK_SUBPROCESS),
    // on each named or selected element that is the other shape. A task's
    // marker and a subprocess's link to its sub-diagram do not survive the
    // change, as with the menu — the log says so rather than losing them quietly.
    if (op.op === "convertActivity") {
      const from = op.to === "subprocess" ? "task" : "subprocess";
      const sel = resolveSelectionRefs(op.ref, els, selectedIds);
      let targets: DiagramElement[];
      if (sel) {
        if (!sel.length) { results.push("nothing is selected"); anyFail = true; continue; }
        targets = sel.map((id) => els.find((e) => e.id === id)!).filter(Boolean);
      } else {
        const e = resolve1(op.ref);
        if ("err" in e) { results.push(e.err); anyFail = true; continue; }
        targets = [e];
      }
      const done: string[] = [], notes: string[] = [];
      for (const e of targets) {
        if (e.type === op.to) { results.push(`${nameOf(e)} is already a ${op.to}`); anyFail = true; continue; }
        if (e.type !== from) {
          results.push(e.type === "subprocess-expanded"
            ? `${nameOf(e)} is an expanded subprocess — only a collapsed subprocess becomes a task`
            : `${nameOf(e)} is a ${e.type.replace(/-/g, " ")} — only a ${from} becomes a ${op.to}`);
          anyFail = true; continue;
        }
        const marker = e.type === "task" && e.taskType && e.taskType !== "none" ? e.taskType : undefined;
        const linked = e.type === "subprocess" && e.properties?.linkedDiagramId;
        convertTaskSubprocess(e.id);
        els = els.map((x) => (x.id === e.id ? { ...x, type: op.to } : x));
        done.push(nameOf(e));
        if (marker) notes.push(`${nameOf(e)}'s ${marker} marker is dropped`);
        if (linked) notes.push(`${nameOf(e)}'s link to its sub-diagram is removed`);
      }
      if (done.length) {
        setSelectedElementIds(new Set());   // the standing selection protocol
        results.push(`converted ${done.join(", ")} to a ${op.to}${notes.length ? ` — ${notes.join("; ")}` : ""}`);
      }
      continue;
    }

    // "move everything in Underwriters two steps to the right" (Paul,
    // 2026-09-27): the container's contents move, the container does not.
    // What moves, and whether it can, is moveContents.ts: moving right widens
    // the pool FIRST (a group moved past its edge falls out of it) and then
    // lines every pool up; a move left into a header is refused with the room.
    if (op.op === "moveContents") {
      // FROM A STEP ON (Paul, 2026-09-27): the step named or selected — the
      // leftmost, when several are — and the lane or pool it sits in, unless
      // one is named. A selected LANE means everything in it.
      let start: DiagramElement | undefined;
      if (op.fromRef) {
        const sel = resolveSelectionRefs(op.fromRef, els, selectedIds);
        if (sel) {
          if (!sel.length) { results.push("nothing is selected"); anyFail = true; continue; }
          start = sel.map((id) => els.find((e) => e.id === id)!).filter(Boolean).sort((a, b) => a.x - b.x)[0];
        } else {
          const s0 = resolve1(op.fromRef);
          if ("err" in s0) { results.push(s0.err); anyFail = true; continue; }
          start = s0;
        }
      }
      let c: DiagramElement | undefined;
      if (op.ref) {
        const r = resolveField(op, "ref");
        if ("err" in r) { results.push(r.err); anyFail = true; continue; }
        c = r;
      } else if (start && (start.type === "pool" || isAnyLane(start))) {
        c = start; start = undefined;
      } else if (start) {
        c = bandOf(start, els);
        if (!c) { results.push(`${nameOf(start)} is in no pool or lane`); anyFail = true; continue; }
      }
      if (!c) { results.push("say which pool or lane"); anyFail = true; continue; }
      if (c.type !== "pool" && !isAnyLane(c)) { results.push(`${nameOf(c)} is a ${c.type.replace(/-/g, " ")} — say a pool, lane or sub-lane`); anyFail = true; continue; }
      const dist = op.pixels ?? CONTENTS_STEP_PX * (op.steps ?? 1);
      const dx = op.direction === "right" ? dist : -dist;
      const plan = planMoveContents(els, c, dx, start ? { x: start.x, name: nameOf(start) } : undefined);
      if ("error" in plan) { results.push(plan.error); anyFail = true; continue; }
      if (plan.grow) {
        const pool = els.find((e) => e.id === plan.grow!.poolId)!;
        resizeElement(pool.id, pool.x, pool.y, plan.grow.width, pool.height);
        resizeElementEnd(pool.id);
        extendPools();   // every pool the same width, as "extend the pools" keeps them
      }
      moveElements(plan.ids, dx, 0);
      elementsMoveEnd();
      setSelectedElementIds(new Set());   // selection protocol
      const what = start ? `${nameOf(start)} and everything after it in ${nameOf(c)}` : `everything in ${nameOf(c)}`;
      results.push(`moved ${what} ${op.direction} ${dist}px${plan.grow ? " — the pools widened to make room" : ""}`);
      continue;
    }

    if (op.op === "convert") {
      const e = resolve1(op.ref);
      if ("err" in e) { results.push(e.err); anyFail = true; continue; }
      const all = convertMatches(op.subtype);
      if (!all.length) { results.push(`I don't know a “${op.subtype}”`); anyFail = true; continue; }
      const here = matchesForType(all, e.type);
      if (!here.length) {
        const kinds = [...new Set(all.flatMap((c) => c.appliesTo))].join(", ");
        results.push(`${nameOf(e)} is a ${e.type} — “${op.subtype}” applies to ${kinds}`);
        anyFail = true; continue;
      }
      if (here.length > 1) {
        results.push(`“${op.subtype}” could mean ${here.map((c) => `a ${c.phrase}`).join(" or ")} — say which`);
        anyFail = true; continue;
      }
      const pick = here[0];
      updateProperties(e.id, { [pick.propKey]: pick.value });
      setSelectedElementIds(new Set());   // the standing selection protocol
      results.push(`made ${nameOf(e)} ${pick.value === "none" ? "plain" : pick.label.toLowerCase()}`);
      continue;
    }

    if (op.op === "addBoundary") {
      let host: DiagramElement;
      if (op.hostRef) {
        const named = resolve1(op.hostRef);
        if ("err" in named) { results.push(named.err); anyFail = true; continue; }
        host = named;
      } else {
        // No host said. Paul, 2026-09-25: "Use the selected task" — if exactly
        // one task or subprocess is selected it goes there (the mouse says
        // which, the voice says what); otherwise refuse and say what to say.
        // Never a task, never a loose event: the mouse can make neither.
        const sel = selectedIds.map((id) => els.find((e) => e.id === id)).filter((e): e is DiagramElement => !!e);
        if (sel.length !== 1 || !isBoundaryHost(sel[0].type)) {
          const kind = `${op.nonInterrupting ? "non-interrupting " : ""}${op.eventType && op.eventType !== "none" ? `${op.eventType} ` : ""}boundary event`;
          results.push(`say which task or subprocess it goes on — “add ${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}${op.label ? ` called ${op.label}` : ""} to <name>”`);
          anyFail = true; continue;
        }
        host = sel[0];
      }
      if (!isBoundaryHost(host.type)) { results.push(`${nameOf(host)} can't host a boundary event`); anyFail = true; continue; }
      const existing = els.filter((e) => e.boundaryHostId === host.id);
      const spot = placeBoundaryEvent(host, existing);
      if (!spot) { results.push(`no room for another boundary event on ${nameOf(host)}`); anyFail = true; continue; }
      const newId = nanoid();
      addElementGated("intermediate-event", spot, undefined, op.eventType, newId);
      setEventBoundary(newId, host.id);
      if (op.nonInterrupting) updateProperties(newId, { interruptionType: "non-interrupting" });
      if (op.label) updateLabel(newId, op.label);
      voiceLastId.current = newId;
      setSelectedElementIds(new Set([newId]));
      results.push(`added boundary event${op.label ? ` ${op.label}` : ""} on ${nameOf(host)}`);
      continue;
    }

    if (op.op === "pickTemplate") {
      // "add template before X" is refused, not guessed: a true "before" is a
      // splice, and a template often has no single exit to join X by.
      if (op.beforeRef) { results.push(TEMPLATE_BEFORE_REFUSAL); anyFail = true; continue; }
      if (op.afterRef) {
        // The anchor is resolved exactly as the add op resolves its own: an
        // ambiguous name raises the numbered pick and the answer re-runs this
        // op with an #id, and a name not found stops the command.
        const a = resolve1(op.afterRef, { strict: true });
        if ("err" in a && a.ambiguous) {
          const flow = buildPickFlow(ops.slice(opAt), op.afterRef, a.ambiguous, els);
          if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
        }
        if ("err" in a) { results.push(a.err); anyFail = true; continue; }
        // The window is never opened on an anchor no template could follow.
        const why = whyTemplateCantFollow(a, els);
        if (why) { results.push(why); anyFail = true; continue; }
        results.push(openTemplateWindowRef.current({ anchorId: a.id }));
        continue;
      }
      if (op.at === "pointer") {
        if (!pointerWorld.current) {
          results.push("I don't know where “here” is — move the mouse over the canvas first");
          anyFail = true; continue;
        }
        results.push(openTemplateWindowRef.current({ at: { ...pointerWorld.current } }));
        continue;
      }
      // ONE STEP SELECTED means "after it" (Paul, 2026-09-27: the Assist
      // template addition "is correct for the command 'add template' IF an
      // element is selected … expand the lane of the selected element, remove
      // any start event, place the selected template in the lane, and connect
      // it to the selected element"). That is the attach "after X" already
      // does, so the selection simply becomes the anchor.
      const selected = selectedIds.length === 1 ? els.find((e) => e.id === selectedIds[0]) : undefined;
      if (selected && SEQUENCE_NODE_TYPES.has(selected.type)) {
        const why = whyTemplateCantFollow(selected, els);
        if (why) { results.push(why); anyFail = true; continue; }
        results.push(openTemplateWindowRef.current({ anchorId: selected.id }));
        continue;
      }
      results.push(openTemplateWindowRef.current());
      continue;
    }

    if (op.op === "addLanes") {
      const pool = resolveField(op, "poolRef");
      // Candidates that share a label cannot be told apart by saying the name
      // — "which “pool three”? 2 match: “Pool 3”, “Pool 3”" (Paul's log,
      // 2026-09-23). Numbered badges can.
      if ("err" in pool && pool.ambiguous) {
        const flow = buildPickFlow(ops.slice(opAt), op.poolRef, pool.ambiguous, els);
        if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
      }
      if ("err" in pool) { results.push(pool.err); anyFail = true; continue; }
      if (pool.type !== "pool") { results.push(`${nameOf(pool)} isn't a pool`); anyFail = true; continue; }
      splitPoolEven(pool.id, op.labels);
      // Say the names the lanes will REALLY have. The reducer numbers a bare
      // or taken name against the diagram, so reporting what was asked for
      // named a lane that already existed — "added 1 lane to Pool 3: Lane 1",
      // twice, in Paul's log of 2026-09-23.
      const laneNames = nextContainerLabels(els, op.labels, "Lane");
      results.push(`added ${laneNames.length} lane${laneNames.length === 1 ? "" : "s"} to ${nameOf(pool)}: ${laneNames.join(", ")}`);
      continue;
    }

    if (op.op === "addSublanes") {
      const lane = resolve1(op.laneRef);
      if ("err" in lane && lane.ambiguous) {
        const flow = buildPickFlow(ops.slice(opAt), op.laneRef, lane.ambiguous, els);
        if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
      }
      if ("err" in lane) { results.push(lane.err); anyFail = true; continue; }
      // "Add a sublane to pool three" names the POOL, because that is how a
      // person describes where they are looking. Sublanes live in lanes, so
      // answer with the lane when there is no doubt which, and otherwise say
      // which lanes there are rather than "Pool 3 isn't a lane" (Paul's log,
      // 2026-09-23).
      let target = lane;
      if (target.type === "pool") {
        const lanesIn = els.filter((e) => e.type === "lane" && e.parentId === target.id);
        if (lanesIn.length === 1) target = lanesIn[0];
        else if (lanesIn.length > 1) {
          const flow = buildPickFlow(ops.slice(opAt), op.laneRef, lanesIn.map((l) => l.id), els);
          if (flow) { setPickFlow(flow); results.push(`which lane in ${nameOf(target)}? ${flow.prompt}`); pickParked = true; break; }
        } else { results.push(`${nameOf(target)} has no lanes to put a sublane in`); anyFail = true; continue; }
      }
      if (target.type !== "lane") { results.push(`${nameOf(target)} isn't a lane`); anyFail = true; continue; }
      splitLaneEven(target.id, op.labels);
      const subNames = nextContainerLabels(els, op.labels, "Sublane");
      results.push(`added ${subNames.length} sublane${subNames.length === 1 ? "" : "s"} to ${nameOf(target)}: ${subNames.join(", ")}`);
      continue;
    }
  }
  askWhich();
  return { ok: !anyFail || pickParked, summary: results.join("; ") || "nothing to do" };
}
