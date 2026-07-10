/**
 * Append Feature-catalog rows for the Process Portal (org-wide discovery of
 * published processes), its entity "where-used" search + admin-managed team
 * membership, and the primary procedure document. Idempotent (skipped/refreshed
 * by `name`). Inserted as DRAFT — review at /dashboard/admin/features and Publish.
 *
 * Run: cd diagramatix && DATABASE_URL="…" npx tsx scripts/add-features-process-portal.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Process Portal — find any process",
    sortOrder: 370,
    summary:
      "A search-first portal where everyone in your organisation can browse and find the published processes they have access to — no need to know which project a process lives in.",
    details: [
      "- Search across every published process you can access — by name, owner, APQC category, or the systems and teams it involves",
      "- Browse by facet: diagram type, process owner, APQC category, and review status — each with live counts, combining to narrow instantly",
      "- Access-scoped and safe: you only ever see processes you already have permission to open — the Portal adds discovery, never new exposure",
      "- Recently viewed and recently updated shortcuts get people back to what matters",
      "- One click opens the clean, read-only viewer with the current published version, its owner, and its linked procedure — and drills across sub-processes",
      "- Review status at a glance: a badge flags processes that are overdue or due soon for their scheduled re-review",
    ].join("\n"),
  },
  {
    name: "Find processes by system or team (where-used)",
    sortOrder: 380,
    summary:
      "Answer “which processes use IT System X?” and “what is my team involved in?” — the Portal maps every process to the IT systems and teams/roles it references, matched to your Org Entity Lists.",
    details: [
      "- Entity facets in the Portal: filter published processes by IT System, or by Team / Role",
      "- Canonical, roll-up matching: process pools/lanes are matched to your Org Entity Lists, and picking a team also surfaces processes that only name a role beneath it",
      "- Coverage signal: labels that aren't in your Entity Lists still appear (flagged as “uncatalogued”) so nothing is hidden — and you can see what to add to the catalogue",
      "- “Involving me”: one click shows every process that references a team or role you belong to — your personal process view",
      "- Admin-managed membership: OrgAdmins assign members to teams/roles (SuperAdmins across every org) from your governed Org-Structure list",
    ].join("\n"),
  },
  {
    name: "Primary procedure document",
    sortOrder: 390,
    summary:
      "Link the written procedure (SOP) to its process model, so a reader always has the diagram and the words side by side.",
    details: [
      "- Attach a procedure document (a link — e.g. a SharePoint/OneDrive file, or any URL) to a diagram in Diagram Properties",
      "- Surfaced read-only as a prominent “Procedure” link in the published viewer and on Portal cards",
      "- Travels with the diagram: carried in the versioned publish snapshot and the diagram export",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let inserted = 0, updated = 0;
    for (const f of FEATURES) {
      const existing = await prisma.feature.findFirst({ where: { name: f.name } });
      if (existing) {
        await prisma.feature.update({ where: { id: existing.id }, data: { summary: f.summary, details: f.details, sortOrder: f.sortOrder } });
        updated++;
        console.log(`  update "${f.name}" (text refreshed, publish status kept)`);
        continue;
      }
      await prisma.feature.create({ data: { name: f.name, summary: f.summary, details: f.details, sortOrder: f.sortOrder } });
      inserted++;
      console.log(`  add    "${f.name}" (draft)`);
    }
    console.log(`Done. Inserted ${inserted}, updated ${updated}.`);
  } finally { await prisma.$disconnect(); }
}

main().catch((err) => { console.error(err); process.exit(1); });
