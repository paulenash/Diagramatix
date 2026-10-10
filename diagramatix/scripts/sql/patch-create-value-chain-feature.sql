-- Create a New Value Chain as a feature in Feature Availability — Expert and above.
--
-- Paul, 10 October 2026: "Create a plan for a new user feature called 'Create a New Value Chain' to be available to Expert and above."
--
--   create-value-chain   Free / Introductory / Professional: Hidden   Expert / Enterprise: Available
--
-- An unconfigured cell fails OPEN in Feature Availability, so until this runs the feature reads as Available for every level. The server has a
-- code floor of Expert behind the grid (app/lib/valueChain/newChainAccess.ts) so nobody below Expert can spend AI attempts in the meantime, but
-- the menu item is only shown to those the grid says may have it: run this right after the deploy that ships the feature.
--
-- ONE statement, so the result row can say what happened:
--   ALREADY APPLIED  — all five cells already held these states; nothing changed.
--   APPLIED NOW      — N cell(s) were added or changed to these states.
--   NOT APPLIED      — a subscription level is missing (the result says which).
-- Safe to run any number of times. NOTE: it sets these five cells to the states above, so a cell you later change in the Feature Availability grid
-- is put back if you run this again. Touches only "FeatureAvailability". Run from the in-app Database tile (SuperAdmin → Database).

WITH desired(lid, fkey, st) AS (
  VALUES
    ('free',         'create-value-chain', 'hidden'),
    ('introductory', 'create-value-chain', 'hidden'),
    ('professional', 'create-value-chain', 'hidden'),
    ('expert',       'create-value-chain', 'available'),
    ('enterprise',   'create-value-chain', 'available')
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
         WHEN (SELECT n FROM already) = 5              THEN 'ALREADY APPLIED — all five Create a New Value Chain cells already held these states; nothing changed'
         ELSE 'APPLIED NOW — ' || (SELECT count(*) FROM upd) || ' Create a New Value Chain cell(s) added or changed (5 expected the first time)'
       END AS result;
