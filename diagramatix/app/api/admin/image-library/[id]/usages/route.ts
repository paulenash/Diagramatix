/**
 * SuperAdmin — the detailed usage list for one HelpImage (document → chapter →
 * section, and whether the reference is the section image or inline in the body).
 * Drives the "Usages" popup and the delete/replace confirmations.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { computeImageUsages } from "@/app/lib/help/imageUsage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const usages = (await computeImageUsages()).get(id) ?? [];
  return NextResponse.json({ usages });
}
