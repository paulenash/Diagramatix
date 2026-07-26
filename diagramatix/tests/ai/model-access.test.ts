/**
 * Cost-gated model access: a normal user gets the current default generate model
 * plus anything equal-or-cheaper; a SuperAdmin-in-SA-mode gets everything. Enforced
 * in the routes via isModelAllowed, so a crafted request can't smuggle a pricier model.
 *
 * Runs with no MOONSHOT/GOOGLE keys, so allModels() == the Claude catalog:
 *   Haiku 4.5 (cheapest) < Sonnet 5 < Opus 4.8 = Opus 5 < Fable 5 (dearest).
 */
import { describe, it, expect } from "vitest";
import { allowedGenerateModels, isModelAllowed, modelCostUsd } from "@/app/lib/ai/modelAccess";

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-5";
const FABLE = "claude-fable-5";
const ids = (list: { id: string }[]) => list.map((m) => m.id).sort();

describe("cost-gated generate-model access", () => {
  it("T1034 normal user: current default + only equal-or-cheaper; SA-mode: everything", () => {
    // Haiku default (cheapest) → nothing cheaper, so only Haiku.
    expect(ids(allowedGenerateModels(HAIKU, false))).toEqual([HAIKU]);

    // Sonnet 5 default → Sonnet 5 + Haiku (cheaper), NOT Opus/Fable (dearer).
    const sonnetAllowed = ids(allowedGenerateModels(SONNET, false));
    expect(sonnetAllowed).toContain(SONNET);
    expect(sonnetAllowed).toContain(HAIKU);
    expect(sonnetAllowed).not.toContain(FABLE);
    expect(sonnetAllowed).not.toContain("claude-opus-4-8");

    // Fable 5 default (dearest) → every Claude model qualifies.
    expect(allowedGenerateModels(FABLE, false).length).toBe(allowedGenerateModels(FABLE, true).length);

    // SA-mode ignores the ceiling entirely.
    expect(allowedGenerateModels(HAIKU, true).length).toBeGreaterThan(1);
  });

  it("T1035 isModelAllowed mirrors the list; unpriced/unknown ids are rejected for a normal user", () => {
    expect(isModelAllowed(HAIKU, HAIKU, false)).toBe(true);
    expect(isModelAllowed(FABLE, HAIKU, false)).toBe(false);   // pricier than the Haiku default
    expect(isModelAllowed(FABLE, HAIKU, true)).toBe(true);     // SA-mode allows it
    expect(isModelAllowed("made-up-model", SONNET, false)).toBe(false); // unknown → not offered
    expect(modelCostUsd("made-up-model")).toBeNull();
  });
});
