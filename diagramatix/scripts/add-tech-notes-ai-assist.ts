/**
 * Add an "AI Assist & Abracadabra Mode" chapter to the SuperAdmin **Technical
 * Design Notes** (`tech-design` collection, /tech-notes). Documents the
 * non-obvious engineering behind the 2026-08-04 assist suite. Idempotent.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-tech-notes-ai-assist.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-tech-notes-ai-assist.ts # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";
const SLUG = "ai-assist";
const TITLE = "AI Assist & Abracadabra Mode";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "Two tiers: rules propose, rules dispose",
    body: [
      "Assist is deliberately **hybrid**: everything cheap and deterministic runs client-side with no LLM; the AI is a fallback for free phrasing only.",
      "",
      "- **Placement geometry** is pure + unit-tested (`app/lib/diagram/assistPlacement.ts`): inline (51px, centres aligned), gateway fan-out, boundary near-edge (18px), `findFreeSlot` (nearest slot ≥51px), and R7 boundary-follow. Constants live in one file so tuning is a one-liner.",
      "- **Legality** reuses a pure `canConnect(source, target, type, elements)` that mirrors the `ADD_CONNECTOR` reducer gauntlet; a parity test keeps them in agreement so no suggestion is ever illegal.",
      "- These are the **red** (code-enforced) rules — never sent to the model. The **green** rules (keyword → action) are editable and injected into the AI prompt.",
    ].join("\n"),
  },
  {
    heading: "The command interpreter (Abracadabra)",
    body: [
      "A spoken/typed utterance becomes a small **op list** (`app/lib/assist/`):",
      "- `ops.ts` — the `AssistOp` union (add / connect / disconnect / delete[+compact] / rename / move / addBoundary / addLanes / addSublanes / wrapInPool / clear / export / undo). Refs are spoken **names**, resolved at apply time.",
      "- `commandGrammar.ts` — `parseCommand` deterministic grammar; returns `null` → AI fallback.",
      "- `resolveRef.ts` — name (exact/substring/token-fuzzy) + bare type nouns + pronouns (it/last/previous, by add order) + kind-prefix strip + **positional** (left/middle/right/top/bottom pool|lane, axis = greatest spread).",
      "- `serializeDiagram.ts` — a compact id/type/label/parent + connections dump so the AI can resolve references.",
      "",
      "`applyAssistOps` in `DiagramEditor.tsx` maps ops onto the **granular, history-pushing** reducer helpers (never `setData`, which would wipe undo), so every command is one undoable step. Failures/ambiguity are reported in the command log, never a silent no-op.",
    ].join("\n"),
  },
  {
    heading: "AI fallback route + metering",
    body: [
      "`POST /api/ai/command` is the first **incremental** AI path (every other AI route regenerates a whole diagram). It takes `{instruction, state}` and returns a validated `AssistOp[]` delta, grounded with `aiRules` + the compact serialization. Blocking (~1s); no streaming needed.",
      "",
      "New invocation point `LiveCommand` (\"Live Command (Abracadabra)\") is deliberately **NOT** in `AI_USER_METERED_POINTS` — a *Raw Attempt only*, like `dictation.refine` — so a chatty session never burns the `aiAttempts` quota. The command log colour-codes each entry **rule** vs **✨ AI**.",
    ].join("\n"),
  },
  {
    heading: "New reducer actions for lanes & pools",
    body: [
      "Voice lane/sublane creation needed clean, single-dispatch primitives (the existing `ADD_SUBLANE` splits into two on the first call, and neither returns the new id):",
      "- `SPLIT_POOL_EVEN` / `SPLIT_LANE_EVEN` — create **N equal, named** lanes/sublanes in one dispatch, re-parenting a lane's loose children into the first sublane. This sidesteps async id-capture entirely.",
      "- `WRAP_IN_POOL` — the one genuinely new capability: wrap all **un-pooled** flow elements in a new pool + single lane sized to contain them (bbox + padding); existing pools/lanes and their contents are left untouched.",
    ].join("\n"),
  },
  {
    heading: "Assist / NL Rules catalog (green) + voice metering",
    body: [
      "The **green** rules are one editable catalog (`IntentKeywordMap`, generalised): each row = keywords → an action (`suggest-template` | `add-input-data-object` | `add-output-data-object`) + `diagramType` + `defaultLabel`. Edited at **Admin → Assist / NL Rules**, which also shows the **red** geometry rules read-only. `matchAssistRules(name, diagramType, catalog, action?)` is the shared, word-boundary matcher.",
      "",
      "**Voice metering:** `startDictation` records one `DictationSession` row per session (who, org, engine, seconds) via `sendBeacon` on session end — for both consumers (Abracadabra + the AI panel). Deepgram audio is billed by Deepgram; the AI Usage page surfaces our lightweight minutes/sessions-by-engine view, scoped by the same filters.",
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
