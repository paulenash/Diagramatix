/**
 * BPMN generation rules (T0717, T0718):
 *  1. Task / Subprocess names get HARD line breaks by word count
 *     (≤2 unchanged; 3-4 → after word 2; 5-6 → after word 3; >6 → every 3).
 *  2. Any set of Lanes must have a containing Pool — orphan lanes are wrapped
 *     in a white-box pool named "Process".
 * Both are enforced deterministically in normaliseAiPlan (all BPMN generation).
 */
import { describe, it, expect } from "vitest";
import { hardWrapProcessName } from "@/app/lib/diagram/textMetrics";
import { normaliseAiPlan } from "@/app/lib/ai/planBpmn";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { validatePlan } from "@/app/lib/ai/planSchema";

describe("hardWrapProcessName (T0717)", () => {
  it("leaves 1-2 word names unchanged", () => {
    expect(hardWrapProcessName("Print Check")).toBe("Print Check");
    expect(hardWrapProcessName("Approve")).toBe("Approve");
  });
  it("breaks 3-4 word names after the 2nd word", () => {
    expect(hardWrapProcessName("Send Back to Requester")).toBe("Send Back\nto Requester");
    expect(hardWrapProcessName("Send to Department Head")).toBe("Send to\nDepartment Head");
  });
  it("breaks 5-6 word names after the 3rd word", () => {
    expect(hardWrapProcessName("Fill Out Check Request Form")).toBe("Fill Out Check\nRequest Form");
    expect(hardWrapProcessName("Send to Vice President for Approval")).toBe("Send to Vice\nPresident for Approval");
  });
  it("breaks names over 6 words after every 3rd word", () => {
    expect(hardWrapProcessName("one two three four five six seven")).toBe("one two three\nfour five six\nseven");
  });
  it("is idempotent (\\n counts as whitespace)", () => {
    const once = hardWrapProcessName("Fill Out Check Request Form");
    expect(hardWrapProcessName(once)).toBe(once);
  });
});

describe("normaliseAiPlan generation rules (T0718)", () => {
  it("hard-wraps every generated task + collapsed subprocess name", () => {
    const plan = {
      elements: [
        { id: "t", type: "task", label: "Send Back to Requester" },
        { id: "sp", type: "subprocess", label: "Review And Approve Request" },
        { id: "e", type: "start-event", label: "Application Received Today Now" }, // events NOT wrapped
      ] as AiElement[],
      connections: [] as AiConnection[],
    };
    normaliseAiPlan(plan);
    expect(plan.elements.find((e) => e.id === "t")!.label).toBe("Send Back\nto Requester");
    expect(plan.elements.find((e) => e.id === "sp")!.label).toBe("Review And\nApprove Request");
    expect(plan.elements.find((e) => e.id === "e")!.label).toBe("Application Received Today Now"); // unchanged
  });

  it("wraps orphan lanes in a 'Company' pool and re-parents their elements", () => {
    const plan = {
      elements: [
        { id: "l1", type: "lane", label: "Sales" },
        { id: "l2", type: "lane", label: "Finance" },
        { id: "t", type: "task", label: "Do", lane: "l1" },
      ] as AiElement[],
      connections: [] as AiConnection[],
    };
    normaliseAiPlan(plan);
    const pool = plan.elements.find((e) => e.type === "pool");
    expect(pool).toBeTruthy();
    expect(pool!.label).toBe("Company");
    expect(pool!.poolType).toBe("white-box");
    expect(plan.elements.find((e) => e.id === "l1")!.parentPool).toBe(pool!.id);
    expect(plan.elements.find((e) => e.id === "l2")!.parentPool).toBe(pool!.id);
    expect(plan.elements.find((e) => e.id === "t")!.pool).toBe(pool!.id);
  });

  it("injects a Company pool when lanes reference a pool the AI never emitted (dangling parentPool) (T0736)", () => {
    // The AI generated lanes with parentPool: "p1" but forgot to include the p1
    // pool element — the old rule (which only caught lanes with NO reference)
    // missed this, leaving the lanes with a dangling pool. Every lane must still
    // end up inside a real pool.
    const plan = {
      elements: [
        { id: "l1", type: "lane", label: "Any Employee", parentPool: "p1" },
        { id: "l2", type: "lane", label: "Manager", parentPool: "p1" },
        { id: "t1", type: "task", label: "Submit", pool: "p1", lane: "l1" },
        { id: "t2", type: "task", label: "Approve", pool: "p1", lane: "l2" },
      ] as AiElement[],
      connections: [] as AiConnection[],
    };
    normaliseAiPlan(plan);
    const pools = plan.elements.filter((e) => e.type === "pool");
    expect(pools).toHaveLength(1);
    const pool = pools[0];
    expect(pool.label).toBe("Company");
    expect(pool.poolType).toBe("white-box");
    // Both lanes now belong to the injected pool (not the missing "p1").
    for (const id of ["l1", "l2"]) {
      expect(plan.elements.find((e) => e.id === id)!.parentPool).toBe(pool.id);
    }
    // Flow elements that pointed at the missing pool are re-homed.
    for (const id of ["t1", "t2"]) {
      expect(plan.elements.find((e) => e.id === id)!.pool).toBe(pool.id);
    }
  });

  it("leaves lanes alone when their pool DOES exist (no spurious injection)", () => {
    const plan = {
      elements: [
        { id: "p1", type: "pool", label: "Acme", poolType: "white-box" },
        { id: "l1", type: "lane", label: "Sales", parentPool: "p1" },
        { id: "t", type: "task", label: "Do", pool: "p1", lane: "l1" },
      ] as AiElement[],
      connections: [] as AiConnection[],
    };
    normaliseAiPlan(plan);
    expect(plan.elements.filter((e) => e.type === "pool")).toHaveLength(1);
    expect(plan.elements.find((e) => e.type === "pool")!.id).toBe("p1");
    expect(plan.elements.find((e) => e.id === "l1")!.parentPool).toBe("p1");
  });

  it("data associations do NOT affect flow column placement (T0724)", () => {
    // A Data Object / Store link is an association, not sequence flow — it must
    // not pull a consumer into a new column (leaving a gap around the artifact)
    // nor shove elements out of topological order.
    const base: AiElement[] = [
      { id: "s", type: "start-event", label: "S" },
      { id: "a", type: "task", label: "A" },
      { id: "b", type: "task", label: "B" },
      { id: "c", type: "task", label: "C" },
      { id: "e", type: "end-event", label: "E" },
    ];
    const flow: AiConnection[] = [
      { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "b" },
      { sourceId: "b", targetId: "c" }, { sourceId: "c", targetId: "e" },
    ];
    const noData = layoutBpmnDiagram(base, flow);
    // "C" reads a Data Store (an INPUT association) and "A" writes a Data Object.
    const withData = layoutBpmnDiagram(
      [...base, { id: "ds", type: "data-store", label: "Policy" }, { id: "do", type: "data-object", label: "Draft" }],
      [...flow, { sourceId: "ds", targetId: "c" }, { sourceId: "a", targetId: "do" }],
    );
    const xOf = (d: ReturnType<typeof layoutBpmnDiagram>, id: string) => Math.round(d.elements.find((e) => e.id === id)!.x);
    for (const id of ["s", "a", "b", "c", "e"]) {
      expect(xOf(withData, id), `${id} column unchanged by the data association`).toBe(xOf(noData, id));
    }
  });

  it("a data object stays adjacent to its associated activity after cross-lane placement (T0723)", () => {
    // A gateway fanning across lanes moves activities during layout; a data
    // object (parented to the lane, not the activity) must be re-hugged to its
    // activity's FINAL position, not left stranded far away.
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "P", poolType: "white-box" },
      { id: "LA", type: "lane", label: "A", parentPool: "p" },
      { id: "LB", type: "lane", label: "B", parentPool: "p" },
      { id: "LC", type: "lane", label: "C", parentPool: "p" },
      { id: "s", type: "start-event", label: "S", pool: "p", lane: "LA" },
      { id: "g", type: "gateway", gatewayType: "exclusive", label: "?", pool: "p", lane: "LA" },
      { id: "tb", type: "task", label: "B path", pool: "p", lane: "LB" },
      { id: "tc", type: "task", label: "C path", pool: "p", lane: "LC" },
      { id: "m", type: "gateway", gatewayType: "exclusive", label: "M", pool: "p", lane: "LA" },
      { id: "tf", type: "task", label: "Finalise", pool: "p", lane: "LA" },
      { id: "e", type: "end-event", label: "E", pool: "p", lane: "LA" },
      { id: "do", type: "data-object", label: "Result", pool: "p", lane: "LA" },
    ];
    const conns: AiConnection[] = [
      { sourceId: "s", targetId: "g" }, { sourceId: "g", targetId: "tb" }, { sourceId: "g", targetId: "tc" },
      { sourceId: "tb", targetId: "m" }, { sourceId: "tc", targetId: "m" }, { sourceId: "m", targetId: "tf" },
      { sourceId: "tf", targetId: "e" }, { sourceId: "tf", targetId: "do" }, // "Finalise" outputs "Result"
    ];
    const d = layoutBpmnDiagram(els, conns);
    const dObj = d.elements.find((e) => e.id === "do")!;
    const tf = d.elements.find((e) => e.id === "tf")!;
    const dist = Math.hypot((dObj.x + dObj.width / 2) - (tf.x + tf.width / 2), (dObj.y + dObj.height / 2) - (tf.y + tf.height / 2));
    expect(dist, `data object is ${Math.round(dist)}px from its activity (should hug it)`).toBeLessThan(170);
  });

  it("gateway connectors attach at a diamond VERTEX (offset 0.5), even when a face is shared (T0721)", () => {
    // 4 branches force two flows onto one face — they must both sit ON the
    // vertex (0.5), NOT be spread mid-edge (0.333/0.667), which on a diamond
    // reads as "not connected to the vertex, just near it".
    const els: AiElement[] = [
      { id: "g", type: "gateway", gatewayType: "exclusive", label: "?" },
      { id: "a", type: "task", label: "A" },
      { id: "b", type: "task", label: "B" },
      { id: "c", type: "task", label: "C" },
      { id: "d", type: "task", label: "D" },
    ];
    const conns: AiConnection[] = [
      { sourceId: "g", targetId: "a" }, { sourceId: "g", targetId: "b" },
      { sourceId: "g", targetId: "c" }, { sourceId: "g", targetId: "d" },
    ];
    const d = layoutBpmnDiagram(els, conns);
    const gwEnds = d.connectors.filter((c) => c.sourceId === "g" || c.targetId === "g");
    expect(gwEnds.length).toBeGreaterThan(0);
    for (const c of gwEnds) {
      const off = c.sourceId === "g" ? (c.sourceOffsetAlong ?? 0.5) : (c.targetOffsetAlong ?? 0.5);
      expect(off, `${c.sourceId}->${c.targetId} attaches at the gateway vertex`).toBeCloseTo(0.5, 5);
    }
  });

  it("carries Loop + Ad-Hoc Expanded-Subprocess markers from the plan to the diagram (T0720)", () => {
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "Ops", poolType: "white-box" },
      // A repeating group → Expanded Subprocess with the Standard Loop marker.
      { id: "ep", type: "subprocess-expanded", label: "Do Until Approved", pool: "p", repeatType: "loop" },
      { id: "t", type: "task", label: "Review", pool: "p", parentSubprocess: "ep" },
      // An any-order group → Ad-Hoc Expanded Subprocess (no start/end, no sequence).
      { id: "ah", type: "subprocess-expanded", label: "Prepare Docs", pool: "p", properties: { adHoc: true } },
      { id: "a1", type: "task", label: "Draft", pool: "p", parentSubprocess: "ah" },
      { id: "a2", type: "task", label: "Attach", pool: "p", parentSubprocess: "ah" },
    ];
    // The plan schema accepts the new marker field.
    expect(validatePlan({ elements: els, connections: [] }).ok).toBe(true);
    const d = layoutBpmnDiagram(els, []);
    const ep = d.elements.find((e) => e.id === "ep")!;
    expect(ep.repeatType).toBe("loop"); // Standard Loop marker set on the EP
    const ah = d.elements.find((e) => e.id === "ah")!;
    expect(ah.properties?.adHoc).toBe(true); // Ad-Hoc marker set on the EP
    // The ad-hoc EP is NOT given injected start/end events (only event subs are).
    expect(d.elements.some((e) => e.type === "start-event" && e.parentId === "ah")).toBe(false);
    expect(d.elements.some((e) => e.type === "end-event" && e.parentId === "ah")).toBe(false);
  });

  it("strips labels from an EP's internal start/end events but keeps process-level ones (T0722)", () => {
    const plan = {
      elements: [
        { id: "ep", type: "subprocess-expanded", label: "Handle" },
        { id: "is", type: "start-event", label: "Begin", parentSubprocess: "ep" }, // internal → stripped
        { id: "ie", type: "end-event", label: "Finish", parentSubprocess: "ep" },   // internal → stripped
        { id: "ps", type: "start-event", label: "Order Received" },                  // process-level → kept
      ] as AiElement[],
      connections: [] as AiConnection[],
    };
    normaliseAiPlan(plan);
    expect(plan.elements.find((e) => e.id === "is")!.label).toBe("");
    expect(plan.elements.find((e) => e.id === "ie")!.label).toBe("");
    expect(plan.elements.find((e) => e.id === "ps")!.label).toBe("Order Received");
  });

  it("does NOT inject a pool when lanes already have one", () => {
    const plan = {
      elements: [
        { id: "p", type: "pool", label: "Company", poolType: "white-box" },
        { id: "l1", type: "lane", label: "Sales", parentPool: "p" },
      ] as AiElement[],
      connections: [] as AiConnection[],
    };
    normaliseAiPlan(plan);
    expect(plan.elements.filter((e) => e.type === "pool")).toHaveLength(1);
    expect(plan.elements.find((e) => e.type === "pool")!.id).toBe("p");
  });
});
