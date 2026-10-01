-- Voice Assist — document Voice Assist Help, "rename to …" and the mis-hear repair in the User Guide.
--
-- Paul, 1 October 2026: the next-words help (a panel in the editor, a strip on the phone), "rename to
-- <name>" renaming this one, and position-aware repair of mis-heard words (switchable by the SuperAdmin
-- in the Voice Assist Help tile). The live User Guide chapter says nothing about them.
--
-- WHY A SEPARATE FILE, AND NOT A RE-RUN OF THE SEED. `seed-voice-assist-content.sql` REPLACES both chapters
-- wholesale and would discard anything edited in the app since. This file adds three bullets and touches nothing
-- else. (The seed carries the same bullets, so a database built from scratch and a database patched by this file
-- say the same thing.)
--
-- IT INSERTS AFTER the lane compress/expand bullet (patch-voice-assist-lane-compress-expand.sql, already run on
-- prod), leaving that bullet and everything else exactly as it is.
--
-- IDEMPOTENT. The UPDATE acts only on a row that has the anchor and does not yet have the new text, so re-running
-- it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace(
      "bodyMarkdown",
      $OLD$- "compress the Sales lane" · "expand lane Picking by 100" — a lane fits to its content: its top stays and the lanes below close up. Expand adds one Task row at the bottom, or the number you say.$OLD$,
      $NEW$- "compress the Sales lane" · "expand lane Picking by 100" — a lane fits to its content: its top stays and the lanes below close up. Expand adds one Task row at the bottom, or the number you say.
- "rename to Pay Claim" — no target said, so it renames THIS one: the selected element, else the one under the cursor.
- **Voice Assist Help** — while Voice Assist is on, a small panel (a "Help: on" button in the Voice Assist bar shows or hides it; on the phone it is a strip above the microphone) lists what you can say NEXT, word by word: first the first words of every command, then the words that can follow the ones you have said. Names appear as `existing_element_name`, `existing_label_name`, `new_element_name` and `new_label_name`; optional words are in [square brackets]. It also shows what "this" would act on right now.
- **Mis-heard words** — when a spoken command is not understood, a word that sounds like exactly one word the command could have had ("mood" for "move", "to" for "two" where a number is due) is repaired, and the log line shows what was read as what. A command that already works is never changed.$NEW$
    ),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%expand lane Picking by 100" — a lane fits to its content%'
  AND "bodyMarkdown" NOT LIKE '%**Voice Assist Help**%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. new_rows should read 1.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%**Voice Assist Help**%') AS new_rows,
  (SELECT count(*) FROM "HelpSection"
    WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%expand lane Picking by 100" — a lane fits to its content%') AS anchor_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%**Voice Assist Help**%') = 1
    THEN 'OK — the guide describes Voice Assist Help exactly once'
    WHEN (SELECT count(*) FROM "HelpSection"
           WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%expand lane Picking by 100%') = 0
    THEN 'NOTHING TO PATCH — the lane bullet is not in this database; run patch-voice-assist-lane-compress-expand.sql first (or add the three bullets in the app by hand)'
    ELSE 'CHECK — see the counts above (the guide may have been edited in the app; add the bullets there by hand)'
  END AS verdict;
