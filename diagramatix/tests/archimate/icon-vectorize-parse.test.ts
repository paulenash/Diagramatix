import { describe, it, expect } from "vitest";
import { parseVectorizeResponse } from "@/app/lib/archimate/iconVectorize";

describe("Icon vectorize parse (T1010)", () => {
  // T1010 — strips ``` fences, JSON.parses, validates (good+malformed → only good).
  it("T1010: parseVectorizeResponse strips fences, parses, validates", () => {
    const fenced = "```json\n" + JSON.stringify({
      primitives: [
        { type: "circle", cx: 50, cy: 50, r: 20, z: 0, strokeWidth: 6, filled: false }, // good
        { type: "line", x1: 0, y1: 0, x2: NaN, y2: 0, z: 1, strokeWidth: 6, filled: false }, // malformed → dropped
      ],
    }) + "\n```";
    const out = parseVectorizeResponse(fenced);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("circle");

    // bare array (no wrapper) also accepted
    expect(parseVectorizeResponse('[{"type":"rect","x":10,"y":10,"w":20,"h":20}]')).toHaveLength(1);

    // non-JSON throws
    expect(() => parseVectorizeResponse("not json at all")).toThrow();
  });
});
