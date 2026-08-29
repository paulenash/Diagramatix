/**
 * Replay a generated diagram's layout from the AI plan stored with it.
 *
 *   npx tsx scripts/replay-diagram.ts "<export.json>" [--json]
 *
 * A saved diagram is the layout's OUTPUT, and the input cannot be recovered from
 * it — when the plan says `parentSubprocess: <EP>` and the layout fails to honour
 * it, the saved element's parentId is the LANE, so reconstructing a plan from the
 * saved diagram erases the very defect you are chasing. Since 2026-08-29 the raw
 * plan is kept on the diagram under `aiGeneration.plan`, so a bad generation can
 * be replayed EXACTLY, offline, with no AI call.
 *
 * Reports what a generation run reports, plus the three things that have actually
 * gone wrong in practice: empty voids in the flow, overlapping siblings, and
 * subprocesses drawn as empty boxes.
 */
import fs from "node:fs";
import {
  layoutBpmnDiagram, type AiElement, type AiConnection, type LayoutDiagnostic,
} from "../app/lib/diagram/bpmnLayout";

const file = process.argv[2];
const asJson = process.argv.includes("--json");
if (!file) {
  console.error("usage: npx tsx scripts/replay-diagram.ts \"<export.json>\" [--json]");
  process.exit(2);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
// Accept a project export, a single-diagram export, or a bare DiagramData.
const diagrams: any[] = raw.diagrams ?? (raw.data ? [raw] : [{ name: raw.name ?? file, data: raw }]);

const L = (e: any) => (String(e?.label ?? "").replace(/\s+/g, " ").trim() || `«${e?.type}»`).slice(0, 44);

let anyPlan = false;
for (const dg of diagrams) {
  const data = dg.data ?? dg;
  const plan = data?.aiGeneration?.plan;
  const name = dg.name ?? data?.name ?? "(unnamed)";
  if (!plan) {
    console.log(`\n=== ${name}: no stored plan (generated before 2026-08-29, or not AI-generated)`);
    continue;
  }
  anyPlan = true;
  const els: AiElement[] = plan.elements ?? [];
  const conns: AiConnection[] = plan.connections ?? plan.connectors ?? [];

  const diagnostics: LayoutDiagnostic[] = [];
  const out = layoutBpmnDiagram(els, conns, { promptLabel: name, onDiagnostic: (d) => diagnostics.push(d) });

  // What the plan ASKED for — the half that cannot be seen in a saved diagram.
  const declared = els.filter((e) => e.parentSubprocess || e.boundaryHost);
  const selfRef = els.filter((e) => e.parentSubprocess === e.id || e.boundaryHost === e.id);

  const flow = out.elements.filter((e) => !/pool|lane|sublane/.test(e.type));
  const byId = new Map(out.elements.map((e) => [e.id, e]));

  // Empty voids on a forward sequence flow.
  const voids: { gap: number; from: string; to: string }[] = [];
  for (const c of out.connectors) {
    if (c.type && c.type !== "sequence") continue;
    const a = byId.get(c.sourceId), b = byId.get(c.targetId);
    if (!a || !b) continue;
    const gap = b.x - (a.x + a.width);
    if (gap < 300) continue;
    if (flow.some((e) => e.x + e.width > a.x + a.width + 1 && e.x < b.x - 1)) continue;
    voids.push({ gap: Math.round(gap), from: L(a), to: L(b) });
  }

  // Overlapping siblings.
  const overlaps: string[] = [];
  for (let i = 0; i < flow.length; i++) for (let j = i + 1; j < flow.length; j++) {
    const a = flow[i], b = flow[j];
    if (a.parentId !== b.parentId) continue;
    const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (ox > 2 && oy > 2) overlaps.push(`${Math.round(ox)}x${Math.round(oy)}px  ${L(a)} <> ${L(b)}`);
  }

  const subs = out.elements.filter((e) => /subprocess/.test(e.type))
    .map((sp) => ({ label: L(sp), width: Math.round(sp.width), kids: out.elements.filter((k) => k.parentId === sp.id).length }));

  if (asJson) {
    console.log(JSON.stringify({ name, diagnostics, voids, overlaps, subs, selfRef: selfRef.map((e) => e.id) }, null, 2));
    continue;
  }

  console.log(`\n=== ${name}`);
  console.log(`    plan: ${els.length} elements, ${conns.length} connections`);
  console.log(`    ${declared.length} declare a container (parentSubprocess / boundaryHost)`);
  if (selfRef.length) console.log(`    !! ${selfRef.length} name THEMSELVES: ${selfRef.map((e) => `${e.id} (${L(e)})`).join(", ")}`);

  console.log(`\n    diagnostics: ${diagnostics.length}`);
  const byKind = new Map<string, LayoutDiagnostic[]>();
  for (const d of diagnostics) { const a = byKind.get(d.kind); if (a) a.push(d); else byKind.set(d.kind, [d]); }
  for (const [kind, list] of byKind) {
    console.log(`      ${kind} × ${list.length}`);
    for (const d of list.slice(0, 8)) console.log(`         ${JSON.stringify(L(d))} — ${d.detail}`);
    if (list.length > 8) console.log(`         … and ${list.length - 8} more`);
  }

  console.log(`\n    subprocesses:`);
  for (const s of subs) console.log(`      kids=${String(s.kids).padStart(2)}  w=${String(s.width).padStart(5)}  ${JSON.stringify(s.label)}`);

  console.log(`\n    empty voids: ${voids.length}`);
  for (const v of voids) console.log(`      ${String(v.gap).padStart(5)}px  ${JSON.stringify(v.from)} -> ${JSON.stringify(v.to)}`);

  console.log(`\n    overlapping siblings: ${overlaps.length}`);
  for (const o of overlaps.slice(0, 10)) console.log(`      ${o}`);

  const right = Math.max(...out.elements.map((e) => e.x + e.width));
  console.log(`\n    canvas right edge: ${Math.round(right)}`);
}

if (!anyPlan) {
  console.log("\nNothing to replay. Regenerate the diagram on a build from 2026-08-29 or later —");
  console.log("the raw plan is stored on the diagram from then on.");
}
