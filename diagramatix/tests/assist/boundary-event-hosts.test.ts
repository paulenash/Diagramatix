/**
 * T5214 — "add a boundary event" goes on any ACTIVITY: a task, a collapsed subprocess or an expanded subprocess,
 * whether it is named, selected, or — with nothing selected — under the cursor (Paul, 2026-10-02).
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label: string, parentId?: string): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}) }) as DiagramElement;
const world = (): DiagramData => ({
  ...EMPTY_DIAGRAM,
  elements: [
    el("pool", "pool", 0, 0, 900, 420, "Claims"), el("lane", "lane", 30, 0, 870, 420, "Intake", "pool"),
    el("task", "task", 80, 60, 102, 64, "Review Claim", "lane"),
    el("sub", "subprocess", 260, 60, 102, 64, "Check Cover", "lane"),
    el("ep", "subprocess-expanded", 440, 40, 300, 160, "Settle Claim", "lane"),
    el("gw", "gateway", 100, 260, 40, 40, "Approved?", "lane"),
  ],
  connectors: [],
});
const HOSTS: Array<[string, string, { x: number; y: number }]> = [
  ["task", "Task", { x: 130, y: 92 }],
  ["sub", "Collapsed subprocess", { x: 310, y: 92 }],
  ["ep", "Expanded subprocess", { x: 720, y: 190 }],       // its bare corner — the pointer finds the EP itself
];

function add(sentence: string, opts: { selected?: string[]; pointer?: { x: number; y: number } | null }) {
  const h = headlessDiagram(world());
  const ops = parseCommand(sentence);
  expect(ops, sentence).toBeTruthy();
  const r = applyAssistOps(ops!, h.context({ selectedIds: opts.selected ?? [], pointer: opts.pointer ?? null }));
  return { r, h };
}
const mounted = (h: ReturnType<typeof headlessDiagram>) => h.data.elements.filter((e) => e.boundaryHostId);

describe("T5214 every activity can take a boundary event", () => {
  for (const [id, what, point] of HOSTS) {
    it(`${what}: named`, () => {
      const name = world().elements.find((e) => e.id === id)!.label;
      const { r, h } = add(`add a boundary event called Wait 2 days to ${name}`, {});
      expect(r.ok, r.summary).toBe(true);
      expect(mounted(h)[0]?.boundaryHostId).toBe(id);
    });
    it(`${what}: selected`, () => {
      const { r, h } = add("add a boundary event called Payment error", { selected: [id] });
      expect(r.ok, r.summary).toBe(true);
      expect(mounted(h)[0]?.boundaryHostId).toBe(id);
    });
    it(`${what}: under the cursor, nothing selected`, () => {
      const { r, h } = add("add a boundary event called Payment error", { pointer: point });
      expect(r.ok, r.summary).toBe(true);
      expect(mounted(h)[0]?.boundaryHostId).toBe(id);
    });
  }
});

describe("T5214 what is not an activity, or not clear, is still refused", () => {
  it("a gateway can't host one — pointed at or selected", () => {
    expect(add("add a boundary event called Late", { selected: ["gw"] }).r.ok).toBe(false);
    expect(add("add a boundary event called Late", { pointer: { x: 120, y: 280 } }).r.ok).toBe(false);
  });
  it("nothing selected and the cursor over nothing: it says how to say it, and adds nothing", () => {
    const { r, h } = add("add a boundary event called Late", { pointer: { x: 800, y: 380 } });
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("select or point at one");
    expect(mounted(h)).toHaveLength(0);
  });
  it("several selected: refused rather than guessed (the cursor is not consulted)", () => {
    expect(add("add a boundary event called Late", { selected: ["task", "sub"], pointer: { x: 130, y: 92 } }).r.ok).toBe(false);
  });
  it("the selection wins over the cursor", () => {
    const { r, h } = add("add a boundary event called Payment error", { selected: ["sub"], pointer: { x: 130, y: 92 } });
    expect(r.ok, r.summary).toBe(true);
    expect(mounted(h)[0]?.boundaryHostId).toBe("sub");
  });
});
