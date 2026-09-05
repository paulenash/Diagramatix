import { describe, it, expect } from "vitest";
import { planLibraryImport, importPlanTotals } from "@/app/lib/valueChain/importPlan";

/**
 * The .md import, made answerable before it runs.
 *
 * Paul, 2026-09-05: "Add information to Choose an .md file to describe whether
 * the user can replace all or just selectively update or add new Value Chains
 * with this option. The User should not have to click one generic button that
 * may or may not do any or all of these."
 *
 * Until now there were two buttons and no preview, and "Import & replace" ran
 * with no confirmation at all — one click could delete a whole chain's prompts,
 * which for a regenerated chain is hours of AI spend. The danger is not that the
 * screen shows the wrong thing; it is that the screen and the import disagree.
 * These pin the one decision both now make.
 */

const FILE = [
  { code: "V01", title: "Fresh chain", prompts: [1, 2, 3] },
  { code: "V22", title: "Claims", prompts: [1, 2] },
  { code: "V26", title: "Also here", prompts: [1] },
];
const LIBRARY = [
  { code: "V22", prompts: 14, published: true },
  { code: "V26", prompts: 5, published: false },
];

describe("value-chain .md import plan", () => {
  it("T3247 with nothing ticked and no replace, only the new chain is written", () => {
    const rows = planLibraryImport({ parsed: FILE, existing: LIBRARY, codes: null, replace: false });
    expect(rows.map((r) => [r.code, r.action])).toEqual([
      ["V01", "add"], ["V22", "skip"], ["V26", "skip"],
    ]);
    // The default reading of a file must never destroy anything.
    expect(importPlanTotals(rows).promptsDestroyed).toBe(0);
  });

  it("T3248 a ticked chain that already exists is replaced, an unticked one is untouched", () => {
    const rows = planLibraryImport({ parsed: FILE, existing: LIBRARY, codes: ["V22"], replace: true });
    expect(rows.map((r) => [r.code, r.action])).toEqual([
      ["V01", "skip"], ["V22", "replace"], ["V26", "skip"],
    ]);
    // V01 is new and in the file, but was NOT ticked — "selectively update"
    // means the untouched chains stay untouched, including the new ones.
    const t = importPlanTotals(rows);
    expect(t.adding).toBe(0);
    expect(t.replacing).toBe(1);
    expect(t.promptsDestroyed).toBe(14);
    expect(t.promptsWritten).toBe(2);
  });

  it("T3249 ticking everything adds the new and replaces the rest", () => {
    const rows = planLibraryImport({
      parsed: FILE, existing: LIBRARY, codes: ["V01", "V22", "V26"], replace: true,
    });
    expect(rows.map((r) => r.action)).toEqual(["add", "replace", "replace"]);
    expect(importPlanTotals(rows)).toMatchObject({
      adding: 1, replacing: 2, skipping: 0, promptsDestroyed: 19, promptsWritten: 6,
    });
  });

  it("T3250 replace:false can never destroy, whatever is ticked", () => {
    // The fail-safe. A scripted caller that forgets `replace` gets an ADD-only
    // import — the same guarantee the old "Import new chains" button gave.
    const rows = planLibraryImport({
      parsed: FILE, existing: LIBRARY, codes: ["V01", "V22", "V26"], replace: false,
    });
    expect(rows.filter((r) => r.action === "replace")).toHaveLength(0);
    expect(importPlanTotals(rows).promptsDestroyed).toBe(0);
  });

  it("T3251 the preview reports what the library would LOSE, not just what it holds", () => {
    const rows = planLibraryImport({ parsed: FILE, existing: LIBRARY, codes: null, replace: false });
    const v22 = rows.find((r) => r.code === "V22")!;
    // These three fields are what the panel puts in front of Paul before he
    // ticks: it is already here, it is published, and 14 prompts die.
    expect(v22.exists).toBe(true);
    expect(v22.published).toBe(true);
    expect(v22.existingPrompts).toBe(14);
    // And the file's own count is kept separate — conflating the two would
    // report "replaces 2 prompts" for a chain that loses 14.
    expect(v22.prompts).toBe(2);
  });
});
