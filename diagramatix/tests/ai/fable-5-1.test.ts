/**
 * "Is AI Generation using Fable 5.1 when it says Fable 5?" — Paul, 2026-09-13.
 *
 * It was not, and the way it was not is the thing worth pinning. The catalogue
 * knew one id, `claude-fable-5`, and the API answered that id with Fable 5 —
 * dateless ids from the 4.6 generation on are pinned snapshots, not aliases that
 * float to the newest release. So a picker entry can never quietly upgrade
 * itself; a newer model has to be ADDED, with a price, or it is not there.
 *
 * Two ways to get this wrong again, each guarded below: relabel the old id
 * "Fable 5.1" and call it done (T4350), or add the id and forget the pricing row
 * so it is invisible to every non-SuperAdmin (T4351 — the OpenRouter failure
 * mode, see pricing-completeness.test.ts).
 */
import { describe, it, expect } from "vitest";
import { AI_MODELS } from "@/app/lib/ai/models";
import { PRICING } from "@/app/lib/ai/pricing";
import { allowedGenerateModels } from "@/app/lib/ai/modelAccess";

const FABLE_5_1 = "claude-fable-5-1";
const FABLE_5 = "claude-fable-5";

describe("Fable 5.1 is a model of its own", () => {
  it("T4350 — 5.1 and 5 are two catalogue entries with two different ids", () => {
    const v51 = AI_MODELS.find((m) => m.id === FABLE_5_1);
    const v5 = AI_MODELS.find((m) => m.id === FABLE_5);
    expect(v51, "Fable 5.1 must be in the Claude catalogue").toBeDefined();
    expect(v5, "Fable 5 is still available and stays listed").toBeDefined();
    // The id is what is sent to the API; the label is what a person reads. A
    // label saying 5.1 over an id saying 5 would be the original confusion,
    // made permanent.
    expect(v51!.label).toMatch(/5\.1/);
    expect(v5!.label).not.toMatch(/5\.1/);
    expect(v51!.vision, "the docs list image input for Fable 5.1").toBe(true);
  });

  it("T4351 — 5.1 is priced, so an ordinary user can actually pick it", () => {
    expect(PRICING[FABLE_5_1], "an unpriced model is hidden, not shown as 'varies'").toBeDefined();
    // Same list price as Fable 5 (claude.com/pricing, 2026-09-13): it ties at the
    // top of the cost gate rather than raising the ceiling for anyone.
    expect(PRICING[FABLE_5_1]).toEqual(PRICING[FABLE_5]);
    // With Fable 5 as the deployment default, 5.1 is equal-priced and therefore
    // offered to a normal user — not only to a SuperAdmin.
    const ordinary = allowedGenerateModels(FABLE_5, false).map((m) => m.id);
    expect(ordinary).toContain(FABLE_5_1);
  });
});
