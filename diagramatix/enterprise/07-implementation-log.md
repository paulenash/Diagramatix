# 07 — Implementation Log

*A living record of the enterprise-readiness build: what shipped, where, which findings it closed, and exactly how to continue. Read this first if you're picking the work up later. Newest phase at the top. Findings referenced as `ENT-nn` (see [04-findings-register.md](04-findings-register.md)); the roadmap is [06-enterprise-readiness-plan.md](06-enterprise-readiness-plan.md).*

## Status snapshot

| Phase | Scope | State |
|---|---|---|
| Analysis + plan | docs 00–06 | ✅ shipped (`e21cf62b`) |
| **A1** Governance foundations | policy engine, AI proxy seam, quick fixes | ✅ **shipped** (`98f3e996`, `2f54b363`, `b3b1c0c3`, status `e794779a`) |
| **A2** Accountability | audit log, impersonation hardening, session policy, acting-view downgrade | 🟡 **mostly shipped** — A2c (SuperAdmin role + MFA) deferred |
| **A3** Enterprise identity & privacy | GDPR erasure, AI retention, require-SSO + reg. hardening (shipped); SAML/OIDC+SCIM, email-verify, AI redaction, dedicated-instance (deferred) | 🟡 **partly shipped** |
| B | Deployment tiers (dedicated instance) | ⬜ planned |
| C | Questionnaire pack + SOC 2 Type II | ⬜ planned |

**Findings closed so far:** ENT-03, ENT-05, ENT-07, ENT-08, ENT-10, ENT-11, ENT-12, ENT-13, ENT-14, ENT-16 (full); ENT-02 (audit + reason + time-box + HttpOnly — remaining: per-mutation logging), ENT-04 (require-SSO + domain-restricted reg — remaining: SAML/OIDC + MFA + email verify), ENT-15 (partial).
**Still open (high):** ENT-01 (SuperAdmin emails → stored role + MFA, A2c deferred), ENT-06 (reversible pre-egress AI redaction, deferred). Deferred mega-items: full SSO/SAML/OIDC+SCIM, email verification, dedicated single-tenant instance tier.

**Resume here:** read this file top-to-bottom (status snapshot → phase sections → "continue here"/deferred blocks). Remaining work, roughly ordered: (1) A2c SuperAdmin stored role + MFA, (2) full SSO/SAML/OIDC per-org + SCIM, (3) email verification, (4) AI redaction (ENT-06), (5) dedicated single-tenant instance tier + SOC 2 evidence pack. Each is independently shippable; conventions at the end of this file.

---

## Phase A1 — Governance foundations ✅ (2026-07-20)

### A1a — Anthropic proxy seam + one admin-controlled model (`98f3e996`) — ENT-08
- **New** `app/lib/ai/anthropicClient.ts` — `makeAnthropic(apiKey)` honours `ANTHROPIC_BASE_URL` (route all Claude traffic via an enterprise proxy / private gateway / region-pinned endpoint). Documented in `.env.example`.
- All **10** `new Anthropic({...})` sites now call `makeAnthropic()` (`planBpmn`, `planFlowchart`, `planGeneric`, `refineQuestions`, `refineFlowchartBpmn`, `staffNarrative`, `explainResults`, `assessFacts`, `generate-diagram/route`, `audio/refine-transcript/route`).
- `staffNarrative`, `refine-transcript`, `assessFacts` no longer pin their own model — they use `getAiGenerateModel()`. **⚠ Behaviour change:** those three now follow the global AI-model setting (default **Haiku**); they were Sonnet/Opus. Set the global model higher (SuperAdmin → AI Generate Model) to restore prior narrative/assessment quality.

### A1b — quick security fixes (`2f54b363`) — ENT-11, ENT-16, ENT-02 (partial)
- `app/api/account/route.ts`: editing org `name`/`entityType` now requires `requireOrgAdminFor` (Owner/Admin or SuperAdmin) — was ungated (ENT-11). Password-change minimum 6→8.
- `app/api/admin/impersonate/route.ts`: `dgx_view_as` / `dgx_view_as_mode` cookies are now `httpOnly:true` + `secure` in prod. The "impersonating" banner already runs off a **server-computed** flag, so nothing broke (ENT-02 partial; audit + edit-opt-in are A2).
- Content logs gated behind `DEBUG_CONTENT_LOGS` (default off): `email.ts` support message, `exportVisio.ts` page XML, `planBpmn`/`planFlowchart` raw model output (ENT-16).

### A1c — Organisation Policy engine + Enterprise Mode (`b3b1c0c3`) — ENT-05/07/10/15
The centrepiece: per-tenant governance the customer's own OrgAdmin controls, enforced server-side.
- **Schema** (`prisma/schema.prisma`, `Org`): `allowAi`, `allowVoiceAi`, `allowExternalExport`, `allowSharePoint`, `allowSupportDiagram` — all `@default(true)` (backward-compatible). Applied via `prisma db push` (auto-applies on Azure deploy).
- **`app/lib/auth/orgPolicy.ts`**: `ORG_POLICY_KEYS`, `getOrgPolicy(orgId)`, `orgPolicyAllows(session, key)`, and `gateOrgPolicy(session, key)` → returns a `403 NextResponse` (or `null`). Reads the caller's **active org** via `tryGetCurrentOrgId`; no active org → allowed (fail-open). Applies to everyone **including SuperAdmins** — the policy is the customer's.
- **Enforced at 19 routes** (pattern: `const blocked = await gateOrgPolicy(session, "allowAi"); if (blocked) return blocked;` right after the auth check):
  - `allowAi`: `generate-bpmn`, `generate-bpmn/compare`, `bpmn/plan`, `flowchart/plan`, `generate-diagram`, `bpmn/refine-questions`, `flowchart-to-bpmn/refine`, `staff-narrative`, `audio/refine-transcript`, mining `discover`/`discover-sm` (AI branch), mining `explain`, simulation `assess`.
  - `allowVoiceAi`: `audio/transcribe`, `dictation/token`.
  - `allowSharePoint`: `sharepoint/route` (browse), `sharepoint/download`; **upload** gated on `allowSharePoint` **and** `allowExternalExport`.
  - `allowSupportDiagram`: `support/diagram` — when off, sends the note **without** the diagram JSON/screenshot and **skips** the vendor Support-project copy.
- **UI + API**: `app/api/orgs/[id]/settings` (GET/PUT) now read/write the 5 flags (editable by the org's own Owner/Admin, same gate as `allowCrossOrgSharing`). `OrgSettingsClient.tsx` gained a **"Data & AI Governance"** card with per-capability toggles + an **"Apply Enterprise Mode"** button (turns all 5 off + cross-org sharing off in one save). `org-settings/page.tsx` selects/maps the new fields.
- **Tests**: `tests/enterprise/org-policy.test.ts` (T0921–T0922). Full suite 1130 green.

### A1c refinement — SuperAdmin 3-way view + live UI gating (`0830a225`)
- **Policy binding rule:** the org policy binds everyone **except a SuperAdmin in the full "superadmin" view**. A SuperAdmin (the vendor operator) keeps full access by default; cycling the logo to **orgadmin** or **user** makes the policy apply (and is how you demo it).
- **`useSuperAdminChrome` is now tri-state** — logo double-click cycles `superadmin → orgadmin → user → superadmin`. It returns `{ mode, hidden, toggle }`; `hidden = mode !== "superadmin"` keeps all existing consumers working. `orgadmin` view also shows the **OrgAdmin button** (`DashboardClient`). Mode is mirrored to the **`dgx_sa_mode` cookie** (server-readable) and **versioned to `NEXT_PUBLIC_COMMIT_COUNT`** so it **resets to superadmin on every deploy**.
- **Enforcement is now UI + server:** `orgPolicy.ts` `policyBindsCaller()` reads `dgx_sa_mode`; new **`GET /api/org/policy`** + **`useOrgPolicy()`** hook let the client hide capabilities live. First applied to the Diagram toolbar **AI Generate** button (hidden when AI disallowed for the current view). *Follow-up: extend UI hiding to the other gated entry points (voice mic, SharePoint import/export, APQC create) using the same hook.*
- **Airtight OrgAdmin view:** the OrgAdmin button lands on the OrgAdmin screen (`org-admin/page.tsx` skips the SuperAdmin redirect in orgadmin view). New `isActingSuperuser(session)` (`orgPolicy.ts`) = superuser **and** superadmin view — used **instead of `isSuperuser`** on the SuperAdmin *surfaces* reachable from the OrgAdmin screen (`/dashboard/admin`, `org-settings`, `sharing`) so they render the OrgAdmin-scoped view (no SuperAdmin Tools / org-picker / delete). Deep API authorisation still uses the real `isSuperuser`; this only governs what the acting view exposes. (Direct URL-typing of a deeper SuperAdmin sub-page is out of scope — those aren't reachable via the OrgAdmin UI.)

### Runbook — add a new org policy flag (reuse this pattern)
1. Add `allowX Boolean @default(true)` to `Org` in `prisma/schema.prisma`; `npx prisma db push && npx prisma generate`.
2. Add `"allowX"` to `OrgPolicyKey` / `ORG_POLICY_KEYS` + a message in `ORG_POLICY_MESSAGES`, and the field to `getOrgPolicy`'s select/return (`app/lib/auth/orgPolicy.ts`).
3. Enforce: `const b = await gateOrgPolicy(session, "allowX"); if (b) return b;` after the route's auth check (or `orgPolicyAllows(...)` for conditional behaviour).
4. Surface: add the field to the settings route GET select + PUT (already loops `ORG_POLICY_KEYS`), add a row to `POLICY_FIELDS` in `OrgSettingsClient.tsx`, and to the `org-settings/page.tsx` select + `OrgDetail` map + Enterprise-Mode `off` object.

---

## Phase A2 — Accountability 🟡 (2026-07-20)

- **A2a — Audit log** (`1e76adf4`, ENT-03): `AuditLog` table (append-only) + `recordAudit()` (`app/lib/audit.ts`; never throws; `meta` = JSON string of ids/counts/modes only). Instrumented: impersonation start/stop, full-backup export + **wipe**, org-admin backup, user delete, org settings/policy updates. SuperAdmin **Audit Log** viewer page + tile. *Follow-ups: share create/revoke, per-mutation-while-impersonating logging, optional AI-egress logging, retention/TTL.*
- **A2b — Impersonation hardening** (`a04b5fc7`, ENT-02): edit mode requires a **reason** (PromptDialog → stored in the audit start entry) and is **time-boxed to 1h** (view stays 8h, default). *Follow-up: log every mutation taken while impersonating.*
- **A2d — Session policy** (`60545c8b`, ENT-13): configurable `maxAge` (default 7-day cap) + daily `updateAge` in `auth.config.ts`; env `AUTH_SESSION_MAX_AGE` / `AUTH_SESSION_UPDATE_AGE`.
- **A2e — Acting-view downgrade (pages)** (`95c9795b`): swapped `isSuperuser` → `isActingSuperuser` on **all 22** `/dashboard/admin/**` pages, so a SuperAdmin in orgadmin/user view can't reach SuperAdmin surfaces by URL either (super-only pages redirect; dual pages fall to their OrgAdmin branch). *Remaining: SuperAdmin-only **API routes** still use real `isSuperuser` — needs the downgrade-vs-keep enumeration (impersonation/backup/break-glass keep it).*

### Deferred — A2c: SuperAdmin → stored role + MFA (ENT-01)
Security-critical auth change; needs a dedicated session. Plan: replace the `SUPERUSER_EMAILS` allowlist (`app/lib/superuser.ts`) with a `User.isSuperAdmin` flag (or role) granted/revoked via a **logged** action (bootstrap the allowlist once), keeping the change **behind `isSuperuser(session)`** so the many call sites don't move. **MFA** (TOTP enrol + recovery codes + verify step) is a whole feature — scope it separately. Until done, ENT-01's "3 hard-coded emails" remains, but is now **detectable** via the audit log (A2a).

## Then — Phase A3 / B / C (see [06](06-enterprise-readiness-plan.md))
- A3: SAML/generic-OIDC + `requireSso` enforcement + SCIM; GDPR self-erasure (`DELETE /api/account`); pre-egress AI redaction (`aiRedaction` flag, prioritise narrative/transcript); least-privilege Graph scope option.
- B: dedicated single-tenant instance (parameterise `azure-deploy.yml` per instance: region, keys, secrets; ops runbook).
- C: questionnaire pack (data-flow from doc 01, sub-processor list, DPA, SIG/CAIQ answers) now; SOC 2 Type II via Vanta/Drata once pipeline justifies.

## Phase A3 — Enterprise identity & privacy 🟡 (2026-07-20)

- **A3a — GDPR self-service erasure** (`a2b385cd`, ENT-12): `DELETE /api/account` (type-your-email confirm) → `app/lib/account/eraseUser.ts` deletes the user (cascade) + removes any org they leave completely empty (Project/Diagram are `onDelete:Restrict` on the org, so a shared org is skipped, never errored). Blocked for SuperAdmins + while impersonating; audited (`user.self-delete`). "Delete my account" danger zone in the Account modal. Tests T0925-T0927.
- **A3b — AI content retention** (`cf70552b`, ENT-14): the SuperAdmin model-comparison result no longer persists the raw prompt (customer content) — only its length; retaining the text is opt-in via `AI_COMPARE_STORE_PROMPT=1`.
- **A3d — Identity hardening** (`66b1e4c6`, ENT-04 partial): `Org.requireSso` — when on, `verifyCredentials` blocks password login for that org's members (must use Microsoft SSO; returns null to preserve the timing/enum profile), toggle in Org Settings. `REGISTRATION_ALLOWED_DOMAINS` env — optional self-registration domain allowlist (`registerUser` → 403). Tests T0928-T0930.

### Deferred — A3 mega-items (dedicated sessions)
- **Full SSO/SAML + generic OIDC per-org + SCIM** (ENT-04 core) — a large auth-core feature (per-org IdP config, SAML library, callback routes). `requireSso` (A3d) already leverages the existing Entra SSO; this is the customer-brings-their-own-IdP piece. **Direction chosen: buy, not build → WorkOS (recommended) vs Auth0 — see the decision doc [08](08-sso-vendor-decision.md).** Pairs with A2c (MFA): decide the platform question first.
- **Email verification** on signup — a full token+email+verify+login-gate flow (reuse the password-reset token pattern).
- **Reversible pre-egress AI redaction** (ENT-06) — pseudonymise people/team/system names before the prompt leaves the tenant, restore in the output (`aiRedaction` org flag). Complex (reversible mapping over free-text); prioritise staff-narrative + transcript.
- **Dedicated single-tenant instance tier** (Workstream B) — parameterise `azure-deploy.yml` per instance (region, keys, secrets) + an ops runbook.

## Local / on-prem LLM (`90ef4cb5`)
On top of the `ANTHROPIC_BASE_URL` seam: **`AI_CUSTOM_MODELS`** (comma-separated `id|Label`) registers non-Claude models so they pass validation (`models.ts` `customModels()`/`allModels()`), appear in the SuperAdmin AI-Generate picker, and can be the default. Point `ANTHROPIC_BASE_URL` at a local Anthropic-compatible gateway (LiteLLM → vLLM/Ollama) and an air-gapped tenant runs AI Generate on a local model. Tests T0931-T0933. Full guide + AI-off impacts + posture spectrum in [09](09-ai-off-and-local-llm.md). Remaining for full on-prem: multimodal model for image/PDF ingestion (customer infra) + the dedicated-instance packaging (Workstream B).

## Deterministic AI-off fallbacks — 3 cheap wins (`68a83e2e`)
Three AI *narration* features are layered on numbers the platform already computes, so with AI off they now **degrade gracefully to a templated summary** instead of a 403/hidden button:
- **Mining "Results summary"** — `summariseMiningResults()` in `explainResults.ts`; the `.../explain` route branches on `orgPolicyAllows("allowAi") && ANTHROPIC_API_KEY`, returning `{ explanation, deterministic: true }` when off. The console card stays visible and relabels *Explain results → Results summary*. Tests T0934-T0935.
- **Simulation "Comparison summary"** — `summariseComparison()` in `assessFacts.ts`; the `.../assess` route branches the same way (`{ assessment, facts, deterministic: true }`). `CompareView` relabels *Explain these results → Comparison summary* via `useAiAllowed()`. Tests T0936-T0937.
- **"Process description"** — a standalone **Diagram ▾ menu** entry (always available) that renders `buildPromptFromDiagram()` in a modal with Copy. The deterministic counterpart of the AI staff narrative, reachable even when the AI panel is hidden.

True AI-only features (generation, Refine, AI-curate, model compare) have no deterministic equivalent and stay fully gated/hidden. Detail + posture spectrum in [09](09-ai-off-and-local-llm.md).

## Collateral kept in sync
- **Feature catalog** — `scripts/add-features-enterprise-governance.ts` (a LIVING draft entry "Enterprise Governance & Security"; upserts-and-updates on every run, incl. on deploy). Lands as a **draft** — a SuperAdmin clicks Publish in `/dashboard/admin/features` to make it public.
- **Technical Design Notes** — `scripts/add-tech-design-enterprise-governance.ts` (a section under the `identity-access` chapter; upsert-by-heading, re-runs on deploy). Read at `/tech-notes`.
- Both are wired into the deploy seed list (`.github/workflows/azure-deploy.yml`, after `add-tech-design-notes.ts`).
- **XSD (`public/diagramatix-export.xsd`) & Logical DDL (`app/lib/diagram/ddlGenerate.ts`)** — **no change**: they describe the *diagram export* data structure, which the governance work (DB tables + auth) does not touch. The XSD version is templated from `SCHEMA_VERSION` (1.41). The **Physical DDL** (`physicalDdl.ts`) is generated from the live DB, so it auto-includes `AuditLog` + the `Org` policy columns.
- **`.env.example`** — documents `ANTHROPIC_BASE_URL`, `AUTH_SESSION_MAX_AGE`, `AUTH_SESSION_UPDATE_AGE`.
- *Not yet done (candidate):* an OrgAdmin-facing **User Guide** section on the Data & AI Governance panel (`add-guide-*.ts` pattern) — the tech notes above are SuperAdmin-only.

## Conventions for continuing
- Commit per sub-phase; run `npm run build` + `npx vitest run` before pushing; push to `main` (Azure auto-deploys + runs `prisma db push`).
- Test numbers are append-only `Tnnnn` from the highest (currently **T0922**).
- Keep this log updated at the top of each phase so the next session can continue without re-deriving state.
