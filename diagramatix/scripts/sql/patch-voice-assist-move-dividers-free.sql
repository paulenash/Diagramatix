-- Voice Assist — "move dividers" goes through the elements; the User Guide says so.
--
-- Paul, 28 September 2026: "the Voice Assist command, "move dividers", should
-- move the lane boundaries without any constraint concerning the elements on
-- the diagram. The only constraints should be a) the new lane/sublane heights
-- must allow the lane/sublane names to be displayed, BUT wrapping the
-- lane/sublane name to 2 lines to allow for a narrower lane must be tried if
-- it is possible. b) the pool boundary, of course." — and: "during the "move
-- dividers" command mark the lane header inner vertical boundary with green
-- ticks every 100 px".
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale and would
-- discard anything edited in the app since. This file rewrites one line and
-- touches nothing else. (The seed carries the same new line, in the same place.)
--
-- ORDER. The line it rewrites is the one patch-voice-assist-move-dividers.sql
-- adds — run that first. The verdict below says so if it has not been. The
-- full order today is:
--   1. patch-voice-assist-insert-between.sql
--   2. patch-voice-assist-convert-and-move-contents.sql
--   3. patch-voice-assist-dividers-and-move-from.sql
--   4. patch-voice-assist-move-dividers.sql
--   5. this file
--
-- IDEMPOTENT. The UPDATE acts only on a row that still has the old line, so
-- re-running it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace(
      "bodyMarkdown",
      $OLD$- "move dividers" — green numbers appear on every lane and sub-lane divider; then say "2 up 100 pixels", "1 down 2 tasks" or "1 up a bit", as often as you like, and "done". The surest way to move a divider: there is nothing to name. Blocked by something, it says how far it can go.$OLD$,
      $NEW$- "move dividers" — green numbers appear on every lane and sub-lane divider, with green ticks every 100 pixels down the lanes' name strips; then say "2 up 100 pixels", "1 down 2 tasks" or "1 up a bit", as often as you like, and "done". The surest way to move a divider: there is nothing to name. It goes straight through whatever is in the way (what ends up on the other side joins that lane) and stops only where a lane's name would no longer fit — wrapping a long name onto two lines first, to go further. The pool never changes size. Pausing is fine: "1" … "down 2 tasks" is one answer, and "1 down" … "50 pixels" makes it 50 in all.$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%Blocked by something, it says how far it can go.%'
  AND "bodyMarkdown" LIKE '%- "move dividers" — green numbers appear%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. new_rows should read 1, old_rows 0.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%wrapping a long name onto two lines first%') AS new_rows,
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%Blocked by something, it says how far it can go.%') AS old_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%wrapping a long name onto two lines first%') = 1
     AND (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%Blocked by something, it says how far it can go.%') = 0
    THEN 'OK — the guide says "move dividers" goes through the elements, wraps names, and shows the ticks'
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "move dividers" — green numbers appear%') = 0
    THEN 'CHECK — run patch-voice-assist-move-dividers.sql first, then this again'
    ELSE 'CHECK — see the counts above (the line may have been edited in the app; change it there by hand)'
  END AS verdict;
