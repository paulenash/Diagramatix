/**
 * Non-destructive SOP regenerate — merge fresh AI sections into the existing doc by
 * section identity, preserving author edits, added sections and locked sections.
 */
import { describe, it, expect } from "vitest";
import { mergeSopSections, type ExistingSopSection, type FreshSopSection } from "@/app/lib/sop/mergeSections";

const hash = (s: string) => `h:${s}`; // deterministic stand-in for the real digest

const ex = (o: Partial<ExistingSopSection> & { sortOrder: number }): ExistingSopSection => ({
  heading: null, bodyMarkdown: "", image: null, imageCaption: null, key: null, aiBodyHash: null, locked: false, ...o,
});

describe("SOP regenerate merge (by section identity)", () => {
  it("T2215 — refresh untouched, keep edited/added/locked, add new, drop stale", () => {
    const existing: ExistingSopSection[] = [
      ex({ sortOrder: 0, heading: "Purpose", key: "purpose", bodyMarkdown: "old purpose", aiBodyHash: hash("old purpose") }),               // untouched → refresh
      ex({ sortOrder: 1, heading: "Procedure", key: "procedure", bodyMarkdown: "EDITED procedure", aiBodyHash: hash("orig procedure") }),   // edited → keep
      ex({ sortOrder: 2, heading: "My notes", key: null, bodyMarkdown: "author notes", aiBodyHash: null }),                                 // author-added → keep
      ex({ sortOrder: 3, heading: "Systems", key: "systems", bodyMarkdown: "old systems", aiBodyHash: hash("old systems"), locked: true }), // locked → keep
      ex({ sortOrder: 4, heading: "Data Objects", key: "data_objects", bodyMarkdown: "old data", aiBodyHash: hash("old data") }),           // untouched + no longer generated → drop
      ex({ sortOrder: 5, heading: "Process Diagram", key: null, image: "data:image/png;base64,AAAA", bodyMarkdown: "" }),                   // figure → keep, float to end
    ];
    const fresh: FreshSopSection[] = [
      { heading: "Purpose", body: "NEW purpose", key: "purpose" },
      { heading: "Procedure", body: "NEW procedure", key: "procedure" },
      { heading: "Systems", body: "NEW systems", key: "systems" },
      { heading: "Business Rules", body: "NEW rules", key: "business_rules" }, // brand-new key → append
    ];

    const { sections, summary } = mergeSopSections(existing, fresh, hash);
    const byHeading = (h: string) => sections.find((s) => s.heading === h);

    expect(byHeading("Purpose")!.bodyMarkdown).toBe("NEW purpose");              // refreshed
    expect(byHeading("Purpose")!.aiBodyHash).toBe(hash("NEW purpose"));
    expect(byHeading("Procedure")!.bodyMarkdown).toBe("EDITED procedure");       // edit preserved
    expect(byHeading("My notes")).toBeTruthy();                                  // author section kept
    expect(byHeading("Systems")!.bodyMarkdown).toBe("old systems");             // locked kept (not refreshed)
    expect(byHeading("Data Objects")).toBeUndefined();                           // stale untouched dropped
    expect(byHeading("Business Rules")!.bodyMarkdown).toBe("NEW rules");         // new added
    // Figure preserved and last.
    expect(sections[sections.length - 1].image).toBe("data:image/png;base64,AAAA");
    expect(summary).toEqual({ refreshed: 1, kept: 4, added: 1, dropped: 1 });
  });

  it("T2216 — a legacy null-key section is matched by heading and NOT duplicated", () => {
    // Pre-feature SOPs have no key/hash. Match by heading so regenerate keeps the
    // (assumed-edited) existing section and doesn't append a second copy.
    const existing: ExistingSopSection[] = [
      ex({ sortOrder: 0, heading: "Purpose", key: null, bodyMarkdown: "legacy purpose", aiBodyHash: null }),
    ];
    const fresh: FreshSopSection[] = [{ heading: "Purpose", body: "fresh purpose", key: "purpose" }];

    const { sections, summary } = mergeSopSections(existing, fresh, hash);
    expect(sections).toHaveLength(1);
    expect(sections[0].bodyMarkdown).toBe("legacy purpose"); // kept (null hash ⇒ treated as edited)
    expect(summary.added).toBe(0);
    expect(summary.kept).toBe(1);
  });
});
