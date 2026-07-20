# Diagramatix — Enterprise Data-Governance & Audit Analysis

*Point-in-time self-assessment, July 2026. Code-referenced against the `main` branch. Prepared to answer the questions a large enterprise's security, privacy and audit teams ask before approving a process-modelling tool: **where can information about our processes go, can AI be used and how, and what would an auditor flag?***

> This is an internal engineering assessment, not a certification. Every finding cites the code that produced it (`file:line`) so it can be verified and fixed. Control-framework mappings (SOC 2 / ISO 27001 / GDPR / APRA CPS 234 & 230) are **indicative**, to help a customer's audit team locate the relevant control — they are not claims of compliance.

## Why this matters

Diagramatix stores and reasons about customers' **business processes** — pool/lane names, roles, IT systems (often named: Stripe, Xero, CRM…), documents, risks & controls, and mined event logs. For a regulated enterprise that content is frequently **sensitive or in-scope for audit**. Three questions dominate procurement:

1. **Data egress** — what leaves our tenant, to whom, and can we stop it? (→ [01](01-data-egress-map.md))
2. **AI governance** — is AI used, what does it see, and can we disable or contain it? (→ [02](02-ai-governance.md))
3. **Access, isolation & accountability** — who can see our data, is one tenant walled off from another, and is privileged access logged? (→ [03](03-access-control-tenancy-audit.md))

## What's in this folder

| Doc | Covers |
|---|---|
| [01-data-egress-map.md](01-data-egress-map.md) | Every path by which process content leaves the tenant — AI, voice, Microsoft Graph, Stripe, email, mining connectors, file exports — with what's sent and how to switch it off. |
| [02-ai-governance.md](02-ai-governance.md) | Which AI features exist, exactly what customer data each sends to Anthropic/Deepgram, current gating, and the controls an enterprise will demand. |
| [03-access-control-tenancy-audit.md](03-access-control-tenancy-audit.md) | Authentication/SSO, the SuperAdmin model, impersonation, tenant isolation, audit trail, and data lifecycle/erasure. |
| [04-findings-register.md](04-findings-register.md) | The consolidated findings, each with severity, evidence, impact and control mapping. **Start here for the audit view.** |
| [05-gating-and-remediation-plan.md](05-gating-and-remediation-plan.md) | Concrete, code-level ways to **minimise or gate** every risky feature — reusing patterns already in the codebase — phased from quick wins to strategic work, including an "Enterprise Mode" profile. |
| [06-enterprise-readiness-plan.md](06-enterprise-readiness-plan.md) | **The go-to-market plan** — three workstreams (product controls, deployment tiers, compliance evidence) sequenced into a timeline where each phase unlocks a defensible sales claim. Start here for "what do we actually do." |

## Executive summary

**Good news first — the posture already has real strengths** an auditor will credit: no analytics/telemetry/error-reporting egress anywhere; **no secrets committed** to the repo (production secrets come from Azure Key Vault → App Service settings); bcrypt cost-12 password hashing with timing-safe verification and login rate-limiting; Microsoft tokens held in an **encrypted** JWT and never exposed to the client; account pre-hijack hardening on SSO; cross-org sharing **off by default**; existence-hiding 403s; signature-verified Stripe webhook. Data at rest is in Azure Australia East.

**The gaps that will surface in an enterprise audit** fall into three clusters:

- **Privileged access is powerful and invisible.** "SuperAdmin" is **three email addresses hard-coded into the app** (no stored role, no MFA, no rotation) that can export the entire database *including credentials*, TRUNCATE-restore every table, and **impersonate any user in edit mode** — and **none of it is logged**. There is **no audit trail** of views, edits, exports, deletes, shares or impersonation anywhere in the system.
- **AI cannot be governed per-tenant.** AI is on for everyone with quota; there is **no per-org or per-project "AI off" switch**, no seam to route AI through a customer's own gateway/proxy, and several features (staff narrative, transcript clean-up) send **richly identifiable content** — named people, teams and systems — verbatim to Anthropic. Voice features stream **raw meeting audio to Deepgram**, a second AI vendor.
- **Enterprise identity & lifecycle basics are missing.** Only single-tenant Microsoft Entra ID SSO — **no SAML/OIDC/MFA** — plus open self-registration with no email verification, no GDPR self-erasure, and 30-day sessions with no idle timeout.

**None of this is hard to fix**, and the codebase already contains the right patterns to fix it cleanly (per-org policy flags modelled on `Org.allowCrossOrgSharing`, the `gateFeature` route wrapper, the `AppSetting` store). [Doc 05](05-gating-and-remediation-plan.md) turns each finding into a concrete change, and proposes a single **Enterprise Mode** that flips safe defaults (AI off/proxied, external export off, SSO required, audit on) so a nervous enterprise can be onboarded with confidence.

### Severity at a glance

| Severity | Count | Headline items |
|---|---|---|
| 🔴 Critical | 2 | Hard-coded SuperAdmin super-powers; unaudited edit-mode impersonation |
| 🟠 High | 6 | No audit log; no per-tenant AI disable; identifiable content to AI; raw audio to Deepgram; no SAML/MFA; open self-registration |
| 🟡 Medium | 9 | No AI proxy seam; broad Graph scopes; support email carries diagram; `/api/account` authZ gap; no GDPR erasure; 30-day sessions; AI content persisted; cross-org toggle; content in server logs |
| 🟢 Low / Info | 4 | Shared cron secret; silent admin elevation; parse-failure log leakage; (positive) clean telemetry/secrets posture |

See [04-findings-register.md](04-findings-register.md) for the detail and evidence behind each.
