# Installing a local LLM for Diagramatix (Ollama)

Host one or more open LLMs on a **local Linux box** and offer them in Diagramatix's
AI model picker, alongside Claude / Kimi / Gemini.

---

## How it fits together

Diagramatix makes AI calls **server‑side** through the Anthropic Messages API.
Ollama does **not** speak that API, so — just like Gemini and the Azure models — a
small **LiteLLM proxy** sits in front of Ollama and translates Anthropic ⇄ Ollama.

```
Diagramatix server ──POST /v1/messages──► LiteLLM (:4000) ──► Ollama (:11434) ──► model
   (your PC / Azure)     Anthropic shape       on the Linux box, same LAN
```

**Network reality** — the *server* makes the call, so the Ollama box only needs to
be reachable from wherever Diagramatix runs:

- **Local Diagramatix** (`npm run go` on your PC) → the Linux box on the same LAN:
  works directly, nothing to expose. **← recommended.**
- **Prod Diagramatix** (Azure) → your home Ollama: Azure can't reach your LAN. You'd
  need a tunnel (Tailscale / Cloudflare Tunnel) to expose the gateway publicly —
  possible, but not recommended for a home box (security + it must stay on).

---

## Part A — on the Linux box

### 1. Install Ollama and pull a model or two

Good picks for Diagramatix's JSON‑heavy generation (structured output):
`qwen2.5-coder`, `llama3.1`, `deepseek-r1`. Add `llava` if you want image‑to‑diagram.

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1
ollama pull qwen2.5-coder:14b
```

### 2. Expose Ollama on the LAN

Ollama binds to localhost by default. Make it reachable from your PC:

```bash
# Quick way (foreground):
OLLAMA_HOST=0.0.0.0 ollama serve

# Or make it permanent for the systemd service:
sudo systemctl edit ollama
#   [Service]
#   Environment="OLLAMA_HOST=0.0.0.0"
sudo systemctl restart ollama
```

Find the box's LAN IP (e.g. `192.168.0.42`):

```bash
ip addr | grep 'inet '
```

### 3. Run the LiteLLM gateway (Docker)

Create `ollama.config.yaml` (list exactly the models you pulled — keep the
`ollama/` prefix on each `model_name`):

```yaml
model_list:
  - model_name: ollama/llama3.1
    litellm_params:
      model: ollama_chat/llama3.1
      api_base: http://localhost:11434
  - model_name: ollama/qwen2.5-coder:14b
    litellm_params:
      model: ollama_chat/qwen2.5-coder:14b
      api_base: http://localhost:11434
  # A vision model (e.g. llava) is auto-detected by Diagramatix from the id:
  # - model_name: ollama/llava
  #   litellm_params:
  #     model: ollama_chat/llava
  #     api_base: http://localhost:11434

general_settings:
  # Every request must send  Authorization: Bearer <LITELLM_MASTER_KEY>.
  # This is what Diagramatix sends as OLLAMA_API_KEY. Omit this line to run with no
  # auth on a trusted LAN (then leave OLLAMA_API_KEY unset in Diagramatix).
  master_key: os.environ/LITELLM_MASTER_KEY
```

Run it (`--network host` lets LiteLLM reach Ollama at `localhost:11434`):

```bash
docker run -d --name litellm --network host \
  -e LITELLM_MASTER_KEY='choose-a-long-random-key' \
  -v "$PWD/ollama.config.yaml:/app/config.yaml" \
  ghcr.io/berriai/litellm:main-latest --config /app/config.yaml
```

### 4. Smoke‑test from your PC

```bash
curl http://192.168.0.42:4000/v1/messages \
  -H "Authorization: Bearer choose-a-long-random-key" \
  -H "content-type: application/json" \
  -d '{"model":"ollama/llama3.1","max_tokens":50,"messages":[{"role":"user","content":"say hi"}]}'
```

A JSON reply with the model's text = you're ready.

---

## Part B — in Diagramatix (already scaffolded; dormant until set)

Add to your **local** `.env` (the box IP, the master key, and your models), then
restart with `npm run go`:

```bash
OLLAMA_BASE_URL=http://192.168.0.42:4000        # the LiteLLM gateway
OLLAMA_API_KEY=choose-a-long-random-key         # the LiteLLM master key (omit if no auth)
# id|Label, comma-separated. ids MUST match the gateway's model_name (ollama/ prefix).
OLLAMA_MODELS=ollama/llama3.1|Llama 3.1 (local),ollama/qwen2.5-coder:14b|Qwen2.5 Coder 14B (local)
```

That's it — the models appear in **AI Models Selection** and every generate/compare
picker, priced at **$0** (local), usable by any user. No app rebuild/deploy needed.

---

## Notes / expectations

- **Quality**: local models are weaker than Claude at strict JSON‑schema adherence,
  so generations may need more retries or cleanup — great for experimenting and
  offline/private work, not a like‑for‑like Claude replacement.
- **Speed**: depends entirely on the box's GPU/CPU. A slow model can exceed Azure's
  ~230 s request limit — another reason to use **local Diagramatix** with it.
- **Vision**: an id containing `llava` / `vision` / `multimodal` is auto‑enabled for
  image input; others are text‑only.
- **Security**: keep it LAN‑only unless you deliberately tunnel it; set a master key
  so nothing else on the network can drive your models.
