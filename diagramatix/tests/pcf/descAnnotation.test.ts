import { describe, it, expect } from "vitest";
import { addDescriptionAnnotation } from "@/app/lib/pcf/descAnnotation";
import type { DiagramData } from "@/app/lib/diagram/types";

const flow = (): DiagramData => ({
  elements: [
    { id: "start", type: "start-event", x: 100, y: 200, width: 40, height: 40, label: "" },
    { id: "s1", type: "subprocess", x: 200, y: 190, width: 120, height: 60, label: "4.1.1 Assess" },
    { id: "end", type: "end-event", x: 380, y: 200, width: 40, height: 40, label: "" },
  ],
  connectors: [],
} as unknown as DiagramData);

describe("addDescriptionAnnotation (T0677)", () => {
  it("appends a boxed text-annotation with the description above the flow", () => {
    const out = addDescriptionAnnotation(flow(), "Assess demand and plan capacity across the network.");
    expect(out.elements.length).toBe(4);
    const annot = out.elements[out.elements.length - 1];
    expect(annot.type).toBe("text-annotation");
    expect(annot.properties.boxed).toBe(true);
    expect(annot.label).toContain("Assess demand");
    // placed above the topmost element (minY = 190)
    expect(annot.y).toBeLessThan(190);
  });

  it("is a no-op for a blank/whitespace description", () => {
    expect(addDescriptionAnnotation(flow(), "   ").elements.length).toBe(3);
    expect(addDescriptionAnnotation(flow(), null).elements.length).toBe(3);
    expect(addDescriptionAnnotation(flow(), undefined).elements.length).toBe(3);
  });

  it("is a no-op when there are no elements to anchor to", () => {
    const empty = { elements: [], connectors: [] } as unknown as DiagramData;
    expect(addDescriptionAnnotation(empty, "anything").elements.length).toBe(0);
  });

  it("truncates a very long description with an ellipsis", () => {
    const long = "x".repeat(2000);
    const annot = addDescriptionAnnotation(flow(), long).elements.at(-1)!;
    expect((annot.label as string).length).toBeLessThanOrEqual(700);
    expect(annot.label).toContain("…");
  });
});
