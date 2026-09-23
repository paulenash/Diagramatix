/**
 * T4695–T4700 — six defects from Paul's Voice Assist log of 23 September 2026.
 *
 * The log is the specification here; each describe quotes the line it fixes.
 * They are separate defects with one thing in common: the assistant knew the
 * answer at some point and then threw it away — the kind it was, the element it
 * had named, the name it had given.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { resolveRef, spokenNumbersAsDigits } from "@/app/lib/assist/resolveRef";
import { needsConfirmation } from "@/app/lib/assist/confirm";
import { nextContainerLabels, uniqueContainerLabel } from "@/app/lib/diagram/containerNames";
import { namesAContainer } from "@/app/lib/assist/greedyGuards";
import type { DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const src = (p: string) => readFileSync(p, "utf8");

/** Pool 3 with three lanes, one of which has two sublanes — the shape in the log. */
const world = (): DiagramElement[] => [
  E({ id: "p1", type: "pool", label: "Company", x: 0, y: 0, width: 900, height: 300, properties: {} }),
  E({ id: "p3", type: "pool", label: "Pool 3", x: 0, y: 400, width: 900, height: 600, properties: {} }),
  E({ id: "L1", type: "lane", label: "Lane 1", x: 36, y: 400, width: 864, height: 200, parentId: "p3", properties: {} }),
  E({ id: "L2", type: "lane", label: "Lane 2", x: 36, y: 600, width: 864, height: 200, parentId: "p3", properties: {} }),
  E({ id: "L3", type: "lane", label: "Lane 3", x: 36, y: 800, width: 864, height: 200, parentId: "p3", properties: {} }),
  E({ id: "S1", type: "lane", label: "Sublane 1", x: 72, y: 400, width: 828, height: 100, parentId: "L1", properties: {} }),
  E({ id: "S2", type: "lane", label: "Sublane 2", x: 72, y: 500, width: 828, height: 100, parentId: "L1", properties: {} }),
];

describe("T4695 — a spoken kind word is a constraint, not decoration", () => {
  it("“pool three” never answers with a lane", () => {
    // The log: `Compact pool three.` → which “three”? 2 match: “Pool 3”, “Lane 3”
    expect(resolveRef("pool three", world())).toEqual({ id: "p3" });
    expect(resolveRef("pool 3", world())).toEqual({ id: "p3" });
  });

  it("“sublane one” never answers with the lane of that number", () => {
    expect(resolveRef("sublane one", world())).toEqual({ id: "S1" });
    expect(resolveRef("lane one", world())).toEqual({ id: "L1" });
  });

  it("nothing of the named kind is 'not found', not something of another kind", () => {
    const noSubs = world().filter((e) => e.id !== "S1" && e.id !== "S2");
    expect(resolveRef("sublane one", noSubs)).toBeNull();
  });

  it("a bare kind word still means 'the one of that kind', as before", () => {
    expect(resolveRef("the pool", world())).toEqual({ id: "p3" });   // most recent
    expect(resolveRef("sublane", world())).toEqual({ id: "S2" });
  });

  it("a name that merely starts with a kind word is untouched", () => {
    const els = [...world(), E({ id: "t", type: "task", label: "Pool cleaning", x: 0, y: 0, width: 10, height: 10, properties: {} })];
    expect(resolveRef("Pool cleaning", els)).toEqual({ id: "t" });
  });
});

describe("T4696 — the confirmation is pinned to the element it named", () => {
  it("needsConfirmation says WHICH element, so the answer cannot drift", () => {
    const c = needsConfirmation([{ op: "delete", ref: "sublane one" } as never], world());
    expect(c?.what).toContain("Sublane 1");
    expect(c?.targetId, "the id travels with the question").toBe("S1");
    expect(c?.ref).toBe("sublane one");
  });

  it("a selection reference is pinned too — the selection may be gone by 'yes'", () => {
    // The log: `Delete selected.` → … → `Yes.` → confirmed → which lane? …
    // I couldn't match “selected”.
    const c = needsConfirmation([{ op: "delete", ref: "selected" } as never], world(), null, ["L1"]);
    expect(c?.targetId).toBe("L1");
  });

  it("the editor substitutes that id before parking the question", () => {
    const ed = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(ed).toContain("ask.targetId && ask.ref ? substituteRef(ops, ask.ref, ask.targetId) : ops");
    expect(ed).toContain("pendingConfirmRef.current = { ops: pinned");
  });
});

describe("T4697 — the delete guard does not fire on a reference that is exact", () => {
  it("“one” and “1” are the same word said two ways", () => {
    expect(spokenNumbersAsDigits("sublane one")).toBe("sublane 1");
    expect(spokenNumbersAsDigits("Sublane 1")).toBe("Sublane 1");
  });

  it("an #id:, a selection or a pointer reference skips the name check", () => {
    const ed = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(ed).toContain("const exactRef = op.ref.startsWith(ID_REF_PREFIX) || isSelectionRef(op.ref) || isPointerElementRef(op.ref);");
    expect(ed).toContain("if (!exactRef && siblings.length > 1");
    // …which is also what stopped an internal id being shown to the user.
    expect(ed).toContain("spokenNumbersAsDigits(named)");
  });
});

describe("T4698 — a new lane is named against the diagram, and reported as named", () => {
  it("the grammar asks for the BARE kind, not a number it cannot know", () => {
    // The log: `added 1 lane to Pool 3: Lane 1` — twice, while the reducer was
    // making "Lane 1 2".
    expect(parseCommand("add a lane to pool three")).toEqual([{ op: "addLanes", poolRef: "pool three", labels: ["Lane"] }]);
    expect(parseCommand("add another sublane to lane one")).toEqual([{ op: "addSublanes", laneRef: "lane one", labels: ["Sublane"] }]);
    expect(parseCommand("add 2 lanes to the pool")).toEqual([{ op: "addLanes", poolRef: "the pool", labels: ["Lane", "Lane"] }]);
  });

  it("the numbering happens where the diagram is in view", () => {
    expect(nextContainerLabels(world(), ["Lane"], "Lane")).toEqual(["Lane 4"]);
    expect(nextContainerLabels(world(), ["Lane", "Lane"], "Lane"), "and within one batch").toEqual(["Lane 4", "Lane 5"]);
    // A sublane is "Sub N", not "Sublane N" (Paul, 2026-09-23): the name is
    // written down a 36px header strip, so every character costs the band
    // height it has to be given — "Sublane 3" needs ~92px, "Sub 3" needs 58.
    // The fixture's sublanes carry the OLD names, which do not block the new
    // stem — an existing diagram keeps "Sublane 1", and the next one made is
    // "Sub 1". Only names of the same stem are counted.
    expect(nextContainerLabels(world(), ["Sublane"], "Sublane")).toEqual(["Sub 1"]);
    expect(nextContainerLabels(world(), ["Sub"], "Sublane"), "the stem counts as bare too").toEqual(["Sub 1"]);
    const withSubs = [...world(), E({ id: "x", type: "lane", label: "Sub 1", parentId: "L1", x: 0, y: 0, width: 10, height: 10, properties: {} })];
    expect(nextContainerLabels(withSubs, ["Sublane", "Sublane"], "Sublane")).toEqual(["Sub 2", "Sub 3"]);
    // A name the user chose is kept, and only de-duplicated when taken.
    expect(nextContainerLabels(world(), ["Shipping"], "Lane")).toEqual(["Shipping"]);
    expect(uniqueContainerLabel(world(), "Lane 1", "Lane")).toBe("Lane 1 2");
  });

  it("the log line says the name the lane will really have", () => {
    const ed = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(ed).toContain('const laneNames = nextContainerLabels(els, op.labels, "Lane");');
    expect(ed).toContain('const subNames = nextContainerLabels(els, op.labels, "Sublane");');
    expect(ed, "never the requested labels").not.toMatch(/to \$\{nameOf\(pool\)\}: \$\{op\.labels\.join/);
  });
});

describe("T4699 — a phrasing about lanes is never turned into an element named after it", () => {
  it("“add a third lane to pool three” goes to the AI instead of making a task", () => {
    // The log: `Add a third lane to pool three.` → added third lane to pool three
    // — a TASK, labelled with the sentence, reported as a success.
    expect(parseCommand("add a third lane to pool three")).toBeNull();
    expect(parseCommand("add sublane to pool")).not.toBeNull();   // the sublane rule still reads this
  });

  it("the guard reads container words, and leaves real names alone", () => {
    expect(namesAContainer("third lane to pool three")).toBe(true);
    expect(namesAContainer("sub-lane below Sales")).toBe(true);
    expect(namesAContainer("Assembly Line")).toBe(false);
    expect(namesAContainer("Approve Invoice")).toBe(false);
  });

  it("a task someone really does want to call “Assembly Line” still works", () => {
    expect(parseCommand("add a task called Assembly Line")).toEqual([{ op: "add", symbolType: "task", label: "Assembly Line" }]);
  });
});

describe("T4700 — asking WHICH one in a way that can be answered", () => {
  it("the container commands raise the numbered picker, not “say the name”", () => {
    // The log: `which “pool three”? 2 match: “Pool 3”, “Pool 3” — say the name`.
    // Two things with the same name cannot be told apart by name.
    const ed = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    for (const ref of ["op.poolRef", "op.laneRef"]) {
      expect(ed, ref).toContain(`buildPickFlow(ops, ${ref},`);
    }
  });

  it("a sublane asked of a POOL uses its lane, or asks which lane", () => {
    // The log: `Add sublane to pool` → `Pool 3 isn't a lane`.
    const ed = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(ed).toContain("if (lanesIn.length === 1) target = lanesIn[0];");
    expect(ed).toContain("has no lanes to put a sublane in");
    expect(ed).toContain("which lane in ");
  });
});
