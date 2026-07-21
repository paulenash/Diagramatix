import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { rulesMetadata } from "@/app/lib/diagram/checks/diagramChecks";
import { ScannerRulesClient, type MergedRule } from "./ScannerRulesClient";

/**
 * SuperAdmin BPMN Scanner rule registry. Merges the code-defined checks
 * (diagramChecks.ts, the implemented baseline) with the DB lifecycle overlay
 * (ScannerRule rows: proposed / live / pending-delete) and hands the result
 * to the editable client. Retired rows are hidden (kept only to reserve
 * their numbers).
 */
export default async function ScannerRulesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");

  const codeRules = rulesMetadata();
  const dbRules = await prisma.scannerRule.findMany();
  const dbByCode = new Map(dbRules.map((r) => [r.code, r]));

  const sev = (s: string): "error" | "warning" => (s === "error" ? "error" : "warning");
  const merged: MergedRule[] = [];
  const used = new Set<string>();

  for (const r of codeRules) {
    used.add(r.code);
    const o = dbByCode.get(r.code);
    // A confirmed-removal (retired) override hides the rule from the list even
    // though the code check still exists — the registry reflects the admin's
    // intent; the dev removes the code separately.
    if (o?.status === "retired") continue;
    if (o) {
      merged.push({
        code: o.code, title: o.title, description: o.description,
        severity: sev(o.severity), category: o.category,
        status: o.status as MergedRule["status"], hasOverride: true, fromCode: true,
      });
    } else {
      merged.push({
        code: r.code, title: r.title, description: r.description,
        severity: sev(r.severity), category: r.category,
        status: "live", hasOverride: false, fromCode: true,
      });
    }
  }
  for (const o of dbRules) {
    if (used.has(o.code) || o.status === "retired") continue;
    merged.push({
      code: o.code, title: o.title, description: o.description,
      severity: sev(o.severity), category: o.category,
      status: o.status as MergedRule["status"], hasOverride: true, fromCode: false,
    });
  }

  merged.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  return <ScannerRulesClient rules={merged} />;
}
