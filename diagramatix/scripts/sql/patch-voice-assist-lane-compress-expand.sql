-- Voice Assist — document "compress lane" and "expand lane" in the User Guide.
--
-- Paul, 26 September 2026: "Add commands Compress Lane <lane_name>, and,
-- Expand Lane <lane_name>". Asked what should move, he chose THE BOTTOM EDGE:
-- a compressed lane keeps its top, its content moves up to half a Task under
-- it and the lanes below close up; an expanded lane gains one Task row (or the
-- number said) at the bottom. The live User Guide chapter lists "compress the
-- Customer pool" and says nothing about lanes.
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale and would
-- discard anything edited in the app since. This file adds one line and
-- touches nothing else. (The seed carries the same line, so a database built
-- from scratch and a database patched by this file say the same thing.)
--
-- IT REPLACES THE PHRASE, NOT THE LINE. Prod also has the boundary-command
-- line straight after this one (add-pool-boundary-command.sql, run
-- 2026-09-21); replacing only the compress-pool phrase with itself plus the
-- new line leaves whatever follows it exactly as it is.
--
-- IDEMPOTENT. The UPDATE acts only on a row that has the anchor phrase and
-- does not yet have the new line, so re-running it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace(
      "bodyMarkdown",
      $OLD$- "compress the Customer pool" · "extend the pools to include all elements"$OLD$,
      $NEW$- "compress the Customer pool" · "extend the pools to include all elements"
- "compress the Sales lane" · "expand lane Picking by 100" — a lane fits to its content: its top stays and the lanes below close up. Expand adds one Task row at the bottom, or the number you say.$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%- "compress the Customer pool" · "extend the pools to include all elements"%'
  AND "bodyMarkdown" NOT LIKE '%"compress the Sales lane" · "expand lane Picking by 100"%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. new_rows should read 1.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"compress the Sales lane" · "expand lane Picking by 100"%') AS new_rows,
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "compress the Customer pool" · "extend the pools to include all elements"%') AS anchor_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"compress the Sales lane" · "expand lane Picking by 100"%') = 1
    THEN 'OK — the guide lists the lane commands exactly once'
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%extend the pools to include all elements%') = 0
    THEN 'NOTHING TO PATCH — the Voice Assist guide chapter is not in this database; run seed-voice-assist-content.sql first'
    ELSE 'CHECK — see the counts above (the compress line may have been edited in the app; add the lane line there by hand)'
  END AS verdict;
