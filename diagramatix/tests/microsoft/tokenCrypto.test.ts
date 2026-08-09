/**
 * AES-256-GCM token encryption (app/lib/crypto/tokenCrypto.ts) — used to store
 * per-user SharePoint/Graph tokens at rest. Guards round-trip fidelity and that
 * tampering is detected (auth tag) rather than silently decrypting to garbage.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, tokenCryptoConfigured } from "@/app/lib/crypto/tokenCrypto";

beforeAll(() => {
  // 32-byte key (base64). Read lazily on first encrypt, so setting it here is fine.
  process.env.MS_TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("tokenCrypto", () => {
  it("T2252 — round-trips a token unchanged, with a fresh IV each time", () => {
    expect(tokenCryptoConfigured()).toBe(true);
    const secret = "ya29.super-secret-refresh-token.with.dots-and_underscores";
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);                 // random IV → different ciphertext
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptSecret(a)).toBe(secret);
    expect(decryptSecret(b)).toBe(secret);
  });

  it("T2253 — a tampered ciphertext fails to decrypt (GCM auth tag)", () => {
    const blob = encryptSecret("do-not-tamper");
    const parts = blob.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA"); // corrupt the ct
    expect(() => decryptSecret(parts.join("."))).toThrow();
    expect(() => decryptSecret("garbage")).toThrow();
  });
});
