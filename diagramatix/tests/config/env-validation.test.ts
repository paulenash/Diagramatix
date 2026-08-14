/**
 * CFG-02 / CFG-04 — boot-time environment validation. A weak or placeholder
 * AUTH_SECRET silently lets anyone forge a session, and a missing DATABASE_URL
 * should fail fast with a clear message rather than a confusing runtime crash.
 */
import { describe, it, expect } from "vitest";
import { checkEnv, assertEnv } from "@/app/lib/env";

const GOOD_SECRET = "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo="; // 44-char base64

const base = (over: Record<string, string | undefined> = {}) => ({
  AUTH_SECRET: GOOD_SECRET,
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  AUTH_TRUST_HOST: "true",
  NODE_ENV: "production",
  ...over,
});

const errorsFor = (env: Record<string, string | undefined>) =>
  checkEnv(env).filter((p) => p.level === "error").map((p) => p.key);

describe("checkEnv — AUTH_SECRET (CFG-02)", () => {
  it("accepts a strong, non-placeholder secret", () => {
    expect(errorsFor(base())).toEqual([]);
  });

  it("rejects a missing secret", () => {
    expect(errorsFor(base({ AUTH_SECRET: undefined }))).toContain("AUTH_SECRET");
  });

  it("rejects the .env.example placeholder", () => {
    expect(errorsFor(base({ AUTH_SECRET: "replace-with-openssl-rand-base64-32-output" }))).toContain("AUTH_SECRET");
  });

  it("rejects a too-short secret", () => {
    expect(errorsFor(base({ AUTH_SECRET: "short" }))).toContain("AUTH_SECRET");
  });
});

describe("checkEnv — other required config (CFG-04)", () => {
  it("rejects a missing DATABASE_URL", () => {
    expect(errorsFor(base({ DATABASE_URL: undefined }))).toContain("DATABASE_URL");
  });

  it("warns (does not error) when AUTH_TRUST_HOST is absent", () => {
    const problems = checkEnv(base({ AUTH_TRUST_HOST: undefined }));
    expect(problems.find((p) => p.key === "AUTH_TRUST_HOST")?.level).toBe("warn");
    expect(errorsFor(base({ AUTH_TRUST_HOST: undefined }))).not.toContain("AUTH_TRUST_HOST");
  });

  it("rejects a half-configured Entra pair", () => {
    expect(errorsFor(base({ AZURE_CLIENT_ID: "id-only" }))).toContain("AZURE_CLIENT_*");
    expect(errorsFor(base({ AZURE_CLIENT_SECRET: "secret-only" }))).toContain("AZURE_CLIENT_*");
  });

  it("accepts a fully-configured Entra pair", () => {
    expect(errorsFor(base({ AZURE_CLIENT_ID: "id", AZURE_CLIENT_SECRET: "shhh" }))).toEqual([]);
  });
});

describe("assertEnv — fail-fast behaviour", () => {
  it("throws in production on a hard error", () => {
    expect(() => assertEnv(base({ AUTH_SECRET: undefined }))).toThrow(/refusing to start/);
  });

  it("does NOT throw in production when config is valid", () => {
    expect(() => assertEnv(base())).not.toThrow();
  });

  it("tolerates a bad secret OUTSIDE production (dev convenience), by default", () => {
    expect(() => assertEnv(base({ NODE_ENV: "development", AUTH_SECRET: "short" }))).not.toThrow();
  });

  it("can be forced to enforce even in dev", () => {
    expect(() => assertEnv(base({ NODE_ENV: "development", AUTH_SECRET: "short" }), { skipInDev: false })).toThrow();
  });
});
