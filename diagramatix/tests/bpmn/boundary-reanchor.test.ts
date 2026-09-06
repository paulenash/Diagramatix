import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { findLayoutViolations, findReadabilityViolations } from "@/app/lib/diagram/checks/layoutViolations";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

/**
 * Paul, 2026-09-06 on V16.06: EMIE "GRC submission rejected" is "misplaced far
 * from its boundary."
 *
 * It was 504px below its host, sitting inside a task in the NEXT LANE DOWN.
 * Traced phase by phase (DGX_TRACE_EL), it was placed correctly on the host's
 * edge and then moved by container expansion while the host stayed put; a later
 * pass re-derived its X from the host and left the Y, so it kept the right
 * horizontal position one whole lane too low — which is why it looked deliberate
 * rather than dropped.
 *
 * R8.14 re-asserts the relationship once, at the end, exactly as R55.6 and R55.7
 * do: chasing every pass that might move something has failed repeatedly in this
 * engine.
 */
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "V16.06.plan.json");

function laidOut() {
  const j = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const plan = j.diagrams[0].data.aiGeneration.plan;
  return layoutBpmnDiagram(plan.elements, plan.connections);
}

/** How far the event's centre sits outside its host's box. 0 = on it. */
function offHost(ev: DiagramElement, host: DiagramElement) {
  const cx = ev.x + ev.width / 2, cy = ev.y + ev.height / 2;
  return Math.max(
    Math.max(host.x - cx, 0, cx - (host.x + host.width)),
    Math.max(host.y - cy, 0, cy - (host.y + host.height)),
  );
}

describe("R8.14 — a boundary event stays on its host (V16.06)", () => {
  const r = laidOut();
  const by = (id: string) => r.elements.find((e) => e.id === id)!;

  it("T3292 every boundary event's centre is on its host's rim", () => {
    const strays = r.elements
      .filter((e) => e.boundaryHostId && by(e.boundaryHostId))
      .map((e) => ({ id: e.id, off: Math.round(offHost(e, by(e.boundaryHostId!))) }))
      .filter((x) => x.off > 4);
    expect(strays, JSON.stringify(strays)).toEqual([]);
  });

  it("T3293 the one that strayed is back on its host, in its host's lane", () => {
    const ev = by("bErr"), host = by("t13");
    expect(offHost(ev, host)).toBeLessThanOrEqual(4);
    // It had been parented outside its host's container, which is how it came to
    // be measured against another lane's rows in the first place.
    expect(ev.parentId).toBe(host.parentId);
  });

  it("T3294 it leaves on the side its own flow goes, and not into a neighbour", () => {
    // "right" is nearer by distance, and walks straight into the task alongside
    // — which is what sent the router down a whole lane and back up to get
    // around it. The second axis is taken when the first is walled in.
    const ev = by("bErr"), host = by("t13");
    expect(ev.y + ev.height / 2).toBeCloseTo(host.y + host.height, 0);
    // ...and off-centre, toward the target, so the drop clears the doorway the
    // incoming flow arrives through.
    expect(ev.x + ev.width / 2).toBeGreaterThan(host.x + host.width / 2);
  });

  it("T3295 a boundary event already on its host is left alone", () => {
    // R7.04's off-corner placement and R7.05's outward exit put events where
    // they are on purpose. This rule repairs, it does not re-place.
    const ev = by("bTimer"), host = by("sp1");
    expect(offHost(ev, host)).toBe(0);
  });

  it("T3296 V16.06 lays out with no defect and no crossing", () => {
    const data = { elements: r.elements, connectors: r.connectors } as DiagramData;
    const v = [...findLayoutViolations(data), ...findReadabilityViolations(data)];
    expect(v, v.join("; ")).toEqual([]);
  });
});
