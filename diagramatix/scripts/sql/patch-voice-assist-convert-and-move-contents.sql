-- Voice Assist — document "convert … to a subprocess / task" and "move
-- everything in …" in the User Guide.
--
-- Paul, 27 September 2026: "New Commands: a) Convert {selected,<task_name>} to
-- a Subprocess b) Convert {selected,<subprocess_name>} to a Task c) Move
-- everything in <{pool_name>,<lane_name>, <sublane_name>} {<n> steps, <m>
-- pixels} to the {right, left}". The commands exist now (convertActivity,
-- moveContents); the live User Guide chapter does not mention them.
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED.
-- `seed-voice-assist-content.sql` REPLACES both chapters wholesale and would
-- discard anything edited in the app since. This file adds two lines and
-- touches nothing else. (The seed carries the same lines, in the same places.)
--
-- ANCHORS. The move line goes after the compress-lane line — added by
-- patch-voice-assist-lane-compress-expand.sql (run 2026-09-27), so its exact
-- text is known. The convert line goes after the "rename the gateway" line in
-- Edit and tidy. Each replace() swaps the anchor for itself plus the new line,
-- so whatever follows is left exactly as it is.
--
-- IDEMPOTENT. Each UPDATE acts only on a row that has its anchor and does not
-- yet have its new line, so re-running it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace(
      "bodyMarkdown",
      $OLD$- "compress the Sales lane" · "expand lane Picking by 100" — a lane fits to its content: its top stays and the lanes below close up. Expand adds one Task row at the bottom, or the number you say.$OLD$,
      $NEW$- "compress the Sales lane" · "expand lane Picking by 100" — a lane fits to its content: its top stays and the lanes below close up. Expand adds one Task row at the bottom, or the number you say.
- "move everything in Sales two steps to the right" · "move everything in Picking 50 pixels to the left" — the contents of a pool, lane or sub-lane move, not the container (a step is 100 px). Moving right widens the pools when it needs to; nothing moves into a header.$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%"compress the Sales lane" · "expand lane Picking by 100"%'
  AND "bodyMarkdown" NOT LIKE '%"move everything in Sales two steps to the right"%';

UPDATE "HelpSection"
SET "bodyMarkdown" = replace(
      "bodyMarkdown",
      $OLD$- "rename the gateway to Approved?" · "nudge Approve right" · "move these up"$OLD$,
      $NEW$- "rename the gateway to Approved?" · "nudge Approve right" · "move these up"
- "convert Review to a subprocess" · "convert selected to a task" — the right-click menu's convert. A task's marker, or a subprocess's link to its sub-diagram, does not survive the change.$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%- "rename the gateway to Approved?" · "nudge Approve right" · "move these up"%'
  AND "bodyMarkdown" NOT LIKE '%"convert Review to a subprocess" · "convert selected to a task"%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. Both counts should read 1.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"move everything in Sales two steps to the right"%') AS move_rows,
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"convert Review to a subprocess" · "convert selected to a task"%') AS convert_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"move everything in Sales two steps to the right"%') = 1
     AND (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%"convert Review to a subprocess" · "convert selected to a task"%') = 1
    THEN 'OK — the guide lists both new commands exactly once'
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%compress the Sales lane%') = 0
    THEN 'CHECK — the compress-lane line is missing: run patch-voice-assist-lane-compress-expand.sql first, then this again'
    ELSE 'CHECK — see the counts above (an anchor line may have been edited in the app; add the missing line there by hand)'
  END AS verdict;
