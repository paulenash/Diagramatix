-- Voice Assist — the template window scrolls; "delete event"; "insert" goes into the flow.
--
-- Paul, 28 September 2026: "New commands when Templates are displayed: scroll
-- {down, up, to top, to bottom}" · "Include ALL events in "delete event" or
-- "delete events" for coverage." · "If a connector is selected and "insert
-- task" then the new task should be added into the connector." · ""insert a
-- Task after selected" … should also insert into the outgoing connector on the
-- selected element, if there is one." And the compaction that no longer
-- deletes anything else (the straddle sweep).
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale and would
-- discard anything edited in the app since. This file changes three lines and
-- adds one, and touches nothing else. (The seed carries the same lines.)
--
-- ORDER. The insert line comes from patch-voice-assist-insert-between.sql
-- (already run). This file needs nothing newer, and runs on its own.
--
-- IDEMPOTENT. Each UPDATE acts only on a row that still has its old line and
-- not yet the new one, so re-running it is a no-op.
--
-- REVISED the same day (Paul: "add … after" goes into the outgoing connector
-- too). If the first version of this file was already run, run this one as
-- well: the second UPDATE turns that version's sentence into this one's.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace("bodyMarkdown", $OLD$- "insert a task called Check Stock between Receive Order and Pick Items" — goes into the flow between them. With no room, everything after the first step in its pool moves right. Two steps that were not connected are joined through it.$OLD$, $NEW$- "insert a task called Check Stock between Receive Order and Pick Items" — goes into the flow between them. With no room, everything after the first step in its pool moves right. Two steps that were not connected are joined through it. With a connector selected, "insert a task" goes into that connector; "add a task after Receive Order" (or "insert …") goes into Receive Order's outgoing flow, when it has just one.$NEW$),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%Two steps that were not connected are joined through it.%'
  AND "bodyMarkdown" NOT LIKE '%With a connector selected, "insert a task" goes into that connector%';

UPDATE "HelpSection"
SET "bodyMarkdown" = replace("bodyMarkdown", $OLD$With a connector selected, "insert a task" goes into that connector; "insert a task after Receive Order" goes into Receive Order's outgoing flow, when it has just one.$OLD$, $NEW$With a connector selected, "insert a task" goes into that connector; "add a task after Receive Order" (or "insert …") goes into Receive Order's outgoing flow, when it has just one.$NEW$),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%"insert a task after Receive Order" goes into Receive Order''s outgoing flow%';

UPDATE "HelpSection"
SET "bodyMarkdown" = replace("bodyMarkdown", $OLD$- "add a boundary event called Cancel to the Repeat-Until subprocess"$OLD$, $NEW$- "add a boundary event called Cancel to the Repeat-Until subprocess"
- "add template" · "add template after Review" — the numbered template window: say a number and it goes on the diagram. "scroll down", "scroll up", "scroll to the top" and "scroll to the bottom" move through the window; "cancel" closes it.$NEW$),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%- "add a boundary event called Cancel to the Repeat-Until subprocess"%'
  AND "bodyMarkdown" NOT LIKE '%"scroll down", "scroll up", "scroll to the top"%';

UPDATE "HelpSection"
SET "bodyMarkdown" = replace("bodyMarkdown", $OLD$- "delete Prepare and compact" · "clear the diagram" · "export the diagram to JSON"$OLD$, $NEW$- "delete Prepare and compact" · "delete event" · "clear the diagram" · "export the diagram to JSON" — "delete event" (or "events") numbers every event to choose from. Compacting never deletes or overlaps anything else: if it would, the gap stays and it says why.$NEW$),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%- "delete Prepare and compact" · "clear the diagram"%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. Each column should read 1.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"add a task after Receive Order" (or "insert …") goes into%') AS insert_line,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"scroll down", "scroll up", "scroll to the top"%') AS template_line,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"delete event" (or "events") numbers every event%') AS delete_line,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"add a task after Receive Order" (or "insert …") goes into%') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"scroll down", "scroll up", "scroll to the top"%') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"delete event" (or "events") numbers every event%') = 1
    THEN 'OK — the guide has template scrolling, "delete event", and "insert" into a connector'
    ELSE 'CHECK — a column above is 0: that line may have been edited in the app; change it there by hand'
  END AS verdict;
