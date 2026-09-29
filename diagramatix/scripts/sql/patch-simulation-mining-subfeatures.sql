-- Simulator and Process Mining: module access separated from the advanced features.
--
-- Paul, 2026-09-30: "I need to separate access to Simulation, and Process Mining,
-- from full access to the full features themselves."
--
-- Ten new features, each of which REQUIRES its module (so it is only ever as
-- available as the module):
--
--   Simulator:       simulator-analysis · simulator-bpsim · simulator-calendars · simulator-teams
--   Process Mining:  process-mining-conformance · process-mining-sources · process-mining-alerts
--                    process-mining-twin · process-mining-ai · process-mining-export
--
-- THIS FILE CHANGES NOTHING FOR ANYONE. Each new feature is given, at every
-- level, exactly the state its module has there right now — so today's access is
-- unchanged until you edit a cell in Feature Availability. It never overwrites a
-- row that already exists (ON CONFLICT DO NOTHING), so running it again after you
-- have started editing keeps your edits.
--
-- (Without this file the new features would read as Available at every level, capped
-- by their module — the same access, but the grid would show "Available" on levels
-- where the module is off. This makes the grid say what is true.)
--
-- Run it in the SuperAdmin ▸ Database tile. IDEMPOTENT. Touches only
-- "FeatureAvailability". Proven on diagramatix_test before prod.

BEGIN;

INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt")
SELECT 'fa_' || substr(md5(p."levelId" || ':' || m.child), 1, 22), p."levelId", m.child, p."state", now()
  FROM "FeatureAvailability" p
  JOIN (VALUES
    ('simulator',     'simulator-analysis'),
    ('simulator',     'simulator-bpsim'),
    ('simulator',     'simulator-calendars'),
    ('simulator',     'simulator-teams'),
    ('processMining', 'process-mining-conformance'),
    ('processMining', 'process-mining-sources'),
    ('processMining', 'process-mining-alerts'),
    ('processMining', 'process-mining-twin'),
    ('processMining', 'process-mining-ai'),
    ('processMining', 'process-mining-export')
  ) AS m(parent, child) ON p."featureKey" = m.parent
ON CONFLICT ("levelId", "featureKey") DO NOTHING;

-- What it now says (10 features x 5 levels = 50 rows expected once the module rows exist):
SELECT "featureKey", "levelId", "state"
  FROM "FeatureAvailability"
 WHERE "featureKey" LIKE 'simulator-%' OR "featureKey" LIKE 'process-mining-%'
 ORDER BY "featureKey", "levelId";

COMMIT;
