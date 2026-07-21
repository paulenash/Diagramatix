import Anthropic from "@anthropic-ai/sdk";
import { providerForModel } from "./models";

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
    ? process.env.MOONSHOT_API_KEY?.trim() || undefined
    : process.env.ANTHROPIC_API_KEY?.trim() || undefined;
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
      apiKey: process.env.MOONSHOT_API_KEY?.trim() ?? "",
      baseURL: process.env.MOONSHOT_BASE_URL?.trim() || MOONSHOT_DEFAULT_BASE_URL,
    };
  }
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim();
  return {
    apiKey: fallbackApiKey ?? process.env.ANTHROPIC_API_KEY?.trim() ?? "",
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
  return baseURL ? new Anthropic({ apiKey, baseURL }) : new Anthropic({ apiKey });
}
