/**
 * Symmetric encryption for third-party tokens stored at rest (currently the
 * per-user Microsoft/Graph refresh+access tokens on `MicrosoftConnection`).
 *
 * AES-256-GCM: authenticated encryption, so a tampered ciphertext fails to
 * decrypt rather than silently returning garbage. Output is a compact
 * `v1.<iv>.<tag>.<ct>` string (base64url parts) — self-describing and safe in a
 * plain String column.
 *
 * The key comes from its OWN env var `MS_TOKEN_ENC_KEY` (32 bytes, base64) — NOT
 * `AUTH_SECRET` — so rotating the session secret never bricks every stored token.
 * Generate one with:  openssl rand -base64 32
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96-bit nonce, the GCM standard
const PREFIX = "v1";

let cachedKey: Buffer | null = null;

/** Load + validate the 32-byte key once. Throws (fail-fast) if missing/wrong size. */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.MS_TOKEN_ENC_KEY;
  if (!raw) throw new Error("MS_TOKEN_ENC_KEY is not set — cannot encrypt/decrypt stored tokens.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`MS_TOKEN_ENC_KEY must decode to 32 bytes (got ${key.length}). Generate with: openssl rand -base64 32`);
  }
  cachedKey = key;
  return key;
}

/** True when a usable key is configured — lets callers degrade gracefully instead of throwing. */
export function tokenCryptoConfigured(): boolean {
  try { getKey(); return true; } catch { return false; }
}

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");

/** Encrypt a UTF-8 string → `v1.<iv>.<tag>.<ct>` (base64url parts). */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, b64u(iv), b64u(tag), b64u(ct)].join(".");
}

/** Reverse `encryptSecret`. Throws if the blob is malformed or has been tampered with. */
export function decryptSecret(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error("Malformed encrypted token.");
  const [, ivB, tagB, ctB] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), unb64u(ivB));
  decipher.setAuthTag(unb64u(tagB));
  return Buffer.concat([decipher.update(unb64u(ctB)), decipher.final()]).toString("utf8");
}
