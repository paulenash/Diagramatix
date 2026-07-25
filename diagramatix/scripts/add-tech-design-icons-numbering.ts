/**
 * Add SuperAdmin Technical Design Notes for the ArchiMate Icon Library + v3.2
 * rendering (into the "diagram-canvas" chapter) and the Project re-numbering
 * system (into "pcf-design"). Idempotent + LIVING: upsert by heading. Requires the
 * base chapters (run scripts/add-tech-design-notes.ts first, as on deploy).
 *
 * Run: cd diagramatix && DATABASE_URL="…" npx tsx scripts/add-tech-design-icons-numbering.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";

const NOTES: Array<{ chapterSlug: string; heading: string; body: string }> = [
  {
    chapterSlug: "diagram-canvas",
    heading: "ArchiMate icons — built-in drawers, the custom Icon Library, and v3.2",
    body: [
      "ArchiMate element glyphs are **hand-coded SVG drawers** in `app/lib/archimate/icons.tsx` (`ICON_DRAWERS[iconType]`, signature `({cx,cy,size,colour}) => ReactNode`), keyed by the catalogue `iconType` (`public/archimate-catalogue.json`, version 3.2). `ArchimateShape.tsx` resolves an element's `shapeKey → entry → iconType → drawer`, with special branches for icon-only forms (Actor figure, Service stadium, Event scoop, **Value Stream chevron**) and junctions.",
      "",
      "### Custom Icon Library",
      "A SuperAdmin can design glyphs without code (**Admin → ArchiMate Icon Library**). Icons are stored as **data — a list of vector primitives** (line, Bézier path, rect, triangle, circle, ellipse, arc; fill/stroke/z-order; orientable arrowheads) in the `ArchimateIconLibrary` table (`primitives` as a JSON string; source image bytes as the editing underlay). `drawCustomIcon()` in `app/lib/archimate/iconShapes.tsx` re-draws them as live SVG on every render — the **same contract** as a built-in drawer — so they recolour to the element theme and scale crisply. `validateIconPrimitives()` is the single trust boundary (runs on AI-vectorize output AND every DB read).",
      "",
      "Icons can be AI-traced from an uploaded image (`/api/admin/archimate-icon-library/vectorize`, reusing the vision-model seam). Assignment + layout + category buffers + the published icon-only set all live in `AppSetting` keys (`archimate.icon.custom`, `archimate.icon.layout`, `archimate.icon.buffer`, `archimate.icon.separate`), read by module-cached hooks that broadcast changes across tabs. `ArchimateShape` and the palette preview branch to `drawCustomIcon` when an element type has an assignment.",
      "",
      "### v3.2 elements, relationships, and shape boundaries",
      "The full ArchiMate 3.2 element set is in the catalogue; the relationship compatibility matrix (`public/archimate-relationships.json` + `compatibility.ts`) drives the connector picker, including the **directed Association** (`archi-association-directed`) and **cross-level Realisation** (promoted from derived to allowed). Value Stream renders as a right-pointing chevron whose connectors dock to the shape outline via a reusable **shape-aware boundary** hook in `app/lib/diagram/routing.ts` (`projectToShapeBoundary` — a ray-cast against the shape polygon, gated per element so nothing else is affected). Events use an inward isosceles-triangle notch on the left.",
    ].join("\n"),
  },
  {
    chapterSlug: "pcf-design",
    heading: "Project re-numbering engine",
    body: [
      "The **Project re-numbering system** assigns hierarchical codes to a project's folders, diagrams and activities. Configuration lives in a new `Project.numberingConfig` JSON column (`{mode, prefix, applied, showNonApqc, lastAppliedAt}`, normalised by `resolveNumberingConfig`).",
      "",
      "### Pure engine",
      "`app/lib/numbering/renumber.ts` is a **DB-free, unit-tested** engine (modelled on `riskControls/renumber.ts`). It takes the folder tree + diagrams and returns a structured **old→new diff** (folders / diagrams / per-element), which drives BOTH the preview and the apply:",
      "- **Full mode** walks the virtual folder tree (`Project.folderTree`) depth-first, numbering the combined folder-then-diagram sequence at each level. Codes are `{PREFIX}{n}.{m}.{k}` — the 0–3 letter prefix on the top-level number, dotted below — with width from the sibling count (≤9→1 digit, ≥10→2, zero-padded). Activities are ordered by spatial reading order (y-band then x); only `NUMBERABLE_TYPES` are numbered.",
      "- **APQC mode** keeps the APQC folder/diagram codes and renumbers each diagram's activities **contiguously** (APQC first by `pcfHierarchyId`, then non-APQC appended), so deleted-APQC gaps close. APQC numbers are **bare** (no zero-pad) and sort numerically. Each element's `pcfHierarchyId` is preserved as its canonical identity.",
      "",
      "Codes are stored on `DiagramData.nameCode` (Diagram Name Code; `Diagram.name` is also prefixed) and `element.properties.nameCode` (Activity Name Code; the label is stored as `code\\nname` so the code renders on line 1). Shared code parse/format helpers are in `app/lib/numbering/codes.ts` (`widthFor`, `pad`, `dottedCompare`, `stripLeadingCode` — the last makes re-runs idempotent by recovering the base name before reapplying).",
      "",
      "### Preview / apply / highlight",
      "`app/api/projects/[id]/renumber` — GET computes the diff (preview); POST **recomputes server-side** (never trusts a client diff) and applies via one `pgPool` transaction (element labels+codes, `Diagram.name`, folder names, `applied` flag). The `NumberingDialog` shows config → scrollable preview → confirm. A project-level **\"Show non-APQC\"** toggle highlights non-APQC folders/diagrams (nav tree + tiles) and activities (canvas ring via `Canvas.nonApqcHighlightIds`) in the live APQC feature colour.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    for (const n of NOTES) {
      const chapter = await prisma.helpChapter.findFirst({ where: { slug: n.chapterSlug, collection: COLLECTION }, include: { sections: true } });
      if (!chapter) { console.error(`No "${n.chapterSlug}" ${COLLECTION} chapter — run scripts/add-tech-design-notes.ts first.`); continue; }
      const existing = chapter.sections.find((s) => s.heading === n.heading);
      if (existing) {
        await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: n.body } });
        console.log(`  update "${n.heading}" in ${n.chapterSlug}`);
      } else {
        const sortOrder = Math.max(-1, ...chapter.sections.map((s) => s.sortOrder)) + 1;
        await prisma.helpSection.create({ data: { chapterId: chapter.id, collection: COLLECTION, heading: n.heading, bodyMarkdown: n.body, sortOrder } });
        console.log(`  insert "${n.heading}" into ${n.chapterSlug}`);
      }
    }
    console.log("Done.");
  } finally { await prisma.$disconnect(); }
}

main().catch((err) => { console.error(err); process.exit(1); });
