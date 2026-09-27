-- Voice Assist — document "insert … between … and …" in the User Guide.
--
-- Paul, 27 September 2026: "I want to insert a Task (Task C) after an existing
-- task (Task A) that is connected to another Task (Task B) … inserted into the
-- connector from Task A, if there is room, if not, it should move everything
-- in Task A's Pool or Lane to the right … If there is no existing connector
-- between Task A and Task B then insert the new task and connect Task A to
-- Task C, and Task C to Task B." The command exists now (insertBetween); the
-- live User Guide chapter does not mention it.
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale and would
-- discard anything edited in the app since. This file adds one line and
-- touches nothing else. (The seed carries the same line, so a database built
-- from scratch and a database patched by this file say the same thing.)
--
-- IT REPLACES THE PHRASE, NOT THE LINE: the anchor is the add line, and the
-- new line goes straight after it; whatever follows is left exactly as it is.
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
      $OLD$- "add a task called Approve after Review" · "add a decision" · "insert a parallel gateway"$OLD$,
      $NEW$- "add a task called Approve after Review" · "add a decision" · "insert a parallel gateway"
- "insert a task called Check Stock between Receive Order and Pick Items" — goes into the flow between them. With no room, everything after the first step in its pool moves right. Two steps that were not connected are joined through it.$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%- "add a task called Approve after Review" · "add a decision" · "insert a parallel gateway"%'
  AND "bodyMarkdown" NOT LIKE '%"insert a task called Check Stock between Receive Order and Pick Items"%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. new_rows should read 1.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"insert a task called Check Stock between Receive Order and Pick Items"%') AS new_rows,
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%- "add a task called Approve after Review" · "add a decision" · "insert a parallel gateway"%') AS anchor_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"insert a task called Check Stock between Receive Order and Pick Items"%') = 1
    THEN 'OK — the guide lists the insert-between command exactly once'
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%add a task called Approve after Review%') = 0
    THEN 'NOTHING TO PATCH — the Voice Assist guide chapter is not in this database; run seed-voice-assist-content.sql first'
    ELSE 'CHECK — see the counts above (the add line may have been edited in the app; add the insert line there by hand)'
  END AS verdict;
