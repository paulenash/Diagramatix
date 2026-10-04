/**
 * Runs the Voice Assist session (Stage 4 of mobile voice) the way the desktop
 * editor runs it — real React (react-test-renderer), the real useDiagram, and
 * the editor's own glue lines for the refs the session reads — so its
 * behaviour is pinned BEFORE it moves out of DiagramEditor.tsx and checked,
 * unchanged, after.
 *
 * What is not the editor's: the recogniser (fakeDictation.ts), `fetch`
 * (scripted per test), `window` (an EventTarget with a localStorage), the
 * template window and "export JSON" (recorders), and addElementGated (the
 * plain add — the element limit is the editor's, not the session's).
 */
import { createElement, useRef, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { vi } from "vitest";
import { useDiagram } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";
import { loadVoiceSession } from "./loadVoiceSession";
import type { VoiceSession } from "./voiceSessionTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── the console guard ───────────────────────────────────────────────────────
// react-test-renderer says it is deprecated on every create() — noise, dropped.
// React's "An update to … was not wrapped in act(…)" means a test read a render
// that had not settled: recorded, and failed by every file's afterEach through
// failOnActWarnings(). The list lives on globalThis, so a second copy of this
// module in the same process shares it rather than wrapping console twice.
const GUARD = Symbol.for("diagramatix.voiceSession.consoleGuard");
const guardState = ((globalThis as Record<symbol, unknown>)[GUARD] ??= { actWarnings: [] as string[] }) as { actWarnings: string[] };
if (!(console.error as { [GUARD]?: true })[GUARD]) {
  const original = console.error;
  const guarded = Object.assign((...args: unknown[]) => {
    const text = args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : String(a))).join(" ");
    if (text.includes("react-test-renderer is deprecated")) return;
    if (text.includes("not wrapped in act")) guardState.actWarnings.push(text);
    original.apply(console, args as []);
  }, { [GUARD]: true as const });
  console.error = guarded;
}

/** For every file's afterEach: throws if React warned of an update outside act since the last check (and clears the record). */
export function failOnActWarnings() {
  const seen = guardState.actWarnings.splice(0);
  if (seen.length) throw new Error(`React warned of ${seen.length} update(s) not wrapped in act:\n${seen.join("\n---\n")}`);
}

// ── mounted sessions, for afterEach ─────────────────────────────────────────
const live: Mounted[] = [];

/**
 * Unmount every session still mounted, newest first — for every file's
 * afterEach, BEFORE vi.unstubAllGlobals()/useRealTimers (the unmount runs the
 * session's cleanups, which read the stubbed `window` and stop the fake mic).
 * A session a test already unmounted is skipped.
 */
export async function unmountAll() {
  const errors: unknown[] = [];
  while (live.length) {
    const m = live[live.length - 1];
    try { await m.unmount(); } catch (e) { errors.push(e); }
    const i = live.indexOf(m);
    if (i >= 0) live.splice(i, 1);
  }
  if (errors.length) throw errors[0];
}

/** The useDiagram edit actions the session reads, by the editor's names. */
export const SESSION_ACTIONS = [
  "addConnector", "addLaneAt", "addPool", "alignElements", "clearDiagram", "compressLane", "compressPool",
  "convertTaskSubprocess", "deleteConnector", "deleteElement", "elementsMoveEnd", "expandLane", "extendPools",
  "insertSpace", "laneBoundaryMoveEnd", "moveElements", "moveLane", "moveLaneBoundary", "movePoolTo", "removeSpace",
  "resizeElement", "resizeElementEnd", "setEventBoundary", "splitLaneEven", "splitPoolEven", "swapLane", "swapPools",
  "undo", "unwrapSubprocess", "updateConnectorEndpoint", "updateConnectorLabel", "updateLabel", "updateProperties",
  "wrapInContainer", "wrapInPool", "wrapInSubprocess",
] as const;

export interface Mounted {
  /** The latest render: the diagram, the session, the selection. */
  readonly d: ReturnType<typeof useDiagram>;
  readonly session: VoiceSession;
  readonly data: DiagramData;
  readonly log: VoiceSession["voiceLog"];
  readonly lastLine: VoiceSession["voiceLog"][number] | undefined;
  /** What the recorders saw. */
  templateWindowOpens: { anchorId?: string; at?: { x: number; y: number } }[];
  exports: number;
  labelEdits: string[];
  /** Run something inside React's act, then let effects and microtasks settle. */
  act(fn: () => unknown): Promise<void>;
  /** A command as if typed into the bar (the bar calls runVoiceCommand directly). */
  typed(text: string): Promise<void>;
  /** Re-render with other props (a new diagram id). */
  rerender(p: { diagramId?: string }): Promise<void>;
  /** Unmount (once — a second call does nothing). unmountAll() does it for any test that did not. */
  unmount(): Promise<void>;
  select(ids: string[]): Promise<void>;
  /** What is selected right now: the elements, and the one connector (or null). */
  selection(): { ids: string[]; connector: string | null };
  /** Select one connector, as the mouse would. */
  selectConnector(id: string | null): Promise<void>;
}

export async function mountSession(opts: {
  initial?: DiagramData;
  diagramId?: string;
  templateWindowReply?: string;
  /** Extra host props (spoken replies: speakReply / isMicGated / stopSpeech) — added to what the editor hands the session. */
  host?: Record<string, unknown>;
} = {}): Promise<Mounted> {
  const { useVoiceSession } = await loadVoiceSession();
  const initial: DiagramData = opts.initial ?? { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData;
  const seen: {
    d?: ReturnType<typeof useDiagram>; session?: VoiceSession; select?: (ids: Set<string>) => void;
    selectConnector?: (id: string | null) => void; selection?: () => { ids: string[]; connector: string | null };
  } = {};
  const rec = { templateWindowOpens: [] as Mounted["templateWindowOpens"], exports: 0, labelEdits: [] as string[] };

  function Harness(props: { diagramId: string }) {
    const d = useDiagram(initial);
    const { data } = d;
    // ── the editor's glue, line for line (DiagramEditor.tsx) ──
    const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());
    const selectedIdsRef = useRef<string[]>([]);
    selectedIdsRef.current = [...selectedElementIds];
    const elementsRef = useRef(data.elements);
    elementsRef.current = data.elements;
    const connectorsRef = useRef(data.connectors);
    connectorsRef.current = data.connectors;
    const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
    const selectedConnectorIdRef = useRef<string | null>(null);
    selectedConnectorIdRef.current = selectedConnectorId;
    const nextStepRef = useRef<{ candidates: never[]; accept: (c: never) => void }>({ candidates: [], accept: () => {} });
    const openTemplateWindowRef = useRef<(o?: { anchorId?: string; at?: { x: number; y: number } }) => string>((o) => {
      rec.templateWindowOpens.push(o ?? {});
      return opts.templateWindowReply ?? "templates — say a number";
    });
    const actions = Object.fromEntries(SESSION_ACTIONS.map((n) => {
      const fn = (d as unknown as Record<string, unknown>)[n];
      if (typeof fn !== "function") throw new Error(`useDiagram has no ${n}`);
      return [n, fn];
    }));
    const session = useVoiceSession({
      ...actions,
      addElementGated: d.addElement,
      data, diagramId: props.diagramId, diagramName: "Test diagram", diagramType: "bpmn",
      diagramColorConfig: {}, displayMode: "normal", riskCatalog: [],
      elementsRef, connectorsRef, selectedIdsRef, selectedConnectorIdRef, nextStepRef, openTemplateWindowRef,
      setSelectedElementIds, setSelectedConnectorId,
      beginLabelEdit: (id: string) => { rec.labelEdits.push(id); d.beginLabelEdit(id); },
      cancelLabelEdit: d.cancelLabelEdit,
      beginHistoryGroup: d.beginHistoryGroup, endHistoryGroup: d.endHistoryGroup,
      handleExportJson: () => { rec.exports++; },
      ...(opts.host ?? {}),
    } as Parameters<typeof useVoiceSession>[0]);
    seen.d = d;
    seen.session = session;
    seen.select = setSelectedElementIds;
    seen.selectConnector = setSelectedConnectorId;
    seen.selection = () => ({ ids: [...selectedIdsRef.current], connector: selectedConnectorIdRef.current });
    return null;
  }

  let root!: ReactTestRenderer;
  let diagramId = opts.diagramId ?? "diagram-1";
  await act(async () => { root = create(createElement(Harness, { diagramId })); });

  const settle = async () => {
    // effects scheduled by the last render, then any microtask they queued
    for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
  };
  const m: Mounted = {
    get d() { return seen.d!; },
    get session() { return seen.session!; },
    get data() { return seen.d!.data; },
    get log() { return seen.session!.voiceLog; },
    get lastLine() { const l = seen.session!.voiceLog; return l[l.length - 1]; },
    get templateWindowOpens() { return rec.templateWindowOpens; },
    get exports() { return rec.exports; },
    get labelEdits() { return rec.labelEdits; },
    async act(fn) { await act(async () => { await fn(); }); await settle(); },
    async typed(text) { await m.act(() => seen.session!.runVoiceCommand(text)); },
    async rerender(p) {
      if (p.diagramId) diagramId = p.diagramId;
      await act(async () => { root.update(createElement(Harness, { diagramId })); });
      await settle();
    },
    async unmount() {
      const i = live.indexOf(m);
      if (i < 0) return;
      live.splice(i, 1);
      await act(async () => { root.unmount(); });
    },
    async select(ids) { await m.act(() => seen.select!(new Set(ids))); },
    selection() { return seen.selection!(); },
    async selectConnector(id) { await m.act(() => seen.selectConnector!(id)); },
  };
  live.push(m);
  await settle();
  return m;
}

// ── shared world stubs ──────────────────────────────────────────────────────

/** A scripted `fetch`: each call is recorded; the route decides the reply. */
export function stubFetch(route: (url: string, body: unknown) => unknown | Promise<unknown>) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), body });
    const reply = await route(String(url), body);
    if (reply instanceof Response) return reply;
    return new Response(JSON.stringify(reply ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchFn);
  return calls;
}

/**
 * A `window` for the session's Escape listener and the debug toggles, with a working localStorage.
 *
 * Node's EventTarget reads a boolean third argument (capture) in
 * addEventListener but NOT in removeEventListener, so useDiagram's
 * `removeEventListener("mousedown", down, true)` removed nothing and every
 * unmounted session's capture listeners stayed on the window. A browser reads
 * both; so does this stub, by turning the boolean into `{ capture }`.
 */
export function stubWindow() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  const target = new EventTarget();
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  type Opts = boolean | AddEventListenerOptions | EventListenerOptions | undefined;
  const asOptions = (o: Opts) => (typeof o === "boolean" ? { capture: o } : o);
  target.addEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, o?: Opts) => add(type, listener, asOptions(o));
  target.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, o?: Opts) => remove(type, listener, asOptions(o));
  const win = Object.assign(target, { localStorage, location: { href: "http://test/", origin: "http://test" } });
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", localStorage);
  return { window: win, localStorage, pressEscape: () => win.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" })) };
}

/** A small BPMN diagram: one pool with one lane, three tasks in a row. */
export function threeTasks(): DiagramData {
  const pool: DiagramElement = { id: "pool1", type: "pool", x: 0, y: 0, width: 900, height: 250, label: "Company", properties: { poolType: "white-box" } } as unknown as DiagramElement;
  const lane: DiagramElement = { id: "lane1", type: "lane", x: 30, y: 0, width: 870, height: 250, label: "Clerk", parentId: "pool1", properties: {} } as unknown as DiagramElement;
  const t = (id: string, label: string, x: number): DiagramElement =>
    ({ id, type: "task", x, y: 90, width: 120, height: 70, label, parentId: "lane1", properties: { taskType: "user" } } as unknown as DiagramElement);
  const conn = (id: string, s: string, tg: string): Connector =>
    ({ id, type: "sequence", sourceId: s, targetId: tg, sourceSide: "right", targetSide: "left", waypoints: [], directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false } as unknown as Connector);
  return {
    elements: [pool, lane, t("t1", "Receive order", 100), t("t2", "Check invoice", 320), t("t3", "Pay supplier", 540)],
    connectors: [conn("c1", "t1", "t2"), conn("c2", "t2", "t3")],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as DiagramData;
}
