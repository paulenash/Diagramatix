-- ============================================================================
-- Remove every Data Store from the Process Repository's stored prompts.
--
-- Paul, 2026-08-29: "Data Stores, in general, are duplicating Black-box pools.
-- I think that we should not use them in generated diagrams."
--
-- The SQL equivalent of scripts/strip-data-stores.ts, for the environment that
-- holds the imported library. The .md in `new features/` was stripped in commit
-- 96693337; this brings the database copy in line so BOTH generation paths —
-- "The Process Repository" and "A .md file" — agree.
--
-- Both the DRAFT (prompt) and the PUBLISHED snapshot (publishedPrompt) are
-- updated, so no re-publish is needed afterwards. Updating only the draft would
-- leave every generation still asking for Data Stores until someone republished,
-- which is exactly the kind of half-applied change nobody notices.
--
-- WHAT IT MATCHES. A Data Store bullet is a fixed shape inside the "Data
-- objects" section, optionally wrapped over following indented lines:
--
--     Data Store "General Ledger" — written by "Post payment to general
--       ledger".
--
-- The 'n' flag makes ^ match at every line start; the (\n[ \t]+[^\n]*)* tail
-- takes the wrapped continuation lines. Data OBJECT bullets, which start at
-- column 0, end the match and are untouched.
--
-- HOW TO RUN. Take a backup first. Everything below is inside one transaction
-- and ends with ROLLBACK — read the verification output, and only then change
-- that last line to COMMIT and run it again.
--
--     psql "$PROD_DATABASE_URL" -f scripts/sql/strip-data-stores.sql
--
-- Tested against PostgreSQL 18.3.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Before ───────────────────────────────────────────────────────────────
SELECT 'BEFORE' AS stage,
       count(*)                                                        AS prompts_total,
       count(*) FILTER (WHERE "prompt"          ~* 'data\s*store')     AS drafts_with_store,
       count(*) FILTER (WHERE "publishedPrompt" ~* 'data\s*store')     AS published_with_store
FROM "ValueChainPrompt";

-- ── 2. Strip the bullets, then say "None." where the section is left empty ──
UPDATE "ValueChainPrompt" SET
  "prompt" = regexp_replace(
    regexp_replace(
      regexp_replace("prompt",
        '^[ \t]*[-*]?[ \t]*Data Stores?[^\n]*(\n[ \t]+[^\n]*)*\n?', '', 'gn'),
      -- an emptied section followed by the next numbered heading
      '(^[ \t]*[0-9]+\.[ \t]*Data objects[^\n]*\n)([ \t]*\n)*([ \t]*[0-9]+\.[ \t])',
      '\1' || 'None.' || chr(10) || chr(10) || '\3', 'gn'),
    -- an emptied section that is the last one in the prompt
    '(^[ \t]*[0-9]+\.[ \t]*Data objects[^\n]*\n)([ \t]*\n)*$',
    '\1' || 'None.' || chr(10), 'gn'),

  "publishedPrompt" = CASE WHEN "publishedPrompt" IS NULL THEN NULL ELSE regexp_replace(
    regexp_replace(
      regexp_replace("publishedPrompt",
        '^[ \t]*[-*]?[ \t]*Data Stores?[^\n]*(\n[ \t]+[^\n]*)*\n?', '', 'gn'),
      '(^[ \t]*[0-9]+\.[ \t]*Data objects[^\n]*\n)([ \t]*\n)*([ \t]*[0-9]+\.[ \t])',
      '\1' || 'None.' || chr(10) || chr(10) || '\3', 'gn'),
    '(^[ \t]*[0-9]+\.[ \t]*Data objects[^\n]*\n)([ \t]*\n)*$',
    '\1' || 'None.' || chr(10), 'gn') END
WHERE "prompt" ~* 'data\s*store'
   OR "publishedPrompt" ~* 'data\s*store';

-- ── 3. After — both counts must be 0 ────────────────────────────────────────
SELECT 'AFTER' AS stage,
       count(*)                                                        AS prompts_total,
       count(*) FILTER (WHERE "prompt"          ~* 'data\s*store')     AS drafts_with_store,
       count(*) FILTER (WHERE "publishedPrompt" ~* 'data\s*store')     AS published_with_store
FROM "ValueChainPrompt";

-- ── 4. Nothing else may have changed ────────────────────────────────────────
-- A Data Object bullet must survive; if this drops, the match was too greedy.
SELECT 'data objects kept' AS check,
       count(*) FILTER (WHERE "prompt" ~ 'Data Object') AS drafts_with_data_objects
FROM "ValueChainPrompt";

-- No prompt may have been emptied outright.
SELECT 'shortest prompt' AS check, min(length("prompt")) AS chars FROM "ValueChainPrompt";

-- Read the three results above. drafts_with_store and published_with_store must
-- both be 0, drafts_with_data_objects must still be a large number, and the
-- shortest prompt must still be a real prompt (thousands of characters).
-- Then change ROLLBACK to COMMIT and run this file again.
ROLLBACK;
-- COMMIT;
