/**
 * T4745–T4747 — Claude Opus 5.5, the Sonnet 5 price that was wrong, and the
 * mechanism that made correcting it useless.
 *
 * Paul, 2026-09-25: "check with Anthropic for new models." Asking the account's
 * own key rather than trusting a docs page found `claude-opus-5-5`, released
 * four days earlier — and, on the way, that the Sonnet 5 rate recorded here had
 * become WRONG rather than merely stale: the rise from $2/$10 to $3/$15
 * scheduled for 1 September 2026 was cancelled, so $2/$10 is the standard
 * price and the AI Usage report had been billing Sonnet 5 at 1.5x its cost.
 *
 * The third test is the one that matters. Correcting the constant fixed
 * nothing, because a seeded AiModelRate row was shadowing it.
 */
import { describe, it, expect } from "vitest";
import { AI_MODELS } from "@/app/lib/ai/models";
import { PRICING } from "@/app/lib/ai/pricing";
import { matchesDefault, providerOf } from "@/app/lib/ai/aiRates";
import { readFileSync } from "node:fs";

describe("T4745 — Opus 5.5 is offered, and priced", () => {
  it("is in the catalog with vision, above Opus 5", () => {
    const ids = AI_MODELS.map((m) => m.id);
    expect(ids, "the model the API lists as current").toContain("claude-opus-5-5");
    const m = AI_MODELS.find((x) => x.id === "claude-opus-5-5")!;
    expect(m.label).toBe("Opus 5.5");
    // `image_input` is supported — checked against GET /v1/models, not assumed.
    expect(m.vision, "so it can be the Vision model too").toBe(true);
    expect(ids.indexOf("claude-opus-5-5"), "newest first, like every other pair")
      .toBeLessThan(ids.indexOf("claude-opus-5"));
  });

  it("costs LESS than the model it supersedes, which is unusual enough to pin", () => {
    // It matters beyond tidiness: `allowedGenerateModels` gates ordinary users
    // on cost, so a cheaper flagship is one they can actually reach.
    const newer = PRICING["claude-opus-5-5"];
    const older = PRICING["claude-opus-5"];
    expect(newer, "unpriced means hidden from every non-SuperAdmin").toBeTruthy();
    expect(newer.in).toBe(4);
    expect(newer.out).toBe(20);
    expect(newer.in).toBeLessThan(older.in);
    expect(newer.out).toBeLessThan(older.out);
  });
});

describe("T4746 — Sonnet 5 is $2 / $10, and the cancelled rise is not re-applied", () => {
  it("the corrected number, with no lingering intro note", () => {
    expect(PRICING["claude-sonnet-5"].in, "$3 was the rise that never happened").toBe(2);
    expect(PRICING["claude-sonnet-5"].out).toBe(10);
    expect(PRICING["claude-sonnet-5"].note, "there is nothing conditional left to say")
      .toBeUndefined();
  });

  it("the reason is written where the next person will look", () => {
    // Without this, $3/$15 reads like a plain typo and gets "fixed" back.
    const src = readFileSync("app/lib/ai/pricing.ts", "utf8");
    expect(src).toMatch(/CANCELLED/);
  });
});

describe("T4747 — a rate row that merely COPIES a default is never stored", () => {
  it("matchesDefault sees the copy for what it is", () => {
    const p = PRICING["claude-sonnet-5"];
    expect(matchesDefault("anthropic", "claude-sonnet-5", p.in, p.out)).toBe(true);
    // The actual seeded row, which is what went stale.
    expect(matchesDefault("anthropic", "claude-sonnet-5", 3, 15), "no longer the default").toBe(false);
    // A genuine override is a real choice and must survive.
    expect(matchesDefault("anthropic", "claude-opus-5", 4.2, 21)).toBe(false);
    // An unpriced model has no default to match, so any row for it is a choice.
    expect(matchesDefault("anthropic", "some-local-model", 1, 2)).toBe(false);
    // And the provider has to agree, or a row could be dropped against a
    // default that was never its own.
    expect(matchesDefault("openrouter", "claude-sonnet-5", p.in, p.out)).toBe(false);
    expect(providerOf("claude-sonnet-5")).toBe("anthropic");
  });

  it("the save path deletes it rather than storing it", () => {
    // Source-level: the route needs auth + Prisma, and this suite has neither.
    // The screen posts EVERY row it shows, defaults included — which is how ten
    // copies were written in a single transaction on 2026-07-23 — so the
    // distinction can only be made here.
    const src = readFileSync("app/api/admin/ai-rates/route.ts", "utf8");
    expect(src, "the default-valued rows are separated out").toMatch(/matchesDefault/);
    expect(src, "and removed, not upserted").toMatch(/deleteMany/);
    const dropAt = src.indexOf("toDrop");
    const storeAt = src.indexOf("toStore");
    expect(dropAt).toBeGreaterThan(-1);
    expect(storeAt).toBeGreaterThan(-1);
    expect(src.slice(src.indexOf("$transaction")), "both halves run in ONE transaction")
      .toMatch(/deleteMany[\s\S]*upsert/);
  });

  it("every default is its own match — the seed could not have been written today", () => {
    // Stated as a property rather than a list: whatever pricing.ts says now,
    // saving those exact numbers stores nothing.
    for (const [model, p] of Object.entries(PRICING)) {
      expect(matchesDefault(providerOf(model), model, p.in, p.out), `${model} would be stored`).toBe(true);
    }
  });
});
