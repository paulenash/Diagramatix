-- Documentation for per-Org AI Model Selection — User Guide (OrgAdmin + SuperAdmin chapters) and Technical Notes (AI Diagram Generation).
--
-- Paul, 5 October 2026: SuperAdmin chooses, per Org, which AI models are offered for Default, Vision and Voice Assist Command;
-- the OrgAdmin chooses from those lists; ordinary users never choose and never see a model; only OrgAdmins and SuperAdmins ever
-- see model names. The code is shipped (T5255 resolver, T5256 SuperAdmin editor, T5257 OrgAdmin tile, T5258 hiding); this adds
-- the DB-held help text.
--
-- Idempotent and safe on the live database: each INSERT runs only when its heading is not already in its chapter. Nothing is
-- changed or deleted. Run from the in-app Database tile (SuperAdmin → Database). Read-only report at the end, AFTER the commit.

BEGIN;

-- ── User Guide › OrgAdmin: AI Models for your organisation ────────────────────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'user-guide', 'AI Models for your organisation',
$UG$The **AI Models** tile on the OrgAdmin screen lets you choose the AI model your organisation runs on, for three purposes: **Default** (AI Generate and the other AI features), **Vision** (reading an image) and **Voice Assist Command** (the small, quick model that rewrites one spoken sentence into a command).

You choose **from the list your SuperAdmin offered your organisation**. A purpose with no choice follows the platform default. A purpose your SuperAdmin has offered no models for also follows the platform default, so AI keeps working.

**Your people never choose a model, and never see which one is in use.** Only an OrgAdmin and a SuperAdmin see model names — on this page and on the AI Usage page. Everywhere else the AI is simply "the AI".$UG$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'user-guide' AND ch.slug = 'org-admin'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'AI Models for your organisation');

-- ── User Guide › SuperAdmin: AI model lists per organisation ──────────────────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'user-guide', 'AI model lists per organisation',
$UG$On the **AI Model** tile, the **Organisations** section sets, for each organisation and each purpose (Default, Vision, Voice Assist Command), **which models its OrgAdmin may choose from**. Tick the models, then **Save**. **All Anthropic** ticks every Anthropic model, **None** clears the list, **Reset** returns to the default list.

- An organisation nobody has customised is offered **every Anthropic model** (for Vision, those that read images) and keeps running on the **global setting** at the top of the page — nothing changes the day you start using this.
- An **empty** list means "use the global setting", so AI keeps working.
- Taking a model off a list clears an OrgAdmin choice that depended on it.
- The OrgAdmin's current choice is shown beside each list.

You keep the full list of every model and the global settings for yourself: a SuperAdmin chooses a model as before, and is the only person who sees a model picker. When you are **acting as** a customer level, pickers and model names are hidden, as they would be for a real customer.$UG$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'user-guide' AND ch.slug = 'admin-roles'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'AI model lists per organisation');

-- ── Technical Notes › AI Diagram Generation: the resolver ─────────────────────────────────────────────
INSERT INTO "HelpSection" (id, "chapterId", collection, heading, "bodyMarkdown", "adminOnly", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ch.id, 'tech-design', 'Per-Org AI models — one resolver',
$TD$**Storage.** `app/lib/ai/orgModels.ts`. Per Org and purpose (`default` | `vision` | `command`): `ai.org.<orgId>.offered.<purpose>` (a JSON array of model ids, written by a SuperAdmin; **absent = never customised = the default list**, every Anthropic model — Vision: those that read images) and `ai.org.<orgId>.chosen.<purpose>` (one id, written by an OrgAdmin, and refused unless it is in the offered list). They are `AppSetting` rows, so there is no schema change. Removing a model from a list clears a choice that depended on it.

**One resolver.** `resolveOrgModel({ purpose?, hasImage?, orgId? })` is how a route picks its model. A SuperAdmin runs on the global setting (`aiModelSetting.ts`) and picks for themselves; anyone else runs on `modelInForce(orgId, purpose)` for their active Org; outside a request, or with no Org, it is the global setting — AI never fails over a model lookup (`session` / `cookies` are imported inside the function so libraries that merely import it stay loadable without Next's server runtime). `pickModelInForce` is the pure core: the Org's choice if offered and runnable; else the global setting (for an uncurated Org, or when the list still holds it); else the first runnable model in the list; an **empty list means the global setting**. A test (T5255) fails when any file outside the settings, the SuperAdmin tools and the partner worker reads `getAiGenerateModel` / `resolveGenerateModel` / `getAiCommandModel` / `getAiVisionModel` — 27 call sites moved onto it.

**Users do not choose.** `chooseModel` returns the model in force for everyone but a SuperAdmin, ignoring a requested model — including one a user's own key would unlock (the key changes who pays, not what runs). `/api/ai/models` gives an ordinary user `{ current: null, models: [] }`; AI Generate and the plan panel say "the AI" unless a SuperAdmin in SuperAdmin view is looking; the Properties panel's "drawn by" line is SuperAdmin-only (T5258). The model that drew a diagram is still **stored** in `aiGeneration.model` (audit and "regenerate with the same model"); only its display is gated.

**Screens and APIs.** SuperAdmin: the Organisations section on the AI Model tile (`OrgModelListsEditor.tsx`, `/api/admin/ai-model/orgs`, audited `ai.org-models.update`). OrgAdmin: the AI Models tile (`/dashboard/org-admin/ai-models`, `/api/org-admin/ai-models`, `guardOrgRoute`, audited `ai.org-models.choose`). Tests: T5255–T5258.$TD$,
false,
COALESCE((SELECT max("sortOrder") FROM "HelpSection" WHERE "chapterId" = ch.id), -1) + 1, NOW(), NOW()
FROM "HelpChapter" ch
WHERE ch.collection = 'tech-design' AND ch.slug = 'ai-generation'
  AND NOT EXISTS (SELECT 1 FROM "HelpSection" s WHERE s."chapterId" = ch.id AND s.heading = 'Per-Org AI models — one resolver');

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verification — run after the commit.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'AI Models for your organisation') AS orgadmin_rows,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'AI model lists per organisation') AS superadmin_rows,
  (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'Per-Org AI models — one resolver') AS tech_rows,
  CASE
    WHEN (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'AI Models for your organisation') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'user-guide' AND heading = 'AI model lists per organisation') = 1
     AND (SELECT count(*) FROM "HelpSection" WHERE collection = 'tech-design' AND heading = 'Per-Org AI models — one resolver') = 1
    THEN 'OK — all three sections are there exactly once'
    ELSE 'CHECK — a section is missing its chapter (org-admin / admin-roles / ai-generation), or was edited in the app'
  END AS verdict;
