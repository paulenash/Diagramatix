-- Voice Assist — document the pool BOUNDARY commands.
--
-- Paul, 21 September 2026: "{Move, Nudge} Pool {left, right, top, bottom}
-- boundary {left, right, up, down}" — shipped in `11b2a915`. The live User
-- Guide and Technical Notes chapters were seeded on 2026-09-20 (D1) and
-- predate it, so a customer reading the guide is told about nudging a whole
-- pool and nothing about moving one of its edges.
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale — that was
-- right in September when the heading set itself changed, and it is wrong now:
-- it would discard anything edited in the app since. This file changes two
-- paragraphs and touches nothing else. (The seed carries the same new text, so
-- a database built from scratch and a database patched by this file end up
-- saying the same thing.)
--
-- IDEMPOTENT. Each statement refuses to act on a row that already has the new
-- text, so re-running it is a no-op rather than a second copy of the line.
-- Proven on `diagramatix_test` before prod.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. User Guide — the "what you can say" list gains the boundary commands.
--    Anchored on the pools/lanes bullet that has always ended that block.
-- ════════════════════════════════════════════════════════════════════════════
UPDATE "HelpSection"
SET "bodyMarkdown" = replace(
      "bodyMarkdown",
      $OLD$- "compress the Customer pool" · "extend the pools to include all elements"$OLD$,
      $NEW$- "compress the Customer pool" · "extend the pools to include all elements"
- "move the pool left boundary right" · "nudge the Warehouse pool top boundary up by 40" — moves **one edge**, not the pool. A left/right boundary only goes left or right, a top/bottom one only up or down; it stops at the first element it meets, and the lanes follow.$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%extend the pools to include all elements%'
  AND "bodyMarkdown" NOT LIKE '%left boundary right%';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Technical Notes — why the op carries no geometry of its own.
--    Appended to the container-primitives section, which is where the other
--    "voice reuses the reducer" notes live.
-- ════════════════════════════════════════════════════════════════════════════
UPDATE "HelpSection"
SET "bodyMarkdown" = "bodyMarkdown" || $TN$

**`movePoolBoundary`** (2026-09-21) adds no geometry of its own. It resolves the pool, works out the rect the named edge is being asked for, and hands it to the same `RESIZE_ELEMENT` a mouse drag uses — so a spoken boundary move inherits every rule a dragged one obeys: it stops at the first content any lockstep-linked pool meets, the lanes and sub-lanes follow, the pool stays exactly its lane stack, and nothing inside it moves. The grammar refuses an impossible pairing rather than guessing: a left or right boundary is a vertical line and can only travel sideways, so "move the left boundary up" is declined at the parser and declined again by `validateOps` if the model offers it back.$TN$,
    "updatedAt" = NOW()
WHERE collection = 'tech-design'
  AND heading = 'Reducer primitives added for containers'
  AND "bodyMarkdown" NOT LIKE '%movePoolBoundary%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. Both rows should read 1.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%left boundary right%')  AS guide_rows,
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'tech-design' AND "bodyMarkdown" LIKE '%movePoolBoundary%')    AS tech_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%left boundary right%') = 1
     AND (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'tech-design' AND "bodyMarkdown" LIKE '%movePoolBoundary%') = 1
    THEN 'OK — both chapters mention the boundary commands exactly once'
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%extend the pools to include all elements%') = 0
    THEN 'NOTHING TO PATCH — the Voice Assist guide chapter is not in this database; run seed-voice-assist-content.sql first'
    ELSE 'CHECK — see the counts above'
  END AS verdict;
