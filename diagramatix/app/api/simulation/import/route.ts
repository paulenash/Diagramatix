/**
 * Import a Diagramatix simulation bundle (from GET /projects/[id]/simulation/export)
 * — validate it and adopt it into a NEW project owned by the caller, recreating
 * the diagrams + team library + calendar library + study + scenarios. Returns the
 * new project id + the diagram to open, so the caller can jump straight into the
 * Simulator.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { validateExamplePackage, type ExamplePackage } from "@/app/lib/simulation/examplePackage";
import { adoptPackage } from "@/app/lib/simulation/adoptPackage";

export async function POST(req: Request) {
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

  const body = await req.json().catch(() => ({}));
  // Accept the wrapped bundle ({ format, package }) or a bare ExamplePackage.
  const pkg = (body?.package ?? body) as ExamplePackage;
  const errs = validateExamplePackage(pkg);
  if (errs.length) return NextResponse.json({ error: `Not a valid simulation bundle: ${errs.join("; ")}` }, { status: 400 });

  const name = typeof body?.name === "string" && body.name.trim()
    ? body.name.trim()
    : `${pkg.study?.name ?? "Imported"} (imported)`;

  const result = await adoptPackage(pkg, {
    userId: session.user.id,
    orgId,
    ownerName: session.user.name ?? session.user.email ?? "",
    projectName: name,
  });
  return NextResponse.json(result, { status: 201 });
}
