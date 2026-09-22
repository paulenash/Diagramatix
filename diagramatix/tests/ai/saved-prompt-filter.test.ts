/**
 * T4667–T4668 — Saved Prompts: a filter on the heading line, and twice the room.
 *
 * Paul, 22 September 2026, on AI Generate:
 *
 *   "1. Saved Prompts need a filter field on the same line as the heading to
 *       the right.
 *    2. Allow 2 x the height for the Saved Prompts in the panel."
 *
 * Three lists show saved prompts: the new full-screen AI Generate console,
 * which already had a filter, and the two SIDEBAR panels — `AiPanel` for most
 * diagram types and `PlanPanel` (titled "AI Plan") for BPMN — which had none.
 * All three now filter by the same rule, written once, so they cannot come to
 * match different things.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filterSavedPrompts } from "@/app/lib/ai/savedPromptFilter";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const AI_PANEL = read("app", "(dashboard)", "diagram", "[id]", "AiPanel.tsx");
const PLAN_PANEL = read("app", "(dashboard)", "diagram", "[id]", "PlanPanel.tsx");
const CONSOLE = read("app", "(dashboard)", "diagram", "[id]", "ai-generate", "SavedPromptsPanel.tsx");

const PROMPTS = [
  { id: "1", name: "Order to Cash", text: "Customer places an order; warehouse picks and ships." },
  { id: "2", name: "Hire an employee", text: "HR posts the role and screens CVs." },
  { id: "3", name: "Expense claim", text: "The employee submits receipts to Finance." },
];

describe("T4667 — one filter rule for every saved-prompt list", () => {
  it("matches the name", () => {
    expect(filterSavedPrompts(PROMPTS, "cash").map((p) => p.id)).toEqual(["1"]);
  });

  it("matches any phrase in the text — what people actually remember", () => {
    expect(filterSavedPrompts(PROMPTS, "warehouse").map((p) => p.id)).toEqual(["1"]);
    expect(filterSavedPrompts(PROMPTS, "employee").map((p) => p.id)).toEqual(["2", "3"]);
  });

  it("ignores case and surrounding space", () => {
    expect(filterSavedPrompts(PROMPTS, "  FINANCE ").map((p) => p.id)).toEqual(["3"]);
  });

  it("shows everything, in order, when the filter is empty", () => {
    expect(filterSavedPrompts(PROMPTS, "").map((p) => p.id)).toEqual(["1", "2", "3"]);
    expect(filterSavedPrompts(PROMPTS, "   ").map((p) => p.id)).toEqual(["1", "2", "3"]);
  });

  it("never hands back the caller's own array to be mutated", () => {
    expect(filterSavedPrompts(PROMPTS, "")).not.toBe(PROMPTS);
  });

  it("is the rule all three lists use", () => {
    for (const [name, src] of [["AiPanel", AI_PANEL], ["PlanPanel", PLAN_PANEL], ["the console", CONSOLE]] as const) {
      expect(src, `${name} does not use the shared rule`).toMatch(/filterSavedPrompts\(/);
    }
    // …and none keeps a private copy of it.
    expect(CONSOLE).not.toMatch(/p\.name\.toLowerCase\(\)\.includes\(q\)/);
  });
});

describe("T4668 — both sidebar panels: filter beside the heading, twice the height", () => {
  /** The Saved Prompts heading and whatever sits on its line. */
  const headingLine = (src: string) => {
    const at = src.indexOf(">Saved Prompts</p>");
    expect(at, "no Saved Prompts heading").toBeGreaterThan(-1);
    const open = src.lastIndexOf("<div", at);
    return src.slice(open, src.indexOf("</div>", at));
  };

  it("puts the filter on the heading's own line, to its right", () => {
    for (const [name, src] of [["AiPanel", AI_PANEL], ["PlanPanel", PLAN_PANEL]] as const) {
      const line = headingLine(src);
      expect(line, `${name}: heading and filter are not one flex row`).toMatch(/flex items-center justify-between/);
      const heading = line.indexOf("Saved Prompts");
      const input = line.indexOf('aria-label="Filter saved prompts"');
      expect(input, `${name}: no filter on the heading line`).toBeGreaterThan(-1);
      expect(input, `${name}: the filter must be to the RIGHT of the heading`).toBeGreaterThan(heading);
    }
  });

  it("lists only the prompts that match, and says so when none do", () => {
    for (const [name, src] of [["AiPanel", AI_PANEL], ["PlanPanel", PLAN_PANEL]] as const) {
      expect(src, `${name} still lists every prompt`).toMatch(/visiblePrompts\.map\(sp =>/);
      expect(src, `${name} has no "nothing matches" line`).toMatch(/Nothing matches &ldquo;\{promptFilter\.trim\(\)\}&rdquo;/);
    }
  });

  it("AiPanel: twice the height — max-h-56 where it was max-h-28", () => {
    expect(AI_PANEL).toMatch(/className="space-y-0\.5 max-h-56 overflow-y-auto"/);
    expect(AI_PANEL).not.toMatch(/space-y-0\.5 max-h-28 overflow-y-auto/);
  });

  it("PlanPanel: twice the height — 192px where it was 96, still resizable", () => {
    expect(PLAN_PANEL).toMatch(/useState\(192\);/);
    expect(PLAN_PANEL).toMatch(/startResize\(setSavedPromptsH, 1, 40, 400\)/);
  });

  it("PlanPanel's list fills its section, rather than assuming a 16px heading", () => {
    // The calc() did — and stopped being right once an input sat beside the
    // heading, clipping the last prompt under the resize handle.
    expect(PLAN_PANEL).not.toMatch(/calc\(100% - 16px\)/);
    expect(PLAN_PANEL).toMatch(/overflow-y-auto border border-gray-100 rounded flex-1 min-h-0/);
  });
});
