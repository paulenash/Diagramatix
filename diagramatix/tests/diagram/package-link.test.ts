/**
 * uml-package rename → link decision (resolvePackageNameLink). Offer to link a
 * package to a same-named Domain diagram; unlink a NAME-DERIVED link when the
 * name changes; leave a manual (differently-named) link alone.
 */
import { describe, it, expect } from "vitest";
import { resolvePackageNameLink, type SiblingDiagram } from "@/app/lib/diagram/packageLink";

const sibs: SiblingDiagram[] = [
  { id: "d-sales", name: "Sales", type: "domain" },
  { id: "d-orders", name: "Orders", type: "domain" },
  { id: "b-sales", name: "Sales", type: "bpmn" }, // same name, wrong type — ignored
];

describe("resolvePackageNameLink", () => {
  it("offers to link a newly-named package to a same-named Domain diagram", () => {
    expect(resolvePackageNameLink("Package", "Sales", undefined, sibs))
      .toEqual({ unlink: false, offer: { diagramId: "d-sales", name: "Sales" } });
  });

  it("ignores a same-named BPMN diagram (Domain only)", () => {
    expect(resolvePackageNameLink("Package", "Orders", undefined, sibs).offer?.diagramId).toBe("d-orders");
    // a name only matched by a bpmn sibling → no offer
    expect(resolvePackageNameLink("Package", "Payments", undefined, sibs).offer).toBeNull();
  });

  it("does nothing when the name is unchanged", () => {
    expect(resolvePackageNameLink("Sales", "Sales", undefined, sibs)).toEqual({ unlink: false, offer: null });
  });

  it("does not offer if already linked to that same diagram", () => {
    expect(resolvePackageNameLink("Sales", "Sales", "d-sales", sibs)).toEqual({ unlink: false, offer: null });
  });

  it("UNLINKS a name-derived link when the package is renamed", () => {
    // Package named "Sales" linked to the "Sales" diagram → rename to "Archive".
    expect(resolvePackageNameLink("Sales", "Archive", "d-sales", sibs))
      .toEqual({ unlink: true, offer: null });
  });

  it("unlinks the old name-derived link AND offers the new same-named diagram", () => {
    // "Sales" (linked to Sales) → renamed to "Orders" (a diagram exists).
    expect(resolvePackageNameLink("Sales", "Orders", "d-sales", sibs))
      .toEqual({ unlink: true, offer: { diagramId: "d-orders", name: "Orders" } });
  });

  it("LEAVES a manual link (child named differently) alone on rename", () => {
    // Package "Widgets" manually linked to the "Sales" diagram → rename.
    expect(resolvePackageNameLink("Widgets", "Gadgets", "d-sales", sibs))
      .toEqual({ unlink: false, offer: null });
  });
});
