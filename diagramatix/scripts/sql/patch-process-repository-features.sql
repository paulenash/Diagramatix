-- Process Repository as two features in Feature Availability — Restricted and Complete.
--
-- Paul, 8 October 2026: "Process Repository - Restricted (only Order to Cash, value chain is available, all the rest are disabled), and,
-- Process Repository - Complete (all Value Chains available). Restricted will be available to Free (but only the Value Chain V01, Process V01.01,
-- and Process V01.02) and for Introductory (all of Value Chain V01). Complete will be available to subscription levels Professional, Expert and
-- Enterprise."
--
--   process-repository-restricted   Free: Available   Introductory: Available   Professional / Expert / Enterprise: Hidden (Complete covers them)
--   process-repository-complete     Free / Introductory: Hidden               Professional / Expert / Enterprise: Available
--
-- The per-level CONTENT limits (Free: the V01 Value Chain diagram and V01.01 / V01.02 only) are in code (repositoryAccess.ts), not in this grid.
-- An unconfigured cell fails OPEN in Feature Availability, so until this runs both features read as Available for every level: run it right after
-- the deploy that ships the feature.
--
-- ONE statement, so the result row can say what happened:
--   ALREADY APPLIED  — all ten cells already held these states; nothing changed.
--   APPLIED NOW      — N cell(s) were added or changed to these states.
--   NOT APPLIED      — a subscription level is missing (the result says which).
-- Safe to run any number of times. NOTE: it sets these ten cells to the states above, so a cell you later change in the Feature Availability grid
-- is put back if you run this again. Touches only "FeatureAvailability". Run from the in-app Database tile (SuperAdmin → Database).

WITH desired(lid, fkey, st) AS (
  VALUES
    ('free',         'process-repository-restricted', 'available'),
    ('introductory', 'process-repository-restricted', 'available'),
    ('professional', 'process-repository-restricted', 'hidden'),
    ('expert',       'process-repository-restricted', 'hidden'),
    ('enterprise',   'process-repository-restricted', 'hidden'),
    ('free',         'process-repository-complete',   'hidden'),
    ('introductory', 'process-repository-complete',   'hidden'),
    ('professional', 'process-repository-complete',   'available'),
    ('expert',       'process-repository-complete',   'available'),
    ('enterprise',   'process-repository-complete',   'available')
), already AS (
  SELECT count(*) AS n
  FROM "FeatureAvailability" fa
  JOIN desired d ON fa."levelId" = d.lid AND fa."featureKey" = d.fkey AND fa."state" = d.st
), missing AS (
  SELECT string_agg(DISTINCT d.lid, ', ') AS levels
  FROM desired d LEFT JOIN "SubscriptionLevel" l ON l."id" = d.lid
  WHERE l."id" IS NULL
), upd AS (
  INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt")
  SELECT 'fa_' || substr(md5(d.lid || ':' || d.fkey), 1, 22), d.lid, d.fkey, d.st, now()
  FROM desired d JOIN "SubscriptionLevel" l ON l."id" = d.lid
  ON CONFLICT ("levelId", "featureKey")
  DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = now()
  WHERE "FeatureAvailability"."state" IS DISTINCT FROM EXCLUDED."state"
  RETURNING 1
)
SELECT CASE
         WHEN (SELECT levels FROM missing) IS NOT NULL THEN 'NOT APPLIED — no such subscription level: ' || (SELECT levels FROM missing)
         WHEN (SELECT n FROM already) = 10             THEN 'ALREADY APPLIED — all ten Process Repository cells already held these states; nothing changed'
         ELSE 'APPLIED NOW — ' || (SELECT count(*) FROM upd) || ' Process Repository cell(s) added or changed (10 expected the first time)'
       END AS result;
