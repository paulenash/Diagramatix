/**
 * R8.02 — a Data Object's input/output marker.
 *
 * Paul, 2026-08-29 on V06.08: "a Data Object with one or more incoming
 * associations AND one or more outgoing associations should not have any marker
 * shown. Currently, at least 4 examples showing Output marker."
 *
 * The role used to be read off whichever association happened to be FIRST in the
 * connector list, which for a read/write object is arbitrary — so a data object
 * that a step writes and a later step reads came out marked "output".
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { checkDataObjectRole } from "@/app/lib/diagram/checks/diagramChecks";

/** start → A → B → end, with `d` wired to A and/or B as asked. */
function build(links: { write?: boolean; read?: boolean }) {
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Product Organisation", poolType: "white-box" },
    { id: "s", type: "start-event", label: "In", pool: "p" },
    { id: "a", type: "task", label: "Develop Pricing Scenarios", pool: "p" },
    { id: "b", type: "task", label: "Send Pricing Scenarios To Investor", pool: "p" },
    { id: "e", type: "end-event", label: "Out", pool: "p" },
    { id: "d", type: "data-object", label: "Pricing Scenarios", pool: "p" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "b" }, { sourceId: "b", targetId: "e" },
  ];
  // A writes it (element → data), B reads it (data → element).
  if (links.write) conns.push({ sourceId: "a", targetId: "d" });
  if (links.read) conns.push({ sourceId: "d", targetId: "b" });
  return { els, conns };
}

const roleOf = (els: AiElement[], conns: AiConnection[]) => {
  const out = layoutBpmnDiagram(els, conns);
  return out.elements.find((x) => x.id === "d")!.properties?.role;
};

describe("R8.02 — Data Object role marker", () => {
  it("T2917 — written AND read: no marker at all", () => {
    const { els, conns } = build({ write: true, read: true });
    expect(roleOf(els, conns)).toBeUndefined();
  });

  it("T2918 — written AND read: the order of the associations does not decide it", () => {
    // The actual defect: the role came from links[0]. Reversing the two
    // associations used to flip the marker; now neither produces one.
    const { els, conns } = build({ write: true, read: true });
    const reversed = [conns[0], conns[1], conns[2], conns[4], conns[3]];
    expect(roleOf(els, conns)).toBeUndefined();
    expect(roleOf(els, reversed)).toBeUndefined();
  });

  it("T2919 — written only is an output, read only is an input", () => {
    expect(roleOf(...Object.values(build({ write: true })) as [AiElement[], AiConnection[]])).toBe("output");
    expect(roleOf(...Object.values(build({ read: true })) as [AiElement[], AiConnection[]])).toBe("input");
  });

  it("T2920 — B37 flags a both-directions Data Object that still carries a marker", () => {
    // The scanner has to catch it too, or an imported / hand-edited diagram
    // keeps a marker the generator would never produce.
    const bad = {
      elements: [
        { id: "a", type: "task", label: "A" },
        { id: "b", type: "task", label: "B" },
        { id: "d", type: "data-object", label: "Pricing Scenarios", properties: { role: "output" } },
      ],
      connectors: [
        { id: "c1", sourceId: "a", targetId: "d", type: "associationBPMN" },
        { id: "c2", sourceId: "d", targetId: "b", type: "associationBPMN" },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const v = checkDataObjectRole(bad);
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("BOTH directions");
    // …and says nothing when the marker is correctly absent.
    delete bad.elements[2].properties.role;
    expect(checkDataObjectRole(bad)).toHaveLength(0);
  });
});
