/**
 * Generate the NESTED gateway-path examples and report the rows they land on.
 *
 * Paul asked to see how a nested example is generated (2026-09-01), against his
 * two "Gateway Paths Illustrated" drawings. Each structure is built as an
 * AI-style plan, run through the real `layoutBpmnDiagram`, checked, and written
 * out as an importable export so the result can be looked at rather than only
 * asserted.
 *
 *   npx tsx scripts/make-nested-paths-example.ts
 *
 *     Path 1  ── Task 2 → Task 3 → Task 4 ─────────────┐
 *     Path 2  ── Task 5 → Decision 2 ─┬─ 2.1 ──────────┤   a NESTED decision, so
 *                                     ├─ 2.2 ──────────┤   sub-paths must find
 *                                     └─ 2.3 → End     │   rows between the trunk
 *     Path 3  ── Task 8 → Task 9 → Task 10 ────────────┘   and their uncles
 *
 * Path 2.3 ends rather than rejoining — Paul's "some sub-paths may end before
 * their Merge". It owns a row like any other.
 *
 * The second example adds LANES: branches cross into other lanes, and the middle
 * branch forks again inside its own, so its sub-paths must find rows within that
 * lane's band rather than anywhere on the page.
 */
import fs from "node:fs";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "../app/lib/diagram/bpmnLayout";
import type { DiagramElement, Connector } from "../app/lib/diagram/types";

type Group = [string, string[]];

/** Lay out one example, report it, and write it where it can be imported. */
function run(title: string, els: AiElement[], conns: AiConnection[], groups: Group[], outFile: string) {
  const out = layoutBpmnDiagram(els, conns);
  const by = new Map((out.elements as DiagramElement[]).map((e) => [e.id, e] as const));
  const at = (id: string) => by.get(id);
  const cy = (id: string) => { const e = at(id); return e ? e.y + e.height / 2 : NaN; };
  const laneOf = (id: string) => {
    let c = by.get(at(id)?.parentId ?? ""); let g = 0;
    while (c && g++ < 8) { if (c.type === "lane") return String(c.label); c = by.get(c.parentId ?? ""); }
    return "(pool)";
  };

  console.log(`\n=== ${title} ===`);
  const lanes = (out.elements as DiagramElement[]).filter((e) => e.type === "lane");
  if (lanes.length) {
    console.log("lanes:");
    for (const l of lanes) console.log(`  ${String(l.label).padEnd(16)} ${l.y.toFixed(0)}..${(l.y + l.height).toFixed(0)}`);
  }

  console.log("paths, top to bottom:");
  for (const [n, ids] of groups) {
    const ys = ids.map(cy).filter((y) => !Number.isNaN(y));
    console.log(`  ${n.padEnd(17)} row ${String(Math.round(ys[0])).padStart(5)}  spread ${(Math.max(...ys) - Math.min(...ys)).toFixed(0)}px  lane=${laneOf(ids[0])}`);
  }

  console.log("checks:");
  const rows: [string, number][] = groups.map(([n, ids]) => [n, cy(ids[0])]);
  const ordered = [...rows].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  console.log(`  order in the drawing      ${JSON.stringify(ordered) === JSON.stringify(groups.map(([n]) => n)) ? "OK" : "differs: " + ordered.join(" < ")}`);
  const holds = groups.every(([, ids]) => { const ys = ids.map(cy); return Math.max(...ys) - Math.min(...ys) < 2; });
  console.log(`  each path holds its row   ${holds ? "OK" : "NO"}`);

  let shared = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    if (Math.abs(rows[i][1] - rows[j][1]) < 20) { shared++; console.log(`  SHARE A ROW: ${rows[i][0]} and ${rows[j][0]} at ${Math.round(rows[i][1])}`); }
  }
  if (!shared) console.log("  no two paths share a row  OK");

  let outside = 0;
  for (const e of out.elements as DiagramElement[]) {
    if (["pool", "lane", "sublane"].includes(e.type)) continue;
    let c = by.get(e.parentId ?? ""); let box = null;
    while (c) { if (c.type === "lane" || c.type === "pool") { box = c; break; } c = by.get(c.parentId ?? ""); }
    if (box && (e.y < box.y - 1 || e.y + e.height > box.y + box.height + 1)) {
      outside++; console.log(`  OUTSIDE ${box.type} "${box.label}": ${String(e.label).slice(0, 24)}`);
    }
  }
  if (!outside) console.log("  every element inside its container  OK");

  const near = (p: { x: number; y: number }, e: { x: number; y: number; width: number; height: number }) =>
    p.x >= e.x - 3 && p.x <= e.x + e.width + 3 && p.y >= e.y - 3 && p.y <= e.y + e.height + 3;
  let det = 0;
  for (const c of out.connectors as Connector[]) {
    const s = by.get(c.sourceId), t = by.get(c.targetId), w = c.waypoints ?? [];
    if (!s || !t || w.length < 2) continue;
    if (!near(w[0], s) || !near(w[w.length - 1], t)) det++;
  }
  console.log(`  connectors attached       ${det === 0 ? "OK" : det + " detached"}`);

  fs.writeFileSync(outFile, JSON.stringify({
    schemaVersion: 46, appVersion: "2.4", exportedAt: new Date().toISOString(),
    project: { name: "(single diagram)", description: "", ownerName: "", colorConfig: {} },
    diagrams: [{ originalId: outFile, name: title, type: "bpmn", data: out, colorConfig: {}, displayMode: "normal" }],
  }, null, 2));
  console.log(`  written: ${outFile}`);
}

// ── 1. Nested, one lane ─────────────────────────────────────────────────────
run("Nested Gateway Paths (generated)", [
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
], [
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
], [
  ["Path 1", ["t2", "t3", "t4"]],
  ["Path 2.1", ["t11", "t12"]],
  ["trunk / 2.2", ["t5", "t15", "t6", "t7"]],
  ["Path 2.3 (ends)", ["t13", "e23"]],
  ["Path 3", ["t8", "t9", "t10"]],
], "../test/Nested Gateway Paths (generated).json");

// ── 2. The same idea across lanes ───────────────────────────────────────────
run("Nested Gateway Paths with Lanes (generated)", [
  { id: "p", type: "pool", label: "Company", poolType: "white-box",
    lanes: [{ id: "fo", name: "Front Office" }, { id: "sales", name: "Sales Team" }, { id: "mkt", name: "Marketing Team" }] },
  { id: "s", type: "start-event", label: "Email Arrives", pool: "p", lane: "fo" },
  { id: "t1", type: "task", label: "Determines Email Type", pool: "p", lane: "fo" },
  { id: "d1", type: "gateway", label: "Type?", gatewayType: "exclusive", pool: "p", lane: "sales" },
  { id: "t2", type: "task", label: "Task 2", pool: "p", lane: "fo" },
  { id: "t3", type: "task", label: "Task 3", pool: "p", lane: "fo" },
  { id: "t4", type: "task", label: "Task 4", pool: "p", lane: "fo" },
  { id: "t5", type: "task", label: "Task 5", pool: "p", lane: "sales" },
  { id: "d2", type: "gateway", label: "Complexity?", gatewayType: "exclusive", pool: "p", lane: "sales" },
  { id: "t11", type: "task", label: "Task 11", pool: "p", lane: "sales" },
  { id: "t12", type: "task", label: "Task 12", pool: "p", lane: "sales" },
  { id: "t6", type: "task", label: "Task 6", pool: "p", lane: "sales" },
  { id: "t7", type: "task", label: "Task 7", pool: "p", lane: "sales" },
  { id: "t13", type: "task", label: "Task 13", pool: "p", lane: "sales" },
  { id: "e23", type: "end-event", label: "Complex ones are too hard. End", pool: "p", lane: "sales" },
  { id: "dm2", type: "gateway", label: "Complexity?", pool: "p", lane: "sales" },
  { id: "t15", type: "task", label: "Task 15", pool: "p", lane: "sales" },
  { id: "t8", type: "task", label: "Task 8", pool: "p", lane: "mkt" },
  { id: "t9", type: "task", label: "Task 9", pool: "p", lane: "mkt" },
  { id: "sp2", type: "subprocess", label: "Subprocess 2", pool: "p", lane: "mkt" },
  { id: "ev2", type: "intermediate-event", label: "Event 2", eventType: "error", boundaryHost: "sp2", boundarySide: "bottom" },
  { id: "t16", type: "task", label: "Task 16", pool: "p", lane: "mkt" },
  { id: "eerr", type: "end-event", label: "Error Occurred End", pool: "p", lane: "mkt" },
  { id: "dm1", type: "gateway", label: "Type?", pool: "p", lane: "sales" },
  { id: "t17", type: "task", label: "Front Office Prepares Reply", pool: "p", lane: "fo" },
  { id: "e", type: "end-event", label: "Send & End", pool: "p", lane: "fo" },
], [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "d1" },
  { sourceId: "d1", targetId: "t2" }, { sourceId: "d1", targetId: "t5" }, { sourceId: "d1", targetId: "t8" },
  { sourceId: "t2", targetId: "t3" }, { sourceId: "t3", targetId: "t4" }, { sourceId: "t4", targetId: "dm1" },
  { sourceId: "t5", targetId: "d2" },
  { sourceId: "d2", targetId: "t11" }, { sourceId: "d2", targetId: "t6" }, { sourceId: "d2", targetId: "t13" },
  { sourceId: "t11", targetId: "t12" }, { sourceId: "t12", targetId: "dm2" },
  { sourceId: "t6", targetId: "t7" }, { sourceId: "t7", targetId: "dm2" },
  { sourceId: "t13", targetId: "e23" },
  { sourceId: "dm2", targetId: "t15" }, { sourceId: "t15", targetId: "dm1" },
  { sourceId: "t8", targetId: "t9" }, { sourceId: "t9", targetId: "sp2" }, { sourceId: "sp2", targetId: "dm1" },
  { sourceId: "ev2", targetId: "t16" }, { sourceId: "t16", targetId: "eerr" },
  { sourceId: "dm1", targetId: "t17" }, { sourceId: "t17", targetId: "e" },
], [
  ["Path 1 (FO)", ["t2", "t3", "t4"]],
  ["Path 2.1", ["t11", "t12"]],
  ["trunk / 2.2", ["t5", "t15", "t6", "t7"]],
  ["Path 2.3 (ends)", ["t13", "e23"]],
  ["Path 3 (Mkt)", ["t8", "t9", "sp2"]],
  ["EMIE sub-path", ["t16", "eerr"]],
], "../test/Nested Gateway Paths with Lanes (generated).json");

console.log("");
