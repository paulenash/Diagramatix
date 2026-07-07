/**
 * Adopt a published example simulation into a fresh project owned by the
 * caller — the one-click "load a ready-made simulation to demo" path.
 *
 * Recreates the whole bundle: the annotated diagrams (element/connector ids
 * preserved, so sim params + interventions keyed by those ids stay valid), the
 * team library, the study + its roots (remapped package-key → new diagram id),
 * and the scenarios (run config + overrides + planned interventions copied
 * verbatim — team references are by name, which we preserve). Returns the new
 * project id + the diagram to open so the caller can jump straight in.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { validateExamplePackage, type ExamplePackage } from "@/app/lib/simulation/examplePackage";
import { adoptPackage } from "@/app/lib/simulation/adoptPackage";
import { purgePriorExampleCopies } from "@/app/lib/examples/singleCopy";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const example = await prisma.simulationExample.findFirst({ where: { id, published: true } });
  if (!example) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pkg = (example.package ?? {}) as unknown as ExamplePackage;
  const errs = validateExamplePackage(pkg);
  if (errs.length) return NextResponse.json({ error: `Example package invalid: ${errs.join("; ")}` }, { status: 500 });

  // One copy per user — overwrite any prior copy of this example.
  await purgePriorExampleCopies(example.id, { id: session.user.id, email: session.user.email ?? "" });

  const result = await adoptPackage(pkg, {
    userId: session.user.id,
    orgId,
    ownerName: session.user.name ?? session.user.email ?? "",
    projectName: `${example.title} (example)`,
    sourceExampleId: example.id,
  });

  return NextResponse.json(result, { status: 201 });
}
