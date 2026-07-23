import Anthropic from "@anthropic-ai/sdk";
import { providerForModel, resolvedEnvSecret } from "./models";
import { recordAiInvocation } from "./aiTelemetry";

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

/** The key env var that serves a given model's provider. */
export function aiApiKey(model: string | null | undefined): string | undefined {
  return providerForModel(model) === "moonshot"
    ? resolvedEnvSecret(process.env.MOONSHOT_API_KEY)
    : resolvedEnvSecret(process.env.ANTHROPIC_API_KEY);
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
  if (providerForModel(model) === "moonshot") {
    return {
      apiKey: resolvedEnvSecret(process.env.MOONSHOT_API_KEY) ?? "",
      baseURL: process.env.MOONSHOT_BASE_URL?.trim() || MOONSHOT_DEFAULT_BASE_URL,
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
  const telemetry = { fetch: countingFetch, maxRetries: 2 };

  let client: Anthropic;
  if (provider === "moonshot") {
    // Moonshot's Anthropic-compatible endpoint authenticates via
    // `Authorization: Bearer <key>` (like Claude Code's ANTHROPIC_AUTH_TOKEN), NOT
    // Anthropic's native `x-api-key` header. So hand the key to the SDK as
    // `authToken` (Bearer) and null out apiKey to suppress the x-api-key header.
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
