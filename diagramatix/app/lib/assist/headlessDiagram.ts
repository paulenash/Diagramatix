/**
 * A diagram with no editor: useDiagram's actions, applied by the real reducer
 * to a plain state. It exists so `applyAssistOps` can be run by a test and the
 * result inspected — the fourth question, "did applying the ops do the right
 * thing?" (L4).
 *
 * THE RULE THAT KEEPS THIS HONEST: each method here dispatches exactly the
 * action useDiagram's helper of the same name dispatches, with the same
 * payload. The payload shapes are held to the reducer's `Action` union by the
 * compiler; the action TYPE per name is held to useDiagram's source by a guard
 * test. A shape is not the keys, though — the editor once sent a connector
 * label's position as `undefined` where this file left it out, and only the
 * editor's rename erased it — so that payload is built by useDiagram's own
 * `connectorLabelPayload` in both. Nothing here decides anything — a helper
 * that did would make L4 score this file instead of the product.
 *
 * What it deliberately does NOT reproduce:
 * - the element-limit gate (`addElementGated` is a plan limit, not an edit);
 * - drag coalescing and label-edit snapshots (history bookkeeping for a mouse).
 * History is kept only so "undo" means what it means in the editor: one entry
 * per helper call, a staged move or resize committed at its end.
 *
 * The screen half (`ui`) is a recorder. Selection, pickers and prompts change
 * nothing on the diagram, but a case may want to know that a picker opened.
 */
import { reducer, connectorLabelPayload, healOnLoad, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { AssistApplyContext, AssistDiagramActions, AssistUi } from "./applyAssistOps";
import type { PickFlow } from "./disambiguate";

export interface HeadlessDiagram {
  /** The diagram now. */
  readonly data: DiagramData;
  readonly actions: AssistDiagramActions;
  readonly ui: AssistUi;
  /** What the screen was asked to do, in order — "pick", "rename", "message". */
  readonly screen: string[];
  /** Build the context `applyAssistOps` takes, with this diagram behind it. */
  context(opts?: { selectedIds?: string[]; selectedConnectorId?: string | null; pointer?: { x: number; y: number } | null }): AssistApplyContext;
}

export function headlessDiagram(initial: DiagramData): HeadlessDiagram {
  // The editor opens a diagram through the same load heal (useReducer's
  // initialiser); without it L4 would score a diagram no one ever sees — a
  // saved label with no position still drawn inside its pool.
  let state = healOnLoad(initial);
  const past: DiagramData[] = [];
  let staged: DiagramData | null = null;       // a move or resize in progress
  let resizing: string | null = null;
  let groupMoved = new Set<string>();           // every id the staged group move carried
  const screen: string[] = [];

  const run = (a: Action) => { state = reducer(state, a); };
  /** One undo entry, then the action — what `pushHistory(snapshotData()); dispatch(…)` does. */
  const commit = (a: Action) => { past.push(state); run(a); };

  const actions: AssistDiagramActions = {
    addElementGated: (symbolType, position, taskType, eventType, id, initial) =>
      commit({ type: "ADD_ELEMENT", payload: { symbolType, position, taskType, eventType, id, initial } }),
    updateProperties: (id, properties) => commit({ type: "UPDATE_PROPERTIES", payload: { id, properties } }),
    updateLabel: (id, label) => commit({ type: "UPDATE_LABEL", payload: { id, label } }),
    addConnector: (sourceId, targetId, connectorType = "sequence", directionType = "directed", routingType = "rectilinear",
      sourceSide = "right", targetSide = "left", sourceOffsetAlong, targetOffsetAlong, force, initialLabel) =>
      commit({ type: "ADD_CONNECTOR", payload: { sourceId, targetId, connectorType, directionType, routingType, sourceSide, targetSide, sourceOffsetAlong, targetOffsetAlong, force, initialLabel } }),
    deleteConnector: (id) => commit({ type: "DELETE_CONNECTOR", payload: { id } }),
    updateConnectorLabel: (id, label) => commit({ type: "UPDATE_CONNECTOR_LABEL", payload: connectorLabelPayload(id, label) }),
    deleteElement: (id) => commit({ type: "DELETE_ELEMENT", payload: { id } }),
    undo: () => {
      const snap = past.pop();
      if (snap) run({ type: "SET_DATA", payload: { ...state, elements: snap.elements, connectors: snap.connectors } });
    },
    clearDiagram: () => commit({ type: "SET_DATA", payload: { ...state, elements: [], connectors: [] } }),
    setEventBoundary: (id, hostId) => commit({ type: "SET_EVENT_BOUNDARY", payload: { id, hostId } }),
    splitPoolEven: (poolId, labels) => commit({ type: "SPLIT_POOL_EVEN", payload: { poolId, labels } }),
    splitLaneEven: (laneId, labels) => commit({ type: "SPLIT_LANE_EVEN", payload: { laneId, labels } }),
    wrapInPool: (label) => commit({ type: "WRAP_IN_POOL", payload: { label } }),
    wrapInSubprocess: (selectedIds, label, ids) => commit({ type: "WRAP_IN_SUBPROCESS", payload: { selectedIds, label, ids } }),
    wrapInContainer: (selectedIds, container, label, ids) => commit({ type: "WRAP_IN_CONTAINER", payload: { selectedIds, container, label, ids } }),
    unwrapSubprocess: (epId) => commit({ type: "UNWRAP_SUBPROCESS", payload: { epId } }),
    addPool: (opts) => commit({ type: "ADD_POOL", payload: { label: opts?.label, poolType: opts?.poolType, position: opts?.position, relativeToId: opts?.relativeToId } }),
    addLaneAt: (poolId, position, refLaneId, label) => commit({ type: "ADD_LANE_AT", payload: { poolId, position, refLaneId, label } }),
    compressPool: (poolId) => commit({ type: "COMPRESS_POOL", payload: { poolId } }),
    extendPools: () => commit({ type: "EXTEND_POOLS", payload: {} }),
    swapLane: (laneId, direction) => commit({ type: "SWAP_LANES_VERTICAL", payload: { laneId, direction } }),
    moveLane: (laneId, direction, distance = 32) => commit({ type: "MOVE_LANE", payload: { laneId, direction, distance } }),
    moveElements: (ids, dx, dy) => {
      staged ??= state;
      if (dx !== 0 || dy !== 0) for (const id of ids) groupMoved.add(id);
      run({ type: "MOVE_ELEMENTS", payload: { ids, dx, dy } });
    },
    elementsMoveEnd: () => {
      if (staged) { past.push(staged); staged = null; }
      const ids = [...groupMoved];
      groupMoved = new Set();
      if (ids.length > 0) run({ type: "ELEMENTS_MOVE_END", payload: { ids } });
      else run({ type: "CORRECT_ALL_CONNECTORS" });
    },
    removeSpace: (zone) => commit({ type: "REMOVE_SPACE", payload: { zone } }),
    updateConnectorEndpoint: (connectorId, endpoint, newElementId, newSide, newOffsetAlong) =>
      commit({ type: "UPDATE_CONNECTOR_ENDPOINT", payload: { connectorId, endpoint, newElementId, newSide, newOffsetAlong } }),
    // useDiagram dispatches these two with no history entry of their own; so does this.
    movePoolTo: (poolId, position, relativeToId) => run({ type: "MOVE_POOL_TO", payload: { poolId, position, relativeToId } }),
    swapPools: (aId, bId) => run({ type: "SWAP_POOLS", payload: { aId, bId } }),
    resizeElement: (id, x, y, width, height) => {
      if (resizing !== id) { resizing = id; staged = state; }
      // The same reading useDiagram takes: was this pool white-box when the resize BEGAN?
      const startEl = staged?.elements.find((e) => e.id === id);
      const wasWhiteBoxAtResizeStart = startEl?.type === "pool"
        && ((startEl.properties.poolType as string | undefined) ?? "black-box") === "white-box";
      run({ type: "RESIZE_ELEMENT", payload: { id, x, y, width, height, wasWhiteBoxAtResizeStart } });
    },
    resizeElementEnd: (id) => {
      if (resizing === id && staged) { past.push(staged); staged = null; resizing = null; }
      run({ type: "RESIZE_END", payload: { id } });
    },
    alignElements: (ids, mode) => commit({ type: "ALIGN_ELEMENTS", payload: { ids, mode } }),
  };

  const ui: AssistUi = {
    setSelectedElementIds: () => {},
    setSelectedConnectorId: () => {},
    setPickFlow: (f: PickFlow | null) => { if (f) screen.push("pick"); },
    setRenameFlow: (f) => { if (f) screen.push("rename"); },
    setMessageFlow: (f) => { if (f) screen.push("message"); },
    setGoldFlash: () => {},
  };

  return {
    get data() { return state; },
    actions,
    ui,
    screen,
    context: (opts = {}) => ({
      elements: state.elements,
      connectors: state.connectors,
      riskCatalog: [],
      actions,
      ui,
      refs: {
        voiceLastId: { current: null },
        pointerWorld: { current: opts.pointer ?? null },
        selectedIdsRef: { current: opts.selectedIds ?? [] },
        selectedConnectorIdRef: { current: opts.selectedConnectorId ?? null },
        nextStepRef: { current: { candidates: [], accept: () => {} } },
        // Where the window was asked to put the template is part of what the
        // command did, so L4 can see it: "template after <id>", "template here".
        openTemplateWindowRef: {
          current: (o) => {
            screen.push(o?.anchorId ? `template after ${o.anchorId}` : o?.at ? "template here" : "template");
            return "opened the template window";
          },
        },
        exportJsonRef: { current: () => { screen.push("export"); } },
      },
    }),
  };
}
