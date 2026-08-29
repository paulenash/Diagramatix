import { describe, it, expect } from "vitest";
import { uniqueDiagramName } from "@/app/lib/valueChain/uniqueDiagramName";

/**
 * T2907 — regenerating one diagram into a project that already holds it.
 *
 * The whole point of regenerating into an EXISTING project is to compare the new
 * diagram against the one it would replace, so the existing one must survive.
 */
describe("uniqueDiagramName", () => {
  it("T2907 — leaves a free name alone and suffixes a taken one", () => {
    const taken = new Set<string>();
    expect(uniqueDiagramName("V06.06 Develop Prototype", taken)).toBe("V06.06 Develop Prototype");
    // …and now it is taken, by this very call.
    expect(uniqueDiagramName("V06.06 Develop Prototype", taken)).toBe("V06.06 Develop Prototype (2)");
    expect(uniqueDiagramName("V06.06 Develop Prototype", taken)).toBe("V06.06 Develop Prototype (3)");
  });

  it("T2908 — fills a gap in the sequence rather than climbing past it", () => {
    const taken = new Set(["Design", "Design (2)", "Design (4)"]);
    expect(uniqueDiagramName("Design", taken)).toBe("Design (3)");
    expect(uniqueDiagramName("Design", taken)).toBe("Design (5)");
  });

  it("T2909 — a name that already ends in a suffix is treated as its own base", () => {
    // "X (2)" regenerated again must not become "X (3)" — that would collide
    // with the third copy of X. It is its own name.
    const taken = new Set(["Design (2)"]);
    expect(uniqueDiagramName("Design (2)", taken)).toBe("Design (2) (2)");
    expect(uniqueDiagramName("Design", taken)).toBe("Design");
  });

  it("T2910 — never returns a name it has already handed out", () => {
    const taken = new Set<string>();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const n = uniqueDiagramName("Validate Commercial Model", taken);
      expect(seen.has(n), `${n} was handed out twice`).toBe(false);
      seen.add(n);
    }
    expect(seen.size).toBe(50);
  });
});
