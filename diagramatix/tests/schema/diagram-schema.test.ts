/**
 * Diagram-JSON schema — runtime behaviour: valid data passes, structural
 * corruption + referential problems are caught, and unknown/forward-compat keys
 * never cause a rejection.
 */
import { describe, it, expect } from "vitest";
import { diagramDataSchema, exportEnvelopeSchema } from "@/app/lib/diagram/diagramSchema";

const el = (id: string, type = "task", extra: Record<string, unknown> = {}) =>
  ({ id, type, x: 0, y: 0, width: 10, height: 10, label: id, properties: {}, ...extra });
const conn = (id: string, sourceId: string, targetId: string) =>
  ({ id, sourceId, targetId, sourceSide: "right", targetSide: "left", type: "sequence", directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] });
const base = (elements: unknown[], connectors: unknown[] = []) =>
  ({ elements, connectors, viewport: { x: 0, y: 0, zoom: 1 } });

const msgs = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe("diagramDataSchema", () => {
  it("T0910 — accepts a valid diagram (and ignores unknown/forward-compat keys)", () => {
    const data = base([el("a"), el("b")], [conn("c1", "a", "b")]);
    (data as Record<string, unknown>).someFutureField = 42;  // must NOT reject
    (data.elements[0] as Record<string, unknown>).futureProp = "x";
    expect(diagramDataSchema.safeParse(data).success).toBe(true);
  });

  it("T0911 — rejects wrong field types + missing required", () => {
    const bad = base([{ id: "a", type: "task", x: "nope", y: 0, width: 10, height: 10, label: "a", properties: {} }]);
    expect(diagramDataSchema.safeParse(bad).success).toBe(false);
    // viewport missing entirely
    expect(diagramDataSchema.safeParse({ elements: [], connectors: [] }).success).toBe(false);
  });

  it("T0912 — catches referential problems (dangling ref, dup ids, parent cycle, orphan)", () => {
    const dangling = diagramDataSchema.safeParse(base([el("a")], [conn("c1", "a", "ghost")]));
    expect(msgs(dangling).some((m) => /targetId ghost not found/.test(m))).toBe(true);

    const dupEl = diagramDataSchema.safeParse(base([el("a"), el("a")], [conn("c1", "a", "a")]));
    expect(msgs(dupEl).some((m) => /Duplicate element id/.test(m))).toBe(true);

    const cycle = diagramDataSchema.safeParse(base([el("a", "group", { parentId: "b" }), el("b", "group", { parentId: "a" })]));
    expect(msgs(cycle).some((m) => /parentId cycle/.test(m))).toBe(true);

    // Orphan: two flow elements, one unconnected.
    const orphan = diagramDataSchema.safeParse(base([el("a", "task"), el("b", "task")], [conn("c1", "a", "a")]));
    expect(msgs(orphan).some((m) => /Orphan task \(b\)/.test(m))).toBe(true);

    // Standalone types are NOT flagged as orphans.
    const note = diagramDataSchema.safeParse(base([el("a", "task"), el("n", "uml-note")], [conn("c1", "a", "a")]));
    expect(msgs(note).some((m) => /Orphan/.test(m))).toBe(false);
  });

  it("T0913 — envelope validates and embeds the body schema", () => {
    const env = { schemaVersion: "1.40", diagrams: [{ originalId: "d1", name: "D", type: "bpmn", data: base([el("a"), el("b")], [conn("c", "a", "b")]) }] };
    expect(exportEnvelopeSchema.safeParse(env).success).toBe(true);
    const badEnv = { schemaVersion: "1.40", diagrams: [{ data: base([el("a")], [conn("c", "a", "ghost")]) }] };
    expect(exportEnvelopeSchema.safeParse(badEnv).success).toBe(false);
  });
});
