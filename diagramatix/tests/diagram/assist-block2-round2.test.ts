/**
 * T4610-T4614 — the second Block 2 round, 21 September 2026.
 *
 * Four defects read out of Paul's command log, plus two of his rules.
 *
 *   • "back order to the merge gateway." → "connect qruut4v9 to ksjm25kj"
 *     The command was RIGHT — the ids resolve now — but the sentence shown
 *     back was written in our internal vocabulary.
 *   • "Add a merge" → added a TASK named "merge". The word was in nobody's
 *     vocabulary, so the add rule made a task out of it.
 *   • "Undo" inside a numbered pick was answered "say the number of the item
 *     to rename" — three times in a row. The feature arguing with someone
 *     trying to leave.
 *   • The pool stopped spanning its lanes after a container delete.
 *
 * And the two rules: a decision gateway's label ends in "?", and the default
 * marker for decision and merge alike is None.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { humaniseIds } from "@/app/lib/assist/refMentions";
import { decisionLabel, isDecisionGateway } from "@/app/lib/diagram/nameCase";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import type { DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const el = (id: string, label: string, type = "task"): DiagramElement =>
  ({ id, type, label, x: 0, y: 0, width: 100, height: 60, properties: {} }) as unknown as DiagramElement;

describe("T4610 — the sentence shown back is in the user's vocabulary", () => {
  const els = [el("qruut4v9", "Back order"), el("ksjm25kj", "Merge", "gateway")];

  it("replaces ids with names in Paul's exact canonical", () => {
    expect(humaniseIds("connect qruut4v9 to ksjm25kj", els))
      .toBe("connect Back order to Merge");
  });

  it("falls back to the type when the element has no label", () => {
    expect(humaniseIds("connect qruut4v9 to aaaa1111", [el("aaaa1111", "", "gateway"), els[0]]))
      .toBe("connect Back order to gateway");
  });

  it("says “something” rather than printing an id with no element left", () => {
    expect(humaniseIds("delete zzzz9999", els)).toBe("delete something");
  });

  it("leaves ordinary words alone, including 8-letter ones", () => {
    expect(humaniseIds("connect Approve to Dispatch", els)).toBe("connect Approve to Dispatch");
    expect(humaniseIds("rename checkout to Checkout", els)).toBe("rename checkout to Checkout");
  });

  it("is what the log actually prints", () => {
    const body = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(body).toMatch(/humaniseIds\(canonical, data\.elements\)/);
  });
});

describe("T4611 — a merge is a gateway, and gateways carry no marker by default", () => {
  it("makes a gateway, not a task called “merge”", () => {
    expect(parseCommand("add a merge")).toEqual([{ op: "add", symbolType: "gateway" }]);
    expect(parseCommand("add a join")).toEqual([{ op: "add", symbolType: "gateway" }]);
  });

  it("gives a bare gateway or decision NO marker", () => {
    // Paul: "The default Decision and Merge Gateway marker should be None."
    for (const said of ["add a gateway", "add a decision", "add a merge gateway"]) {
      expect(parseCommand(said), said).toEqual([{ op: "add", symbolType: "gateway" }]);
    }
  });

  it("still honours a marker that was asked for", () => {
    expect(parseCommand("insert a parallel gateway")?.[0]).toMatchObject({ gatewayType: "parallel" });
    expect(parseCommand("add an exclusive gateway")?.[0]).toMatchObject({ gatewayType: "exclusive" });
  });
});

describe("T4612 — a decision's label is a question", () => {
  it("appends the mark", () => {
    expect(decisionLabel("In stock")).toBe("In stock?");
    expect(decisionLabel("Approved")).toBe("Approved?");
  });

  it("does not double it, or add one to other punctuation the user chose", () => {
    expect(decisionLabel("In stock?")).toBe("In stock?");
    expect(decisionLabel("Stop!")).toBe("Stop!");
    expect(decisionLabel("Check stock.")).toBe("Check stock.");
  });

  it("leaves an unlabelled gateway unlabelled — a bare “?” is worse", () => {
    expect(decisionLabel("")).toBe("");
    expect(decisionLabel("   ")).toBe("");
  });

  it("applies to decisions only — a merge asks nothing", () => {
    const gw = (role?: string) =>
      ({ type: "gateway", properties: role ? { gatewayRole: role } : {} }) as unknown as DiagramElement;
    expect(isDecisionGateway(gw("decision"))).toBe(true);
    expect(isDecisionGateway(gw()), "the role defaults to decision").toBe(true);
    expect(isDecisionGateway(gw("merge"))).toBe(false);
    expect(isDecisionGateway(el("t", "Task"))).toBe(false);
  });

  it("is enforced in the reducer, on both label paths", () => {
    const reducer = read("app", "hooks", "useDiagram.ts");
    expect(reducer, "UPDATE_LABEL").toMatch(/isDecisionGateway\(target\)\s*\n\s*\? decisionLabel\(capitaliseFirstWord\(action\.payload\.label\)\)/);
    expect(reducer, "ADD_ELEMENT").toMatch(/symbolType === "gateway" && smartGatewayRole !== "merge"\s*\n\s*\? decisionLabel\(capitalised\)/);
  });
});

describe("T4613 — “undo” inside a numbered pick gets you out", () => {
  const body = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");

  it("cancels the pick AND undoes, rather than arguing", () => {
    // Paul said "undo" three times and was told "say the number of the item to
    // rename" each time.
    expect(body).toMatch(/if \(\/\^undo\\b\/\.test\(low\)\) \{\s*\n\s*cancelRenameFlow\("rename cancelled"\);\s*\n\s*undo\(\);/);
  });

  it("names the way out in the prompt, not just the way to finish", () => {
    // "say done to finish" reads as "when you have finished renaming", which
    // is not the sentence someone wants when they are trying to get out.
    expect(body).toMatch(/“cancel” to stop, “done” when finished/);
  });
});

describe("T4614 — a pool still spans its lanes after a delete", () => {
  it("was broken in Paul's export: lanes ran 64px past the pool", () => {
    // The evidence, kept as the reason this guard exists.
    const f = "C:/Users/paul/Downloads/Voice Assist Walkthrough - Block 2 Test 2.json";
    let data: { elements: DiagramElement[] } | null = null;
    try { data = JSON.parse(readFileSync(f, "utf8")).diagrams[0].data; } catch { /* not on this machine */ }
    if (!data) return;                       // the export is Paul's, not the repo's
    const pool = data.elements.find((e) => e.label === "Warehouse")!;
    const lanes = data.elements.filter((e) => e.parentId === pool.id);
    const bottom = Math.max(...lanes.map((l) => l.y + l.height));
    expect(bottom - (pool.y + pool.height), "the overflow he reported").toBeGreaterThan(0);
  });

  it("every delete path now re-fits the containers", () => {
    // Every other lane action already ended this way; the delete path was the
    // one that did not, so a sub-lane delete grew a lane and left the pool
    // behind — "independent of its contents and behaves weirdly when resized".
    // Asserted against the WHOLE reducer, not a slice of it: slicing from
    // `case "DELETE_ELEMENT"` to the next case silently cut off the very line
    // being checked, and the test passed under a planted defect because of it.
    // Both strings appear exactly once, so the slice bought nothing.
    const reducer = read("app", "hooks", "useDiagram.ts");
    // The container quick-delete returns the re-fit DIRECTLY…
    expect(reducer).toMatch(/return \{ \.\.\.state, elements: ensureContainersEncloseChildren\(elements\), connectors \}/);
    // …and the main path builds `finalElements` from it. Anchored to the
    // delete path's OWN return, because `const finalElements =
    // ensureContainersEncloseChildren(sized)` also appears in
    // UPDATE_PROPERTIES — a plant on the delete path passed against that one.
    expect(reducer).toMatch(
      /const finalElements = ensureContainersEncloseChildren\(sized\);\s*\n\s*return \{ \.\.\.state, elements: finalElements, connectors \};/,
    );
  });
});
