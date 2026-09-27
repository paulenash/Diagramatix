-- Voice Assist — document lane dividers and "move everything from …" in the
-- User Guide.
--
-- Paul, 27 September 2026, from his test-diagram session: "we need a new
-- command to allow for lane/sublane dividers/horizontal boundary adjustments.
-- 'Move <lane_name> {top, bottom}boundary/divider {up, down}'" and "Move
-- everything from selected, in <lane_name>, {<n> steps, <m> pixels} to the
-- {right, left}. Never allow overlaps if it can't be done."
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale and would
-- discard anything edited in the app since. This file adds two lines and
-- touches nothing else. (The seed carries the same lines, in the same place.)
--
-- ORDER. The anchor is the "move everything in" line that
-- patch-voice-assist-convert-and-move-contents.sql adds — run that first. The
-- verdict below says so if it has not been.
--
-- IDEMPOTENT. The UPDATE acts only on a row that has the anchor and does not
-- yet have the new lines, so re-running it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace(
      "bodyMarkdown",
      $OLD$- "move everything in Sales two steps to the right" · "move everything in Picking 50 pixels to the left" — the contents of a pool, lane or sub-lane move, not the container (a step is 100 px). Moving right widens the pools when it needs to; nothing moves into a header.$OLD$,
      $NEW$- "move everything in Sales two steps to the right" · "move everything in Picking 50 pixels to the left" — the contents of a pool, lane or sub-lane move, not the container (a step is 100 px). Moving right widens the pools when it needs to; nothing moves into a header.
- "move everything from selected two steps to the right" · "move everything after Pick Items 50 pixels to the left" — the step and everything after it, in its own lane (or the pool or lane you name). It never moves into an overlap: too far left, it says how far it can go.
- "move Sales top boundary up" · "move the Picking lane bottom divider down by 20" — a lane's top or bottom boundary is the divider it shares with the lane beside it (at the top or bottom of the pool, the pool's own edge). It never runs through anything.$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%"move everything in Sales two steps to the right"%'
  AND "bodyMarkdown" NOT LIKE '%"move everything from selected two steps to the right"%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. new_rows should read 1.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"move everything from selected two steps to the right"%'
      AND "bodyMarkdown" LIKE '%"move Sales top boundary up"%') AS new_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"move everything from selected two steps to the right"%'
             AND "bodyMarkdown" LIKE '%"move Sales top boundary up"%') = 1
    THEN 'OK — the guide lists the divider and move-from commands exactly once'
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"move everything in Sales two steps to the right"%') = 0
    THEN 'CHECK — run patch-voice-assist-convert-and-move-contents.sql first, then this again'
    ELSE 'CHECK — see the count above (the anchor line may have been edited in the app; add the lines there by hand)'
  END AS verdict;
