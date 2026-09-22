/**
 * User Guide — adding lanes and sublanes, and the two protocol facts that
 * stopped being true when the lane rules changed.
 *
 * UPDATE_EVERYTHING.md Step 10b, for release 2.12.2699 (schema 49).
 *
 * Three edits, all in the "Select & Connect Protocol" chapter:
 *   1. A NEW section, "Adding lanes and sublanes" — the ghost that shows what a
 *      drop would create, the rule that the pool never grows, and the red
 *      boundary that says a release would do nothing.
 *   2. "Pool, lane, and subprocess boundaries" said every descendant sublane
 *      "proportionally rescales". It did, and that was the bug: dragging one
 *      boundary moved every divider in the stack. Only the band at the edge
 *      that moved absorbs now, and a boundary stops at the content rather than
 *      pushing it.
 *   3. "Cursors by context" described the pool edge as a flat 10 px hit-zone.
 *
 * Idempotent: re-running changes nothing. The new section is placed once, and
 * only when it is created are the sections below it shifted down; after that
 * the script only ever updates body text, so it cannot fight a later ordering
 * pass (the trap from 2026-08-23).
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-lane-drop.ts                            # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-lane-drop.ts  # prod
 *   ... --dry-run   to preview without writing
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "user-guide";
const CHAPTER = "Select & Connect Protocol";
const HEADING = "Adding lanes and sublanes";

const BODY = `Drag the **Pool/Lane** symbol from the palette onto an existing pool and the canvas shows you what a release would create, before you let go.

-   **A ghost of the new lane.** A dashed band appears inside the pool, with its own header strip, exactly where and at the size the new lane would be. Move the pointer and it follows the answer — near the top or bottom edge of the pool it adds a lane there, near a divider it adds one between, and in the middle third of a lane you see **two** bands: that lane splitting into two sublanes. So you can choose by moving, rather than by dropping and undoing.
-   **The pool never changes size.** A new lane or sublane is carved out of the neighbour it sits next to, taking the empty space at that edge — up to half of it. If that edge is crowded, the neighbour's own contents slide away from it into its free space, so no task ever changes lane or ends up outside one.
-   **A red pool boundary means nothing will happen.** When the neighbouring lane cannot spare a band — there is no empty space left, or what remains would be too short for the new lane's name to fit down its header — the pool's outline turns red. Move up or down until the ghost reappears.
-   **A pool with a single lane always just gets a second lane**, wherever you drop.

Dropping the Pool/Lane symbol on empty canvas still creates a new **pool**, and dropping it on a pool that has no lanes yet gives that pool one lane filling its body.`;

/** Corrections to sections that the lane-boundary rules made untrue. */
const CORRECTIONS: Array<{ heading: string; find: string | RegExp; replace: string }> = [
  {
    heading: "Pool, lane, and subprocess boundaries",
    find: "The vertical delta is absorbed by the single lane sharing the dragged edge — other sibling lanes keep their height. Inside that absorbing lane every descendant sublane (and sub-sublane, recursively) proportionally rescales so each level continues to tile its parent.",
    replace: "The vertical delta is absorbed by the single lane sharing the dragged edge — other sibling lanes keep their height. Inside that lane the change is taken by the band at **the same edge**, all the way down, so every other divider in the stack stays exactly where you put it. A boundary also **stops at the content**: drag it inwards and it comes to rest against the elements inside rather than pushing them along ahead of it.",
  },
  {
    heading: "Pool, lane, and subprocess boundaries",
    find: "Lane boundaries between adjacent lanes within the same pool are draggable vertically to redistribute lane heights. Sublanes inside the resized lanes proportionally rescale all the way down.",
    replace: "Lane boundaries between adjacent lanes within the same pool are draggable vertically to redistribute lane heights: the lane above grows, the lane below shrinks, and the pool keeps its size. Inside each of them only the band at the edge that moved changes height — the dividers between the other sublanes do not move.",
  },
  {
    heading: "Cursors by context",
    // The stored text uses a NARROW no-break space in "10 px", so this one
    // cannot be matched literally.
    find: /\| Pool edge \(all four sides,\s*10\s*px hit-zone\) \| ew-resize \/ ns-resize \|/,
    replace: "| Pool edge (all four sides; the catch reaches 14 px outside the shape and a little way inside, scaled to how tall it is) | ew-resize / ns-resize |",
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const chapter = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION, title: CHAPTER } });
    if (!chapter) {
      console.error(`!! no "${CHAPTER}" chapter in ${COLLECTION} — nothing done.`);
      process.exitCode = 1;
      return;
    }

    // ── 1. The new section ────────────────────────────────────────────────
    const existing = await prisma.helpSection.findFirst({ where: { chapterId: chapter.id, heading: HEADING } });
    if (existing) {
      if (existing.bodyMarkdown === BODY) {
        console.log(`"${HEADING}" — already current.`);
      } else {
        console.log(`"${HEADING}" — updating body (order left at #${existing.sortOrder}).`);
        if (!dryRun) {
          await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: BODY } });
        }
      }
    } else {
      // Place it directly after the boundaries section, shifting the rest down.
      const boundaries = await prisma.helpSection.findFirst({
        where: { chapterId: chapter.id, heading: "Pool, lane, and subprocess boundaries" },
      });
      const at = (boundaries?.sortOrder ?? 4) + 1;
      console.log(`"${HEADING}" — creating at #${at}, shifting later sections down by one.`);
      if (!dryRun) {
        await prisma.$transaction([
          prisma.helpSection.updateMany({
            where: { chapterId: chapter.id, sortOrder: { gte: at } },
            data: { sortOrder: { increment: 1 } },
          }),
          prisma.helpSection.create({
            data: { chapterId: chapter.id, collection: COLLECTION, heading: HEADING, bodyMarkdown: BODY, sortOrder: at },
          }),
        ]);
      }
    }

    // ── 2. The corrections ────────────────────────────────────────────────
    for (const c of CORRECTIONS) {
      const s = await prisma.helpSection.findFirst({ where: { chapterId: chapter.id, heading: c.heading } });
      if (!s) { console.log(`?? "${c.heading}" — not found, skipped.`); continue; }
      if (s.bodyMarkdown.includes(c.replace)) { console.log(`"${c.heading}" — correction already applied.`); continue; }
      const hit = typeof c.find === "string" ? s.bodyMarkdown.includes(c.find) : c.find.test(s.bodyMarkdown);
      if (!hit) {
        // Loud, not silent: a reworded sentence means a human should look.
        console.log(`?? "${c.heading}" — the sentence to correct is not there any more; left alone.`);
        continue;
      }
      console.log(`"${c.heading}" — correcting.`);
      if (!dryRun) {
        await prisma.helpSection.update({
          where: { id: s.id },
          data: { bodyMarkdown: s.bodyMarkdown.replace(c.find, c.replace) },
        });
      }
    }

    console.log(dryRun ? "\n--dry-run — nothing written." : "\nDone.");
  } finally {
    await prisma.$disconnect();
  }
}

main();
