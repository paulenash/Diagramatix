/**
 * V06.08 (2026-08-29): "EP now encloses more activities, possibly too many."
 *
 * The stored plan declared FIFTEEN children of "Repeat Until Pricing Model
 * Validated". Its internal flow is six elements — «start» → Analyse → Revise →
 * Update → Review → «end». The other nine were the pre-loop steps and two
 * post-loop ones ("Finalise commercial model…", "Record finalised commercial
 * model…") that the viability gateway, which sits at the subprocess's own level,
 * branches to.
 *
 * Declared containment and declared flow contradicted each other. The flow is the
 * more reliable of the two: it is what the prompt describes and what every
 * downstream reader — simulation, the link scan, the .bpmn exporter — actually
 * uses. So the subprocess contains what its internal Start Event can reach.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection, type LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";

const run = (els: AiElement[], conns: AiConnection[]) => {
  const diagnostics: LayoutDiagnostic[] = [];
  const out = layoutBpmnDiagram(els, conns, { onDiagnostic: (d) => diagnostics.push(d) });
  return { out, diagnostics };
};

/** The V06.08 shape: a real loop, plus post-loop steps wrongly declared inside. */
function build() {
  const els: AiElement[] = [
    { id: "p1", type: "pool", label: "Product Organisation", poolType: "white-box" },
    { id: "lFin", type: "lane", label: "Finance", parentPool: "p1" },
    { id: "s", type: "start-event", label: "Commercial model inputs received", pool: "p1", lane: "lFin" },
    { id: "sp1", type: "subprocess-expanded", label: "Repeat Until Pricing Model Validated", pool: "p1", lane: "lFin" },
    { id: "g", type: "gateway", label: "Commercial model viable?", gatewayType: "exclusive", pool: "p1", lane: "lFin" },
    { id: "e", type: "end-event", label: "Validated", pool: "p1", lane: "lFin" },
    // The genuine internals.
    { id: "is", type: "start-event", label: "", parentSubprocess: "sp1" },
    { id: "k1", type: "task", label: "Analyse customer and investor feedback", parentSubprocess: "sp1" },
    { id: "k2", type: "task", label: "Revise pricing scenarios and terms", parentSubprocess: "sp1" },
    { id: "ie", type: "end-event", label: "", parentSubprocess: "sp1" },
    // Post-loop steps the model wrongly declared inside.
    { id: "x1", type: "task", label: "Finalise commercial model and document assumptions", parentSubprocess: "sp1" },
    { id: "x2", type: "task", label: "Record finalised commercial model in CRM", parentSubprocess: "sp1" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "sp1" }, { sourceId: "sp1", targetId: "g" },
    { sourceId: "is", targetId: "k1" }, { sourceId: "k1", targetId: "k2" }, { sourceId: "k2", targetId: "ie" },
    // The flow says these two come AFTER the gateway.
    { sourceId: "g", targetId: "x1", label: "yes" }, { sourceId: "x1", targetId: "x2" }, { sourceId: "x2", targetId: "e" },
  ];
  return { els, conns };
}

describe("a subprocess contains what its internal Start Event reaches", () => {
  it("T2934 — post-loop steps declared inside are moved out to the subprocess's own level", () => {
    const { els, conns } = build();
    const { out, diagnostics } = run(els, conns);

    expect(out.elements.filter((k) => k.parentId === "sp1").map((k) => k.id).sort())
      .toEqual(["ie", "is", "k1", "k2"]);
    // They land at the subprocess's own level — the lane — not floating.
    for (const id of ["x1", "x2"]) {
      expect(out.elements.find((k) => k.id === id)!.parentId, `${id} should be a sibling of the EP`).toBe("lFin");
    }
    expect(diagnostics.filter((d) => d.detail.includes("cannot reach it"))).toHaveLength(2);
    expect(diagnostics.filter((d) => d.kind === "unplaced")).toHaveLength(0);
  });

  it("T2935 — the gateway's flow to them survives, and crosses no boundary", () => {
    // The whole point: the flow was right and the containment was wrong, so the
    // flow must come through untouched rather than being re-pointed at the EP.
    const { els, conns } = build();
    const { out } = run(els, conns);
    expect(out.connectors.some((c) => c.sourceId === "g" && c.targetId === "x1")).toBe(true);
    expect(out.connectors.some((c) => c.sourceId === "x1" && c.targetId === "x2")).toBe(true);
  });

  it("T2936 — a data association out of the subprocess is not a boundary crossing", () => {
    // R8.02 deliberately places a data object OUTSIDE the EP it belongs to, so
    // treating its association as a crossing would drag every in-subprocess
    // task's data link onto the subprocess itself.
    const { els, conns } = build();
    els.push({ id: "d", type: "data-object", label: "Pricing Scenarios", pool: "p1", lane: "lFin" });
    conns.push({ sourceId: "k2", targetId: "d" });
    const { out } = run(els, conns);
    expect(out.elements.find((k) => k.id === "k2")!.parentId, "the task stays inside").toBe("sp1");
    expect(out.connectors.some((c) => c.sourceId === "k2" && c.targetId === "d"),
      "its data association still points at the task, not the subprocess").toBe(true);
  });

  it("T2937 — a subprocess with no single internal Start Event is left alone", () => {
    // Nothing to reach from: the rule has no basis for an opinion and stays out.
    const { els, conns } = build();
    els.find((x) => x.id === "is")!.type = "task";  // no internal start any more
    const { out, diagnostics } = run(els, conns);
    expect(out.elements.filter((k) => k.parentId === "sp1").length).toBe(6);
    expect(diagnostics.filter((d) => d.detail.includes("cannot reach it"))).toHaveLength(0);
  });
});
