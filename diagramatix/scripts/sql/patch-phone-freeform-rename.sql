-- AI Generate on a phone — Free Form from a photo, and renaming on the phone.
--
-- Paul, 29 September 2026: "1. Add ability to do Free Form diagrams from image
-- if the user desires. 2. Add ability to edit the Project or Diagram names."
--
-- Changes the User Guide section "Generating on your phone" (chapter "AI
-- Diagram Generation"):
--   • the photo paragraph said a photo is always laid out normally — it now
--     offers Free Form;
--   • the correction paragraph said a Free Form diagram is re-generated on the
--     desktop — the phone now keeps (or drops) the drawn layout itself;
--   • ONE new paragraph: renaming on the phone.
-- Touches nothing else.
--
-- ORDER: after patch-ai-generate-on-phone.sql, patch-ai-generate-phone-photo.sql
-- and patch-ai-generate-phone-correct.sql (all three run on prod 2026-09-29).
-- IDEMPOTENT: the UPDATE acts only on a section that does not yet explain
-- renaming on the phone, so re-running it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit.

BEGIN;

UPDATE "HelpSection" s
   SET "bodyMarkdown" = replace(replace(s."bodyMarkdown",
         'The diagram is laid out normally, not as a copy of where things sat on the board.',
         'The diagram is laid out normally — or tick **Free Form** to keep the layout as it was drawn on the board.'),
         'One drawn from an attached document, from an image that was not kept, or laid out as its image was drawn (Free Form) is re-generated on the desktop instead — the phone says so.',
         'One drawn from an attached document or from an image that was not kept is re-generated on the desktop instead — the phone says so. For one drawn from a photo or an image, **Free Form** in the sheet keeps the drawn layout; it starts ticked when the diagram was laid out that way.')
       || $UG$

**Rename on the phone.** Tap a diagram's name at the top of its screen to rename it (its owner and editors can). On a project's page, **✎** beside the project's name renames the project (its owner can), and **✎** beside a diagram renames that diagram.$UG$,
       "updatedAt" = NOW()
  FROM "HelpChapter" c
 WHERE c.id = s."chapterId"
   AND c.collection = 'user-guide' AND c.slug = 'ai-generate'
   AND s.heading = 'Generating on your phone'
   AND s."bodyMarkdown" NOT LIKE '%Rename on the phone%'
   -- Only the wording the two earlier patches wrote: a section edited since is
   -- left alone and reported as CHECK, never half-patched.
   AND s."bodyMarkdown" LIKE '%not as a copy of where things sat on the board.%'
   AND s."bodyMarkdown" LIKE '%laid out as its image was drawn (Free Form) is re-generated on the desktop instead — the phone says so.%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. with_rename 1, offers_free_form 1,
-- correct_free_form 1, old_lines 0.
-- ════════════════════════════════════════════════════════════════════════════
WITH phone AS (
  SELECT s."bodyMarkdown" AS b
    FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
   WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone'
)
SELECT
  (SELECT count(*) FROM phone) AS sections,
  (SELECT count(*) FROM phone WHERE b LIKE '%Rename on the phone%') AS with_rename,
  (SELECT count(*) FROM phone WHERE b LIKE '%tick **Free Form** to keep the layout%') AS offers_free_form,
  (SELECT count(*) FROM phone WHERE b LIKE '%**Free Form** in the sheet keeps the drawn layout%') AS correct_free_form,
  (SELECT count(*) FROM phone WHERE b LIKE '%not as a copy of where things sat on the board%'
                                 OR b LIKE '%laid out as its image was drawn (Free Form) is re-generated on the desktop%') AS old_lines,
  CASE
    WHEN (SELECT count(*) FROM phone) = 0
    THEN 'CHECK — the "Generating on your phone" section is missing: run the three earlier phone patches first'
    WHEN (SELECT count(*) FROM phone WHERE b LIKE '%Rename on the phone%') = 1
     AND (SELECT count(*) FROM phone WHERE b LIKE '%tick **Free Form** to keep the layout%') = 1
     AND (SELECT count(*) FROM phone WHERE b LIKE '%**Free Form** in the sheet keeps the drawn layout%') = 1
     AND (SELECT count(*) FROM phone WHERE b LIKE '%not as a copy of where things sat on the board%'
                                        OR b LIKE '%laid out as its image was drawn (Free Form) is re-generated on the desktop%') = 0
    THEN 'OK — the phone section offers Free Form and explains renaming'
    ELSE 'CHECK — the section was not patched as expected (edited since the earlier patches?): expected the rename paragraph, both Free Form lines, and no old wording'
  END AS verdict;
