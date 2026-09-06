import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { findLayoutViolations, findReadabilityViolations } from "@/app/lib/diagram/checks/layoutViolations";
import type { DiagramData, LayoutDiagnostic } from "@/app/lib/diagram/types";

/**
 * Paul, 2026-09-06: "V16.09 Confirm Service Restoration (1).json appears to be
 * ok despite errors / warnings."
 *
 * It was ok — and so was the plan. The diagram reported eight problems against a
 * model that had made none.
 *
 * The pass that works out what lives inside an expanded subprocess walks forward
 * from its start event and backward from its end event and keeps the
 * intersection. It excluded MESSAGE flows but not ASSOCIATIONS — and a data
 * object is attached at both ends. "Restoration Acceptance Criteria" hangs off a
 * task before the loop and off one inside it, so the backward walk stepped out
 * through it into the lane in front of the loop; another data object let the
 * forward walk step out behind it. The intersection swallowed seven ordinary
 * tasks and the subprocess itself, which then became its own parent.
 *
 * A later pass noticed the loop's Start Event could not reach any of them and
 * put them back, so the drawing came out right. But the warnings blamed the
 * model — "declared inside …" — for something it never declared. A warning that
 * names an innocent party is worse than no warning: it gets read, acted on, and
 * teaches the reader to discount the next one.
 *
 * Containment follows the flow. An association says "this task uses this
 * document", which is true across any boundary.
 */
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "V16.09.plan.json");

function laidOut() {
  const j = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const plan = j.diagrams[0].data.aiGeneration.plan;
  const diagnostics: LayoutDiagnostic[] = [];
  const r = layoutBpmnDiagram(plan.elements, plan.connections, { onDiagnostic: (d) => diagnostics.push(d) });
  return { r, diagnostics, plan };
}

describe("containment follows sequence flow, not associations (V16.09)", () => {
  /**
   * THE load-bearing assertion. On the previous commit this one fails and the
   * four below it pass — because the recovery pass had already put everything
   * back, so the DRAWING was right and only the warnings were wrong. The others
   * are here to keep it that way, not to prove the fix.
   */
  it("T3287 a clean plan produces no diagnostics at all", () => {
    const { diagnostics } = laidOut();
    expect(diagnostics.map((d) => `${d.kind}: ${d.label} — ${d.detail}`)).toEqual([]);
  });

  it("T3288 the loop holds exactly the steps that repeat", () => {
    // Three tasks between its own start and end — not the seven that surround it.
    const { r } = laidOut();
    const inside = r.elements.filter((e) => e.parentId === "sp_loop");
    expect(inside.map((e) => e.type).sort()).toEqual(["end-event", "start-event", "task", "task", "task"]);
    expect(inside.filter((e) => e.type === "task").map((e) => (e.label ?? "").replace(/\s+/g, " ")).sort())
      .toEqual([
        "Record check results in IT Service Management",
        "Review outstanding service defects",
        "Run service validation checks",
      ]);
  });

  it("T3289 the tasks the associations reach are OUTSIDE the loop, where the flow puts them", () => {
    const { r } = laidOut();
    for (const id of ["t_retrieve", "t_criteria", "t_confirm_levels", "t_signoff", "t_update_incident"]) {
      const el = r.elements.find((e) => e.id === id)!;
      expect(el, id).toBeTruthy();
      expect(el.parentId, `${id} was swallowed by the loop`).not.toBe("sp_loop");
    }
  });

  it("T3290 the subprocess is never its own parent", () => {
    // It swept itself up, and then nothing placed it — or anything below it.
    const { r } = laidOut();
    const sp = r.elements.find((e) => e.id === "sp_loop")!;
    expect(sp.parentId).not.toBe("sp_loop");
  });

  it("T3291 and the diagram itself is clean", () => {
    const { r } = laidOut();
    const data = { elements: r.elements, connectors: r.connectors } as DiagramData;
    const v = [...findLayoutViolations(data), ...findReadabilityViolations(data)];
    expect(v, v.join("; ")).toEqual([]);
  });
});
