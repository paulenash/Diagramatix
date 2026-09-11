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

SELECT key, value FROM "AppSetting" WHERE key = 'ai.generate.model';
