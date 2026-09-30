-- Apply the xlsx INTENT to the 22 features that are now enforced.
--
-- Paul, 2026-09-30. The Feature by Subscription Level xlsx (v1.4) says which levels should have each of
-- these; until now nothing read those cells, and patch-wire-features-keep-todays-access.sql set them all
-- to Available so wiring the gates took nothing away. THIS file applies the original intent instead —
-- and so WILL take features away from the levels the xlsx excludes (Image to Diagram from Free; Audio,
-- Refine and Record from Introductory; Sharing and Co-authoring from Free and Introductory; Individual
-- Visio import from Free and Introductory; SharePoint, SOP generation and Visio export / bulk from
-- Professional and below; Choice of LLMs from everyone but Enterprise …).
--
-- Do NOT run it casually. Check each level first with "act as level" in the SuperAdmin view, and tell
-- affected customers. To restrict just one feature, set that cell in Feature Availability instead.
--
-- The rows below come from menus_and_features/feature-availability.xlsx-intent.json.
-- IDEMPOTENT. Touches only "FeatureAvailability". Proven on diagramatix_test before prod.

BEGIN;

INSERT INTO "FeatureAvailability" ("id", "levelId", "featureKey", "state", "updatedAt")
SELECT 'fa_' || substr(md5(v.level || ':' || v.key), 1, 22), v.level, v.key, v.state, now()
  FROM (VALUES
    ('free', 'ai-generate-typed', 'available'),
    ('introductory', 'ai-generate-typed', 'available'),
    ('professional', 'ai-generate-typed', 'available'),
    ('expert', 'ai-generate-typed', 'available'),
    ('enterprise', 'ai-generate-typed', 'available'),
    ('free', 'ai-generate-image', 'hidden'),
    ('introductory', 'ai-generate-image', 'available'),
    ('professional', 'ai-generate-image', 'available'),
    ('expert', 'ai-generate-image', 'available'),
    ('enterprise', 'ai-generate-image', 'available'),
    ('free', 'ai-generate-dictated', 'hidden'),
    ('introductory', 'ai-generate-dictated', 'available'),
    ('professional', 'ai-generate-dictated', 'available'),
    ('expert', 'ai-generate-dictated', 'available'),
    ('enterprise', 'ai-generate-dictated', 'available'),
    ('free', 'ai-generate-audio', 'hidden'),
    ('introductory', 'ai-generate-audio', 'hidden'),
    ('professional', 'ai-generate-audio', 'available'),
    ('expert', 'ai-generate-audio', 'available'),
    ('enterprise', 'ai-generate-audio', 'available'),
    ('free', 'ai-generate-refine', 'hidden'),
    ('introductory', 'ai-generate-refine', 'hidden'),
    ('professional', 'ai-generate-refine', 'available'),
    ('expert', 'ai-generate-refine', 'available'),
    ('enterprise', 'ai-generate-refine', 'available'),
    ('free', 'ai-generate-record', 'hidden'),
    ('introductory', 'ai-generate-record', 'hidden'),
    ('professional', 'ai-generate-record', 'available'),
    ('expert', 'ai-generate-record', 'available'),
    ('enterprise', 'ai-generate-record', 'available'),
    ('free', 'bpmn-templates', 'available'),
    ('introductory', 'bpmn-templates', 'available'),
    ('professional', 'bpmn-templates', 'available'),
    ('expert', 'bpmn-templates', 'available'),
    ('enterprise', 'bpmn-templates', 'available'),
    ('free', 'nl-assist', 'available'),
    ('introductory', 'nl-assist', 'available'),
    ('professional', 'nl-assist', 'available'),
    ('expert', 'nl-assist', 'available'),
    ('enterprise', 'nl-assist', 'available'),
    ('free', 'collaboration-groups', 'hidden'),
    ('introductory', 'collaboration-groups', 'available'),
    ('professional', 'collaboration-groups', 'available'),
    ('expert', 'collaboration-groups', 'available'),
    ('enterprise', 'collaboration-groups', 'available'),
    ('free', 'sharing', 'hidden'),
    ('introductory', 'sharing', 'hidden'),
    ('professional', 'sharing', 'available'),
    ('expert', 'sharing', 'available'),
    ('enterprise', 'sharing', 'available'),
    ('free', 'co-authoring', 'hidden'),
    ('introductory', 'co-authoring', 'hidden'),
    ('professional', 'co-authoring', 'available'),
    ('expert', 'co-authoring', 'available'),
    ('enterprise', 'co-authoring', 'available'),
    ('free', 'diff-processes', 'hidden'),
    ('introductory', 'diff-processes', 'available'),
    ('professional', 'diff-processes', 'available'),
    ('expert', 'diff-processes', 'available'),
    ('enterprise', 'diff-processes', 'available'),
    ('free', 'visio-import-individual', 'hidden'),
    ('introductory', 'visio-import-individual', 'hidden'),
    ('professional', 'visio-import-individual', 'available'),
    ('expert', 'visio-import-individual', 'available'),
    ('enterprise', 'visio-import-individual', 'available'),
    ('free', 'visio-export-individual', 'hidden'),
    ('introductory', 'visio-export-individual', 'hidden'),
    ('professional', 'visio-export-individual', 'hidden'),
    ('expert', 'visio-export-individual', 'available'),
    ('enterprise', 'visio-export-individual', 'available'),
    ('free', 'visio-import-bulk', 'hidden'),
    ('introductory', 'visio-import-bulk', 'hidden'),
    ('professional', 'visio-import-bulk', 'hidden'),
    ('expert', 'visio-import-bulk', 'available'),
    ('enterprise', 'visio-import-bulk', 'available'),
    ('free', 'visio-export-bulk', 'hidden'),
    ('introductory', 'visio-export-bulk', 'hidden'),
    ('professional', 'visio-export-bulk', 'hidden'),
    ('expert', 'visio-export-bulk', 'available'),
    ('enterprise', 'visio-export-bulk', 'available'),
    ('free', 'sharepoint', 'hidden'),
    ('introductory', 'sharepoint', 'hidden'),
    ('professional', 'sharepoint', 'hidden'),
    ('expert', 'sharepoint', 'available'),
    ('enterprise', 'sharepoint', 'available'),
    ('free', 'sop-generation', 'hidden'),
    ('introductory', 'sop-generation', 'hidden'),
    ('professional', 'sop-generation', 'hidden'),
    ('expert', 'sop-generation', 'available'),
    ('enterprise', 'sop-generation', 'available'),
    ('free', 'process-portal', 'hidden'),
    ('introductory', 'process-portal', 'hidden'),
    ('professional', 'process-portal', 'available'),
    ('expert', 'process-portal', 'available'),
    ('enterprise', 'process-portal', 'available'),
    ('free', 'choice-of-llms', 'hidden'),
    ('introductory', 'choice-of-llms', 'hidden'),
    ('professional', 'choice-of-llms', 'hidden'),
    ('expert', 'choice-of-llms', 'hidden'),
    ('enterprise', 'choice-of-llms', 'available'),
    ('free', 'local-llm', 'hidden'),
    ('introductory', 'local-llm', 'hidden'),
    ('professional', 'local-llm', 'hidden'),
    ('expert', 'local-llm', 'hidden'),
    ('enterprise', 'local-llm', 'available'),
    ('free', 'risk-control-examples', 'hidden'),
    ('introductory', 'risk-control-examples', 'hidden'),
    ('professional', 'risk-control-examples', 'hidden'),
    ('expert', 'risk-control-examples', 'available'),
    ('enterprise', 'risk-control-examples', 'available')
  ) AS v(level, key, state)
  JOIN "SubscriptionLevel" l ON l."id" = v.level
ON CONFLICT ("levelId", "featureKey") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = now();

SELECT "state", count(*) FROM "FeatureAvailability" WHERE "featureKey" IN ('ai-generate-typed', 'ai-generate-image', 'ai-generate-dictated', 'ai-generate-audio', 'ai-generate-refine', 'ai-generate-record', 'bpmn-templates', 'nl-assist', 'collaboration-groups', 'sharing', 'co-authoring', 'diff-processes', 'visio-import-individual', 'visio-export-individual', 'visio-import-bulk', 'visio-export-bulk', 'sharepoint', 'sop-generation', 'process-portal', 'choice-of-llms', 'local-llm', 'risk-control-examples') GROUP BY "state";

COMMIT;
