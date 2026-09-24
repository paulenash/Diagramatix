-- Repair the AiModelRate rows that SHADOW the built-in defaults.
--
-- Run it in the app: SuperAdmin → Database → run SQL. Or:
--   psql "<url>" -f scripts/fix-stale-ai-rate-overrides.sql
--
-- ── What went wrong ────────────────────────────────────────────────────────
--
-- `effectiveRates()` overlays the static defaults in app/lib/ai/pricing.ts with
-- the AiModelRate table, and THE TABLE WINS. When the editable rate catalog
-- shipped on 2026-07-23 it wrote ten rows that were byte-identical copies of
-- that day's defaults — not choices anybody made, just a snapshot.
--
-- A copy of a number is a number that can go stale on its own, and one did.
-- Anthropic CANCELLED the rise of Claude Sonnet 5 from $2/$10 to $3/$15 that
-- had been scheduled for 1 September 2026, so $2/$10 is now the standard price.
-- pricing.ts has been corrected — but the seeded row still said $3/$15, so the
-- AI Usage report went on billing Sonnet 5 at 1.5x its real cost, and would
-- have kept doing so however many times the constant was fixed.
--
-- ── What this does ─────────────────────────────────────────────────────────
--
-- Deletes every row that is merely a copy of a default, rather than correcting
-- the one wrong number. Correcting it would leave the same trap set for the
-- next price change; deleting it lets the default flow through, which is the
-- whole point of having a default. A row that a SuperAdmin genuinely edited has
-- values that DIFFER from the defaults of its day, so the delete below is
-- written as an explicit list of (provider, model, input, output) 4-tuples: a
-- row is removed only if it still holds exactly the seeded numbers. Edit one in
-- the UI and this script leaves it alone.
--
-- Idempotent: running it twice removes nothing the second time.

DELETE FROM "AiModelRate"
WHERE (provider, model, "inputPer1M", "outputPer1M") IN (
  -- Anthropic: identical to app/lib/ai/pricing.ts as seeded on 2026-07-23.
  ('anthropic', 'claude-fable-5',                10,   50),
  ('anthropic', 'claude-opus-4-8',                5,   25),
  ('anthropic', 'claude-haiku-4-5-20251001',      1,    5),
  -- The one that actually went wrong. $3/$15 was correct when it was written
  -- and is no longer correct; $2/$10 now comes from pricing.ts.
  ('anthropic', 'claude-sonnet-5',                3,   15),
  -- Moonshot: same seeding, same reasoning.
  ('moonshot',  'kimi-k3',                        3,   15),
  ('moonshot',  'kimi-k2.6',                   0.95,    4),
  ('moonshot',  'kimi-k2.7-code',              0.95,    4),
  ('moonshot',  'kimi-k2.5',                    0.6,    3),
  ('moonshot',  'kimi-k2-0711-preview',         0.6,  2.5),
  ('moonshot',  'moonshot-v1-128k',               2,    5)
);

-- What is LEFT is a genuine override, and worth looking at.
SELECT provider, model, "inputPer1M", "outputPer1M", "updatedAt"
FROM "AiModelRate"
ORDER BY provider, model;
