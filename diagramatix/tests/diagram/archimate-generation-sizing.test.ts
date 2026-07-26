/**
 * Rule A4.09 — AI-generated ArchiMate boxes are sized to CONTAIN their wrapped
 * name at the DEFAULT aspect ratio (128×76), so generated shapes stay uniform
 * and no name spills outside the outline. Enforced in genericLayout's boxSize
 * (code, not the prompt — geometric rules live in the layout function).
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import { wrapText } from "@/app/lib/diagram/textMetrics";

const R = 128 / 76;           // default ArchiMate box aspect ratio
const PAD_X = 16, FONT = 12, LINE_H = 16;

function genBox(label: string) {
  const data = layoutGenericDiagram(
    { elements: [{ id: "e1", type: "application-component", label }], connections: [] } as never,
    "archimate",
  );
  const el = data.elements.find((e) => e.id === "e1");
  if (!el) throw new Error("generated element not found");
  return el;
}

describe("A4.09 — generated ArchiMate boxes contain the name at the default aspect ratio", () => {
  it("holds the default aspect ratio and default footprint for a short name", () => {
    const el = genBox("CRM");
    expect(el.width / el.height).toBeCloseTo(R, 1);
    expect(el.width).toBeGreaterThanOrEqual(128);
    expect(el.height).toBeGreaterThanOrEqual(76);
  });

  it("grows to contain a long name (no text outside) while keeping the aspect ratio", () => {
    const long = "Customer Relationship Management and Billing Reconciliation Platform";
    const el = genBox(long);
    // Aspect ratio preserved even though the box had to grow.
    expect(el.width / el.height).toBeCloseTo(R, 1);
    expect(el.height).toBeGreaterThan(76);
    // The name, wrapped to the box interior, fits vertically inside the box.
    const lines = wrapText(long, el.width - PAD_X, FONT);
    expect(lines.length * LINE_H).toBeLessThanOrEqual(el.height);
    // …and no single wrapped line is wider than the interior (nothing spills sideways).
    const widest = Math.max(...lines.map((l) => l.length * FONT * 0.55));
    expect(widest).toBeLessThanOrEqual(el.width - PAD_X + 1);
  });
});
