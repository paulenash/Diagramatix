/**
 * Layout-engine regression tests.
 *
 * Each test hand-builds a tiny AI plan, runs the REAL layout engine, and
 * asserts the geometry rules we care about — plus a blanket
 * `checkDiagram(...)` so any future regression in the structural invariants
 * shows up here too. Add a new `it(...)` whenever we fix a layout bug, so it
 * can never silently come back.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "../bpmnLayout";
import { checkDiagram, formatViolations } from "../checks/diagramChecks";
import type { DiagramElement } from "../types";

function run(elements: AiElement[], connections: AiConnection[]) {
  const data = layoutBpmnDiagram(elements, connections);
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const byLabel = (label: string) => data.elements.find((e) => e.label === label);
  return { data, byId, byLabel };
}

function contains(parent: DiagramElement, child: DiagramElement): boolean {
  return (
    child.x >= parent.x - 1 &&
    child.y >= parent.y - 1 &&
    child.x + child.width <= parent.x + parent.width + 1 &&
    child.y + child.height <= parent.y + parent.height + 1
  );
}

const expectClean = (data: { elements: DiagramElement[]; connectors: ReturnType<typeof layoutBpmnDiagram>["connectors"] }) => {
  const v = checkDiagram(data);
  expect(v, `unexpected violations:\n${formatViolations(v)}`).toEqual([]);
};

describe("pool-level event subprocess (wrapper drop)", () => {
  const plan: AiElement[] = [
    { id: "p1", type: "pool", label: "Company", poolType: "white-box" },
    { id: "lSales", type: "lane", label: "Sales", parentPool: "p1", pool: "p1" },
    { id: "lOps", type: "lane", label: "Operations", parentPool: "p1", pool: "p1" },
    { id: "eStart", type: "start-event", label: "Start", pool: "p1", lane: "lSales" },
    { id: "tDo", type: "task", label: "Do Work", pool: "p1", lane: "lOps" },
    { id: "eEnd", type: "end-event", label: "End", pool: "p1", lane: "lOps" },
    { id: "spCancel", type: "subprocess-expanded", label: "Handle Cancellation", subprocessType: "event", pool: "p1", lane: "lOps" },
    { id: "cStart", type: "start-event", label: "", parentSubprocess: "spCancel", properties: { interruptionType: "non-interrupting" } },
    { id: "cRelease", type: "task", label: "Release Stock", parentSubprocess: "spCancel" },
    { id: "cClose", type: "task", label: "Close Cancelled Order", parentSubprocess: "spCancel" },
    { id: "cEnd", type: "end-event", label: "", parentSubprocess: "spCancel" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "eStart", targetId: "tDo", type: "sequence" },
    { sourceId: "tDo", targetId: "eEnd", type: "sequence" },
    { sourceId: "cStart", targetId: "cRelease", type: "sequence" },
    { sourceId: "cRelease", targetId: "cClose", type: "sequence" },
    { sourceId: "cClose", targetId: "cEnd", type: "sequence" },
  ];

  it("does NOT fabricate a 'Main Process' wrapper", () => {
    const { data } = run(plan, conns);
    expect(data.elements.find((e) => e.label === "Main Process")).toBeUndefined();
    expect(data.elements.find((e) => e.id.startsWith("_wrapper_"))).toBeUndefined();
  });

  it("places the event sub directly in its lane and contains all its children", () => {
    const { data, byId, byLabel } = run(plan, conns);
    const ev = byLabel("Handle Cancellation")!;
    expect(ev.parentId).toBe("lOps");
    const lane = byId.get("lOps")!;
    expect(contains(lane, ev)).toBe(true);
    for (const id of ["cStart", "cRelease", "cClose", "cEnd"]) {
      expect(contains(ev, byId.get(id)!), `${id} inside event sub`).toBe(true);
    }
  });

  it("passes all structural checks", () => {
    expectClean(run(plan, conns).data);
  });
});

describe("event subprocess nested in a normal subprocess (sizing)", () => {
  // AI legitimately nests an event sub inside a normal expanded subprocess.
  // The normal sub must grow wide enough to contain the (content-driven)
  // event sub — the bug was budgeting only the fixed EVENT_SUB_W floor.
  const plan: AiElement[] = [
    { id: "p1", type: "pool", label: "Company", poolType: "white-box" },
    { id: "spMain", type: "subprocess-expanded", label: "Fulfilment", subprocessType: "normal", pool: "p1" },
    { id: "mStart", type: "start-event", label: "", parentSubprocess: "spMain" },
    { id: "mTask", type: "task", label: "Pick", parentSubprocess: "spMain" },
    { id: "mEnd", type: "end-event", label: "", parentSubprocess: "spMain" },
    { id: "spEv", type: "subprocess-expanded", label: "Handle Cancellation", subprocessType: "event", parentSubprocess: "spMain" },
    { id: "evStart", type: "start-event", label: "", parentSubprocess: "spEv", properties: { interruptionType: "non-interrupting" } },
    { id: "evA", type: "task", label: "Release Stock", parentSubprocess: "spEv" },
    { id: "evB", type: "task", label: "Close Order", parentSubprocess: "spEv" },
    { id: "evEnd", type: "end-event", label: "", parentSubprocess: "spEv" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "mStart", targetId: "mTask", type: "sequence" },
    { sourceId: "mTask", targetId: "mEnd", type: "sequence" },
    { sourceId: "evStart", targetId: "evA", type: "sequence" },
    { sourceId: "evA", targetId: "evB", type: "sequence" },
    { sourceId: "evB", targetId: "evEnd", type: "sequence" },
  ];

  it("normal sub fully contains the multi-task event sub", () => {
    const { byId, byLabel } = run(plan, conns);
    const outer = byLabel("Fulfilment")!;
    const ev = byLabel("Handle Cancellation")!;
    expect(contains(outer, ev), `outer ${Math.round(outer.width)}×${Math.round(outer.height)} must contain event sub right=${Math.round(ev.x + ev.width)}`).toBe(true);
    for (const id of ["evStart", "evA", "evB", "evEnd"]) {
      expect(contains(ev, byId.get(id)!), `${id} inside event sub`).toBe(true);
    }
  });

  it("passes all structural checks", () => {
    expectClean(run(plan, conns).data);
  });
});

describe("lane re-stack keeps contents inside their lane", () => {
  // A tall expanded subprocess in the FIRST lane forces that lane to grow.
  // Every later lane then shifts down — its contents must ride with it.
  // The bug: re-stack moved lane.y but left children behind, so a whole
  // lane's tasks rendered hundreds of px above their own lane band.
  const plan: AiElement[] = [
    { id: "p1", type: "pool", label: "Company", poolType: "white-box" },
    { id: "lTop", type: "lane", label: "Sales", parentPool: "p1", pool: "p1" },
    { id: "lBot", type: "lane", label: "Finance", parentPool: "p1", pool: "p1" },
    { id: "s", type: "start-event", label: "Start", pool: "p1", lane: "lTop" },
    { id: "spBig", type: "subprocess-expanded", label: "Fulfil Order", subprocessType: "normal", pool: "p1", lane: "lTop" },
    // six children → a multi-row grid, making spBig (and thus lTop) tall
    ...["a", "b", "c", "d", "e", "f"].map((k) => ({
      id: `c${k}`, type: "task" as const, label: `Step ${k}`, parentSubprocess: "spBig",
    })),
    { id: "tFin1", type: "task", label: "Invoice", pool: "p1", lane: "lBot" },
    { id: "tFin2", type: "task", label: "Reconcile", pool: "p1", lane: "lBot" },
    { id: "e", type: "end-event", label: "End", pool: "p1", lane: "lBot" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "spBig", type: "sequence" },
    { sourceId: "spBig", targetId: "tFin1", type: "sequence" },
    { sourceId: "tFin1", targetId: "tFin2", type: "sequence" },
    { sourceId: "tFin2", targetId: "e", type: "sequence" },
  ];

  it("Finance-lane tasks stay inside the Finance lane after re-stack", () => {
    const { byId } = run(plan, conns);
    const lBot = byId.get("lBot")!;
    for (const id of ["tFin1", "tFin2", "e"]) {
      const el = byId.get(id)!;
      expect(contains(lBot, el), `${id} (y=${Math.round(el.y)}) inside lBot band ${Math.round(lBot.y)}..${Math.round(lBot.y + lBot.height)}`).toBe(true);
    }
  });

  it("has no containment ERRORs", () => {
    const data = run(plan, conns).data;
    const errs = checkDiagram(data).filter((v) => v.rule === "containment" && v.severity === "error");
    expect(errs, formatViolations(errs)).toEqual([]);
  });
});

describe("rework loop merge placement (column collapse)", () => {
  // Validate → decision; on "Rejected" return for correction then loop back
  // to a merge that re-enters Validate. The loop back-edge must NOT drag the
  // merge gateway to the far right, left of its forward input.
  const plan: AiElement[] = [
    { id: "p1", type: "pool", label: "Company", poolType: "white-box" },
    { id: "s", type: "start-event", label: "Start", pool: "p1" },
    { id: "tReceive", type: "task", label: "Receive PO", pool: "p1" },
    { id: "gMerge", type: "gateway", label: "Retry", gatewayType: "exclusive", pool: "p1" },
    { id: "tValidate", type: "task", label: "Validate", pool: "p1" },
    { id: "gValid", type: "gateway", label: "Valid?", gatewayType: "exclusive", pool: "p1" },
    { id: "tReturn", type: "task", label: "Return for Correction", pool: "p1" },
    { id: "tCorrect", type: "task", label: "Receive Correction", pool: "p1" },
    { id: "e", type: "end-event", label: "End", pool: "p1" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "tReceive", type: "sequence" },
    { sourceId: "tReceive", targetId: "gMerge", type: "sequence" },
    { sourceId: "gMerge", targetId: "tValidate", type: "sequence" },
    { sourceId: "tValidate", targetId: "gValid", type: "sequence" },
    { sourceId: "gValid", targetId: "e", label: "Accepted", type: "sequence" },
    { sourceId: "gValid", targetId: "tReturn", label: "Rejected", type: "sequence" },
    { sourceId: "tReturn", targetId: "tCorrect", type: "sequence" },
    { sourceId: "tCorrect", targetId: "gMerge", type: "sequence" }, // loop back-edge
  ];

  it("merge gateway sits right of its forward input, not collapsed left", () => {
    const { byId } = run(plan, conns);
    const merge = byId.get("gMerge")!;
    const receive = byId.get("tReceive")!;
    const validate = byId.get("tValidate")!;
    expect(merge.x + merge.width / 2).toBeGreaterThan(receive.x + receive.width / 2);
    expect(validate.x + validate.width / 2).toBeGreaterThan(merge.x + merge.width / 2);
  });

  it("passes all structural checks", () => {
    expectClean(run(plan, conns).data);
  });
});
