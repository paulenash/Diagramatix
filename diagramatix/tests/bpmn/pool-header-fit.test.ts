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
import type { DiagramElement } from "@/app/lib/diagram/types";

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
