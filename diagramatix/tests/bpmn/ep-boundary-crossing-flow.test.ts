/**
 * V06.08 (2026-08-29): "There is a connector from 'Commercial model viable?' BACK
 * into an activity 'Finalise commercial model and document assumptions' in the EP."
 *
 * BPMN forbids a sequence flow crossing a subprocess boundary, and `canConnect`
 * refuses to draw one in the editor — so a generated diagram must not carry one.
 * The repair is the standard one: move the endpoint that is INSIDE out to the
 * subprocess itself, which is what the flow means — re-enter the loop, not jump
 * into the middle of it.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection, type LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";

const run = (els: AiElement[], conns: AiConnection[]) => {
  const diagnostics: LayoutDiagnostic[] = [];
  const out = layoutBpmnDiagram(els, conns, { onDiagnostic: (d) => diagnostics.push(d) });
  return { out, diagnostics };
};

/** start → EP → gateway → end, EP holding start/k1/k2/end. */
function build() {
  const els: AiElement[] = [
    { id: "p1", type: "pool", label: "Product Organisation", poolType: "white-box" },
    { id: "lFin", type: "lane", label: "Finance", parentPool: "p1" },
    { id: "s", type: "start-event", label: "Inputs received", pool: "p1", lane: "lFin" },
    { id: "sp1", type: "subprocess-expanded", label: "Repeat Until Pricing Model Validated", pool: "p1", lane: "lFin" },
    { id: "g", type: "gateway", label: "Commercial model viable?", gatewayType: "exclusive", pool: "p1", lane: "lFin" },
    { id: "e", type: "end-event", label: "Validated", pool: "p1", lane: "lFin" },
    { id: "is", type: "start-event", label: "", parentSubprocess: "sp1" },
    { id: "k1", type: "task", label: "Analyse feedback", parentSubprocess: "sp1" },
    { id: "k2", type: "task", label: "Finalise commercial model and document assumptions", parentSubprocess: "sp1" },
    { id: "ie", type: "end-event", label: "", parentSubprocess: "sp1" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "sp1" }, { sourceId: "sp1", targetId: "g" }, { sourceId: "g", targetId: "e" },
    { sourceId: "is", targetId: "k1" }, { sourceId: "k1", targetId: "k2" }, { sourceId: "k2", targetId: "ie" },
  ];
  return { els, conns };
}

/** Does any sequence flow have one end inside an EP and the other outside it? */
function crossings(out: ReturnType<typeof layoutBpmnDiagram>) {
  const byId = new Map(out.elements.map((e) => [e.id, e]));
  const epOf = (id: string) => {
    let cur = byId.get(id);
    for (let d = 0; d < 16 && cur; d++) {
      const p = cur.parentId ? byId.get(cur.parentId) : undefined;
      if (p?.type === "subprocess-expanded") return p.id;
      cur = p;
    }
    return undefined;
  };
  return out.connectors.filter((c) => {
    if (c.type && c.type !== "sequence") return false;
    const a = byId.get(c.sourceId), b = byId.get(c.targetId);
    if (!a || !b || a.boundaryHostId || b.boundaryHostId) return false;
    const ea = epOf(c.sourceId), eb = epOf(c.targetId);
    if (ea === eb) return false;
    // Touching the EP itself is legal.
    return !(ea === undefined && c.sourceId === eb) && !(eb === undefined && c.targetId === ea);
  }).map((c) => `${byId.get(c.sourceId)?.label} → ${byId.get(c.targetId)?.label}`);
}

describe("a sequence flow may not cross an expanded subprocess boundary", () => {
  it("T2930 — a loop-back INTO the subprocess is moved onto the subprocess itself", () => {
    const { els, conns } = build();
    conns.push({ sourceId: "g", targetId: "k2", label: "no" }); // the defect
    const { out, diagnostics } = run(els, conns);

    expect(crossings(out), "no flow may cross the EP boundary").toEqual([]);
    // The loop still exists — it just re-enters the subprocess properly.
    expect(out.connectors.some((c) => c.sourceId === "g" && c.targetId === "sp1")).toBe(true);
    expect(out.connectors.some((c) => c.targetId === "k2" && c.sourceId === "g")).toBe(false);
    expect(diagnostics.some((d) => d.detail.includes("crossed the boundary"))).toBe(true);
  });

  it("T2931 — a flow OUT of the subprocess's insides is moved the same way", () => {
    const { els, conns } = build();
    conns.push({ sourceId: "k2", targetId: "e" }); // inner → outer
    const { out } = run(els, conns);
    expect(crossings(out)).toEqual([]);
    expect(out.connectors.some((c) => c.sourceId === "sp1" && c.targetId === "e")).toBe(true);
  });

  it("T2932 — a boundary event's outgoing flow is left alone", () => {
    // It lives ON the rim: leaving the subprocess is the entire point of it.
    const { els, conns } = build();
    els.push({ id: "be", type: "intermediate-event", label: "Validation deadline exceeded", boundaryHost: "sp1", eventType: "timer" });
    els.push({ id: "esc", type: "end-event", label: "Escalate", pool: "p1", lane: "lFin" });
    conns.push({ sourceId: "be", targetId: "esc" });
    const { out } = run(els, conns);
    expect(out.connectors.some((c) => c.sourceId === "be" && c.targetId === "esc")).toBe(true);
  });

  it("T2933 — flows entirely inside, or entirely outside, are untouched", () => {
    const { els, conns } = build();
    const { out, diagnostics } = run(els, conns);
    expect(crossings(out)).toEqual([]);
    expect(diagnostics.filter((d) => d.detail.includes("crossed the boundary"))).toHaveLength(0);
    expect(out.connectors.some((c) => c.sourceId === "k1" && c.targetId === "k2")).toBe(true);
    expect(out.connectors.some((c) => c.sourceId === "sp1" && c.targetId === "g")).toBe(true);
  });
});
