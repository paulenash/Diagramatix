/**
 * Three-way DiagramData merge for co-authoring auto-save (Phase 1d, T2224):
 * non-overlapping concurrent edits merge silently; a same-id overlap is the
 * only conflict (resolved to theirs and reported).
 */
import { describe, it, expect } from "vitest";
import { mergeDiagram } from "@/app/lib/diagram/mergeDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, x: number): DiagramElement =>
  ({ id, type: "task", label: id, x, y: 0, width: 100, height: 60, properties: {} } as DiagramElement);
const data = (elements: DiagramElement[], extra: Partial<DiagramData> = {}): DiagramData =>
  ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 }, ...extra } as DiagramData);

describe("mergeDiagram", () => {
  it("merges edits to DIFFERENT elements with no conflict", () => {
    const base = data([el("a", 0), el("b", 0)]);
    const ours = data([el("a", 50), el("b", 0)]);   // we moved a
    const theirs = data([el("a", 0), el("b", 99)]); // they moved b
    const { merged, conflicts } = mergeDiagram(base, ours, theirs);
    expect(conflicts).toHaveLength(0);
    expect(merged.elements.find((e) => e.id === "a")!.x).toBe(50);
    expect(merged.elements.find((e) => e.id === "b")!.x).toBe(99);
  });

  it("keeps both sides' additions", () => {
    const base = data([el("a", 0)]);
    const ours = data([el("a", 0), el("mine", 10)]);
    const theirs = data([el("a", 0), el("theirs", 20)]);
    const { merged, conflicts } = mergeDiagram(base, ours, theirs);
    expect(conflicts).toHaveLength(0);
    expect(merged.elements.map((e) => e.id).sort()).toEqual(["a", "mine", "theirs"]);
  });

  it("flags a true overlap (same element changed both) and takes theirs", () => {
    const base = data([el("a", 0)]);
    const ours = data([el("a", 50)]);
    const theirs = data([el("a", 90)]);
    const { merged, conflicts } = mergeDiagram(base, ours, theirs);
    expect(conflicts).toEqual([{ kind: "element", id: "a" }]);
    expect(merged.elements.find((e) => e.id === "a")!.x).toBe(90); // theirs wins
  });

  it("honours their delete of an element we didn't touch", () => {
    const base = data([el("a", 0), el("b", 0)]);
    const ours = data([el("a", 0), el("b", 0)]);  // untouched
    const theirs = data([el("a", 0)]);            // they deleted b
    const { merged, conflicts } = mergeDiagram(base, ours, theirs);
    expect(conflicts).toHaveLength(0);
    expect(merged.elements.map((e) => e.id)).toEqual(["a"]);
  });

  it("keeps our edit even if they deleted it (edit-vs-delete conflict)", () => {
    const base = data([el("a", 0), el("b", 0)]);
    const ours = data([el("a", 0), el("b", 77)]); // we moved b
    const theirs = data([el("a", 0)]);            // they deleted b
    const { merged, conflicts } = mergeDiagram(base, ours, theirs);
    expect(conflicts).toEqual([{ kind: "element", id: "b" }]);
    expect(merged.elements.find((e) => e.id === "b")!.x).toBe(77);
  });

  it("takes our changed scalar field when they didn't change it", () => {
    const base = data([el("a", 0)], { fontSize: 12 });
    const ours = data([el("a", 0)], { fontSize: 16 });   // we changed fontSize
    const theirs = data([el("a", 0)], { fontSize: 12 });
    const { merged } = mergeDiagram(base, ours, theirs);
    expect(merged.fontSize).toBe(16);
  });
});
