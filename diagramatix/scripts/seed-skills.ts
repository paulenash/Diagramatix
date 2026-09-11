/**
 * Seed the master Skills list for every org that has none.
 *
 * INSERT-ONLY, and per-org skipped once anything exists. A seed that rewrites a
 * live catalog is the rules-seed incident again: somebody's curated vocabulary
 * replaced by ours, silently, on a deploy.
 *
 *   npx tsx scripts/seed-skills.ts             # every org with an empty list
 *   npx tsx scripts/seed-skills.ts --dry-run
 *   npx tsx scripts/seed-skills.ts --org <id>  # just one
 *
 * The list is a STARTING POINT, not a standard. It exists so the picker opens
 * onto something recognisable instead of an empty box, and so the adopt-orphans
 * flow has something to merge into. Every entry is meant to be renamed, retired
 * or deleted by whoever owns the org's vocabulary.
 */
import "dotenv/config";
import { prisma } from "../app/lib/db";

/** name, category — deliberately generic and cross-industry. */
const SEED: { name: string; category: string; description?: string }[
  // Where a shipped EXAMPLE already names a skill, the seed uses that exact
  // name. It first shipped with a generic "Negotiation" beside the example's
  // "Offer Negotiation" — two names for one competency, on day one, in the
  // list whose whole purpose is to stop that.
  { name: "Approval Authority", category: "Authority", description: "Mandated to approve within a defined limit." },
  { name: "Compliance Accreditation", category: "Authority", description: "Accredited to sign off a regulated check." },
  { name: "Payment Authorisation", category: "Authority", description: "Permitted to release funds." },
  { name: "Contract Signing", category: "Authority", description: "Authorised to execute a contract." },
  { name: "Customer Contact", category: "Operational", description: "Trained to deal directly with customers." },
  { name: "Complaint Handling", category: "Operational" },
  { name: "Case Assessment", category: "Operational" },
  { name: "Quality Review", category: "Operational" },
  { name: "Onboarding Administration", category: "Operational" },
  { name: "Payroll Administration", category: "Operational" },
  { name: "Offer Negotiation", category: "Operational", description: "Authorised to negotiate terms with a candidate or supplier." },
  { name: "Sourcing", category: "Operational", description: "Finding and attracting candidates or suppliers." },
  { name: "Device Provisioning", category: "Technical" },
  { name: "System Configuration", category: "Technical" },
  { name: "Data Analysis", category: "Technical" },
  { name: "Technical Support", category: "Technical" },
  { name: "Clinical Assessment", category: "Professional", description: "Registered clinician." },
  { name: "Legal Review", category: "Professional" },
  { name: "Financial Analysis", category: "Professional" },
  { name: "Underwriting", category: "Professional" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const orgArg = process.argv.indexOf("--org");
  const onlyOrg = orgArg >= 0 ? process.argv[orgArg + 1] : null;

  const orgs = await prisma.org.findMany({
    where: onlyOrg ? { id: onlyOrg } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (orgs.length === 0) { console.log("No orgs matched."); return; }

  let seeded = 0, skipped = 0;
  for (const org of orgs) {
    const existing = await prisma.skill.count({ where: { orgId: org.id } });
    if (existing > 0) {
      console.log(`  skip  ${org.name} — already has ${existing} skill${existing === 1 ? "" : "s"}`);
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`  WOULD seed ${org.name} with ${SEED.length} skills`);
      seeded++;
      continue;
    }
    await prisma.skill.createMany({
      data: SEED.map((s, i) => ({ orgId: org.id, name: s.name, category: s.category, description: s.description ?? null, sortOrder: i })),
      skipDuplicates: true,
    });
    console.log(`  seed  ${org.name} — ${SEED.length} skills`);
    seeded++;
  }

  console.log(`\n${dryRun ? "[dry run] " : ""}${seeded} org(s) seeded, ${skipped} left alone.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
