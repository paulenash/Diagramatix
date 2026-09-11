/**
 * Bring-your-own AI key: a key the USER supplies, preferred over the
 * deployment's own when one exists for the model's provider.
 *
 * **Three rules, and they are the whole design.**
 *
 * 1. **A key never leaves the server.** It is written encrypted, read only here,
 *    and never returned by any endpoint — not on read, not on edit. The browser
 *    gets four characters, which is enough to recognise a key and not enough to
 *    use one.
 * 2. **Which user, depends on what the endpoint is FOR — and they differ.**
 *      - *Managing* keys (/api/account/ai-keys) uses the **effective** user, so a
 *        SuperAdmin viewing somebody manages that person's keys, not their own,
 *        and cannot store one while read-only. That is the SEC-21 rule.
 *      - *Spending* on a key (the generate/plan routes) uses the **signed-in**
 *        user, because those routes already bill quota, usage and element gating
 *        to `session.user.id`. A SuperAdmin reproducing a problem under
 *        impersonation therefore spends their own quota AND their own key —
 *        consistent, and it never quietly spends a customer's money.
 *
 *    These were once described here as both being the effective user. They are
 *    not, and writing it down that way would have been the more dangerous half
 *    to "fix" blindly: it is the one that charges somebody.
 * 3. **The user's key wins, but never silently.** When one is set, the model
 *    picker says whose key is paying. A user who supplied a key and is quietly
 *    billed to the deployment has been misled; so has a user who did not and is
 *    being charged.
 *
 * Only providers Diagramatix can already call are accepted — "compatible" means
 * the app can route to it, not that a string looks like a key.
 */
import { prisma } from "@/app/lib/db";
import { decryptSecret, encryptSecret, tokenCryptoConfigured } from "@/app/lib/crypto/tokenCrypto";
import { providerForModel, type AiProvider } from "./models";

/**
 * Providers a user may supply their own key for.
 *
 * Only the four with a PUBLIC default endpoint, where a key on its own is
 * genuinely enough. The others are deliberately absent, and for the same
 * reason in each case — the endpoint belongs to the deployment, not the person:
 *
 *   - `google` and `microsoft` are reached through an Anthropic-compatible
 *     gateway somebody has to run (GOOGLE_BASE_URL / MICROSOFT_BASE_URL). A
 *     personal key without that gateway calls nothing, and with it the
 *     deployment is in the path anyway.
 *   - `ollama` is a LOCAL gateway; there is nothing per-person to bill.
 *
 * Offering those would mean accepting a key that cannot work and failing later
 * with something nobody can act on.
 */
export const BYO_PROVIDERS: AiProvider[] = [
  "anthropic", "openrouter", "moonshot", "deepseek",
];

/** Human names, for the settings screen and its error messages. */
export const BYO_PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openrouter: "OpenRouter",
  moonshot: "Moonshot (Kimi)",
  deepseek: "DeepSeek",
};

export function isByoProvider(p: string): p is AiProvider {
  return (BYO_PROVIDERS as string[]).includes(p);
}

/** The last four characters — what every provider's own console shows. */
export function keyHint(key: string): string {
  const k = key.trim();
  return k.length <= 4 ? k : k.slice(-4);
}

export interface StoredKeySummary {
  provider: string;
  providerLabel: string;
  keyHint: string;
  baseUrl: string | null;
  lastUsedAt: Date | null;
  updatedAt: Date;
}

/** What the browser may see: everything except the key. */
export async function listUserAiKeys(userId: string): Promise<StoredKeySummary[]> {
  const rows = await prisma.userAiKey.findMany({
    where: { userId },
    orderBy: { provider: "asc" },
    select: { provider: true, keyHint: true, baseUrl: true, lastUsedAt: true, updatedAt: true },
  });
  return rows.map((r) => ({
    ...r,
    providerLabel: BYO_PROVIDER_LABELS[r.provider] ?? r.provider,
  }));
}

/** Store (or replace) a user's key for one provider. */
export async function saveUserAiKey(opts: {
  userId: string;
  provider: string;
  key: string;
  baseUrl?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isByoProvider(opts.provider)) {
    return { ok: false, error: `Diagramatix cannot call "${opts.provider}". Choose one of: ${BYO_PROVIDERS.join(", ")}.` };
  }
  const key = opts.key.trim();
  if (!key) return { ok: false, error: "The key is empty." };
  if (!tokenCryptoConfigured()) {
    // Refuse rather than store it in the clear. A key sitting unencrypted in a
    // database is worse than a feature that is temporarily unavailable.
    return { ok: false, error: "Key storage is not configured on this deployment (MS_TOKEN_ENC_KEY is unset), so a key cannot be stored securely." };
  }

  const data = {
    keyCipher: encryptSecret(key),
    keyHint: keyHint(key),
    baseUrl: opts.baseUrl?.trim() || null,
  };
  await prisma.userAiKey.upsert({
    where: { userId_provider: { userId: opts.userId, provider: opts.provider } },
    create: { userId: opts.userId, provider: opts.provider, ...data },
    update: data,
  });
  return { ok: true };
}

export async function deleteUserAiKey(userId: string, provider: string): Promise<boolean> {
  const { count } = await prisma.userAiKey.deleteMany({ where: { userId, provider } });
  return count > 0;
}

export interface ResolvedUserKey {
  apiKey: string;
  baseUrl?: string;
  provider: string;
}

/**
 * The user's own key for this model's provider, if they have one.
 *
 * Returns null — never throws — when there is none, when the row cannot be
 * decrypted (a rotated encryption key), or when crypto is unconfigured. A
 * generation must fall back to the deployment's key rather than fail, and the
 * caller decides what to tell the person.
 */
export async function resolveUserAiKey(
  userId: string | null | undefined,
  model: string | null | undefined,
): Promise<ResolvedUserKey | null> {
  if (!userId || !tokenCryptoConfigured()) return null;
  const provider = providerForModel(model);
  if (!isByoProvider(provider)) return null;

  const row = await prisma.userAiKey.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { keyCipher: true, baseUrl: true },
  });
  if (!row) return null;

  try {
    const apiKey = decryptSecret(row.keyCipher);
    if (!apiKey) return null;
    return { apiKey, baseUrl: row.baseUrl ?? undefined, provider };
  } catch {
    // A key encrypted under a rotated MS_TOKEN_ENC_KEY. Not recoverable, and
    // not a reason to fail the generation — the person needs to re-enter it,
    // which the settings screen tells them when they next look.
    console.warn(`[userAiKey] could not decrypt the stored ${provider} key for a user — it needs re-entering`);
    return null;
  }
}

/** Record that a key was used, so one that stopped working is visible as such. */
export async function markUserAiKeyUsed(userId: string, provider: string): Promise<void> {
  // Best-effort: the generation has already happened by the time this runs.
  try {
    await prisma.userAiKey.updateMany({
      where: { userId, provider },
      data: { lastUsedAt: new Date() },
    });
  } catch { /* never break a generation over a timestamp */ }
}
