/**
 * Append Feature-catalog rows for the AI Assist + Abracadabra Mode suite
 * (2026-08-04). Idempotent (skipped if a row with the same `name` exists).
 * New rows insert as DRAFT — open /dashboard/admin/features to review, then
 * Publish All to push to /features.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-ai-assist.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-ai-assist.ts # prod
 *   npx tsx scripts/add-features-ai-assist.ts --sql                    # emit prod SQL
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "AI Assist — Suggest as You Draw",
    sortOrder: 220,
    summary:
      "Switch on Assist and the editor suggests the next step, the right template, even the data a task needs — every suggestion validated by the rules engine, so it's always legal and tidily placed.",
    details: [
      "- **Ghost next-steps** — select an element and translucent chips suggest what comes next (Task / Decision / End). Press **Tab** or click to accept; it's placed and connected for you, never on top of anything.",
      "- **Boundary events & template fragments** suggested in context — attach a boundary event, or drop in a saved template inline.",
      "- **Content-aware** — name a task \"Approve invoice\" and it suggests the matching **approval template**; imply a document and it offers an **Output** data object; imply a policy and it offers an **Instructions** input.",
      "- **Always correct** — every suggestion is checked by the same rules engine that governs AI generation, so nothing illegal or badly laid out ever appears.",
      "- **Tunable** — admins edit a keyword → action catalog (Assist / NL Rules); the geometry rules are shown read-only.",
      "- BPMN, opt-in per diagram, and **instant + free** for the common cases (no AI call).",
    ].join("\n"),
  },
  {
    name: "Abracadabra Mode — Voice-Driven Diagramming",
    sortOrder: 230,
    summary:
      "Just talk. Say \"add a task called Approve after Review\", \"put a pool around everything\", \"delete Prepare and compact\" — and watch the diagram build itself, live and undoable.",
    details: [
      "- **Speak or type** editing commands; each is applied to the **current** diagram, live.",
      "- Add / connect / rename / **move** / delete elements; add **boundary events**; create **named lanes & sublanes**; **wrap everything in a pool**; clear; **export to JSON**.",
      "- Refer to elements by **name**, by **type** (\"the gateway\"), by **position** (\"the middle pool\"), or with **\"it / the last one / the previous one\"**.",
      "- **Hybrid + cheap** — common phrasings are interpreted instantly and free; only unusual wording falls back to a metered AI, and the log colour-codes which is which.",
      "- **Always reversible** — every change is undoable; say **\"undo that\"**, and **\"stop\"** to finish. Voice minutes appear in **AI Usage**.",
      "- The only BPM tool that lets you model a process **by conversation** — hands-free, with the correctness guarantees of a governed rules engine behind every change.",
    ].join("\n"),
  },
];

// ── SQL emitter (idempotent, dollar-quoted; inserts as DRAFT) ──────────────
const dq = (tag: string, s: string) => `$${tag}$${s}$${tag}$`;
function toSql(): string {
  const out = [
    "-- AI Assist + Abracadabra feature-catalog rows (draft). Idempotent.",
    "-- Run in the SuperAdmin Database Manager, then /dashboard/admin/features → Publish All.",
    "BEGIN;",
    "",
  ];
  for (const f of FEATURES) {
    const n = dq("FN", f.name), s = dq("FS", f.summary), d = dq("FD", f.details);
    out.push(`-- ${f.name}`);
    out.push(`INSERT INTO "Feature" (id, name, summary, details, hidden, "sortOrder", "createdAt", "updatedAt")`);
    out.push(`  SELECT gen_random_uuid()::text, ${n}, ${s}, ${d}, false, ${f.sortOrder}, now(), now()`);
    out.push(`  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE name = ${n});`);
    out.push("");
  }
  out.push("COMMIT;", "");
  return out.join("\n");
}

async function main() {
  if (process.argv.includes("--sql")) {
    const outPath = path.join(process.cwd(), "scripts", "add-features-ai-assist.sql");
    fs.writeFileSync(outPath, toSql(), "utf8");
    console.log(`Wrote ${FEATURES.length} feature rows to ${outPath}`);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let inserted = 0, skipped = 0;
    for (const f of FEATURES) {
      const existing = await prisma.feature.findFirst({ where: { name: f.name } });
      if (existing) { skipped++; console.log(`  skip   "${f.name}" (already in catalog)`); continue; }
      await prisma.feature.create({ data: { name: f.name, summary: f.summary, details: f.details, sortOrder: f.sortOrder } });
      inserted++;
      console.log(`  add    "${f.name}" (sortOrder=${f.sortOrder}, draft)`);
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped} existing.`);
    if (inserted > 0) console.log("\nNext: /dashboard/admin/features → review the drafts → Publish All.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
