-- Set the LIVE default AI model.
--
-- DEFAULT_AI_MODEL in app/lib/diagram/../ai/models.ts is only what a deployment
-- falls back to when this row is absent or names a model that no longer exists.
-- A row that EXISTS overrides it — which is why changing the constant alone does
-- not change the default anywhere the row has been set, and why the two silently
-- disagreed (the constant said kimi-k3 while Opus 5 was the intended default).
--
--   psql "<url>" -f scripts/set-default-ai-model.sql
--   DATABASE_URL="<prod url>" psql "$DATABASE_URL" -f scripts/set-default-ai-model.sql
--
-- Or change it in the UI: SuperAdmin → AI Model (/dashboard/admin/ai-model).

INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES ('ai.generate.model', 'claude-opus-5', NOW())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, "updatedAt" = NOW();

-- ── Both model settings, because there are two ──────────────────────────────
--
-- `ai.vision.model` is an INDEPENDENT override used only when the input carries
-- an image (resolveGenerateModel in app/lib/ai/aiModelSetting.ts). Setting the
-- main model above does NOT touch it, so a stale vision override quietly keeps
-- image → diagram generation on the old model while everything else moves.
--
-- Expected after this script:
--   ai.generate.model  = claude-opus-5
--   ai.vision.model    = ABSENT  (Opus 5 has vision, so no override is needed)
--
-- If a row comes back for ai.vision.model and you did not intend one, clear it:
--   DELETE FROM "AppSetting" WHERE key = 'ai.vision.model';
-- It is NOT cleared automatically here — an override somebody set on purpose is
-- not this script's to discard.
SELECT key, value, "updatedAt"
FROM "AppSetting"
WHERE key IN ('ai.generate.model', 'ai.vision.model')
ORDER BY key;
