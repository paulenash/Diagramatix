/**
 * AI model cost-rate catalog API.
 *
 *   GET  /api/admin/ai-rates
 *     Returns the effective rate for every model — the static defaults
 *     (app/lib/ai/pricing.ts) overlaid with SuperAdmin overrides in the
 *     AiModelRate table. Any signed-in user (the AI Usage report shows cost
 *     to OrgAdmins too; the numbers are non-sensitive list pricing).
 *
 *   PUT  /api/admin/ai-rates
 *     Body: { rates: { provider, model, inputPer1M, outputPer1M }[] }
 *     Upserts each row by [provider, model]. SuperAdmin only. Returns the new
 *     effective list.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { effectiveRates } from "@/app/lib/ai/aiRates";

interface RateInput {
  provider?: string;
  model?: string;
  inputPer1M?: number;
  outputPer1M?: number;
  currency?: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ rates: await effectiveRates() });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { rates?: RateInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const incoming = Array.isArray(body.rates) ? body.rates : null;
  if (!incoming) {
    return NextResponse.json({ error: "Missing rates array" }, { status: 400 });
  }

  // Validate every row before touching the DB.
  const isMoney = (n: unknown): n is number => typeof n === "number" && isFinite(n) && n >= 0 && n < 1_000_000;
  for (const r of incoming) {
    if (typeof r.provider !== "string" || !r.provider.trim()) {
      return NextResponse.json({ error: "Each rate needs a provider" }, { status: 400 });
    }
    if (typeof r.model !== "string" || !r.model.trim()) {
      return NextResponse.json({ error: "Each rate needs a model" }, { status: 400 });
    }
    if (!isMoney(r.inputPer1M) || !isMoney(r.outputPer1M)) {
      return NextResponse.json({ error: `Rates for ${r.model} must be USD ≥ 0 per 1M tokens` }, { status: 400 });
    }
  }

  await prisma.$transaction(
    incoming.map((r) =>
      prisma.aiModelRate.upsert({
        where: { provider_model: { provider: r.provider!.trim(), model: r.model!.trim() } },
        create: {
          provider: r.provider!.trim(),
          model: r.model!.trim(),
          inputPer1M: r.inputPer1M!,
          outputPer1M: r.outputPer1M!,
          currency: (r.currency ?? "USD").trim() || "USD",
        },
        update: {
          inputPer1M: r.inputPer1M!,
          outputPer1M: r.outputPer1M!,
          currency: (r.currency ?? "USD").trim() || "USD",
        },
      }),
    ),
  );

  return NextResponse.json({ rates: await effectiveRates() });
}
