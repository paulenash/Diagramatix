/**
 * The AI model-comparison "winner" rule. After generating a BPMN diagram with
 * several models, the current diagram is filled with the BEST result — this pins
 * exactly what "best" means so the selection can't silently drift: fewest
 * connector-conformance issues among the reasonably-COMPLETE diagrams (a
 * completeness floor stops a near-empty 0-issue diagram winning), ties breaking
 * to the richer diagram, then the caller's model-preference order.
 */
import { describe, it, expect } from "vitest";
import { pickBestModel, type ComparisonResult } from "@/app/lib/ai/pickBestModel";

/** Concise result builder (ok + a saved diagram unless overridden). */
const r = (model: string, issues: number, elements: number, connections: number, over: Partial<ComparisonResult> = {}): ComparisonResult =>
  ({ model, ok: true, issues, elements, connections, diagramId: `d-${model}`, ...over });

describe("pickBestModel", () => {
  it("T0573 — picks the fewest conformance issues among complete diagrams", () => {
    const best = pickBestModel([
      r("a", 3, 10, 9),
      r("b", 1, 10, 9), // fewest issues, equally complete → winner
      r("c", 0, 2, 1),  // 0 issues but sparse → excluded by the floor
    ], ["a", "b", "c"]);
    expect(best?.model).toBe("b");
  });

  it("T0574 — the completeness floor stops a near-empty 0-issue diagram winning", () => {
    const best = pickBestModel([
      r("rich", 1, 12, 8), // size 20, one issue
      r("tiny", 0, 2, 2),  // size 4 (< 60% of 20) → not eligible
    ], ["rich", "tiny"]);
    expect(best?.model).toBe("rich");
  });

  it("T0575 — ties break to the richer diagram, then model-preference order", () => {
    // Equal issues → the larger diagram wins.
    expect(pickBestModel([r("x", 2, 8, 7), r("y", 2, 10, 8)], ["x", "y"])?.model).toBe("y");
    // Equal issues AND size → the earlier model in the order wins.
    expect(pickBestModel([r("q", 1, 6, 6), r("p", 1, 6, 6)], ["p", "q"])?.model).toBe("p");
  });

  it("T0576 — ignores failed / unsaved results and returns null when none qualify", () => {
    expect(pickBestModel([], [])).toBeNull();
    expect(pickBestModel([
      r("failed", 0, 5, 5, { ok: false }),
      r("nosave", 0, 5, 5, { diagramId: undefined }),
    ], [])).toBeNull();
    // A single valid result is the winner regardless of its issue count.
    expect(pickBestModel([r("only", 9, 5, 5), r("bad", 0, 5, 5, { ok: false })], [])?.model).toBe("only");
  });
});
