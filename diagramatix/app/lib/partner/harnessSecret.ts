/**
 * The harness's own key secret, held in memory for the life of the process.
 *
 * We store only a key's SHA-256, so a raw key cannot be read back — which is
 * right, and which leaves the harness needing a secret it cannot recover. The
 * first version rotated the key on use, and that produced a genuine footgun: the
 * key shown at mint stopped working the moment the harness ran, silently, having
 * been presented as "copy this now".
 *
 * So the secret is remembered HERE at mint time instead. The harness then works
 * with the very key you were shown, and rotation happens only after a restart —
 * when nobody could have been relying on it anyway.
 *
 * A module-level map is shared across route handlers because they run in one
 * Node process. It is deliberately NOT persisted: a secret that survives a
 * restart on disk is a secret we have chosen to store, and the whole point is
 * that we do not.
 */
const secrets = new Map<string, string>();

export function rememberHarnessSecret(apiKeyId: string, rawKey: string): void {
  secrets.set(apiKeyId, rawKey);
}

export function recallHarnessSecret(apiKeyId: string): string | undefined {
  return secrets.get(apiKeyId);
}

export function forgetHarnessSecret(apiKeyId: string): void {
  secrets.delete(apiKeyId);
}
