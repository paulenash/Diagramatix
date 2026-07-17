/**
 * UML association-end constraints — the combined { … } list (ordered / unique /
 * readOnly / union + free-form "other") and its round-trip parse used by image
 * ingestion and AI import.
 */
import { describe, it, expect } from "vitest";
import { buildConstraintText, parseConstraintText } from "@/app/lib/diagram/umlConstraints";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";

describe("buildConstraintText", () => {
  it("returns null when nothing is set", () => {
    expect(buildConstraintText({})).toBeNull();
    expect(buildConstraintText(null)).toBeNull();
    expect(buildConstraintText({ other: "   " })).toBeNull();
  });

  it("orders the canonical flags then the comma-split other tokens, in one { }", () => {
    expect(buildConstraintText({
      readOnly: true, union: true, other: "subsets member, subsets ownedElement",
    })).toBe("{readOnly, union, subsets member, subsets ownedElement}");
  });

  it("keeps canonical order regardless of which flags are set", () => {
    expect(buildConstraintText({ union: true, ordered: true })).toBe("{ordered, union}");
  });
});

describe("parseConstraintText", () => {
  it("classifies canonical keywords case-insensitively and keeps the rest as other", () => {
    const c = parseConstraintText("{readOnly, Union, subsets member}");
    expect(c.readOnly).toBe(true);
    expect(c.union).toBe(true);
    expect(c.other).toBe("subsets member");
    expect(c.ordered).toBeUndefined();
  });

  it("tolerates a missing outer brace and extra spaces", () => {
    expect(parseConstraintText("  ordered ,  unique ")).toEqual({ ordered: true, unique: true });
  });

  it("round-trips with buildConstraintText", () => {
    const text = "{ordered, readOnly, subsets a, subsets b}";
    expect(buildConstraintText(parseConstraintText(text))).toBe(text);
  });
});

describe("image ingestion maps end constraints + derived onto the connector", () => {
  it("parses sourceConstraint/targetConstraint and derived flags", () => {
    const parsed = {
      elements: [
        { id: "a", type: "uml-class", label: "Package", bounds: { x: 0.1, y: 0.2, w: 0.2, h: 0.2 } },
        { id: "b", type: "uml-class", label: "Element", bounds: { x: 0.6, y: 0.2, w: 0.2, h: 0.2 } },
      ],
      connections: [
        { sourceId: "a", targetId: "b", type: "uml-association",
          sourceRole: "owner", sourceDerived: true,
          targetRole: "ownedElement", targetConstraint: "{readOnly, union, subsets member}" },
      ],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 700 } });
    const conn = data.connectors.find(c => c.sourceId === "a")!;
    expect(conn.sourceDerived).toBe(true);
    expect(conn.sourceRole).toBe("owner");
    expect(conn.targetReadOnly).toBe(true);
    expect(conn.targetUnion).toBe(true);
    expect(conn.targetConstraintOther).toBe("subsets member");
    // ordered/unique not present → undefined
    expect(conn.targetOrdered).toBeUndefined();
  });
});
