/**
 * uml-package folder silhouette: a connector attaching to the TOP boundary must
 * meet the DRAWN outline — the tab on the left (at el.y) and the body top on the
 * right (el.y + tabH), not the empty bbox-top above the body. The tab geometry
 * is shared with the renderer (computePackageTab) so it tracks the package NAME.
 */
import { describe, it, expect } from "vitest";
import { computeWaypoints } from "@/app/lib/diagram/routing";
import { computePackageTab } from "@/app/lib/diagram/textMetrics";
import type { DiagramElement } from "@/app/lib/diagram/types";

const pkg = (label: string): DiagramElement =>
  ({ id: "p", type: "uml-package", label, x: 100, y: 100, width: 240, height: 140, properties: {} });
const other: DiagramElement =
  { id: "q", type: "uml-package", label: "Other", x: 100, y: -100, width: 200, height: 80, properties: {} };

describe("package top-boundary attachment", () => {
  it("snaps a top point RIGHT of the tab down to the body top (not floating above)", () => {
    const p = pkg("Sales");
    const { tabW, tabH } = computePackageTab(p);
    // Offset that lands well to the right of the tab.
    const rightOffset = Math.min(0.95, (tabW + (p.width - tabW) / 2) / p.width) + 0.001;
    const r = computeWaypoints(p, other, [p, other], "top", "bottom", "direct", rightOffset, 0.5);
    const srcEdge = r.waypoints[1];
    expect(srcEdge.x).toBeGreaterThan(p.x + tabW);   // right of the tab
    expect(srcEdge.y).toBeCloseTo(p.y + tabH, 1);    // snapped to the body top
  });

  it("keeps a top point WITHIN the tab at the tab top (el.y)", () => {
    const p = pkg("Sales");
    const { tabW } = computePackageTab(p);
    const leftOffset = Math.max(0.02, (tabW / 2) / p.width);
    const r = computeWaypoints(p, other, [p, other], "top", "bottom", "direct", leftOffset, 0.5);
    const srcEdge = r.waypoints[1];
    expect(srcEdge.x).toBeLessThan(p.x + tabW);      // within the tab
    expect(srcEdge.y).toBeCloseTo(p.y, 1);           // at the tab top
  });

  it("the tab width GROWS with the package name (so the snap boundary tracks it)", () => {
    expect(computePackageTab(pkg("A")).tabW).toBeLessThan(computePackageTab(pkg("A very long package name")).tabW);
  });
});
