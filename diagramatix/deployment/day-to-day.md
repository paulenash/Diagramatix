# Day-to-day Operations

The recipes you'll actually use. For background on what each tool does
and why, see [workflow-elements.md](./workflow-elements.md).

> All commands assume you're in `c:\Git\Diagramatix\diagramatix\` (the
> Next.js app root) and signed in to Azure as
> `paul@nashcc.com.au` against the `Pay-As-You-Go` subscription.
>
> If `az` complains about subscription context, run
> `az account set --subscription 0cee5d11-571a-49e4-bdb7-65e1401db8dd`.

---

## Code-only change (the 90% case)

A bug fix, a new feature, anything that doesn't touch `schema.prisma` or
add new env vars.

```bash
# 1. Edit code in your IDE.

# 2. Smoke-test locally — must pass before pushing.
export PATH="$PATH:/c/Program Files/nodejs"
cd /c/Git/Diagramatix/diagramatix
npm run go
# Open http://localhost:3000 and verify the change.
# Ctrl-C the server when done.

# 3. Commit + push to main.
git add <files>
git commit -m "<terse what + why>"
git push

# 4. (Until Phase 7) trigger the deploy manually:
GIT_COUNT=$(git rev-list --count HEAD)
az acr build \
  --registry dgxprodacr \
  --image "diagramatix:sha-$(git rev-parse HEAD)" \
  --image "diagramatix:latest" \
  --build-arg "GIT_COMMIT_COUNT=$GIT_COUNT" \
  --file Dockerfile .

az webapp config container set \
  --resource-group dgx-prod-rg \
  --name dgx-prod-app \
  --container-image-name "dgxprodacr.azurecr.io/diagramatix:sha-$(git rev-parse HEAD)"

az webapp restart --resource-group dgx-prod-rg --name dgx-prod-app

# 5. Verify by loading https://app.diagramatix.com.au — give it ~30s
#    for the new container to come up.
```

After **Phase 7** lands, steps 4 onwards become "wait 5 min — GitHub
Actions handled it." `git push` is the deploy.

**Common pitfalls:**
- Forgetting `git pull` before push when working from a second machine.
- Pushing a `console.log` you meant to delete. Production sees it in the
  log tail; fix is a follow-up commit.

---

## Schema change

Anything that touches `prisma/schema.prisma`.

```bash
# 1. Edit prisma/schema.prisma (add column, add table, etc.)

# 2. Push the change to your LOCAL database to validate the shape.
export PATH="$PATH:/c/Program Files/nodejs"
cd /c/Git/Diagramatix/diagramatix
npx prisma db push          # local DB on localhost:5432 picks it up
npx prisma generate         # regenerates the typed client at app/generated/prisma/

# 3. Test the code that uses the new schema locally.
npm run go
# Verify your feature works against the new shape.

# 4. Lock the change into a migration file so prod gets it.
npx prisma migrate dev --name <descriptive_lower_snake_case>
# This:
#   - creates prisma/migrations/<timestamp>_<name>/migration.sql
#   - applies it to your local DB (idempotent since db push already did)
#   - regenerates the client

# 5. Commit BOTH schema.prisma AND the new migration file together.
git add prisma/schema.prisma prisma/migrations/
git commit -m "<descriptive>"
git push

# 6. Deploy (manual or CI).
#    Migration runs BEFORE the container swap — so prod schema is current
#    by the time the new code lands. Failures abort the deploy.
```

**Pre-Phase-7 manual migration step** (the CI does this automatically
post-Phase-7):

```bash
# Temporarily allow your local IP through the PG firewall.
MY_IP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create \
  --resource-group dgx-prod-rg \
  --name dgx-prod-pg \
  --rule-name temp-local-migrate \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP"

# Pull DATABASE_URL from Key Vault.
DB_URL=$(az keyvault secret show --vault-name dgx-kv --name database-url --query value -o tsv)

# Apply.
DATABASE_URL="$DB_URL" npx prisma migrate deploy

# Remove the firewall rule.
az postgres flexible-server firewall-rule delete \
  --resource-group dgx-prod-rg \
  --name dgx-prod-pg \
  --rule-name temp-local-migrate \
  --yes
```

**Common pitfalls:**
- Forgetting to commit the new `prisma/migrations/<x>/migration.sql`
  file. Prod deploy succeeds, runtime crashes ~immediately on the first
  query against the missing column.
- Editing a migration file after it's been applied to prod. Don't —
  create a new migration that reverses or adjusts.
- Dropping a column you still read in code. Prisma will let you. Test
  locally before pushing.

---

## Dependency upgrade

```bash
export PATH="$PATH:/c/Program Files/nodejs"
cd /c/Git/Diagramatix/diagramatix

# 1. Update.
npm install <package>@<version>      # or npm update <package>

# 2. Build locally — catches type breakages immediately.
npm run build

# 3. Smoke-test if the package is anywhere user-facing.
npm run go

# 4. Commit both package.json AND package-lock.json (they go together).
git add package.json package-lock.json
git commit -m "Upgrade <package> to <version>"
git push

# 5. Deploy. Docker build will be slower (~6-8 min instead of ~3-5)
#    because the npm-install layer cache invalidated.
```

**Common pitfalls:**
- Committing `package.json` without `package-lock.json` (or vice versa)
  — CI build will use a slightly different dep tree than your local.
- Major version bumps (e.g. Next.js 16 → 17) need careful reading of the
  release notes; tests are sparse here so manual smoke is your safety
  net.

---

## Rotate a secret

E.g. compromised Anthropic key, expired Entra client secret, periodic
`AUTH_SECRET` refresh.

```bash
# 1. Set new value in Key Vault.
az keyvault secret set \
  --vault-name dgx-kv \
  --name <secret-name> \
  --value "<new-value>"

# 2. Restart App Service so the container re-reads the Key Vault reference.
az webapp restart --resource-group dgx-prod-rg --name dgx-prod-app

# 3. Verify. New value is live within ~30s of restart.
curl -I https://app.diagramatix.com.au/    # 200/302 = healthy
```

**Secret names in dgx-kv** (as of 2026-05-17):
`pg-admin-password`, `database-url`, `auth-secret`, `azure-client-id`,
`azure-client-secret`, `azure-tenant-id`, `anthropic-api-key`,
`smtp-pass`, `applicationinsights-connection-string`.

**Common pitfalls:**
- Rotating `auth-secret` invalidates all live JWT sessions — every user
  gets logged out at next request. Expected; do it during low-traffic
  windows.
- Rotating `database-url` (e.g. PG password change) requires updating
  both the Key Vault secret AND running `az postgres flexible-server
  update -p <new>` against the server itself. Do the server side FIRST.
- Don't `az keyvault secret delete` an in-use secret. Create a new
  version with `set`; old versions stay accessible.

---

## Add a new env var

E.g. you've integrated a new third-party API and need to ship its key
to production.

```bash
# 1. (If secret) Add to Key Vault.
az keyvault secret set \
  --vault-name dgx-kv \
  --name <kv-secret-name> \
  --value "<actual-value>"

# 2. Add the App Setting (this is what makes it visible to your code as
#    process.env.<NAME>).
#    For secrets, use a Key Vault reference:
az webapp config appsettings set \
  --resource-group dgx-prod-rg \
  --name dgx-prod-app \
  --settings "MY_NEW_VAR=@Microsoft.KeyVault(VaultName=dgx-kv;SecretName=<kv-secret-name>)"

#    For non-secret config:
az webapp config appsettings set \
  --resource-group dgx-prod-rg \
  --name dgx-prod-app \
  --settings "MY_CONFIG_VAR=value"

# 3. Restart so the new setting surfaces.
az webapp restart --resource-group dgx-prod-rg --name dgx-prod-app

# 4. Document. Add the variable to .env.example (with a placeholder
#    value, not the real one) so any new developer's local setup matches.

# 5. Use it in code via process.env.MY_NEW_VAR, commit, deploy.
```

**Common pitfalls:**
- Setting it as an App Setting but not adding to `.env.example` — works
  in prod, breaks local dev for the next developer (or future you).
- Putting the literal secret value in an App Setting instead of a Key
  Vault reference — the value appears in plaintext in the Azure portal
  and is dumpable by anyone with Reader on the web app.

---

## Rollback (something broke in prod)

### Code-only rollback — go to a known-good image

```bash
# 1. List recent image tags in ACR.
az acr repository show-tags \
  --name dgxprodacr \
  --repository diagramatix \
  --orderby time_desc \
  --output table

# 2. Point App Service at the prior sha tag.
az webapp config container set \
  --resource-group dgx-prod-rg \
  --name dgx-prod-app \
  --container-image-name "dgxprodacr.azurecr.io/diagramatix:sha-<previous-sha>"

# 3. Restart.
az webapp restart --resource-group dgx-prod-rg --name dgx-prod-app

# 4. Verify the version display in the app footer shows the old commit
#    count.
```

### Bad migration — restore DB from point-in-time

PG Flex has 14-day PITR. Pick a timestamp from BEFORE the bad migration.

```bash
# 1. Restore to a sibling server (PITR creates new server, doesn't overwrite).
az postgres flexible-server restore \
  --resource-group dgx-prod-rg \
  --name dgx-prod-pg-restored \
  --source-server dgx-prod-pg \
  --restore-time "2026-05-17T09:30:00+10:00"      # ISO 8601, your TZ ok

# 2. Verify the restored server has the schema you expect (use psql
#    or temporarily point your local DATABASE_URL at it).

# 3. Swap App Service to use the restored DB by updating database-url
#    in Key Vault, then restart.
az keyvault secret set \
  --vault-name dgx-kv \
  --name database-url \
  --value "postgresql://dgxadmin:<pw>@dgx-prod-pg-restored.postgres.database.azure.com:5432/diagramatix?sslmode=require"

az webapp restart --resource-group dgx-prod-rg --name dgx-prod-app

# 4. Long-term: rename the restored server back to dgx-prod-pg
#    (decommission the broken one), or live with the -restored suffix.
```

**Common pitfalls:**
- Restoring "now" — pick a timestamp comfortably before the bad
  migration ran (check `az acr task list-runs` for the deploy time).
- Forgetting to update the Key Vault `database-url` after restoring —
  app keeps talking to the broken DB.

---

## Investigate a prod bug

### Live log tail (real-time)

```bash
az webapp log tail \
  --resource-group dgx-prod-rg \
  --name dgx-prod-app
```

Streams stdout + stderr from the container until you Ctrl-C. Good for
"reproduce the bug while watching."

### Historical search (Application Insights)

Azure portal → `dgx-ai` → **Logs**. Sample queries:

```kusto
// All errors in the last hour
exceptions
| where timestamp > ago(1h)
| project timestamp, type, outerMessage, customDimensions
| order by timestamp desc

// Slow requests (>2s) in last 24h
requests
| where timestamp > ago(24h)
| where duration > 2000
| project timestamp, name, duration, url
| order by duration desc

// Anthropic API call failures
dependencies
| where target contains "anthropic"
| where success == false
| project timestamp, name, resultCode, target
```

### Shell into the container (rarely needed)

Azure portal → `dgx-prod-app` → **Development Tools** → **SSH**. Drops
you into a shell inside the running container. Useful for poking the
filesystem (e.g. "is the patched stencil actually in `/app/public/`?").

---

## Manually verify prod health

```bash
# Public URL responds.
curl -I https://app.diagramatix.com.au/                  # expect 200/302

# Health-of-the-container short summary.
az webapp show \
  --resource-group dgx-prod-rg \
  --name dgx-prod-app \
  --query "{state:state,hostNames:defaultHostName,kind:kind}" -o json

# All Key Vault references resolved (no broken @Microsoft.KeyVault entries).
az webapp config appsettings list \
  --resource-group dgx-prod-rg \
  --name dgx-prod-app \
  --query "[?contains(value, 'Microsoft.KeyVault')].name" -o table

# Postgres reachable, backups configured.
az postgres flexible-server show \
  --resource-group dgx-prod-rg \
  --name dgx-prod-pg \
  --query "{state:state,backup:backup.geoRedundantBackup,storage:storage.storageSizeGb}" -o json

# Current image deployed.
az webapp config container show \
  --resource-group dgx-prod-rg \
  --name dgx-prod-app \
  --query "[?name=='DOCKER_CUSTOM_IMAGE_NAME'].value" -o tsv
```

---

## Common gotchas across all flows

- **Git Bash on Windows path mangling.** Some `az` commands need
  `MSYS_NO_PATHCONV=1` prefix when passing resource IDs starting with
  `/subscriptions/...` (Bash mistakes them for filesystem paths).
- **`az role assignment create` MissingSubscription bug.** If you hit
  this, fall back to direct REST: see the workaround used in the Phase 1
  setup (search the conversation log or the workflow file).
- **Cold start.** App Service B1 doesn't keep the container warm
  forever. First request after ~20 min idle takes 15-30s. Subsequent
  requests are fast. Acceptable for a pilot; upgrade to a Premium SKU
  with `Always On` if it bites real users.
- **Public files in `public/`.** Anything in `public/` is served at
  `https://app.diagramatix.com.au/<filename>` with no auth. Don't put
  user data there. Currently includes some test Visio exports
  (`TPB P03 *.vsdx`, etc.) — prune them when you have a moment.

---

## Quick reference — Azure resource names

| Resource | Name |
|---|---|
| Resource Group | `dgx-prod-rg` |
| Key Vault | `dgx-kv` |
| Storage Account | `dgxprodst001` |
| Log Analytics workspace | `dgx-law` |
| Application Insights | `dgx-ai` |
| Container Registry | `dgxprodacr` → `dgxprodacr.azurecr.io` |
| Postgres Flex Server | `dgx-prod-pg` → `dgx-prod-pg.postgres.database.azure.com` |
| App Service Plan | `dgx-asp` |
| Web App | `dgx-prod-app` → `app.diagramatix.com.au` |
| Subscription | `Pay-As-You-Go` (`0cee5d11-571a-49e4-bdb7-65e1401db8dd`) |
| Tenant | `0fc783a0-6fe2-461f-bfff-8281c504b2a3` |
