# AI Model Selection Changes — plan

Written for: Paul (to review before anything is built). Nothing here is implemented. Date: 2026-10-05.

## 0. Have we implemented it? — No

What exists today (all of it SuperAdmin-wide, none of it per organisation):

| Piece | Where | Today |
|---|---|---|
| Three global model settings — Default (`ai.generate.model`), Vision (`ai.vision.model`), Voice Assist Command (`ai.command.model`) | `AppSetting` rows, `app/lib/ai/aiModelSetting.ts` | One value for the whole deployment, set by SuperAdmin on the **AI Model** tile (`/dashboard/admin/ai-model`, `app/api/admin/ai-model/route.ts`) |
| The catalogue of every model the deployment can reach | `allModels()` in `app/lib/ai/models.ts` (Anthropic + Moonshot, Google, Microsoft, DeepSeek, OpenRouter, Ollama, custom; own-key providers) | SuperAdmin tile shows all of it |
| What an ordinary user may pick | `GET /api/ai/models` + `app/lib/ai/modelAccess.ts` | **Users do pick**: the current default plus every model that is equal or cheaper by `typicalCost`; SuperAdmin in SA mode gets all. Enforced again in the generate/plan routes (`chooseModel`) |
| Where model names reach users | AI Generate screen ("Asking {model} for a plan…"), Properties panel ("drawn by {model}"), the model pickers (`ModelSelect.tsx`), the comparison modal, AI usage page, API responses carrying `model` | Shown to everyone |

So requirements 1–7 below are all new.

## 1. What you asked for

1. SuperAdmin chooses, **per Org**, which models appear in three lists — Default, Vision, Voice Assist Command — that the Org's OrgAdmins may choose from. Only SuperAdmin sees every model.
2. OrgAdmins choose, from the lists SuperAdmin gave their Org, the model their users will use. The starting lists include **all Anthropic models** available.
3. Ordinary users **cannot choose** a model. SuperAdmins keep choosing exactly as now.
4. Only OrgAdmins and SuperAdmins ever **see** which model is in use. Every message to users is checked.
5. OrgAdmins get a model-selection ability in the product, limited to their lists.
6. The current **AI Model** tile becomes an **OrgAdmin tile**; the lists it shows come from SuperAdmin's per-Org configuration.
7. SuperAdmin keeps the full AI Model tile, showing ALL models for themselves.

## 2. Design

### 2.1 Data (per Org — the Org already carries its other AI controls: `allowAi`, `allowVoiceAi`)

Two sets of values per Org, kept apart so "what is offered" and "what is chosen" cannot be confused:

- **Offered lists (SuperAdmin writes).** For each of the three purposes — `default`, `vision`, `command` — an ordered list of model ids. Stored as three `AppSetting` rows keyed `ai.org.<orgId>.offered.<purpose>` (JSON array), **or** three `String[]` columns on `Org`. *Recommendation:* AppSetting rows — no schema change, no `prisma db push`, no version bump, and the AI settings already live there. (A column would be cleaner for queries but buys nothing here: reads are one org at a time.)
- **Chosen model (OrgAdmin writes).** One id per purpose: `ai.org.<orgId>.chosen.<purpose>`. Always validated against the Org's offered list on write **and on read** — if SuperAdmin later removes a model the Org had chosen, the chosen value silently falls back (see 2.2).

Seeding: an Org with no offered list yet gets the **default list = every Anthropic model in `AI_MODELS`** for all three purposes (vision list = those with `vision: true`). Computed at read time, not copied into rows, so a newly added Anthropic model appears for Orgs that have never been customised and never for Orgs SuperAdmin has curated.

### 2.2 Resolution — one function, one place

`resolveModelFor({ purpose, userId, orgId, hasImage })`, replacing today's `resolveGenerateModel` / `getAiCommandModel` call sites:

1. **SuperAdmin** (real SuperAdmin session, acting in SuperAdmin mode): their own pick if sent, else the global setting — exactly as today. All models allowed.
2. **Everyone else**: the Org's *chosen* model for the purpose, if it is in the Org's offered list **and** reachable from this deployment (`aiApiKey` present — the same "usable" test the command model has today); else the first usable entry of the offered list; else the global setting (so an Org that has been given an empty list still works rather than breaking AI).
3. Vision requests use the `vision` purpose when an image is attached, falling back to `default` as today.
4. A user-supplied `model` in a request is **ignored** for non-SuperAdmins (today it is honoured if equal-or-cheaper). `chooseModel` / `allowedGenerateModels` / the cost ceiling go away for them.
5. Bring-your-own-key users: their own key still pays, but they still do not choose the model (see Q4).

Guarded by a test that **every route that calls an AI provider goes through this function** (a source scan like the existing mutating-route ratchet), so a new route cannot quietly pick its own model.

### 2.3 Screens

- **SuperAdmin → AI Model tile (unchanged for SuperAdmin):** the full list, global Default / Vision / Command, plus a new **Organisations** section: pick an Org, tick which models go in each of its three lists (all models shown, grouped by provider; Anthropic pre-ticked), save. A "Reset to all Anthropic" button.
- **OrgAdmin → AI Models tile (new, under the Org admin area, `/dashboard/org-admin/ai-models`):** the same three pickers as today's tile, but each offers only the Org's list. Shows the one currently in force per purpose. If a list has a single entry the picker is read-only with that name.
- **Users:** the model drop-downs (`ModelSelect`, Regenerate model chooser, AI panels, AI Generate screens, comparison launch) disappear for non-SuperAdmins. `GET /api/ai/models` returns `403`/empty for them (the SuperAdmin path keeps `?saMode=1`). Regenerate becomes a plain button using the Org's model.
- **Phone (`/m`):** same — no picker; confirm nothing there names a model.

### 2.4 Hiding the model from users (requirement 4) — the audit

Visible only when the viewer is an OrgAdmin of the diagram's Org or a SuperAdmin (a single helper `canSeeModelNames(session)`). Places found so far, each to be fixed and then pinned by a test:

1. AI Generate screen status line: "Asking {modelLabel} for a plan…" → "Asking the AI for a plan…" (`AiGenerateScreen.tsx:809,981`).
2. Properties panel: "drawn by {model}" and "prompt written by {model}" (`PropertiesPanel.tsx:1212–1214`).
3. Every `ModelSelect` / picker and the "Compare all models" modal and its results.
4. API response fields `model`, `comparison.chosenModelId`, `usedModel` returned to the browser — dropped or blanked for non-privileged callers (they are also stored in the diagram's `aiGeneration.model`; the **stored** value stays for audit, the **display** is gated).
5. Error and toast messages that interpolate a model id or label (rate-limit, "model unavailable", gate notices, Voice Assist feedback line, the voice debug panel for non-SuperAdmin).
6. The AI usage page: already behind org/SuperAdmin; confirm the `byModel` breakdown is not visible to a plain user.
7. Exports (`.json`, bundle, backup) contain `aiGeneration.model` — kept (it is data the user owns), but flagged in Q5.
8. Help text, User Guide, Tech Notes and the Features catalogue (DB-held) — grep for model names in user-facing text.

A source-scan test lists every `aiModelLabel` / `.model` use in client code and requires it to sit behind `canSeeModelNames`.

### 2.4a Security note

Hiding in the UI is not enough: the **server** must not echo model ids to non-privileged callers and must not trust a `model` field from them. Both are in 2.2/2.4 and tested at the route level.

## 3. Slices (each ships on its own, suite green before each push)

| # | Slice | Contents | Size |
|---|---|---|---|
| 1 | Resolution + data | Offered/chosen storage helpers, default "all Anthropic" lists, `resolveModelFor`, route ratchet test; users' `model` ignored server-side. No UI change yet — behaviour for a plain user becomes "the Org's / global default". | M |
| 2 | SuperAdmin Organisations section | Per-Org list editor on the existing tile + API (SuperAdmin only, read-only impersonation blocked, audited) | M |
| 3 | OrgAdmin tile | New tile + API; reuses the existing AI Model client with the Org's lists; Org-admin guard | M |
| 4 | Remove the user pickers | `ModelSelect` & friends hidden for non-SuperAdmin; `/api/ai/models` locked; phone checked | S |
| 5 | Hide model names | The 8-point audit above, `canSeeModelNames`, response scrubbing, source-scan test | M |
| 6 | Docs + prod SQL | User Guide / Tech Notes sections (DB-held, idempotent SQL patch for the in-app Database tile), TESTS_SUMMARY, memory | S |

Prod SQL needed: documentation text only. **No schema change** with the AppSetting design, so no deploy step beyond the push.

## 4. Questions for you (each with my recommendation)

1. ~~Who counts as "OrgAdmin"?~~ **Answered (Paul, 2026-10-05):** there is one role, OrgAdmin (Owner and Admin are merged) — see `orgadmin-role-and-delete-rules-plan-2026-10-05.md`. Also decided there: OrgAdmins cannot delete anything; only SuperAdmin deletes or restores destructively.
2. **What do other roles/members see?** Nothing about models at all — no tile, no picker, no names. *Recommend:* as stated.
3. **Empty offered list:** treat as "use the global setting" (AI keeps working) rather than "AI off" — AI on/off stays on the existing `allowAi` switch. *Recommend:* yes.
4. **Bring-your-own-key users** (a user can store their own Anthropic/other key): today that unlocks models for them. With "users cannot choose", should their key *pay* but the Org's model still *run*? *Recommend:* yes — the key only changes who is billed; nobody but SuperAdmin picks the model.
5. **Stored model in diagrams / exports** (`aiGeneration.model`): keep the data (it is the audit trail and what "regenerate with the same model" needs), hide it on screen from plain users. Alternatively strip it on export. *Recommend:* keep stored, hide displayed, leave exports alone.
6. **SuperAdmin acting as a lower level** (the "Acting as" modes you use for video): should the model pickers hide in those modes, as they would for a real customer? *Recommend:* yes — the same rule as the acting-as banner (it must look like the real thing).
7. **Cost gate:** the "equal or cheaper" rule disappears for users (they cannot choose). Should OrgAdmin's pick also be limited by cost, or is "any model SuperAdmin put in my list" enough? *Recommend:* the list is the gate; no cost ceiling.
8. **Default lists for the three purposes:** Default = all Anthropic; Vision = all Anthropic with vision; Command = all Anthropic (Haiku 4.5 stays the shipped choice). *Recommend:* yes, as you said "all Anthropic models that are available".
9. **Existing Orgs today** (including yours and GetAI Org): start with all Anthropic offered and **chosen = whatever the global setting is now** (so nothing changes on the day this ships). *Recommend:* yes.

## 5. Risks

- A route that calls a provider without going through the new resolver would still pick its own model — hence the source-scan ratchet.
- Removing the user picker changes a visible control; the phone and the AI Generate screens must be checked by eye.
- A model id leaking through a message nobody thought of — hence the audit and the tests, but a human walk-through of the AI screens as a plain user is part of slice 5's acceptance.
