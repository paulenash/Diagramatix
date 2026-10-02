-- "Assist" -> "NL Assist" in the database-held User Guide, Technical Notes and Features text.
--
-- Paul, 2 October 2026: "Rename 'Assist' to 'NL Assist' and its associated tile, User Guide and Feature entries,
-- and any other references to it." The code (button, tile, registry label, messages) and the seed files are already
-- renamed; this file brings the LIVE rows into line without re-seeding (a re-seed would replace the chapters wholesale
-- and discard anything edited in the app since).
--
-- WHAT IT CHANGES, AND WHAT IT NEVER TOUCHES.
--   "Assist / NL Rules"  -> "NL Assist Rules"   (the old admin tile name — unambiguous, so applied everywhere)
--   "AI Assist"          -> "NL Assist"          (the old name of the same feature — applied everywhere)
--   "Assist" on its own  -> "NL Assist"          ONLY inside the two "ai-assist" chapters (User Guide and Technical
--                                                Notes), and in the Feature row for this feature.
--   Never: "Voice Assist", "NL Assist" (already done), "Assistant", or identifiers (AssistOp, applyAssistOps …).
--
-- WHY THE BARE "Assist" IS LIMITED TO THOSE CHAPTERS. Elsewhere a bare "Assist" could mean the Voice Assist bar
-- ("the Assist bar"), and renaming that would be wrong. The check at the end lists every other row that still has a
-- bare "Assist", for you to read.
--
-- IDEMPOTENT. After one run every remaining "Assist" is preceded by "Voice " or "NL ", so a second run changes nothing
-- (each UPDATE acts only on a row its own rename would change). Postgres regex: \m \M are word edges; (?<!x) is a
-- negative lookbehind.
--
-- The Feature rows' PUBLISHED fields are updated too, so the marketing page and dashboard show the new name at once
-- instead of waiting for the next Publish All.
--
-- Run from the in-app Database tile (SuperAdmin → Database). The report at the end runs AFTER the commit.

BEGIN;

-- The rename, as one expression: text -> text.
CREATE OR REPLACE FUNCTION pg_temp.nl_assist(t text) RETURNS text AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(t, 'Assist / NL Rules', 'NL Assist Rules', 'g'),
             '\mAI Assist\M', 'NL Assist', 'g'),
           '(?<!Voice )(?<!NL )\mAssist\M', 'NL Assist', 'g')
$$ LANGUAGE sql IMMUTABLE;

-- The two chapters (titles): "AI Assist & Voice Assist" -> "NL Assist & Voice Assist".
UPDATE "HelpChapter"
   SET title = pg_temp.nl_assist(title), "updatedAt" = NOW()
 WHERE slug = 'ai-assist' AND title <> pg_temp.nl_assist(title);

-- Their sections: heading and body.
UPDATE "HelpSection" s
   SET heading = pg_temp.nl_assist(s.heading),
       "bodyMarkdown" = pg_temp.nl_assist(s."bodyMarkdown"),
       "updatedAt" = NOW()
  FROM "HelpChapter" c
 WHERE c.id = s."chapterId" AND c.slug = 'ai-assist'
   AND (coalesce(s.heading, '') <> pg_temp.nl_assist(coalesce(s.heading, ''))
        OR s."bodyMarkdown" <> pg_temp.nl_assist(s."bodyMarkdown"));

-- The unambiguous old names, in any other chapter or section that mentions them.
UPDATE "HelpSection"
   SET heading = replace(replace(coalesce(heading, ''), 'Assist / NL Rules', 'NL Assist Rules'), 'AI Assist', 'NL Assist'),
       "bodyMarkdown" = replace(replace("bodyMarkdown", 'Assist / NL Rules', 'NL Assist Rules'), 'AI Assist', 'NL Assist'),
       "updatedAt" = NOW()
 WHERE "bodyMarkdown" LIKE '%Assist / NL Rules%' OR "bodyMarkdown" LIKE '%AI Assist%'
    OR coalesce(heading, '') LIKE '%Assist / NL Rules%' OR coalesce(heading, '') LIKE '%AI Assist%';

-- The Features catalog: the "AI Assist — Suggest as You Draw" row, draft and published.
UPDATE "Feature"
   SET name = pg_temp.nl_assist(name),
       summary = pg_temp.nl_assist(summary),
       details = pg_temp.nl_assist(details),
       "publishedName" = pg_temp.nl_assist("publishedName"),
       "publishedSummary" = pg_temp.nl_assist("publishedSummary"),
       "publishedDetails" = pg_temp.nl_assist("publishedDetails")
 WHERE name LIKE 'AI Assist%Suggest as You Draw' OR "publishedName" LIKE 'AI Assist%Suggest as You Draw';   -- % for the dash: a database that once took the file in the wrong encoding has it garbled

-- Any other feature row that names the old tile or the old feature name.
UPDATE "Feature"
   SET summary = replace(replace(summary, 'Assist / NL Rules', 'NL Assist Rules'), 'AI Assist', 'NL Assist'),
       details = replace(replace(details, 'Assist / NL Rules', 'NL Assist Rules'), 'AI Assist', 'NL Assist')
 WHERE summary LIKE '%Assist / NL Rules%' OR details LIKE '%Assist / NL Rules%'
    OR summary LIKE '%AI Assist%' OR details LIKE '%AI Assist%';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Report — run after the commit.
-- ════════════════════════════════════════════════════════════════════════

-- 1. The renamed chapter titles and the feature name — should read "NL Assist …".
SELECT 'chapter' AS kind, collection, title AS name FROM "HelpChapter" WHERE slug = 'ai-assist'
UNION ALL
SELECT 'feature', 'features', name FROM "Feature" WHERE name LIKE '%Assist%' ORDER BY 1, 2;

-- 2. What still says a bare "Assist" (not Voice Assist, not NL Assist). Read these: each is either a place that
--    means the Voice Assist bar (leave it) or one the rename did not reach (edit it in the app).
SELECT s.collection, c.title AS chapter, s.heading
  FROM "HelpSection" s JOIN "HelpChapter" c ON c.id = s."chapterId"
 WHERE s."bodyMarkdown" ~ '(?<!Voice )(?<!NL )\mAssist\M'
    OR coalesce(s.heading, '') ~ '(?<!Voice )(?<!NL )\mAssist\M'
 ORDER BY s.collection, c.title, s."sortOrder";
