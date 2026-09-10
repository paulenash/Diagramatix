/**
 * Convert to BPMN is reachable, and the refine pass cannot change structure.
 *
 * A source-text tripwire, because neither claim can be reached by a unit test:
 * one is a menu entry inside a 7,000-line editor, the other is a property of a
 * prompt plus a merge. Both are the kind of thing that breaks while everything
 * still compiles and the suite stays green.
 *
 * The reachability half has a specific history in this codebase: the cold-start
 * button was gated on the gallery hand-off, so it existed only for people who
 * did not need it. A conversion nobody can find is the same failure.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { mergeRefinement } from "@/app/lib/ai/refineFlowchartBpmn";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

const read = (p: string) => readFileSync(p, "utf8");

describe("a person can actually get to it", () => {
  const editor = () => read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");

  it("T4099 - the editor offers Convert to BPMN on an EPC, and mounts the dialog", () => {
    const src = editor();
    expect(src, "no menu entry").toContain("Convert to BPMN");
    expect(src, "the entry must be gated on the EPC type").toMatch(/diagramType === "epc"/);
    expect(src, "the dialog is never mounted").toContain("<EpcToBpmnDialog");
    // A button that sets state nothing reads is the exact shape of the
    // cold-start bug — assert the state is both set and consumed.
    expect(src).toContain("setShowEpcToBpmn(true)");
    expect(src).toContain("{showEpcToBpmn &&");
  });

  it("T4100 - the dialog posts to a route that exists, and creates a BPMN diagram", () => {
    const dlg = read("app/components/EpcToBpmnDialog.tsx");
    const posted = dlg.match(/"\/api\/ai\/epc-to-bpmn\/refine"/);
    expect(posted, "the refine URL is not what the dialog posts to").toBeTruthy();
    // The advertised path must resolve to a handler.
    expect(read("app/api/ai/epc-to-bpmn/refine/route.ts")).toMatch(/export async function POST/);
    expect(dlg).toContain('"/api/diagrams"');
    expect(dlg).toMatch(/type: "bpmn"/);
  });

  it("T4101 - the dialog shows the refusals, and will not create until they are read", () => {
    // The whole argument for trusting the conversion is that it says what it
    // would not decide. A dialog that computed refusals and never showed them
    // would be worse than one that never computed them.
    const dlg = read("app/components/EpcToBpmnDialog.tsx");
    expect(dlg).toContain("Needs a person");
    // Rendered, not merely referenced. The first version of this assertion
    // looked for the string "report.refusals", which also appears in the count
    // at the top of the component — so a dialog that computed the refusals and
    // never listed them passed.
    expect(dlg, "the refusals are never rendered").toContain("report.refusals.map(");
    expect(dlg, "the create button must be gated until they are acknowledged")
      .toMatch(/disabled=\{busy \|\| \(needsPerson > 0 && !acknowledged\)\}/);
  });

  it("T4102 - it is a one-way conversion, and says so", () => {
    // BPMN → EPC is not in scope and must not be implied in the UI copy.
    expect(editor()).toMatch(/Create a new BPMN diagram from this EPC \(one-way\)/);
  });
});

describe("the refine pass cannot change the graph", () => {
  const plan = (): { elements: AiElement[]; connections: AiConnection[] } => ({
    elements: [
      { id: "p", type: "pool", label: "P", poolType: "white-box" },
      { id: "t1", type: "task", label: "Invoice verification", pool: "p", lane: "l1" },
      { id: "g1", type: "gateway", label: "", pool: "p", gatewayType: "exclusive" },
    ],
    connections: [{ sourceId: "t1", targetId: "g1", type: "sequence", label: "done" }],
  });

  it("T4103 - a model that returns a different graph changes nothing structural", () => {
    // The safety story is "structure is locked BY CONSTRUCTION", so the test
    // hands it the worst thing a model could return: extra elements, deletions,
    // re-types and re-parents, all at once.
    const p = plan();
    const hostile = {
      elements: [
        { id: "t1", type: "gateway", label: "Verify invoice", pool: "OTHER", lane: "OTHER", taskType: "user" },
        { id: "INVENTED", type: "task", label: "Something new" },
      ],
      connections: [
        { sourceId: "t1", targetId: "g1", label: "finished" },
        { sourceId: "INVENTED", targetId: "g1", label: "x" },
      ],
    };
    const out = mergeRefinement(p.elements, p.connections, hostile as never);

    expect(out.elements).toHaveLength(3);          // nothing added, nothing removed
    expect(out.connections).toHaveLength(1);
    const t1 = out.elements.find((e) => e.id === "t1")!;
    expect(t1.type).toBe("task");                  // not re-typed
    expect(t1.pool).toBe("p");                     // not re-parented
    expect(t1.lane).toBe("l1");
    expect(out.elements.some((e) => e.id === "INVENTED")).toBe(false);

    // …and the whitelisted fields DID come through, or the pass is pointless.
    expect(t1.label).toBe("Verify invoice");
    expect(t1.taskType).toBe("user");
    expect(out.connections[0].label).toBe("finished");
  });

  it("T4104 - the EPC refine prompt asks for verb phrases and forbids structure", () => {
    // EPC functions are conventionally nouns; BPMN tasks are verbs. That
    // rewrite is the pass's whole reason to exist.
    const src = read("app/lib/ai/refineEpcBpmn.ts");
    expect(src).toMatch(/VERB PHRASES/);
    expect(src).toMatch(/MUST NOT add, remove, reorder or re-parent/);
    // It reuses the shared merge rather than carrying a second copy of the
    // safety-critical code.
    expect(src).toContain("mergeRefinement");
  });
});
