/**
 * SuperAdmin diagram-bundle remap helpers. On import everything gets NEW ids, so
 * the embedded cross-references (data.aiGeneration.promptId + aiComparison
 * models[].diagramId) must be rewritten to the freshly-created rows.
 */
import { describe, it, expect } from "vitest";
import {
  BUNDLE_KIND,
  isDiagramBundle,
  remapDiagramData,
  remapAiComparison,
  comparisonDiagramIds,
} from "@/app/lib/diagram/diagramBundle";

describe("diagram bundle remap", () => {
  it("T1096 — remapDiagramData rewrites aiGeneration.promptId, preserving the snapshot + other fields", () => {
    const data = {
      elements: [{ id: "e1" }],
      showAiPromptAnnotation: true,
      aiGeneration: { promptId: "old-p", promptName: "My Prompt", promptText: "make a diagram", model: "claude-x" },
    };
    const out = remapDiagramData(data, new Map([["old-p", "new-p"]])) as typeof data;
    expect(out.aiGeneration.promptId).toBe("new-p");
    // Snapshot + siblings untouched; original not mutated.
    expect(out.aiGeneration.promptText).toBe("make a diagram");
    expect(out.elements).toEqual([{ id: "e1" }]);
    expect(data.aiGeneration.promptId).toBe("old-p");
  });

  it("T1097 — remapDiagramData is a no-op when there is no aiGeneration or the id isn't mapped", () => {
    expect(remapDiagramData({ elements: [] }, new Map())).toEqual({ elements: [] });
    const d = { aiGeneration: { promptId: "unknown" } };
    expect(remapDiagramData(d, new Map([["other", "x"]]))).toEqual(d);
    expect(remapDiagramData(null, new Map())).toBeNull();
  });

  it("T1098 — remapAiComparison rewrites each models[].diagramId; unmapped ids are blanked", () => {
    const comp = {
      chosenModel: "Opus 4.8",
      models: [
        { model: "opus", diagramId: "d-opus", issues: 0 },
        { model: "sonnet", diagramId: "d-sonnet", issues: 2 },
        { model: "haiku", diagramId: "d-missing", issues: 1 },
        { model: "failed", error: "no key" }, // no diagramId — left alone
      ],
    };
    const map = new Map([["d-opus", "n-opus"], ["d-sonnet", "n-sonnet"]]);
    const out = remapAiComparison(comp, map) as typeof comp;
    expect(out.models[0].diagramId).toBe("n-opus");
    expect(out.models[1].diagramId).toBe("n-sonnet");
    expect(out.models[2].diagramId).toBe(""); // unmapped → blanked, never dangling
    expect(out.models[3]).toEqual({ model: "failed", error: "no key" });
    expect(out.chosenModel).toBe("Opus 4.8");
    // Original not mutated.
    expect(comp.models[0].diagramId).toBe("d-opus");
  });

  it("T1099 — comparisonDiagramIds collects only real diagram ids", () => {
    expect(comparisonDiagramIds({ models: [{ diagramId: "a" }, { error: "x" }, { diagramId: "" }, { diagramId: "b" }] }))
      .toEqual(["a", "b"]);
    expect(comparisonDiagramIds({})).toEqual([]);
    expect(comparisonDiagramIds(null)).toEqual([]);
  });

  it("T1100 — isDiagramBundle validates the kind discriminator", () => {
    expect(isDiagramBundle({ kind: BUNDLE_KIND, diagram: { name: "x" } })).toBe(true);
    expect(isDiagramBundle({ kind: "something-else", diagram: {} })).toBe(false);
    expect(isDiagramBundle({ diagram: {} })).toBe(false);
    expect(isDiagramBundle(null)).toBe(false);
  });
});
