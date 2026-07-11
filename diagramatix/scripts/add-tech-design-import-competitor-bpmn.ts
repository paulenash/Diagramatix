/**
 * Add a "Importing competitor diagrams (free-form layout)" section to the
 * SuperAdmin **Technical Design Notes** — the low-level design of the
 * relaxedLayout flag + the image position-reproduction pipeline. Lives in the
 * existing `layout-engines` chapter of the `tech-design` collection. Idempotent:
 * upsert by heading. Mirrors scripts/add-tech-design-notes.ts.
 *
 * Run: DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/add-tech-design-import-competitor-bpmn.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";
const CHAPTER_SLUG = "layout-engines";
const HEADING = "Importing competitor diagrams (free-form layout)";

const BODY = [
  "Other vendors' BPMN diagrams break two Diagramatix conventions — pools aren't stacked full-width (they can be any size and sit side-by-side) and message flows are rectilinear between non-vertically-aligned elements. A single diagram-level flag, **`DiagramData.relaxedLayout`** (schema **1.37**; optional boolean `relaxedLayout` attribute on `<dgx:data>`, written only when true), lets such a diagram be shown and kept exactly as drawn.",
  "",
  "### What the flag relaxes",
  "",
  "The key finding was that suppressing validation is not enough — pool stacking and vertical messages are **actively enforced** in the reducer and router, so the flag gates three layers:",
  "",
  "- **Validation** — `checkDiagram` filters out the pure-geometry rules (`RELAXED_SUPPRESSED_RULES`: containment, lane-tiling, element-overlap, pool-header-overrun, hanging-message, connector-on-container, duplicate-container-name, message-not-moveable) when `d.relaxedLayout` is set. Both the live scanner and the project-wide `scan-pool-connectors` route read the flag, and the canvas's live \"misaligned message\" red tint is skipped. Semantic rules (missing start/end, gateway wiring) still run.",
  "- **Reducer geometry** — the full-width pool cascade (`applyPoolBoundaryShift`) and the vertical-stack shove are gated on `!state.relaxedLayout` in the MOVE/RESIZE handlers, so pools keep independent size and placement.",
  "- **Router** — `recomputeAllConnectors(connectors, elements, relaxedLayout)` gains a third arg; when true, a `messageBPMN` routes rectilinearly between the facing sides (re-picking a side that points away, like the archi-connector path) instead of the forced shared-x vertical dogleg. The flag is threaded through every reducer-level recompute call and message-creation site.",
  "",
  "### Reproducing positions from an image",
  "",
  "The AI image-import path can rebuild the vendor's actual layout rather than auto-stacking:",
  "",
  "1. **Capture** — with `captureGeometry` on (the PlanPanel \"Reproduce original layout\" toggle → the `plan` route → `planBpmn`), the vision system prompt asks the model to additionally return each shape's normalised **`bounds`** (0..1 of the image) and each connector's **`sourceSide`/`targetSide` + `waypoints`**. These ride the plan schema (`planSchema.ts`) and `AiElement`/`AiConnection` (`bounds`/`waypoints` are plan-only — **not** in the diagram export).",
  "2. **Repair** — `snapImportedBounds` (`app/lib/diagram/importGeometry.ts`, pure/unit-tested) is the quality lever over jittery vision boxes: clamp → order pools top→bottom by y → snap lanes to their pool and tile them → cluster near-aligned node centres into shared columns/rows → repair each node's pool/lane membership by containment (geometry beats the declared field).",
  "3. **Place** — `layoutBpmnPreserved` (in `bpmnLayout.ts`) scales the cleaned normalised boxes to canvas px at a fixed `TARGET_W` with the image aspect ratio, builds elements with absolute geometry + `parentId` nesting (fixed-size symbols keep catalogue size centred on the box), honours imported connector sides + waypoints (else routes via the relaxed router), and returns `relaxedLayout: true`.",
  "",
  "`layoutBpmnDiagram(elements, connections, { preservePositions, imageAspect })` early-returns to `layoutBpmnPreserved`; if the geometry is unusable (no pool bounds, or the placement would overlap badly) it returns `null` and drops through to the normal auto-stack engine — a valid, validated fallback. Request intent (`preservePositions`) and outcome (`relaxedLayout`) are kept separate so a failed reproduction doesn't silently disable validation. Pinned by tests **T0708–T0711**.",
].join("\n");

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const chapter = await prisma.helpChapter.findFirst({ where: { slug: CHAPTER_SLUG, collection: COLLECTION }, include: { sections: true } });
    if (!chapter) { console.error(`No "${CHAPTER_SLUG}" ${COLLECTION} chapter — run scripts/add-tech-design-notes.ts first.`); process.exit(1); }

    const existing = chapter.sections.find((s) => s.heading === HEADING);
    if (existing) {
      await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: BODY } });
      console.log(`Updated existing section "${HEADING}".`);
    } else {
      const sortOrder = Math.max(-1, ...chapter.sections.map((s) => s.sortOrder)) + 1;
      await prisma.helpSection.create({
        data: { chapterId: chapter.id, collection: COLLECTION, heading: HEADING, bodyMarkdown: BODY, sortOrder },
      });
      console.log(`Inserted section "${HEADING}" into "${chapter.title}".`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
