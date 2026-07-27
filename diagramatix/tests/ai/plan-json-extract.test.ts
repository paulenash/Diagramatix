/**
 * planBpmn JSON salvage — the model response is clipped to the first COMPLETE
 * `{ … }` object by brace-matching (string/escape-aware), so a note the model
 * appends AFTER the JSON (even one containing braces) no longer corrupts the
 * parse. Previously an `indexOf("{")…lastIndexOf("}")` clip swallowed that prose
 * and JSON.parse failed with "Expected ',' or ']' … at position N" (T1042).
 */
import { describe, it, expect } from "vitest";
import { extractBalancedJson, repairJsonCommas, closeTruncatedJson } from "@/app/lib/ai/planBpmn";

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

describe("closeTruncatedJson salvages a cut-off plan (T1043)", () => {
  it("truncated mid-connections → keeps the complete ones + closes the object", () => {
    // Model hit its output cap partway through the second connection.
    const truncated = '{"elements":[{"id":"a","type":"task"}],"connections":[{"id":"c1","from":"a","to":"b"},{"id":"c2","fr';
    const closed = closeTruncatedJson(truncated)!;
    const p = JSON.parse(closed);
    expect(p.elements).toHaveLength(1);
    expect(p.connections).toHaveLength(1);   // only the complete connection survives
    expect(p.connections[0].id).toBe("c1");
  });

  it("truncated mid-elements → keeps complete elements (connections may be absent)", () => {
    const truncated = '{"elements":[{"id":"a","type":"task"},{"id":"b","type":"gatew';
    const p = JSON.parse(closeTruncatedJson(truncated)!);
    expect(p.elements).toHaveLength(1);
    expect(p.elements[0].id).toBe("a");
  });

  it("does not corrupt already-complete JSON", () => {
    const good = '{"elements":[{"id":"a"}],"connections":[]}';
    expect(JSON.parse(closeTruncatedJson(good)!)).toEqual(JSON.parse(good));
  });
});
