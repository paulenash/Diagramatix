# 08 — SSO Vendor Decision: WorkOS vs Auth0

*A decision record for how Diagramatix will deliver the deferred "full SSO/SAML/OIDC per-org + SCIM" item (ENT-04 core). Recommends a direction and captures the reasoning so it can be picked up and committed to later.*

> **Status:** RECOMMENDATION (not yet committed). **Author's pick: WorkOS.**
> **Caveat:** the architecture / integration-model analysis is stable; **pricing and exact tier availability change often** and this was written against ~Jan 2026 knowledge — re-verify the pricing section against current vendor docs before signing anything.

## Context & the decision

We already shipped (A3d) `Org.requireSso`, which forces members of an org onto **our** single Microsoft Entra tenant, plus a domain-restricted self-registration allowlist. What's missing — and what large enterprises actually require — is **bring-your-own-IdP**: each customer organisation connects **their** identity provider (Okta, their Entra, Ping, Google Workspace…), we route users to the right IdP by email domain, JIT-provision them into the correct org/role on first login, and support **SCIM** so the customer's IdP can auto-deprovision users. See [07 "Deferred" / SSO explanation](07-implementation-log.md) for the protocol background.

The decision: **build SAML/OIDC/SCIM in-house, or buy an enterprise-SSO vendor** — and if buying, **WorkOS or Auth0**.

Constraints that shape the choice:
- A **small team** — engineering + ongoing security maintenance time is the scarce resource.
- A **working auth stack** (Auth.js v5, JWT sessions, email/password + Entra) we do **not** want to rip out to win SSO.
- The need is **per-org, multi-tenant** SSO + **SCIM**, not a general CIAM overhaul.
- SAML security is **easy to get wrong** (XML signature-wrapping etc.) — a strong argument against hand-rolling.

## Options considered

| Option | One-line | Verdict |
|---|---|---|
| **Build in-house** | `@node-saml`/`samlify` + our own per-org config + SCIM API | ✗ Weeks of work + permanent security-maintenance burden for a small team |
| **WorkOS** | Enterprise-readiness features **bolted onto** our app | ✔ **Recommended** — best fit for a bolt-on |
| **Auth0 (Okta)** | Full CIAM **platform** we'd adopt | ○ Only if we choose to consolidate all auth (incl. MFA) onto one platform |
| Stytch / Clerk | Other credible bolt-on SSO/auth vendors | Worth a look as WorkOS alternatives if pricing/fit disappoints |

## Feature comparison (WorkOS vs Auth0)

| | **WorkOS** | **Auth0 (Okta)** |
|---|---|---|
| Primary purpose | Enterprise features added to *your* app | Full customer-identity **platform** |
| SAML + OIDC SSO | ✅ both, all major IdPs, **normalized** behind one API | ✅ both ("Enterprise Connections") |
| Per-org / multi-tenant | ✅ first-class Organizations + connections | ✅ Organizations feature (more config) |
| **Customer self-setup** | ✅ **Admin Portal** — send the customer's IT a link; they configure their own SAML/SCIM | ⚠️ configure in the Auth0 dashboard; no send-a-link equivalent |
| **SCIM / directory sync** | ✅ normalized "Directory Sync" + events | ✅ inbound SCIM, less central/normalized, tier-gated |
| MFA | via AuthKit, or keep our own | ✅ built-in (relevant to A2c) |
| Social / passwordless / bot-detection | limited (focused product) | ✅ extensive |
| Keep our existing email/password login? | ✅ easily — WorkOS handles only the SSO branch | ⚠️ cleanest path routes all login through Universal Login |
| DX for this use case | purpose-built, fast | mature but broader/heavier |

The stand-out difference is WorkOS's **Admin Portal**: it removes the biggest hidden cost of enterprise SSO — the "get on a call with each customer's Okta admin" work — by letting the customer self-configure via a link.

## Implementation effort — for Diagramatix specifically

**WorkOS — bolt-on (low–moderate).** Keep Auth.js credentials + Entra as-is; add WorkOS only for enterprise customers:
- **SSO:** store a `workosOrganizationId` per Diagramatix org → get an authorization URL → redirect → handle callback → WorkOS returns a **normalized profile** → JIT-provision into the right org/role → mint our existing session. ~**a few days**.
- **SCIM:** subscribe to Directory-Sync webhook events → create/update/deactivate users. ~**a few days**.
- Hangs directly off the `Org.requireSso` flag + domain routing we already have. It's a **new sign-in branch, not a re-architecture**.

**Auth0 — platform adoption (moderate–high).** Using Enterprise Connections + Organizations + SCIM well typically means moving login onto **Universal Login**: rethinking the email/password + session flow, configuring Organizations/connections/home-realm-discovery, and Actions for claim mapping. **Weeks, not days**, with a bigger blast radius on core auth — but you also *get* MFA, social, etc. in the same swing.

## Pricing shape *(verify — volatile)*
- **WorkOS** — historically **per-connection, per-month** for SSO and for Directory Sync (roughly ~$100–125/connection/month), with a free allowance for early-stage/startups and a free AuthKit tier up to a MAU count. Transparent, predictable, startup-friendly.
- **Auth0** — B2B/enterprise SSO + Organizations + SCIM sit in the pricier, largely **sales-quoted** plans; escalates with MAU/features; less transparent for this use case.

## Strategic angle — SSO + MFA together
Two deferred items — **SSO (this)** and **MFA (A2c, ENT-01)** — could be solved by **one** platform. That's the main argument *for* Auth0: adopt it as the auth stack and get SAML/OIDC **and** MFA **and** social in one migration. The counter-argument: it's a large migration of a security-critical, working system. If we want to keep the lean Auth.js setup and add enterprise features surgically, **WorkOS + our own/AuthKit MFA** keeps us in control with far less disruption.

## Recommendation

**Adopt WorkOS** for per-org SSO (SAML + OIDC) + SCIM, integrated as a bolt-on alongside the existing Auth.js stack, and handle **MFA separately in A2c**. Rationale: smallest disruption to a working auth system, first-class multi-tenant + self-serve customer onboarding (Admin Portal), transparent startup-friendly pricing, and it slots straight onto the `requireSso` + domain-routing we already built. Reserve **Auth0** for a deliberate decision to consolidate *all* identity onto one platform.

## What to verify before committing
1. **Current pricing** for both (per-connection vs quote) at our expected connection count.
2. WorkOS **Directory Sync** coverage for the specific IdPs our first enterprise prospects use (Okta / Entra / Google).
3. That WorkOS's **normalized profile + JIT** cleanly maps to our `Org` + `OrgMember` role model.
4. Whether any early customer's IdP mandates SAML-only (it usually works either way — WorkOS abstracts it).
5. DPA / sub-processor implications (adds WorkOS or Auth0 as a sub-processor — update the list in [01](01-data-egress-map.md)).

## How it fits the plan
- Closes the **ENT-04 core** gap (bring-your-own-IdP), on top of the A3d `requireSso` groundwork.
- Belongs in **Phase A3 / Workstream A**; pairs naturally with **A2c (MFA)** — decide the platform question first, because "Auth0-as-platform" would absorb both.
- Referenced from the deferred list in [06](06-enterprise-readiness-plan.md) and [07](07-implementation-log.md).
