-- AI Generate on a phone — "✎ Correct" and re-generate (mobile voice stage 3).
--
-- Paul, 28 September 2026: "Follow on with Stage 3". On a generated BPMN
-- diagram on the phone, the owner or an editor taps ✎ Correct, says or types
-- what is wrong ("the approval happens before payment") and re-generates. The
-- correction goes on the end of the prompt; the whole diagram, and its review
-- comments, are replaced; the previous version stays in the diagram's history.
--
-- Adds ONE paragraph to the User Guide section "Generating on your phone"
-- (chapter "AI Diagram Generation"), and changes its "Which diagrams" line,
-- which said phone generation works only on an empty diagram. Touches nothing else.
--
-- ORDER: run patch-ai-generate-on-phone.sql first (it creates that section),
-- then patch-ai-generate-phone-photo.sql, then this.
-- IDEMPOTENT: the UPDATE acts only on a section that does not yet mention
-- ✎ Correct, so re-running it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit.

BEGIN;

UPDATE "HelpSection" s
   SET "bodyMarkdown" = replace(s."bodyMarkdown",
         '**Which diagrams:** BPMN, and only while the diagram is empty.',
         '**Which diagrams:** BPMN. Generate fills an empty diagram; a generated one can be corrected and re-generated (below).')
       || $UG$

**Correct it and re-generate.** Looking at a generated diagram on the phone and something is wrong? Tap **✎ Correct**, then say or type what is wrong or missing — "the approval happens before payment". Tap **Re-generate**. Your correction is added to the end of the prompt the diagram was generated from, and the AI draws the whole process again; where the correction disagrees with anything before it — the original description or the photo — the correction wins. Corrections add up: a second one keeps the first, and a later re-generate on the desktop keeps them too. A diagram drawn from a photo is re-generated from the same photo. One drawn from an attached document, from an image that was not kept, or laid out as its image was drawn (Free Form) is re-generated on the desktop instead — the phone says so. **Before you tap Re-generate:** the whole diagram is replaced, and so are its review comments — the sheet says how many. The previous version stays in the diagram's history, so it can be restored on the desktop. If the diagram is changed anywhere while the AI is working, nothing is replaced and your correction is kept to try again.$UG$,
       "updatedAt" = NOW()
  FROM "HelpChapter" c
 WHERE c.id = s."chapterId"
   AND c.collection = 'user-guide' AND c.slug = 'ai-generate'
   AND s.heading = 'Generating on your phone'
   AND s."bodyMarkdown" NOT LIKE '%Correct it and re-generate%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. `with_correct` should read 1, `still_says_empty_only` 0.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
    WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone') AS sections,
  (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
    WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone'
      AND s."bodyMarkdown" LIKE '%Correct it and re-generate%') AS with_correct,
  (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
    WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone'
      AND s."bodyMarkdown" LIKE '%only while the diagram is empty%') AS still_says_empty_only,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
           WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone') = 0
    THEN 'CHECK — the "Generating on your phone" section is missing: run patch-ai-generate-on-phone.sql first, then patch-ai-generate-phone-photo.sql, then this'
    WHEN (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
           WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone'
             AND s."bodyMarkdown" LIKE '%Correct it and re-generate%') = 1
    THEN 'OK — the phone section explains ✎ Correct and re-generate'
    ELSE 'CHECK — expected exactly one section with the correction paragraph'
  END AS verdict;
