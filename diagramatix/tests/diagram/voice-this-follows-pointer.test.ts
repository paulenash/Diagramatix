/**
 * "this" follows the cursor.
 *
 * Paul, 2026-10-01: "Using the cursor to indicate which element is the target is
 * unreliable. I can rename an element using 'this' and then move the cursor elsewhere
 * in the diagram and try to use 'this' while hovering over another element and the new
 * name is applied to the previous element changed."
 *
 * Cause: for a bare "this"/"that" the resolver tried the selection, then "the one just
 * added/changed by voice", and only THEN the element under the cursor — so the cursor
 * counted only before the first voice edit of the session. The demonstratives point;
 * only "it" / "the last" / "the new one" mean recency.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import type { DiagramElement } from "@/app/lib/diagram/types";

const E = (id: string, x: number, label: string) =>
  ({ id, type: "task", x, y: 100, width: 100, height: 60, label, properties: {} }) as unknown as DiagramElement;
const A = E("a", 0, "Alpha");
const B = E("b", 300, "Beta");
const els = [A, B];
const overB = { x: 350, y: 130 };
const overA = { x: 50, y: 130 };
const overNothing = { x: 900, y: 900 };

describe("T5159 — a bare “this” / “that” means the element under the cursor, not the last one touched", () => {
  it("Paul's sequence: the last one touched is A, the cursor is on B — “this” is B", () => {
    for (const word of ["this", "that"]) {
      expect(resolveRef(word, els, "a", [], { pointer: overB }), word).toEqual({ id: "b" });
    }
  });

  it("…and moving the cursor back changes the answer with it", () => {
    expect(resolveRef("this", els, "a", [], { pointer: overA })).toEqual({ id: "a" });
    expect(resolveRef("this", els, "a", [], { pointer: overB })).toEqual({ id: "b" });
  });

  it("the selection still comes first — click it, then say “this” — and recency is still the fallback with the mouse over nothing", () => {
    expect(resolveRef("this", els, "b", ["a"], { pointer: overB })).toEqual({ id: "a" });
    expect(resolveRef("this", els, "a", [], { pointer: overNothing })).toEqual({ id: "a" });
    expect(resolveRef("this", els, "a", [], { pointer: null })).toEqual({ id: "a" });
  });

  it("“it” and “the last” stay recency — only the demonstratives point", () => {
    for (const word of ["it", "the last"]) {
      expect(resolveRef(word, els, "a", [], { pointer: overB }), word).toEqual({ id: "a" });
    }
  });
});

describe("T5160 — “rename this to …” renames what the cursor is on, each time", () => {
  const tasks = fixtureDiagram().elements.filter((e) => e.type === "task");
  const centre = (e: DiagramElement) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });

  it("two renames in a row, the cursor moved between them: each lands on its own element", () => {
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    const [t1, t2] = tasks;
    const h = headlessDiagram(fixtureDiagram());
    const ops1 = parseCommand("rename this to First New Name")!;
    const r1 = applyAssistOps(ops1, h.context({ pointer: centre(t1) }));
    expect(r1.ok, r1.summary).toBe(true);
    const ops2 = parseCommand("rename this to Second New Name")!;
    const r2 = applyAssistOps(ops2, h.context({ pointer: centre(t2) }));
    expect(r2.ok, r2.summary).toBe(true);
    const label = (id: string) => h.data.elements.find((e) => e.id === id)?.label;
    expect(label(t1.id)).toBe("First New Name");
    expect(label(t2.id)).toBe("Second New Name");
  });

  it("the resolver states the order: selection, then the pointer for a demonstrative, then recency", () => {
    const src = readFileSync("app/lib/assist/resolveRef.ts", "utf8").replace(/\r\n/g, "\n");
    const at = src.indexOf("if (LAST_PRONOUNS.has(s) || DEMONSTRATIVE.test(s)) {");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, src.indexOf("if (PREV_PRONOUNS.has(s))", at));
    expect(block.indexOf("if (DEMONSTRATIVE.test(s)) {")).toBeLessThan(block.indexOf("if (lastAddedId &&"));
  });
});
