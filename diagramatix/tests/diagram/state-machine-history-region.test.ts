/**
 * State-machine scan rules: history states (B44 placement / no-incoming, B45 the
 * UML one-per-kind-per-region limit) and composite-state regions (B46 each region
 * needs an entry + exit).
 */
import { describe, it, expect } from "vitest";
import {
  checkHistoryStatePlacement, checkHistoryStateUmlLimit, checkRegionEntryExit,
} from "@/app/lib/diagram/checks/diagramChecks";
import { reducer } from "@/app/hooks/useDiagram";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 40, height: 40, properties: {}, ...extra });
const tr = (id: string, s: string, t: string): Connector =>
  ({ id, type: "transition", sourceId: s, targetId: t, waypoints: [] } as unknown as Connector);

// A composite state at (0,0) 400x300 (header 28), one region.
const comp = (extra: Partial<DiagramElement> = {}): DiagramElement =>
  el("comp", "composite-state", { x: 0, y: 0, width: 400, height: 300, ...extra });

describe("B44 — history state placement + no incoming", () => {
  it("flags a history state that is not inside a composite state", () => {
    const data = { elements: [el("h", "history-state")], connectors: [] }; // no parent
    expect(checkHistoryStatePlacement(data).some((v) => v.ids.includes("h") && v.rule === "history-in-composite")).toBe(true);
  });
  it("accepts a history state inside a composite state", () => {
    const data = { elements: [comp(), el("h", "history-state", { parentId: "comp", x: 40, y: 40 })], connectors: [] };
    expect(checkHistoryStatePlacement(data)).toHaveLength(0);
  });
  it("flags an incoming transition onto a history state", () => {
    const data = {
      elements: [comp(), el("h", "history-state", { parentId: "comp", x: 40, y: 40 }), el("s", "state", { parentId: "comp", x: 200, y: 40 })],
      connectors: [tr("t1", "s", "h")],
    };
    expect(checkHistoryStatePlacement(data).some((v) => v.rule === "history-no-incoming")).toBe(true);
  });
});

describe("B45 — UML history limit (one H + one H* per region)", () => {
  it("flags two shallow history states in the same region", () => {
    const data = {
      elements: [comp(), el("h1", "history-state", { parentId: "comp", x: 40, y: 40 }), el("h2", "history-state", { parentId: "comp", x: 200, y: 40 })],
      connectors: [],
    };
    expect(checkHistoryStateUmlLimit(data).some((v) => v.rule === "history-uml-limit")).toBe(true);
  });
  it("allows one shallow + one deep in the same region", () => {
    const data = {
      elements: [comp(), el("h", "history-state", { parentId: "comp", x: 40, y: 40 }), el("hd", "deep-history-state", { parentId: "comp", x: 200, y: 40 })],
      connectors: [],
    };
    expect(checkHistoryStateUmlLimit(data)).toHaveLength(0);
  });
  it("allows one H per region across a 2-region composite (horizontal split at y frac 0.5)", () => {
    // bodyTop=28, bodyH=272 → divider at y=28+0.5*272=164. Region 0 above, 1 below.
    const c = comp({ properties: { regionCount: 2, regionOrientation: "horizontal" } });
    const data = {
      elements: [c, el("h0", "history-state", { parentId: "comp", x: 40, y: 40 }), el("h1", "history-state", { parentId: "comp", x: 40, y: 220 })],
      connectors: [],
    };
    expect(checkHistoryStateUmlLimit(data)).toHaveLength(0); // different regions
  });
});

describe("a transition leaving a history state is unlabelled on creation", () => {
  const add = (srcType: string): DiagramData => reducer(
    { elements: [el("src", srcType), el("s", "state")], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData,
    { type: "ADD_CONNECTOR", payload: { sourceId: "src", targetId: "s", connectorType: "transition", directionType: "directed", routingType: "curvilinear", sourceSide: "right", targetSide: "left" } } as never,
  );
  it("history → state: blank label", () => {
    expect(add("history-state").connectors[0].label).toBe("");
  });
  it("deep-history → state: blank label", () => {
    expect(add("deep-history-state").connectors[0].label).toBe("");
  });
  it("a plain state → state transition still gets a default label", () => {
    expect(add("state").connectors[0].label).not.toBe("");
  });
});

describe("B46 — each region needs an entry + exit", () => {
  it("flags a composite region missing an initial/history state or a final state", () => {
    const data = { elements: [comp(), el("s", "state", { parentId: "comp", x: 40, y: 40 })], connectors: [] };
    const v = checkRegionEntryExit(data);
    expect(v.some((x) => x.ids.includes("comp"))).toBe(true);
  });
  it("does not flag a region that has both an initial/history entry and a final exit", () => {
    const data = {
      elements: [
        comp(),
        el("i", "initial-state", { parentId: "comp", x: 40, y: 40 }),
        el("f", "final-state", { parentId: "comp", x: 300, y: 40 }),
      ],
      connectors: [],
    };
    expect(checkRegionEntryExit(data)).toHaveLength(0);
  });
});
