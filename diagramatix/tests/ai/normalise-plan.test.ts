/**
 * Pure regression net for `normaliseAiPlan` (app/lib/ai/planBpmn.ts) plus a
 * light normalise→layout end-to-end shape check.
 *
 * `normaliseAiPlan(parsed)` MUTATES `parsed` IN PLACE (returns void). It:
 *   - rewrites legacy camel/snake type names to the canonical hyphenated forms
 *     via TYPE_MAP (e.g. startEvent → start-event, exclusiveGateway → gateway),
 *     and for the gateway/task aliases also fills gatewayType / taskType;
 *   - back-fills a missing `label` from a stray `name` field;
 *   - back-fills a lane's `pool` from `parentPool`;
 *   - sets properties.interruptionType = "non-interrupting" on any event whose
 *     label mentions a "non-interrupting" spelling (R46).
 *
 * It does NOT touch ids, does NOT dedupe, and does NOT add missing elements —
 * pinned below.
 *
 * Then: feed a normalised plan into the real `layoutBpmnDiagram` and assert the
 * laid-out DiagramData is structurally sound (referential integrity, no dup ids)
 * using the shipped `checkReferentialIntegrity`.
 */
import { describe, it, expect } from "vitest";
import { normaliseAiPlan } from "@/app/lib/ai/planBpmn";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { checkReferentialIntegrity } from "@/app/lib/diagram/checks/diagramChecks";

type Plan = { elements: AiElement[]; connections: AiConnection[] };
// Loose builder so we can hand normaliseAiPlan the messy shapes the AI emits.
const plan = (elements: unknown[], connections: unknown[] = []): Plan =>
  ({ elements, connections } as unknown as Plan);

describe("normaliseAiPlan — type canonicalisation", () => {
  it("rewrites legacy event type names to hyphenated forms", () => {
    const p = plan([
      { id: "a", type: "startEvent", label: "Start" },
      { id: "b", type: "endEvent", label: "End" },
      { id: "c", type: "intermediateEvent", label: "Mid" },
      { id: "d", type: "sub_process", label: "Sub" },
    ]);
    normaliseAiPlan(p);
    expect(p.elements.map((e) => e.type)).toEqual([
      "start-event", "end-event", "intermediate-event", "subprocess",
    ]);
  });

  it("maps gateway aliases to type 'gateway' AND fills gatewayType", () => {
    const p = plan([
      { id: "g1", type: "exclusiveGateway", label: "X" },
      { id: "g2", type: "parallelGateway", label: "P" },
      { id: "g3", type: "inclusiveGateway", label: "I" },
      { id: "g4", type: "eventBasedGateway", label: "E" },
    ]);
    normaliseAiPlan(p);
    expect(p.elements.every((e) => e.type === "gateway")).toBe(true);
    expect(p.elements.map((e) => e.gatewayType)).toEqual([
      "exclusive", "parallel", "inclusive", "event-based",
    ]);
  });

  it("maps task aliases to type 'task' AND fills taskType", () => {
    const p = plan([
      { id: "t1", type: "sendTask", label: "Send" },
      { id: "t2", type: "receiveTask", label: "Recv" },
      { id: "t3", type: "userTask", label: "User" },
      { id: "t4", type: "serviceTask", label: "Svc" },
      { id: "t5", type: "manualTask", label: "Man" },
    ]);
    normaliseAiPlan(p);
    expect(p.elements.every((e) => e.type === "task")).toBe(true);
    expect(p.elements.map((e) => e.taskType)).toEqual([
      "send", "receive", "user", "service", "manual",
    ]);
  });

  it("leaves already-canonical types untouched", () => {
    const p = plan([
      { id: "t", type: "task", label: "Keep", taskType: "user" },
      { id: "p", type: "pool", label: "P", poolType: "white-box" },
    ]);
    normaliseAiPlan(p);
    expect(p.elements[0].type).toBe("task");
    expect(p.elements[0].taskType).toBe("user");
    expect(p.elements[1].type).toBe("pool");
  });
});

describe("normaliseAiPlan — field back-filling", () => {
  it("back-fills a missing label from a stray `name` field", () => {
    const p = plan([{ id: "t", type: "task", name: "From Name" }]);
    normaliseAiPlan(p);
    expect(p.elements[0].label).toBe("From Name");
  });

  it("does not overwrite an existing label with name", () => {
    const p = plan([{ id: "t", type: "task", label: "Real", name: "Stray" }]);
    normaliseAiPlan(p);
    expect(p.elements[0].label).toBe("Real");
  });

  it("back-fills a lane's pool from parentPool", () => {
    // Pool present so this exercises the back-fill, not the orphan-lane injection.
    const p = plan([
      { id: "p1", type: "pool", label: "Acme", poolType: "white-box" },
      { id: "l1", type: "lane", label: "Sales", parentPool: "p1" },
    ]);
    normaliseAiPlan(p);
    expect(p.elements.find((e) => e.id === "l1")!.pool).toBe("p1");
  });

  it("does not overwrite an existing pool on a lane", () => {
    const p = plan([
      { id: "p1", type: "pool", label: "Acme", poolType: "white-box" },
      { id: "l1", type: "lane", label: "Sales", pool: "px", parentPool: "p1" },
    ]);
    normaliseAiPlan(p);
    expect(p.elements.find((e) => e.id === "l1")!.pool).toBe("px");
  });
});

describe("normaliseAiPlan — R46 non-interrupting label detection", () => {
  it.each([
    "Non-Interrupting Timer",
    "non interrupting signal",
    "noninterrupting message",
  ])("sets interruptionType for label %j", (label) => {
    const p = plan([{ id: "e", type: "intermediate-event", label }]);
    normaliseAiPlan(p);
    expect((p.elements[0].properties as Record<string, unknown>).interruptionType)
      .toBe("non-interrupting");
  });

  it("does NOT set interruptionType for an ordinary event label", () => {
    const p = plan([{ id: "e", type: "intermediate-event", label: "Timeout" }]);
    normaliseAiPlan(p);
    expect(p.elements[0].properties?.interruptionType).toBeUndefined();
  });

  it("preserves existing properties while adding interruptionType", () => {
    const p = plan([{ id: "e", type: "start-event", label: "Non-interrupting start", properties: { foo: 1 } }]);
    normaliseAiPlan(p);
    const props = p.elements[0].properties as Record<string, unknown>;
    expect(props.foo).toBe(1);
    expect(props.interruptionType).toBe("non-interrupting");
  });
});

describe("normaliseAiPlan — pinned non-behaviours", () => {
  it("does NOT touch element ids", () => {
    const p = plan([{ id: "MixedCase_01", type: "task", label: "X" }]);
    normaliseAiPlan(p);
    expect(p.elements[0].id).toBe("MixedCase_01");
  });

  it("does NOT dedupe or add elements (count unchanged)", () => {
    const p = plan([
      { id: "dup", type: "task", label: "A" },
      { id: "dup", type: "task", label: "B" },
    ]);
    normaliseAiPlan(p);
    expect(p.elements).toHaveLength(2);
  });

  it("does NOT modify connections", () => {
    const p = plan(
      [{ id: "a", type: "task", label: "A" }, { id: "b", type: "task", label: "B" }],
      [{ sourceId: "a", targetId: "b", type: "sequence" }],
    );
    const before = JSON.parse(JSON.stringify(p.connections));
    normaliseAiPlan(p);
    expect(p.connections).toEqual(before);
  });
});

describe("normalise → layoutBpmnDiagram produces a structurally sound diagram", () => {
  it("a normalised loose plan lays out with intact referential integrity and no dup ids", () => {
    // A deliberately loose plan: legacy type names, a stray `name`, a lane via
    // parentPool — exactly the shapes normaliseAiPlan exists to fix.
    const p = plan(
      [
        { id: "p1", type: "pool", name: "Company", poolType: "white-box" },
        { id: "l1", type: "lane", label: "Sales", parentPool: "p1" },
        { id: "e1", type: "startEvent", label: "Start", pool: "p1", lane: "l1" },
        { id: "g1", type: "exclusiveGateway", label: "Approved?", pool: "p1", lane: "l1" },
        { id: "t1", type: "userTask", label: "Approve", pool: "p1", lane: "l1" },
        { id: "t2", type: "userTask", label: "Reject", pool: "p1", lane: "l1" },
        { id: "g2", type: "exclusiveGateway", label: "Merge", pool: "p1", lane: "l1" },
        { id: "e2", type: "endEvent", label: "End", pool: "p1", lane: "l1" },
      ],
      [
        { sourceId: "e1", targetId: "g1", type: "sequence" },
        { sourceId: "g1", targetId: "t1", type: "sequence" },
        { sourceId: "g1", targetId: "t2", type: "sequence" },
        { sourceId: "t1", targetId: "g2", type: "sequence" },
        { sourceId: "t2", targetId: "g2", type: "sequence" },
        { sourceId: "g2", targetId: "e2", type: "sequence" },
      ],
    );

    normaliseAiPlan(p);
    // Sanity: normalisation actually canonicalised the loose bits.
    expect(p.elements.find((e) => e.id === "p1")!.label).toBe("Company");
    expect(p.elements.find((e) => e.id === "l1")!.pool).toBe("p1");
    expect(p.elements.find((e) => e.id === "g1")!.gatewayType).toBe("exclusive");

    const data = layoutBpmnDiagram(p.elements, p.connections);

    // No duplicate element ids.
    const ids = data.elements.map((e) => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(dupes)], `duplicate ids: ${dupes.join(", ")}`).toEqual([]);

    // Every connector references existing source + target.
    const idSet = new Set(ids);
    for (const c of data.connectors) {
      expect(idSet.has(c.sourceId), `connector ${c.id} dangling source ${c.sourceId}`).toBe(true);
      expect(idSet.has(c.targetId), `connector ${c.id} dangling target ${c.targetId}`).toBe(true);
    }

    // Shipped referential-integrity rule reports zero violations.
    const violations = checkReferentialIntegrity(data);
    expect(violations.map((v) => v.message)).toEqual([]);

    // Every element has a finite, positive box.
    for (const e of data.elements) {
      for (const k of ["x", "y", "width", "height"] as const) {
        expect(Number.isFinite(e[k]), `${e.id}.${k} not finite`).toBe(true);
      }
      expect(e.width).toBeGreaterThan(0);
      expect(e.height).toBeGreaterThan(0);
    }
  });
});
