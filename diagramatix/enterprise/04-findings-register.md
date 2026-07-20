# 04 — Findings Register

*The consolidated audit view. Each finding has a severity, the evidence that produced it, the enterprise impact, and an indicative control-framework reference. Severity reflects impact × exploitability for a **large enterprise handling regulated/PII process data**; a small team may rate some lower. Remediation for every item is in [05-gating-and-remediation-plan.md](05-gating-and-remediation-plan.md).*

**Framework abbreviations (indicative):** SOC 2 (Trust Services Criteria), ISO = ISO/IEC 27001:2022 Annex A, GDPR (EU 2016/679), CPS = APRA CPS 234 / CPS 230 (relevant for Australian regulated customers).

## Register

| ID | Finding | Sev | Evidence | Framework touchpoints |
|---|---|:--:|---|---|
| **ENT-01** | SuperAdmin = 3 hard-coded emails; no MFA/rotation/logging; holds full-DB export (incl. credentials) + TRUNCATE-restore | 🔴 Crit | `superuser.ts:2-6`; `admin/full-backup/route.ts:44,161` | SOC 2 CC6.1/CC6.3; ISO A.5.15–A.5.18, A.8.2; CPS 234 |
| **ENT-02** | Impersonation is unaudited, supports full `edit` mutation of any tenant; cookies non-HttpOnly | 🔴 Crit | `impersonate/route.ts:56-67`; `superuser.ts:48-79`; `orgContext.ts:301-311` | SOC 2 CC6.1/CC7.2; ISO A.8.15/A.8.16; GDPR Art.32; CPS 234 |
| **ENT-03** | No audit log anywhere — no record of view/edit/export/delete/share/impersonation; retention undefined | 🟠 High | schema-wide: no `AuditLog` model | SOC 2 CC7.2/CC7.3; ISO A.8.15; GDPR Art.30/32; CPS 234/230 |
| **ENT-04** | No SAML/OIDC/MFA (Entra-only, single tenant); open self-registration, no email verification/domain allowlist | 🟠 High | `auth.ts:56-65`; `registerUser.ts:38-74` | SOC 2 CC6.1; ISO A.5.16/A.5.17; CPS 234 |
| **ENT-05** | No per-org / per-project AI disable — only global key removal or zero quota | 🟠 High | `subscription.ts:62`; AI routes | SOC 2 CC1.3/CC6.1; ISO A.5.23 (cloud/AI use) |
| **ENT-06** | Identifiable content sent to Anthropic verbatim (named people/teams/systems in staff-narrative & transcript) | 🟠 High | `staffNarrative.ts:99-104`; `audio/refine-transcript/route.ts:17,42` | GDPR Art.28/44; ISO A.5.14/A.5.34; SOC 2 CC6.7 |
| **ENT-07** | Raw meeting/mic audio streamed to Deepgram (2nd AI vendor) | 🟠 High | `audio/transcribe/route.ts:14,49`; `dictation/token/route.ts` | GDPR Art.28/44; ISO A.5.14/A.5.19–A.5.23 |
| **ENT-08** | No enterprise-proxy / base-URL seam for Anthropic; no region/residency control | 🟡 Med | no `baseURL`/`ANTHROPIC_BASE_URL` in code | ISO A.5.23; SOC 2 CC6.6 |
| **ENT-09** | Broad delegated Graph scopes (`Files.ReadWrite.All`, `Sites.Read.All`) | 🟡 Med | `auth.ts:60` | ISO A.5.15/A.8.2 (least privilege); SOC 2 CC6.3 |
| **ENT-10** | Support "Help with this diagram" email sends full diagram JSON + screenshot to vendor mailbox | 🟡 Med | `email.ts:68-120` | GDPR Art.28; ISO A.5.14; SOC 2 CC6.7 |
| **ENT-11** | `PUT /api/account` edits org name/entityType with no role check (bypasses SuperAdmin-only gate); pwd min 6≠8 | 🟡 Med | `account/route.ts:93,106-112` | SOC 2 CC6.1/CC6.3; ISO A.8.2 |
| **ENT-12** | No GDPR self-erasure; user delete is SuperAdmin-only, leaves orphan orgs + null-author versions | 🟡 Med | `account/route.ts` (no DELETE); `admin/users/[id]/route.ts:25-28` | GDPR Art.17; SOC 2 P4/P6 |
| **ENT-13** | Sessions default 30 days, no idle/absolute timeout | 🟡 Med | `auth.config.ts:7` | SOC 2 CC6.1; ISO A.8.5; CPS 234 |
| **ENT-14** | AI prompt + generated content persisted in `Diagram.aiComparison` | 🟡 Med | `compare/route.ts:144-164` | GDPR Art.5(e); ISO A.8.10 |
| **ENT-15** | Cross-org sharing can be enabled by OrgAdmin, opening data to any registered user in any org | 🟡 Med | `orgs/[id]/settings/route.ts:141-143`; `orgContext.ts:319-325` | SOC 2 CC6.1/CC6.3; ISO A.5.14 |
| **ENT-16** | Process/support content in server logs (`console.log`/`console.error`) | 🟡 Med | `email.ts:111-118`; `exportVisio.ts:384-389`; `planBpmn.ts:412-413` | ISO A.8.15/A.8.11; GDPR Art.32 |
| **ENT-17** | Public mining-ingest endpoint (per-source hashed key only) | 🟢 Low | `mining/ingest/[sourceId]/route.ts`; `sourceAuth.ts` | SOC 2 CC6.6; ISO A.8.9 |
| **ENT-18** | Cron endpoints guarded by a single shared static `CRON_SECRET`, no per-caller identity | 🟢 Low | `mining/poll/route.ts:15`; `cron/review-due/route.ts:16` | ISO A.8.2/A.8.16 |
| **ENT-19** | Silent admin elevation — admins are invisible owners of every project in scope | 🟢 Low | `orgContext.ts:250-267,301-311` | SOC 2 CC6.1; ISO A.8.15 |
| **ENT-20** | Stripe is optional but not feature-flagged; billing PII (email/name/id) to Stripe | 🟢 Low | `stripe.ts:18-24,99-117` | GDPR Art.28 (processor) |
| **ENT-INFO** | *Positive posture:* no telemetry/analytics/error-reporting egress; no committed secrets; encrypted MS tokens off-client; bcrypt-12 + timing-safe login + rate-limits; cross-org off by default; 403-not-404 | 🟢 Info | grep-confirmed; `.gitignore`; `auth.ts:155-199`; `credentials.ts:15-30` | Credit in SOC 2 CC6.x / ISO A.8.x |

## The two criticals, in plain terms

**ENT-01 — Privileged access is unrevokable and all-powerful.** Because SuperAdmin is three email addresses baked into the build, there is no way to grant it with MFA, rotate it, revoke it independently of the mailbox, or prove it wasn't misused. Those same accounts can download the entire database (customers' processes *and* password hashes) and can wipe every table. An auditor will treat this as a single point of catastrophic failure with no compensating detective control.

**ENT-02 — Any tenant's data can be silently read and changed.** A SuperAdmin can impersonate any user in **edit** mode and modify their process content, with **no log entry of any kind**. There is no way to answer "did anyone at the vendor look at / change our data, and when?" — which is precisely the question an enterprise security review exists to answer. The non-HttpOnly impersonation cookies add an XSS-driven escalation path.

Together, ENT-01 + ENT-02 + the absence of an audit log (ENT-03) are the blocking trio: they are individually serious and collectively mean privileged actions are both maximally powerful and completely unaccountable. Fixing ENT-03 (an audit log) is the highest-leverage single change, because it converts the others from "invisible" to "detectable".

## How to read severity for your own posture

- A **small internal deployment** (few trusted admins, no external customers) can reasonably down-rate ENT-01/02/19 — the trust boundary is different.
- A **multi-tenant SaaS selling to regulated enterprises** should treat ENT-01→ENT-07 as onboarding blockers for those customers, which is exactly what the Enterprise Mode in [05](05-gating-and-remediation-plan.md) is designed to unblock.
