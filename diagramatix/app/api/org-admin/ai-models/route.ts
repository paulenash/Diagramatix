/**
 * OrgAdmin: choose the AI model their Org runs on, from the lists SuperAdmin gave the Org (Paul, 2026-10-05).
 *
 *   GET — for each purpose (Default / Vision / Voice Assist Command): the models the Org is OFFERED, the OrgAdmin's choice, and
 *         the model in force. Model names are shown to OrgAdmins and SuperAdmins only — this route is theirs alone.
 *   PUT — { purpose, id }  choose one (it must be in the Org's offered list); a blank id clears the choice, so the Org follows the
 *         global setting again.
 *
 * The Org is the caller's ACTIVE Org; OrgAdmin of it (or a SuperAdmin) only; read-only impersonation blocked; audited.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { guardOrgRoute } from "@/app/lib/routeGuard";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";
import { prisma } from "@/app/lib/db";
import { AUDIT, auditActor, recordAudit } from "@/app/lib/audit";
import { aiModelLabel } from "@/app/lib/ai/models";
import { getChosenModel, getOfferedModels, MODEL_PURPOSES, modelInForce, setChosenModel, type ModelPurpose } from "@/app/lib/ai/orgModels";

async function activeOrgId(): Promise<string | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function GET() {
  const orgId = await activeOrgId();
  if (typeof orgId !== "string") return orgId;
  const g = await guardOrgRoute(orgId, { mutate: false });
  if (g.error) return g.error;

  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });
  const purposes: Record<string, unknown> = {};
  for (const p of MODEL_PURPOSES) {
    const [{ ids }, chosen, inForce] = await Promise.all([getOfferedModels(orgId, p), getChosenModel(orgId, p), modelInForce(orgId, p)]);
    purposes[p] = {
      offered: ids.map((id) => ({ id, label: aiModelLabel(id) })),
      chosen: chosen && ids.includes(chosen) ? chosen : null,
      inForce: { id: inForce, label: aiModelLabel(inForce) },
    };
  }
  return NextResponse.json({ org: { id: orgId, name: org?.name ?? "" }, purposes });
}

export async function PUT(req: Request) {
  const orgId = await activeOrgId();
  if (typeof orgId !== "string") return orgId;
  const g = await guardOrgRoute(orgId, { mutate: true });
  if (g.error) return g.error;

  const body = (await req.json().catch(() => ({}))) as { purpose?: string; id?: unknown };
  const purpose = MODEL_PURPOSES.find((p) => p === body.purpose) as ModelPurpose | undefined;
  if (!purpose || (body.id !== undefined && typeof body.id !== "string")) return NextResponse.json({ error: "purpose and id are required" }, { status: 400 });

  let saved: string | null;
  try {
    saved = await setChosenModel(orgId, purpose, (body.id as string | undefined) ?? "");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
  await recordAudit({
    ...auditActor(g.ctx.session, req),
    action: AUDIT.AiOrgModelChosen,
    targetType: "org",
    targetId: orgId,
    orgId,
    meta: { purpose, model: saved },
  });
  return NextResponse.json({ ok: true, chosen: saved, inForce: await modelInForce(orgId, purpose) });
}
