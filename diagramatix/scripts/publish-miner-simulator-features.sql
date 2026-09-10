-- Publish the Miner and Simulator feature rows to the public /features page.
--
-- WHY SQL RATHER THAN THE BUTTON. The admin screen's control is **Publish All**
-- (`POST /api/admin/features/publish`), which copies EVERY feature's draft
-- fields into its published mirror. There are 28 drafts in the catalog, and some
-- are deliberately held back — unreleased work that should not appear on a
-- public marketing page the moment somebody publishes something unrelated. So a
-- selective publish needs a statement rather than a click.
--
-- WHAT IT DOES, and it is exactly what the route does, column for column:
-- copies name / summary / details / hidden / sortOrder into the published*
-- mirror and stamps publishedAt. The public page reads the MIRROR, which is what
-- lets an admin edit a live feature's wording without it going out until they
-- say so.
--
-- SIX ROWS, not the four I first reported. The three from the Miner extensions
-- programme and the Simulator fidelity one are newly seeded — but
-- "Diagramatix Miner — Process Mining" and "Diagramatix Miner Examples" have
-- ALSO never been published, on the local catalog at least. They shipped as
-- features long ago and their rows have sat as drafts ever since, which is why
-- the Miner has no presence on /features at all.
--
-- Idempotent: re-running refreshes the published snapshot from the current
-- draft, which is the same thing the button does. Safe to run more than once,
-- and safe on a row that is already published.
--
--   psql "<prod connection string>" -f scripts/publish-miner-simulator-features.sql

BEGIN;

UPDATE "Feature" SET
  "publishedName"      = name,
  "publishedSummary"   = summary,
  "publishedDetails"   = details,
  "publishedHidden"    = hidden,
  "publishedSortOrder" = "sortOrder",
  "publishedAt"        = now()
WHERE name IN (
  -- The original Miner rows, never published.
  'Diagramatix Miner — Process Mining',
  'Diagramatix Miner Examples',
  -- The Miner extensions programme (phases 0–11).
  'Diagramatix Miner — the log you actually have',
  'Diagramatix Miner — the analyst''s workbench',
  'Diagramatix Miner — watch it, rather than visit it',
  -- The Simulator fidelity work.
  'Simulation that models what actually happens'
);

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
-- Every row below must show a publish date. A row that is MISSING entirely has
-- not been seeded on this database — run the matching add-features-*.ts script
-- first, or wait for the next deploy, which runs them all.
SELECT
  "sortOrder",
  name,
  CASE WHEN "publishedAt" IS NULL
       THEN 'DRAFT - not on /features'
       ELSE 'published ' || to_char("publishedAt", 'YYYY-MM-DD HH24:MI')
  END AS state
FROM "Feature"
WHERE name ILIKE '%miner%' OR name ILIKE '%mining%' OR name ILIKE '%Simulation that models%'
ORDER BY "sortOrder";

-- ── And what is still held back, so the decision is deliberate ───────────────
-- Everything else that would have gone public had someone pressed Publish All.
SELECT count(*) AS "drafts still unpublished" FROM "Feature" WHERE "publishedAt" IS NULL;
