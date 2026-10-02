/**
 * One stand-in per KIND of thing that can be selected or pointed at — for the Voice Assist Help tile's
 * "Element selected" and "Cursor over" lists. Paul, 2026-10-02: "Rather than dropping down a list of actual
 * elements from a test diagram, replace with a list of names, one per type of element that can be selected or
 * hovered over: Black-box Pool, White-box Pool, Lane, Sublane, Task, Subprocess, Expanded Subprocess, Boundary
 * Intermediate Event, In-line Intermediate Event, Gateway, Sequence Connector, Message Connector, Association …"
 *
 * The test diagram (commandFixture.ts) is Paul's own and has most kinds but not all — no sub-lane, expanded
 * subprocess, intermediate event, data object or store, annotation, group or association. So `standInDiagram`
 * is that diagram PLUS a "Kinds Sample Pool" holding one of each missing kind. Nothing is invented for a kind
 * the fixture already has; the first of its kind is used.
 *
 * A kind that can be POINTED at has a point where the pointer really finds it: a pool's name strip, a lane's
 * left margin and an expanded subprocess's empty corner are not covered by what they hold, so the same rule the
 * editor uses (`elementUnderPointer`) resolves them. A connector kind has a point on its line, found by
 * `hoverConnectorAt` (connectors and their labels are hover targets too since 2026-10-02).
 *
 * Pure.
 */
import type { Connector, DiagramData, DiagramElement } from "../../diagram/types";
import { fixtureDiagram } from "../commandFixture";
import { sizeOf } from "../../diagram/assistPlacement";
import { elementUnderPointer } from "../pointerRef";

export interface StandInKind {
  id: string;
  label: string;
  /** The editor's pointer can find it (elements); a connector can only be selected. */
  hover: boolean;
}

export const STAND_IN_KINDS: readonly StandInKind[] = [
  { id: "black-box-pool", label: "Black-box Pool", hover: true },
  { id: "white-box-pool", label: "White-box Pool", hover: true },
  { id: "lane", label: "Lane", hover: true },
  { id: "sublane", label: "Sublane", hover: true },
  { id: "task", label: "Task", hover: true },
  { id: "subprocess", label: "Subprocess (collapsed)", hover: true },
  { id: "expanded-subprocess", label: "Expanded Subprocess", hover: true },
  { id: "step-in-ep", label: "Task inside an Expanded Subprocess", hover: true },
  { id: "start-event", label: "Start Event", hover: true },
  { id: "end-event", label: "End Event", hover: true },
  { id: "inline-event", label: "In-line Intermediate Event", hover: true },
  { id: "boundary-event", label: "Boundary Intermediate Event", hover: true },
  { id: "gateway", label: "Gateway", hover: true },
  { id: "data-object", label: "Data Object", hover: true },
  { id: "data-store", label: "Data Store", hover: true },
  { id: "text-annotation", label: "Text Annotation", hover: true },
  { id: "group", label: "Group", hover: true },
  { id: "sequence-connector", label: "Sequence Connector", hover: true },
  { id: "message-connector", label: "Message Connector", hover: true },
  { id: "association", label: "Association", hover: true },
];

export interface StandIns {
  diagram: DiagramData;
  /** The element standing for a kind, if it is an element. */
  elementOf(kindId: string): DiagramElement | undefined;
  /** The connector standing for a kind, if it is a connector. */
  connectorOf(kindId: string): Connector | undefined;
  /** Where the pointer rests to be "over" the kind (for a connector: on its longest stretch of line). */
  pointOf(kindId: string): { x: number; y: number } | null;
}

const flow = (id: string, sourceId: string, targetId: string, type = "sequence", waypoints: Array<{ x: number; y: number }> = []): Connector => ({
  id, sourceId, targetId, sourceSide: "right", targetSide: "left",
  type, directionType: type === "associationBPMN" ? "non-directed" : "directed", routingType: "rectilinear",
  sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints,
  sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
}) as unknown as Connector;

const box = (id: string, type: string, x: number, y: number, w: number, h: number, label: string, parentId?: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: {}, ...(parentId ? { parentId } : {}), ...extra }) as DiagramElement;

export function standInDiagram(): StandIns {
  const base = fixtureDiagram();
  const els: DiagramElement[] = [...base.elements];
  const cons: Connector[] = [...base.connectors];

  // ── the Kinds Sample Pool: one of each kind the test diagram lacks ──
  const white = base.elements.find((e) => e.type === "pool" && (e.properties as { poolType?: string })?.poolType === "white-box");
  const px = white ? white.x : 60;
  const py = Math.max(...base.elements.map((e) => e.y + e.height)) + 140;
  const poolW = 1000, laneW = poolW - 30, subX = px + 60, subW = poolW - 60;
  const pool = box("ki-pool", "pool", px, py, poolW, 440, "Kinds Sample Pool", undefined, { properties: { poolType: "white-box" } });
  const lane = box("ki-lane", "lane", px + 30, py, laneW, 440, "Sample Lane", "ki-pool");
  const subA = box("ki-sub-a", "lane", subX, py, subW, 210, "Sample Sublane", "ki-lane");
  const subB = box("ki-sub-b", "lane", subX, py + 210, subW, 230, "Second Sublane", "ki-lane");
  els.push(pool, lane, subA, subB);

  const tk = sizeOf("task"), ev = sizeOf("intermediate-event");
  const host = box("ki-host", "task", px + 110, py + 70, tk.w, tk.h, "Sample Activity", "ki-sub-a");
  const boundary = box("ki-boundary", "intermediate-event", host.x + host.width - 36 - ev.w / 2, host.y + host.height - ev.h / 2, ev.w, ev.h, "Sample Timer", "ki-sub-a",
    { eventType: "timer", boundaryHostId: "ki-host" } as Partial<DiagramElement>);
  const inline = box("ki-inline", "intermediate-event", px + 300, py + 150, ev.w, ev.h, "Sample Inline Event", "ki-sub-a", { eventType: "message" } as Partial<DiagramElement>);
  const dobj = sizeOf("data-object"), dstore = sizeOf("data-store"), note = sizeOf("text-annotation"), grp = sizeOf("group");
  const dataObject = box("ki-dobj", "data-object", px + 420, py + 60, dobj.w, dobj.h, "Sample Data Object", "ki-sub-a");
  const dataStore = box("ki-dstore", "data-store", px + 540, py + 60, dstore.w, dstore.h, "Sample Data Store", "ki-sub-a");
  const annotation = box("ki-note", "text-annotation", px + 660, py + 60, note.w, note.h, "Sample note", "ki-sub-a");
  const group = box("ki-group", "group", px + 800, py + 30, Math.min(grp.w, 150), Math.min(grp.h, 150), "Sample Group", "ki-sub-a");
  els.push(host, boundary, inline, dataObject, dataStore, annotation, group);
  // A straight run from one shape's right edge to the next one's left (the sample connectors' routes).
  const run = (a: DiagramElement, b: DiagramElement) => [{ x: a.x + a.width, y: a.y + a.height / 2 }, { x: b.x, y: b.y + b.height / 2 }];
  cons.push(flow("ki-assoc", "ki-host", "ki-dobj", "associationBPMN", run(host, dataObject)));

  // An expanded subprocess in the second sublane, with a Start → task → End inside it (unnamed events).
  const ep = box("ki-ep", "subprocess-expanded", px + 100, py + 230, 380, 190, "Sample Expanded Subprocess", "ki-sub-b");
  const evs = sizeOf("start-event");
  const rowY = ep.y + 36 + (ep.height - 60) / 2;
  const epStart = box("ki-ep-start", "start-event", ep.x + 24, rowY - evs.h / 2, evs.w, evs.h, "", "ki-ep");
  const epTask = box("ki-ep-task", "task", ep.x + 24 + evs.w + 30, rowY - tk.h / 2, tk.w, tk.h, "Sample Step", "ki-ep");
  const epEnd = box("ki-ep-end", "end-event", epTask.x + epTask.width + 30, rowY - evs.h / 2, evs.w, evs.h, "", "ki-ep");
  els.push(ep, epStart, epTask, epEnd);
  cons.push(flow("ki-ep-f1", "ki-ep-start", "ki-ep-task", "sequence", run(epStart, epTask)), flow("ki-ep-f2", "ki-ep-task", "ki-ep-end", "sequence", run(epTask, epEnd)));

  const diagram = { ...base, elements: els, connectors: cons } as DiagramData;

  // ── which one stands for each kind ──
  const first = (pred: (e: DiagramElement) => boolean) => els.find(pred);
  const poolType = (e: DiagramElement) => (e.properties as { poolType?: string } | undefined)?.poolType;
  const el: Record<string, DiagramElement | undefined> = {
    "black-box-pool": first((e) => e.type === "pool" && poolType(e) === "black-box"),
    "white-box-pool": first((e) => e.type === "pool" && poolType(e) === "white-box" && e.id !== "ki-pool"),
    lane: first((e) => e.type === "lane" && !e.id.startsWith("ki-") && !els.some((p) => p.id === e.parentId && p.type === "lane")),
    sublane: subA,
    task: first((e) => e.type === "task" && !e.id.startsWith("ki-")),
    subprocess: first((e) => e.type === "subprocess"),
    "expanded-subprocess": ep,
    "step-in-ep": epTask,
    "start-event": first((e) => e.type === "start-event" && !e.id.startsWith("ki-")),
    "end-event": first((e) => e.type === "end-event" && !e.id.startsWith("ki-")),
    "inline-event": first((e) => e.type === "intermediate-event" && !e.boundaryHostId && !e.id.startsWith("ki-")) ?? inline,
    "boundary-event": first((e) => e.type === "intermediate-event" && !!e.boundaryHostId && !e.id.startsWith("ki-")) ?? boundary,
    gateway: first((e) => e.type === "gateway"),
    "data-object": first((e) => e.type === "data-object" && !e.id.startsWith("ki-")) ?? dataObject,
    "data-store": first((e) => e.type === "data-store" && !e.id.startsWith("ki-")) ?? dataStore,
    "text-annotation": first((e) => e.type === "text-annotation" && !e.id.startsWith("ki-")) ?? annotation,
    group: first((e) => e.type === "group" && !e.id.startsWith("ki-")) ?? group,
  };
  // A spot on a connector's line with NO element in front of it — the pointer finds a connector only there. A
  // route's stored points run on inside the shapes at its ends, so scan the straight stretches, longest first.
  const clearPoint = (c: Connector): { x: number; y: number } | null => {
    const w = c.waypoints ?? [];
    const stretches = w.slice(1).map((q, i) => ({ a: w[i], b: q, len: Math.hypot(q.x - w[i].x, q.y - w[i].y) })).sort((s, t) => t.len - s.len);
    for (const s of stretches) {
      for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]) {
        const p = { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f };
        if (!elementUnderPointer(p, els)) return p;
      }
    }
    return null;
  };
  const con: Record<string, Connector | undefined> = {
    "sequence-connector": cons.find((c) => c.type === "sequence" && !c.id.startsWith("ki-") && clearPoint(c)),
    "message-connector": cons.find((c) => c.type === "messageBPMN" && clearPoint(c)),
    association: cons.find((c) => c.type === "associationBPMN" && clearPoint(c)),
  };

  // Where the pointer rests. A container's centre is covered by what it holds, so those use a bare spot.
  const bare = (e: DiagramElement, kind: string): { x: number; y: number } => {
    if (kind === "white-box-pool") return { x: e.x + 10, y: e.y + e.height / 2 };            // the name strip, left of the lanes
    if (kind === "lane" || kind === "sublane") return { x: e.x + 12, y: e.y + e.height / 2 };  // the left margin
    if (kind === "expanded-subprocess") return { x: e.x + e.width - 10, y: e.y + e.height - 10 }; // the empty corner
    return { x: e.x + e.width / 2, y: e.y + e.height / 2 };
  };

  return {
    diagram,
    elementOf: (k) => el[k],
    connectorOf: (k) => con[k],
    pointOf: (k) => {
      const e = el[k];
      if (e) return bare(e, k);
      const c = con[k];
      return c ? clearPoint(c) : null;
    },
  };
}
