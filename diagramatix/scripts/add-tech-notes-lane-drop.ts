/**
 * Technical Design Notes — "Pools, lanes and the drop plan" (`tech-design`
 * collection, /tech-notes). UPDATE_EVERYTHING.md Step 12, for release
 * 2.12.2699 (schema 49).
 *
 * The engineering worth recording from the September 2026 pool/lane work: one
 * decision object shared by the preview and the action, a container that never
 * grows, and the stack arithmetic underneath both. Idempotent.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-tech-notes-lane-drop.ts                            # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-tech-notes-lane-drop.ts  # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";
const SLUG = "pools-lanes-drop-plan";
const TITLE = "Pools, lanes and the drop plan";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "One decision, drawn or done",
    body: [
      "Dropping the Pool/Lane symbol on a pool adds a lane, adds a sublane, splits a lane in two, or does nothing. The user now sees which BEFORE releasing (a ghost band; a red pool outline when the answer is *nothing*), and a preview computed separately from the action is a promise nothing keeps — it drifts the first time either side is touched, and the user is told they will get a lane and gets none.",
      "",
      "So the decision is data, in one pure module:",
      "",
      "- `app/lib/diagram/laneDropPlan.ts` — `planLaneDrop(elements, point, laneFs)` returns `first-lane` (an empty pool takes one lane filling its body), `band` (a lane or sublane carved from a neighbour), `split` (a lane becomes two sublanes) or `none`. Every variant carries the **exact rectangles** the drop would produce, and `none` still names the pool, because the red outline has to know whose boundary to draw.",
      "- `Canvas.tsx` draws that plan on `dragOver` (`samePlan` suppresses the re-render while the answer has not changed, so the ghost does not flicker along the pointer's travel).",
      "- The `ADD_ELEMENT` pool branch in `useDiagram.ts` **applies** the same plan. It holds no zone arithmetic of its own — a guard (T4694) fails if any comes back.",
      "",
      "The tests compare the band that appears with the band that was drawn, AND against reality — the stack still tiles the pool exactly, every band fits its own name, every task is still in its lane — because a reducer that applies the plan would otherwise agree with a plan that lied (T4692).",
    ].join("\n"),
  },
  {
    heading: "A container never grows: carve, don't extend",
    body: [
      'Paul, 2026-09-22: "Adding lanes to a Pool should not grow the Pool. The lanes must be added within the Pool … Never grow the Pool with these Lane and Sublane additions."',
      "",
      "`planCarve` works out where the room comes from, and `applyCarve` spends it:",
      "",
      "- **Donor** — the band the new one goes next to: below it for a band on top, above it for one at the bottom, and between two bands the taller (or a named `preferDonorId`, which is how the voice command \"add a lane below Picking\" takes the room from Picking).",
      "- **How much** — the empty space at that edge beyond the donor's contents, capped at half its height and at `shrinkRoom`, the recursive floor set by its own label and its sub-lanes' labels.",
      "- **The slide** — when that edge is crowded, the donor's contents move away from it into its free space at the far edge, as an ordinary `MOVE_ELEMENTS` so connectors and boundary events travel with them. Only a donor with **no sub-lanes** may slide: moving content past fixed sublane dividers would change which sublane it sits in.",
      "- **Refusal** — if what is left cannot fit the new band's name, `planCarve` returns `null` and nothing happens. That is the red boundary. Shrinking a lane below its own label was ruled out earlier (a sublane is never shorter than its header text), so refusing is the only honest answer.",
      "",
      "The half-event gap in front of the leftmost element (2026-09-21) followed the same correction: it used to widen the pool leftwards, and now moves the pool's CONTENT right instead, clamped so nothing crosses the right edge.",
    ].join("\n"),
  },
  {
    heading: "Stack arithmetic: only the edge that moved",
    body: [
      "A lane stack always fills its container exactly — that is what a swimlane IS — so a height change has to be absorbed somewhere. It is absorbed by **the band at the edge that moved**, and every other divider stays put (Paul, 2026-09-21: \"Only the boundary should move\").",
      "",
      "- `app/lib/diagram/laneBands.ts` — `shrinkRoom(node, edge)` is recursive: a lane's room is its EDGE band's room, not the sum of what all its bands could give. Summing over-states it by whatever the untouched bands hold, and the stack ends up taller than the lane that contains it.",
      "- `absorbAtEdge` / `stackFrom` lay the result out tight by construction; `refitStackAtEdge` (lifted out of `MOVE_LANE_BOUNDARY` so the carve uses the same code) recurses into the band that absorbed, at the same edge, and merely translates the others.",
      "- `app/lib/diagram/poolLaneBounds.ts` — `clampRectToContent` stops a boundary at the content instead of pushing it; `poolFollowsLanes` asserts \"a pool is exactly its lane stack\" on the containment pass that every height-writing path already ends with, because three reports from three different gestures said the dissociation was never in any one of them.",
      "",
      "Container name metrics (`containerMetrics.ts`) were lifted out of the reducer for the same reason the plan was: the planner has to size a band with the very arithmetic the reducer applies, or the ghost promises a lane that will not fit.",
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
    let changed = 0;
    for (const s of SECTIONS) {
      const existing = chapter.sections.find((x) => x.heading === s.heading);
      if (existing) {
        if (existing.bodyMarkdown === s.body && existing.sortOrder === i) {
          console.log(`  same   "${s.heading}"`);
        } else {
          await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body, sortOrder: i } });
          console.log(`  update "${s.heading}"`);
          changed++;
        }
      } else {
        await prisma.helpSection.create({ data: { chapterId: chapter.id, collection: COLLECTION, heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  insert "${s.heading}"`);
        changed++;
      }
      i++;
    }
    console.log(changed === 0 ? "Done — nothing to change." : "Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
