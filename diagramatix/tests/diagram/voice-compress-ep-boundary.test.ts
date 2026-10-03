/**
 * T5225 — Paul's capture 2026-10-03 (“Repeat until finished”): compress said the EP “is already fitted” although it had
 * ~145 px spare at the top, because its boundary events (on the top and bottom rim) counted as the highest / lowest
 * thing INSIDE. They sit on the rim, so they are not measured — and they ride the edge they are mounted on.
 * And the recogniser heard “compress selected” as “complete selected”.
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { repairHeardWords } from "@/app/lib/assist/selectedWord";
import { planCompressEp } from "@/app/lib/diagram/epCompress";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = "", parentId?: string, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}), ...extra }) as DiagramElement;

/** The EP of the capture: y 494–772, flow at y 639–704, a boundary event on the TOP rim and one on the BOTTOM rim. */
function world(): DiagramData {
  return {
    ...EMPTY_DIAGRAM,
    elements: [
      el("P", "pool", 0, 400, 2000, 700, "Claims"),
      el("L", "lane", 36, 400, 1964, 700, "Underwriters", "P"),
      el("EP", "subprocess-expanded", 1158, 494, 1012, 278, "Repeat until finished", "L", { properties: { subprocessType: "normal" } }),
      el("s", "start-event", 1182, 654, 36, 36, "", "EP"),
      el("t", "task", 1380, 639, 102, 65, "Closed Check", "EP"),
      el("e", "end-event", 2110, 654, 36, 36, "", "EP"),
      el("bTop", "intermediate-event", 1782, 476, 36, 36, "Cancellation", "EP", { boundaryHostId: "EP" }),
      el("bBot", "intermediate-event", 1750, 754, 36, 36, "Error", "EP", { boundaryHostId: "EP" }),
    ],
    connectors: [],
  };
}
const get = (h: ReturnType<typeof headlessDiagram>, id: string) => h.data.elements.find((e) => e.id === id)!;

describe("T5225 compress an EP that has boundary events on its rim", () => {
  it("the plan measures the content only: the top comes down", () => {
    const w = world();
    const plan = planCompressEp(w.elements, w.elements.find((e) => e.id === "EP")!);
    expect("error" in plan).toBe(false);
    if (!("error" in plan)) {
      expect(plan.y).toBeGreaterThan(494 + 80);               // ~145 px of spare room at the top
      expect(plan.saved).toBeGreaterThan(80);
    }
  });
  it("by voice, “compress” on the selected EP shrinks it, and its boundary events ride their edges", () => {
    const h = headlessDiagram(world());
    const r = applyAssistOps(parseCommand("compress this")!, h.context({ selectedIds: ["EP"] }));
    expect(r.ok, r.summary).toBe(true);
    const ep = get(h, "EP");
    expect(ep.y).toBeGreaterThan(494 + 80);
    expect(ep.height).toBeLessThan(278 - 80);
    expect(get(h, "bTop").y + 18).toBeCloseTo(ep.y, 0);                 // still centred on the top edge
    expect(get(h, "bBot").y + 18).toBeCloseTo(ep.y + ep.height, 0);     // and on the bottom edge
    expect(get(h, "t").y).toBe(639);                                    // the contents did not move
  });
  it("an EP genuinely already fitted still says so", () => {
    const w = world();
    const ep = w.elements.find((e) => e.id === "EP")!;
    const first = planCompressEp(w.elements, ep);
    if ("error" in first) throw new Error(first.error);
    ep.y = first.y; ep.height = first.height;                          // fitted once …
    const again = planCompressEp(w.elements, ep);                       // … so a second compress has nothing to do
    expect("error" in again ? again.error : "").toMatch(/already fitted/);
  });
});

describe("T5225 “complete selected” is read as “compress selected”", () => {
  it("only the exact shape: complete + a pointing word (+ a kind word)", () => {
    for (const [heard, fixed] of [
      ["complete selected", "compress selected"], ["Complete selected.", "Compress selected."], ["complete this", "compress this"],
      ["complete the selected", "compress the selected"], ["completed that", "compress that"], ["complete this expanded subprocess", "compress this expanded subprocess"],
      ["complete selected pool", "compress selected pool"],
    ]) expect(repairHeardWords(heard), heard).toBe(fixed);
  });
  it("a name that starts with “complete”, or other sentences, are untouched", () => {
    for (const s of ["complete documentation", "rename selected to complete", "add a task called complete this", "complete", "complete selected to approve"]) expect(repairHeardWords(s), s).toBe(s);
  });
  it("and the repaired sentence is a command", () => {
    expect(parseCommand(repairHeardWords("complete selected"))?.[0]?.op).toBe("compressPool");
  });
});
