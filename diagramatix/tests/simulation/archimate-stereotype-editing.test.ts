/**
 * The two Skills stereotypes have to be things a USER can set.
 *
 * Paul, 2026-09-12: "Users need to be able to create and maintain Archimate
 * diagrams with these 2 stereotypes if they are part of the Diagramatix
 * implementation of the Skills feature."
 *
 * They were not. The Stereotype field was gated to UML shapes, ArchiMate
 * relationships had no Label field at all, `layoutGenericDiagram` dropped
 * everything but `shapeKey`, and nothing drew a stereotype on an ArchiMate
 * shape. The convention existed only in a generator — which makes it a private
 * detail rather than a convention.
 *
 * Four things have to hold, and each was separately broken:
 *   set it · keep it through layout · draw it · read it back
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import { skillsFromArchimate } from "@/app/lib/simulation/skillsFromArchimate";
import type { DiagramData } from "@/app/lib/diagram/types";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("the Skills stereotypes are user-maintainable", () => {
  it("T4288 — an ArchiMate element can be given a stereotype in Properties", () => {
    const panel = read("app/components/canvas/PropertiesPanel.tsx");
    const at = panel.indexOf("Stereotype for UML Class");
    expect(at).toBeGreaterThan(-1);
    const gate = panel.slice(at, at + 700);
    expect(gate, "an ArchiMate element must reach the Stereotype field").toContain('element.type === "archimate-shape"');
    // Suggested, never enforced: a stereotype is an open extension point, and a
    // closed list would forbid every other legitimate use.
    expect(panel).toContain('<option value="Individual Skill" />');
    expect(panel).toContain('<option value="Business Capability" />');
  });

  it("T4289 — an ArchiMate relationship can be given a label", () => {
    // "has skill" between a person and a Capability is the difference between a
    // line that states something and a line that states nothing — Association is
    // the one ArchiMate relationship with no inherent meaning of its own.
    const panel = read("app/components/canvas/PropertiesPanel.tsx");
    const at = panel.indexOf("Label for non-transition connectors");
    expect(at).toBeGreaterThan(-1);
    const gate = panel.slice(at, at + 900);
    expect(gate).toContain('String(connector.type).startsWith("archi-")');
    // ...except influence, which has its own strength control; two editors
    // writing one field would fight.
    expect(gate).toContain('connector.type !== "archi-influence"');
  });

  it("T4290 — a stereotype SURVIVES layout and reads back as intended", () => {
    // The round trip is the point. Layout kept only `shapeKey`, so a stereotype
    // set in Properties vanished the next time the diagram was laid out — and
    // the reader would then treat every Capability as somebody's skill,
    // including the organisation's.
    const laid = layoutGenericDiagram({
      elements: [
        { id: "p", type: "business-actor", label: "Jane Smith" },
        { id: "team", type: "business-actor", label: "Data & AI Team" },
        { id: "s", type: "strategy-capability", label: "Data Modelling", stereotype: "Individual Skill" },
        { id: "o", type: "strategy-capability", label: "Enterprise Architecture", stereotype: "Business Capability" },
      ],
      connections: [
        { sourceId: "team", targetId: "p", type: "aggregation" },
        { sourceId: "p", targetId: "s", type: "association", label: "has skill" },
        { sourceId: "p", targetId: "o", type: "association", label: "has capability" },
      ],
    } as Parameters<typeof layoutGenericDiagram>[0], "archimate") as DiagramData;

    const marked = laid.elements.filter((e) => (e.properties as { stereotype?: string } | undefined)?.stereotype);
    expect(marked.map((e) => e.label).sort()).toEqual(["Data Modelling", "Enterprise Architecture"]);

    // ...and the label survives too, or "has skill" could not be maintained.
    expect(laid.connectors.filter((c) => (c.label ?? "").trim()).length).toBe(2);

    // Read back: BOTH capabilities hang off the PERSON here, so structure cannot
    // separate them — this is the one case where the stereotype is the only
    // thing that can, which is why it had to become settable.
    const model = skillsFromArchimate(laid);
    expect(model.pattern).toBe("capability");
    expect(model.skills).toEqual(["Data Modelling"]);
    expect(model.skills).not.toContain("Enterprise Architecture");
  });

  it("T4291 — a stereotype is DRAWN, not merely stored", () => {
    // A marker nobody can see is a marker nobody can check.
    const shape = read("app/components/canvas/ArchimateShape.tsx");
    expect(shape).toContain("el.properties?.stereotype");
    expect(shape, "guillemets, the notation for a specialised concept").toContain("&#171;");
    expect(shape).toContain("&#187;");
  });
});
