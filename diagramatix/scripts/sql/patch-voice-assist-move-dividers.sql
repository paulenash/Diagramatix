-- Voice Assist — document "move dividers" in the User Guide.
--
-- Paul, 27 September 2026: "introduce a new command: 1. say "move dividers"
-- 2. Numbers appear on the lane dividers themselves. 3. <n> up 100 pixels, or
-- 4. <n> down 2 tasks — subject to the current constraints. This should be
-- very reliable!! ... plus the usual sql update scripts".
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale and would
-- discard anything edited in the app since. This file adds one line and
-- touches nothing else. (The seed carries the same line, in the same place.)
--
-- ORDER. The anchor is the lane-boundary line that
-- patch-voice-assist-dividers-and-move-from.sql adds — run that first. The
-- verdict below says so if it has not been. The full order today is:
--   1. patch-voice-assist-insert-between.sql
--   2. patch-voice-assist-convert-and-move-contents.sql
--   3. patch-voice-assist-dividers-and-move-from.sql
--   4. this file
--
-- IDEMPOTENT. The UPDATE acts only on a row that has the anchor and does not
-- yet have the new line, so re-running it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace(
      "bodyMarkdown",
      $OLD$- "move Sales top boundary up" · "move the Picking lane bottom divider down by 20" — a lane's top or bottom boundary is the divider it shares with the lane beside it (at the top or bottom of the pool, the pool's own edge). It never runs through anything.$OLD$,
      $NEW$- "move Sales top boundary up" · "move the Picking lane bottom divider down by 20" — a lane's top or bottom boundary is the divider it shares with the lane beside it (at the top or bottom of the pool, the pool's own edge). It never runs through anything.
- "move dividers" — green numbers appear on every lane and sub-lane divider; then say "2 up 100 pixels", "1 down 2 tasks" or "1 up a bit", as often as you like, and "done". The surest way to move a divider: there is nothing to name. Blocked by something, it says how far it can go.$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%"move Sales top boundary up"%'
  AND "bodyMarkdown" NOT LIKE '%- "move dividers" — green numbers appear%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. new_rows should read 1.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "move dividers" — green numbers appear%') AS new_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "move dividers" — green numbers appear%') = 1
    THEN 'OK — the guide lists "move dividers" exactly once'
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"move Sales top boundary up"%') = 0
    THEN 'CHECK — run patch-voice-assist-dividers-and-move-from.sql first, then this again'
    ELSE 'CHECK — see the count above (the anchor line may have been edited in the app; add the line there by hand)'
  END AS verdict;
