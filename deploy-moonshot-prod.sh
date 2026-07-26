#!/usr/bin/env bash
#
# Wire Moonshot (Kimi) into PROD — the alternative AI provider. Unlike Gemini,
# Moonshot exposes a PUBLIC Anthropic-compatible endpoint (api.moonshot.ai/anthropic),
# so there is NO gateway to stand up: the app just needs the key set correctly.
# This stores it in Key Vault and references it on dgx-prod-app, so you don't have to
# type the setting names/values by hand. Run ONCE, after `az login`. Not part of CI.
#
# Usage (from the repo root):
#   export MOONSHOT_KEY="sk-...your-moonshot-key..."     # from https://platform.moonshot.ai
#   # optional — override the model lineup (default: kimi-k3, kimi-k2.6, kimi-k2.7-code):
#   # export MOONSHOT_MODELS="kimi-k3|Kimi K3,kimi-k2.6|Kimi K2.6"
#   bash deploy-moonshot-prod.sh
set -euo pipefail

RG="${RG:-dgx-prod-rg}"
APP="${APP:-dgx-prod-app}"
KV="${KV:-dgx-kv}"

: "${MOONSHOT_KEY:?Set MOONSHOT_KEY to your Moonshot (Kimi) API key from https://platform.moonshot.ai}"

echo "▶ Storing the Moonshot key in Key Vault $KV …"
az keyvault secret set --vault-name "$KV" --name moonshot-api-key --value "$MOONSHOT_KEY" >/dev/null

echo "▶ Wiring MOONSHOT_API_KEY on $APP …"
SETTINGS=( "MOONSHOT_API_KEY=@Microsoft.KeyVault(VaultName=$KV;SecretName=moonshot-api-key)" )
if [ -n "${MOONSHOT_MODELS:-}" ]; then
  SETTINGS+=( "MOONSHOT_MODELS=$MOONSHOT_MODELS" )
fi
az webapp config appsettings set -g "$RG" -n "$APP" --settings "${SETTINGS[@]}" >/dev/null

echo
echo "✅ Done. App Service restarts, then Kimi models appear in every picker"
echo "   (AI Generate, BPMN Compare) alongside Claude + Gemini."
echo
echo "If Kimi does NOT show up, the Key Vault reference didn't resolve (the app reads"
echo "an unresolved @Microsoft.KeyVault(...) as 'no key' and silently hides the models)."
echo "The Gemini deploy already proved $APP's identity can read $KV, so this should just"
echo "work — but if not, grant it 'Key Vault Secrets User' on $KV and restart:"
echo "   az webapp restart -g $RG -n $APP"
