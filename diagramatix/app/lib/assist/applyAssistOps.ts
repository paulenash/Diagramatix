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
import { sizeOf, placeInline, placeGatewayBranch, placeBoundaryEvent, placeAfterBoundaryEvent, boundaryOuterSide, findFreeSlot, HALF_TASK_W, HALF_TASK_H } from "@/app/lib/diagram/assistPlacement";
import { planWrapInSubprocess, planUnwrapSubprocess, planWrapInContainer } from "@/app/lib/diagram/subprocessWrap";
import { canConnect } from "@/app/lib/diagram/canConnect";
import { resolveRef, resolveSelectionRefs, isSelectionRef, nearestRefs, ID_REF_PREFIX, spokenNumbersAsDigits } from "./resolveRef";
import { isPointerElementRef } from "./pointerRef";
import { nextContainerLabels } from "@/app/lib/diagram/containerNames";
import { isAnyLane, laneKindWord, sameKindAs } from "@/app/lib/diagram/laneKind";
import { convertMatches, matchesForType } from "./convertPhrase";
import { planLabelFill } from "./fillSelection";
import { findRiskCatalogItem } from "./riskCatalogRef";
import { parseGhostPick, resolveGhostPick } from "./ghostPick";
import { looksLikeElementId } from "./refMentions";
import { capitaliseFirstWord, needsCapital } from "@/app/lib/diagram/nameCase";
import { goldFlashSummary } from "./goldFlash";
import { planMovePool, planSwapPools, selectedPools, poolsInOrder } from "@/app/lib/diagram/poolOrder";
import { collectMessageTargets, type MessagePick } from "./messageTargets";
import type { AssistOp } from "./ops";
import { boundaryRect } from "./poolBoundaryPhrase";
import { syntheticElement, withAdded, withDeleted, withLabel } from "./workingSet";
import { collectRenameTargets, type RenameType, type RenameTarget } from "./renameTargets";
import { buildPickFlow, type PickFlow } from "./disambiguate";
import { getRiskControl, riskControlPatch } from "@/app/lib/diagram/riskControl";
import { simPatch } from "@/app/lib/diagram/simParams";

/** The guided "rename by number" flow — pick a numbered badge, then say the name. */
export type RenameFlow =
  | { phase: "pick"; itemType: RenameType; targets: RenameTarget[] }
  | { phase: "name"; itemType: RenameType; targetId: string; kind: "element" | "connector"; /** "label selected" — one item, no pick loop after */ single?: boolean };

export type AlignMode = "center" | "top" | "bottom" | "vcenter" | "left" | "right" | "smart";

/** The diagram edits — useDiagram's helpers, by the same names and signatures. */
export interface AssistDiagramActions {
  /** The editor passes its element-limit-gated wrapper; headless, the plain add. */
  addElementGated(symbolType: SymbolType, position: { x: number; y: number }, taskType?: BpmnTaskType, eventType?: EventType, id?: string, initial?: { properties?: Record<string, unknown>; width?: number; height?: number; label?: string; parentId?: string }): void;
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
  extendPools(): void;
  swapLane(laneId: string, direction: "up" | "down"): void;
  moveLane(laneId: string, direction: "up" | "down", distance?: number): void;
  moveElements(ids: string[], dx: number, dy: number): void;
  elementsMoveEnd(): void;
  removeSpace(zone: { x: number; y: number; width: number; height: number }): void;
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
  setGoldFlash(on: boolean): void;
}

export interface AssistApplyContext {
  /** The diagram BEFORE the batch. React does not re-render mid-batch, so the
   *  working copy below threads each op's effect forward itself. */
  elements: DiagramElement[];
  connectors: Connector[];
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
    openTemplateWindowRef: MutableRefObject<() => string>;
    exportJsonRef: MutableRefObject<(() => void) | null>;
  };
}

/** Normalise a spoken connector/message reference to match against a connector
 *  label: drop a leading "connector/message/msg/flow/arrow" noun and any
 *  surrounding quotes. */
function messageLabelKey(ref: string): string {
  return ref
    .trim()
    .replace(/^(?:the\s+)?(?:connector|connexion|connection|message|msg|flow|arrow|link)\s+/i, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim()
    .toLowerCase();
}

const elBox = (e: DiagramElement) => ({ x: e.x, y: e.y, width: e.width, height: e.height });
const nameOf = (e: DiagramElement) => (e.label?.trim() || e.type);
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
    wrapInSubprocess, wrapInContainer, unwrapSubprocess, addPool, addLaneAt, compressPool, extendPools,
    swapLane, moveLane, moveElements, elementsMoveEnd, removeSpace, updateConnectorEndpoint, movePoolTo,
    swapPools, resizeElement, resizeElementEnd, alignElements,
  } = ctx.actions;
  const { setSelectedElementIds, setSelectedConnectorId, setPickFlow, setRenameFlow, setMessageFlow, setGoldFlash } = ctx.ui;
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
   * REDUCER answers, so its room rule is never copied here.
   */
  const wouldChange = (action: Action): boolean => {
    const now = { elements: els, connectors: data.connectors, viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData;
    return reducer(now, action) !== now;
  };
  // Multi-modal: "this" / "these" / "the selected task" resolve to the mouse
  // selection — the mouse says WHICH, the voice says WHAT.
  const selectedIds = selectedIdsRef.current;
  /**
   * `strict` (R3) is for commands that DESTROY something. Without it a bare
   * type noun resolves to the most recent of its kind — the right call for
   * "add a task after the gateway", and quietly the wrong element for
   * "delete the task".
   *
   * R2: an ambiguity now names the candidates instead of throwing them away.
   * `resolveRef` has always returned the list; the message discarded it and
   * said only "is ambiguous", which left the user to guess what it had found.
   */
  const resolve1 = (ref: string, opts: { strict?: boolean } = {}): DiagramElement | { err: string; ambiguous?: string[] } => {
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
      const near = nearestRefs(ref, els, 3);
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
      return { err: `which “${ref}”? ${names.length} match: ${shown}${more} — say the name`, ambiguous: r.ambiguous };
    }
    return els.find((e) => e.id === r.id)!;
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
  for (const op of ops) {
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
          const flow = buildPickFlow(ops, op.afterRef, a.ambiguous, els);
          if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
        }
        if ("err" in a) { results.push(a.err); anyFail = true; continue; }
        anchor = a;
      }
      if (!anchor && voiceLastId.current) anchor = els.find((e) => e.id === voiceLastId.current) ?? null;
      const others = els.filter((e) => e.type !== "pool" && e.type !== "lane" && e.type !== "sublane").map(elBox);
      let center; let srcSide: Side | undefined;
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
        // R7: task after a boundary event → bottom/top-right, connector exits the outer face.
        const host = els.find((e) => e.id === anchor!.boundaryHostId);
        const side = host ? boundaryOuterSide(anchor, host) : "bottom";
        center = findFreeSlot(placeAfterBoundaryEvent(anchor, side, w, h), w, h, others);
        srcSide = side;
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
      let parentId: string | undefined = anchor?.parentId ?? undefined;
      if (!parentId) {
        const wb = els.find((e) => e.type === "pool" && (((e.properties?.poolType as string | undefined) ?? "white-box") === "white-box"));
        if (wb) {
          const firstLane = els.filter((e) => e.type === "lane" && e.parentId === wb.id).sort((a, b) => a.y - b.y)[0];
          parentId = firstLane?.id ?? wb.id;
        }
      }
      addElementGated(op.symbolType, center, undefined, op.eventType, newId, parentId ? { parentId } : undefined);
      if (op.gatewayType) updateProperties(newId, { gatewayType: op.gatewayType });
      // The reducer capitalises an activity / gateway / event label, so the
      // WORKING COPY has to carry the same string — otherwise the log line
      // and the next command's reference describe a name the diagram does
      // not have.
      const addedLabel = op.label && needsCapital(op.symbolType) ? capitaliseFirstWord(op.label) : op.label;
      if (addedLabel) updateLabel(newId, addedLabel);
      const addedEl = syntheticElement(newId, op.symbolType, center, w, h, { label: addedLabel, parentId, eventType: op.eventType });
      if (anchor && op.afterRef) {
        // R7 — the explicit `connect` op has always been checked against
        // `canConnect`; this auto-connect never was. So "add a task after
        // Done" drew a sequence flow OUT of an end event and reported it with
        // a green tick. Check the same gauntlet the reducer and the ghost
        // suggestions use, against the state that WILL exist — the new
        // element is not in `els` yet.
        if (!canConnect(anchor, addedEl, "sequence", withAdded(els, addedEl))) {
          results.push(`added ${nameOf(addedEl)} but left it unconnected — a sequence flow from ${nameOf(anchor)} isn’t legal`);
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
      results.push(`added ${op.label ?? op.symbolType}${anchor && op.afterRef ? ` after ${nameOf(anchor)}` : ""}`);
      continue;
    }

    if (op.op === "connect") {
      const f = resolve1(op.fromRef), t = resolve1(op.toRef);
      if ("err" in f) { results.push(f.err); anyFail = true; continue; }
      if ("err" in t) { results.push(t.err); anyFail = true; continue; }
      if (!canConnect(f, t, op.connectorType ?? "sequence", els)) { results.push(`can’t connect ${nameOf(f)} → ${nameOf(t)}`); anyFail = true; continue; }
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
      if ("err" in e && e.ambiguous) {
        // R2: number the candidates and wait for a number, rather than
        // making the user rephrase a command that was already unambiguous
        // to THEM — they can see which one they meant.
        const flow = buildPickFlow(ops, op.ref, e.ambiguous, els);
        if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
      }
      if ("err" in e) {
        // Not an element — maybe a message/connector label.
        const key = messageLabelKey(op.ref);
        const conn = data.connectors.find((c) => (c.label ?? "").trim().toLowerCase() === key);
        if (conn) { deleteConnector(conn.id); results.push(`deleted message “${conn.label}”`); continue; }
        results.push(e.err); anyFail = true; continue;
      }
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
      // Compact: close the horizontal gap the element left (vertical strip only).
      if (op.compact) removeSpace({ x: foot.x, y: foot.y, width: foot.width, height: 0 });
      results.push(`deleted ${nameOf(e)}${op.compact ? " and compacted" : ""}`);
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
      const m = resolve1(op.ref), a = resolve1(op.relativeTo);
      if ("err" in m) { results.push(m.err); anyFail = true; continue; }
      if ("err" in a) { results.push(a.err); anyFail = true; continue; }
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
        const ra = resolve1(op.a), rb = resolve1(op.b);
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
      const plan = planSwapPools(els, data.connectors, a.id, b.id, isContainerType, getAllDescendantIds);
      if ("error" in plan) { results.push(plan.error); anyFail = true; continue; }
      swapPools(a.id, b.id);
      els = plan.elements;
      setSelectedElementIds(new Set()); // selection protocol
      results.push(`swapped ${nameOf(a)} and ${nameOf(b)}`);
      continue;
    }

    if (op.op === "wrapInPool") {
      // Say what will actually happen. With a pool already on the diagram the
      // reducer GROWS the biggest one to adopt the loose elements rather than
      // drawing a second pool — which is the right behaviour and looked like a
      // no-op, because "wrapped everything in a pool" had you searching for a
      // new pool that was never going to appear (Paul, 2026-09-18).
      const loose = els.filter((e) => e.type !== "pool" && e.type !== "lane" && e.type !== "sublane"
        && e.type !== "text-annotation" && !e.parentId);
      const pools = els.filter((e) => e.type === "pool");
      if (loose.length === 0) {
        results.push(pools.length
          ? "everything is already in a pool"
          : "there's nothing loose to put in a pool");
        anyFail = true;
        continue;
      }
      wrapInPool(op.label);
      if (pools.length > 0) {
        const biggest = pools.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
        results.push(`grew ${nameOf(biggest)} to take in ${loose.length} loose element${loose.length === 1 ? "" : "s"}`);
      } else {
        results.push(`put ${loose.length} element${loose.length === 1 ? "" : "s"} in a new pool`);
      }
      continue;
    }

    if (op.op === "addPool") {
      // "above|below <named pool>" — resolve the anchor pool so we position by it.
      let relativeToId: string | undefined;
      if (op.relativeTo) {
        const r = resolve1(op.relativeTo);
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
      const poolId = ref.parentId ?? (() => { const p = resolve1(op.poolRef); return "err" in p ? null : p.id; })();
      if (!poolId) { results.push(`couldn't find the pool for ${nameOf(ref)}`); anyFail = true; continue; }
      // The reducer carves the new lane out of its neighbour and never grows the
      // pool, so with no room it adds NOTHING — and this said "added a lane"
      // anyway (found by L4, 2026-09-25). Ask the reducer rather than
      // re-deriving its room rule here.
      if (!wouldChange({ type: "ADD_LANE_AT", payload: { poolId, position: op.position, refLaneId: ref.id, label: op.label } })) {
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
      const a = resolve1(op.laneA), b = resolve1(op.laneB);
      if ("err" in a) { results.push(a.err); anyFail = true; continue; }
      if ("err" in b) { results.push(b.err); anyFail = true; continue; }
      if (a.type !== "lane" || b.type !== "lane" || a.parentId !== b.parentId) { results.push("both must be lanes in the same pool"); anyFail = true; continue; }
      const sibs = els.filter((e) => e.type === "lane" && e.parentId === a.parentId).sort((x, y) => x.y - y.y);
      const ia = sibs.findIndex((e) => e.id === a.id), ib = sibs.findIndex((e) => e.id === b.id);
      if (Math.abs(ia - ib) !== 1) { results.push("lanes must be next to each other to swap"); anyFail = true; continue; }
      swapLane(sibs[Math.min(ia, ib)].id, "down");
      results.push(`swapped ${nameOf(a)} ↔ ${nameOf(b)}`);
      continue;
    }

    if (op.op === "compressPool") {
      const p = resolve1(op.poolRef);
      if ("err" in p && p.ambiguous) {
        const flow = buildPickFlow(ops, op.poolRef, p.ambiguous, els);
        if (flow) { setPickFlow(flow); results.push(flow.prompt); pickParked = true; break; }
      }
      if ("err" in p) { results.push(p.err); anyFail = true; continue; }
      if (p.type !== "pool") { results.push(`${nameOf(p)} isn't a pool`); anyFail = true; continue; }
      compressPool(p.id);
      results.push(`compressed ${nameOf(p)}`);
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
      const dist = op.distance ?? 20;
      let target: DiagramElement | undefined;
      if (op.ref) {
        const r = resolve1(op.ref);
        if ("err" in r) { results.push(r.err); anyFail = true; continue; }
        target = r;
      } else {
        const pools = els.filter((e) => e.type === "pool");
        target = pools[pools.length - 1];
      }
      if (!target || target.type !== "pool") {
        results.push(op.ref ? `${nameOf(target!)} isn't a pool` : "there's no pool to resize");
        anyFail = true; continue;
      }
      const before = { x: target.x, y: target.y, width: target.width, height: target.height };
      const want = boundaryRect(before, op.boundary, op.direction, dist);
      resizeElement(target.id, want.x, want.y, want.width, want.height);
      resizeElementEnd(target.id);   // a spoken move is whole; close it, as the mouse does on release
      setSelectedElementIds(new Set()); // selection protocol
      voiceLastId.current = target.id;
      results.push(`moved ${nameOf(target)}'s ${op.boundary} boundary ${op.direction} ${dist}px`);
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
        // Default target: the most-recent black-box pool, else any pool.
        const pools = els.filter((e) => e.type === "pool");
        const blacks = pools.filter((p) => (p.properties?.poolType as string | undefined) === "black-box");
        target = blacks[blacks.length - 1] ?? pools[pools.length - 1];
        if (!target) { results.push("there's no pool to nudge"); anyFail = true; continue; }
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
      if (r.type !== "lane") {
        const dy = (op.distance ?? 32) * (op.direction === "down" ? 1 : -1);
        moveElements([r.id], 0, dy);
        elementsMoveEnd();
        voiceLastId.current = r.id;
        setSelectedElementIds(new Set()); // selection protocol
        results.push(`moved ${nameOf(r)} ${op.direction}`);
        continue;
      }
      const sibs = els.filter((e) => e.type === "lane" && e.parentId === r.parentId).sort((a, b) => a.y - b.y);
      const i = sibs.findIndex((s) => s.id === r.id);
      const toward = op.direction === "down" ? sibs[i + 1] : sibs[i - 1];
      if (!toward) { results.push(`${nameOf(r)} is against the pool edge — can't move it ${op.direction}`); anyFail = true; continue; }
      // Same trap as addLaneAt. A lane move is a trade between its two
      // neighbours — moving down grows the lane ABOVE and shrinks the one below
      // — so the reducer needs a lane on BOTH sides, and stops where the one
      // giving way runs out (its contents, or sublanes that fill it). The edge
      // check above only looked one way, and either refusal still reported
      // "moved" (found by L4, 2026-09-25).
      if (!wouldChange({ type: "MOVE_LANE", payload: { laneId: r.id, direction: op.direction, distance: op.distance ?? 32 } })) {
        const behind = op.direction === "down" ? sibs[i - 1] : sibs[i + 1];
        results.push(behind
          ? `${nameOf(r)} can't move ${op.direction} — ${nameOf(toward)} has no room to give`
          : `${nameOf(r)} is the ${op.direction === "down" ? "top" : "bottom"} lane — moving it ${op.direction} needs a lane ${op.direction === "down" ? "above" : "below"} it to take up the gap`);
        anyFail = true; continue;
      }
      moveLane(r.id, op.direction, op.distance ?? 32);
      voiceLastId.current = r.id;
      setSelectedElementIds(new Set()); // selection protocol
      results.push(`moved ${nameOf(r)} ${op.direction}`);
      continue;
    }

    if (op.op === "addMessage") {
      const f = resolve1(op.fromRef), t = resolve1(op.toRef);
      if ("err" in f) { results.push(f.err); anyFail = true; continue; }
      if ("err" in t) { results.push(t.err); anyFail = true; continue; }
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
      const gws = selectedIds.map((id) => els.find((x) => x.id === id)).filter((g): g is DiagramElement => !!g && g.type === "gateway");
      if (gws.length === 0) { results.push("select a gateway first"); anyFail = true; continue; }
      const moved: string[] = [];
      const missed: string[] = [];
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
        (moved.length ? `moved the ${op.from} connector to the ${op.to} on ${moved.length === 1 ? moved[0] : `${moved.length} gateways`}` : "") +
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
      if (op.fromSelection && selectedIds.length === 0) { results.push("select a task, a collapsed subprocess or a black-box pool first"); anyFail = true; continue; }
      if (op.fromSelection && selectedIds.length > 1) { results.push("select just one element for that"); anyFail = true; continue; }
      const pick = collectMessageTargets(els, op.fromSelection ? selectedIds[0] : null);
      if ("error" in pick) { results.push(pick.error); anyFail = true; continue; }
      setRenameFlow(null);
      setMessageFlow(pick);
      results.push(pick.mode === "pair"
        ? "numbers on every task, collapsed subprocess and black-box pool — say “<n> to <m> labelled <text>” (or “done”)"
        : `numbers on the ${pick.anchorIsPool ? "tasks and collapsed subprocesses" : "black-box pools"} — say “to <n> labelled <text>” or “from <n> labelled <text>” (or “done”)`);
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
        if (!("err" in e)) { updateLabel(e.id, newLabel); els = withLabel(els, e.id, newLabel); setSelectedElementIds(new Set()); results.push(`renamed ${nameOf(e)} → ${newLabel}`); done = true; break; }
        const key = messageLabelKey(leftRef);
        const conn = data.connectors.find((c) => (c.label ?? "").trim().toLowerCase() === key);
        if (conn) { updateConnectorLabel(conn.id, newLabel); results.push(`renamed connector “${conn.label}” → ${newLabel}`); done = true; break; }
      }
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
      const host = resolve1(op.hostRef);
      if ("err" in host) { results.push(host.err); anyFail = true; continue; }
      if (!["task", "subprocess", "subprocess-expanded"].includes(host.type)) { results.push(`${nameOf(host)} can't host a boundary event`); anyFail = true; continue; }
      const existing = els.filter((e) => e.boundaryHostId === host.id);
      const spot = placeBoundaryEvent(host, existing);
      if (!spot) { results.push(`no room for another boundary event on ${nameOf(host)}`); anyFail = true; continue; }
      const newId = nanoid();
      addElementGated("intermediate-event", spot, undefined, op.eventType, newId);
      setEventBoundary(newId, host.id);
      if (op.label) updateLabel(newId, op.label);
      voiceLastId.current = newId;
      setSelectedElementIds(new Set([newId]));
      results.push(`added boundary event${op.label ? ` ${op.label}` : ""} on ${nameOf(host)}`);
      continue;
    }

    if (op.op === "pickTemplate") {
      results.push(openTemplateWindowRef.current());
      continue;
    }

    if (op.op === "addLanes") {
      const pool = resolve1(op.poolRef);
      // Candidates that share a label cannot be told apart by saying the name
      // — "which “pool three”? 2 match: “Pool 3”, “Pool 3”" (Paul's log,
      // 2026-09-23). Numbered badges can.
      if ("err" in pool && pool.ambiguous) {
        const flow = buildPickFlow(ops, op.poolRef, pool.ambiguous, els);
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
        const flow = buildPickFlow(ops, op.laneRef, lane.ambiguous, els);
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
          const flow = buildPickFlow(ops, op.laneRef, lanesIn.map((l) => l.id), els);
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
  return { ok: !anyFail || pickParked, summary: results.join("; ") || "nothing to do" };
}
