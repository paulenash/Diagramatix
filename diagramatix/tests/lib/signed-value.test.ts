/**
 * SEC-17 — HMAC-signed cookie values. Proves the impersonation identity/mode
 * cookies become tamper-evident: a modified value (or an unsigned legacy one)
 * fails verification and is treated as absent.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { signValue, verifySignedValue } from "@/app/lib/crypto/signedValue";

const REAL_SECRET = "test-secret-at-least-thirty-two-chars-000";
let saved: string | undefined;

beforeAll(() => {
  saved = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = REAL_SECRET;
});
afterAll(() => {
  process.env.AUTH_SECRET = saved;
});

describe("signed cookie values (SEC-17)", () => {
  it("round-trips a value", () => {
    const s = signValue("user_abc123");
    expect(s).toContain(".");
    expect(verifySignedValue(s)).toBe("user_abc123");
  });

  it("rejects a tampered value (swap the impersonation target)", () => {
    const s = signValue("user_abc123");
    const tampered = s.replace("user_abc123", "user_victim9");
    expect(verifySignedValue(tampered)).toBeNull();
  });

  it("rejects an unsigned legacy cookie (raw userId, no tag)", () => {
    expect(verifySignedValue("user_abc123")).toBeNull();
  });

  it("rejects empty / malformed input", () => {
    expect(verifySignedValue(undefined)).toBeNull();
    expect(verifySignedValue(null)).toBeNull();
    expect(verifySignedValue("")).toBeNull();
    expect(verifySignedValue("nodothere")).toBeNull();
    expect(verifySignedValue("value.")).toBeNull();
  });

  it("a value signed under a different key does not verify", () => {
    const s = signValue("edit");
    process.env.AUTH_SECRET = "a-completely-different-secret-value-1234";
    try {
      expect(verifySignedValue(s)).toBeNull();
    } finally {
      process.env.AUTH_SECRET = REAL_SECRET;
    }
  });
});
