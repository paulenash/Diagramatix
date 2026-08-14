/**
 * POST /api/projects/:id/simulation/adopt
 * Replay simulation packages (from a project JSON import) INTO this project,
 * mapping each package's diagram keys (original diagram ids) to the newly-created
 * diagram ids via `keyMap`. Recreates each study + scenarios + team/calendar
 * library via the shared adoptPackageInto. Edit access required.
 *
 * Body: { packages: ExamplePackage[]; keyMap: Record<string, string> }
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { adoptLibraryInto, adoptPackageInto } from "@/app/lib/simulation/adoptPackage";
import { validateExamplePackage, type ExampleLibrary, type ExamplePackage } from "@/app/lib/simulation/examplePackage";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const packages: ExamplePackage[] = Array.isArray(body.packages) ? body.packages : [];
  const library: ExampleLibrary | null =
    body.library && Array.isArray(body.library.teams) ? body.library as ExampleLibrary : null;
  const keyMapRaw = (body.keyMap && typeof body.keyMap === "object") ? body.keyMap as Record<string, string> : {};
  const keyToDiagramId = new Map<string, string>(Object.entries(keyMapRaw).filter(([, v]) => typeof v === "string"));
  if (packages.length === 0 && !library) return NextResponse.json({ adopted: 0 });

  // Only replay structurally-valid packages; skip the rest rather than fail the
  // whole import.
  const valid = packages.filter((p) => validateExamplePackage(p).length === 0);

  const userId = session.user.id ?? null;
  let adopted = 0;
  await prisma.$transaction(async (tx) => {
    // Library first: it survives a study-less project, and adopting it up front
    // means the packages below reuse these rows by name instead of duplicating.
    if (library) await adoptLibraryInto(tx, library, id);
    for (const pkg of valid) {
      await adoptPackageInto(tx, pkg, { projectId: id, keyToDiagramId, userId });
      adopted++;
    }
  });
  return NextResponse.json({ adopted, skipped: packages.length - adopted });
}
