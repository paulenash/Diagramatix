# Diagramatix — Azure Deployment Plan

## Context

Diagramatix is now functionally complete enough to put in front of users. The
goal is a **production-ready Azure pilot in Australia East**.

Pilot scale: <50 users, <500 diagrams, <AU$150/mo Azure infra. Region pinned to `australiaeast` for AU data residency. User has an Entra tenant; Azure subscription likely needs to be confirmed/created.

Codebase validation (already performed):
- No `output: "standalone"` in [next.config.ts](diagramatix/next.config.ts) — needs adding.
- No `engines` field in [package.json](diagramatix/package.json).
- No Dockerfile, no GitHub Actions workflows.
- 5 places call `execSync("git rev-list --count HEAD")` — silently fall back to 0 in a container; harmless but the version display will show 0 unless we bake a `NEXT_PUBLIC_COMMIT_COUNT` build arg.
- Visio export at [app/api/export/visio-v2/route.ts](diagramatix/app/api/export/visio-v2/route.ts) is pure XML manipulation of stencils in `public/` — **no server-side Visio license needed**.
- Auth.js v5 uses **JWT-only sessions** (no DB session table) — DB downtime won't sign users out. Good for resilience.

---

## Architecture Decision

**Compute & edge: Azure App Service Linux B1 + custom domain + free managed cert.**
Rejected Container Apps (Consumption min-replica cost ~AU$25-40/mo > B1's ~AU$20, and KEDA scale-to-zero doesn't matter at <50 users). Rejected Front Door Standard (+AU$45/mo) — pilot has no WAF/geo-routing need.

**Database: Azure Database for PostgreSQL Flexible Server, Burstable B1ms.**
14-day PITR, geo-redundant backup ON (paired region Australia Southeast — both AU sovereign).

**Total: ~AU$70-75/mo Azure + AU$30-100/mo Anthropic = ~AU$100-180/mo all-in.**

| Resource | SKU | AUD/mo |
|---|---|---|
| App Service Plan B1 Linux | 1 vCPU / 1.75 GB | ~$20 |
| Postgres Flexible B1ms + 32 GB + geo-PITR | Burstable | ~$30 |
| Azure Container Registry | Basic | ~$8 |
| Storage Account (LRS) | Hot | ~$5 |
| Key Vault | Standard | ~$2 |
| Application Insights (1 GB/day cap) | Pay-as-you-go | ~$5 |
| Communication Services Email | 1k tx/mo free | ~$0 |
| Azure DNS zone | one zone | ~$2 |
| Domain (.com.au, amortised) | annual | ~$2 |
| Anthropic API | usage | $30-100 |
| **Total** | | **$105-175/mo** |

**Licenses NOT needed**: Entra ID P1 (free tier covers app reg + 50k MAU), Visio (server is pure file manipulation), Anthropic Enterprise (PAYG fine for pilot), SOC 2 / ISO 27001 (out of scope; the platform inherits Azure's posture).

---

## Pre-Deployment Code Changes

| File | Change |
|---|---|
| [next.config.ts](diagramatix/next.config.ts) | Add `output: "standalone"` |
| [package.json](diagramatix/package.json) | Add `"engines": { "node": ">=20.11.0" }` and `start:prod: "node .next/standalone/server.js"` |
| `Dockerfile` (NEW) | Multi-stage build: deps → build → runner. **Must `COPY public ./public`** (BPMN stencils + ArchiMate JSON) and `COPY prisma ./prisma`. Pass `ARG GIT_COMMIT_COUNT` and set `NEXT_PUBLIC_COMMIT_COUNT`. Run as non-root `app` user. `CMD ["node", "server.js"]` |
| `.dockerignore` (NEW) | Exclude `node_modules`, `.next`, `.git`, `.env*`, `*.md`, dev scripts |
| `.github/workflows/azure-deploy.yml` (NEW) | OIDC federation → build → push to ACR → run `prisma migrate deploy` → swap App Service container |
| 5 files calling `execSync("git rev-list ...")` | Replace with `process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0"`. Files: [app/api/backup/route.ts](diagramatix/app/api/backup/route.ts) line 25, [app/(dashboard)/diagram/[id]/page.tsx](diagramatix/app/(dashboard)/diagram/[id]/page.tsx) line 65, [app/(dashboard)/dashboard/projects/[id]/page.tsx](diagramatix/app/(dashboard)/dashboard/projects/[id]/page.tsx) line 33, [app/(dashboard)/dashboard/page.tsx](diagramatix/app/(dashboard)/dashboard/page.tsx) line 82, [app/api/schema/route.ts](diagramatix/app/api/schema/route.ts) line 10 |
| `.env.example` (NEW) | Document required vars without leaking values |

`DATABASE_URL` will include `?sslmode=require` for Postgres Flexible Server. The existing `pg` adapter in [app/lib/db.ts](diagramatix/app/lib/db.ts) accepts this in the connection string — no code change required unless self-signed CA issues arise during smoke test.

---

## Entra ID App Registration

User already has a tenant. Steps:
1. Entra ID → App registrations → New registration. Single-tenant. Redirect URI: `https://app.diagramatix.com.au/api/auth/callback/microsoft-entra-id`.
2. Add a client secret. Copy the **Value** to Key Vault as `azure-client-secret`. Calendar reminder for expiry (24 mo default).
3. API permissions (Microsoft Graph, delegated): `openid profile email offline_access Files.ReadWrite.All Sites.Read.All` — must match [auth.ts:68](diagramatix/auth.ts#L68) exactly.
4. **Click "Grant admin consent for <tenant>"** — `Files.ReadWrite.All` and `Sites.Read.All` are admin-consent scopes; without this, every user sees a consent prompt and tenant policies may block them.
5. Record IDs to Key Vault: `azure-client-id`, `azure-tenant-id`, `azure-client-secret`.

---

## Deployment Runbook

Total time on a fresh tenant: **3-4 hours** of work + ~30 min DNS propagation.

### Phase 0 — Subscription & RG (15 min)
1. Confirm/create Azure subscription billed to AU entity.
2. `az group create -n dgx-prod-rg -l australiaeast`.
3. `az provider register --namespace Microsoft.DBforPostgreSQL Microsoft.Web Microsoft.Communication Microsoft.OperationalInsights microsoft.insights Microsoft.ContainerRegistry`.

### Phase 1 — Foundational resources (30 min)
4. **Key Vault**: `az keyvault create -n dgx-kv -g dgx-prod-rg -l australiaeast --enable-rbac-authorization true`. Grant yourself `Key Vault Administrator`.
5. **Storage Account**: `az storage account create -n dgxprodst001 -g dgx-prod-rg -l australiaeast --sku Standard_LRS --kind StorageV2`.
6. **Application Insights**: workspace-based — create Log Analytics workspace `dgx-law` then `dgx-ai` AI component.
7. **ACR**: `az acr create -n dgxprodacr -g dgx-prod-rg --sku Basic -l australiaeast`.

### Phase 2 — Database (20 min)
8. `az postgres flexible-server create -n dgx-prod-pg -g dgx-prod-rg -l australiaeast --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 --backup-retention 14 --geo-redundant-backup Enabled --admin-user dgxadmin --admin-password '<strong>' --public-access 0.0.0.0`.
9. `az postgres flexible-server db create -s dgx-prod-pg -d diagramatix`.
10. Build `DATABASE_URL`: `postgresql://dgxadmin:<pw>@dgx-prod-pg.postgres.database.azure.com:5432/diagramatix?sslmode=require`.
11. Store secrets in Key Vault: `auth-secret` (`openssl rand -base64 32`), `database-url`, `azure-client-id`, `azure-client-secret`, `azure-tenant-id`, `anthropic-api-key`, `smtp-pass`.

### Phase 3 — Code changes & first build (30 min)
12. Apply pre-deployment code changes from this plan in a feature branch. Merge to main.
13. Validate Dockerfile locally: `docker build --build-arg GIT_COMMIT_COUNT=$(git rev-list --count HEAD) -t dgx-test .` then `docker run --rm -p 3000:3000 -e DATABASE_URL=... -e AUTH_SECRET=... dgx-test`.
14. Manually push first image: `docker tag dgx-test dgxprodacr.azurecr.io/diagramatix:v0.1.0 && az acr login -n dgxprodacr && docker push dgxprodacr.azurecr.io/diagramatix:v0.1.0`.
15. Run first migration (allow your IP on Postgres firewall temporarily): `DATABASE_URL='...?sslmode=require' npx prisma migrate deploy`. Verify with `psql`.

### Phase 4 — App Service (30 min)
16. `az appservice plan create -n dgx-asp -g dgx-prod-rg --is-linux --sku B1 -l australiaeast`.
17. `az webapp create -g dgx-prod-rg -p dgx-asp -n dgx-prod-app --container-image-name dgxprodacr.azurecr.io/diagramatix:v0.1.0`.
18. Enable system-assigned managed identity. Grant `Key Vault Secrets User` on `dgx-kv`, `AcrPull` on `dgxprodacr`.
19. App Service settings — Key Vault references for every secret: `DATABASE_URL=@Microsoft.KeyVault(VaultName=dgx-kv;SecretName=database-url)`, etc. Plain values: `AUTH_TRUST_HOST=true`, `NODE_ENV=production`, `WEBSITES_PORT=3000`, `APPLICATIONINSIGHTS_CONNECTION_STRING=...`.

### Phase 5 — Custom domain + TLS (30 min + DNS propagation)
20. DNS: CNAME `app.diagramatix.com.au` → `dgx-prod-app.azurewebsites.net` + verification TXT record.
21. `az webapp config hostname add ... --hostname app.diagramatix.com.au`.
22. `az webapp config ssl create ... --hostname app.diagramatix.com.au` (free managed cert).
23. `az webapp config ssl bind --ssl-type SNI ...`.
24. Set `NEXTAUTH_URL=https://app.diagramatix.com.au`.
25. Update Entra app registration to add the production redirect URI.

### Phase 6 — Communication Services Email (30 min)
26. Create ACS resource + Email Communication Service. Verify a custom-domain sender (`noreply@diagramatix.com.au`) — set SPF/DKIM/DMARC.
27. Either use ACS Email SDK (cleaner) or convert to SMTP and keep nodemailer. Wire SMTP secrets to Key Vault.

### Phase 7 — CI/CD (30 min)
28. Create GitHub OIDC federation: `az ad app federated-credential create ...`. Save AAD client ID + tenant + subscription as repo secrets.
29. Add `.github/workflows/azure-deploy.yml`. Push a commit; verify build → push → migrate → swap container.

### Phase 8 — Smoke test (15 min)
30. Microsoft sign-in → user auto-provisioned with default Org.
31. Create diagram, drop shapes, save → verify a `DiagramHistory` row.
32. Export Visio → confirms `public/` shipped.
33. GET `/api/backup` and POST it back → verify additive restore.
34. Trigger an AI feature → verify Application Insights shows the Anthropic call.
35. SharePoint integration → verify `msAccessToken` is populated.
36. Induce a 404 → verify Application Insights logs it.

### Rollback plan
- **Failed deploy**: App Service holds previous image; `az webapp config container set` to prior tag, restart.
- **Bad migration**: Restore DB from PITR to point just before the migration ran (timestamp visible in CI log).
- **Bad secret**: App Service settings have built-in version history per env var; revert in portal.
- **DNS mistake**: `dgx-prod-app.azurewebsites.net` always works as fallback; revert CNAME.
- **Region outage**: Geo-restore Postgres to AU Southeast, redeploy App Service to AU Southeast. RTO 30-60 min.

---

## Verification

- **Build**: `docker build` succeeds with `GIT_COMMIT_COUNT` arg; image runs locally with env vars set.
- **DB**: `npx prisma migrate deploy` applies cleanly to Postgres Flexible; `psql` shows tables.
- **App reachable**: `curl https://app.diagramatix.com.au/api/health` (add a trivial health route if not present) returns 200.
- **Auth**: complete a Microsoft sign-in end to end; verify a Graph API call succeeds.
- **Smoke checklist** in Phase 8 above is the canonical end-to-end test.

---

## Critical Files Touched

- [next.config.ts](diagramatix/next.config.ts) — add `output: "standalone"`
- [package.json](diagramatix/package.json) — Node engines + start:prod
- `Dockerfile` (NEW) — multi-stage with `public/` + `prisma/` + commit-count build arg
- `.dockerignore` (NEW)
- `.github/workflows/azure-deploy.yml` (NEW) — CI/CD via OIDC
- 5 files calling `execSync("git rev-list ...")` — switch to env var
