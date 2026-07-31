/**
 * Add a "Late-July 2026 feature internals" chapter to the SuperAdmin **Technical
 * Design Notes** (the `tech-design` document collection, viewed at /tech-notes and
 * edited under Admin → Technical Notes). Documents the non-obvious engineering
 * behind the batch shipped this window. Idempotent: upserts the chapter + each
 * section by heading; appended after the current last tech-design chapter.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-tech-notes-jul2026.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-tech-notes-jul2026.ts # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";
const SLUG = "internals-jul2026";
const TITLE = "Feature internals — late July 2026";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "AI usage: the enterWith mis-attribution bug",
    body: [
      "The large **\"unknown\"** bucket in AI Usage was real in-app usage that had lost its telemetry context. Root cause: `enterAiRouteContext` set the context with `AsyncLocalStorage.enterWith` **inside an async helper, after its own `await`** — `enterWith` mutates the *current* async frame, so when the helper resolved the route handler resumed on a **different** frame and the store (user/org/label) never reached the `makeAiClient` seam.",
      "",
      "**Fix:** the helper now only **resolves** the context (`resolveAiRouteContext`) and each route **enters it in its own body**: `enterAiContext(await resolveAiRouteContext(session, POINT))`. Routes that already set context synchronously (Compare/Mining/Simulation) were unaffected.",
      "",
      "**Rule:** never call `enterWith` inside an awaited helper and expect it to propagate to the caller. Pinned by tests **T1092** (body-pattern reaches the seam) and **T1093** (the broken helper-pattern loses it).",
    ].join("\n"),
  },
  {
    heading: "AI usage measures: attempts vs diagrams",
    body: [
      "Three distinct sources, deliberately kept separate:",
      "",
      "- **Raw / Successes / Failures** — every `AiInvocation` row (all calls incl. AI Tidy, Compare-per-model, failures).",
      "- **User Attempts** — the enforced quota (`UsageCounter` `ai_attempts`, success-only). The report DERIVES it from `AiInvocation` via the `AI_USER_METERED_POINTS` set (the 10 gated routes) — kept in lock-step with the routes that call `recordUsage(...,\"aiAttempts\")` by test **T1094**.",
      "- **# Diagrams generated using AI** — a new `AiDiagramGeneration` table (a table, not a flag, because the Plan-flow's diagram is produced at `apply-layout` which makes **no** AI call). `recordDiagramGenerated` fires per generation event at the 7 producing chokepoints.",
    ].join("\n"),
  },
  {
    heading: "Diagram Bundle export/import",
    body: [
      "A diagram's AI footprint is spread across three places: `Diagram.data` (embeds the `aiGeneration` prompt snapshot), the `Diagram.aiComparison` JSON column (whose `models[].diagramId` point at the per-model comparison diagrams), and the linked `Prompt` row (`text` + `planJson`).",
      "",
      "The SuperAdmin bundle (`.bundle.json`, `kind:\"diagram-bundle\"`) packages all of it. **Export** is server-side (`GET /api/admin/diagram-bundle/[id]`) because the client holds none of `aiComparison`/`planJson`/the per-model rows. **Import** (`POST /api/admin/import-diagram-bundle`) recreates prompt → per-model diagrams → main diagram with **fresh ids**, rewriting `data.aiGeneration.promptId` and `aiComparison.models[].diagramId` (pure helpers, tests **T1096–T1100**). JSON columns (`planJson`, `aiComparison`) are written via raw **pgPool** per the Prisma-7 convention. Imported names get a \" (import)\" suffix.",
    ].join("\n"),
  },
  {
    heading: "Org Hierarchy from BPMN + move-between-levels",
    body: [
      "**Populate from BPMN** walks the RAW diagram tree (`element.parentId`: pool → lane → sublane), white-box pools only, mapping Pool→Organisation, Lane→OrgUnit, Sublane→Team; deduped by name within each parent across all diagrams; merged into the project's OrgStructure list (additions `sourceNodeId:null`).",
      "",
      "The org hierarchy holds the invariant **`level == ORG_STRUCTURE_LEVELS[min(depth,3)]`**. So a move (`planMove`, pure + tested) reparents a node AND re-levels its **whole subtree** by depth — promote → grandparent, demote → previous sibling, up/down → sortOrder swap. Persisted atomically by `moveNode`, dispatched from the **existing** `PUT …/nodes/[id]` on both the project and org routes via a new `{action}` body (no new endpoint), so the promote/demote/reorder UI works in the shared editor everywhere.",
    ].join("\n"),
  },
  {
    heading: "ArchiMate junctions & groupings",
    body: [
      "**Junctions** were dropped on image ingestion because they had no `ARCHI_SHAPE` mapping. Added `and-junction`/`or-junction` → the `composite-junction-and`/`-or` masters (iconOnly), forced to a fixed ~25px across all three layout paths, plus a prompt cue to recognise the small circle joining same-type relationships.",
      "",
      "**Groupings** render with a transparent interior (`fill:none`), so only the thin dashed stroke caught clicks. Added invisible hit surfaces — a header strip (select/drag/double-click-to-rename) and a fat-transparent perimeter band (select near any boundary). Container behaviour (move-with-children, resize, drag-in adoption) already existed via `isContainerType`.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: COLLECTION }, include: { sections: true } });
    if (!chapter) {
      const last = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION }, orderBy: { sortOrder: "desc" } });
      const at = (last?.sortOrder ?? 0) + 1;
      const created = await prisma.helpChapter.create({ data: { slug: SLUG, collection: COLLECTION, title: TITLE, sortOrder: at } });
      chapter = { ...created, sections: [] };
      console.log(`Created ${COLLECTION} chapter "${TITLE}" at sortOrder ${at}.`);
    } else {
      await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: TITLE } });
      console.log(`Chapter "${TITLE}" already exists — updating sections in place.`);
    }

    let i = 0;
    for (const s of SECTIONS) {
      const existing = chapter.sections.find((x) => x.heading === s.heading);
      if (existing) {
        await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  update "${s.heading}"`);
      } else {
        await prisma.helpSection.create({ data: { chapterId: chapter.id, heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  insert "${s.heading}"`);
      }
      i++;
    }
    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
