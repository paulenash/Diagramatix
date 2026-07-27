/**
 * planBpmn JSON salvage — the model response is clipped to the first COMPLETE
 * `{ … }` object by brace-matching (string/escape-aware), so a note the model
 * appends AFTER the JSON (even one containing braces) no longer corrupts the
 * parse. Previously an `indexOf("{")…lastIndexOf("}")` clip swallowed that prose
 * and JSON.parse failed with "Expected ',' or ']' … at position N" (T1042).
 */
import { describe, it, expect } from "vitest";
import { extractBalancedJson, repairJsonCommas } from "@/app/lib/ai/planBpmn";

describe("extractBalancedJson (T1042)", () => {
  it("drops a trailing note that itself contains braces", () => {
    const json = '{"elements":[{"id":"a","type":"task"}],"connections":[]}';
    const withNote = `${json}\n\nNote: the gateway {G1} splits the flow into two paths.`;
    const out = extractBalancedJson(withNote);
    expect(out).toBe(json);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("drops leading preamble before the object", () => {
    const json = '{"elements":[],"connections":[]}';
    expect(extractBalancedJson(`Here is the plan:\n${json}`)).toBe(json);
  });

  it("ignores braces inside string values", () => {
    const json = '{"elements":[{"id":"a","type":"task","label":"do {x} then }"}],"connections":[]}';
    const out = extractBalancedJson(`${json}  trailing }`);
    expect(out).toBe(json);
    expect(JSON.parse(out).elements[0].label).toBe("do {x} then }");
  });

  it("returns the tail from the first { when genuinely truncated (unbalanced)", () => {
    const truncated = '{"elements":[{"id":"a"';
    expect(extractBalancedJson(`x${truncated}`)).toBe(truncated);
  });
});

describe("repairJsonCommas (T1042)", () => {
  it("strips trailing commas before a close so a salvage parse succeeds", () => {
    const bad = '{"elements":[{"id":"a"},],"connections":[],}';
    expect(() => JSON.parse(bad)).toThrow();
    expect(() => JSON.parse(repairJsonCommas(bad))).not.toThrow();
  });
});
