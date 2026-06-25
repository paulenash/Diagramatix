import { describe, it, expect } from "vitest";
import {
  DEFAULT_STAFF_NARRATIVE_BRIEFING,
  buildStaffNarrativeBriefing,
  extractAdditionalRules,
  isLegacyFullBriefing,
} from "../app/lib/ai/staffNarrative";

describe("staff-narrative briefing assembly", () => {
  it("uses the built-in default when there are no additional rules", () => {
    expect(buildStaffNarrativeBriefing("")).toBe(DEFAULT_STAFF_NARRATIVE_BRIEFING);
    expect(buildStaffNarrativeBriefing(null)).toBe(DEFAULT_STAFF_NARRATIVE_BRIEFING);
    expect(buildStaffNarrativeBriefing("   ")).toBe(DEFAULT_STAFF_NARRATIVE_BRIEFING);
  });

  it("appends additional rules to the built-in default", () => {
    const out = buildStaffNarrativeBriefing("Always mention the office cat.");
    expect(out.startsWith(DEFAULT_STAFF_NARRATIVE_BRIEFING)).toBe(true);
    expect(out).toContain("Additional Rules");
    expect(out).toContain("Always mention the office cat.");
  });

  it("treats a legacy full-briefing row as the whole briefing (no doubling)", () => {
    // The prod row currently holds the verbatim default — must be used as-is,
    // not appended to a second copy of the default.
    const out = buildStaffNarrativeBriefing(DEFAULT_STAFF_NARRATIVE_BRIEFING);
    expect(out).toBe(DEFAULT_STAFF_NARRATIVE_BRIEFING);
    expect(isLegacyFullBriefing(DEFAULT_STAFF_NARRATIVE_BRIEFING)).toBe(true);
  });

  it("extractAdditionalRules hides legacy full briefings but keeps real additions", () => {
    expect(extractAdditionalRules(DEFAULT_STAFF_NARRATIVE_BRIEFING)).toBe("");
    expect(extractAdditionalRules("Use British spelling.")).toBe("Use British spelling.");
    expect(extractAdditionalRules("")).toBe("");
  });
});
