/**
 * Public Risk & Control (GRC) example gallery API. Any signed-in user sees the
 * PUBLISHED catalog entries (metadata + a content summary) to browse and adopt.
 * The full package loads only at adopt time, keeping this list light.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { summarizeRiskControlPackage, type RiskControlExamplePackage } from "@/app/lib/riskControls/examplePackage";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.riskControlExample.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } });
  const examples = rows.map((e) => ({
    id: e.id, slug: e.slug, title: e.title, concept: e.concept, description: e.description, difficulty: e.difficulty,
    summary: summarizeRiskControlPackage((e.package ?? {}) as unknown as RiskControlExamplePackage),
  }));
  return NextResponse.json({ examples });
}
