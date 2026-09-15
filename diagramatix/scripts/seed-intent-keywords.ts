/**
 * Seed the assist "semantic template suggestion" catalog (IntentKeywordMap).
 * Idempotent + non-destructive: only inserts rows whose label is missing, so
 * SuperAdmin edits are never reverted.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/seed-intent-keywords.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/seed-intent-keywords.ts # prod
 *
 * targetCategory values map to built-in template `group`s; targetTemplateName
 * (when set) attaches that exact template directly.
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type Row = { label: string; keywords: string[]; action?: string; diagramType?: string; defaultLabel?: string; targetCategory?: string; targetTemplateName?: string; sortOrder: number };

/** Old label → new label. Applied before the insert pass so nothing is duplicated. */
const RENAMES: Record<string, string> = { Notification: "Suggestion" };

const ROWS: Row[] = [
  // suggest-template (green)
  { label: "Approval", keywords: ["approve", "approval", "sign-off", "sign off", "authorise", "authorize", "review", "endorse", "ratify"], targetCategory: "Approvals", sortOrder: 10 },
  { label: "Rejection", keywords: ["reject", "rejection", "decline", "deny", "refuse"], targetCategory: "Approvals", sortOrder: 20 },
  { label: "Escalation", keywords: ["escalate", "escalation", "expedite"], targetCategory: "Exceptions", sortOrder: 30 },
  { label: "Exception", keywords: ["error", "exception", "fault", "failure", "fail"], targetCategory: "Exceptions", sortOrder: 40 },
  // Paul, 2026-09-15: was "Notification" — an amber chip reading "Notification"
  // looked like a system alert, and it had no real target (it opened the Events
  // picker). Renamed, and pointed at the "Send Notification" built-in template.
  { label: "Suggestion", keywords: ["notify", "notification", "alert", "email", "inform", "remind", "reminder"], targetCategory: "Events", targetTemplateName: "Send Notification", sortOrder: 50 },
  { label: "Payment", keywords: ["pay", "payment", "invoice", "billing", "refund", "settle"], targetCategory: "Approvals", sortOrder: 60 },
  { label: "Review loop", keywords: ["rework", "revise", "revision", "amend", "correct"], targetCategory: "Loops", sortOrder: 70 },
  // data-object suggestions (green, all diagram types) — G2/G3
  { label: "Instructions", keywords: ["per the", "according to", "policy", "procedure", "guideline", "instructions", "template", "checklist", "standard", "rules", "as per"],
    action: "add-input-data-object", diagramType: "all", defaultLabel: "Instructions", sortOrder: 80 },
  { label: "Output Doc", keywords: ["produce", "prepare", "create", "draft", "write", "generate", "update", "issue", "compile", "report", "letter", "document", "certificate", "record"],
    action: "add-output-data-object", diagramType: "all", defaultLabel: "Output Doc", sortOrder: 90 },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let created = 0, skipped = 0;
  try {
    // Renames are applied FIRST so an existing row keeps its id (and any admin
    // keyword edits) instead of being duplicated under the new label. A rename
    // also fills in the target template when the row has none yet.
    for (const [from, to] of Object.entries(RENAMES)) {
      const old = await prisma.intentKeywordMap.findFirst({ where: { label: from } });
      if (!old) continue;
      const target = ROWS.find((r) => r.label === to);
      await prisma.intentKeywordMap.update({
        where: { id: old.id },
        data: { label: to, targetTemplateName: old.targetTemplateName ?? target?.targetTemplateName ?? null },
      });
      console.log(`  rename "${from}" → "${to}"${old.targetTemplateName ? "" : ` (target: ${target?.targetTemplateName ?? "—"})`}`);
    }
    for (const r of ROWS) {
      const existing = await prisma.intentKeywordMap.findFirst({ where: { label: r.label } });
      if (existing) { skipped++; console.log(`  skip   "${r.label}" (exists)`); continue; }
      await prisma.intentKeywordMap.create({
        data: {
          label: r.label, keywords: r.keywords,
          action: r.action ?? "suggest-template", diagramType: r.diagramType ?? "all", defaultLabel: r.defaultLabel ?? null,
          targetCategory: r.targetCategory ?? null, targetTemplateName: r.targetTemplateName ?? null, sortOrder: r.sortOrder,
        },
      });
      created++;
      console.log(`  add    "${r.label}" [${r.action ?? "suggest-template"}] → ${r.defaultLabel ?? r.targetTemplateName ?? r.targetCategory}`);
    }
    console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
