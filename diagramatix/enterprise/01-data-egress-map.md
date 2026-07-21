# 01 — Data-Egress Map

*Every path by which customer content can leave the Diagramatix tenant, what travels, how it's authenticated, and how to turn it off. "Customer content" here means process/diagram data (labels, pool/lane/role names, IT-system names, notes, documents, risks & controls, mined event logs) — the material an enterprise treats as sensitive.*

## At a glance

| # | Destination | Category | What leaves | Auth | Turn off by |
|---|---|---|---|---|---|
| E1 | **Anthropic** (`api.anthropic.com`) | AI (LLM) | Prompts + diagram/process content + uploaded PDFs/images | `ANTHROPIC_API_KEY` | Unset key (global) — **no per-tenant switch** |
| E2 | **Deepgram** (`api.deepgram.com`) | AI (voice→text) | **Raw meeting/mic audio** (≤40 MB or live stream) | `DEEPGRAM_API_KEY` + browser grant token | Unset key → browser-native fallback |
| E3 | **Microsoft Graph** (`graph.microsoft.com`) | File I/O | Diagram exports pushed out; SharePoint/OneDrive files pulled in | Delegated OAuth (`Files.ReadWrite.All`, `Sites.Read.All`) | Unset `AZURE_*` / user never connects MS |
| E4 | **Stripe** | Billing | User email, name, internal user id (address on hosted page) | `STRIPE_SECRET_KEY` | Unset keys (app still runs) |
| E5 | **SMTP relay** (`smtp.office365.com`) | Email | Reset links; **support email carries full diagram JSON + screenshot** | `SMTP_USER/PASS` | Unset `SMTP_HOST` → console log |
| E6 | **Mining webhook** (inbound) | Event-log ingest | External system **pushes** event logs in | Per-source hashed key (`dgxk_…`) | Don't create a webhook source |
| E7 | **Azure Blob** (`*.blob.core.windows.net`) | Event-log pull | Nothing out; app **pulls** CSV/XES logs | User-pasted SAS URL | Don't create a blob source |
| E8 | **File downloads** (to the user) | Export | Visio `.vsdx`, `.docx`, XML/XSD/JSON, XLSX, PDF, `.dgxsim`, mining bundles, **backups** | Session + project access | Per-feature; see §Exports |
| E9 | **Moonshot / Kimi** (`api.moonshot.ai`, opt-in) | AI (LLM) | Same as E1 — **only when a Kimi model is the selected AI-Generate model** | `MOONSHOT_API_KEY` | Unset key (Kimi models disappear) · per-tenant `allowAi=false` · ENT-06 redaction |
| — | Telemetry / analytics / error-reporting | — | **None** — none present | — | N/A (positive) |

Two facts frame everything below: there is **no analytics, telemetry or error-reporting egress** anywhere in the code (no Sentry/PostHog/GA/Segment/Datadog), and **no secrets are committed** to the repo (production secrets flow from Azure Key Vault → App Service settings; only `.env.example` placeholders are tracked).

---

## E1 — Anthropic (AI). *Detail in [02-ai-governance.md](02-ai-governance.md).*

Every AI feature calls Anthropic's **default public endpoint** via `@anthropic-ai/sdk` 0.88.0 (`new Anthropic({ apiKey })`), keyed by a single global `ANTHROPIC_API_KEY`. Content sent ranges from a free-text prompt up to the **entire diagram graph with every label** (`refineFlowchartBpmn.ts:35`) and a full **technical narrative naming roles, teams and IT systems** (`staff-narrative`).

**Update (shipped since the original assessment):** the "global-only, no seam" limits above are largely closed — there is now a per-deployment **`ANTHROPIC_BASE_URL`** override (enterprise proxy / private gateway / region-pin; ENT-08), **per-tenant** `allowAi` gating (ENT-05), reversible **pre-egress redaction** on the structured narrators (`aiRedaction`, ENT-06), and **per-model provider routing** so a non-Anthropic AI (Moonshot/Kimi, E9) is choosable alongside Claude. See [09-ai-off-and-local-llm.md](09-ai-off-and-local-llm.md).

## E9 — Moonshot / Kimi (alternative AI provider, opt-in)

A **second, choosable** LLM vendor, off unless enabled. Reached via Moonshot's **Anthropic-compatible** endpoint (default `https://api.moonshot.ai/anthropic`; `MOONSHOT_BASE_URL` overridable to `…moonshot.cn/anthropic`), so it reuses the same SDK + Messages API — no separate integration. Kimi models appear in the SuperAdmin **AI Generate Model** picker (and Compare) **only when `MOONSHOT_API_KEY` is set**; egress happens **only when a Kimi model is the selected model** (`app/lib/ai/anthropicClient.ts` routes by the model's provider). What leaves = the same content as E1. Governed identically to Anthropic: **per-tenant `allowAi`** and **ENT-06 redaction** wrap at the route level, so a Kimi call is gated / pseudonymised exactly as a Claude call. **Residency:** default endpoint is international; the `.cn` host processes data in China — a DPA consideration if used. Turn off by unsetting `MOONSHOT_API_KEY` (models vanish) or `allowAi=false` (per tenant).

## E2 — Deepgram (voice→text)

The audio-to-process and live-dictation features send **raw audio** to a *second* AI vendor:

- `app/api/ai/audio/transcribe/route.ts` POSTs uploaded audio bytes (≤40 MB) to `https://api.deepgram.com/v1/listen` (diarization on), keyed by `DEEPGRAM_API_KEY`.
- `app/api/ai/dictation/token/route.ts` mints a 10-minute Deepgram grant token so the **browser streams live mic audio directly** to `wss://api.deepgram.com` (`app/lib/dictation/index.ts:71`).
- Teams `.vtt` transcripts are parsed **client-side** and skip Deepgram — but their text then goes to Anthropic via `refine-transcript`.

**Off switch:** unset `DEEPGRAM_API_KEY` → both routes 503 and the client falls back to the browser's built-in speech engine (no external audio egress). There is **no per-org toggle**.

## E3 — Microsoft Graph (SharePoint / OneDrive)

NextAuth `MicrosoftEntraID` provider, single tenant (`AZURE_TENANT_ID`), requesting **delegated** scopes:

```
openid profile email offline_access Files.ReadWrite.All Sites.Read.All
```

`Files.ReadWrite.All` + `Sites.Read.All` is broad — read/write to every file the user can reach and read all sites. Tokens are stored in the **encrypted** session JWT and never exposed to the client (only a `hasMicrosoft` boolean is). Graph is used to browse sites/drives, **download** file bytes into import pipelines, and **upload** Diagramatix exports (XML/XSD/JSON/`.vsdx`) to a user-chosen folder (`app/lib/sharepoint.ts`, `app/api/sharepoint/{route,upload,download}`).

**Off switch:** entirely inert unless `AZURE_*` are set **and** the user explicitly connects Microsoft; no token → every SharePoint route 403s. It is per-user opt-in, not a background flow.

## E4 — Stripe (billing)

On customer creation Stripe receives the user's **email, name and internal user id** (`app/lib/stripe.ts:99-117`); the hosted checkout may also collect a postal address (`billing_address_collection: "auto"`). The inbound webhook is **HMAC-verified** against `STRIPE_WEBHOOK_SECRET` on the raw body. Billing can be left unconfigured (the app tolerates a missing key and only the checkout/portal/webhook routes fail).

## E5 — Email (SMTP)

`nodemailer` to an Office365 relay. Three senders (`app/lib/email.ts`):

- **Password reset** — link only.
- **"Help with this diagram" support email** — sent to **`support@diagramatix.com.au`** (a vendor mailbox) with the **full diagram JSON payload and an SVG/PNG screenshot attached** (`email.ts:68-120`). This is process content leaving to the vendor by design.
- **Bundle invitation** — register link only.

**Off switch:** unset `SMTP_HOST` → senders `console.log` instead of emailing (note: that dev-fallback logs the support message content to stdout — see [04, ENT-20](04-findings-register.md)).

## E6 / E7 — Mining connectors

- **Webhook ingest (E6, inbound):** `app/api/mining/ingest/[sourceId]/route.ts` is a **public, session-less** endpoint authenticated by a per-source key (`dgxk_…`, verified constant-time against a SHA-256 hash). Any external system holding the key can push event-log rows (≤5 MB, 120/min/IP).
- **Azure Blob watched-folder (E7, outbound pull):** `pollBlobSource` (`app/lib/mining/pull.ts:41-69`) fetches a **user-supplied container SAS URL** and downloads new logs. Pull-only; nothing is written back. The SAS token is the only credential and is stored in `MiningSource.config`.
- **SharePoint watched-folder:** needs an interactive user's Graph token (skipped by cron).
- **Cron poll:** `app/api/mining/poll/route.ts`, authenticated by `X-Cron-Key == CRON_SECRET`; driven by GitHub Actions `mining-poll.yml` — **currently disabled** (schedule commented out; manual dispatch only).

**Off switch:** don't create mining sources; leave the poll cron disabled.

## E8 — Export formats (file downloads)

These stream files to the authenticated user's browser (and, if the user chooses, can feed the SharePoint upload in E3). They don't themselves POST to third parties, but they **carry process content out of the platform** and matter for data-classification/DLP:

- **Visio `.vsdx`**, **Word `.docx`**, **XML/XSD/JSON**, **XLSX** (risk-controls), **PDF**, **`.dgxsim`** simulation bundles, **mining run/capture bundles**, **`.zip`** publish bundles, and **DDL**.
- **Backups** are the heaviest: `GET /api/org-admin/backup` (OrgAdmin, **scoped to the caller's org**), and `GET /api/admin/full-backup` (**SuperAdmin only — every row in every table including credentials**, plus a `wipe`/TRUNCATE restore).

**Gating today:** each export requires project/diagram access and (for AI/limits) quota; backups are role-gated as above. There is **no org-level "block external export" control** — see the remediation in [05](05-gating-and-remediation-plan.md).

---

## Secrets inventory (for the customer's key-management questionnaire)

All are read from `process.env`; none are committed. Secrets (🔑) vs identifiers/config:

`DATABASE_URL` 🔑 · `AUTH_SECRET` 🔑 · `AZURE_CLIENT_SECRET` 🔑 · `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` · `STRIPE_SECRET_KEY` 🔑 · `STRIPE_WEBHOOK_SECRET` 🔑 · `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` · `DEEPGRAM_API_KEY` 🔑 · `ANTHROPIC_API_KEY` 🔑 · `ANTHROPIC_BASE_URL` (optional proxy/region) · `MOONSHOT_API_KEY` 🔑 (optional — enables the Kimi provider, E9) · `MOONSHOT_MODELS` / `MOONSHOT_BASE_URL` (optional config) · `SMTP_PASS` 🔑 (+ `SMTP_HOST/PORT/SECURE/USER/FROM`) · `CRON_SECRET` 🔑 · `ADMIN_PASSWORD` 🔑 · `AUTH_TRUST_HOST` / `NEXTAUTH_URL`.

Production values come from **Azure Key Vault → App Service application settings** (`.env.example` header) — e.g. the vault secret `moonshot-api-key` surfaced as the app setting `MOONSHOT_API_KEY` via a Key Vault reference, mirroring `ANTHROPIC_API_KEY`. A single shared `CRON_SECRET` guards all cron endpoints with no per-caller identity ([ENT-18](04-findings-register.md)).
