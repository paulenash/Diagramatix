/**
 * SuperAdmin: which AI models each Org is OFFERED, per purpose (Default / Vision / Voice Assist Command) — Paul, 2026-10-05.
 * The OrgAdmin then chooses from these lists (slice 3); ordinary users never choose. Stored as AppSetting rows (orgModels.ts).
 *
 *   GET  — every Org with its offered lists (and whether each is customised) and the model its OrgAdmin has chosen.
 *   PUT  — { orgId, purpose, ids }            set one Org's list for one purpose;
 *          { orgId, purpose, reset: true }    back to the default (every Anthropic model).
 *
 * SuperAdmin only; read-only impersonation blocked; every change audited.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { AUDIT, auditActor, recordAudit } from "@/app/lib/audit";
import { defaultOfferedModels, MODEL_PURPOSES, resetOfferedModels, setOfferedModels, type ModelPurpose } from "@/app/lib/ai/orgModels";
import { isKnownAiModel } from "@/app/lib/ai/models";

const KEY = /^ai\.org\.([^.]+)\.(offered|chosen)\.(default|vision|command)$/;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [orgs, rows] = await Promise.all([
    prisma.org.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.appSetting.findMany({ where: { key: { startsWith: "ai.org." } } }),
  ]);
  const offered = new Map<string, string[]>(), chosen = new Map<string, string>();
  for (const r of rows) {
    const m = r.key.match(KEY);
    if (!m) continue;
    if (m[2] === "chosen") { chosen.set(`${m[1]}|${m[3]}`, r.value.trim()); continue; }
    try { const v = JSON.parse(r.value); if (Array.isArray(v)) offered.set(`${m[1]}|${m[3]}`, v.filter((x): x is string => typeof x === "string" && isKnownAiModel(x))); } catch { /* corrupt row = not customised */ }
  }
  return NextResponse.json({
    orgs: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      purposes: Object.fromEntries(MODEL_PURPOSES.map((p) => {
        const k = `${o.id}|${p}`;
        const customised = offered.has(k);
        return [p, { customised, offered: customised ? offered.get(k)! : defaultOfferedModels(p), chosen: chosen.get(k) ?? null }];
      })),
    })),
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await blockReadOnlyImpersonation(session);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { orgId?: string; purpose?: string; ids?: unknown; reset?: boolean };
  const purpose = MODEL_PURPOSES.find((p) => p === body.purpose) as ModelPurpose | undefined;
  if (!body.orgId || !purpose) return NextResponse.json({ error: "orgId and purpose are required" }, { status: 400 });
  const org = await prisma.org.findUnique({ where: { id: body.orgId }, select: { id: true, name: true } });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  try {
    if (body.reset) {
      await resetOfferedModels(org.id, purpose);
    } else {
      if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== "string")) return NextResponse.json({ error: "ids must be a list of model ids" }, { status: 400 });
      await setOfferedModels(org.id, purpose, body.ids as string[]);
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
  await recordAudit({
    ...auditActor(session, req),
    action: AUDIT.AiOrgModelsUpdate,
    targetType: "org",
    targetId: org.id,
    orgId: org.id,
    meta: { purpose, reset: !!body.reset, count: body.reset ? null : (body.ids as string[]).length },
  });
  return NextResponse.json({ ok: true });
}
