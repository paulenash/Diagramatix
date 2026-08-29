/**
 * V06.08 (2026-08-29): eighteen of the twenty elements in the Finance lane came
 * back "nothing placed it", with ZERO reference errors — so whatever the plan
 * named looked valid to every check.
 *
 * A self-reference is exactly that shape. `parentSubprocess` naming an expanded
 * subprocess IS valid — unless the element doing the naming is that subprocess.
 * It then costs the whole diagram: the subprocess is dropped from flow placement
 * on the understanding that the subprocess-child pass owns it, that pass
 * positions children against a parent that was never placed, and everything
 * downstream in the flow goes with it.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection, type LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";

const run = (els: AiElement[], conns: AiConnection[]) => {
  const diagnostics: LayoutDiagnostic[] = [];
  const out = layoutBpmnDiagram(els, conns, { onDiagnostic: (d) => diagnostics.push(d) });
  return { out, diagnostics };
};

/** start → A → EP → B → end, with the EP's containment field set by the caller. */
function build(mutate: (els: AiElement[]) => void) {
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Product Organisation", poolType: "white-box" },
    { id: "l", type: "lane", label: "Finance", parentPool: "p" },
    { id: "s", type: "start-event", label: "Commercial Model Inputs Received", pool: "p", lane: "l" },
    { id: "a", type: "task", label: "Review Business Case Assumptions", pool: "p", lane: "l" },
    { id: "ep", type: "subprocess-expanded", label: "Repeat Until Pricing Model Validated", pool: "p", lane: "l" },
    { id: "b", type: "task", label: "Finalise Validated Commercial Model", pool: "p", lane: "l" },
    { id: "e", type: "end-event", label: "Commercial Model Validated", pool: "p", lane: "l" },
    { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
    { id: "k", type: "task", label: "Analyse Feedback", parentSubprocess: "ep" },
    { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "ep" },
    { sourceId: "ep", targetId: "b" }, { sourceId: "b", targetId: "e" },
    { sourceId: "es", targetId: "k" }, { sourceId: "k", targetId: "ee" },
  ];
  mutate(els);
  return { els, conns };
}

describe("containment cycles in the AI plan", () => {
  it("T2925 — a subprocess naming ITSELF as its parent is cleared, and the flow still places", () => {
    const { els, conns } = build((e) => { e.find((x) => x.id === "ep")!.parentSubprocess = "ep"; });
    const { out, diagnostics } = run(els, conns);

    expect(diagnostics.some((d) => d.field === "parentSubprocess" && d.detail.includes("the element itself"))).toBe(true);
    // The point: nothing is left stranded.
    expect(diagnostics.filter((d) => d.kind === "unplaced"), "no element should go unplaced").toHaveLength(0);
    // And the subprocess is a real box in the lane with its children inside it.
    const ep = out.elements.find((x) => x.id === "ep")!;
    expect(ep.parentId).toBe("l");
    expect(out.elements.filter((k) => k.parentId === "ep")).toHaveLength(3);
  });

  it("T2926 — a two-step containment cycle is broken the same way", () => {
    const { els, conns } = build((e) => {
      e.push({ id: "ep2", type: "subprocess-expanded", label: "Inner", parentSubprocess: "ep" });
      e.find((x) => x.id === "ep")!.parentSubprocess = "ep2";
    });
    const { diagnostics } = run(els, conns);
    expect(diagnostics.some((d) => d.detail.includes("containment cycle") || d.detail.includes("the element itself"))).toBe(true);
    expect(diagnostics.filter((d) => d.kind === "unplaced")).toHaveLength(0);
  });

  it("T2927 — an activity mounted on ITSELF as a boundary host is cleared", () => {
    // An intermediate event naming itself is already caught upstream (an event is
    // not a valid host, so the reference simply does not resolve). The case that
    // reaches this guard is an ACTIVITY naming itself: it IS a valid host, so
    // every check passes and the element is then excluded from flow placement in
    // favour of a boundary pass that positions it against itself.
    const { els, conns } = build((e) => {
      e.find((x) => x.id === "b")!.boundaryHost = "b";
    });
    const { out, diagnostics } = run(els, conns);
    expect(diagnostics.some((d) => d.field === "boundaryHost" && d.detail.includes("the element itself"))).toBe(true);
    expect(diagnostics.filter((d) => d.kind === "unplaced")).toHaveLength(0);
    expect(out.elements.find((x) => x.id === "b")!.boundaryHostId).toBeUndefined();
  });

  it("T2928 — legitimate nesting is untouched", () => {
    // The counter-guard: a real inner subprocess inside an outer one is a chain,
    // not a cycle, and must survive.
    const { els, conns } = build((e) => {
      e.push({ id: "ep2", type: "subprocess-expanded", label: "Inner", parentSubprocess: "ep" });
      e.push({ id: "k2", type: "task", label: "Deep Step", parentSubprocess: "ep2" });
    });
    const { out, diagnostics } = run(els, conns);
    expect(diagnostics.filter((d) => d.kind === "unresolved-reference")).toHaveLength(0);
    expect(out.elements.find((x) => x.id === "ep2")!.parentId).toBe("ep");
    expect(out.elements.find((x) => x.id === "k2")!.parentId).toBe("ep2");
  });
});
