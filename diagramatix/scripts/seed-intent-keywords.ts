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

type Row = { label: string; keywords: string[]; targetCategory?: string; targetTemplateName?: string; sortOrder: number };

const ROWS: Row[] = [
  { label: "Approval", keywords: ["approve", "approval", "sign-off", "sign off", "authorise", "authorize", "review", "endorse", "ratify"], targetCategory: "Approvals", sortOrder: 10 },
  { label: "Rejection", keywords: ["reject", "rejection", "decline", "deny", "refuse"], targetCategory: "Approvals", sortOrder: 20 },
  { label: "Escalation", keywords: ["escalate", "escalation", "expedite"], targetCategory: "Exceptions", sortOrder: 30 },
  { label: "Exception", keywords: ["error", "exception", "fault", "failure", "fail"], targetCategory: "Exceptions", sortOrder: 40 },
  { label: "Notification", keywords: ["notify", "notification", "alert", "email", "inform", "remind", "reminder"], targetCategory: "Events", sortOrder: 50 },
  { label: "Payment", keywords: ["pay", "payment", "invoice", "billing", "refund", "settle"], targetCategory: "Approvals", sortOrder: 60 },
  { label: "Review loop", keywords: ["rework", "revise", "revision", "amend", "correct"], targetCategory: "Loops", sortOrder: 70 },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let created = 0, skipped = 0;
  try {
    for (const r of ROWS) {
      const existing = await prisma.intentKeywordMap.findFirst({ where: { label: r.label } });
      if (existing) { skipped++; console.log(`  skip   "${r.label}" (exists)`); continue; }
      await prisma.intentKeywordMap.create({
        data: { label: r.label, keywords: r.keywords, targetCategory: r.targetCategory ?? null, targetTemplateName: r.targetTemplateName ?? null, sortOrder: r.sortOrder },
      });
      created++;
      console.log(`  add    "${r.label}" → ${r.targetTemplateName ?? r.targetCategory}`);
    }
    console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
