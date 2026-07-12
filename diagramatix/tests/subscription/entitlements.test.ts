/**
 * Per-tier feature entitlements (T0733).
 *
 * `entitlementsForLevel` maps a SubscriptionLevel's four feature-access columns
 * to the { simulator, processMining, riskControl, apqc } shape used to gate the
 * UI + API. SuperAdmins get everything; a missing tier gets nothing.
 */
import { describe, it, expect } from "vitest";
import {
  entitlementsForLevel,
  FEATURE_KEYS,
  EXAMPLE_FEATURE_KEYS,
  type Entitlements,
} from "@/app/lib/subscription";

const level = (over: Partial<Record<"hasSimulator" | "hasProcessMining" | "hasRiskControl" | "hasApqc", boolean>> = {}) => ({
  hasSimulator: true,
  hasProcessMining: true,
  hasRiskControl: true,
  hasApqc: true,
  ...over,
});

describe("entitlementsForLevel (T0733)", () => {
  it("maps each feature column to its key", () => {
    const ent = entitlementsForLevel(level({ hasProcessMining: false, hasApqc: false }));
    expect(ent).toEqual<Entitlements>({
      simulator: true,
      processMining: false,
      riskControl: true,
      apqc: false,
    });
  });

  it("gives SuperAdmins every feature regardless of the tier's columns", () => {
    const allOff = level({ hasSimulator: false, hasProcessMining: false, hasRiskControl: false, hasApqc: false });
    const ent = entitlementsForLevel(allOff, /* isAdmin */ true);
    for (const k of FEATURE_KEYS) expect(ent[k], k).toBe(true);
  });

  it("grants nothing when there is no tier (null level, non-admin)", () => {
    const ent = entitlementsForLevel(null);
    for (const k of FEATURE_KEYS) expect(ent[k], k).toBe(false);
  });

  it("null level + admin still gets everything", () => {
    const ent = entitlementsForLevel(null, true);
    for (const k of FEATURE_KEYS) expect(ent[k], k).toBe(true);
  });

  it("example-bearing features are Simulator / Mining / Risk-Control (NOT APQC)", () => {
    expect(EXAMPLE_FEATURE_KEYS).toEqual(["simulator", "processMining", "riskControl"]);
    expect(EXAMPLE_FEATURE_KEYS).not.toContain("apqc");
  });
});
