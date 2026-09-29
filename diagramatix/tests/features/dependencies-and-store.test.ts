/**
 * Feature Availability, slice 1 (plan 2026-09-30): feature dependencies (Mobile
 * Access needs Process Review and Voice Assist) and the browser's shared copy
 * of the states (a failed fetch is never kept; it refreshes).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyDependencies, blockedBy, dependencyProblems } from "@/app/lib/features/dependencies";
import { FEATURE_DEF, FEATURES } from "@/app/lib/features/registry";
import * as store from "@/app/lib/features/featureStateStore";

type S = "available" | "disabled" | "hidden";
const defs = {
  mobile: { requires: ["review", "voice"] },
  review: {},
  voice: {},
  deep: { requires: ["mobile"] },
};

describe("T5101 — a feature that requires others is only as available as the weakest of them", () => {
  const map = (o: Record<string, S>) => o;

  it("all prerequisites available: the feature keeps its own state", () => {
    expect(applyDependencies(map({ mobile: "available", review: "available", voice: "available", deep: "available" }), defs).mobile).toBe("available");
  });

  it("one prerequisite Not Available: the feature is Not Available in effect, whatever its own cell says", () => {
    const out = applyDependencies(map({ mobile: "available", review: "available", voice: "hidden", deep: "available" }), defs);
    expect(out.mobile).toBe("hidden");
    expect(out.deep, "and what needs Mobile follows it down").toBe("hidden");
    expect(out.review).toBe("available");
  });

  it("disabled is between: available needing a disabled prerequisite is disabled; hidden stays hidden", () => {
    expect(applyDependencies(map({ mobile: "available", review: "disabled", voice: "available", deep: "available" }), defs).mobile).toBe("disabled");
    expect(applyDependencies(map({ mobile: "disabled", review: "available", voice: "available", deep: "available" }), defs).mobile).toBe("disabled");
    expect(applyDependencies(map({ mobile: "hidden", review: "available", voice: "available", deep: "available" }), defs).mobile).toBe("hidden");
  });

  it("a prerequisite that is not in the map counts as hidden (a typo blocks, never opens)", () => {
    expect(applyDependencies(map({ mobile: "available", review: "available" }), defs).mobile).toBe("hidden");
  });

  it("features with no requirements, and keys not in the map, are untouched", () => {
    const out = applyDependencies(map({ review: "disabled" }), defs);
    expect(out).toEqual({ review: "disabled" });
  });

  it("names the prerequisite holding a feature back", () => {
    expect(blockedBy(map({ mobile: "available", review: "available", voice: "hidden", deep: "available" }), "mobile", defs)).toBe("voice");
    expect(blockedBy(map({ mobile: "available", review: "available", voice: "hidden", deep: "available" }), "deep", defs), "the root cause, not the middle link").toBe("voice");
    expect(blockedBy(map({ mobile: "available", review: "available", voice: "available", deep: "available" }), "mobile", defs)).toBeNull();
  });

  it("a cycle terminates (and is reported by the registry check)", () => {
    const cyc = { a: { requires: ["b"] }, b: { requires: ["a"] } };
    expect(() => applyDependencies(map({ a: "available", b: "available" }), cyc)).not.toThrow();
    expect(dependencyProblems(cyc).join(" ")).toContain("cycle");
    expect(dependencyProblems({ a: { requires: ["nope"] } })).toEqual([`a requires unknown feature "nope"`]);
  });

  it("the real registry: every requirement names a real feature, none is circular, and Mobile needs Process Review and Voice Assist", () => {
    expect(dependencyProblems(FEATURE_DEF)).toEqual([]);
    expect([...(FEATURE_DEF["mobile"].requires ?? [])].sort()).toEqual(["process-review", "voice-assist"]);
    expect(FEATURES.length).toBe(35);
  });

  it("the resolver applies it after the overrides (source pin)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/lib/features/availability.ts", "utf8").replace(/\r\n/g, "\n");
    expect(src).toContain("return applyDependencies(map);");
    expect(src.indexOf("map[k] = coerceState(v);")).toBeLessThan(src.indexOf("applyDependencies(map)"));
  });
});

describe("T5102 — the browser's copy of the feature states", () => {
  let calls = 0;
  let next: (() => { ok: boolean; states?: Record<string, S>; throws?: boolean }) = () => ({ ok: true, states: {} });

  beforeEach(() => {
    store.reset();
    calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      const r = next();
      if (r.throws) throw new Error("offline");
      return { ok: r.ok, json: async () => ({ states: r.states }) };
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); store.reset(); });

  it("many callers share one fetch, and the answer is kept", async () => {
    next = () => ({ ok: true, states: { mobile: "available" } });
    const [a, b] = await Promise.all([store.load(), store.load()]);
    expect(calls).toBe(1);
    expect(a).toEqual({ mobile: "available" });
    expect(b).toBe(a);
    await store.load();
    expect(calls, "kept: no second fetch").toBe(1);
  });

  it("a FAILED fetch is not kept as 'everything hidden' — the next ask tries again", async () => {
    next = () => ({ ok: false });
    expect(await store.load()).toBeNull();
    expect(store.current()).toBeNull();
    next = () => ({ ok: true, states: { mobile: "available" } });
    expect(await store.load()).toEqual({ mobile: "available" });
    expect(calls).toBe(2);
    next = () => ({ ok: true, throws: true });
    store.reset();
    expect(await store.load()).toBeNull();
    expect(store.current()).toBeNull();
  });

  it("a failed refresh leaves the last good copy in place", async () => {
    next = () => ({ ok: true, states: { sharing: "available" } });
    await store.load();
    next = () => ({ ok: false });
    expect(await store.refresh()).toBeNull();
    expect(store.current()).toEqual({ sharing: "available" });
  });

  it("refresh() tells subscribers; a stale copy refreshes when the tab wakes, a fresh one does not", async () => {
    next = () => ({ ok: true, states: { sharing: "available" } });
    const seen: unknown[] = [];
    store.subscribe((m) => seen.push(m));
    await store.load();
    store.refreshIfStale(Date.now() + 10_000);
    expect(calls, "under a minute old: leave it").toBe(1);
    next = () => ({ ok: true, states: { sharing: "hidden" } });
    store.refreshIfStale(Date.now() + 120_000);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
    expect(store.current()).toEqual({ sharing: "hidden" });
    expect(seen).toHaveLength(2);
  });

  it("the hook retries a failed first load and refreshes on focus (source pin)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/components/FeatureGate.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(src).toContain("retries++ < MAX_RETRIES");
    expect(src).toContain('window.addEventListener("focus", onWake)');
    expect(src).toContain("export function refreshFeatureStates()");
    expect(src, "no module-level cache of its own any more").not.toContain("cache = {}");
  });
});
