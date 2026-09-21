/**
 * T4606-T4609 — Paul's four findings from Block 2, 21 September 2026.
 *
 *   1. "Lanes are created without capitalised names."
 *   2. 'Deleting Lane "picking 2" causes the creation of orphaned space where
 *      it used to be.' (with before/after exports)
 *   3. "Delete Sublane should allow deletion but retaining the contents."
 *   4. "Create a participant box for the courier above customer" added a TASK
 *      named "Participant box for the courier above customer".
 *
 * (3) turned out to be the most interesting: the reducer has ALWAYS kept the
 * contents — it cascade-deletes the container subtree and re-homes every
 * non-container child. The confirmation prompt was simply wrong, and it talked
 * him out of an operation that was safe.
 */
import { describe, it, expect } from "vitest";
import { fillLaneWithSublanes, sublaneVoid } from "@/app/lib/diagram/laneFill";
import { capitaliseFirstWord } from "@/app/lib/diagram/nameCase";
import { needsConfirmation } from "@/app/lib/assist/confirm";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { looksPositionalNotAName } from "@/app/lib/assist/greedyGuards";
import type { DiagramElement } from "@/app/lib/diagram/types";

const lane = (id: string, label: string, y: number, height: number, parentId?: string): DiagramElement =>
  ({ id, type: "lane", label, x: 0, y, width: 800, height, parentId, properties: {} }) as unknown as DiagramElement;

describe("T4606 — a lane that grows takes its sub-lanes with it", () => {
  // Paul's diagram, to the pixel: Shipping held Domestic + International, and
  // absorbed the 257px of "Picking 2" when it was deleted.
  const before = [
    lane("pool", "Warehouse", -118, 736),
    lane("ship", "Shipping", 99, 262, "pool"),
    lane("dom", "Domestic", 99, 187, "ship"),
    lane("intl", "International", 286, 75, "ship"),
  ];

  it("starts with no void — the sub-lanes fill the lane exactly", () => {
    expect(sublaneVoid(before, "ship")).toBe(0);
  });

  it("fills the void left when the lane absorbs the space below it", () => {
    // What the absorb model does: y stays, height 262 → 519.
    const grown = before.map((e) => (e.id === "ship" ? { ...e, height: 519 } : e));
    expect(sublaneVoid(grown, "ship"), "the defect: 257px of empty lane").toBe(257);

    const fixed = fillLaneWithSublanes(grown, "ship");
    expect(sublaneVoid(fixed, "ship")).toBe(0);
    // The BOTTOM-most sub-lane takes it, because that is the edge that moved.
    const intl = fixed.find((e) => e.id === "intl")!;
    expect(intl.y, "International stays put").toBe(286);
    expect(intl.height, "and grows by exactly the deleted lane's height").toBe(75 + 257);
    // Everything else is untouched — no silent proportional resizing.
    expect(fixed.find((e) => e.id === "dom")).toEqual(before.find((e) => e.id === "dom"));
  });

  it("gives space opened ABOVE to the top-most sub-lane", () => {
    // The absorber can also grow upward, when it takes the lane above it.
    const grown = before.map((e) => (e.id === "ship" ? { ...e, y: -100, height: 461 } : e));
    const fixed = fillLaneWithSublanes(grown, "ship");
    expect(sublaneVoid(fixed, "ship")).toBe(0);
    const dom = fixed.find((e) => e.id === "dom")!;
    expect(dom.y).toBe(-100);
    expect(fixed.find((e) => e.id === "intl")).toEqual(grown.find((e) => e.id === "intl"));
  });

  it("recurses, because the sub-lane that grew may have its own", () => {
    const nested = [
      ...before,
      lane("a", "A", 286, 40, "intl"),
      lane("b", "B", 326, 35, "intl"),
    ];
    const grown = nested.map((e) => (e.id === "ship" ? { ...e, height: 519 } : e));
    const fixed = fillLaneWithSublanes(grown, "ship");
    expect(sublaneVoid(fixed, "ship")).toBe(0);
    expect(sublaneVoid(fixed, "intl"), "the nested band too").toBe(0);
  });

  it("does nothing when there is nothing to do", () => {
    expect(fillLaneWithSublanes(before, "ship")).toBe(before);
    expect(fillLaneWithSublanes(before, "dom"), "no sub-lanes").toBe(before);
    expect(fillLaneWithSublanes(before, "nope"), "no such lane").toBe(before);
  });
});

describe("T4607 — container names start with a capital too", () => {
  it("capitalises a dictated lane name", () => {
    // "add three lanes to Warehouse called sales, picking and shipping" left
    // them lower-case beside every name that was typed.
    expect(capitaliseFirstWord("sales")).toBe("Sales");
    expect(capitaliseFirstWord("picking 2")).toBe("Picking 2");
  });

  it("is applied BEFORE the uniqueness pass, so case cannot hide a clash", () => {
    // "sales" next to an existing "Sales" must be caught as the duplicate it
    // is, not slip past on case and produce two lanes that read identically.
    const reducer = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "app", "hooks", "useDiagram.ts"), "utf8",
    );
    expect(reducer).toMatch(/const base = capitaliseFirstWord\(\(desired \?\? ""\)\.trim\(\)\);/);
  });
});

describe("T4608 — the confirmation stops claiming the contents are deleted", () => {
  const els = [
    // A real POOL, not a lane — otherwise Shipping's parent reads as a lane
    // and the message calls it a sub-lane.
    ({ id: "pool", type: "pool", label: "Warehouse", x: 0, y: 0, width: 800, height: 400, properties: {} }) as unknown as DiagramElement,
    lane("ship", "Shipping", 0, 300, "pool"),
    lane("dom", "domestic", 0, 200, "ship"),
    ...Array.from({ length: 7 }, (_, i) =>
      ({ id: `t${i}`, type: "task", label: `T${i}`, x: 10, y: 10 + i, width: 90, height: 50, parentId: "dom", properties: {} }) as unknown as DiagramElement),
  ];

  it("says the elements are KEPT, because they are", () => {
    // The reducer cascade-deletes the container subtree and re-homes every
    // non-container child. The old prompt said "and the 7 elements inside it",
    // so Paul said no to something that would not have touched them.
    const msg = needsConfirmation([{ op: "delete", ref: "domestic" }], els, null, []);
    expect(msg).toBe("delete the sub-lane “domestic” — the 7 elements inside it will be kept");
    expect(msg, "the wording that talked him out of it").not.toMatch(/and the 7 elements inside it$/);
  });

  it("still asks — the band itself is structure, and losing it is worth a beat", () => {
    expect(needsConfirmation([{ op: "delete", ref: "domestic" }], els, null, [])).not.toBeNull();
  });

  it("counts only the real contents, not the sub-lanes", () => {
    const msg = needsConfirmation([{ op: "delete", ref: "Shipping" }], els, null, []);
    // Shipping's only direct child is the "domestic" lane; the seven tasks
    // live one level down. Counting the LANE would read "1 element inside it",
    // true of nothing a user can see — so the count reaches through it to the
    // seven things they are actually worried about.
    expect(msg).toBe("delete the lane “Shipping” — the 7 elements inside it will be kept");
  });
});

describe("T4609 — a participant box is a pool, not a task with a sentence for a name", () => {
  it("parses Paul's exact command as a black-box pool above Customer", () => {
    expect(parseCommand("create a participant box for the courier above customer")).toEqual([
      { op: "addPool", poolType: "black-box", position: "above", label: "Courier", relativeTo: "customer" },
    ]);
  });

  it("treats a participant box as black-box, which is what the spec calls it", () => {
    const ops = parseCommand("add a participant box called Courier");
    expect(ops?.[0]).toMatchObject({ op: "addPool", poolType: "black-box", label: "Courier" });
  });

  it("takes 'for X' as the name, which is how a person says it", () => {
    expect(parseCommand("add a pool for Finance")?.[0]).toMatchObject({ label: "Finance" });
  });

  it("leaves the existing pool phrasings alone", () => {
    expect(parseCommand("add a black box pool above Customer")?.[0])
      .toMatchObject({ op: "addPool", poolType: "black-box", position: "above", relativeTo: "Customer" });
    expect(parseCommand("add a pool called Finance")?.[0])
      .toMatchObject({ op: "addPool", label: "Finance" });
  });

  it("refuses an implicit label with a position phrase ANYWHERE in it", () => {
    // Anchoring to the start was not enough — the defect's label did not begin
    // with a positional word, so a task carrying the whole sentence was made.
    expect(looksPositionalNotAName("participant box for the courier above customer")).toBe(true);
    expect(looksPositionalNotAName("gateway between Check Stock and Pick Items")).toBe(true);
    expect(looksPositionalNotAName("task below the gateway")).toBe(true);
  });

  it("still allows a name that merely contains a common preposition", () => {
    // "to" and "from" appear in real step names all the time, so they are not
    // in the inside-the-name list.
    expect(looksPositionalNotAName("Send to Customer")).toBe(false);
    expect(looksPositionalNotAName("Receive from Supplier")).toBe(false);
    expect(looksPositionalNotAName("Approve Invoice")).toBe(false);
  });
});
