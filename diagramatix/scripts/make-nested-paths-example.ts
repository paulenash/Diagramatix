/**
 * Generate a NESTED gateway-path example, and report the rows it lands on.
 *
 * Paul asked to see how a nested example is generated (2026-09-01), against his
 * "Gateway Paths Illustrated" drawing. This builds that structure as an AI-style
 * plan, runs it through the real `layoutBpmnDiagram`, prints the row each path
 * ends up on, and writes an importable export so it can be opened and looked at.
 *
 *   npx tsx scripts/make-nested-paths-example.ts ["<out.json>"]
 *
 * The shape under test, and why each part is there:
 *
 *     Path 1  ── Task 2 → Task 3 → Task 4 ─────────────┐
 *     Path 2  ── Task 5 → Decision 2 ─┬─ 2.1 ──────────┤   a NESTED decision, so
 *                                     ├─ 2.2 ──────────┤   sub-paths must find
 *                                     └─ 2.3 → End     │   rows between the trunk
 *     Path 3  ── Task 8 → Task 9 → Task 10 ────────────┘   and their uncles
 *
 * Path 2.3 ends rather than rejoining, which is Paul's "some sub-paths may end
 * before their Merge" — it owns a row like any other.
 */
import fs from "node:fs";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "../app/lib/diagram/bpmnLayout";

const els: AiElement[] = [
  { id: "p", type: "pool", label: "Company", poolType: "white-box" },
  { id: "s", type: "start-event", label: "Start", pool: "p" },
  { id: "t1", type: "task", label: "Task 1", pool: "p" },
  { id: "d1", type: "gateway", label: "Decision 1?", gatewayType: "exclusive", pool: "p" },

  { id: "t2", type: "task", label: "Task 2", pool: "p" },
  { id: "t3", type: "task", label: "Task 3", pool: "p" },
  { id: "t4", type: "task", label: "Task 4", pool: "p" },

  { id: "t5", type: "task", label: "Task 5", pool: "p" },
  { id: "d2", type: "gateway", label: "Decision 2?", gatewayType: "exclusive", pool: "p" },
  { id: "t11", type: "task", label: "Task 11", pool: "p" },
  { id: "t12", type: "task", label: "Task 12", pool: "p" },
  { id: "t6", type: "task", label: "Task 6", pool: "p" },
  { id: "t7", type: "task", label: "Task 7", pool: "p" },
  { id: "t13", type: "task", label: "Task 13", pool: "p" },
  { id: "e23", type: "end-event", label: "Path 2.3 ends here", pool: "p" },
  { id: "dm2", type: "gateway", label: "Decision 2?", pool: "p" },
  { id: "t15", type: "task", label: "Task 15", pool: "p" },

  { id: "t8", type: "task", label: "Task 8", pool: "p" },
  { id: "t9", type: "task", label: "Task 9", pool: "p" },
  { id: "t10", type: "task", label: "Task 10", pool: "p" },

  { id: "dm1", type: "gateway", label: "Decision 1?", pool: "p" },
  { id: "t16", type: "task", label: "Task 16", pool: "p" },
  { id: "e", type: "end-event", label: "End", pool: "p" },
];

const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "d1" },
  { sourceId: "d1", targetId: "t2", label: "Path 1" },
  { sourceId: "d1", targetId: "t5", label: "Path 2" },
  { sourceId: "d1", targetId: "t8", label: "Path 3" },
  { sourceId: "t2", targetId: "t3" }, { sourceId: "t3", targetId: "t4" }, { sourceId: "t4", targetId: "dm1" },
  { sourceId: "t5", targetId: "d2" },
  { sourceId: "d2", targetId: "t11", label: "Path 2.1" },
  { sourceId: "d2", targetId: "t6", label: "Path 2.2" },
  { sourceId: "d2", targetId: "t13", label: "Path 2.3" },
  { sourceId: "t11", targetId: "t12" }, { sourceId: "t12", targetId: "dm2" },
  { sourceId: "t6", targetId: "t7" }, { sourceId: "t7", targetId: "dm2" },
  { sourceId: "t13", targetId: "e23" },
  { sourceId: "dm2", targetId: "t15" }, { sourceId: "t15", targetId: "dm1" },
  { sourceId: "t8", targetId: "t9" }, { sourceId: "t9", targetId: "t10" }, { sourceId: "t10", targetId: "dm1" },
  { sourceId: "dm1", targetId: "t16" }, { sourceId: "t16", targetId: "e" },
];

const out = layoutBpmnDiagram(els, conns);
const at = (id: string) => out.elements.find((e) => e.id === id)!;
const cy = (id: string) => { const e = at(id); return e.y + e.height / 2; };

const PATHS: [string, string[]][] = [
  ["Path 1", ["t2", "t3", "t4"]],
  ["Path 2.1", ["t11", "t12"]],
  ["trunk / 2.2", ["t5", "t15", "t6", "t7"]],
  ["Path 2.3", ["t13", "e23"]],
  ["Path 3", ["t8", "t9", "t10"]],
];

console.log("\nrow each path landed on (top to bottom is the order Paul drew):\n");
const rows: [string, number][] = PATHS.map(([n, ids]) => [n, cy(ids[0])]);
for (const [n, ids] of PATHS) {
  const ys = ids.map(cy);
  const spread = Math.max(...ys) - Math.min(...ys);
  console.log(`  ${n.padEnd(12)} row ${String(Math.round(ys[0])).padStart(5)}   spread ${spread.toFixed(0)}px   ${ids.join(" ")}`);
}

console.log("\nchecks:");
const ordered = [...rows].sort((a, b) => a[1] - b[1]).map(([n]) => n);
const want = PATHS.map(([n]) => n);
console.log(`  order          ${JSON.stringify(ordered) === JSON.stringify(want) ? "OK" : "WRONG: " + ordered.join(" < ")}`);
const holds = PATHS.every(([, ids]) => { const ys = ids.map(cy); return Math.max(...ys) - Math.min(...ys) < 2; });
console.log(`  each path holds its row   ${holds ? "OK" : "NO"}`);
const distinct = new Set(rows.map(([, y]) => Math.round(y))).size === rows.length;
console.log(`  no two paths share a row  ${distinct ? "OK" : "NO — a sub-path is on its uncle"}`);

const outPath = process.argv[2] ?? "../test/Nested Gateway Paths (generated).json";
fs.writeFileSync(outPath, JSON.stringify({
  schemaVersion: 46,
  appVersion: "2.4",
  exportedAt: new Date().toISOString(),
  project: { name: "(single diagram)", description: "", ownerName: "", colorConfig: {} },
  diagrams: [{
    originalId: "nested-paths-example",
    name: "Nested Gateway Paths (generated)",
    type: "bpmn",
    data: out,
    colorConfig: {},
    displayMode: "normal",
  }],
}, null, 2));
console.log(`\nwritten: ${outPath}  — import it to look at the result.\n`);
