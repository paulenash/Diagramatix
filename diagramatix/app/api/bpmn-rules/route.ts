import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

/** GET /api/bpmn-rules?category=bpmn — return default rules for a category */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get("category") ?? "bpmn";

  const rules = await prisma.diagramRules.findFirst({
    where: { category, isDefault: true },
    select: { id: true, category: true, rules: true, isDefault: true, updatedAt: true },
  });

  return NextResponse.json(rules ?? { id: null, category, rules: "", isDefault: true });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, category, rules } = await req.json();

  // Action: "list" — return all categories with default rules
  if (action === "list") {
    const categories = ["general", "bpmn", "state-machine", "value-chain", "domain", "context", "process-context"];
    const result = [];

    for (const cat of categories) {
      const found = await prisma.diagramRules.findFirst({
        where: { category: cat, isDefault: true },
        select: { id: true, category: true, rules: true, isDefault: true, updatedAt: true },
      });
      result.push(found ?? { id: null, category: cat, rules: "", isDefault: true });
    }

    return NextResponse.json(result);
  }

  // Action: "save-default" — admin only: save rules
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
