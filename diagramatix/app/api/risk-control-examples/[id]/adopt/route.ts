/**
 * Adopt a published Risk & Control example into a fresh project owned by the
 * caller — the one-click "load a ready-made GRC study" path. Recreates the
 * process diagrams (with risks/controls attached to the steps), the GRC library,
 * and an optional mining run + conformance, so control effectiveness shows right
 * away. Returns the new project + the diagram to open.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
import { validateRiskControlExamplePackage, type RiskControlExamplePackage } from "@/app/lib/riskControls/examplePackage";
import { adoptRiskControlExample } from "@/app/lib/riskControls/adoptRiskControlExample";
import { purgePriorExampleCopies } from "@/app/lib/examples/singleCopy";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const featureGate = await gateFeature(session.user.id, "riskControl");
  if (featureGate) return featureGate;
  try {
    if (isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* not impersonating */ }

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const example = await prisma.riskControlExample.findFirst({ where: { id, published: true } });
  if (!example) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pkg = (example.package ?? {}) as unknown as RiskControlExamplePackage;
  const errs = validateRiskControlExamplePackage(pkg);
  if (errs.length) return NextResponse.json({ error: `Example package invalid: ${errs.join("; ")}` }, { status: 500 });

  // One copy per user — overwrite any prior copy of this example.
  await purgePriorExampleCopies(example.id, { id: session.user.id, email: session.user.email ?? "" });

  const result = await adoptRiskControlExample(pkg, {
    userId: session.user.id,
    orgId,
    ownerName: session.user.name ?? session.user.email ?? "",
    projectName: `${example.title} (example)`,
    sourceExampleId: example.id,
  });
  return NextResponse.json(result, { status: 201 });
}
