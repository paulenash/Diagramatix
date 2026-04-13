import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";
import { isSuperuser } from "@/app/lib/superuser";

/** GET /api/bpmn-rules?category=bpmn — return rules for a category (user's or default) */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get("category") ?? "bpmn";

  // Try user-specific rules first
  let orgId: string | null = null;
  try { orgId = await getCurrentOrgId(session, await cookies()); } catch { /* no org */ }

  if (orgId) {
    const userRules = await prisma.diagramRules.findFirst({
      where: { category, userId: session.user.id, orgId },
      select: { id: true, category: true, rules: true, isDefault: true, updatedAt: true },
    });
    if (userRules) return NextResponse.json(userRules);
  }

  // Fall back to system default for this category
  const defaultRules = await prisma.diagramRules.findFirst({
    where: { category, isDefault: true },
    select: { id: true, category: true, rules: true, isDefault: true, updatedAt: true },
  });

  return NextResponse.json(defaultRules ?? { id: null, category, rules: "", isDefault: true });
}

/** GET all categories — used by the rules editor */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, category, rules } = await req.json();

  // Action: "list" — return all categories with rules
  if (action === "list") {
    let orgId: string | null = null;
    try { orgId = await getCurrentOrgId(session, await cookies()); } catch { /* no org */ }

    const categories = ["general", "bpmn", "state-machine", "value-chain", "domain", "context", "process-context"];
    const result = [];

    for (const cat of categories) {
      // User-specific first
      let found = null;
      if (orgId) {
        found = await prisma.diagramRules.findFirst({
          where: { category: cat, userId: session.user.id, orgId },
          select: { id: true, category: true, rules: true, isDefault: true, updatedAt: true },
        });
      }
      if (!found) {
        found = await prisma.diagramRules.findFirst({
          where: { category: cat, isDefault: true },
          select: { id: true, category: true, rules: true, isDefault: true, updatedAt: true },
        });
      }
      result.push(found ?? { id: null, category: cat, rules: "", isDefault: true });
    }

    return NextResponse.json(result);
  }

  // Action: "save" — save user-specific rules for a category
  if (action === "save") {
    if (!category || typeof rules !== "string") {
      return NextResponse.json({ error: "category and rules required" }, { status: 400 });
    }

    let orgId: string;
    try { orgId = await getCurrentOrgId(session, await cookies()); }
    catch (err) {
      if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    const existing = await prisma.diagramRules.findFirst({
      where: { category, userId: session.user.id, orgId },
    });

    if (existing) {
      await prisma.diagramRules.update({ where: { id: existing.id }, data: { rules } });
    } else {
      await prisma.diagramRules.create({
        data: { category, rules, userId: session.user.id, orgId, isDefault: false },
      });
    }

    return NextResponse.json({ success: true });
  }

  // Action: "save-default" — admin only: save system default rules
  if (action === "save-default") {
    if (!isSuperuser(session)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (!category || typeof rules !== "string") {
      return NextResponse.json({ error: "category and rules required" }, { status: 400 });
    }

    const existing = await prisma.diagramRules.findFirst({
      where: { category, isDefault: true },
    });

    if (existing) {
      await prisma.diagramRules.update({ where: { id: existing.id }, data: { rules } });
    } else {
      await prisma.diagramRules.create({ data: { category, rules, isDefault: true } });
    }

    return NextResponse.json({ success: true });
  }

  // Action: "reset" — delete user customisation, revert to default
  if (action === "reset") {
    if (!category) return NextResponse.json({ error: "category required" }, { status: 400 });

    let orgId: string;
    try { orgId = await getCurrentOrgId(session, await cookies()); }
    catch (err) {
      if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    await prisma.diagramRules.deleteMany({
      where: { category, userId: session.user.id, orgId, isDefault: false },
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
