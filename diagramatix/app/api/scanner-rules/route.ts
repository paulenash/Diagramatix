import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { rulesMetadata } from "@/app/lib/diagram/checks/diagramChecks";

/**
 * SuperAdmin-only lifecycle API for the BPMN Scanner rule registry.
 * Actions: create | save | markImplemented | requestDelete | confirmDelete |
 * restore. Code-defined rules (diagramChecks.ts) are the baseline; a DB row
 * either overrides one (same code) or is a new custom rule. Rows are never
 * hard-deleted (status -> "retired") so numbers are never reused.
 */

function numOf(code: string): number {
  const n = parseInt(code.replace(/^[A-Za-z]+/, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

async function nextCode(): Promise<string> {
  const codeNums = rulesMetadata().map((r) => numOf(r.code));
  const dbNums = (await prisma.scannerRule.findMany({ select: { code: true } })).map((r) => numOf(r.code));
  const max = Math.max(0, ...codeNums, ...dbNums);
  return "B" + String(max + 1).padStart(2, "0");
}

function codeRule(code: string) {
  return rulesMetadata().find((r) => r.code === code) ?? null;
}

function cleanFields(body: Record<string, unknown>) {
  return {
    title: String(body.title ?? "").trim() || "Untitled rule",
    description: String(body.description ?? "").trim(),
    severity: body.severity === "error" ? "error" : "warning",
    category: String(body.category ?? "").trim() || "custom",
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const action = body.action as string;

  if (action === "create") {
    const code = await nextCode();
    const rule = await prisma.scannerRule.create({
      data: { code, ...cleanFields(body), status: "proposed" },
    });
    return NextResponse.json(rule);
  }

  const code = body.code as string | undefined;
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const existing = await prisma.scannerRule.findUnique({ where: { code } });

  if (action === "save") {
    // Any edit (to a code rule or an existing override) proposes the change.
    const data = { ...cleanFields(body), status: "proposed" };
    const rule = existing
      ? await prisma.scannerRule.update({ where: { code }, data })
      : await prisma.scannerRule.create({ data: { code, ...data } });
    return NextResponse.json(rule);
  }

  const STATUS: Record<string, string> = {
    markImplemented: "live",
    requestDelete: "pending-delete",
    confirmDelete: "retired",
  };
  let status = STATUS[action];
  if (action === "restore") {
    // Code rules return to "live"; custom rules return to "proposed".
    status = codeRule(code) ? "live" : "proposed";
  }
  if (!status) return NextResponse.json({ error: "unknown action" }, { status: 400 });

  if (existing) {
    const rule = await prisma.scannerRule.update({ where: { code }, data: { status } });
    return NextResponse.json(rule);
  }
  // No override yet — this is a bare code rule. Materialise an override row
  // carrying its current metadata so the new status sticks.
  const cr = codeRule(code);
  if (!cr) return NextResponse.json({ error: "unknown rule" }, { status: 404 });
  const rule = await prisma.scannerRule.create({
    data: {
      code,
      title: cr.title,
      description: cr.description,
      severity: cr.severity,
      category: cr.category,
      status,
    },
  });
  return NextResponse.json(rule);
}
