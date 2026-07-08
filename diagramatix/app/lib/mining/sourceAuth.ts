/**
 * Webhook ingest key handling for live mining sources. Mint a high-entropy key,
 * store only its SHA-256 hash (never the raw key), and verify presented keys in
 * constant time. Safer than the plaintext resetToken precedent; the raw key is
 * shown to the user exactly once at creation.
 */
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export interface MintedKey { key: string; hash: string; prefix: string }

/** Mint a new ingest key (`dgxk_<64 hex>`) and its stored hash + display prefix. */
export function mintIngestKey(): MintedKey {
  const key = "dgxk_" + randomBytes(32).toString("hex");
  return { key, hash: sha256(key), prefix: key.slice(0, 12) };
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Constant-time check of a presented key against a stored hash. */
export function verifyIngestKey(presented: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!presented || !storedHash) return false;
  const a = Buffer.from(sha256(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Read the ingest key from an X-Api-Key header or an Authorization: Bearer header. */
export function readIngestKey(headers: Headers): string | null {
  const x = headers.get("x-api-key");
  if (x) return x.trim();
  const auth = headers.get("authorization");
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  return null;
}
