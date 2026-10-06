-- Simulator example "Simple Process": both scenarios' run horizon becomes 21,600 minutes (15 days; was 2,880 = 2 days).
--
-- Paul, 6 October 2026. The committed example data (exampleData.json) and the two seed scripts already say 21,600; this brings the
-- LIVE catalog row into line. It changes the catalog entry only — projects people have ALREADY loaded keep the horizon they were
-- given (loading an example again overwrites their copy with the new one).
--
-- Idempotent and safe on the live database: one guarded UPDATE of one row, skipped once every scenario's horizon is already 21600.
-- Nothing is inserted or deleted. Run from the in-app Database tile (SuperAdmin -> Database). Read-only report at the end,
-- AFTER the commit.

BEGIN;

UPDATE "SimulationExample" e
SET "package" = jsonb_set(
      e."package",
      '{scenarios}',
      (SELECT jsonb_agg(jsonb_set(s.v, '{runConfig,horizon}', '21600'::jsonb) ORDER BY s.n)
         FROM jsonb_array_elements(e."package"->'scenarios') WITH ORDINALITY AS s(v, n))
    ),
    "updatedAt" = NOW()
WHERE e.slug = 'simple-process'
  AND jsonb_typeof(e."package"->'scenarios') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(e."package"->'scenarios') AS s(v)
    WHERE (s.v->'runConfig'->>'horizon') IS DISTINCT FROM '21600'
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM jsonb_array_elements(e."package"->'scenarios')) AS scenarios,
  (SELECT string_agg(s.v->'runConfig'->>'horizon', ', ') FROM jsonb_array_elements(e."package"->'scenarios') AS s(v)) AS horizons,
  CASE
    WHEN (SELECT bool_and((s.v->'runConfig'->>'horizon') = '21600') FROM jsonb_array_elements(e."package"->'scenarios') AS s(v))
    THEN 'OK — every scenario of Simple Process runs for 21,600 minutes (15 days)'
    ELSE 'CHECK — a scenario still has another horizon'
  END AS verdict
FROM "SimulationExample" e
WHERE e.slug = 'simple-process';
