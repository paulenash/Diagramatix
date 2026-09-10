-- Retire the codename in DB-backed CONTENT: "DiagramatixMINER" → "Diagramatix Miner".
--
-- The code rename (commit ad8d0b82) covered 133 occurrences in the tree. It could
-- not touch the copy that lives in the database — the Feature catalog, the User
-- Guide, the Technical Design Notes and the example catalog — because the seed
-- scripts that put it there are IDEMPOTENT BY NAME and skip rows that already
-- exist. So the source says "Diagramatix Miner" and the running product does not.
--
-- WHY THIS MATTERS MORE THAN A TYPO. The seed scripts match a Feature row by its
-- `name` and a User Guide section by its `heading`. Both of those keys carry the
-- codename in the database and no longer carry it in the scripts, so the next
-- deploy would find nothing to update and INSERT DUPLICATES — five duplicate
-- catalog rows and one duplicate guide section. Running this closes that.
-- (The scripts were also made self-healing in the same commit, so the duplicate
-- cannot happen even if this is never run; this is the immediate fix, that is
-- the belt.)
--
-- BOTH HALVES OF A FEATURE ROW. `Feature` keeps a draft (`name`/`summary`/
-- `details`) and a PUBLISHED SNAPSHOT (`publishedName`/…). The public /features
-- page reads the snapshot, so renaming only the draft would leave the old name
-- on the one page customers actually see.
--
-- Idempotent: `replace()` on text that no longer contains the codename is a
-- no-op, so re-running changes nothing. Safe to run more than once.
--
--   psql "<prod connection string>" -f scripts/rename-miner-codename.sql
--
-- Or paste into any SQL client connected to the production database.

BEGIN;

-- ── The Feature catalog — drafts AND the published snapshot ─────────────────
UPDATE "Feature" SET
  name               = replace(name,               'DiagramatixMINER', 'Diagramatix Miner'),
  summary            = replace(summary,            'DiagramatixMINER', 'Diagramatix Miner'),
  details            = replace(details,            'DiagramatixMINER', 'Diagramatix Miner'),
  "publishedName"    = replace("publishedName",    'DiagramatixMINER', 'Diagramatix Miner'),
  "publishedSummary" = replace("publishedSummary", 'DiagramatixMINER', 'Diagramatix Miner'),
  "publishedDetails" = replace("publishedDetails", 'DiagramatixMINER', 'Diagramatix Miner')
WHERE name               LIKE '%DiagramatixMINER%'
   OR summary            LIKE '%DiagramatixMINER%'
   OR details            LIKE '%DiagramatixMINER%'
   OR "publishedName"    LIKE '%DiagramatixMINER%'
   OR "publishedSummary" LIKE '%DiagramatixMINER%'
   OR "publishedDetails" LIKE '%DiagramatixMINER%';

-- ── User Guide + Technical Design Notes — chapter titles ────────────────────
UPDATE "HelpChapter" SET
  title = replace(title, 'DiagramatixMINER', 'Diagramatix Miner')
WHERE title LIKE '%DiagramatixMINER%';

-- ── User Guide + Technical Design Notes — section headings and bodies ───────
UPDATE "HelpSection" SET
  heading        = replace(heading,        'DiagramatixMINER', 'Diagramatix Miner'),
  "bodyMarkdown" = replace("bodyMarkdown", 'DiagramatixMINER', 'Diagramatix Miner')
WHERE heading        LIKE '%DiagramatixMINER%'
   OR "bodyMarkdown" LIKE '%DiagramatixMINER%';

-- ── The example catalog ─────────────────────────────────────────────────────
-- This one also self-heals: the mining-example seed upserts by SLUG, which did
-- not change, so a deploy refreshes it anyway. Included so one run leaves
-- nothing behind.
UPDATE "MiningExample" SET
  title       = replace(title,       'DiagramatixMINER', 'Diagramatix Miner'),
  concept     = replace(concept,     'DiagramatixMINER', 'Diagramatix Miner'),
  description = replace(description, 'DiagramatixMINER', 'Diagramatix Miner')
WHERE title       LIKE '%DiagramatixMINER%'
   OR concept     LIKE '%DiagramatixMINER%'
   OR description LIKE '%DiagramatixMINER%';

COMMIT;

-- ── Verification — every count must be 0 ────────────────────────────────────
SELECT 'Feature'       AS table, count(*) AS remaining FROM "Feature"
  WHERE name LIKE '%DiagramatixMINER%' OR summary LIKE '%DiagramatixMINER%' OR details LIKE '%DiagramatixMINER%'
     OR "publishedName" LIKE '%DiagramatixMINER%' OR "publishedSummary" LIKE '%DiagramatixMINER%' OR "publishedDetails" LIKE '%DiagramatixMINER%'
UNION ALL
SELECT 'HelpChapter', count(*) FROM "HelpChapter" WHERE title LIKE '%DiagramatixMINER%'
UNION ALL
SELECT 'HelpSection', count(*) FROM "HelpSection" WHERE heading LIKE '%DiagramatixMINER%' OR "bodyMarkdown" LIKE '%DiagramatixMINER%'
UNION ALL
SELECT 'MiningExample', count(*) FROM "MiningExample"
  WHERE title LIKE '%DiagramatixMINER%' OR concept LIKE '%DiagramatixMINER%' OR description LIKE '%DiagramatixMINER%';

-- ── Optional: which Miner features are actually published? ──────────────────
-- `publishedAt IS NULL` means the row exists in the catalog and does NOT appear
-- on /features. The seed scripts never auto-publish marketing copy, so a newly
-- seeded feature sits as a draft until a SuperAdmin publishes it.
SELECT
  "sortOrder",
  name,
  CASE WHEN "publishedAt" IS NULL
       THEN 'DRAFT - not on /features'
       ELSE 'published ' || to_char("publishedAt", 'YYYY-MM-DD')
  END AS state
FROM "Feature"
WHERE name ILIKE '%miner%' OR name ILIKE '%mining%'
ORDER BY "sortOrder";
