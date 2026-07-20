# 05 — Gating & Remediation Plan

*Concrete, code-level ways to **minimise or gate** every feature that could fail an enterprise audit — reusing patterns already in the codebase, phased from quick wins to strategic work. The goal is not to remove capability but to make each risky feature **governable per tenant** and **accountable**, so a cautious enterprise can be onboarded with safe defaults.*

## The core idea: a per-org Governance Policy + an "Enterprise Mode"

The codebase already proves the pattern with **`Org.allowCrossOrgSharing`** (a boolean on `Org`, edited through the gated `PUT /api/orgs/[id]/settings`, enforced where policy applies). Generalise it.

**1. Add policy columns to `Org`** (Prisma; `db push` auto-applies on deploy — no manual SQL):

```prisma
model Org {
  // … existing …
  allowCrossOrgSharing   Boolean @default(false)   // existing precedent
  allowAi                Boolean @default(true)     // ENT-05
  allowVoiceAi           Boolean @default(true)     // ENT-07 (Deepgram)
  allowExternalExport    Boolean @default(true)     // ENT-10, E8 (SharePoint upload, support attach)
  allowSharePoint        Boolean @default(true)     // E3
  allowSupportDiagram    Boolean @default(true)     // ENT-10 (strip diagram from support email)
  requireSso             Boolean @default(false)    // ENT-04 (block password login for members)
  aiRedaction            Boolean @default(false)    // ENT-06 (pseudonymise before egress)
}
```

**2. Add one helper**, analogous to the existing `gateFeature(userId, feature)`:

```ts
// app/lib/auth/orgPolicy.ts
export async function gateOrgPolicy(orgId: string, key: OrgPolicyKey): Promise<true> {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { [key]: true } });
  if (org && org[key] === false) throw new PolicyError(403, `Disabled by your organisation policy: ${key}`);
  return true;
}
```

**3. Enforce at route entry**, next to the existing `auth()`/`gateFeature` guards. E.g. every `/api/ai/**` route: `await gateOrgPolicy(orgId, "allowAi")`. SharePoint upload: `allowExternalExport && allowSharePoint`. Deepgram routes: `allowVoiceAi`.

**4. Expose in the existing org-settings UI** (`dashboard/admin/org-settings/OrgSettingsClient.tsx`) behind the already-correct gate (SuperAdmin + OrgOwner/Admin, blocks read-only impersonation). *Consider making the most sensitive flags (e.g. `allowAi`) **SuperAdmin-only to change**, so an OrgAdmin can't loosen a policy the enterprise set.*

**5. "Enterprise Mode"** — one switch that sets safe defaults for a tenant: `allowAi=false` (or proxied), `allowVoiceAi=false`, `allowExternalExport=false`, `requireSso=true`, plus audit-on. Store as an org preset; document it as the recommended configuration for regulated customers. This gives sales/onboarding a single, defensible answer to "can you lock it down?".

This one mechanism closes ENT-05, ENT-07, ENT-10, ENT-15 (make cross-org SuperAdmin-only), and contributes to ENT-04/06 — reusing proven authZ and giving real FK-backed per-tenant isolation (unlike overloading the global `AppSetting`).

---

## Priority 0 — Quick wins (small, high-value, low-risk)

| # | Change | Closes | Sketch |
|---|---|---|---|
| P0-1 | **`ANTHROPIC_BASE_URL` seam** | ENT-08 | `new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL })` in the ~11 client constructions (or one shared factory). Lets a deployment route AI through the customer's proxy / gateway / Bedrock-compatible endpoint. One-line-per-site. |
| P0-2 | **Per-org `allowAi` / `allowVoiceAi`** | ENT-05, ENT-07 | The policy mechanism above, applied to `/api/ai/**`, mining discover/explain/assess, and the two Deepgram routes. |
| P0-3 | **Fix `PUT /api/account` authZ** | ENT-11 | Require Owner/Admin for org name/entityType edits (match `orgs/[id]/settings`); raise the password-change minimum to 8. |
| P0-4 | **Scrub content from logs** | ENT-16 | Gate the payload `console.log`/`console.error` in `email.ts:111-118`, `exportVisio.ts:384-389`, `export/visio-v2/route.ts:62`, `planBpmn.ts:412-413`, `planFlowchart.ts:131` behind a `DEBUG_CONTENT_LOGS` flag (default off); log ids/counts only. |
| P0-5 | **HttpOnly impersonation cookies** | ENT-02 (partial) | Set the impersonation cookies `httpOnly: true`; deliver the "you are impersonating" banner from a server-rendered flag instead of client-readable cookie. |
| P0-6 | **Route the 3 hard-coded-model features through the admin picker** | ENT (AI mgmt) | `staff-narrative`, `refine-transcript`, `assess` should use `getAiGenerateModel()` so model choice is centrally controlled and lockable. |
| P0-7 | **Strip diagram from support email when `allowSupportDiagram=false`** | ENT-10 | Conditionally omit the diagram JSON + screenshot attachment in `email.ts` support sender. |

## Priority 1 — Accountability & identity (the audit-blockers)

| # | Change | Closes | Sketch |
|---|---|---|---|
| P1-1 | **Audit log table + `recordAudit()`** | ENT-03 | New `AuditLog { id, actorUserId, effectiveUserId, orgId, action, targetType, targetId, meta Json, ip, at }`. Call it on: impersonation start/stop **and every mutating action while impersonating**, all exports/backups, full-backup + wipe, user delete, share create/revoke, cross-org toggle, and (optionally) each AI egress with a content hash. Add a SuperAdmin viewer + retention policy. **Highest leverage** — converts ENT-01/02/19 from invisible to detectable. |
| P1-2 | **Harden impersonation** | ENT-02 | Log every session (P1-1); make **`edit` mode opt-in** (default `view`), time-box tighter, and show the target an indicator. Consider requiring a reason string that's stored. |
| P1-3 | **SuperAdmin → stored role + MFA + break-glass log** | ENT-01 | Replace the email allowlist with a `User.isSuperAdmin` (or a `Role`), grant/revoke via a logged action, require MFA on those accounts, and log every privileged action (P1-1). Keep the allowlist only as an initial bootstrap. |
| P1-4 | **Session policy** | ENT-13 | Set `session.maxAge` (e.g. 8–12 h) + idle handling; make it configurable so enterprises can tighten it. |
| P1-5 | **Gate full-backup wipe + notify** | ENT-01 | Keep `confirmPhrase`, add a logged audit event + optional second-person confirmation for the TRUNCATE restore; consider excluding credential columns from the default export. |

## Priority 2 — Enterprise identity & privacy

| # | Change | Closes | Sketch |
|---|---|---|---|
| P2-1 | **SAML / generic OIDC provider + SCIM (later)** | ENT-04 | Add a configurable SAML/OIDC provider (per-org IdP) alongside Entra; the enterprise brings their own IdP. Larger effort; the single biggest enabler for enterprise sales. |
| P2-2 | **`requireSso` + domain-restricted registration + email verification** | ENT-04 | When set, block password login for org members and disable open self-registration for that domain; verify email on signup. |
| P2-3 | **GDPR self-erasure** | ENT-12 | Add `DELETE /api/account` (self-service) that cascades cleanly, reassigns/cleans orphan orgs, and anonymises published-version authorship; provide an admin-initiated erasure with the same cleanup. |
| P2-4 | **Pre-egress AI redaction** | ENT-06 | When `aiRedaction` is on, pseudonymise people/team/system names **before** the prompt leaves the tenant (map → placeholder → restore on the way back), rather than asking the model to anonymise its output. Prioritise staff-narrative & transcript. |
| P2-5 | **Least-privilege Graph scopes** | ENT-09 | Offer a `Files.ReadWrite.Selected` / narrower-scope build for customers who object to `Files.ReadWrite.All`; document why the broad scope is requested. |
| P2-6 | **AI content-retention controls** | ENT-14 | Make `Diagram.aiComparison` persistence opt-in / purgeable; add retention/TTL to notifications and usage counters. |

## Priority 3 — Contract & documentation (no code, but required by audits)

- **Anthropic Zero-Data-Retention & no-training** — arrange at the account level and document it in the DPA; note that ENT-08's proxy seam lets a customer avoid the shared endpoint entirely.
- **Deepgram** — DPA + retention terms, or ship a build that disables voice (`allowVoiceAi=false`) for customers who won't accept a voice sub-processor.
- **Sub-processor list & data-flow diagram** — publish Anthropic, Deepgram, Microsoft, Stripe, Azure (hosting, Australia East) as sub-processors, referencing [01-data-egress-map.md](01-data-egress-map.md).
- **Data residency statement** — app data at rest is Azure Australia East; AI processing location is governed by the Anthropic/Deepgram terms (or a customer proxy under ENT-08).

---

## Suggested sequencing

1. **Sprint 1 (P0):** AI proxy seam, per-org AI/voice/export flags, `/api/account` fix, log scrub, HttpOnly cookies, model-picker routing. → Immediately lets you say "AI can be disabled or proxied per tenant, external export can be blocked, and admin cookies are hardened." Unblocks many procurement checklists.
2. **Sprint 2 (P1):** Audit log + impersonation hardening + SuperAdmin role/MFA + session policy. → Turns the critical findings from unaccountable to accountable.
3. **Sprint 3+ (P2/P3):** SAML/OIDC, GDPR erasure, redaction, contracts/docs. → Full enterprise readiness.

Each change is small and localised; none require a re-architecture. The `Org`-policy + `gateOrgPolicy` + audit-log trio does the heavy lifting, and it slots directly into the existing `auth()` / `gateFeature` / `orgContext` spine and the org-settings UI.
