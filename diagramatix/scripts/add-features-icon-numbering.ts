/**
 * Append Feature-catalog rows for the ArchiMate Icon Library and the Project
 * Re-numbering system. Idempotent (upsert by `name`; refreshes text, keeps the
 * admin's publish status). Inserted as DRAFT — review at /dashboard/admin/features
 * and Publish.
 *
 * Run: cd diagramatix && DATABASE_URL="…" npx tsx scripts/add-features-icon-numbering.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "ArchiMate Icon Library & Designer",
    sortOrder: 372,
    summary:
      "Design your own ArchiMate element icons — trace an image with AI, refine the vector shapes, and assign a glyph to any element type so it renders everywhere, recoloured to the layer.",
    details: [
      "- Upload an image of an icon and have it AI-traced into editable vector shapes, with the source image kept as a faint underlay to refine against",
      "- A full vector editor: lines, Bézier curves, rectangles, triangles, circles, ellipses, arcs (semi-circles whose endpoints ride the circle) and orientable arrowheads — with fill/stroke, z-order, a background (knockout) fill, and lasso + group-move",
      "- Trace over a built-in glyph to improve it, or start from scratch; save to a reusable library and duplicate any icon as a starting point",
      "- Assign a library glyph to an element type — it renders as that element's icon everywhere (canvas + palette), recolouring to the element's theme so one glyph works across layers, and staying crisp at any zoom",
      "- Fine-tune per-element position and size, and per-category edge buffers, so glyphs sit exactly where you want",
      "- Full ArchiMate 3.2 element set, relationship compatibility (including the directed Association and cross-level Realisation), and proper icon-only shapes — Service, Event (triangular notch), Value Stream chevron, and more",
      "- Changes apply live across open diagrams and the Symbols Panel, for every user",
    ].join("\n"),
  },
  {
    name: "Project Re-numbering",
    sortOrder: 374,
    summary:
      "Give a whole project consistent hierarchical numbers — folders, diagrams and activities — either preserving your APQC structure or renumbering from the root, with a full preview before anything changes.",
    details: [
      "- Configure numbering per project: APQC-preserving (keep the APQC folders and diagram names, renumber each diagram's activities) or a full renumber from the project root",
      "- Full-renumber pattern: a fixed 0–3 letter prefix on the top-level number, then dotted level numbers (e.g. ABC2.3.1.4), single-digit up to 9 and two-digit zero-padded beyond — applied to folders, diagrams and activities",
      "- APQC mode keeps your framework codes and renumbers activities contiguously — new non-APQC steps slot in, and gaps from deleted steps close automatically (numbers stay bare and sort correctly)",
      "- Preview every change (old → new) for every folder, diagram and activity before you commit; confirm or cancel",
      "- Activity codes render on the first line of each step; diagram and folder names are prefixed with their code",
      "- \"Show non-APQC\" toggle highlights everything added outside the framework — in the navigation tree, on the tiles, and on the diagram canvas — in the APQC colour",
      "- Idempotent: re-running produces the same result, so numbers never stack up",
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
