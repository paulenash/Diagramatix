/**
 * T4548-T4549 — where an EMIE's label starts out.
 *
 * Paul, 2026-09-19: "The default location for EMIE labels should be 1/2 the
 * initial default label length to the left of its current centrally placed
 * position, so it is clear of any outbound connector. This is on Manual
 * creation, Assist Creation and Abracadabra creation. If an EMIE is ever
 * manually placed on a vertical boundary then its label should be just above
 * the outgoing connector."
 * Paul, 2026-09-19 after testing: "EMIE label placement good except when placed
 * on top horizontal boundary. The label should be outside the parent to the top
 * left of the EMIE."
 *
 * All three creation paths mount through the reducer, so the rule lives in one
 * pure module and all three are driven here for real.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_LABEL_WIDTH, DEFAULT_LABEL_OFFSET_Y, LABEL_LINE_H, CONNECTOR_CLEARANCE,
  boundarySideOf, isVerticalBoundary, emieLabelOffset, emieMountProps,
} from "@/app/lib/diagram/emieLabel";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const HOST = { id: "h1", type: "task", label: "Check Stock", x: 200, y: 100, width: 120, height: 80, properties: {} } as unknown as DiagramElement;
const ev = (x: number, y: number, w = 36, h = 36): DiagramElement =>
  ({ id: "e1", type: "intermediate-event", label: "Timeout", x, y, width: w, height: h, properties: {} }) as unknown as DiagramElement;

/** An event centred on the given point of the host's rim. */
const onRim = (cx: number, cy: number) => ev(cx - 18, cy - 18);

const state = (elements: DiagramElement[]): DiagramData =>
  ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } }) as unknown as DiagramData;
const propsOf = (s: DiagramData, id: string) =>
  (s.elements.find((e) => e.id === id) as DiagramElement).properties as Record<string, unknown>;

describe("T4548 — the rule", () => {
  it("reads the side off the rim the event was dropped on", () => {
    expect(boundarySideOf(HOST, onRim(260, 100))).toBe("top");
    expect(boundarySideOf(HOST, onRim(260, 180))).toBe("bottom");
    expect(boundarySideOf(HOST, onRim(200, 140))).toBe("left");
    expect(boundarySideOf(HOST, onRim(320, 140))).toBe("right");
  });

  it("calls a corner a horizontal mount", () => {
    // Equidistant from a top and a side edge. Top/bottom is the ordinary mount
    // and the one a corner drop almost always means.
    expect(boundarySideOf(HOST, onRim(200, 100))).toBe("top");
    expect(isVerticalBoundary("top")).toBe(false);
    expect(isVerticalBoundary("left")).toBe(true);
    expect(isVerticalBoundary("right")).toBe(true);
  });

  it("moves a bottom label half a label-width left of centre", () => {
    // Paul's number: half the DEFAULT label length, which is the renderer's
    // `properties.labelWidth ?? 80`. Below a bottom mount is already outside
    // the host, so the sideways shift is the whole of it.
    expect(emieLabelOffset("bottom", 36, 36)).toEqual({
      labelOffsetX: -DEFAULT_LABEL_WIDTH / 2,
      labelOffsetY: DEFAULT_LABEL_OFFSET_Y,
    });
    expect(DEFAULT_LABEL_WIDTH / 2).toBe(40);
  });

  it("puts a TOP label outside the host, above and left of the event", () => {
    // Paul, after testing: the event straddles the host's top edge, so the
    // usual spot below the event is INSIDE the host, over its contents.
    const w = 36, h = 36;
    const e = onRim(260, 100);              // centred on the host's top edge
    const { labelOffsetX, labelOffsetY } = emieLabelOffset("top", w, h);

    const labelTop = e.y + h + labelOffsetY;
    const labelBottom = labelTop + LABEL_LINE_H;
    expect(labelBottom, "clear above the event's own top").toBeLessThanOrEqual(e.y - CONNECTOR_CLEARANCE);
    expect(labelBottom, "and therefore outside the host entirely").toBeLessThan(HOST.y);

    const labelRight = e.x + w / 2 + labelOffsetX + DEFAULT_LABEL_WIDTH / 2;
    expect(labelRight, "and left of the event, clear of the upward flow")
      .toBeLessThanOrEqual(e.x - CONNECTOR_CLEARANCE);
  });

  it("scales the top offsets to the event it is given", () => {
    for (const [w, h] of [[24, 24], [36, 36], [48, 40]] as const) {
      const { labelOffsetX, labelOffsetY } = emieLabelOffset("top", w, h);
      expect(h + labelOffsetY + LABEL_LINE_H, "label bottom, relative to the event top")
        .toBe(-CONNECTOR_CLEARANCE);
      expect(w / 2 + labelOffsetX + DEFAULT_LABEL_WIDTH / 2, "label right, relative to the event left")
        .toBe(-CONNECTOR_CLEARANCE);
    }
  });

  it("puts a vertical-boundary label just above the outgoing connector", () => {
    // The flow leaves horizontally from the event's vertical centre. The
    // renderer draws the label from `element.y + element.height + labelOffsetY`
    // downwards, so the label's BOTTOM must clear that line.
    const h = 36;
    const { labelOffsetY } = emieLabelOffset("right", 36, h);
    const e = onRim(320, 140);
    const labelTop = e.y + h + labelOffsetY;
    const labelBottom = labelTop + LABEL_LINE_H;
    const connectorY = e.y + h / 2;
    expect(labelBottom, "clear of the line, not on it").toBeLessThan(connectorY);
    expect(connectorY - labelBottom, "and only just above it").toBe(CONNECTOR_CLEARANCE);
  });

  it("puts it on the side the connector travels", () => {
    // A right-edge mount sends its flow right, so the label extends right over
    // that line; a left-edge mount, left.
    expect(emieLabelOffset("right", 36, 36).labelOffsetX).toBe(DEFAULT_LABEL_WIDTH / 2);
    expect(emieLabelOffset("left", 36, 36).labelOffsetX).toBe(-DEFAULT_LABEL_WIDTH / 2);
  });

  it("scales the clearance to the event it is given", () => {
    // Not every boundary event is 36px — a resized one must still clear.
    for (const h of [24, 36, 48]) {
      const { labelOffsetY } = emieLabelOffset("left", 36, h);
      expect(h + labelOffsetY + LABEL_LINE_H).toBe(h / 2 - CONNECTOR_CLEARANCE);
    }
  });

  it("reports the side alongside the offsets", () => {
    expect(emieMountProps(HOST, onRim(320, 140))).toEqual({
      boundarySide: "right",
      labelOffsetX: 40,
      labelOffsetY: -(36 / 2 + LABEL_LINE_H + CONNECTOR_CLEARANCE),
    });
  });
});

describe("T4549 — all three creation paths get it", () => {
  it("manual: a palette drop that snaps to a host rim", () => {
    // ADD_ELEMENT takes a symbol + the drop POSITION (the element's top-left).
    const out = reducer(state([HOST]), {
      type: "ADD_ELEMENT",
      payload: { symbolType: "intermediate-event", position: { x: 242, y: 84 }, id: "dropped" },
    } as unknown as Action);
    const p = propsOf(out, "dropped");
    expect(p.boundarySide, "dropped on the top edge").toBe("top");
    expect(p.labelOffsetX, "up and to the left, outside the host").toBe(-(40 + 18 + CONNECTOR_CLEARANCE));
    expect(p.labelOffsetY).toBe(-(36 + LABEL_LINE_H + CONNECTOR_CLEARANCE));
  });

  it("manual: dragged onto a rim and released", () => {
    const loose = { ...onRim(322, 140), id: "dragged" } as DiagramElement;
    const out = reducer(state([HOST, loose]), {
      type: "MOVE_END",
      payload: { id: "dragged" },
    } as unknown as Action);
    const p = propsOf(out, "dragged");
    expect(p.boundarySide, "released on the right edge").toBe("right");
    expect(p.labelOffsetX, "above the line it travels along").toBe(40);
    expect(p.labelOffsetY).toBe(-(36 / 2 + LABEL_LINE_H + CONNECTOR_CLEARANCE));
  });

  it("assist / Abracadabra: the addBoundary op's setEventBoundary", () => {
    // "add a boundary event called Timeout to Check Stock" ends in this action.
    const loose = { ...ev(258, 60), id: "spoken" } as DiagramElement;
    const out = reducer(state([HOST, loose]), {
      type: "SET_EVENT_BOUNDARY",
      payload: { id: "spoken", hostId: "h1" },
    } as unknown as Action);
    const p = propsOf(out, "spoken");
    expect(p.boundarySide).toBe("top");
    expect(p.labelOffsetX).toBe(-(40 + 18 + CONNECTOR_CLEARANCE));
  });

  it("leaves an event that snapped to nothing alone", () => {
    // Far from any host: it is not an EMIE, so it keeps the ordinary centred
    // label every other event has.
    const out = reducer(state([HOST]), {
      type: "ADD_ELEMENT",
      payload: { symbolType: "intermediate-event", position: { x: 900, y: 900 }, id: "loner" },
    } as unknown as Action);
    const p = propsOf(out, "loner");
    expect(p.labelOffsetX).toBeUndefined();
    expect(p.boundarySide).toBeUndefined();
  });

  it("re-mounting onto a different edge re-places the label", () => {
    // Otherwise a left-edge offset would survive a move to the top, where it
    // means something else entirely.
    const first = reducer(state([HOST, { ...onRim(200, 140), id: "e1" } as DiagramElement]), {
      type: "SET_EVENT_BOUNDARY", payload: { id: "e1", hostId: "h1" },
    } as unknown as Action);
    expect(propsOf(first, "e1").boundarySide).toBe("left");

    const moved = first.elements.map((e) => (e.id === "e1" ? { ...e, x: 242, y: 82 } : e));
    const second = reducer(state(moved as DiagramElement[]), {
      type: "SET_EVENT_BOUNDARY", payload: { id: "e1", hostId: "h1" },
    } as unknown as Action);
    const p = propsOf(second, "e1");
    expect(p.boundarySide).toBe("top");
    expect(p.labelOffsetY, "re-placed for a top mount, not left on the side rule")
      .toBe(-(36 + LABEL_LINE_H + CONNECTOR_CLEARANCE));
  });
});
