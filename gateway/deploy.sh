#!/usr/bin/env bash
#
# One-shot deploy of the LiteLLM Gemini gateway to Azure Container Apps, then wire
# dgx-prod-app to it. Run ONCE, by hand, after `az login`. Not part of CI.
#
# Usage (from the repo root, so it can see ./gateway):
#   export GOOGLE_KEY="<your-gemini-key>"      # your Google AI Studio key
#   export MASTER_KEY="sk-my-gateway-key"      # optional; auto-generated if unset
#   bash gateway/deploy.sh
#
# Re-running: `az containerapp create` fails if the app already exists. To ship a
# NEW image later, use:  az containerapp update -g dgx-prod-rg -n litellm-gateway \
#                          --image dgxprodacr.azurecr.io/litellm-gateway:<tag>
set -euo pipefail

# ── Settings (override via env if yours differ) ──────────────────────────────
ACR="${ACR:-dgxprodacr}"
RG="${RG:-dgx-prod-rg}"
APP="${APP:-dgx-prod-app}"
KV="${KV:-dgx-kv}"
REGION="${REGION:-australiaeast}"          # must match dgx-prod-app's region
ENVN="${ENVN:-dgx-gateway-env}"
NAME="${NAME:-litellm-gateway}"
TAG="${TAG:-1}"

: "${GOOGLE_KEY:?Set GOOGLE_KEY to your Gemini (Google AI Studio) key}"
MASTER_KEY="${MASTER_KEY:-sk-$(openssl rand -hex 16)}"

echo "▶ Building image into ACR $ACR …"
az acr build -r "$ACR" -t "$NAME:$TAG" gateway/

echo "▶ Ensuring Container Apps environment $ENVN …"
az containerapp env show -g "$RG" -n "$ENVN" >/dev/null 2>&1 \
  || az containerapp env create -g "$RG" -n "$ENVN" -l "$REGION"

echo "▶ Deploying $NAME …"
az containerapp create -g "$RG" -n "$NAME" \
  --environment "$ENVN" \
  --image "$ACR.azurecr.io/$NAME:$TAG" \
  --registry-server "$ACR.azurecr.io" \
  --target-port 4000 --ingress external \
  --min-replicas 1 --max-replicas 2 \
  --secrets gemini-key="$GOOGLE_KEY" master-key="$MASTER_KEY" \
  --env-vars GEMINI_API_KEY=secretref:gemini-key LITELLM_MASTER_KEY=secretref:master-key

FQDN="$(az containerapp show -g "$RG" -n "$NAME" --query properties.configuration.ingress.fqdn -o tsv)"
echo "▶ Gateway URL: https://$FQDN"

echo "▶ Storing master key in Key Vault $KV and wiring $APP …"
az keyvault secret set --vault-name "$KV" --name google-gateway-key --value "$MASTER_KEY" >/dev/null
az webapp config appsettings set -g "$RG" -n "$APP" --settings \
  GOOGLE_BASE_URL="https://$FQDN" \
  GOOGLE_API_KEY="@Microsoft.KeyVault(VaultName=$KV;SecretName=google-gateway-key)" \
  GOOGLE_MODELS="gemini-2.5-pro|Gemini 2.5 Pro,gemini-2.5-flash|Gemini 2.5 Flash" >/dev/null

echo
echo "✅ Done. Smoke-test the gateway:"
echo "   curl https://$FQDN/v1/messages \\"
echo "     -H \"Authorization: Bearer $MASTER_KEY\" -H \"content-type: application/json\" \\"
echo "     -d '{\"model\":\"gemini-2.5-pro\",\"max_tokens\":64,\"messages\":[{\"role\":\"user\",\"content\":\"say hi\"}]}'"
echo
echo "   App Service will restart with the new settings; Gemini then appears in BPMN Compare."
