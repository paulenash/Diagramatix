/**
 * GET    /api/account/ai-keys  — which providers you have a key for.
 * POST   /api/account/ai-keys  — store or replace one.
 * DELETE /api/account/ai-keys?provider=…  — remove one.
 *
 * **A key is never returned.** Not here, not anywhere. The listing carries the
 * last four characters, which is enough to tell two keys apart and not enough to
 * use one. That is the whole reason these are three narrow endpoints rather than
 * a field on the account object: an object that round-trips is an object that
 * eventually round-trips a secret.
 *
 * Scoped to the EFFECTIVE user, so a SuperAdmin viewing somebody else manages
 * that person's keys rather than their own — and cannot store one while
 * read-only.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getEffectiveUserId, isReadOnlyImpersonation } from "@/app/lib/superuser";
import {
  BYO_PROVIDERS, BYO_PROVIDER_LABELS,
  deleteUserAiKey, listUserAiKeys, saveUserAiKey,
} from "@/app/lib/ai/userAiKey";
import { tokenCryptoConfigured } from "@/app/lib/crypto/tokenCrypto";

async function callerId() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const cookieStore = await cookies();
  return {
    userId: getEffectiveUserId(session, cookieStore) ?? session.user.id,
    readOnly: isReadOnlyImpersonation(session, cookieStore),
  };
}

export async function GET() {
  const who = await callerId();
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    keys: await listUserAiKeys(who.userId),
    providers: BYO_PROVIDERS.map((p) => ({ id: p, label: BYO_PROVIDER_LABELS[p] ?? p })),
    // The screen needs to explain WHY it cannot accept a key, rather than
    // failing on save with something a person cannot act on.
    storageConfigured: tokenCryptoConfigured(),
  });
}

export async function POST(req: Request) {
  const who = await callerId();
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (who.readOnly) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });

  const body = await req.json().catch(() => null) as
    | { provider?: unknown; key?: unknown; baseUrl?: unknown } | null;
  if (typeof body?.provider !== "string" || typeof body?.key !== "string") {
    return NextResponse.json({ error: "provider and key are required" }, { status: 400 });
  }

  const result = await saveUserAiKey({
    userId: who.userId,
    provider: body.provider,
    key: body.key,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // The refreshed listing, not the key.
  return NextResponse.json({ keys: await listUserAiKeys(who.userId) }, { status: 201 });
}

export async function DELETE(req: Request) {
  const who = await callerId();
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (who.readOnly) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });

  const provider = new URL(req.url).searchParams.get("provider");
  if (!provider) return NextResponse.json({ error: "provider is required" }, { status: 400 });

  const removed = await deleteUserAiKey(who.userId, provider);
  return NextResponse.json({ removed, keys: await listUserAiKeys(who.userId) });
}
