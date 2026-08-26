-- Clear `Project."exampleType"` on projects that are not actually adopted
-- catalog examples.  The SQL twin of `scripts/clear-stale-example-flags.ts`,
-- for when it is easier to reach the database with psql than with Node.
--
-- WHAT THE FLAG MEANS.  `exampleType` means "created by adopting a ready-made
-- example".  It tints the project tile green AND blocks sharing and publishing
-- until the project is renamed.  A project carrying it wrongly is therefore not
-- a cosmetic problem — it cannot be shared.
--
-- WHICH ROWS ARE WRONG.  A genuine adoption also carries `sourceExampleId`,
-- pointing at the example it came from.  The fingerprint of a bad flag is
-- therefore `exampleType` set with `sourceExampleId` NULL, and that is the only
-- thing touched below.  A project still linked to a live catalog example is
-- left completely alone.
--
-- HOW THEY GOT THAT WAY.  Two routes, both now fixed at source:
--   1. `/api/simulation/import` shared its code with catalog adoption and
--      hardcoded `exampleType: 'simulation'`, so a bundle you imported yourself
--      was flagged as an example you could never find in the Examples list.
--   2. The Azure deploy ran `scripts/backfill-example-types.ts` on EVERY push,
--      re-flagging projects whose flag had been deliberately cleared (removed
--      in 2b9f1fe3).  That is why the flags came back twice.
--
-- Nothing else in the schema carries `exampleType`, so this one table is the
-- whole repair.
--
--   psql "<prod connection string>" -f scripts/clear-stale-example-flags.sql
--
-- Identifiers are double-quoted throughout: Prisma creates them in camelCase,
-- and unquoted Postgres would fold them to lowercase and not find them.

\echo '== Genuine adoptions — these are NOT touched =='
SELECT count(*) AS genuine_adoptions
FROM "Project"
WHERE "exampleType" IS NOT NULL
  AND "sourceExampleId" IS NOT NULL;

\echo ''
\echo '== Stale flags — these are what will be cleared =='
SELECT "id", "name", "exampleType", "createdAt"::date AS created
FROM "Project"
WHERE "exampleType" IS NOT NULL
  AND "sourceExampleId" IS NULL
ORDER BY "createdAt";

-- Read the list above before going further.  Everything from here is written
-- inside one transaction, and `RETURNING` prints exactly what changed, so the
-- output is the record of what was done rather than a promise about it.
BEGIN;

UPDATE "Project"
SET "exampleType" = NULL
WHERE "exampleType" IS NOT NULL
  AND "sourceExampleId" IS NULL
RETURNING "id", "name";

-- Swap to ROLLBACK to rehearse this without writing anything.
COMMIT;

\echo ''
\echo '== After: any flag left should have a source =='
SELECT count(*) FILTER (WHERE "sourceExampleId" IS NOT NULL) AS genuine,
       count(*) FILTER (WHERE "sourceExampleId" IS NULL)     AS stale_remaining
FROM "Project"
WHERE "exampleType" IS NOT NULL;
