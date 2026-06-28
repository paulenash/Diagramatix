/**
 * Per-diagram-type structural matrix (non-BPMN types).
 *
 * The BPMN type has a rich rule/check net; context, process-context,
 * state-machine and value-chain previously had no STRUCTURAL guard. This builds
 * a few representative diagrams of each via the real layoutGenericDiagram and
 * asserts the laid-out DiagramData is structurally sound:
 *   • no duplicate element ids,
 *   • every connector references existing source + target elements,
 *   • every parentId/boundaryHostId resolves (no orphaned container refs) —
 *     reusing the shipped checkReferentialIntegrity rule,
 *   • container children (process-context use-cases, value-chain chevrons,
 *     composite-state sub-states) resolve to a real container of the right type,
 *   • every element has a finite, non-negative box.
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import { checkReferentialIntegrity } from "@/app/lib/diagram/checks/diagramChecks";
import type { DiagramData } from "@/app/lib/diagram/types";

interface AiEl { id: string; type: string; label?: string; group?: string; parent?: string }
interface AiConn { sourceId: string; targetId: string; label?: string }
interface Case { name: string; type: string; elements: AiEl[]; connections: AiConn[]; containerTypes: string[] }

const CASES: Case[] = [
  {
    name: "context — system with three entities",
    type: "context",
    containerTypes: [],
    elements: [
      { id: "sys", type: "process-system", label: "Claims System" },
      { id: "e1", type: "external-entity", label: "Customer" },
      { id: "e2", type: "external-entity", label: "Bank" },
      { id: "e3", type: "external-entity", label: "Regulator" },
    ],
    connections: [
      { sourceId: "e1", targetId: "sys", label: "Lodge claim" },
      { sourceId: "sys", targetId: "e2", label: "Pay out" },
      { sourceId: "sys", targetId: "e3", label: "Report" },
    ],
  },
  {
    name: "process-context — boundary with use-cases + external actors",
    type: "process-context",
    containerTypes: ["system-boundary"],
    elements: [
      { id: "b", type: "system-boundary", label: "Order Processing" },
      { id: "u1", type: "use-case", label: "Receive Order", group: "b" },
      { id: "u2", type: "use-case", label: "Pick Goods", group: "b" },
      { id: "u3", type: "use-case", label: "Ship Order", group: "b" },
      { id: "a1", type: "actor", label: "Customer" },
      { id: "a2", type: "system", label: "ERP" },
      { id: "a3", type: "team", label: "Warehouse" },
    ],
    connections: [
      { sourceId: "a1", targetId: "u1" },
      { sourceId: "u2", targetId: "a3" },
      { sourceId: "u3", targetId: "a2" },
    ],
  },
  {
    name: "state-machine — flat states with initial/final",
    type: "state-machine",
    containerTypes: [],
    elements: [
      { id: "i", type: "initial-state", label: "" },
      { id: "s1", type: "state", label: "Idle" },
      { id: "s2", type: "state", label: "Running" },
      { id: "s3", type: "state", label: "Paused" },
      { id: "f", type: "final-state", label: "" },
    ],
    connections: [
      { sourceId: "i", targetId: "s1" },
      { sourceId: "s1", targetId: "s2", label: "start" },
      { sourceId: "s2", targetId: "s3", label: "pause" },
      { sourceId: "s3", targetId: "s2", label: "resume" },
      { sourceId: "s2", targetId: "f", label: "stop" },
    ],
  },
  {
    name: "state-machine — composite state with nested sub-states",
    type: "state-machine",
    containerTypes: ["composite-state"],
    elements: [
      { id: "i", type: "initial-state", label: "" },
      { id: "c", type: "composite-state", label: "Active" },
      { id: "s1", type: "state", label: "Connecting", group: "c" },
      { id: "s2", type: "state", label: "Online", group: "c" },
      { id: "f", type: "final-state", label: "" },
    ],
    connections: [
      { sourceId: "i", targetId: "s1" },
      { sourceId: "s1", targetId: "s2", label: "ready" },
      { sourceId: "s2", targetId: "f", label: "logout" },
    ],
  },
  {
    name: "value-chain — single group of chevrons",
    type: "value-chain",
    containerTypes: ["process-group"],
    elements: [
      { id: "g", type: "process-group", label: "Sales" },
      { id: "c1", type: "chevron", label: "V01 Prospect", group: "g" },
      { id: "c2", type: "chevron", label: "V02 Quote", group: "g" },
      { id: "c3", type: "chevron", label: "V03 Negotiate", group: "g" },
      { id: "c4", type: "chevron", label: "V04 Close", group: "g" },
    ],
    connections: [
      { sourceId: "c1", targetId: "c2" },
      { sourceId: "c2", targetId: "c3" },
      { sourceId: "c3", targetId: "c4" },
    ],
  },
];

const layout = (c: Case): DiagramData =>
  layoutGenericDiagram({ elements: c.elements, connections: c.connections } as never, c.type);

describe("non-BPMN diagram-type structural matrix", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const data = layout(c);

      it("produces a non-empty diagram", () => {
        expect(data.elements.length).toBeGreaterThan(0);
      });

      it("has no duplicate element ids", () => {
        const ids = data.elements.map((e) => e.id);
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        expect([...new Set(dupes)], `duplicate ids: ${dupes.join(", ")}`).toEqual([]);
      });

      it("passes referential integrity (connectors + parent refs all resolve)", () => {
        const violations = checkReferentialIntegrity(data);
        const msgs = violations.map((v) => v.message);
        expect(msgs, `\n  - ${msgs.join("\n  - ")}`).toEqual([]);
      });

      it("every connector references existing source + target elements", () => {
        const ids = new Set(data.elements.map((e) => e.id));
        for (const conn of data.connectors) {
          expect(ids.has(conn.sourceId), `connector ${conn.id} dangling source ${conn.sourceId}`).toBe(true);
          expect(ids.has(conn.targetId), `connector ${conn.id} dangling target ${conn.targetId}`).toBe(true);
        }
      });

      it("every parented child resolves to a real container of the expected type", () => {
        const byId = new Map(data.elements.map((e) => [e.id, e]));
        const parented = data.elements.filter((e) => e.parentId);
        if (c.containerTypes.length === 0) {
          // Flat types: nothing should claim a parent.
          expect(parented.map((e) => e.id)).toEqual([]);
          return;
        }
        // At least one child must be parented (the layout nested the group).
        expect(parented.length).toBeGreaterThan(0);
        for (const child of parented) {
          const parent = byId.get(child.parentId!);
          expect(parent, `child ${child.id} parentId ${child.parentId} not found`).toBeDefined();
          expect(c.containerTypes, `parent ${parent!.id} is ${parent!.type}, not a container`).toContain(parent!.type);
        }
      });

      it("every element has a finite, non-negative box", () => {
        for (const e of data.elements) {
          for (const k of ["x", "y", "width", "height"] as const) {
            expect(Number.isFinite(e[k]), `${e.id}.${k} not finite`).toBe(true);
          }
          expect(e.width, `${e.id} width`).toBeGreaterThan(0);
          expect(e.height, `${e.id} height`).toBeGreaterThan(0);
        }
      });
    });
  }

  it("dropped associations never leave a dangling connector (process-context use-case↔use-case)", () => {
    // P2.09 drops use-case→use-case associations. Whatever the layout keeps,
    // it must never reference a non-existent element.
    const data = layoutGenericDiagram(
      {
        elements: [
          { id: "b", type: "system-boundary", label: "Sys" },
          { id: "u1", type: "use-case", label: "A", group: "b" },
          { id: "u2", type: "use-case", label: "B", group: "b" },
          { id: "a", type: "actor", label: "User" },
        ],
        connections: [
          { sourceId: "a", targetId: "u1" },
          { sourceId: "u1", targetId: "u2" }, // candidate to be dropped
        ],
      } as never,
      "process-context",
    );
    const ids = new Set(data.elements.map((e) => e.id));
    for (const conn of data.connectors) {
      expect(ids.has(conn.sourceId)).toBe(true);
      expect(ids.has(conn.targetId)).toBe(true);
    }
    expect(checkReferentialIntegrity(data)).toEqual([]);
  });
});
