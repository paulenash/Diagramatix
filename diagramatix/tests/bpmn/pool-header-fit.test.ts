/**
 * A generated multi-line Pool name must not overflow its header strip (B32).
 *
 * Regression: wrapPoolName sized the header at font 12 while the renderer + the
 * B32 overflow check (checkPoolHeaderLabelOverrun) use the pool font size 16, so a
 * name wrapping to 3 lines got a strip only wide enough for ~2 → the "Pool / Lane
 * label overflows the header region" warning fired on freshly-generated pools.
 */
import { describe, it, expect } from "vitest";
import { wrapPoolName } from "@/app/lib/diagram/bpmnLayout";
import { checkPoolHeaderLabelOverrun } from "@/app/lib/diagram/checks/diagramChecks";
import { healPoolHeaderWidths } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const B32_LINE_H = 16 * 1.18; // the height the B32 check gives each stacked line

const poolFrom = (name: string): DiagramElement => {
  const { label, headerWidth } = wrapPoolName(name);
  return {
    id: "p", type: "pool", label, x: 0, y: 0, width: 400, height: 200,
    properties: { poolType: "black-box", poolHeaderWidth: headerWidth },
  } as DiagramElement;
};

describe("generated pool header fits its wrapped name (B32)", () => {
  // Names chosen to wrap to 2, 3 and 4 lines (MAX_CHARS = 18).
  const cases: Array<[string, number]> = [
    ["Order Processing Team", 2],
    ["Warehouse Management System Integration Hub", 3],
    ["Warehouse Management System Integration and Distribution Fulfilment Hub", 5],
  ];

  for (const [name, expectLines] of cases) {
    it(`"${name}" wraps to ${expectLines} lines and does not overflow`, () => {
      const pool = poolFrom(name);
      expect((pool.label ?? "").split("\n").length).toBe(expectLines);
      // The strip is wide enough at font 16 for every line it wrapped to…
      const headerWidth = pool.properties!.poolHeaderWidth as number;
      expect(Math.floor(headerWidth / B32_LINE_H)).toBeGreaterThanOrEqual(expectLines);
      // …so B32 does not flag it.
      expect(checkPoolHeaderLabelOverrun({ elements: [pool], connectors: [] })).toHaveLength(0);
    });
  }
});

describe("healPoolHeaderWidths — old diagrams with a too-narrow header self-heal on load", () => {
  it("widens a stale black-box pool header (37 → fits) and clears the B32 warning", () => {
    // A pre-fix black-box pool: 2-line label but a header strip sized for font 12.
    const d: DiagramData = {
      elements: [{
        id: "bb", type: "pool", label: "Billing / ERP\nSystem", x: 100, y: 0, width: 1520, height: 114,
        properties: { poolType: "black-box", isSystem: true, poolHeaderWidth: 37 },
      } as DiagramElement],
      connectors: [],
    } as DiagramData;
    expect(checkPoolHeaderLabelOverrun(d)).toHaveLength(1);

    const healed = healPoolHeaderWidths(d);
    const bb = healed.elements[0];
    expect((bb.properties!.poolHeaderWidth as number)).toBeGreaterThanOrEqual(46);
    expect(bb.x).toBe(100);         // black-box: no geometry shift
    expect(bb.width).toBe(1520);
    expect(checkPoolHeaderLabelOverrun(healed)).toHaveLength(0);
  });

  it("grows a white-box pool LEFT so its lanes stay put", () => {
    const d: DiagramData = {
      elements: [
        { id: "wb", type: "pool", label: "Billing / ERP\nSystem", x: 100, y: 0, width: 500, height: 200, properties: { poolType: "white-box", poolHeaderWidth: 37 } } as DiagramElement,
        { id: "l1", type: "lane", label: "L", x: 137, y: 0, width: 463, height: 200, parentId: "wb", properties: {} } as DiagramElement,
      ],
      connectors: [],
    } as DiagramData;
    const healed = healPoolHeaderWidths(d);
    const wb = healed.elements.find((e) => e.id === "wb")!;
    const lane = healed.elements.find((e) => e.id === "l1")!;
    const need = wb.properties!.poolHeaderWidth as number;
    expect(need).toBeGreaterThanOrEqual(46);
    expect(wb.x).toBe(100 - (need - 37));           // grew left by the shortfall
    expect(wb.x + need).toBe(137);                  // header right edge still flush with the lane
    expect(lane.x).toBe(137);                        // lane unmoved
  });

  it("returns the SAME object when every pool already fits (no false dirty)", () => {
    const d: DiagramData = {
      elements: [{ id: "p", type: "pool", label: "Sales", x: 0, y: 0, width: 400, height: 200, properties: { poolType: "white-box", poolHeaderWidth: 36 } } as DiagramElement],
      connectors: [],
    } as DiagramData;
    expect(healPoolHeaderWidths(d)).toBe(d);
  });
});
