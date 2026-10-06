/**
 * End a person's Stripe subscription NOW — used when their account is erased (self-service, or by a SuperAdmin on request), so that
 * deleting the user can never leave a card being charged for an account that no longer exists.
 *
 * "Already gone" is success: a subscription Stripe no longer has (404 / resource_missing) or has already cancelled needs nothing.
 * Any other failure is thrown, and the erasure is aborted with it — better a refused delete the SuperAdmin can retry than a deleted user
 * who is still billed.
 *
 * Only the SUBSCRIPTION is ended. The Stripe customer record and its invoices are kept: they are the financial record (Australian tax
 * records are held for years) and hold no Diagramatix content.
 */
export interface EndSubscriptionStripe {
  subscriptions: { cancel(id: string): Promise<unknown> };
}

export async function endSubscriptionNow(subscriptionId: string, client?: EndSubscriptionStripe): Promise<void> {
  const stripe = client ?? ((await import("@/app/lib/stripe")).stripe as unknown as EndSubscriptionStripe);
  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (err) {
    const e = err as { statusCode?: number; code?: string };
    if (e.statusCode === 404 || e.code === "resource_missing") return;
    throw err;
  }
}
