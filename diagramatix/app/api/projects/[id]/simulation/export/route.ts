/**
 * Export a project's simulation study as a portable Diagramatix simulation
 * bundle (the ExamplePackage) — diagrams + team library + calendar library +
 * study + scenarios, as a downloadable JSON file. Another user imports it via
 * POST /api/simulation/import to recreate the whole thing in a fresh project.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { captureProjectPackage } from "@/app/lib/simulation/captureProject";

type Params = { params: Promise<{ id: string }> };

const slug = (s: string) => (s || "simulation").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "simulation";

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const studyId = new URL(req.url).searchParams.get("studyId");
  if (!studyId) return NextResponse.json({ error: "studyId required" }, { status: 400 });

  let pkg, studyName;
  try {
    ({ pkg, studyName } = await captureProjectPackage(id, studyId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 400 });
  }

  const bundle = { format: "diagramatix-simulation", formatVersion: 1, package: pkg };
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${slug(studyName)}.dgxsim.json"`,
    },
  });
}
