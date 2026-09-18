-- Abracadabra → Voice Assist, and Assist available at every subscription level.
--
-- Paul, 2026-09-19: "Change Abracadabra to Voice Assist everywhere and make
-- normal Assist available to all Subscription levels. Update Feature
-- Availability." and "Update User Guide, Technical Notes, Features and
-- Comparison documents to reflect change".
--
-- The code half of the rename ships in the same commit. This is the DB half:
-- the feature-availability key, the public Features catalogue entry, and the
-- User Guide / Technical Notes chapters, all of which are content rather than
-- code and so live in the database.
--
-- Run it in the SuperAdmin ▸ Database tile. IDEMPOTENT: every statement is
-- written against what it finds, so running it twice changes nothing the
-- second time (after the first pass there is no 'Abracadabra' left to match).
--
-- Proven on diagramatix_test before prod.

BEGIN;

-- ── 1. The feature key ──────────────────────────────────────────────────────
-- `isFeatureAvailable` fails CLOSED: a missing row is "not available". So the
-- key rename has to carry the existing states across, or Voice Assist would
-- switch itself off for the Expert and Enterprise users who have it today.
-- Only rows with no voice-assist counterpart are moved, so a re-run cannot
-- collide with the unique (levelId, featureKey) index.
UPDATE "FeatureAvailability" a
   SET "featureKey" = 'voice-assist'
 WHERE a."featureKey" = 'abracadabra'
   AND NOT EXISTS (
     SELECT 1 FROM "FeatureAvailability" b
      WHERE b."levelId" = a."levelId" AND b."featureKey" = 'voice-assist');

-- Anything left is a duplicate of a row that already carried the new key.
DELETE FROM "FeatureAvailability" WHERE "featureKey" = 'abracadabra';

-- ── 2. Assist, available at every level ─────────────────────────────────────
-- The ghost-suggestion Assist has never been gated in code, so this makes the
-- matrix say what the product already does — and leaves it saying so if the
-- feature is ever wired to the registry key.
INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt")
SELECT md5(random()::text || l."id" || 'nl-assist'), l."id", 'nl-assist', 'available', NOW()
  FROM "SubscriptionLevel" l
 WHERE NOT EXISTS (
   SELECT 1 FROM "FeatureAvailability" a
    WHERE a."levelId" = l."id" AND a."featureKey" = 'nl-assist');

UPDATE "FeatureAvailability"
   SET "state" = 'available', "updatedAt" = NOW()
 WHERE "featureKey" = 'nl-assist' AND "state" <> 'available';

-- ── 3. The public Features catalogue ────────────────────────────────────────
-- Draft and published columns both: the published copy is what /features
-- shows, and leaving it would keep the old name on the public page.
-- "Abracadabra Mode" first, so the longer phrase does not leave a stray "Mode".
UPDATE "Feature" SET
  "name"              = REPLACE(REPLACE("name",              'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "summary"           = REPLACE(REPLACE("summary",           'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "details"           = REPLACE(REPLACE("details",           'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "publishedName"     = REPLACE(REPLACE("publishedName",     'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "publishedSummary"  = REPLACE(REPLACE("publishedSummary",  'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "publishedDetails"  = REPLACE(REPLACE("publishedDetails",  'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "updatedAt"         = NOW()
WHERE "name" ILIKE '%abracadabra%' OR "summary" ILIKE '%abracadabra%' OR "details" ILIKE '%abracadabra%'
   OR "publishedName" ILIKE '%abracadabra%' OR "publishedSummary" ILIKE '%abracadabra%' OR "publishedDetails" ILIKE '%abracadabra%';

-- ── 4. User Guide + Technical Notes ─────────────────────────────────────────
-- Both collections live in these two tables, distinguished by `collection`, so
-- one pass covers the Guide and the Notes.
UPDATE "HelpChapter" SET
  "title"     = REPLACE(REPLACE("title", 'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "updatedAt" = NOW()
WHERE "title" ILIKE '%abracadabra%';

UPDATE "HelpSection" SET
  "heading"       = REPLACE(REPLACE("heading",       'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "bodyMarkdown"  = REPLACE(REPLACE("bodyMarkdown",  'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "imageCaption"  = REPLACE(REPLACE("imageCaption",  'Abracadabra Mode', 'Voice Assist'), 'Abracadabra', 'Voice Assist'),
  "updatedAt"     = NOW()
WHERE "heading" ILIKE '%abracadabra%' OR "bodyMarkdown" ILIKE '%abracadabra%' OR "imageCaption" ILIKE '%abracadabra%';

COMMIT;

-- ── What you should see afterwards ──────────────────────────────────────────
-- Every count below must be 0, and the last query must show 'available' on all
-- five levels for nl-assist and the old abracadabra states carried onto
-- voice-assist.
--
--   SELECT count(*) FROM "FeatureAvailability" WHERE "featureKey" = 'abracadabra';
--   SELECT count(*) FROM "Feature"      WHERE "name" ILIKE '%abracadabra%' OR "publishedName" ILIKE '%abracadabra%';
--   SELECT count(*) FROM "HelpChapter"  WHERE "title" ILIKE '%abracadabra%';
--   SELECT count(*) FROM "HelpSection"  WHERE "heading" ILIKE '%abracadabra%' OR "bodyMarkdown" ILIKE '%abracadabra%';
--
--   SELECT "featureKey", "levelId", "state" FROM "FeatureAvailability"
--    WHERE "featureKey" IN ('nl-assist','voice-assist') ORDER BY 1, 2;
