-- Voice Assist — the named boundary command's follow-up, and "move divider" in more words.
--
-- Paul, 28 September 2026, second "move dividers" session: the named command
-- ("move finance boundary up") keeps its rule — "that command uses element
-- positions inside the lane" — and now: after it, just the amount ("sixty
-- pixels", "up by 98") moves the same boundary again. And: "Recognise all the
-- following: "move divider" and "move lane divider", "move dividers" and
-- "move lane dividers" for the command".
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale and would
-- discard anything edited in the app since. This file rewrites two lines and
-- touches nothing else. (The seed carries the same new lines.)
--
-- ORDER. The lines it rewrites come from patch-voice-assist-dividers-and-move-from.sql
-- and patch-voice-assist-move-dividers-free.sql — run those first. The verdict
-- below says so if they have not been. The full order today is:
--   1. patch-voice-assist-insert-between.sql
--   2. patch-voice-assist-convert-and-move-contents.sql
--   3. patch-voice-assist-dividers-and-move-from.sql
--   4. patch-voice-assist-move-dividers.sql
--   5. patch-voice-assist-move-dividers-free.sql
--   6. this file
--
-- IDEMPOTENT. Each UPDATE acts only on a row that still has its old line, so
-- re-running it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace("bodyMarkdown", $OLD$- "move Sales top boundary up" · "move the Picking lane bottom divider down by 20" — a lane's top or bottom boundary is the divider it shares with the lane beside it (at the top or bottom of the pool, the pool's own edge). It never runs through anything.$OLD$, $NEW$- "move Sales top boundary up" · "move the Picking lane bottom divider down by 20" — a lane's top or bottom boundary is the divider it shares with the lane beside it (at the top or bottom of the pool, the pool's own edge). It never runs through anything in the lane that gives way; blocked, it says how far it can go. Then just say how far — "sixty pixels" (that much in all) or "up by 40" — and the same boundary moves again.$NEW$),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%the pool''s own edge). It never runs through anything.%';

UPDATE "HelpSection"
SET "bodyMarkdown" = replace("bodyMarkdown", $OLD$- "move dividers" — green numbers appear on every lane and sub-lane divider, with green ticks$OLD$, $NEW$- "move dividers" (or "move divider", "move lane dividers", "move lane divider") — green numbers appear on every lane and sub-lane divider, with green ticks$NEW$),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%- "move dividers" — green numbers appear on every lane and sub-lane divider, with green ticks%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. Both new_* should read 1, both old_* 0.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"sixty pixels" (that much in all)%') AS new_follow_up,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%the pool''s own edge). It never runs through anything.%') AS old_follow_up,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "move dividers" (or "move divider"%') AS new_dividers,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "move dividers" — green numbers appear%') AS old_dividers,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"sixty pixels" (that much in all)%') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "move dividers" (or "move divider"%') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "move dividers" — green numbers appear%') = 0
    THEN 'OK — the guide has the boundary follow-up and every way to say "move dividers"'
    WHEN (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "move dividers"%') = 0
    THEN 'CHECK — run patches 3, 4 and 5 first (see ORDER above), then this again'
    WHEN (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%wrapping a long name onto two lines first%') = 0
    THEN 'CHECK — run patch-voice-assist-move-dividers-free.sql first, then this again'
    ELSE 'CHECK — see the counts above (a line may have been edited in the app; change it there by hand)'
  END AS verdict;
