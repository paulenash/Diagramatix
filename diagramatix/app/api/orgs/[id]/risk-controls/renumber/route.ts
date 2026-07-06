import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { renumberOrgCodes } from "@/app/lib/riskControls/renumberOrg";
import { RISK_CONTROL_KINDS, type RiskControlKind } from "@/app/lib/riskControls/types";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/orgs/[id]/risk-controls/renumber   { kinds?: RiskControlKind[] }
 * Re-flow the org's Risk & Control codes into one clean org-wide sequence per
 * kind (R-001, C-001…). Optionally scope to specific kinds (e.g. renumber only
 * Risks, or only Controls) — kinds omitted are left untouched. SuperAdmin OR
 * Owner/Admin in this org. Renumbering touches only `code` fields; every
 * traceability link and on-model attachment (keyed by item id) is preserved.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  let kinds: RiskControlKind[] | undefined;
  if (Array.isArray(body?.kinds)) {
    const filtered = body.kinds.filter((k: unknown): k is RiskControlKind => RISK_CONTROL_KINDS.includes(k as RiskControlKind));
    if (filtered.length === 0) return NextResponse.json({ error: "No valid kinds supplied" }, { status: 400 });
    kinds = filtered;
  }

  try {
    const result = await renumberOrgCodes(prisma, id, kinds ? { kinds } : undefined);
    return NextResponse.json({ ok: true, ...result, kinds: kinds ?? "all" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/orgs/${id}/risk-controls/renumber]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
