import Anthropic from "@anthropic-ai/sdk";
import { providerForModel, resolvedEnvSecret } from "./models";
import { recordAiInvocation } from "./aiTelemetry";

/**
 * The model name to send to the backend for a given registry id.
 *
 * Local (ollama) model ids carry an `ollama/` prefix so pricing/telemetry tag
 * them as free (aiRates.ts) and modelAccess offers them to every user. A LiteLLM
 * gateway mirrors those prefixed names, so it receives them verbatim. But a
 * DIRECT backend (LM Studio / raw Ollama serving the Anthropic Messages API)
 * expects its own bare model names (e.g. `google/gemma-4-e4b`, not
 * `ollama/google/gemma-4-e4b`). Setting `OLLAMA_STRIP_MODEL_PREFIX` strips the
 * `ollama/` prefix on the way out, while the prefixed id is kept for
 * pricing/telemetry. Leave the flag UNSET for the gateway pattern.
 */
export function backendModelName(provider: string, model: string): string {
  const strip = /^(1|true|yes|on)$/i.test((process.env.OLLAMA_STRIP_MODEL_PREFIX ?? "").trim());
  if (provider === "ollama" && strip) return model.replace(/^ollama\//i, "");
  return model;
}

/**
 * Cap `max_tokens` for local (ollama) backends. The cloud planners request a
 * 16000–32000-token output budget, but a small local box can't set up that big
 * a generation context: LM Studio stalls and a tunnel in front of it returns
 * `ERR_NGROK_3004` (invalid/incomplete upstream response). `OLLAMA_MAX_TOKENS`
 * (default 4096) bounds the ask to what the box's loaded context can serve — it
 * MUST be ≤ the model's context length in LM Studio minus the prompt. Cloud
 * providers keep their full budget.
 */
export function cappedMaxTokens(model: string, cloudDefault: number): number {
  // Detect local models by the registry provider OR the `ollama/` id prefix
  // (the same convention aiRates uses) — the prefix works even when the model
  // registry isn't populated (e.g. tests, or before env is read).
  const isLocal = providerForModel(model) === "ollama" || /^ollama[/:]/i.test(model ?? "");
  if (isLocal) {
    const n = Number(process.env.OLLAMA_MAX_TOKENS);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4096;
  }
  return cloudDefault;
}

/**
 * Anthropic client construction, honouring the optional `ANTHROPIC_BASE_URL` env
 * var so a deployment can route ALL Claude traffic through an enterprise proxy /
 * private gateway / self-hosted or region-pinned endpoint (data-residency + egress
 * control) without touching any call site. When unset, the SDK's default endpoint
 * (api.anthropic.com) is used.
 *
 * Enterprise readiness — Phase A1 (ENT-08). See diagramatix/enterprise/.
 */
export function makeAnthropic(apiKey: string): Anthropic {
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim();
  return baseURL ? new Anthropic({ apiKey, baseURL }) : new Anthropic({ apiKey });
}

/** Moonshot/Kimi's Anthropic-compatible endpoint (international). Override with
 *  `MOONSHOT_BASE_URL` (e.g. https://api.moonshot.cn/anthropic for mainland China). */
const MOONSHOT_DEFAULT_BASE_URL = "https://api.moonshot.ai/anthropic";

/** DeepSeek's Anthropic-compatible endpoint. Override with `DEEPSEEK_BASE_URL`. */
const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic";

/** The key env var that serves a given model's provider. */
export function aiApiKey(model: string | null | undefined): string | undefined {
  switch (providerForModel(model)) {
    case "moonshot":  return resolvedEnvSecret(process.env.MOONSHOT_API_KEY);
    case "google":    return resolvedEnvSecret(process.env.GOOGLE_API_KEY);
    case "microsoft": return resolvedEnvSecret(process.env.MICROSOFT_API_KEY);
    case "deepseek":  return resolvedEnvSecret(process.env.DEEPSEEK_API_KEY);
    default:          return resolvedEnvSecret(process.env.ANTHROPIC_API_KEY);
  }
}

/**
 * Resolve the API key + base URL for a model's provider. Pure w.r.t. its args
 * (reads env), so it's unit-testable without a network call. Moonshot/Kimi is
 * reached via its Anthropic-compatible endpoint, so the SAME SDK + Messages-API
 * shape works — only these two values change. `fallbackApiKey` lets the anthropic
 * branch reuse the key a caller already resolved (preserves existing plumbing).
 */
export function aiClientConfig(
  model: string | null | undefined,
  fallbackApiKey?: string,
): { apiKey: string; baseURL?: string } {
  const provider = providerForModel(model);
  if (provider === "moonshot") {
    return {
      apiKey: resolvedEnvSecret(process.env.MOONSHOT_API_KEY) ?? "",
      baseURL: process.env.MOONSHOT_BASE_URL?.trim() || MOONSHOT_DEFAULT_BASE_URL,
    };
  }
  if (provider === "google") {
    // Gemini is served via a required Anthropic-compatible gateway — no public
    // default endpoint, so GOOGLE_BASE_URL must be set (googleModels() already
    // hides the models until it is).
    return {
      apiKey: resolvedEnvSecret(process.env.GOOGLE_API_KEY) ?? "",
      baseURL: process.env.GOOGLE_BASE_URL?.trim() || undefined,
    };
  }
  if (provider === "microsoft") {
    // Azure OpenAI / Phi via a required Anthropic-compatible gateway (like Gemini).
    return {
      apiKey: resolvedEnvSecret(process.env.MICROSOFT_API_KEY) ?? "",
      baseURL: process.env.MICROSOFT_BASE_URL?.trim() || undefined,
    };
  }
  if (provider === "deepseek") {
    // DeepSeek via its Anthropic-compatible endpoint (public default), Bearer-auth.
    return {
      apiKey: resolvedEnvSecret(process.env.DEEPSEEK_API_KEY) ?? "",
      baseURL: process.env.DEEPSEEK_BASE_URL?.trim() || DEEPSEEK_DEFAULT_BASE_URL,
    };
  }
  if (provider === "ollama") {
    // Local Ollama via a required Anthropic-compatible gateway (LiteLLM) — the key
    // is the gateway's master key, optional if it has no auth. See gateway/OLLAMA-SETUP.md.
    return {
      apiKey: resolvedEnvSecret(process.env.OLLAMA_API_KEY) ?? "",
      baseURL: process.env.OLLAMA_BASE_URL?.trim() || undefined,
    };
  }
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim();
  return {
    apiKey: fallbackApiKey ?? resolvedEnvSecret(process.env.ANTHROPIC_API_KEY) ?? "",
    baseURL: baseURL || undefined,
  };
}

/**
 * The provider-aware client for a given model — an Anthropic SDK client pointed at
 * the right endpoint (Anthropic for Claude, Moonshot's Anthropic-compatible endpoint
 * for Kimi). Returns a real Anthropic client, so every call site keeps using the
 * identical `.messages.create(...)` interface + response shape. This is the single
 * seam where the choose-your-provider routing lives.
 */
export function makeAiClient(model: string | null | undefined, fallbackApiKey?: string): Anthropic {
  const { apiKey, baseURL } = aiClientConfig(model, fallbackApiKey);
  const provider = providerForModel(model);

  // Per-invocation HTTP-attempt counter, so we can observe SDK retries (429 / 5xx /
  // network). One makeAiClient call == one logical invocation == one create(), so
  // the client's own fetch counter is scoped to that invocation.
  let attempts = 0;
  const countingFetch: typeof fetch = (input, init) => {
    attempts += 1;
    return fetch(input as Parameters<typeof fetch>[0], init);
  };
  // An explicit client timeout (15 min) does double duty: it caps a genuinely hung
  // request, AND — because the SDK only runs its "streaming is required for >10 min
  // operations" guard when the client timeout is UNSET — it lets the large-output
  // plan call (max_tokens 32000 for Opus/Sonnet, above the ~21k guard threshold)
  // stay a plain non-streaming create with telemetry intact.
  // maxRetries 4, not 2. The SDK retries 408/409/429/5xx with exponential
  // backoff and honours retry-after, and 529 (Anthropic "overloaded") is a 5xx.
  // Paul hit a sustained overload on 2026-09-03 that three attempts could not
  // ride out; five gives a saturated provider appreciably longer to recover
  // without anyone re-clicking. It costs nothing when the provider is healthy.
  const telemetry = { fetch: countingFetch, maxRetries: 4, timeout: 15 * 60 * 1000 };

  let client: Anthropic;
  if (provider === "moonshot" || provider === "google" || provider === "microsoft" || provider === "ollama" || provider === "deepseek") {
    // All reached via an Anthropic-compatible endpoint that authenticates with
    // `Authorization: Bearer <key>` (Moonshot's endpoint; a LiteLLM-style gateway
    // for Gemini / Azure OpenAI / Phi) — NOT Anthropic's native `x-api-key` header.
    // So hand the key to the SDK as `authToken` (Bearer) and null out apiKey to
    // suppress the x-api-key header.
    client = new Anthropic({ authToken: apiKey, apiKey: null, baseURL, ...telemetry });
  } else {
    client = baseURL
      ? new Anthropic({ apiKey, baseURL, ...telemetry })
      : new Anthropic({ apiKey, ...telemetry });
  }
  return instrumentClient(client, provider, model ?? "(unknown)", () => attempts);
}

/** HTTP status (number) or error name, for the failure row's errorCode. */
function errorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return String(status);
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string" && name) return name;
  }
  return "Error";
}

/**
 * Wrap the client so `messages.create` records one AiInvocation row on settle —
 * provider / model / tokens / stop_reason / retries / latency — merged with the
 * route's AsyncLocalStorage context (userId / orgId / invocationPoint). The
 * telemetry write never throws and the original result/error passes through
 * unchanged, so instrumentation is invisible to callers.
 */
function instrumentClient(
  client: Anthropic,
  provider: string,
  model: string,
  getAttempts: () => number,
): Anthropic {
  const messages = client.messages;
  const originalCreate = messages.create.bind(messages) as typeof messages.create;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages.create = (async (body: any, options?: any) => {
    // Rewrite the outbound model name for direct local backends (see
    // backendModelName). Telemetry below still records the original `model`
    // (the prefixed registry id), so pricing/free-tagging is unaffected.
    if (provider === "ollama" && typeof body?.model === "string") {
      body = { ...body, model: backendModelName(provider, body.model) };
    }
    const t0 = Date.now();
    const before = getAttempts();
    try {
      const resp = await originalCreate(body, options);
      const retries = Math.max(0, getAttempts() - before - 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usage = (resp as any)?.usage ?? {};
      await recordAiInvocation({
        provider,
        model,
        status: "success",
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        truncated: (resp as any)?.stop_reason === "max_tokens",
        retries,
        latencyMs: Date.now() - t0,
      });
      return resp;
    } catch (err) {
      const retries = Math.max(0, getAttempts() - before - 1);
      await recordAiInvocation({
        provider,
        model,
        status: "failure",
        errorCode: errorCode(err),
        retries,
        latencyMs: Date.now() - t0,
      });
      throw err;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  return client;
}
