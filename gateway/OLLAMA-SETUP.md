# Local Ollama as a Diagramatix AI‑generation provider

Host one or more open LLMs on a **local Linux box** (Ollama) and offer them in
Diagramatix's model picker, exactly like Claude / Kimi / Gemini.

## How it fits

Diagramatix makes AI calls **server‑side** through the Anthropic Messages API.
Ollama does **not** speak that API, so — just like Gemini and the Azure models — we
put a small **LiteLLM proxy** in front of it that translates Anthropic ⇄ Ollama.

```
Diagramatix server ──POST /v1/messages──► LiteLLM (:4000) ──► Ollama (:11434) ──► model
   (your PC / Azure)     Anthropic shape       on the Linux box, same LAN
```

**Network reality** — the *server* makes the call, so the Ollama box only needs to
be reachable from wherever Diagramatix runs:

- **Local Diagramatix** (`npm run go` on your PC) → the Linux box on the same LAN:
  works directly, nothing to expose. **This is the recommended setup.**
- **Prod Diagramatix** (Azure) → your home Ollama: Azure can't reach your LAN. You'd
  need a tunnel (Tailscale / Cloudflare Tunnel) to expose the gateway publicly —
  possible, but not recommended for a home box (security + it must stay on).

---

## On the Linux box (your son sets up)

1. **Install Ollama** and pull a model or two. Good picks for Diagramatix's
   JSON‑heavy generation (structured output): `qwen2.5-coder`, `llama3.1`,
   `deepseek-r1`. Add `llava` if you want image‑to‑diagram.
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ollama pull llama3.1
   ollama pull qwen2.5-coder:14b
   ```
2. **Expose Ollama on the LAN** (it binds to localhost by default). Set
   `OLLAMA_HOST=0.0.0.0` for the service, or run `OLLAMA_HOST=0.0.0.0 ollama serve`.
   Note the box's LAN IP (`ip addr` → e.g. `192.168.0.42`).
3. **Run the LiteLLM gateway** (Docker) with the bundled config
   [`ollama.config.yaml`](./ollama.config.yaml). Edit it to list exactly the models
   you pulled (keep the `ollama/` prefix on each `model_name`).
   ```bash
   docker run -d --name litellm --network host \
     -e LITELLM_MASTER_KEY='choose-a-long-random-key' \
     -v "$PWD/ollama.config.yaml:/app/config.yaml" \
     ghcr.io/berriai/litellm:main-latest --config /app/config.yaml
   ```
   (`--network host` lets LiteLLM reach Ollama at `http://localhost:11434`.)
4. **Smoke‑test** from your PC:
   ```bash
   curl http://192.168.0.42:4000/v1/messages \
     -H "Authorization: Bearer choose-a-long-random-key" \
     -H "content-type: application/json" \
     -d '{"model":"ollama/llama3.1","max_tokens":50,"messages":[{"role":"user","content":"say hi"}]}'
   ```

---

## In Diagramatix (already scaffolded — dormant until these are set)

Add to your **local** `.env` (the box IP + the master key + your models), then
restart with `npm run go`:

```bash
OLLAMA_BASE_URL=http://192.168.0.42:4000        # the LiteLLM gateway
OLLAMA_API_KEY=choose-a-long-random-key         # the LiteLLM master key (omit if no auth)
# id|Label, comma-separated. ids MUST match the gateway's model_name (ollama/ prefix).
OLLAMA_MODELS=ollama/llama3.1|Llama 3.1 (local),ollama/qwen2.5-coder:14b|Qwen2.5 Coder 14B (local)
```

That's it — the models appear in **AI Models Selection** and every generate/compare
picker, priced at **$0** (local), and are usable by any user (free ⇒ passes the
cost gate). No app rebuild/deploy needed; it's env‑driven.

## Notes / expectations

- **Quality**: local models are weaker than Claude at strict JSON‑schema adherence,
  so generations may need more retries or cleanup — great for experimenting and
  offline/private work, not a like‑for‑like Claude replacement.
- **Speed**: depends entirely on the box's GPU/CPU. A slow model can exceed Azure's
  ~230s request limit — another reason to use **local Diagramatix** with it.
- **Vision**: an id containing `llava` / `vision` / `multimodal` is auto‑enabled for
  image input; others are text‑only.
- **Security**: keep it LAN‑only unless you deliberately tunnel it; set a master key
  so nothing else on the network can drive your models.
