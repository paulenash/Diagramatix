/**
 * CFG-05 / CFG-06 — auth must not be a per-page opt-in. Every protected URL
 * prefix has to be covered by BOTH the `authorized` callback (via
 * PROTECTED_PREFIXES) and the proxy middleware matcher, or a page that forgets
 * its own auth() check is silently public — which is exactly how /matrix leaked.
 *
 * Next requires the matcher to be a static literal, so it's duplicated in
 * proxy.ts; this test is the tripwire that keeps the two in sync.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROTECTED_PREFIXES, isProtectedPath } from "@/auth.config";

// Read proxy.ts as TEXT rather than importing it: importing pulls in NextAuth,
// which doesn't resolve under the test runtime. Extracting the matcher literal
// with a regex also keeps this a pure source-consistency check.
const proxySrc = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
const matcherPrefixes = [...proxySrc.matchAll(/"(\/[a-z-]+)\/:path\*"/g)].map((m) => m[1]);

describe("route protection — matcher ⇄ PROTECTED_PREFIXES parity", () => {
  it("every protected prefix has a middleware matcher entry", () => {
    for (const p of PROTECTED_PREFIXES) {
      expect(matcherPrefixes, `${p} is protected in the callback but the middleware doesn't run on it`).toContain(p);
    }
  });

  it("every middleware matcher entry is a declared protected prefix", () => {
    for (const m of matcherPrefixes) {
      expect(PROTECTED_PREFIXES as readonly string[], `${m} runs middleware but isn't in PROTECTED_PREFIXES`).toContain(m);
    }
  });

  it("covers the routes CFG-05/06 flagged as leaking", () => {
    for (const p of ["/matrix", "/notifications", "/help", "/processes", "/tech-notes"]) {
      expect(PROTECTED_PREFIXES as readonly string[]).toContain(p);
    }
  });
});

describe("isProtectedPath", () => {
  it("matches the bare prefix and any sub-path", () => {
    expect(isProtectedPath("/matrix")).toBe(true);
    expect(isProtectedPath("/dashboard/projects/abc")).toBe(true);
    expect(isProtectedPath("/m/diagram/xyz")).toBe(true);
  });

  it("does not match public routes or lookalike prefixes", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/helpful")).toBe(false); // not /help or /help/*
    expect(isProtectedPath("/matrixed")).toBe(false);
  });
});
