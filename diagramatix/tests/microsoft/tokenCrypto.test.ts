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

    // Tamper the DECODED BYTES, not the base64url text. The final base64url
    // character of a short ciphertext carries only 4 significant bits, so
    // rewriting the last two characters can change the text while decoding to
    // exactly the same bytes — leaving nothing tampered, GCM correctly not
    // throwing, and this guard failing at random roughly once in a thousand runs.
    const flip = (part: number) => {
      const parts = blob.split(".");
      const bytes = Buffer.from(parts[part], "base64url");
      bytes[0] ^= 0xff;
      parts[part] = bytes.toString("base64url");
      expect(parts[part]).not.toBe(blob.split(".")[part]);   // it really did change
      return parts.join(".");
    };

    // Tampered EAGERLY, outside the toThrow callbacks. Called inside one, a
    // failure of the "it really did change" assertion above is itself a throw,
    // so toThrow() would pass on it and the guard would guard nothing.
    const badIv = flip(1), badTag = flip(2), badCt = flip(3);
    expect(() => decryptSecret(badIv)).toThrow();
    expect(() => decryptSecret(badTag)).toThrow();
    expect(() => decryptSecret(badCt)).toThrow();
    expect(() => decryptSecret("garbage")).toThrow();
  });
});
