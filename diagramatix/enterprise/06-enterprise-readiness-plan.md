# 06 — Enterprise Readiness Plan

*How we turn the audit findings into the ability to credibly sell into enterprises that make us adhere to **their** policy settings. Built on two decisions: (1) stay multi-tenant SaaS but offer a **dedicated single-tenant instance** for the strictest customers; (2) become **questionnaire-ready now** and run **SOC 2 Type II in parallel** once the pipeline justifies it.*

## North star

An enterprise buyer needs three things before they'll trust us with their process data. Everything below ladders up to these:

1. **Their policies, enforced by us** — their admins decide whether AI is used, where data can go, whether SSO is mandatory, whether external export is allowed — and the platform *enforces it*, per tenant. This is the product centrepiece.
2. **Accountability** — strong identity (SSO/MFA) and a tamper-evident **audit log** so they can verify who did what, including us.
3. **Assurance** — evidence they can hand their risk team today (data-flow, sub-processors, DPA, questionnaire answers), a **dedicated deployment** option for isolation/residency, and **SOC 2** on the way.

The plan is three parallel workstreams — **A: Product Controls**, **B: Deployment Tiers**, **C: Compliance & GTM Evidence** — sequenced so each phase unlocks a concrete, defensible sales claim.

---

## The product centrepiece: an "Organisation Policy" surface

The single most important build is to make **per-tenant governance a first-class, customer-admin-configurable product feature** — literally "adhere to their policy settings." It reuses the existing `Org.allowCrossOrgSharing` pattern + the `gateFeature` route wrapper (see [05](05-gating-and-remediation-plan.md) for the mechanism). We expose it as an **Organisation Policy** screen the customer's own OrgAdmin controls (with the most sensitive flags optionally locked by contract to vendor-set).

**Policy matrix — what a customer can dictate, and how we enforce it:**

| Their policy | Setting | Enforced at | Closes |
|---|---|---|---|
| "No third-party AI on our data" | `allowAi = false` | every `/api/ai/**`, mining AI, narrative, assess | ENT-05 |
| "No voice/recording to third parties" | `allowVoiceAi = false` | Deepgram transcribe + dictation routes | ENT-07 |
| "AI only via our gateway/region" | `ANTHROPIC_BASE_URL` (per-deployment) | Anthropic client factory | ENT-08 |
| "Anonymise before sending to AI" | `aiRedaction = true` | pre-egress redaction (narrative/transcript) | ENT-06 |
| "No exporting our data out of the tool" | `allowExternalExport = false` | SharePoint upload, support-email attach, (opt.) file exports | ENT-10, E8 |
| "No SharePoint/OneDrive connector" | `allowSharePoint = false` | SharePoint routes | E3 |
| "SSO mandatory, no passwords" | `requireSso = true` | login path for org members | ENT-04 |
| "No cross-org sharing, ever" | lock `allowCrossOrgSharing` to vendor-set | share creation | ENT-15 |
| "Prove access to our data" | audit log (always on) | central `recordAudit()` | ENT-03 |

**"Enterprise Mode"** = one preset that sets safe defaults (AI off-or-proxied, voice off, external export off, SSO required, audit on). It's both an onboarding shortcut and a one-line answer to "can you lock it down to our policy?"

---

## Workstream A — Product controls (closes the audit)

Indicative sizing for a small team; phases can overlap. Findings in **bold** are the audit blockers.

### Phase A1 — Governance foundations *(≈ weeks 1–4)* — ✅ SHIPPED 2026-07-20 (see [07](07-implementation-log.md))
- **Organisation Policy engine**: `Org` policy columns + `gateOrgPolicy()` helper + org-settings UI + Enterprise-Mode preset. → closes **ENT-05**, ENT-07, ENT-10, ENT-15.
- **`ANTHROPIC_BASE_URL` seam** + route the 3 hard-coded-model AI features through the admin picker. → ENT-08, AI-management.
- **Quick fixes**: `/api/account` authZ + password-policy alignment (ENT-11); scrub process content from server logs (ENT-16); HttpOnly impersonation cookies (part of ENT-02).
- **Sales claim unlocked:** *"AI, voice and external export can be disabled or proxied per tenant; your admins control it."*

### Phase A2 — Accountability *(≈ weeks 3–8, the blocker-killers)*
- **Audit log** (`AuditLog` + `recordAudit()`): impersonation start/stop + all actions-while-impersonating, exports/backups, full-backup/wipe, user delete, share changes, policy changes, AI egress (hashed). SuperAdmin viewer + retention. → closes **ENT-03**, makes **ENT-01/02/19** detectable.
- **Impersonation hardening**: default `view`-only, opt-in `edit` with stored reason, tighter time-box, target indicator. → **ENT-02**.
- **SuperAdmin as a stored role + MFA + break-glass logging** (retire the hard-coded email allowlist to a bootstrap-only fallback). → **ENT-01**.
- **Session policy**: configurable `maxAge` + idle timeout. → ENT-13.
- **Sales claim unlocked:** *"Every privileged action, including ours, is logged and attributable; admin access is MFA-gated and least-privilege."*

### Phase A3 — Enterprise identity & privacy *(≈ weeks 8–16)*
- **SSO/SAML + generic OIDC** (customer brings their IdP) + `requireSso` enforcement + domain-restricted registration + email verification; **SCIM** provisioning as a fast-follow. → **ENT-04**.
- **GDPR self-erasure** (`DELETE /api/account`) with orphan-org cleanup + authorship anonymisation. → ENT-12.
- **Pre-egress AI redaction** for narrative/transcript. → ENT-06.
- **AI content retention controls** (`aiComparison` opt-in/purgeable, TTLs). → ENT-14.
- Least-privilege Graph scope option (ENT-09); Stripe/optional-integration feature flags (ENT-20).
- **Sales claim unlocked:** *"Use your own IdP with MFA; we honour data-subject erasure and minimise what AI ever sees."*

## Workstream B — Deployment tiers (isolation & residency)

Deliver the isolation/residency story your strict customers will demand, without re-architecting for everyone.

- **Tier 1 — Shared SaaS** (today, hardened by Workstream A). Australia East. Default for most.
- **Tier 2 — Dedicated instance** *(≈ weeks 6–14, packaged from the existing Azure deploy)*: single-tenant App Service + isolated Postgres, **customer-chosen region**, **their own AI key or `ANTHROPIC_BASE_URL`** (or AI fully off), isolated backups, optional private networking. This is the answer to "our data can't share infrastructure / must stay in-region." Reuses `.github/workflows/azure-deploy.yml`; the work is parameterising region/keys/secrets per instance and an operational runbook (provisioning, updates, monitoring, DR).
- **Tier 3 — Customer-hosted / BYO-cloud**: *on the roadmap, not committed now.* Revisit when a deal requires the customer to run it in their own tenant. (`output: standalone` already gives us a self-contained server as a starting point.)
- **Sales claim unlocked (Tier 2):** *"We'll run a dedicated instance in your region, with your AI keys or none at all."*

## Workstream C — Compliance & GTM evidence

### Now — Questionnaire-ready *(≈ weeks 1–6, parallel to A1/A2)*
Assemble the pack a customer's risk team asks for, most of it derivable from this analysis:
- **Data-flow / sub-processor list** (from [01](01-data-egress-map.md)): Anthropic, Deepgram, Microsoft, Stripe, Azure (hosting, Australia East).
- **Security whitepaper** + **SIG-Lite / CAIQ** answers (from [03](03-access-control-tenancy-audit.md) + [04](04-findings-register.md)).
- **DPA template** + Anthropic **Zero-Data-Retention / no-training** and Deepgram terms arranged at the account level and referenced.
- **Third-party penetration test** (annual) + dependency/secret scanning in CI; a short **incident-response** and **backup/BCP** summary.
- **Sales claim unlocked:** *"Here is our data-flow, sub-processor list, DPA and completed security questionnaire."*

### In parallel — SOC 2 Type II *(kick off ≈ Month 2, report ≈ Months 9–12)*
- Scope: **Security + Confidentiality** first (add Availability/Privacy later).
- Use a compliance-automation platform (Vanta/Drata/Secureframe) to codify policies + collect evidence; run a gap assessment; **Type I** as an early milestone, then a 3–6 month observation window to **Type II**.
- The Workstream-A controls (audit log, SSO/MFA, least-privilege, change management) are exactly the evidence SOC 2 requires — so A and C reinforce each other.
- **Sales claim unlocked:** *"SOC 2 Type II report available under NDA."*

---

## Timeline & sales-claim ladder

| Milestone | ~When | Findings closed | What we can credibly tell an enterprise |
|---|---|---|---|
| **M1 — Governance foundations** (A1 ✅ + evidence pack ⬜) | ~Wk 4–6 | ENT-05/07/08/10/11/16 ✅ | "Your admins control AI, voice, export & sharing per tenant; here's our data-flow + questionnaire." |
| **M2 — Accountable & least-privilege** (A2) | ~Wk 8 | ENT-01/02/03/13/19 | "All access is logged & attributable; admin is MFA-gated; nothing your policy forbids can run." |
| **M3 — Your identity, your instance** (A3 + Tier 2) | ~Wk 14–16 | ENT-04/06/09/12/14 | "Bring your IdP + MFA; run a dedicated instance in your region with your AI keys or none." |
| **M4 — Certified** (SOC 2 Type II) | ~Mo 9–12 | assurance | "SOC 2 Type II under NDA." |

## How this maps to closing the audit

- **All 🔴 Critical + 🟠 High findings are closed by end of M2–M3** (the first ~14 weeks): ENT-01, 02, 03, 04, 05, 06, 07 → policy engine + audit log + SSO/MFA + AI governance + dedicated-instance/BYO-key.
- **All 🟡 Medium** are folded into A1/A3 and the evidence pack.
- **🟢 Low/Info** are cleanup items scheduled opportunistically.

## First two weeks — concrete start

1. Land the **`Org` policy columns + `gateOrgPolicy()` + Enterprise-Mode preset**, wired into `/api/ai/**` and export routes (biggest single unlock).
2. Add the **`ANTHROPIC_BASE_URL` seam** and route the 3 stray AI features through the model picker.
3. Ship the **quick fixes** (account authZ, password policy, log scrub, HttpOnly cookies).
4. Stand up the **`AuditLog` table + `recordAudit()`** and instrument impersonation + exports first.
5. Draft the **evidence pack v1** (data-flow + sub-processor list + questionnaire answers) from docs 01/03/04.

Everything here slots into the existing `auth()` / `gateFeature` / `orgContext` spine and the org-settings UI — no re-architecture, and each step is independently shippable and independently sellable.
