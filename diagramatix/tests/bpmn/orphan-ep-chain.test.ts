/**
 * V06.08 (2026-08-29): "The EP 'Repeat Until Pricing Model Validated' is the
 * completely wrong size and should include the next 4 activities."
 *
 * The model got the TOPOLOGY right — an expanded subprocess sitting in the main
 * flow, plus a self-contained inner chain opening on an unlabelled start event
 * and closing on an unlabelled end event — and only the `parentSubprocess` links
 * were missing. Nothing in the dangling-reference repair can help: there is no
 * bad reference to fix, the field was never set. So the EP drew as a small empty
 * box while its four activities sat beside it in the lane.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection, type LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";

/** The V06.08 shape: main flow through the EP, inner chain floating beside it. */
function build(opts: { eps?: number; chains?: number } = {}) {
  const eps = opts.eps ?? 1, chains = opts.chains ?? 1;
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Product Organisation", poolType: "white-box" },
    { id: "l", type: "lane", label: "Finance", parentPool: "p" },
    { id: "s", type: "start-event", label: "Commercial Model Inputs Received", pool: "p", lane: "l" },
    { id: "sig", type: "intermediate-event", label: "Customer Buying Signal Received", pool: "p", lane: "l" },
  ];
  const conns: AiConnection[] = [{ sourceId: "s", targetId: "sig" }];
  let prev = "sig";
  for (let i = 0; i < eps; i++) {
    els.push({ id: `ep${i}`, type: "subprocess-expanded", label: `Repeat Until Validated ${i}`, pool: "p", lane: "l" });
    conns.push({ sourceId: prev, targetId: `ep${i}` });
    prev = `ep${i}`;
  }
  els.push({ id: "g", type: "gateway", label: "Commercial Model Viable?", gatewayType: "exclusive", pool: "p", lane: "l" });
  els.push({ id: "e", type: "end-event", label: "Commercial Model Validated", pool: "p", lane: "l" });
  conns.push({ sourceId: prev, targetId: "g" }, { sourceId: "g", targetId: "e" });

  // The floating inner chain(s) — NO parentSubprocess anywhere, exactly as the
  // model emitted them.
  for (let c = 0; c < chains; c++) {
    els.push({ id: `is${c}`, type: "start-event", label: "", pool: "p", lane: "l" });
    let p2 = `is${c}`;
    for (const [j, name] of ["Analyse Customer And Investor Feedback", "Revise Pricing Scenarios And Terms",
                             "Update Pricing Model Records In CRM", "Review Model Against Viability Thresholds"].entries()) {
      const id = `c${c}t${j}`;
      els.push({ id, type: "task", label: name, pool: "p", lane: "l" });
      conns.push({ sourceId: p2, targetId: id });
      p2 = id;
    }
    els.push({ id: `ie${c}`, type: "end-event", label: "", pool: "p", lane: "l" });
    conns.push({ sourceId: p2, targetId: `ie${c}` });
  }
  return { els, conns };
}

const run = (els: AiElement[], conns: AiConnection[]) => {
  const diagnostics: LayoutDiagnostic[] = [];
  const out = layoutBpmnDiagram(els, conns, { onDiagnostic: (d) => diagnostics.push(d) });
  return { out, diagnostics };
};

describe("An empty Expanded Subprocess adopts a floating internal chain", () => {
  it("T2921 — the four activities end up INSIDE the subprocess", () => {
    const { els, conns } = build();
    const { out, diagnostics } = run(els, conns);
    const ep = out.elements.find((x) => x.id === "ep0")!;
    const kids = out.elements.filter((k) => k.parentId === "ep0");
    expect(kids.map((k) => k.id).sort()).toEqual(
      ["c0t0", "c0t1", "c0t2", "c0t3", "ie0", "is0"],
    );
    // …and the box is sized to hold them, not left as an empty stub.
    for (const k of kids) {
      expect(k.x, `${k.label || k.type} left of the EP`).toBeGreaterThanOrEqual(ep.x);
      expect(k.x + k.width, `${k.label || k.type} right of the EP`).toBeLessThanOrEqual(ep.x + ep.width);
    }
    expect(ep.width).toBeGreaterThan(600);
    // The recovery is reported, never silent.
    expect(diagnostics.some((d) => d.detail.includes("floating internal chain"))).toBe(true);
    expect(diagnostics.some((d) => d.kind === "empty-subprocess")).toBe(false);
  });

  it("T2922 — two subprocesses and two chains pair up in declaration order", () => {
    const { els, conns } = build({ eps: 2, chains: 2 });
    const { out } = run(els, conns);
    expect(out.elements.filter((k) => k.parentId === "ep0")).toHaveLength(6);
    expect(out.elements.filter((k) => k.parentId === "ep1")).toHaveLength(6);
  });

  it("T2923 — an ambiguous pairing is refused, not guessed", () => {
    // Two empty subprocesses and ONE chain: adopting it into either is a coin
    // flip, and a wrong adoption is worse than an empty box.
    const { els, conns } = build({ eps: 2, chains: 1 });
    const { out, diagnostics } = run(els, conns);
    expect(out.elements.filter((k) => k.parentId === "ep0")).toHaveLength(0);
    expect(out.elements.filter((k) => k.parentId === "ep1")).toHaveLength(0);
    expect(diagnostics.some((d) => d.detail.includes("cannot pair them safely"))).toBe(true);
  });

  it("T2924 — a normal main flow is never mistaken for an orphan chain", () => {
    // The counter-guard. A process-level start carries a real label and roots
    // the main flow; nothing here should be adopted by anything.
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "P", poolType: "white-box" },
      { id: "s", type: "start-event", label: "Order received", pool: "p" },
      { id: "ep", type: "subprocess-expanded", label: "Check Order", pool: "p" },
      { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
      { id: "t", type: "task", label: "Validate", parentSubprocess: "ep" },
      { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
      { id: "e", type: "end-event", label: "Order checked", pool: "p" },
    ];
    const conns: AiConnection[] = [
      { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" },
      { sourceId: "es", targetId: "t" }, { sourceId: "t", targetId: "ee" },
    ];
    const { out, diagnostics } = run(els, conns);
    expect(out.elements.filter((k) => k.parentId === "ep")).toHaveLength(3);
    expect(diagnostics, JSON.stringify(diagnostics)).toHaveLength(0);
  });
});
