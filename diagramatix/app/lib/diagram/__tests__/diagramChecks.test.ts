/**
 * Tests for the checker itself — feed it deliberately-broken diagrams and
 * confirm each rule fires. Guards against the checker silently passing
 * everything (a checker that never fails is worthless).
 */
import { describe, it, expect } from "vitest";
import {
  checkContainment,
  checkReferentialIntegrity,
  checkNoBoundaryEventsOnPool,
  checkEventSubHasNoConnectors,
  checkConnectorOnContainer,
  checkDuplicateContainerName,
  checkSingleLanePool,
  checkHangingMessage,
  checkDiagram,
  RULES,
} from "../checks/diagramChecks";
import type { DiagramElement, Connector } from "../types";

const el = (e: Partial<DiagramElement> & Pick<DiagramElement, "id" | "type">): DiagramElement => ({
  x: 0, y: 0, width: 50, height: 50, label: "", properties: {}, ...e,
});
const conn = (id: string, sourceId: string, targetId: string, type: Connector["type"] = "sequence"): Connector => ({
  id, sourceId, targetId, sourceSide: "right", targetSide: "left", type,
  directionType: "directed", routingType: "rectilinear",
  sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
});

it("flags a child that overflows its container", () => {
  const v = checkContainment({
    elements: [
      el({ id: "lane", type: "lane", x: 0, y: 0, width: 100, height: 100 }),
      el({ id: "task", type: "task", x: 80, y: 10, width: 60, height: 30, parentId: "lane" }), // right=140 > 100
    ],
    connectors: [],
  });
  expect(v.map((x) => x.rule)).toContain("containment");
});

it("flags a dangling connector endpoint", () => {
  const v = checkReferentialIntegrity({
    elements: [el({ id: "a", type: "task" })],
    connectors: [conn("c1", "a", "ghost")],
  });
  expect(v.some((x) => x.message.includes("ghost"))).toBe(true);
});

it("flags a boundary event mounted on a pool", () => {
  const v = checkNoBoundaryEventsOnPool({
    elements: [
      el({ id: "pool", type: "pool" }),
      el({ id: "ev", type: "intermediate-event", boundaryHostId: "pool" }),
    ],
    connectors: [],
  });
  expect(v).toHaveLength(1);
  expect(v[0].rule).toBe("no-boundary-on-pool");
});

it("flags a connector touching an event sub-process", () => {
  const v = checkEventSubHasNoConnectors({
    elements: [
      el({ id: "ev", type: "subprocess-expanded", properties: { subprocessType: "event" } }),
      el({ id: "t", type: "task" }),
    ],
    connectors: [conn("c1", "t", "ev")],
  });
  expect(v).toHaveLength(1);
});

it("flags a sequence connector attached to a pool/lane", () => {
  const v = checkConnectorOnContainer({
    elements: [el({ id: "pool", type: "pool" }), el({ id: "t", type: "task" })],
    connectors: [conn("c1", "pool", "t", "sequence")],
  });
  expect(v).toHaveLength(1);
  expect(v[0].rule).toBe("connector-on-container");
});

it("flags duplicate pool/lane names (case/whitespace-insensitive)", () => {
  const v = checkDuplicateContainerName({
    elements: [
      el({ id: "p1", type: "pool", label: "Registered  Practitioner" }),
      el({ id: "p2", type: "pool", label: "registered practitioner" }),
    ],
    connectors: [],
  });
  expect(v).toHaveLength(1);
  expect(v[0].ids).toEqual(["p1", "p2"]);
});

it("flags a pool with exactly one lane", () => {
  const v = checkSingleLanePool({
    elements: [
      el({ id: "pool", type: "pool" }),
      el({ id: "lane", type: "lane", parentId: "pool" }),
    ],
    connectors: [],
  });
  expect(v).toHaveLength(1);
  expect(v[0].rule).toBe("single-lane-pool");
});

it("flags a message attached to an empty white-box pool as an error", () => {
  const v = checkHangingMessage({
    elements: [
      el({ id: "pool", type: "pool", properties: { poolType: "white-box" }, x: 0, y: 0, width: 200, height: 100 }),
      el({ id: "t", type: "task", x: 50, y: 200, width: 100, height: 60 }),
    ],
    connectors: [conn("c1", "pool", "t", "messageBPMN")],
  });
  expect(v).toHaveLength(1);
  expect(v[0].severity).toBe("error");
});

it("every rule has unique id + metadata", () => {
  const ids = RULES.map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const r of RULES) {
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.description.length).toBeGreaterThan(0);
  }
});

describe("a well-formed diagram", () => {
  it("produces no violations", () => {
    // No lanes (AI convention when no roles) — elements sit directly in the pool.
    const clean = {
      elements: [
        el({ id: "pool", type: "pool", x: 0, y: 0, width: 400, height: 200 }),
        el({ id: "s", type: "start-event", x: 60, y: 80, width: 36, height: 36, parentId: "pool" }),
        el({ id: "t", type: "task", x: 140, y: 70, width: 100, height: 60, parentId: "pool" }),
        el({ id: "e", type: "end-event", x: 300, y: 80, width: 36, height: 36, parentId: "pool" }),
      ],
      connectors: [conn("c1", "s", "t"), conn("c2", "t", "e")],
    };
    expect(checkDiagram(clean)).toEqual([]);
  });
});
