-- AI Generate on a phone — photograph a whiteboard (mobile voice stage 2).
--
-- Paul, 28 September 2026: "Then onto Stage 2 - Photograph a whiteboard". On an
-- empty BPMN diagram on the phone, a photo of a whiteboard, flip chart or paper
-- sketch generates the diagram; the person's spoken or typed words correct the
-- photo and win over it; the photo is kept with the diagram.
--
-- Adds ONE paragraph to the User Guide section "Generating on your phone"
-- (chapter "AI Diagram Generation"). Touches nothing else.
--
-- ORDER: run patch-ai-generate-on-phone.sql first (it creates that section).
-- IDEMPOTENT: the UPDATE acts only on a section that does not yet mention the
-- photo, so re-running it is a no-op.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit.

BEGIN;

UPDATE "HelpSection" s
   SET "bodyMarkdown" = s."bodyMarkdown" || $UG$

**Photograph a whiteboard.** Instead of describing the process, tap **📷 Photograph a whiteboard** on the empty diagram (or **Take photo** / **Choose photo** in the Generate sheet) and photograph the whiteboard, flip chart or paper sketch. The photo is prepared on the phone — made the right size for the AI and stripped of its location data — and kept with the diagram. Then say or type anything the photo gets wrong or leaves out: **your words win over the photo** ("the approval happens before payment"). Tap **Generate**. The diagram is laid out normally, not as a copy of where things sat on the board. Afterwards **📷** at the top of the diagram on the phone — or **Diagram Properties → AI Prompt → View source image** on the desktop — shows the photo it was drawn from.$UG$,
       "updatedAt" = NOW()
  FROM "HelpChapter" c
 WHERE c.id = s."chapterId"
   AND c.collection = 'user-guide' AND c.slug = 'ai-generate'
   AND s.heading = 'Generating on your phone'
   AND s."bodyMarkdown" NOT LIKE '%Photograph a whiteboard%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. `with_photo` should read 1.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
    WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone') AS sections,
  (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
    WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone'
      AND s."bodyMarkdown" LIKE '%Photograph a whiteboard%') AS with_photo,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
           WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone') = 0
    THEN 'CHECK — the "Generating on your phone" section is missing: run patch-ai-generate-on-phone.sql first, then this'
    WHEN (SELECT count(*) FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
           WHERE c.collection = 'user-guide' AND c.slug = 'ai-generate' AND s.heading = 'Generating on your phone'
             AND s."bodyMarkdown" LIKE '%Photograph a whiteboard%') = 1
    THEN 'OK — the phone section explains photographing a whiteboard'
    ELSE 'CHECK — expected exactly one section with the photo paragraph'
  END AS verdict;
