/**
 * Issue 6 (2026-07-29): a gateway INSIDE an Expanded Subprocess must ignore its
 * own container (the EP) when placing its label. Otherwise the EP box — which
 * surrounds the gateway — reads as an obstacle at EVERY nearby angle, sweeping
 * the label uselessly far out from the gateway.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// A decision gateway living inside an EP (with a labelled question).
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box" },
  { id: "s", type: "start-event", label: "S", pool: "p" },
  { id: "ep", type: "subprocess-expanded", label: "Do Work", pool: "p" },
  { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
  { id: "t1", type: "task", label: "Check", parentSubprocess: "ep" },
  { id: "dg", type: "gateway", gatewayType: "exclusive", label: "Complete?", parentSubprocess: "ep" },
  { id: "t2", type: "task", label: "Fix", parentSubprocess: "ep" },
  { id: "m", type: "gateway", gatewayType: "exclusive", label: "", parentSubprocess: "ep" },
  { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
  { id: "e", type: "end-event", label: "E", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" },
  { sourceId: "es", targetId: "t1" }, { sourceId: "t1", targetId: "dg" },
  { sourceId: "dg", targetId: "t2" }, { sourceId: "dg", targetId: "m" },
  { sourceId: "t2", targetId: "m" }, { sourceId: "m", targetId: "ee" },
];

describe("Issue 6 — a decision label inside an EP ignores the EP", () => {
  it("T1064 — the gateway label stays snug to the gateway (not swept far to clear its own EP)", () => {
    const out = layoutBpmnDiagram(els, conns);
    const dg = out.elements.find((e) => e.id === "dg")!;
    const ox = (dg.properties.labelOffsetX as number) ?? 0;
    const oy = (dg.properties.labelOffsetY as number) ?? 0;
    // Snug: within ~2 Task-heights of the gateway. Avoiding the enclosing EP box
    // would push the label out past the EP edge (well beyond this).
    const dist = Math.hypot(ox, oy);
    expect(dist, `label offset (${Math.round(ox)},${Math.round(oy)}) should be snug, not swept out to clear the EP`).toBeLessThanOrEqual(130);
  });
});
