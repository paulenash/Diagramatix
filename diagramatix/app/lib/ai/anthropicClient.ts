import Anthropic from "@anthropic-ai/sdk";

/**
 * The single place the Anthropic client is constructed. Honours the optional
 * `ANTHROPIC_BASE_URL` env var so a deployment can route ALL AI traffic through
 * an enterprise proxy / private gateway / self-hosted or region-pinned endpoint
 * (data-residency + egress control) without touching any call site. When unset,
 * the SDK's default endpoint (api.anthropic.com) is used.
 *
 * Enterprise readiness — Phase A1 (ENT-08). See diagramatix/enterprise/.
 */
export function makeAnthropic(apiKey: string): Anthropic {
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim();
  return baseURL ? new Anthropic({ apiKey, baseURL }) : new Anthropic({ apiKey });
}
