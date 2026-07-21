# 07 — Implementation Log

*A living record of the enterprise-readiness build: what shipped, where, which findings it closed, and exactly how to continue. Read this first if you're picking the work up later. Newest phase at the top. Findings referenced as `ENT-nn` (see [04-findings-register.md](04-findings-register.md)); the roadmap is [06-enterprise-readiness-plan.md](06-enterprise-readiness-plan.md).*

## Status snapshot

| Phase | Scope | State |
|---|---|---|
| Analysis + plan | docs 00–06 | ✅ shipped (`e21cf62b`) |
| **A1** Governance foundations | policy engine, AI proxy seam, quick fixes | ✅ **shipped** (`98f3e996`, `2f54b363`, `b3b1c0c3`, status `e794779a`) |
| **A2** Accountability | audit log, impersonation hardening, SuperAdmin role+MFA, session policy | ⬜ **next** |
| **A3** Enterprise identity & privacy | SAML/OIDC+SCIM, GDPR erasure, AI redaction, dedicated-instance tier | ⬜ planned |
| B | Deployment tiers (dedicated instance) | ⬜ planned |
| C | Questionnaire pack + SOC 2 Type II | ⬜ planned |

**Findings closed so far:** ENT-05, ENT-07, ENT-08, ENT-10, ENT-11, ENT-16 (full); ENT-02, ENT-15 (partial).
**Still open (high):** ENT-01 (SuperAdmin emails), ENT-03 (no audit log), ENT-04 (no SAML/MFA), ENT-06 (AI content minimisation).

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

## Next — Phase A2 (accountability): where to start

Goal: make privileged/data actions **attributable**. This converts ENT-01/02/19 from invisible to detectable and is the biggest remaining trust win.

1. **Audit log** (ENT-03) — new Prisma model, e.g. `AuditLog { id, at, actorUserId, effectiveUserId, orgId?, action, targetType?, targetId?, meta Json, ip? }` + a `recordAudit(...)` helper (`app/lib/audit.ts`). Call it on: impersonation start/stop **and each mutation while impersonating** (`getViewAsUserId` is the seam), all exports/backups (`admin/full-backup`, `org-admin/backup`, Visio/docx/bundle export routes), full-backup **wipe**, user delete, share create/revoke, org policy changes, and (optionally) each AI egress with a content hash. Add a SuperAdmin viewer page + a retention/TTL.
2. **Impersonation hardening** (ENT-02) — default `view`, make `edit` opt-in with a stored reason, tighter time-box, target-visible indicator; log every session via `recordAudit`.
3. **SuperAdmin → stored role + MFA** (ENT-01) — replace the `SUPERUSER_EMAILS` allowlist (`app/lib/superuser.ts`) with a `User.isSuperAdmin` flag (or a role), granted/revoked via a logged action; require MFA on those accounts; keep the allowlist only as a bootstrap fallback. Touches every `isSuperuser(session)` call site (many) — do it behind the same helper so call sites don't change.
4. **Session policy** (ENT-13) — set `session.maxAge` + idle handling in `auth.config.ts`; make configurable.
5. **Acting-view = true server-side downgrade** (folded in from A1) — today `isActingSuperuser` gates only the SuperAdmin *surfaces reachable via the OrgAdmin UI* (`/dashboard/admin`, `org-settings`, `sharing`); a deep URL-typed SuperAdmin sub-page still opens as SuperAdmin. In A2, make the acting view authoritative everywhere: gate **all** `/dashboard/admin/**` pages + SuperAdmin-only API routes on `isActingSuperuser` (or an `effectiveIsSuperuser(session)` helper), so a SuperAdmin in orgadmin/user view is fully treated as that role. **Design notes:** (a) real `isSuperuser` must remain for impersonation/backup/break-glass paths a presenting SuperAdmin shouldn't lose — enumerate which routes downgrade vs stay; (b) pair with the **audit log** so switching views and any privileged action are recorded; (c) the switch is a client cookie (`dgx_sa_mode`) — treat it as a *view preference*, not a security boundary (a determined SuperAdmin can unset it), so this is UX-correctness + demo-integrity, not a trust boundary. Wire it through the same `SA_MODE_COOKIE` seam.

## Then — Phase A3 / B / C (see [06](06-enterprise-readiness-plan.md))
- A3: SAML/generic-OIDC + `requireSso` enforcement + SCIM; GDPR self-erasure (`DELETE /api/account`); pre-egress AI redaction (`aiRedaction` flag, prioritise narrative/transcript); least-privilege Graph scope option.
- B: dedicated single-tenant instance (parameterise `azure-deploy.yml` per instance: region, keys, secrets; ops runbook).
- C: questionnaire pack (data-flow from doc 01, sub-processor list, DPA, SIG/CAIQ answers) now; SOC 2 Type II via Vanta/Drata once pipeline justifies.

## Conventions for continuing
- Commit per sub-phase; run `npm run build` + `npx vitest run` before pushing; push to `main` (Azure auto-deploys + runs `prisma db push`).
- Test numbers are append-only `Tnnnn` from the highest (currently **T0922**).
- Keep this log updated at the top of each phase so the next session can continue without re-deriving state.
