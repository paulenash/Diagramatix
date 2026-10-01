/**
 * Pools, lanes and sub-lanes are named with EVERY word capitalised — including when the AI generates them.
 *
 * Paul, 2026-10-01: "AI generated names should be fully capitalised, and they normally are at the moment. Perhaps
 * check AI generated Pool and lane names. There may already be a Green rule for that." There was not (R4.03 only says
 * names should MATCH the description) and no code enforced it: the model capitalised by habit. Now the layout —
 * where every generated plan and every image read passes — makes it so, and a Green rule tells the model.
 *
 * (Pool names are NOT swapped for placeholders on the way to the model: the reversible redaction of ENT-06 is for the
 * narrative-style features only, so there is no "restored" name to bypass this.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";

const run = (els: AiElement[], conns: AiConnection[] = []) => layoutBpmnDiagram(els, conns);
const labelOf = (out: ReturnType<typeof run>, id: string) => out.elements.find((e) => e.id === id)?.label;

const plan = (): AiElement[] => [
  { id: "p", type: "pool", label: "customer service desk", poolType: "white-box", lanes: [{ id: "l1", name: "claims team" }, { id: "l2", name: "finance team" }] },
  { id: "bb", type: "pool", label: "credit bureau", poolType: "black-box", isSystem: false },
  { id: "s", type: "start-event", label: "claim received", pool: "p", lane: "l1" },
  { id: "t1", type: "task", label: "check the claim", pool: "p", lane: "claims team" },   // a lane named by its (lower-case) LABEL
  { id: "t2", type: "task", label: "pay the claim", pool: "p", lane: "l2" },
  { id: "e", type: "end-event", label: "claim paid", pool: "p", lane: "l2" },
];
const flow: AiConnection[] = [{ sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" }, { sourceId: "t2", targetId: "e" }];

describe("T5198 — generated pool and lane names are fully capitalised", () => {
  const out = run(plan(), flow);

  it("a white-box pool, a black-box pool and every lane: each word capitalised", () => {
    expect(labelOf(out, "p")).toBe("Customer Service Desk");
    expect(out.elements.find((e) => e.label === "Credit Bureau")?.type).toBe("pool");
    expect(out.elements.filter((e) => e.type === "lane").map((e) => e.label).sort()).toEqual(["Claims Team", "Finance Team"]);
  });

  it("activities, events and gateways are NOT touched — they keep the style they came in", () => {
    expect(labelOf(out, "t1")).toBe("check the claim");
    expect(labelOf(out, "t2")).toBe("pay the claim");
    expect(labelOf(out, "s")).toBe("claim received");
    expect(labelOf(out, "e")).toBe("claim paid");
  });

  it("a reference to a lane by its lower-case label still resolves (references match case-insensitively)", () => {
    const lane = out.elements.find((e) => e.type === "lane" && e.label === "Claims Team")!;
    expect(out.elements.find((e) => e.id === "t1")?.parentId).toBe(lane.id);
  });

  it("deliberate capitals are kept; lanes given as separate elements and sub-lanes are covered too", () => {
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "acme", poolType: "white-box" },
      { id: "l1", type: "lane", label: "IT support", pool: "p", parentPool: "p" },
      { id: "l2", type: "lane", label: "eCommerce desk", pool: "p", parentPool: "p" },
      { id: "sub", type: "sublane", label: "level two engineers", pool: "p", parentPool: "p", parentLane: "l1" },
      { id: "s", type: "start-event", label: "go", pool: "p", lane: "l1" },
      { id: "t", type: "task", label: "do it", pool: "p", lane: "l2" },
    ];
    const o = run(els, [{ sourceId: "s", targetId: "t" }]);
    expect(labelOf(o, "p")).toBe("Acme");
    const lanes = o.elements.filter((e) => e.type === "lane").map((e) => e.label);
    expect(lanes).toEqual(expect.arrayContaining(["IT Support", "eCommerce Desk"]));
    expect(lanes).toContain("Level Two Engineers");   // the sub-lane, flattened by the layout
  });

  it("the caller's plan is not changed — only the diagram that comes back", () => {
    const input = plan();
    run(input, flow);
    expect(input[0].label).toBe("customer service desk");
    expect(input[0].lanes?.[0].name).toBe("claims team");
  });
});

describe("T5199 — the Green rule: the model is told, and the patch is safe", () => {
  it("it sits in Group 4 (Naming & Labels) — not a code-backed group — so it is GREEN and sent to the AI", () => {
    const text = "## Group 4: Naming & Labels\nR4.08: Pool, Lane and Sub-lane names are written with EVERY word capitalised.\n\n## Group 8: Auto-Layout Placement\nR8.01: x";
    const { aiRules, layoutRules } = splitRulesByEnforcement(text);
    expect(aiRules).toContain("EVERY word capitalised");
    expect(layoutRules).not.toContain("EVERY word capitalised");
  });

  it("the seed carries it in the BPMN naming group", () => {
    const seed = readFileSync("scripts/seed-diagram-rules.cjs", "utf8");
    const bpmn = seed.match(/"bpmn": "([\s\S]*?)",\n  "state-machine"/)?.[1] ?? seed.replace(/\r\n/g, "\n").match(/"bpmn": "([\s\S]*?)",\n  "state-machine"/)?.[1] ?? "";
    const at = bpmn.indexOf("EVERY word capitalised");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(bpmn.indexOf("## Group 4"));
    expect(at).toBeLessThan(bpmn.indexOf("## Group 5"));
  });

  it("the prod SQL patch is one guarded UPDATE on the one row: next free R4 number, never a delete, a no-op when already there", () => {
    const sql = readFileSync("scripts/sql/patch-rule-green-container-names.sql", "utf8").replace(/\r\n/g, "\n");
    expect(sql).toContain(`WHERE r.id = 'default-bpmn' AND r.category = 'bpmn'`);
    expect(sql).toContain("r.rules !~* 'every word capitali'");
    expect(sql).toContain("COALESCE(MAX((m)[1]::int), 0) + 1");
    expect(sql).not.toMatch(/^\s*DELETE\s/m);
    expect(sql.match(/\bUPDATE\b/g)).toHaveLength(1);
  });

  it("the layout names the rule in its comment, so the two halves are found together", () => {
    const layout = readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8");
    expect(layout).toContain("function containerNamed(e: AiElement): AiElement");
    expect(layout).toContain("aiElements = aiElements.map(containerNamed);");
  });
});
