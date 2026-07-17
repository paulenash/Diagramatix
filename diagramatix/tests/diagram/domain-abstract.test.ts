/**
 * Abstract entities — a uml-class may be abstract, shown as an italic name
 * (default) or a "{abstract}" line. AI generation + image ingestion set it via
 * `isAbstract` / `abstractDisplay`; the {abstract} line grows the box.
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import { autoResizeUmlElement } from "@/app/lib/diagram/umlAutoSize";
import type { DiagramElement } from "@/app/lib/diagram/types";

describe("abstract entity", () => {
  it("carries isAbstract + default italics display through generation", () => {
    const parsed = { elements: [{ id: "c", type: "uml-class", label: "Component", isAbstract: true }], connections: [] };
    const data = layoutGenericDiagram(parsed as never, "domain");
    const c = data.elements.find(e => e.id === "c")!;
    expect(c.properties.isAbstract).toBe(true);
    expect(c.properties.abstractDisplay).toBe("italics");
  });

  it("honours an explicit {abstract}-text display", () => {
    const parsed = { elements: [{ id: "c", type: "uml-class", label: "Shape", isAbstract: true, abstractDisplay: "text" }], connections: [] };
    const data = layoutGenericDiagram(parsed as never, "domain");
    expect(data.elements.find(e => e.id === "c")!.properties.abstractDisplay).toBe("text");
  });

  it("a non-abstract class carries no abstract flags", () => {
    const parsed = { elements: [{ id: "c", type: "uml-class", label: "Order" }], connections: [] };
    const data = layoutGenericDiagram(parsed as never, "domain");
    expect(data.elements.find(e => e.id === "c")!.properties.isAbstract).toBeFalsy();
  });

  it("the {abstract} line grows the box height; italics does not", () => {
    const base = { id: "c", type: "uml-class", x: 0, y: 0, width: 150, height: 70, label: "Shape", properties: {} } as DiagramElement;
    const plain = autoResizeUmlElement(base);
    const abstractText = autoResizeUmlElement({ ...base, properties: { isAbstract: true, abstractDisplay: "text" } });
    const abstractItalic = autoResizeUmlElement({ ...base, properties: { isAbstract: true, abstractDisplay: "italics" } });
    expect(abstractText.height).toBeGreaterThan(plain.height);
    expect(abstractItalic.height).toBe(plain.height);
  });
});
