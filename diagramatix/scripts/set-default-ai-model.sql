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

-- ── All THREE model settings, because there are three ──────────────────────
--
-- `ai.vision.model` is an INDEPENDENT override used only when the input carries
-- an image (resolveGenerateModel in app/lib/ai/aiModelSetting.ts). Setting the
-- main model above does NOT touch it, so a stale vision override quietly keeps
-- image → diagram generation on the old model while everything else moves.
--
-- `ai.command.model` is the Voice Assist command interpreter (added
-- 2026-09-20). It defaults to Haiku in code — DEFAULT_AI_COMMAND_MODEL — and,
-- like the vision key, an ABSENT row means "follow the default" rather than
-- "unset". Setting the main model does not touch it, and it should not need
-- setting: it rewrites one sentence, which the deterministic grammar then
-- re-parses, so the small model is the right one.
--
-- Expected after this script:
--   ai.generate.model  = claude-opus-5
--   ai.vision.model    = ABSENT  (Opus 5 has vision, so no override is needed)
--   ai.command.model   = ABSENT  (follows the Haiku default)
--
-- If a row comes back for either override and you did not intend one, clear it:
--   DELETE FROM "AppSetting" WHERE key = 'ai.vision.model';
--   DELETE FROM "AppSetting" WHERE key = 'ai.command.model';
-- Neither is cleared automatically here — an override somebody set on purpose
-- is not this script's to discard.
SELECT key, value, "updatedAt"
FROM "AppSetting"
WHERE key IN ('ai.generate.model', 'ai.vision.model', 'ai.command.model')
ORDER BY key;
