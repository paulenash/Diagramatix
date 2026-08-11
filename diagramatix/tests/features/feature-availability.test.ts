/**
 * Feature-availability engine: the registry (keys/labels) and the seed matrix
 * derived from "Feature by Subscription Level v1.4.xlsx" (1 → hidden, 80 →
 * available). Guards that the registry and the seed stay in lockstep and that the
 * xlsx mapping landed correctly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { FEATURES, FEATURE_KEYS } from "@/app/lib/features/registry";

const seed = JSON.parse(readFileSync(join(process.cwd(), "menus_and_features", "feature-availability.seed.json"), "utf8")) as {
  levels: string[];
  rows: { key: string; states: Record<string, string> }[];
};

describe("feature availability registry + seed", () => {
  it("T2264 — registry keys are unique and every feature has a label + category", () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
    for (const f of FEATURES) { expect(f.key).toBeTruthy(); expect(f.label).toBeTruthy(); expect(f.category).toBeTruthy(); }
    expect(FEATURES.length).toBe(34);
  });

  it("T2265 — the seed covers every registry key × 5 levels (incl. enterprise) with valid states", () => {
    expect(seed.levels).toEqual(["free", "introductory", "professional", "expert", "enterprise"]);
    const seeded = new Set(seed.rows.map((r) => r.key));
    for (const k of FEATURE_KEYS) expect(seeded.has(k), `seed missing ${k}`).toBe(true);
    for (const r of seed.rows) {
      for (const lvl of seed.levels) {
        expect(["available", "hidden"]).toContain(r.states[lvl]); // no "disabled" seeded yet, per spec
      }
    }
  });

  it("T2266 — the xlsx 1/80 mapping landed (sharepoint Expert+, soc2 Enterprise-only, typed-prompt all)", () => {
    const row = (k: string) => seed.rows.find((r) => r.key === k)!;
    expect(row("ai-generate-typed").states).toMatchObject({ free: "available", enterprise: "available" });
    const sp = row("sharepoint").states;
    expect(sp.free).toBe("hidden"); expect(sp.professional).toBe("hidden");
    expect(sp.expert).toBe("available"); expect(sp.enterprise).toBe("available");
    const soc2 = row("soc2").states;
    expect(soc2.expert).toBe("hidden"); expect(soc2.enterprise).toBe("available");
  });
});
