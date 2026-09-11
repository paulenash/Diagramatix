/**
 * The request-scoped "whose key is paying" context.
 *
 * A user's own API key has to reach `makeAiClient`, which is called from ~16
 * places — planners, refiners, SOP, diff, mining, the command bar. Threading it
 * through every signature would work right up until the first route that forgot,
 * and that failure has NO SYMPTOM: the generation succeeds, on the deployment's
 * key, billed to the wrong party. So it travels the same way the telemetry
 * context does (`enterAiContext`) — one line in the route, invisible downstream.
 *
 * **The key carries its provider, and is only ever used for that provider.**
 * That is the whole safety property. `fallbackApiKey` was tempting to reuse for
 * this and is wrong for exactly this reason: it is the ANTHROPIC key a route
 * already resolved, and honouring it on the Moonshot branch would post an
 * Anthropic key to Moonshot. T0954 says so, and it is right.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface UserAiKeyContext {
  /** The provider this key is for — checked before the key is ever used. */
  provider: string;
  apiKey: string;
  /** Only when the user supplied one; otherwise the provider's default endpoint. */
  baseUrl?: string;
  /** For `markUserAiKeyUsed` and for telling the user whose key paid. */
  userId?: string;
}

const keyStore = new AsyncLocalStorage<UserAiKeyContext>();

/**
 * Set the user's key for the rest of this request. Mirrors `enterAiContext`:
 * `enterWith`, so a route needs one line after it has resolved the key.
 *
 * A null/undefined argument is a no-op, so the call site can be unconditional:
 * `enterUserAiKey(await resolveUserAiKey(userId, model))`.
 */
export function enterUserAiKey(ctx: UserAiKeyContext | null | undefined): void {
  if (ctx?.apiKey && ctx.provider) keyStore.enterWith(ctx);
}

/** Run `fn` with a key in scope — the wrapper form, for non-route callers. */
export function withUserAiKey<T>(ctx: UserAiKeyContext, fn: () => T): T {
  return keyStore.run(ctx, fn);
}

/**
 * The user's key for THIS provider, or undefined.
 *
 * Returns nothing when the stored key belongs to a different provider — the
 * guard that makes the whole mechanism safe to consult unconditionally.
 */
export function currentUserAiKey(provider: string): UserAiKeyContext | undefined {
  const ctx = keyStore.getStore();
  return ctx && ctx.provider === provider ? ctx : undefined;
}
