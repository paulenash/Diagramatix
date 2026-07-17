/**
 * UML association-end constraints — the combined { … } list (ordered / unique /
 * readOnly / union + free-form "other") and its round-trip parse used by image
 * ingestion and AI import.
 */
import { describe, it, expect } from "vitest";
import { buildConstraintText, parseConstraintText, parseEndRole } from "@/app/lib/diagram/umlConstraints";
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

describe("parseEndRole", () => {
  it("pulls the leading visibility out of a role", () => {
    expect(parseEndRole("+ownerUpper")).toEqual({ role: "ownerUpper", visibility: "+" });
    expect(parseEndRole("- items")).toEqual({ role: "items", visibility: "-" });
  });
  it("pulls the derived slash out (with or without visibility)", () => {
    expect(parseEndRole("+/upper")).toEqual({ role: "upper", visibility: "+", derived: true });
    expect(parseEndRole("/lower")).toEqual({ role: "lower", derived: true });
  });
  it("returns a bare role unchanged", () => {
    expect(parseEndRole("upperValue")).toEqual({ role: "upperValue" });
    expect(parseEndRole("")).toEqual({});
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

  it("gives two links between the SAME pair distinct ids and parses role visibility", () => {
    // The Multiplicity metamodel: upperValue + lowerValue compositions both run
    // MultiplicityElement ↔ ValueSpecification, roles carry a "+" visibility.
    const parsed = {
      elements: [
        { id: "me", type: "uml-class", label: "MultiplicityElement", bounds: { x: 0.1, y: 0.4, w: 0.25, h: 0.2 } },
        { id: "vs", type: "uml-class", label: "ValueSpecification", bounds: { x: 0.7, y: 0.4, w: 0.22, h: 0.15 } },
      ],
      connections: [
        { sourceId: "me", targetId: "vs", type: "uml-composition",
          sourceRole: "+ownerUpper", sourceConstraint: "{subsets owner}",
          targetRole: "+upperValue", targetConstraint: "{subsets ownedElement}" },
        { sourceId: "me", targetId: "vs", type: "uml-composition",
          sourceRole: "+ownerLower", sourceConstraint: "{subsets owner}",
          targetRole: "+lowerValue", targetConstraint: "{subsets ownedElement}" },
      ],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 500 } });
    const links = data.connectors.filter(c => c.type === "uml-composition");
    expect(links).toHaveLength(2);
    // Distinct ids — the bug was both getting "conn-me-vs" and collapsing to one.
    expect(new Set(links.map(c => c.id)).size).toBe(2);
    // Visibility pulled off the roles.
    expect(links[0].sourceVisibility).toBe("+");
    expect(links[0].sourceRole).toBe("ownerUpper");
    expect(links[0].targetVisibility).toBe("+");
    expect(links[0].targetRole).toBe("upperValue");
    expect(links[1].sourceRole).toBe("ownerLower");
  });

  it("two DIRECT (straight) links between the same pair get separated endpoints", () => {
    // Near-aligned classes + routingType "direct" — the bug was that direct
    // routing ignored the spread offset, so both straight lines collapsed onto
    // the same edge point.
    const parsed = {
      elements: [
        { id: "me", type: "uml-class", label: "MultiplicityElement", bounds: { x: 0.12, y: 0.55, w: 0.26, h: 0.16 } },
        { id: "vs", type: "uml-class", label: "ValueSpecification", bounds: { x: 0.78, y: 0.58, w: 0.20, h: 0.07 } },
      ],
      connections: [
        { sourceId: "vs", targetId: "me", type: "uml-composition", routingType: "direct", sourceRole: "upperValue", targetRole: "ownerUpper" },
        { sourceId: "vs", targetId: "me", type: "uml-composition", routingType: "direct", sourceRole: "lowerValue", targetRole: "ownerLower" },
      ],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 600 } });
    const links = data.connectors.filter(c => c.type === "uml-composition");
    expect(links).toHaveLength(2);
    // The visible edge point on the target (me) must differ in Y between the two.
    const meEdgeY = (c: typeof links[number]) => c.waypoints[c.waypoints.length - 2].y;
    expect(Math.abs(meEdgeY(links[0]) - meEdgeY(links[1]))).toBeGreaterThan(8);
  });

  it("transcribes a derived attribute (isDerived / leading slash) on image ingest", () => {
    const parsed = {
      elements: [
        { id: "me", type: "uml-class", label: "MultiplicityElement",
          bounds: { x: 0.1, y: 0.3, w: 0.3, h: 0.3 },
          attributes: [
            { visibility: "+", name: "/upper", type: "UnlimitedNatural", multiplicity: "0..1" },
            { visibility: "+", name: "lower", type: "Integer", isDerived: true },
          ] },
      ],
      connections: [],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 700 } });
    const attrs = data.elements.find(e => e.id === "me")!.properties.attributes as Array<{ name: string; isDerived?: boolean }>;
    expect(attrs[0]).toMatchObject({ name: "upper", isDerived: true });   // slash stripped
    expect(attrs[1]).toMatchObject({ name: "lower", isDerived: true });   // flag honoured
  });
});
