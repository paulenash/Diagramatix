-- ────────────────────────────────────────────────────────────────────────────
-- Simulator example LEVELS — prod catalog update (2026-09-08)
--
-- Re-levelling only. The `package` blobs, titles, concepts, descriptions,
-- sortOrder and published flags are all UNCHANGED by this release, so this
-- deliberately touches ONE column and nothing else. Do NOT run
-- scripts/seed-simulation-examples.ts against prod to achieve this: that upserts
-- every column including the whole package JSON, which would overwrite any
-- admin edit made in the UI since the last seed.
--
--   loan-origination               core     -> intro
--   car-repair-rework-loop         advanced -> core
--   aardwolf-loan-comparison       advanced -> core
--   sales-marketing-drill-through  advanced -> core
--
-- 'advanced' is left with no rows on purpose: it is now reserved for the
-- Hire & Onboard capstone (audit/Example-Hire-and-Onboard-Plan.md).
--
-- SAFE TO RE-RUN. Each update is guarded on the CURRENT value as well as the
-- slug, so a second run changes 0 rows, and a level an admin has since changed
-- by hand is left alone rather than stamped over.
--
-- Run against dgx-prod-pg / the prod DATABASE_URL. Read the two SELECTs.
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Before ──────────────────────────────────────────────────────────────────
SELECT slug, difficulty, published, "sortOrder"
FROM   "SimulationExample"
ORDER  BY "sortOrder", slug;

-- ── The change ──────────────────────────────────────────────────────────────
-- `updatedAt` is Prisma-managed (@updatedAt) and is NOT set automatically by
-- raw SQL, so it is set explicitly — otherwise the row would silently claim it
-- had not been touched.
UPDATE "SimulationExample" AS e
SET    difficulty  = v.want,
       "updatedAt" = NOW()
FROM  (VALUES
         ('loan-origination',              'core',     'intro'),
         ('car-repair-rework-loop',        'advanced', 'core'),
         ('aardwolf-loan-comparison',      'advanced', 'core'),
         ('sales-marketing-drill-through', 'advanced', 'core')
      ) AS v(slug, expect, want)
WHERE  e.slug       = v.slug
  AND  e.difficulty = v.expect;   -- guard: only move a row that is where we think it is

-- Expect: UPDATE 4 on the first run, UPDATE 0 on any re-run.
-- Anything between 1 and 3 means a row was NOT where this script expected it —
-- STOP, read the "after" SELECT, and work out which one before committing.

-- ── After ───────────────────────────────────────────────────────────────────
SELECT slug, difficulty, published, "sortOrder", "updatedAt"
FROM   "SimulationExample"
ORDER  BY "sortOrder", slug;

-- Expected final state:
--   10  simple-process                 intro
--   20  loan-origination               intro
--   30  car-repair-rework-loop         core
--   40  aardwolf-loan-comparison       core
--   50  sales-marketing-drill-through  core

COMMIT;
-- ROLLBACK;   -- swap for COMMIT above if the counts do not match
