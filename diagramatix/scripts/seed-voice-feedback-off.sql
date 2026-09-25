-- Spoken replies (feature key `voice-feedback`) — OFF at every subscription level.
--
-- Run it in the app: SuperAdmin → Database → run SQL. Or:
--   psql "<url>" -f scripts/seed-voice-feedback-off.sql
--
-- ── Why this exists ────────────────────────────────────────────────────────
--
-- Paul, 2026-09-25: spoken replies are "on for SuperAdmin users, off for
-- everyone else", and a SuperAdmin turns them on for selected users from
-- Registered Users → Features.
--
-- The route does NOT depend on this file: `app/lib/voice/speechAccess.ts` fails
-- CLOSED, so a missing row already means "off". What a missing row gets wrong is
-- the SCREEN — the Feature Availability grid shows a missing row as Available
-- (`getLevelMatrix` fails open for display), so without these rows the grid
-- would claim speech is on for every tier while the route refuses everyone. This
-- makes the grid tell the truth.
--
-- ── Why SQL and not the seed script ────────────────────────────────────────
--
-- `scripts/seed-feature-availability.ts` UPSERTS the entire matrix back to the
-- spreadsheet defaults, overwriting every edit a SuperAdmin has made in the
-- grid since. This touches one feature and nothing else.
--
-- Idempotent: ON CONFLICT DO NOTHING, so running it twice changes nothing — and
-- if a SuperAdmin has already set a tier to Available on purpose, that choice
-- survives.

INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt")
SELECT 'fa_voice_feedback_' || l."id", l."id", 'voice-feedback', 'hidden', NOW()
FROM "SubscriptionLevel" l
WHERE l."id" IN ('free', 'introductory', 'professional', 'expert', 'enterprise')
ON CONFLICT ("levelId", "featureKey") DO NOTHING;

-- What it left behind — five rows, all hidden unless a SuperAdmin chose otherwise.
SELECT "levelId", "featureKey", "state"
FROM "FeatureAvailability"
WHERE "featureKey" = 'voice-feedback'
ORDER BY "levelId";
