-- AI Generate — the image is kept; "Free Form" is its name in the consoles.
--
-- Paul, 28 September 2026: "I need a way to view the image after the diagram
-- has been generated" and "When re-generating there is no way to check "Free
-- Form" for the regenerated diagram". The image is now kept with the diagram
-- (Diagram Properties → AI Prompt → View source image), Regenerate puts it back
-- on with Free Form as it was, and the consoles' checkbox is called "Free Form —
-- reproduce the image's layout" (it was "Reproduce original layout").
--
-- Three help texts name the old label; this rewrites that phrase in each and
-- adds one paragraph to the User Guide section, touching nothing else. The seed
-- scripts (scripts/add-*-import-competitor-bpmn.ts) carry the same text.
--
-- IDEMPOTENT. Each UPDATE acts only on a row that still has the old words, so
-- re-running it is a no-op. Needs no other patch first.
--
-- Run from the in-app Database tile (SuperAdmin → Database). Read-only report
-- at the end, AFTER the commit, so the numbers shown are what was kept.

BEGIN;

UPDATE "HelpSection"
SET "bodyMarkdown" = replace(replace("bodyMarkdown",
      $OLD$2. Leave **Reproduce original layout** ticked (it appears under the attached image).$OLD$, $NEW$2. Leave **Free Form — reproduce the image's layout** ticked (it appears under the attached image).$NEW$),
      $OLD$so the result is tidy rather than a jittery trace.$OLD$, $NEW$so the result is tidy rather than a jittery trace.

The image is kept with the diagram. **Diagram Properties → AI Prompt → View source image** shows it again, and **Regenerate** puts it back on — with **Free Form** ticked as it was — so the model sees the picture again rather than only the words.$NEW$),
    "updatedAt" = NOW()
WHERE collection = 'user-guide'
  AND "bodyMarkdown" LIKE '%Leave **Reproduce original layout** ticked%';

UPDATE "HelpSection"
SET "bodyMarkdown" = replace("bodyMarkdown", $OLD$(the PlanPanel "Reproduce original layout" toggle$OLD$, $NEW$(the PlanPanel "Free Form — reproduce the image's layout" toggle$NEW$),
    "updatedAt" = NOW()
WHERE collection = 'tech-design'
  AND "bodyMarkdown" LIKE '%(the PlanPanel "Reproduce original layout" toggle%';

UPDATE "Feature"
SET "details" = replace("details", $OLD$tick “Reproduce original layout”$OLD$, $NEW$tick “Free Form — reproduce the image's layout”$NEW$)
WHERE "details" LIKE '%tick “Reproduce original layout”%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit. The *_old columns should read 0.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND "bodyMarkdown" LIKE '%View source image%') AS guide_new,
  (SELECT count(*) FROM "HelpSection" WHERE "bodyMarkdown" LIKE '%Reproduce original layout%') AS help_old,
  (SELECT count(*) FROM "Feature" WHERE "details" LIKE '%Reproduce original layout%') AS feature_old,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" WHERE "bodyMarkdown" LIKE '%Reproduce original layout%') = 0
     AND (SELECT count(*) FROM "Feature" WHERE "details" LIKE '%Reproduce original layout%') = 0
    THEN 'OK — the help and the feature catalog say "Free Form", and the guide says where the image is'
    ELSE 'CHECK — a text above still has the old label; it may have been edited in the app — change it there by hand'
  END AS verdict;
