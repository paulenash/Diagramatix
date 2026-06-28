/**
 * Pure regression net for `splitRulesByEnforcement` — the "only GREEN rules
 * reach the model" guarantee of the AI generation pipeline.
 *
 * Contract under test (see app/lib/ai/splitRules.ts):
 *   - A rule under a normal `## …` group → aiRules.
 *   - A rule under a CODE_REQUIRED group heading (layout / positioning /
 *     placement / spacing / sizing / arrangement / connector routing, matched
 *     as a whole word, case-insensitive) → layoutRules, NOT aiRules.
 *   - A rule line carrying [PROPOSED] or [MODIFIED] inside a LAYOUT group is
 *     dropped from BOTH slices.
 *   - Headings + free-text lines follow their group's bucket.
 *
 * Assertions use `.includes()` on the returned slices + exact membership,
 * not full-string snapshots.
 */
import { describe, it, expect } from "vitest";
import {
  splitRulesByEnforcement,
  CODE_REQUIRED_GROUPS,
  RULE_LINE_RE,
  PROPOSED_RE,
  MODIFIED_RE,
} from "@/app/lib/ai/splitRules";

describe("splitRulesByEnforcement — rule filtering", () => {
  it("routes a rule under a normal group to aiRules and a rule under a layout group to layoutRules", () => {
    const text = [
      "## Naming",
      "R01: Tasks use verb-noun labels.",
      "",
      "## Layout",
      "L23.2: Pools stack top to bottom.",
    ].join("\n");

    const { aiRules, layoutRules } = splitRulesByEnforcement(text);

    expect(aiRules).toContain("R01: Tasks use verb-noun labels.");
    expect(aiRules).not.toContain("L23.2: Pools stack top to bottom.");

    expect(layoutRules).toContain("L23.2: Pools stack top to bottom.");
    expect(layoutRules).not.toContain("R01: Tasks use verb-noun labels.");
  });

  it("keeps each slice's own group heading and excludes the other slice's heading", () => {
    const text = [
      "## Naming",
      "R01: A naming rule.",
      "## Connector Routing",
      "R04.1: Route orthogonally.",
    ].join("\n");

    const { aiRules, layoutRules } = splitRulesByEnforcement(text);

    expect(aiRules).toContain("## Naming");
    expect(aiRules).not.toContain("## Connector Routing");
    expect(layoutRules).toContain("## Connector Routing");
    expect(layoutRules).not.toContain("## Naming");
  });

  it("drops a [PROPOSED] rule line inside a layout group from BOTH slices", () => {
    const text = [
      "## Spacing",
      "R10: Columns are 160px apart.",
      "R11: Lanes are 120px tall. [PROPOSED]",
    ].join("\n");

    const { aiRules, layoutRules } = splitRulesByEnforcement(text);

    // The live spacing rule survives in layoutRules.
    expect(layoutRules).toContain("R10: Columns are 160px apart.");
    // The proposed one is gone everywhere.
    expect(layoutRules).not.toContain("R11:");
    expect(aiRules).not.toContain("R11:");
    expect(aiRules).toBe(""); // nothing else was in a non-layout group
  });

  it("drops a [MODIFIED] rule line inside a layout group from BOTH slices", () => {
    const text = [
      "## Positioning",
      "R20: Start events sit in the top lane.",
      "R21: End events sit in the bottom lane. [MODIFIED]",
    ].join("\n");

    const { aiRules, layoutRules } = splitRulesByEnforcement(text);

    expect(layoutRules).toContain("R20: Start events sit in the top lane.");
    expect(layoutRules).not.toContain("R21:");
    expect(aiRules).not.toContain("R21:");
  });

  it("KEEPS a [PROPOSED] rule that sits in a NON-layout group (exclusion is layout-group-only)", () => {
    // This pins the ACTUAL behaviour: the PROPOSED/MODIFIED drop in flushGroup
    // is guarded by `currentGroupIsLayout`, so a [PROPOSED] marker in a normal
    // group does NOT exclude the line — it still flows to aiRules.
    const text = [
      "## Naming",
      "R30: Keep labels under five words.",
      "R31: Prefer Australian spelling. [PROPOSED]",
    ].join("\n");

    const { aiRules, layoutRules } = splitRulesByEnforcement(text);

    expect(aiRules).toContain("R30: Keep labels under five words.");
    expect(aiRules).toContain("R31: Prefer Australian spelling. [PROPOSED]");
    expect(layoutRules).toBe("");
  });

  it("classifies all the rule-id formats from the header (R01, R04.1, G07, L23.2)", () => {
    const text = [
      "## Naming",
      "R01: standard id.",
      "R04.1: dotted sub-rule.",
      "G07: G-prefixed id.",
      "L23.2: L-prefixed dotted id.",
    ].join("\n");

    const { aiRules } = splitRulesByEnforcement(text);

    for (const id of ["R01:", "R04.1:", "G07:", "L23.2:"]) {
      expect(aiRules).toContain(id);
      expect(RULE_LINE_RE.test(id)).toBe(true);
    }
  });

  it("carries free-text (non-rule) lines into their group's bucket so each slice stays valid markdown", () => {
    const text = [
      "## Naming",
      "Some intro prose for naming.",
      "R01: A naming rule.",
      "## Sizing",
      "Free text about sizing.",
      "R40: Tasks are 100px wide.",
    ].join("\n");

    const { aiRules, layoutRules } = splitRulesByEnforcement(text);

    expect(aiRules).toContain("Some intro prose for naming.");
    expect(aiRules).not.toContain("Free text about sizing.");
    expect(layoutRules).toContain("Free text about sizing.");
    expect(layoutRules).not.toContain("Some intro prose for naming.");
  });

  it("handles a layout group FOLLOWED by a normal group (bucket switches correctly)", () => {
    const text = [
      "## Arrangement",
      "R50: Left-to-right flow.",
      "## Vocabulary",
      "R51: Use 'invoice' not 'bill'.",
    ].join("\n");

    const { aiRules, layoutRules } = splitRulesByEnforcement(text);

    expect(layoutRules).toContain("R50: Left-to-right flow.");
    expect(layoutRules).not.toContain("R51:");
    expect(aiRules).toContain("R51: Use 'invoice' not 'bill'.");
    expect(aiRules).not.toContain("R50:");
  });

  it("returns empty slices for an empty string", () => {
    expect(splitRulesByEnforcement("")).toEqual({ aiRules: "", layoutRules: "" });
  });

  it("sends everything to aiRules when there are no `##` headings at all", () => {
    const text = ["R01: A rule with no group.", "Just some free text."].join("\n");

    const { aiRules, layoutRules } = splitRulesByEnforcement(text);

    expect(aiRules).toContain("R01: A rule with no group.");
    expect(aiRules).toContain("Just some free text.");
    expect(layoutRules).toBe("");
  });

  it("matches CODE_REQUIRED group words case-insensitively as whole words", () => {
    // Word-boundary check: "Layouts overview" matches \blayout\b? No — \b is
    // between 'layout' and 's' only if followed by non-word... pin reality:
    expect(CODE_REQUIRED_GROUPS.test("## Layout Rules")).toBe(true);
    expect(CODE_REQUIRED_GROUPS.test("## CONNECTOR ROUTING")).toBe(true);
    expect(CODE_REQUIRED_GROUPS.test("## Spacing & Sizing")).toBe(true);
    // A word that merely CONTAINS a code word as a substring must not match.
    expect(CODE_REQUIRED_GROUPS.test("## Displacement guidance")).toBe(false);
    expect(CODE_REQUIRED_GROUPS.test("## Naming")).toBe(false);
  });

  it("PROPOSED_RE / MODIFIED_RE markers are recognised case-insensitively in a body", () => {
    expect(PROPOSED_RE.test("R1: x [proposed]")).toBe(true);
    expect(MODIFIED_RE.test("R1: x [MODIFIED]")).toBe(true);
    expect(PROPOSED_RE.test("R1: x")).toBe(false);
  });

  it("realistic multi-group fixture splits cleanly with no leakage between slices", () => {
    const text = [
      "## General",
      "R01: Every process has a start and end event.",
      "R02: Tasks use verb-noun labels.",
      "",
      "## Layout",
      "L10: Pools stack vertically.",
      "L11: Black-box system pools sit below the main pool.",
      "L12: Lanes are 120px tall. [PROPOSED]",
      "",
      "## Vocabulary",
      "R20: Use 'member' not 'customer'.",
      "",
      "## Connector Routing",
      "R30: Sequence flows route orthogonally.",
      "R31: Message flows are dashed. [MODIFIED]",
    ].join("\n");

    const { aiRules, layoutRules } = splitRulesByEnforcement(text);

    // aiRules has exactly the non-layout content.
    expect(aiRules).toContain("R01: Every process has a start and end event.");
    expect(aiRules).toContain("R02: Tasks use verb-noun labels.");
    expect(aiRules).toContain("R20: Use 'member' not 'customer'.");
    expect(aiRules).toContain("## General");
    expect(aiRules).toContain("## Vocabulary");
    // No layout content leaked into aiRules.
    expect(aiRules).not.toContain("L10:");
    expect(aiRules).not.toContain("R30:");
    expect(aiRules).not.toContain("## Layout");

    // layoutRules has the live layout content but not the TODO-flagged lines.
    expect(layoutRules).toContain("L10: Pools stack vertically.");
    expect(layoutRules).toContain("L11: Black-box system pools sit below the main pool.");
    expect(layoutRules).toContain("R30: Sequence flows route orthogonally.");
    expect(layoutRules).not.toContain("L12:"); // [PROPOSED] dropped
    expect(layoutRules).not.toContain("R31:"); // [MODIFIED] dropped
    // No aiRules content leaked into layoutRules.
    expect(layoutRules).not.toContain("R01:");
    expect(layoutRules).not.toContain("R20:");
  });
});
