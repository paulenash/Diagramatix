/**
 * Every model a deployment offers by DEFAULT must have a price.
 *
 * Not for tidiness. `allowedGenerateModels` excludes any model it cannot price,
 * for every non-SuperAdmin — so an unpriced model is not "shown as varies", it
 * is **absent**, and only for ordinary users. A SuperAdmin adding the provider
 * sees it work perfectly and nobody else can reach it.
 *
 * That is exactly how the OpenRouter models shipped: registered, routable,
 * callable, and invisible. The provider checklist has five spots and pricing is
 * the fifth; this test is the one that objects when it is missed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { allModels } from "@/app/lib/ai/models";
import { PRICING } from "@/app/lib/ai/pricing";
import { allowedGenerateModels } from "@/app/lib/ai/modelAccess";

// Every provider switched on at once, so the default lists are all populated.
const ENV: Record<string, string> = {
  MOONSHOT_API_KEY: "sk-test",
  DEEPSEEK_API_KEY: "sk-test",
  OPENROUTER_API_KEY: "sk-test",
};
const LIST_VARS = ["MOONSHOT_MODELS", "DEEPSEEK_MODELS", "OPENROUTER_MODELS"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
  // The curated DEFAULT lists, not whatever this machine's env overrides them
  // with — those are a deployment's own choice and may legitimately be unpriced.
  for (const k of LIST_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("default models are priced", () => {
  it("T4217 — every model in a curated default list has a PRICING row", () => {
    // Local models are free by construction and priced nowhere; custom models
    // are somebody's own env entry, where "varies" is the honest answer.
    const needsPrice = allModels().filter(
      (m) => m.provider !== "ollama" && !m.id.startsWith("ollama/"),
    );
    expect(needsPrice.length).toBeGreaterThan(8); // the list really is populated

    const unpriced = needsPrice.filter((m) => !PRICING[m.id]).map((m) => `${m.provider}: ${m.id}`);
    expect(unpriced, "unpriced default models are hidden from every non-SuperAdmin").toEqual([]);
  });

  it("T4218 — and so is reachable by an ordinary user, not only a SuperAdmin", () => {
    // The consequence the test above exists to prevent, stated directly: with
    // the most expensive default as the ceiling, every priced model qualifies.
    const ordinary = allowedGenerateModels("claude-fable-5", false).map((m) => m.id);
    const superAdmin = allowedGenerateModels("claude-fable-5", true)
      .filter((m) => m.provider !== "ollama" && PRICING[m.id])
      .map((m) => m.id);

    const onlySuperAdmin = superAdmin.filter((id) => !ordinary.includes(id));
    expect(onlySuperAdmin, "priced models a SuperAdmin can reach and nobody else can").toEqual([]);
  });
});
