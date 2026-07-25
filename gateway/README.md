# Gemini gateway (LiteLLM) — Diagramatix

An **Anthropic-compatible** proxy that fronts Google Gemini. Diagramatix speaks the
Anthropic Messages API (`POST /v1/messages`); this gateway translates to Gemini and
back. It exists because Gemini is **not** Messages-API native (see
`app/lib/ai/models.ts` → `googleModels()`).

**Key flow:** your Google key lives ONLY inside the gateway (`GEMINI_API_KEY`). The
app authenticates to the *gateway* with a separate master key, which the app stores
as `GOOGLE_API_KEY`. Two different secrets — don't put the Google key in the app.

Files: `config.yaml` (models + master-key gate), `Dockerfile` (bakes the config).
Nothing secret is committed — keys are injected at runtime.

---

## Prod — Azure Container Apps (recommended)

Same subscription as the app so App Service can reach it over HTTPS. Uses your
existing ACR (`dgxprodacr`) and resource group (`dgx-prod-rg`). Set the region to
match `dgx-prod-app` (shown here as `australiaeast` — confirm yours).

```bash
# 1) Build the gateway image into your ACR (server-side build; no local Docker).
az acr build -r dgxprodacr -t litellm-gateway:1 gateway/

# 2) Container Apps environment (once).
az containerapp env create -g dgx-prod-rg -n dgx-gateway-env -l australiaeast

# 3) Deploy, injecting the two secrets. GEMINI_API_KEY = your Google key;
#    LITELLM_MASTER_KEY = a key you invent (the app's GOOGLE_API_KEY).
az containerapp create -g dgx-prod-rg -n litellm-gateway \
  --environment dgx-gateway-env \
  --image dgxprodacr.azurecr.io/litellm-gateway:1 \
  --registry-server dgxprodacr.azurecr.io \
  --target-port 4000 --ingress external \
  --min-replicas 1 --max-replicas 2 \
  --secrets gemini-key=<YOUR_GOOGLE_KEY> master-key=sk-prod-gateway-key \
  --env-vars GEMINI_API_KEY=secretref:gemini-key LITELLM_MASTER_KEY=secretref:master-key

# 4) Get the public URL.
az containerapp show -g dgx-prod-rg -n litellm-gateway \
  --query properties.configuration.ingress.fqdn -o tsv
# → litellm-gateway.<hash>.australiaeast.azurecontainerapps.io
```

> **ACR pull:** if step 3 errors on registry auth, either enable the ACR admin user
> (`az acr update -n dgxprodacr --admin-enabled true` and pass
> `--registry-username`/`--registry-password`), or assign the Container App a
> managed identity with the **AcrPull** role on `dgxprodacr`.

> **Cold starts:** `--min-replicas 1` keeps it warm (tiny always-on cost). Use
> `--min-replicas 0` to scale to zero for the lowest cost, at the price of a
> ~10–30 s cold start on the first request after idle.

### Point the app at it
Set on `dgx-prod-app` (the master key is secret → Key Vault `dgx-kv`; the URL and
model list aren't secret, so plain settings are fine):

```bash
# Secret → Key Vault, then reference it.
az keyvault secret set --vault-name dgx-kv --name google-gateway-key --value sk-prod-gateway-key

az webapp config appsettings set -g dgx-prod-rg -n dgx-prod-app --settings \
  GOOGLE_BASE_URL="https://litellm-gateway.<hash>.australiaeast.azurecontainerapps.io" \
  GOOGLE_API_KEY="@Microsoft.KeyVault(VaultName=dgx-kv;SecretName=google-gateway-key)" \
  GOOGLE_MODELS="gemini-2.5-pro|Gemini 2.5 Pro,gemini-2.5-flash|Gemini 2.5 Flash"
```

App Service restarts, and Gemini appears in every picker (including BPMN Compare).

---

## Smoke test (either environment)

```bash
curl https://<gateway-host>/v1/messages \
  -H "Authorization: Bearer sk-prod-gateway-key" \
  -H "content-type: application/json" \
  -d '{"model":"gemini-2.5-pro","max_tokens":64,"messages":[{"role":"user","content":"say hi"}]}'
```
An Anthropic-style JSON reply (a `content` array with a `text` block) = success.

---

## Local (for first validation)

```bash
docker run -d --name litellm -p 4000:4000 \
  -e GEMINI_API_KEY=<YOUR_GOOGLE_KEY> \
  -e LITELLM_MASTER_KEY=sk-my-gateway-key \
  -v "$(pwd)/config.yaml:/app/config.yaml" \
  ghcr.io/berriai/litellm:main-latest --config /app/config.yaml --port 4000
```
Then in the app's local `.env`: `GOOGLE_BASE_URL="http://localhost:4000"`,
`GOOGLE_API_KEY="sk-my-gateway-key"`, `GOOGLE_MODELS="gemini-2.5-pro|Gemini 2.5 Pro,gemini-2.5-flash|Gemini 2.5 Flash"`.

---

## Security notes
- The gateway holds your Google key and can spend money — keep `LITELLM_MASTER_KEY`
  secret and rotate on leak.
- `--ingress external` is public but gated by the master key. To lock it down
  further, use internal ingress + VNet-integrate `dgx-prod-app` so only the app can
  reach it, or add an IP allow-list.
