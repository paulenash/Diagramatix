/**
 * Scan generated diagrams for anything a reader would see as overlapping.
 *
 * Paul, 2026-09-03: one-pass generation has to produce a PDF a third party can
 * read, with nobody available to tidy it up — so an overlap is a defect, not a
 * blemish. Finding them one file at a time, by eye, does not scale; this
 * replays every diagram that carries its AI plan and reports what breaks, by
 * CLASS, so the classes can be fixed rather than the instances.
 *
 *   npx tsx scripts/scan-layout-violations.ts <dir-or-file> [...]
 *   npx tsx scripts/scan-layout-violations.ts ~/Downloads --detail
 *
 * A saved diagram is the layout's OUTPUT; replaying the stored
 * `aiGeneration.plan` re-runs the real thing offline, with no AI call. Files
 * without a plan are skipped and counted, because a reconstruction from the
 * output can hide the very defect being looked for.
 */
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "../app/lib/diagram/bpmnLayout";
import { findLayoutViolations, findReadabilityViolations } from "../app/lib/diagram/checks/layoutViolations";
import type { DiagramData } from "../app/lib/diagram/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const args = process.argv.slice(2);
const detail = args.includes("--detail");
const targets = args.filter((a) => !a.startsWith("--"));
if (targets.length === 0) {
  console.error("usage: npx tsx scripts/scan-layout-violations.ts <dir-or-file> [...] [--detail]");
  process.exit(2);
}

function filesUnder(t: string): string[] {
  const s = fs.statSync(t);
  if (s.isFile()) return t.endsWith(".json") ? [t] : [];
  return fs.readdirSync(t).filter((f) => f.endsWith(".json")).map((f) => path.join(t, f));
}

/** The class a violation belongs to — the thing worth fixing. */
function classOf(v: string): string {
  const head = v.split(":")[0];
  return head.includes(" ") ? head.split(" ").slice(0, 2).join(" ") : head;
}

let scanned = 0, noPlan = 0, clean = 0;
const byClass = new Map<string, { n: number; where: Set<string>; examples: string[] }>();

for (const t of targets) {
  for (const file of filesUnder(t)) {
    let raw: any;
    try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    const diagrams: any[] = raw.diagrams ?? (raw.data ? [raw] : [{ data: raw }]);
    for (const dg of diagrams) {
      const data = dg.data ?? dg;
      const plan = data?.aiGeneration?.plan;
      const name = dg.name ?? data?.name ?? path.basename(file);
      if (!plan?.elements) { noPlan++; continue; }
      let out: DiagramData;
      try {
        const r = layoutBpmnDiagram(plan.elements, plan.connections ?? plan.connectors);
        out = { elements: r.elements, connectors: r.connectors } as DiagramData;
      } catch (e) {
        console.log(`!! ${name}: layout threw — ${String(e).slice(0, 120)}`);
        continue;
      }
      scanned++;
      const vs = [...findLayoutViolations(out), ...findReadabilityViolations(out)];
      if (vs.length === 0) { clean++; continue; }
      for (const v of vs) {
        const k = classOf(v);
        const e = byClass.get(k) ?? { n: 0, where: new Set<string>(), examples: [] };
        e.n++; e.where.add(name);
        if (e.examples.length < 3) e.examples.push(`${name}: ${v}`);
        byClass.set(k, e);
      }
      if (detail) {
        console.log(`\n## ${name}  (${vs.length})`);
        for (const v of vs) console.log(`   ${v}`);
      }
    }
  }
}

console.log(`\n${"=".repeat(72)}`);
console.log(`scanned ${scanned} diagram(s) with a stored plan · ${clean} clean · ${noPlan} skipped (no plan)`);
console.log(`${"=".repeat(72)}\n`);
const ranked = [...byClass.entries()].sort((a, b) => b[1].n - a[1].n);
if (ranked.length === 0) { console.log("no violations."); process.exit(0); }
console.log("BY CLASS (what to fix), worst first:\n");
ranked.forEach(([k, e], i) => {
  console.log(`${String(i + 1).padStart(2)}. ${k.padEnd(22)} ${String(e.n).padStart(4)} occurrence(s) across ${e.where.size} diagram(s)`);
  for (const ex of e.examples) console.log(`      e.g. ${ex.slice(0, 150)}`);
});
