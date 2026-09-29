-- Mobile Access as a real feature, with its two prerequisites — feature availability.
--
-- Paul, 2026-09-30: "Make sure Mobile Access is a Feature, initially set to
-- Available for all but Free subscriptions. Note it is dependent on Process
-- Review" and "also Mobile Access is dependent on Voice Assist".
--
--   mobile          Free: Not Available   Introductory, Professional, Expert, Enterprise: Available
--   process-review  the same   (was Expert and Enterprise only)
--   voice-assist    the same   (was Expert and Enterprise only)
--
-- Mobile is only as available as the weakest of its two prerequisites
-- (app/lib/features/dependencies.ts), which is why both are widened with it.
--
-- READ BEFORE RUNNING
--   * Voice Assist is ALREADY enforced. Widening it gives Introductory and
--     Professional users the desktop Voice Assist bar and the phone's 🎤 editor
--     the moment this runs, with its Deepgram / AI cost. Check their monthly
--     AI-attempt caps (Introductory 50, Professional 100) are acceptable first.
--   * Mobile Access is enforced by the /m layout from the deploy that ships this
--     file's counterpart. Free users on a phone then see an upgrade page instead
--     of the app. Run this AFTER that deploy is live (or before — the /m layout
--     fails open until the row is Not Available).
--   * Process Review has no gate yet, so widening it changes nothing today.
--
-- Run it in the SuperAdmin ▸ Database tile. IDEMPOTENT: an upsert on the
-- (levelId, featureKey) unique index; running it twice changes nothing.
-- Touches only "FeatureAvailability". Proven on diagramatix_test before prod.

BEGIN;

INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt")
SELECT 'fa_' || substr(md5(l."id" || ':' || f.key), 1, 22), l."id", f.key,
       CASE WHEN l."id" = 'free' THEN 'hidden' ELSE 'available' END,
       now()
  FROM "SubscriptionLevel" l
 CROSS JOIN (VALUES ('mobile'), ('process-review'), ('voice-assist')) AS f(key)
 WHERE l."id" IN ('free', 'introductory', 'professional', 'expert', 'enterprise')
ON CONFLICT ("levelId", "featureKey")
DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = now();

-- What it now says (15 rows expected: 3 features x 5 levels):
SELECT "featureKey", "levelId", "state"
  FROM "FeatureAvailability"
 WHERE "featureKey" IN ('mobile', 'process-review', 'voice-assist')
 ORDER BY "featureKey", "levelId";

COMMIT;
