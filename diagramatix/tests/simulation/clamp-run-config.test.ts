/**
 * SIM-01 — a scenario's stored runConfig is untrusted (an editor sets it, or it
 * arrives via import), and runMonteCarlo loops synchronously in the request. An
 * absurd horizon × replications would pin a server core, so the API boundary
 * clamps it to RUN_LIMITS before the engine sees it.
 */
import { describe, it, expect } from "vitest";
import { clampRunConfig, RUN_LIMITS } from "@/app/lib/simulation/runner";
import { DEFAULT_RUN_CONFIG, type SimRunConfig } from "@/app/lib/simulation/types";

const cfg = (over: Partial<SimRunConfig>): SimRunConfig => ({ ...DEFAULT_RUN_CONFIG, ...over });

describe("clampRunConfig", () => {
  it("leaves a sensible config untouched and reports not-clamped", () => {
    const r = clampRunConfig(cfg({ horizon: 2000, replications: 8, warmUp: 200 }));
    expect(r.clamped).toBe(false);
    expect(r.cfg).toMatchObject({ horizon: 2000, replications: 8, warmUp: 200 });
  });

  it("caps an absurd horizon", () => {
    const r = clampRunConfig(cfg({ horizon: 1e9, replications: 1 }));
    expect(r.cfg.horizon).toBe(RUN_LIMITS.maxHorizon);
    expect(r.clamped).toBe(true);
  });

  it("caps an absurd replication count", () => {
    const r = clampRunConfig(cfg({ horizon: 100, replications: 100000 }));
    expect(r.cfg.replications).toBe(RUN_LIMITS.maxReplications);
    expect(r.clamped).toBe(true);
  });

  it("bounds the product by shrinking REPLICATIONS, never the horizon", () => {
    // 100_000 × 100 = 10M, over the 5M work cap. Horizon (the model's meaning)
    // is preserved; replications (only the confidence interval) is reduced.
    const r = clampRunConfig(cfg({ horizon: RUN_LIMITS.maxHorizon, replications: RUN_LIMITS.maxReplications }));
    expect(r.cfg.horizon).toBe(RUN_LIMITS.maxHorizon);
    expect(r.cfg.horizon * r.cfg.replications).toBeLessThanOrEqual(RUN_LIMITS.maxWork);
    expect(r.cfg.replications).toBeGreaterThanOrEqual(1);
    expect(r.clamped).toBe(true);
  });

  it("never drops replications below 1, even at the max horizon", () => {
    const r = clampRunConfig(cfg({ horizon: RUN_LIMITS.maxHorizon, replications: 1 }));
    expect(r.cfg.replications).toBe(1);
  });

  it("keeps warm-up below the horizon so it can't discard the whole run", () => {
    const r = clampRunConfig(cfg({ horizon: 500, warmUp: 9999 }));
    expect(r.cfg.warmUp).toBeLessThan(r.cfg.horizon);
    expect(r.clamped).toBe(true);
  });

  it("coerces NaN / negative / non-finite fields to safe values", () => {
    const r = clampRunConfig(cfg({ horizon: NaN, replications: -5, warmUp: -1 }));
    expect(r.cfg.horizon).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(r.cfg.horizon)).toBe(true);
    expect(r.cfg.replications).toBe(1);
    expect(r.cfg.warmUp).toBe(0);
  });

  it("preserves the other fields (seed, clockUnit, interventions)", () => {
    const interventions = [{ id: "x", t: 0, kind: "capacity" as const, target: "T", value: 3 }];
    const r = clampRunConfig({ ...cfg({ horizon: 1e9 }), seed: 42, interventions } as SimRunConfig & { interventions: unknown });
    expect(r.cfg.seed).toBe(42);
    expect(r.cfg.clockUnit).toBe("minute");
    expect((r.cfg as { interventions?: unknown }).interventions).toEqual(interventions);
  });
});
