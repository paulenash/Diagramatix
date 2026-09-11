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

/**
 * The starting vocabulary — deliberately generic and cross-industry.
 *
 * `description` is REQUIRED here, not optional. Paul, 2026-09-12: "Why do some
 * skill have descriptions and other not?" Because they were written
 * inconsistently, and the type let them be. Making it required is what stops
 * that recurring; T4260 checks the SQL seed the same way.
 */
const SEED: { name: string; category: string; description: string }[] = [
  // EVERY entry is described, and every description answers the same
  // question: who qualifies. That is the only thing a skill is ever asked —
  // the engine uses it to decide who may take a task — so a name whose
  // holder is ambiguous ("Legal Review": a lawyer, or anyone checking?) is a
  // name two people will apply differently. Half-described was worse than
  // either: the screen shows the description inline, so it read as missing
  // data rather than as a choice.
  //
  // Where a shipped EXAMPLE already names a skill, the seed uses that exact
  // name — see T4258.
  { name: "Approval Authority", category: "Authority", description: "Mandated to approve within a defined limit — not merely able to review." },
  { name: "Compliance Accreditation", category: "Authority", description: "Formally accredited to sign off a regulated check." },
  { name: "Payment Authorisation", category: "Authority", description: "Permitted to release funds." },
  { name: "Contract Signing", category: "Authority", description: "Authorised to execute a contract on the organisation's behalf." },
  { name: "Customer Contact", category: "Operational", description: "Trained and permitted to deal directly with customers." },
  { name: "Complaint Handling", category: "Operational", description: "Trained to take and resolve a complaint, including escalation." },
  { name: "Case Assessment", category: "Operational", description: "Competent to assess a case on its merits and decide the outcome." },
  { name: "Quality Review", category: "Operational", description: "Checks another person's work; normally excludes the original author." },
  { name: "Onboarding Administration", category: "Operational", description: "Runs the administrative steps of bringing a new joiner on." },
  { name: "Payroll Administration", category: "Operational", description: "Creates and amends payroll records." },
  { name: "Offer Negotiation", category: "Operational", description: "Authorised to negotiate terms with a candidate or supplier." },
  { name: "Sourcing", category: "Operational", description: "Finds and attracts candidates or suppliers." },
  { name: "Device Provisioning", category: "Technical", description: "Issues and configures laptops, phones and accounts." },
  { name: "System Configuration", category: "Technical", description: "Changes system settings in a controlled environment." },
  { name: "Data Analysis", category: "Technical", description: "Extracts and interprets data to answer a defined question." },
  { name: "Technical Support", category: "Technical", description: "Diagnoses and resolves technical faults for users." },
  { name: "Clinical Assessment", category: "Professional", description: "Registered clinician, practising within their scope." },
  { name: "Legal Review", category: "Professional", description: "Legally qualified to advise on the matter in hand." },
  { name: "Financial Analysis", category: "Professional", description: "Qualified to analyse financial position and give an opinion." },
  { name: "Underwriting", category: "Professional", description: "Authorised to accept risk within a stated mandate." },
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
