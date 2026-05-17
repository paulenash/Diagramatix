# Diagramatix — Deployment Workflow: Every Element Explained

A reference for what each part of the deployment pipeline does and how it
fits together. Pairs with the [Azure deployment plan](../new%20features/nifty-singing-hennessy.md)
(the step-by-step provisioning runbook) — read that to set things up, read
this to understand what you set up.

## The two workflow shapes

### Today (manual, until OIDC lands)

```
Edit code           Local validate          Build image          Migrate DB           Swap container
─────────  ──►  ──────────────────  ──►  ──────────────  ──►  ───────────────  ──►  ─────────────────
in IDE          npm run go              az acr build         (only if schema      az webapp config
                http://localhost:3000   tags :sha-<x>         changed) — temp     container set
                test the change         + :latest             firewall + prisma   --container-image-
                                                              migrate deploy      name <:new-tag>
```

Time per cycle: ~5-10 min for code-only changes (Docker layer cache makes
warm builds fast); add ~3 min for schema changes.

### After Phase 7 (push-to-deploy)

```
Edit code      Local validate       git push          GitHub Actions does everything
─────────  ──► ─────────────  ──►  ──────────  ──►   ──────────────────────────────────
in IDE         npm run go          (to main)         build → push to ACR → migrate
               npm run build                          → swap container → smoke test
```

Time per cycle: **edit → live in 5-7 min**, mostly hands-off after `git push`.

---

## Every element, in detail

### 1. Local development — your laptop

Where you actually write code. `npm run go` builds and starts the
production server at `localhost:3000`. This is the **fastest iteration
loop** — never wait for a remote build for a code change you haven't tested
locally. The production container behaves identically to local because
the Dockerfile uses Node 20 Alpine, but reproducing prod issues locally
is 30s instead of 5 min.

**One subtle thing:** your local DB and prod DB are different Postgres
instances. Local: `localhost:5432/diagramatix`. Prod:
`dgx-prod-pg.postgres.database.azure.com:5432/diagramatix` (via Key
Vault). They have different data. A "works locally, breaks in prod" bug
is usually data-shape related — check the prod DB schema or use the
admin Full Backup endpoint to grab a snapshot.

### 2. Git — source of truth

Every code change is a commit on `main`. The `NEXT_PUBLIC_COMMIT_COUNT`
build arg (P0.5) increments by 1 per commit, and that number appears in
the app's version display. So commit count is your deploy version:
`1.11.0` for commit count 0, `1.11.347` after 347 commits, etc.

**Branch strategy** is whatever you prefer — single-`main`-only is fine
for a 1-person team; feature branches + PRs are fine if you start
collaborating. The CI workflow only deploys from `main`, so PR branches
build but don't deploy.

### 3. Azure Container Registry (ACR) — `dgxprodacr.azurecr.io`

Your private Docker registry. Every deploy pushes a new image tag here.
**Two tags every push:**

- **`:sha-<commit-sha>`** — immutable, points at exactly that commit's
  build. **Rollback target.**
- **`:latest`** — moves on every push. Convenience for ad-hoc
  `docker pull`s.

App Service references the `:sha-<x>` tag, not `:latest`, so you never
get accidentally upgraded by another push while looking at the current
deployed version.

**Cost:** ~$8/mo for Basic SKU (5 GB included). One image is ~150 MB;
you can store ~30 historical versions before hitting the cap. Prune old
tags with `az acr repository delete --image diagramatix:sha-<old>` once
you're sure rollback is no longer needed.

### 4. Dockerfile — `diagramatix/Dockerfile`

3-stage build:

- **`deps`** — install npm deps + `prisma generate`
- **`builder`** — `next build` with the commit count baked in via build arg
- **`runner`** — slim image, non-root user, copies just
  `.next/standalone/server.js` + `public/` + `prisma/`

`.dockerignore` keeps junk (`node_modules`, `.git`, `.next`, `.env*`)
out of the build context — that's why upload is fast (~17 MB vs ~827 MB
raw).

### 5. GitHub Actions — `.github/workflows/azure-deploy.yml`

What runs when you `git push main`. Already authored (P0.7), wired up
in Phase 7 (next). 12 steps:

1. Checkout the repo (with full history for commit count)
2. Compute commit count
3. Log in to Azure via OIDC federation (no secret stored)
4. Log in to ACR via that same Azure session
5. Build the Docker image, tag with `:sha-<commit>` + `:latest`, push to
   ACR (with registry-side layer cache)
6. Fetch `DATABASE_URL` from Key Vault into a masked output
7. Install Node 20 + Prisma CLI
8. Run `prisma migrate deploy` (failures abort here — never deploy new
   code against an old schema)
9. Tell App Service to swap to the new image
10. Restart App Service (belt-and-braces)
11. Poll the URL for HTTP 200 (smoke test in the pipeline itself)
12. Log out cleanly

**Concurrency guard**: if two pushes happen rapidly, they serialize
(`cancel-in-progress: false`) so a migration never gets interrupted
mid-flight.

### 6. OIDC federation — the passwordless auth

GitHub mints a short-lived OIDC token per workflow run. Azure trusts it
via a "federated credential" you attach to an AAD app registration. **No
long-lived `AZURE_CLIENT_SECRET` ever leaves your local machine.** This
is Phase 7's setup — until done, the workflow file won't authenticate.

Three repo secrets are needed (just IDs, not secrets in the secret
sense): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
Plus 3 role assignments on the federated identity: AcrPush + Website
Contributor + Key Vault Secrets User.

### 7. App Service — `dgx-prod-app`

The Linux B1 container host. **It doesn't know anything about your
code** — it just pulls whatever image you point it at and runs
`node server.js`. Three things change deployment behaviour:

- **Container reference**:
  `az webapp config container set --container-image-name <tag>` — pulls
  + restarts.
- **App Settings** (env vars): persistent until you change them. Key
  Vault references resolve at startup, so secret rotation requires a
  restart.
- **Health probe**: currently uses the default (port 3000, `/`). When
  the new container boots, App Service waits for health to flip green
  before rotating traffic. Failed health = traffic stays on the old
  container. **This is your safety net** — a broken deploy doesn't take
  the site down.

### 8. Key Vault — `dgx-kv`

Runtime secrets store. App Service's managed identity reads secrets at
startup via `@Microsoft.KeyVault(VaultName=dgx-kv;SecretName=...)`
references in App Settings.

**To rotate a secret** (e.g. compromised Anthropic key):

```
az keyvault secret set --vault-name dgx-kv --name anthropic-api-key --value <new-value>
az webapp restart --resource-group dgx-prod-rg --name dgx-prod-app
```

The restart re-reads the reference; new value is live within ~30s. No
code change, no deploy.

### 9. Postgres + migrations

Your `prisma/migrations/` directory is the source of truth for prod
schema. Today you use `prisma db push` locally (no migration file
generated). For a clean prod story going forward, **the rule of thumb**
is:

- Schema changes → run `prisma db push` locally to test the shape
- When happy, `npx prisma migrate dev --name <descriptive>` to commit a
  migration file
- Push to main → CI runs `prisma migrate deploy` automatically before
  swapping the container

If you forget to commit a migration, the deploy still proceeds
(container ships, but it expects schema your prod DB doesn't have) —
you'd notice immediately at runtime.

### 10. Logs & debugging

- **Live tail**: `az webapp log tail --resource-group dgx-prod-rg --name dgx-prod-app`
  — what we used during smoke test. Streams stdout + stderr from the
  container.
- **Application Insights** (Azure portal → `dgx-ai`): structured query
  over historical logs, request times, dependencies, exception stack
  traces. Better than raw logs for trends.
- **Container SSH** (rarely needed): Azure portal → App Service →
  Development Tools → SSH. Drops you into a shell inside the running
  container — handy for poking the file system.

### 11. Rollback

Two paths, both fast:

- **Bad code only**:
  `az webapp config container set --container-image-name dgxprodacr.azurecr.io/diagramatix:sha-<previous>`
  + restart. ~60s.
- **Bad migration**: Restore the DB from PITR (point-in-time recovery —
  your PG Flex Server has 14-day retention with geo-redundancy).
  `az postgres flexible-server restore --restore-time '<iso-timestamp>' ...`.
  Slower (~10 min) but works.

The CI workflow's concurrency guard means you can re-trigger an older
workflow run from the GitHub UI to "redeploy a prior commit" — that
does the rollback for you.

### 12. Secrets in the workflow vs runtime

Three different stores, easy to confuse:

| Where | What's there | When read |
|---|---|---|
| **GitHub repo secrets** | OIDC IDs (`AZURE_CLIENT_ID`, etc.) | At CI workflow runtime, by the `azure/login` action |
| **Azure Key Vault** | Runtime app secrets (DB URL, AUTH_SECRET, API keys) | At container startup, by App Service's managed identity |
| **App Service App Settings** | KV references + plain config (NODE_ENV, NEXTAUTH_URL, ports) | At container startup, surfaced as env vars to your Node process |

Notable: **there's no `.env` file in production.** Everything comes
through App Settings.

---

## Day-to-day cheat sheet

| Change type | Steps |
|---|---|
| **Code-only** | Edit → `npm run go` to test → `git commit && git push` → wait ~5 min for CI |
| **Schema change** | Edit `schema.prisma` → `npx prisma db push` locally to test → `npx prisma migrate dev --name <x>` to lock it in → commit migration file → push |
| **Dependency upgrade** | `npm install <pkg>@<ver>` → `npm run build` locally → commit `package.json` + `package-lock.json` → push (Docker rebuild is slower because npm layer cache invalidates) |
| **Secret rotation** | `az keyvault secret set ...` → `az webapp restart ...`. No code change, no deploy. |
| **Add a new env var** | (a) `az keyvault secret set` if secret OR plain App Setting if not (b) Add reference via `az webapp config appsettings set` (c) Add to `.env.example` and your code (d) Commit + push for the code change |
| **Rollback** | Find the prior `:sha-<x>` tag in ACR portal → `az webapp config container set ... --container-image-name <prior>` → restart |
| **Investigate a prod bug** | `az webapp log tail` for live, App Insights for historical, SSH into container for filesystem |

---

## Resource inventory (one place to look up names + roles)

| Resource | Name | What it does |
|---|---|---|
| Resource Group | `dgx-prod-rg` | Container for all the resources below; one place to see costs / delete everything |
| Key Vault | `dgx-kv` | 9 runtime secrets, read by App Service managed identity |
| Storage Account | `dgxprodst001` | Currently unused; reserved for future file uploads / blob storage |
| Log Analytics workspace | `dgx-law` | Backing store for App Insights |
| Application Insights | `dgx-ai` | Telemetry / metrics / logs / exception tracking |
| Container Registry | `dgxprodacr` (`.azurecr.io`) | Docker images, two tags per deploy |
| Postgres Flex Server | `dgx-prod-pg` | Burstable B1ms, 32 GB, geo-redundant 14-day backup |
| App Service Plan | `dgx-asp` | Linux B1, ~$20/mo |
| Web App | `dgx-prod-app` | Container host, custom domain `app.diagramatix.com.au` |

**Costs (cumulative):** ~$70/mo Azure + ~$30–100/mo Anthropic API usage.
Plus Stripe fees once that ships.
