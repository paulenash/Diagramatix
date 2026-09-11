/**
 * A user's own key has to unlock that provider's MODELS as well as pay for them.
 *
 * Storing a key is inert on its own: the picker is built from the deployment's
 * environment, so a provider the deployment has no key for contributes nothing
 * to `allModels()` — a user could save an OpenRouter key and find nothing in the
 * list to spend it on. And `chooseModel` would then reject the model the picker
 * DID offer and substitute the default, producing a diagram on a model nobody
 * chose, billed to the deployment, with no error anywhere.
 */
import { describe, it, expect, afterEach } from "vitest";
import { allModels, openrouterModels, providerForModel, providerFromIdShape } from "@/app/lib/ai/models";
import { allowedGenerateModels, chooseModel } from "@/app/lib/ai/modelAccess";
import { providerOf } from "@/app/lib/ai/aiRates";

const ENV = ["OPENROUTER_API_KEY", "OPENROUTER_MODELS", "MOONSHOT_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV) saved[k] = process.env[k];
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const OR = new Set(["openrouter"]);

describe("a user's own key unlocks that provider's models", () => {
  it("T4213 — with no deployment key, OpenRouter models appear only for a user who supplied one", () => {
    delete process.env.OPENROUTER_API_KEY;

    // The deployment-only view: nothing, exactly as before.
    expect(openrouterModels()).toEqual([]);
    expect(allModels().some((m) => m.provider === "openrouter")).toBe(false);

    // The same call, for a user who has stored a key.
    expect(openrouterModels(OR).length).toBeGreaterThan(0);
    expect(allModels(OR).some((m) => m.provider === "openrouter")).toBe(true);
  });

  it("T4214 — a model only the user's key unlocks survives chooseModel instead of being swapped", () => {
    delete process.env.OPENROUTER_API_KEY;
    const unlockedId = openrouterModels(OR)[0].id;

    // Without the unlock the request is silently downgraded — the failure this
    // test exists for. Note it does NOT throw or 403: it succeeds, wrongly.
    expect(chooseModel(unlockedId, "claude-opus-5", false)).toBe("claude-opus-5");

    // With it, the caller gets the model they asked for.
    expect(chooseModel(unlockedId, "claude-opus-5", false, OR)).toBe(unlockedId);
  });

  it("T4215 — the unlock widens the list without widening it for anybody else", () => {
    delete process.env.OPENROUTER_API_KEY;
    const withKey = allowedGenerateModels("claude-opus-5", false, OR);
    const without = allowedGenerateModels("claude-opus-5", false);

    expect(withKey.length).toBeGreaterThan(without.length);
    // Nothing the deployment could already reach is lost.
    for (const m of without) expect(withKey.some((x) => x.id === m.id)).toBe(true);
    // ...and the extra models are all from the unlocked provider, not a
    // general loosening of the cost ceiling.
    const extra = withKey.filter((m) => !without.some((x) => x.id === m.id));
    expect(extra.length).toBeGreaterThan(0);
    for (const m of extra) expect(m.provider).toBe("openrouter");
  });

  it("T4216 — a namespaced id resolves to OpenRouter even when the registry has never heard of it", () => {
    delete process.env.OPENROUTER_API_KEY;
    // Not in allModels() at all here — the registry is empty for this provider.
    expect(allModels().some((m) => m.id === "openai/gpt-5.2")).toBe(false);
    // It must still NOT be treated as Anthropic, or the request goes to
    // Anthropic with a model name Anthropic does not have.
    expect(providerForModel("openai/gpt-5.2")).toBe("openrouter");
    expect(providerForModel("anthropic/claude-sonnet-4.6")).toBe("openrouter");

    // A bare unknown name still defaults to Anthropic, as it always has.
    expect(providerFromIdShape("something-new")).toBeUndefined();
    expect(providerForModel("something-new")).toBe("anthropic");
    // ...and a local model keeps its own provider rather than being caught by
    // the slash rule, which its ids also contain.
    expect(providerFromIdShape("ollama/google/gemma-4-e4b")).toBeUndefined();
  });

  it("T4219 — routing and BILLING agree about who serves a namespaced id", () => {
    // Two functions answer "which provider is this?": providerForModel routes the
    // request, providerOf prices it. They are deliberately separate (one is
    // env-aware, the other pure), so nothing stops them drifting — and a drift
    // here bills one vendor for a call made to another.
    delete process.env.OPENROUTER_API_KEY;
    for (const id of ["openai/gpt-5.2", "anthropic/claude-sonnet-4.6", "meta-llama/llama-4-70b"]) {
      expect(providerForModel(id), id).toBe(providerOf(id));
    }
  });
});
