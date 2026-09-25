/**
 * T4615-T4617 — the merge gateway connection convention.
 *
 * Paul, 21 September 2026: "Connections to Merge Gateways should follow the
 * connection convention for connecting to a Merge Gateway. Elements above
 * connect to the top gateway vertex, elements that horizontally overlap with
 * the middle left vertex, and elements below to the bottom vertex."
 *
 * A merge gathers branches back together, so it reads as a funnel. With
 * nothing choosing, every incoming flow landed on the same vertex and the
 * lines crossed each other to reach it.
 *
 * THE REDUCER IS DRIVEN HERE, NOT JUST THE PURE RULE — and that is the point
 * of this file. The first version of the wiring asked `!action.payload
 * .targetSide` to mean "the caller did not choose a side", but `addConnector`
 * DEFAULTS `targetSide` to "left", so the payload always carries a value and
 * the rule would have shipped dead while its unit tests all passed.
 */
import { describe, it, expect } from "vitest";
import {
  bandOf, mergeTargetSide, decisionSourceSide, facingSide, isMergeGateway,
} from "@/app/lib/diagram/gatewaySides";
import { reducer } from "@/app/hooks/useDiagram";
import type { DiagramElement, DiagramData, Connector } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x, y, width: 100, height: 60, properties: {}, ...extra });

/** A merge gateway at (400, 200), 50×50 — so its band is y 200–250. */
const merge = el("g", "gateway", 400, 200, { width: 50, height: 50, properties: { gatewayRole: "merge" } });

const state = (elements: DiagramElement[]): DiagramData =>
  ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } }) as unknown as DiagramData;

const connect = (
  elements: DiagramElement[], sourceId: string, targetId: string,
  over: Partial<{ sourceSide: string; targetSide: string }> = {},
): Connector => {
  const out = reducer(state(elements), {
    type: "ADD_CONNECTOR",
    payload: {
      sourceId, targetId, connectorType: "sequence", directionType: "directed",
      routingType: "rectilinear", sourceSide: "right", targetSide: "left", ...over,
    },
  } as never);
  return out.connectors[out.connectors.length - 1];
};

describe("T4615 — the rule itself", () => {
  it("reads the band the way the fan-out rule already did", () => {
    expect(bandOf(el("a", "task", 0, 0), merge), "bottom edge 60 ≤ gateway top 200").toBe("above");
    expect(bandOf(el("a", "task", 0, 400), merge), "top 400 ≥ gateway bottom 250").toBe("below");
    expect(bandOf(el("a", "task", 0, 210), merge), "overlaps the gateway's band").toBe("level");
    // Touching exactly counts as clear of it — the same boundary the decision
    // fan-out uses, so a merge and a decision never disagree.
    expect(bandOf(el("a", "task", 0, 140), merge), "bottom 200 == gateway top").toBe("above");
  });

  it("sends above → top, level → left, below → bottom", () => {
    expect(mergeTargetSide(el("a", "task", 0, 0), merge)).toBe("top");
    expect(mergeTargetSide(el("a", "task", 0, 210), merge)).toBe("left");
    expect(mergeTargetSide(el("a", "task", 0, 400), merge)).toBe("bottom");
  });

  it("is the mirror of the decision rule, which differs only in the level case", () => {
    for (const y of [0, 210, 400]) {
      const other = el("a", "task", 0, y);
      const m = mergeTargetSide(other, merge);
      const d = decisionSourceSide(other, merge);
      if (bandOf(other, merge) === "level") expect([m, d]).toEqual(["left", "right"]);
      else expect(m, `y=${y}`).toBe(d);
    }
  });

  it("faces the other end towards the gateway", () => {
    expect(facingSide("above", "right"), "it is above, so it leaves downward").toBe("bottom");
    expect(facingSide("below", "right")).toBe("top");
    expect(facingSide("level", "right")).toBe("right");
  });

  it("applies to a MERGE only — the role defaults to decision", () => {
    expect(isMergeGateway(merge)).toBe(true);
    expect(isMergeGateway(el("g", "gateway", 0, 0)), "no role = decision").toBe(false);
    expect(isMergeGateway(el("g", "gateway", 0, 0, { properties: { gatewayRole: "decision" } }))).toBe(false);
    expect(isMergeGateway(el("t", "task", 0, 0))).toBe(false);
  });
});

describe("T4616 — driven through the real reducer", () => {
  it("puts a branch from ABOVE on the top vertex", () => {
    const above = el("a", "task", 200, 0);
    const c = connect([above, merge], "a", "g");
    expect(c.targetSide).toBe("top");
    expect(c.sourceSide, "and it leaves downward, not doubling back").toBe("bottom");
  });

  it("puts a branch from BELOW on the bottom vertex", () => {
    const below = el("b", "task", 200, 400);
    const c = connect([below, merge], "b", "g");
    expect(c.targetSide).toBe("bottom");
    expect(c.sourceSide).toBe("top");
  });

  it("leaves a LEVEL branch on the left vertex, entering from the right", () => {
    const level = el("l", "task", 200, 205);
    const c = connect([level, merge], "l", "g");
    expect(c.targetSide).toBe("left");
    expect(c.sourceSide).toBe("right");
  });

  it("does NOT touch a decision gateway's incoming flows", () => {
    const decision = el("d", "gateway", 400, 200, { width: 50, height: 50, properties: { gatewayRole: "decision" } });
    const above = el("a", "task", 200, 0);
    const c = connect([above, decision], "a", "d");
    expect(c.targetSide, "the convention is about merges").toBe("left");
  });

  it("never draws a message flow to a merge — a gateway carries no message", () => {
    // This used to assert the side of a message to a merge, guarded by
    // `if (c)` — so once the message rule (canConnect.ts) refused gateways it
    // silently asserted nothing. Assert the refusal instead.
    const above = el("a", "task", 200, 0);
    const out = reducer(state([above, merge]), {
      type: "ADD_CONNECTOR",
      payload: {
        sourceId: "a", targetId: "g", connectorType: "messageBPMN", directionType: "directed",
        routingType: "rectilinear", sourceSide: "right", targetSide: "left",
      },
    } as never);
    expect(out.connectors).toHaveLength(0);
  });

  it("respects an endpoint the user deliberately dragged elsewhere", () => {
    const above = el("a", "task", 200, 0);
    const c = connect([above, merge], "a", "g", { targetSide: "bottom" });
    expect(c.targetSide, "dragged to the bottom vertex on purpose").toBe("bottom");
  });
});

describe("T4617 — the guard that would have shipped dead", () => {
  it("does not ask whether targetSide is absent, because it never is", () => {
    // `addConnector` defaults targetSide to "left" and sourceSide to "right",
    // so `!action.payload.targetSide` is false on every call. The first
    // version of this rule used exactly that test and did nothing at all —
    // while every unit test of the pure function passed.
    const reducerSrc = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "app", "hooks", "useDiagram.ts"), "utf8",
    );
    expect(reducerSrc, "the live discriminator").toMatch(/isMergeGateway\(target\)\s*\n\s*&& targetSide === "left"/);
    expect(reducerSrc).not.toMatch(/isMergeGateway\(target\)\s*\n\s*&& !action\.payload\.targetSide/);
  });

  it("is applied before the vertex coercion, so the chosen side survives it", () => {
    const reducerSrc = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "app", "hooks", "useDiagram.ts"), "utf8",
    );
    const convention = reducerSrc.indexOf("isMergeGateway(target)");
    const r630 = reducerSrc.indexOf("R6.30: a gateway endpoint attaches to a VERTEX");
    expect(convention).toBeGreaterThan(-1);
    expect(r630, "R6.30 runs after, normalising to the vertex").toBeGreaterThan(convention);
  });
});
