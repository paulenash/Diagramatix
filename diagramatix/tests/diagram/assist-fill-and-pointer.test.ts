/**
 * T4591-T4596 — M4 (fill the selection) and M5 (the pointer as a reference).
 *
 * Both extend the multi-modal idea M1 started: the mouse says WHICH, the voice
 * says WHAT. M4 pushes it as far as it goes in one direction — the voice says
 * several things at once and the selection plus the READING ORDER says which is
 * which. M5 pushes it in the other — the mouse says WHERE, which a name cannot
 * express at all.
 *
 * ⚠ ONE DELIBERATE DEPARTURE FROM THE PLAN, tested below so it cannot be
 * quietly undone. The plan asked for "connect this to that" with *that* meaning
 * the element under the pointer. "This" and "that" already mean the selection
 * (M1, shipped and tested), and that sentence needs the two demonstratives to
 * mean DIFFERENT things inside one utterance — a rule nobody could remember,
 * which would make every existing "delete that" ambiguous. What ships instead
 * keeps the selection winning and adds the pointer as a better fallback than
 * "the last element added" ever was, plus explicit pointer words.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readingOrder, planLabelFill } from "@/app/lib/assist/fillSelection";
import {
  elementUnderPointer, isPositionRef, isPointerElementRef,
} from "@/app/lib/assist/pointerRef";
import { findRiskCatalogItem, normaliseCode } from "@/app/lib/assist/riskCatalogRef";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { validateOps } from "@/app/lib/assist/ops";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import type { DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const el = (
  id: string, x: number, y: number,
  extra: Partial<DiagramElement> = {},
): DiagramElement =>
  ({ id, type: "task", label: id, x, y, width: 100, height: 60, properties: {}, ...extra }) as unknown as DiagramElement;

// ────────────────────────────────────────────────────────────────────────────
describe("T4591 — M4: reading order is rows, not raw coordinates", () => {
  it("reads a single row left to right", () => {
    const row = [el("c", 400, 100), el("a", 0, 100), el("b", 200, 100)];
    expect(readingOrder(row).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("reads two lanes as two rows, not interleaved", () => {
    // Sorting by x alone would give a1,b1,a2,b2 — one lane's names landing on
    // the other's elements, which is the whole reason this is not a one-liner.
    const two = [
      el("a2", 0, 300), el("b1", 200, 100), el("a1", 0, 100), el("b2", 200, 300),
    ];
    expect(readingOrder(two).map((e) => e.id)).toEqual(["a1", "b1", "a2", "b2"]);
  });

  it("treats a row that is not pixel-aligned as one row", () => {
    // A gateway beside a task is never aligned to the pixel.
    const mixed = [
      el("gw", 200, 110, { type: "gateway", width: 50, height: 50 }),
      el("task", 0, 100),
    ];
    expect(readingOrder(mixed).map((e) => e.id)).toEqual(["task", "gw"]);
  });

  it("is deterministic when two elements sit exactly on top of each other", () => {
    const same = [el("z", 0, 0), el("a", 0, 0)];
    expect(readingOrder(same).map((e) => e.id)).toEqual(["a", "z"]);
    expect(readingOrder([...same].reverse()).map((e) => e.id)).toEqual(["a", "z"]);
  });
});

describe("T4592 — M4: a count mismatch is refused, not truncated", () => {
  const three = [el("a", 0, 0), el("b", 200, 0), el("c", 400, 0)];

  it("pairs names with elements in reading order", () => {
    const plan = planLabelFill(three, ["Receive", "Check", "Ship"]);
    expect(plan.ok).toBe(true);
    expect(plan.ok && plan.assign).toEqual([
      { id: "a", label: "Receive" }, { id: "b", label: "Check" }, { id: "c", label: "Ship" },
    ]);
  });

  it("refuses too few names rather than renaming some of them", () => {
    // Renaming two of three leaves a diagram that LOOKS finished and is wrong.
    const plan = planLabelFill(three, ["Receive", "Check"]);
    expect(plan.ok).toBe(false);
    expect(plan.ok === false && plan.reason).toMatch(/2 names for 3 selected/);
  });

  it("refuses too many names", () => {
    const plan = planLabelFill(three, ["A", "B", "C", "D"]);
    expect(plan.ok).toBe(false);
  });

  it("says so when nothing is selected, and when no name was heard", () => {
    expect(planLabelFill([], ["A"])).toEqual({ ok: false, reason: "nothing is selected" });
    expect(planLabelFill(three, ["  ", ""])).toEqual({ ok: false, reason: "I didn't catch any names" });
  });

  it("parses the command without being read as a rename of “these”", () => {
    expect(parseCommand("name these Receive, Check and Ship"))
      .toEqual([{ op: "fillLabels", labels: ["Receive", "Check", "Ship"] }]);
    expect(parseCommand("label the selected tasks Draft and Review")?.[0])
      .toMatchObject({ op: "fillLabels", labels: ["Draft", "Review"] });
    // A real rename of a named element must be untouched.
    expect(parseCommand("rename Review to Final Review")?.[0].op).toBe("rename");
    // The kind word must be PLURAL, and this is why: "label the selected
    // connector Approved" is an older, tested command that labels ONE
    // connector. The first version of this rule swallowed it and turned a
    // single connector label into a fill. Caught by the full suite, not by
    // this file — which is the argument for running it before pushing.
    expect(parseCommand("label the selected connector Approved")?.[0].op).toBe("labelSelected");
    expect(parseCommand("label selected Yes")?.[0].op).toBe("labelSelected");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("T4593 — M4: teams and risks, said once for everything selected", () => {
  it("parses a team assignment, and only when the word 'team' was said", () => {
    expect(parseCommand("assign these to the Finance team"))
      .toEqual([{ op: "assignTeam", team: "Finance" }]);
    expect(parseCommand("put the selected tasks in the Sales team")?.[0])
      .toMatchObject({ op: "assignTeam", team: "Sales" });
    // "move these to the right" is a MOVE and "put these in a pool" is a wrap —
    // neither may be swallowed by a rule that takes the selection and a noun.
    expect(parseCommand("move these right")?.[0].op).not.toBe("assignTeam");
    expect(parseCommand("wrap these in a pool called Finance")?.[0].op).not.toBe("assignTeam");
  });

  it("parses a risk or control attachment", () => {
    expect(parseCommand("attach risk R-012 to these"))
      .toEqual([{ op: "attachRiskControl", ref: "R-012" }]);
    expect(parseCommand("attach control C-3 to the selected task")?.[0])
      .toMatchObject({ op: "attachRiskControl", ref: "C-3" });
  });

  it("normalises a dictated catalogue code, which is the worst thing to say aloud", () => {
    // "R-012" comes back as any of these. Leading zeros are never spoken.
    for (const said of ["R-012", "r 012", "R012", "r-12", "are 012"]) {
      expect(normaliseCode(said), said).toBe("R12");
    }
    expect(normaliseCode("duplicate payment"), "a name is not a code").toBeNull();
  });

  it("finds an item by code or by name — and NEVER fuzzily", () => {
    const cat = [
      { id: "1", code: "R-012", name: "Duplicate payment", kind: "Risk" },
      { id: "2", code: "C-3", name: "Two-person approval", kind: "Control" },
    ];
    expect(findRiskCatalogItem(cat, "r 012")?.id).toBe("1");
    expect(findRiskCatalogItem(cat, "Duplicate payment")?.id).toBe("1");
    expect(findRiskCatalogItem(cat, "duplicate")?.id, "whole-phrase substring").toBe("1");
    // The natural phrasing wraps the name in words, and must still land.
    expect(findRiskCatalogItem(cat, "the duplicate payment risk")?.id).toBe("1");
    // Attaching the WRONG control survives into an audit, so a NEAR-MISS must
    // fail rather than resolve to a plausible neighbour. Neither of these
    // contains the catalogue name, and neither is matched by sound or edit
    // distance — deliberately, unlike every other reference in the product.
    expect(findRiskCatalogItem(cat, "double payment"), "a synonym is not a match").toBeNull();
    expect(findRiskCatalogItem(cat, "duplicate paymnt"), "a typo is not a match").toBeNull();
    expect(findRiskCatalogItem(cat, "R-99")).toBeNull();
    expect(findRiskCatalogItem([], "R-012")).toBeNull();
  });

  it("validates all three ops, and drops an empty one", () => {
    expect(validateOps([{ op: "fillLabels", labels: ["A", " ", "B"] }]))
      .toEqual([{ op: "fillLabels", labels: ["A", "B"] }]);
    expect(validateOps([{ op: "fillLabels", labels: [] }])).toEqual([]);
    expect(validateOps([{ op: "assignTeam", team: "Finance" }])).toEqual([{ op: "assignTeam", team: "Finance" }]);
    expect(validateOps([{ op: "assignTeam", team: "  " }])).toEqual([]);
    expect(validateOps([{ op: "attachRiskControl", ref: "R-012" }])).toEqual([{ op: "attachRiskControl", ref: "R-012" }]);
  });

  it("insists on a selection and refuses a team on a non-activity", () => {
    const body = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(body, "a command that names nothing must not fall back to recency")
      .toMatch(/op\.op === "fillLabels"[\s\S]{0,400}selectedIds\.map/);
    expect(body, "a team belongs to an activity, and anything else is named")
      .toMatch(/a team belongs to an activity/);
    expect(body, "and the ones it skipped are listed").toMatch(/skipped \$\{skipped\.map\(nameOf\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("T4594 — M5: what the pointer is over", () => {
  const pool = el("pool", 0, 0, { type: "pool", width: 800, height: 400, label: "Warehouse" });
  const task = el("task", 100, 100);
  const sub = el("sub", 80, 80, { type: "subprocess-expanded", width: 200, height: 140 });

  it("finds the element under the point", () => {
    expect(elementUnderPointer({ x: 150, y: 130 }, [pool, task])?.id).toBe("task");
  });

  it("prefers what is inside a container over the container", () => {
    // A pool covers everything in it, and is almost never what the hand means.
    expect(elementUnderPointer({ x: 150, y: 130 }, [pool, task])?.id).toBe("task");
    // …but a pointer over the bare part of the pool still finds the pool, or
    // there would be no way to point at one at all.
    expect(elementUnderPointer({ x: 700, y: 350 }, [pool, task])?.id).toBe("pool");
  });

  it("prefers the element even when the CONTAINER is the smaller of the two", () => {
    // The case the "smaller wins" tie-break gets wrong on its own, and the one
    // the container rule exists for: an element taller than the lane it sits
    // in, which is ordinary while a lane has not grown to fit yet.
    const lane = el("lane", 0, 0, { type: "lane", width: 400, height: 300 });
    const tall = el("tall", 0, 0, { width: 400, height: 310 });
    expect(elementUnderPointer({ x: 200, y: 150 }, [lane, tall])?.id).toBe("tall");
  });

  it("prefers the smaller of two overlapping elements", () => {
    expect(elementUnderPointer({ x: 150, y: 130 }, [sub, task])?.id).toBe("task");
  });

  it("finds nothing over empty canvas, and nothing with no pointer", () => {
    expect(elementUnderPointer({ x: 5000, y: 5000 }, [pool, task])).toBeNull();
    expect(elementUnderPointer(null, [pool, task])).toBeNull();
  });

  it("tells a position word from an element word", () => {
    for (const s of ["here", "there", "right here", "over there"]) {
      expect(isPositionRef(s), s).toBe(true);
      expect(isPointerElementRef(s), s).toBe(false);
    }
    for (const s of ["the one under the cursor", "this one here", "that one there", "the one I'm pointing at"]) {
      expect(isPointerElementRef(s), s).toBe(true);
      expect(isPositionRef(s), s).toBe(false);
    }
    expect(isPositionRef("Approve")).toBe(false);
    expect(isPointerElementRef("this")).toBe(false);
  });
});

describe("T4595 — M5: the pointer never outranks the selection", () => {
  const a = el("a", 0, 0, { label: "Approve" });
  const b = el("b", 300, 0, { label: "Review" });
  const els = [a, b];
  const pointerOverB = { x: 350, y: 30 };

  it("resolves the explicit phrase to whatever is under the pointer", () => {
    expect(resolveRef("the one under the cursor", els, null, [], { pointer: pointerOverB }))
      .toEqual({ id: "b" });
  });

  it("returns nothing for the explicit phrase when the pointer is over nothing", () => {
    expect(resolveRef("the one under the cursor", els, null, [], { pointer: { x: 9999, y: 9999 } }))
      .toBeNull();
    expect(resolveRef("the one under the cursor", els, null, [], {})).toBeNull();
  });

  it("KEEPS the M1 meaning of a bare demonstrative — the selection wins", () => {
    // This is the regression that would have been introduced by doing what the
    // plan literally asked for.
    expect(resolveRef("this", els, null, ["a"], { pointer: pointerOverB }), "selection beats pointer")
      .toEqual({ id: "a" });
    expect(resolveRef("that", els, null, ["a"], { pointer: pointerOverB })).toEqual({ id: "a" });
  });

  it("keeps the last-added meaning too, which 'it' explicitly means", () => {
    expect(resolveRef("it", els, "a", [], { pointer: pointerOverB })).toEqual({ id: "a" });
  });

  it("uses the pointer only as a better LAST resort than document order", () => {
    // Nothing selected, nothing added this session: the hand resting on an
    // element is a better answer than "the last element in the document".
    expect(resolveRef("this", els, null, [], { pointer: pointerOverB })).toEqual({ id: "b" });
    // And with no pointer at all, the old fallback is unchanged.
    expect(resolveRef("this", els, null, [], {})).toEqual({ id: "b" });
    expect(resolveRef("this", [b, a], null, [], {}), "document order, as before").toEqual({ id: "a" });
  });
});

describe("T4596 — M5: “put a task here”", () => {
  it("parses the position word off the end", () => {
    expect(parseCommand("put a task here")).toEqual([{ op: "add", symbolType: "task", at: "pointer" }]);
    expect(parseCommand("add a gateway there")?.[0]).toMatchObject({ op: "add", symbolType: "gateway", at: "pointer" });
    expect(parseCommand("add a task called Approve here")?.[0])
      .toMatchObject({ op: "add", symbolType: "task", label: "Approve", at: "pointer" });
  });

  it("leaves an ordinary add alone", () => {
    const add = parseCommand("add a task called Approve after Review")?.[0];
    expect(add).toMatchObject({ op: "add", label: "Approve", afterRef: "Review" });
    expect(add && "at" in add).toBe(false);
  });

  it("does not eat a name that really is “Here”", () => {
    // Stripping would leave "called" with nothing after it.
    const op = parseCommand("add a task called Here")?.[0];
    expect(op).toMatchObject({ op: "add", label: "Here" });
    expect(op && "at" in op).toBe(false);
  });

  it("is validated, so the AI can reach it", () => {
    expect(validateOps([{ op: "add", symbolType: "task", at: "pointer" }]))
      .toEqual([{ op: "add", symbolType: "task", at: "pointer" }]);
    expect(validateOps([{ op: "add", symbolType: "task", at: "elsewhere" }]))
      .toEqual([{ op: "add", symbolType: "task" }]);
  });

  it("refuses rather than dropping one at (0,0) when the mouse was never seen", () => {
    const body = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(body).toMatch(/I don't know where “here” is/);
    // And it still keeps clear of what is already there.
    expect(body).toMatch(/center = findFreeSlot\(pointerWorld\.current, w, h, others\)/);
    // An explicit position is not a request for a flow.
    expect(body).toMatch(/op\.at === "pointer"[\s\S]{0,600}anchor = null;/);
  });

  it("is fed by the canvas without causing a render", () => {
    const canvas = read("app", "components", "canvas", "Canvas.tsx");
    expect(canvas, "capture, so a child that stops the event cannot blind it")
      .toContain("onPointerMoveCapture");
    const editor = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(editor, "a ref, never state — this fires on every mouse move")
      .toMatch(/const pointerWorld = useRef</);
    expect(editor).toMatch(/onPointerWorld=\{\(p\) => \{ pointerWorld\.current = p; \}\}/);
  });
});
