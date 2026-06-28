/**
 * Pure tests for the staff-narrative extractor helpers (app/lib/ai/staffNarrative.ts).
 * No Claude call involved — these are string classifiers.
 *
 * `extractAdditionalRules(stored)` returns the editable additional-rules portion
 * of a stored DiagramRules row:
 *   - "" for null / undefined / blank,
 *   - "" for a LEGACY full-briefing row (one starting with the built-in
 *     "You are a long-serving staff member" signature),
 *   - the trimmed content otherwise (new rows store only the additions).
 */
import { describe, it, expect } from "vitest";
import {
  extractAdditionalRules,
  isLegacyFullBriefing,
  buildStaffNarrativeBriefing,
  DEFAULT_STAFF_NARRATIVE_BRIEFING,
} from "@/app/lib/ai/staffNarrative";

describe("extractAdditionalRules", () => {
  it("returns '' for null / undefined / blank", () => {
    expect(extractAdditionalRules(null)).toBe("");
    expect(extractAdditionalRules(undefined)).toBe("");
    expect(extractAdditionalRules("   \n  ")).toBe("");
  });

  it("returns the trimmed additions for a normal (new-style) row", () => {
    expect(extractAdditionalRules("  Use 'member' not 'customer'.  ")).toBe(
      "Use 'member' not 'customer'.",
    );
  });

  it("returns '' for a legacy full-briefing row (its content is the built-in default)", () => {
    const legacy = DEFAULT_STAFF_NARRATIVE_BRIEFING;
    expect(isLegacyFullBriefing(legacy)).toBe(true);
    expect(extractAdditionalRules(legacy)).toBe("");
  });
});

describe("buildStaffNarrativeBriefing", () => {
  it("uses the built-in default when nothing is stored", () => {
    expect(buildStaffNarrativeBriefing(null)).toBe(DEFAULT_STAFF_NARRATIVE_BRIEFING);
  });

  it("appends additional house-style rules under a heading for a new-style row", () => {
    const out = buildStaffNarrativeBriefing("Always mention the SLA.");
    expect(out).toContain(DEFAULT_STAFF_NARRATIVE_BRIEFING);
    expect(out).toContain("## Additional Rules — house style");
    expect(out).toContain("Always mention the SLA.");
  });

  it("uses a legacy full-briefing verbatim", () => {
    expect(buildStaffNarrativeBriefing(DEFAULT_STAFF_NARRATIVE_BRIEFING)).toBe(
      DEFAULT_STAFF_NARRATIVE_BRIEFING,
    );
  });
});
