/**
 * Regenerate the ArchiMate relationship-picker matrix from the authoritative
 * ArchiMate 3.2 workbook (The Open Group reference cards + Archi's 62×62 matrix):
 *   "new features/Archimate 3,2/ArchiMate_3_2_Full_Relationship_Matrix.xlsx"
 *
 * The workbook's sheet3 enumerates EVERY permitted Source–Relationship–Target
 * triple (derivation-inclusive — it does not separate "direct" from "derived").
 * We adopt that permitted set verbatim: the picker highlights exactly what 3.2
 * permits. `Junction`/`Relationship` are pseudo-concepts (a connector + a
 * meta-concept) → excluded, leaving the 60 real elements.
 *
 * Writes:
 *   • public/archimate-relationships.json — the exact per-pair permitted matrix
 *   • new features/Archimate 3,2/archimate-relationship-diff.csv — the full
 *     ADD/DEL diff vs the PREVIOUS (category-based) model, for the record.
 *
 * Run:
 *   export PATH="$PATH:/c/Program Files/nodejs"; cd diagramatix
 *   npx tsx scripts/gen-archimate-relationships.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const XLSX = "new features/Archimate 3,2/ArchiMate_3_2_Full_Relationship_Matrix.xlsx";
const OUT_JSON = "public/archimate-relationships.json";
const OUT_CSV = "new features/Archimate 3,2/archimate-relationship-diff.csv";

// xlsx relationship name → our ArchimateConnectorType(s). Association carries both
// the undirected and directed variants the picker offers.
const REL: Record<string, string[]> = {
  Access: ["archi-access"], Composition: ["archi-composition"], Flow: ["archi-flow"],
  Aggregation: ["archi-aggregation"], Assignment: ["archi-assignment"], Influence: ["archi-influence"],
  Association: ["archi-association", "archi-association-directed"], Realization: ["archi-realisation"],
  Specialization: ["archi-specialisation"], Triggering: ["archi-triggering"], Serving: ["archi-serving"],
};
const SKIP = new Set(["Junction", "Relationship"]);

// ── Parse sheet3 (dense 9-column table of permitted triples) ────────────────
const xml = execFileSync("unzip", ["-p", XLSX, "xl/worksheets/sheet3.xml"], { maxBuffer: 64 << 20 }).toString("utf8");
const vals = [...xml.matchAll(/<x:v>([^<]*)<\/x:v>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
const rows: string[][] = [];
for (let i = 0; i < vals.length; i += 9) rows.push(vals.slice(i, i + 9));
rows.shift(); // header: SourceDomain, SourceConcept, SourceTypeID, Code, Relationship, Category, TargetConcept, TargetTypeID, TargetDomain

const permitted: Record<string, Record<string, string[]>> = {};
const elementSet = new Set<string>();
for (const r of rows) {
  const s = r[1], relName = r[4], t = r[6];
  if (SKIP.has(s) || SKIP.has(t)) continue;
  const types = REL[relName];
  if (!types) throw new Error(`Unknown relationship in workbook: "${relName}"`);
  elementSet.add(s); elementSet.add(t);
  ((permitted[s] ??= {})[t] ??= []);
  for (const ty of types) if (!permitted[s][t].includes(ty)) permitted[s][t].push(ty);
}
const elements = [...elementSet].sort();
// Stable ordering inside each cell (matches the picker's group order loosely).
const ORDER = ["archi-composition", "archi-aggregation", "archi-assignment", "archi-realisation", "archi-serving", "archi-access", "archi-influence", "archi-triggering", "archi-flow", "archi-specialisation", "archi-association", "archi-association-directed"];
for (const s of elements) for (const t of Object.keys(permitted[s] ?? {})) permitted[s][t].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

const out = {
  _comment: "Full ArchiMate 3.2 permitted-relationship matrix, generated from ArchiMate_3_2_Full_Relationship_Matrix.xlsx by scripts/gen-archimate-relationships.ts. `permitted[source][target]` lists every relationship 3.2 permits between that ordered pair (derivation-inclusive — the spec does not separate direct from derived). `universal` (Association) is permitted between any two elements. DO NOT hand-edit — re-run the generator.",
  version: "3.2",
  elements,
  universal: ["archi-association", "archi-association-directed"],
  permitted,
};
writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + "\n");

// ── Diff vs the PREVIOUS (category-based) model, in base-relationship space ──
type OldModel = {
  universal: string[]; selfTypeOnly: string[];
  categories: Record<string, string[]>;
  categoryRules: { from: string; to: string; allowed?: string[]; derived?: string[] }[];
  overrides: Record<string, Record<string, { allowed?: string[]; derived?: string[] }>>;
};
let diffLines: string[] = ["Change,Source,Relationship,Target"];
try {
  const prev = execFileSync("git", ["show", `HEAD:diagramatix/public/archimate-relationships.json`], { maxBuffer: 16 << 20 }).toString("utf8");
  const old = JSON.parse(prev) as OldModel;
  const strip = (t: string) => t.replace(/^archi-/, "").replace(/-directed$/, "");
  const label: Record<string, string> = { access: "Access", composition: "Composition", flow: "Flow", aggregation: "Aggregation", assignment: "Assignment", influence: "Influence", association: "Association", realisation: "Realization", specialisation: "Specialization", triggering: "Triggering", serving: "Serving" };
  const catOf = (n: string) => { for (const [c, ns] of Object.entries(old.categories)) if (ns.includes(n)) return c; return null; };
  const oldSet = (s: string, t: string) => {
    const o = new Set<string>();
    for (const u of old.universal) o.add(strip(u));
    if (s === t) for (const u of old.selfTypeOnly) o.add(strip(u));
    const sc = catOf(s), tc = catOf(t);
    if (sc && tc) for (const rl of old.categoryRules) if (rl.from === sc && rl.to === tc) { for (const x of rl.allowed ?? []) o.add(strip(x)); for (const x of rl.derived ?? []) o.add(strip(x)); }
    const ov = old.overrides[s]?.[t];
    if (ov) { for (const x of ov.allowed ?? []) o.add(strip(x)); for (const x of ov.derived ?? []) o.add(strip(x)); }
    return o;
  };
  const newSet = (s: string, t: string) => new Set([...(permitted[s]?.[t] ?? [])].map(strip));
  let adds = 0, dels = 0;
  for (const s of elements) for (const t of elements) {
    const a = newSet(s, t), o = oldSet(s, t);
    for (const rel of a) if (!o.has(rel)) { diffLines.push(`ADD,${s},${label[rel] ?? rel},${t}`); adds++; }
    for (const rel of o) if (!a.has(rel)) { diffLines.push(`DEL,${s},${label[rel] ?? rel},${t}`); dels++; }
  }
  writeFileSync(OUT_CSV, diffLines.join("\n") + "\n");
  console.log(`Diff vs previous model: ${adds} ADD, ${dels} DEL → ${OUT_CSV}`);
} catch (e) {
  console.warn("Could not diff vs previous model (skipped):", e instanceof Error ? e.message : e);
}

console.log(`Wrote ${OUT_JSON}: ${elements.length} elements, ${rows.length} permitted triples.`);
