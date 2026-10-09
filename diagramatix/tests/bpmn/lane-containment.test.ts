/**
 * T5294 — pool / lane containment (Paul, 2026-10-09, V01.04 and V01.02): lanes never overlap, a pool covers its lanes, and a task or
 * data object that belongs to a lane is drawn inside it. Real AI plans that broke each rule are the fixtures.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";

const DIR = "tests/fixtures/containment-2026-10-09";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".plan.json"));

function problems(file: string): string[] {
  const plan = JSON.parse(readFileSync(`${DIR}/${file}`, "utf8"));
  const data = layoutBpmnDiagram(plan.elements, plan.connections);
  const els = data.elements;
  const by = new Map(els.map((e) => [e.id, e]));
  const out: string[] = [];
  const lanes = els.filter((e) => e.type === "lane");
  for (const a of lanes) for (const b of lanes) {
    if (a.id >= b.id || a.parentId !== b.parentId) continue;
    const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (overlap > 0.5) out.push(`lanes "${a.label}" and "${b.label}" overlap by ${Math.round(overlap)}`);
  }
  for (const l of lanes) {
    const p = by.get(l.parentId ?? "");
    if (p && (l.y < p.y - 0.5 || l.y + l.height > p.y + p.height + 0.5)) out.push(`lane "${l.label}" is outside its pool`);
  }
  for (const e of els) {
    if (!/^(task|subprocess|subprocess-expanded|data-object|data-store)$/.test(e.type)) continue;
    const p = e.parentId ? by.get(e.parentId) : undefined;
    if (!p || p.type !== "lane") continue;
    const d = Math.max(p.y - e.y, e.y + e.height - (p.y + p.height));
    if (d > 0.5) out.push(`${e.type} "${String(e.label ?? "").replace(/\n/g, " ")}" is ${Math.round(d)}px outside lane "${p.label}"`);
  }
  return out;
}

describe("T5294 pool and lane containment", () => {
  it("has its fixtures", () => expect(FILES.length).toBeGreaterThanOrEqual(4));
  for (const f of FILES) {
    it(`${f}: no lane overlap, pool covers its lanes, tasks and data objects inside their lane`, () => {
      expect(problems(f)).toEqual([]);
    });
  }
  it("a lane that grows for its content never grows over its neighbour (the shared helper grows around the content)", () => {
    const src = readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8");
    expect(src.match(/const growLaneBandToContain =/g)).toHaveLength(1);                 // one rule, one place
    expect(src).toContain("shiftBelow(dBot)");                                            // lanes below move by the bottom growth only
    expect(src).toMatch(/R8\.33[\s\S]{0,2500}A task stays in its own lane: stop following/);
  });
});
