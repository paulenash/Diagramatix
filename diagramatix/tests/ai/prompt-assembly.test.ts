/**
 * AI prompt assembly — the deterministic string builders that decide what
 * actually reaches the model (forward) and how a drawn diagram is described
 * for re-generation (reverse). Pure functions, no DB, no Anthropic call.
 *
 * Forward (rules → system prompt): the GREEN rules emitted by
 * `splitRulesByEnforcement` must reach the model verbatim, and the canonical
 * format vocabulary for each diagram family must be present. We assert
 * membership (a distinctive marker survives + 1–2 stable structural anchors)
 * rather than snapshotting the whole prompt, so legitimate prompt edits don't
 * churn the test but a regression that drops the admin rules block does.
 *
 * Reverse (diagram → prompt): a small real BPMN diagram is laid out with the
 * production layout engine, then described. We pin the ACTUAL section structure
 * the builder emits and confirm the task / gateway / branch labels and the
 * external/system participants make it into the narrative.
 */
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "@/app/lib/ai/planBpmn";
import { buildFlowchartSystemPrompt } from "@/app/lib/ai/planFlowchart";
import { buildGenericSystemPrompt, DIAGRAM_PROMPTS } from "@/app/lib/ai/generateDiagramPrompt";
import { buildBpmnPrompt, buildPromptFromDiagram } from "@/app/lib/diagram/prompt-from-diagram";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const MARKER = "R99: TESTMARKER-UNIQUE rule text";

describe("forward — admin GREEN rules + canonical structure reach the system prompt", () => {
  describe("buildSystemPrompt (BPMN)", () => {
    it("embeds the rules marker verbatim and keeps the BPMN element vocabulary", () => {
      const out = buildSystemPrompt(MARKER);
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(0);
      // The admin-authored green rules reach the model.
      expect(out).toContain(MARKER);
      expect(out).toContain("USER RULES AND PREFERENCES");
      // Structural anchors: it is the BPMN planner and it names pools/lanes.
      expect(out).toContain("BPMN");
      expect(out).toContain("pool");
      expect(out).toContain("lane");
      // The hyphenated element vocabulary is part of the format contract.
      expect(out).toContain("start-event");
      expect(out).toContain("end-event");
    });

    it("omits the USER RULES block entirely when no rules are supplied", () => {
      const out = buildSystemPrompt("");
      expect(out).not.toContain("USER RULES AND PREFERENCES");
      // …but the core format contract is still present.
      expect(out).toContain("start-event");
    });
  });

  describe("buildFlowchartSystemPrompt", () => {
    it("embeds the rules marker verbatim and keeps the flowchart vocabulary", () => {
      const out = buildFlowchartSystemPrompt(MARKER);
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(0);
      expect(out).toContain(MARKER);
      expect(out).toContain("USER RULES AND PREFERENCES");
      // Structural anchors: ISO 5807 flowchart + its element types.
      expect(out).toContain("Flowchart");
      expect(out).toContain("terminator");
      expect(out).toContain("decision");
    });

    it("omits the USER RULES block when no rules are supplied", () => {
      const out = buildFlowchartSystemPrompt("");
      expect(out).not.toContain("USER RULES AND PREFERENCES");
      expect(out).toContain("terminator");
    });
  });

  describe("buildGenericSystemPrompt", () => {
    it.each(Object.keys(DIAGRAM_PROMPTS))(
      "appends the rules marker for %s and keeps the base prompt",
      (diagramType) => {
        const out = buildGenericSystemPrompt(diagramType, MARKER);
        expect(typeof out).toBe("string");
        expect(out.length).toBeGreaterThan(0);
        // Marker reaches the model.
        expect(out).toContain(MARKER);
        expect(out).toContain("USER RULES AND PREFERENCES");
        // Anchor: the base prompt for this type is still present verbatim.
        expect(out).toContain(DIAGRAM_PROMPTS[diagramType]);
      },
    );

    it("returns a sane fallback (no crash, no marker leak) for an unknown type", () => {
      const out = buildGenericSystemPrompt("not-a-real-type", MARKER);
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(0);
      // The fallback ignores both the base prompt and the rules block.
      expect(out).not.toContain(MARKER);
      expect(out).toContain("elements and connections");
    });

    it("omits the rules block when rules is empty", () => {
      const out = buildGenericSystemPrompt("context", "");
      expect(out).not.toContain("USER RULES AND PREFERENCES");
      expect(out).toContain(DIAGRAM_PROMPTS.context);
    });
  });
});

/**
 * Reverse builder fixture: a real BPMN diagram with a white-box pool (two
 * lanes), an external black-box pool, a couple of tasks, a labelled gateway
 * with Yes/No branches, a message flow, and start/end events — laid out by the
 * production engine so the prompt builder sees production-shaped DiagramData.
 */
function bpmnFixture() {
  const elements: AiElement[] = [
    {
      id: "p", type: "pool", label: "Order Process", poolType: "white-box",
      lanes: [{ id: "l1", name: "Sales" }, { id: "l2", name: "Finance" }],
    },
    { id: "cust", type: "pool", label: "Customer", poolType: "black-box", isSystem: false },
    { id: "s", type: "start-event", label: "Order received", pool: "p", lane: "l1" },
    { id: "t1", type: "task", label: "Review order", taskType: "user", pool: "p", lane: "l1" },
    { id: "g", type: "gateway", label: "Approved?", gatewayType: "exclusive", pool: "p", lane: "l1" },
    { id: "t2", type: "task", label: "Process payment", taskType: "user", pool: "p", lane: "l2" },
    { id: "t3", type: "task", label: "Reject order", taskType: "user", pool: "p", lane: "l1" },
    { id: "m", type: "gateway", label: "", gatewayType: "exclusive", pool: "p", lane: "l2" },
    { id: "e", type: "end-event", label: "Order closed", pool: "p", lane: "l2" },
  ];
  const connections: AiConnection[] = [
    { sourceId: "s", targetId: "t1" },
    { sourceId: "cust", targetId: "s", type: "message", label: "Purchase order" },
    { sourceId: "t1", targetId: "g" },
    { sourceId: "g", targetId: "t2", label: "Yes" },
    { sourceId: "g", targetId: "t3", label: "No" },
    { sourceId: "t2", targetId: "m" },
    { sourceId: "t3", targetId: "m" },
    { sourceId: "m", targetId: "e" },
  ];
  const laid = layoutBpmnDiagram(elements, connections);
  return laid;
}

describe("reverse — buildBpmnPrompt describes a drawn diagram for re-generation", () => {
  it("emits the canonical narrative sections", () => {
    const { elements, connectors } = bpmnFixture();
    const prompt = buildBpmnPrompt(elements, connectors);

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    // The actual section structure the builder emits.
    expect(prompt).toContain("**Trigger**");
    expect(prompt).toContain("**What happens**");
    expect(prompt).toContain("**External participants**");
    expect(prompt).toContain("**IT systems involved**");
    expect(prompt).toContain("**Data objects and stores**");
    expect(prompt).toContain("**Pools and Lanes**");
  });

  it("mentions the task labels, the gateway and its branch labels", () => {
    const { elements, connectors } = bpmnFixture();
    const prompt = buildBpmnPrompt(elements, connectors);

    // Tasks carry over verbatim.
    expect(prompt).toContain("Review order");
    expect(prompt).toContain("Process payment");
    expect(prompt).toContain("Reject order");
    // The labelled gateway and its Yes/No branches are described.
    expect(prompt).toContain("Approved?");
    expect(prompt).toContain("Yes");
    expect(prompt).toContain("No");
  });

  it("describes the trigger, the external participant and the structure", () => {
    const { elements, connectors } = bpmnFixture();
    const prompt = buildBpmnPrompt(elements, connectors);

    // The message-triggered start surfaces the external sender in the Trigger.
    expect(prompt).toContain("Customer");
    expect(prompt).toContain("Purchase order");
    // Pools/Lanes structural summary names the pool and its lanes.
    expect(prompt).toContain("Order Process");
    expect(prompt).toContain("Sales");
    expect(prompt).toContain("Finance");
  });

  it("buildPromptFromDiagram routes a BPMN diagram to the BPMN builder", () => {
    const { elements, connectors } = bpmnFixture();
    const viaRouter = buildPromptFromDiagram(elements, connectors, "bpmn");
    const direct = buildBpmnPrompt(elements, connectors);
    expect(viaRouter).toBe(direct);
  });

  it("describes a plain linear flow (the engine wraps it in an auto-pool)", () => {
    // A poolless linear plan is laid out into a single auto-created white-box
    // pool, so the builder still produces the full narrative (it only emits
    // the "No pools" fallback when the laid-out diagram genuinely has none).
    const laid = layoutBpmnDiagram(
      [
        { id: "s", type: "start-event", label: "Start" },
        { id: "t", type: "task", label: "Do thing" },
        { id: "e", type: "end-event", label: "Done" },
      ],
      [
        { sourceId: "s", targetId: "t" },
        { sourceId: "t", targetId: "e" },
      ],
    );
    const prompt = buildBpmnPrompt(laid.elements, laid.connectors);
    expect(prompt).toContain("**What happens**");
    expect(prompt).toContain("Do thing");
    expect(prompt).toContain("The process ends with **Done**");
  });

  it("emits the explicit 'No pools' fallback when there are genuinely no pools", () => {
    // Bypass the layout engine: hand the builder raw elements with no pool.
    const prompt = buildBpmnPrompt(
      [
        { id: "t", type: "task", label: "Do thing", x: 0, y: 0, width: 100, height: 60 } as never,
      ],
      [],
    );
    expect(prompt).toContain("No pools");
  });
});
