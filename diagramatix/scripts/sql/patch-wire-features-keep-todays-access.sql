-- Wire the 22 previously-unenforced features WITHOUT taking access away from anyone.
--
-- Paul, 2026-09-30 ("Keep today's access"): the Feature Availability matrix already held a state for
-- these features per level (from the Feature by Subscription Level xlsx), but nothing read them — every
-- level could use all of them. The gates are now in the code. If they went live against the seeded
-- cells, Free / Introductory / Professional users would lose things they have today (Image to Diagram,
-- Audio / Refine / Record, Sharing, Co-authoring, Individual Visio import, SharePoint, SOP generation …).
--
-- So this file sets every one of the 22 to AVAILABLE at every level: what people can do today, made
-- explicit. Restrict them deliberately afterwards, one cell at a time, in Feature Availability (the
-- "Test tools" and "act as level" show what each level then gets) — or apply the xlsx intent in one go
-- with scripts/sql/apply-xlsx-restrictions.sql.
--
-- Run it in the SuperAdmin ▸ Database tile AT THE SAME TIME as the deploy that ships the gates.
-- IDEMPOTENT: an upsert on (levelId, featureKey). Touches only "FeatureAvailability".
-- Proven on diagramatix_test before prod.

BEGIN;

INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt")
SELECT 'fa_' || substr(md5(l."id" || ':' || f.key), 1, 22), l."id", f.key, 'available', now()
  FROM "SubscriptionLevel" l
 CROSS JOIN (VALUES ('ai-generate-typed'), ('ai-generate-image'), ('ai-generate-dictated'), ('ai-generate-audio'), ('ai-generate-refine'), ('ai-generate-record'), ('bpmn-templates'), ('nl-assist'), ('collaboration-groups'), ('sharing'), ('co-authoring'), ('diff-processes'), ('visio-import-individual'), ('visio-export-individual'), ('visio-import-bulk'), ('visio-export-bulk'), ('sharepoint'), ('sop-generation'), ('process-portal'), ('choice-of-llms'), ('local-llm'), ('risk-control-examples')) AS f(key)
 WHERE l."id" IN ('free', 'introductory', 'professional', 'expert', 'enterprise')
ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = 'available', "updatedAt" = now();

-- What it now says (22 features x 5 levels = 110 rows, all available):
SELECT "state", count(*) FROM "FeatureAvailability" WHERE "featureKey" IN ('ai-generate-typed', 'ai-generate-image', 'ai-generate-dictated', 'ai-generate-audio', 'ai-generate-refine', 'ai-generate-record', 'bpmn-templates', 'nl-assist', 'collaboration-groups', 'sharing', 'co-authoring', 'diff-processes', 'visio-import-individual', 'visio-export-individual', 'visio-import-bulk', 'visio-export-bulk', 'sharepoint', 'sop-generation', 'process-portal', 'choice-of-llms', 'local-llm', 'risk-control-examples') GROUP BY "state";

COMMIT;
