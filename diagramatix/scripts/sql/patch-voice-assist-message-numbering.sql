-- Voice Assist — "add a message" numbers everything a message can start or end at.
--
-- Paul, 25 September 2026: "Should allow messages to Receive Intermediate
-- events as well e.g. message 2 arrives" — and: "Also messages should be
-- allowed FROM Intermediate and End events with trigger Send. Add Messages
-- should include them in the numbered list."
--
-- The numbered set is now the one message rule the mouse uses (canConnect.ts),
-- not a list of tasks, collapsed subprocesses and black-box pools. The live
-- User Guide chapter (seeded 2026-09-20, D1) still says the old list, so a
-- customer is told events can't be numbered when they can.
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale and would
-- discard anything edited in the app since. This file changes one line and
-- touches nothing else. (The seed carries the same new text, so a database
-- built from scratch and a database patched by this file say the same thing.)
--
-- IDEMPOTENT. The UPDATE acts only on a row that still has the old phrase,
-- so re-running it is a no-op.
--
-- It replaces the PHRASE its guard matches, not the whole line: had the rest
-- of the line been edited in the app, a whole-line replace() would find
-- nothing while the guard still matched, and the patch would quietly do
-- nothing. Replacing exactly what the guard found makes "guarded" mean
-- "changed". The result is the seed's line, word for word.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace(
      "bodyMarkdown",
      $OLD$numbers every task, collapsed subprocess and black-box pool$OLD$,
      $NEW$numbers everything a message can start or end at — tasks, subprocesses, black-box pools and events$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%numbers every task, collapsed subprocess and black-box pool%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. new_rows should read 1, old_rows 0.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%numbers everything a message can start or end at%') AS new_rows,
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%numbers every task, collapsed subprocess and black-box pool%') AS old_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%numbers everything a message can start or end at%') = 1
     AND (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%numbers every task, collapsed subprocess and black-box pool%') = 0
    THEN 'OK — the guide describes the new message numbering exactly once'
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"add a message"%') = 0
    THEN 'NOTHING TO PATCH — the Voice Assist guide chapter is not in this database; run seed-voice-assist-content.sql first'
    ELSE 'CHECK — see the counts above (the sentence may have been edited in the app; patch it there by hand)'
  END AS verdict;
