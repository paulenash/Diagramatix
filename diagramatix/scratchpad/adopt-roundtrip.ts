/**
 * Live adopt round-trip against the local DB — the decisive check that gaps
 * A, B and C are actually closed on the path a learner uses.
 *
 * Adopts the seeded example into a throwaway project, asserts the people, the
 * companion diagram, the business-case inputs and the re-pointed provenance all
 * survived, then deletes the project again.
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const { adoptPackage } = await import("../app/lib/simulation/adoptPackage");
  const ex = await prisma.simulationExample.findUnique({ where: { slug: "hire-and-onboard" } });
  if (!ex) throw new Error("Seed the catalog first.");
  const user = await prisma.user.findFirst({ select: { id: true, name: true } });
  const org = await prisma.org.findFirst({ select: { id: true } });
  if (!user) throw new Error("No user in the local DB.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { projectId } = await adoptPackage(ex.package as any, {
    projectName: `__adopt-check ${Date.now()}`,
    userId: user.id, orgId: org!.id, ownerName: user.name ?? "",
    sourceExampleId: ex.id,
  });

  const fail: string[] = [];
  const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? "✓" : "✗"} ${msg}`); if (!cond) fail.push(msg); };

  try {
    const diagrams = await prisma.diagram.findMany({ where: { projectId }, select: { id: true, name: true, type: true } });
    console.log("\nDIAGRAMS");
    for (const d of diagrams) console.log(`   ${d.type.padEnd(10)} ${d.name}`);
    ok(diagrams.length === 2, "both diagrams adopted");
    const archi = diagrams.find((d) => d.type === "archimate");
    ok(!!archi, "the ArchiMate companion travelled (gap B)");

    const teams = await prisma.simulationTeam.findMany({ where: { projectId }, select: { name: true, capacity: true, members: true, skillsSource: true } });
    console.log("\nTEAMS");
    for (const t of teams) {
      const m = (t.members ?? []) as { name?: string; skills?: string[] }[];
      console.log(`   ${t.name.padEnd(20)} cap ${t.capacity}  ${m.length} named`);
    }
    const hr = teams.find((t) => t.name === "HR Operations");
    const hrMembers = (hr?.members ?? []) as { name?: string; skills?: string[] }[];
    ok(hrMembers.length === 4, "HR Operations kept its four people (gap A)");
    ok(hrMembers.filter((m) => m.skills?.includes("Compliance Accreditation")).length === 2,
       "exactly two are still accredited");
    ok(teams.reduce((n, t) => n + ((t.members ?? []) as unknown[]).length, 0) === 20, "all 20 people survived");

    const src = (teams.find((t) => ((t.skillsSource ?? {}) as { diagramId?: string }).diagramId)?.skillsSource ?? {}) as { diagramId?: string };
    if (src.diagramId) {
      ok(src.diagramId === archi?.id, "skillsSource re-pointed at the NEW ArchiMate diagram, not the source project's");
    } else {
      console.log("   – no skillsSource recorded (the example's matrix is authored, not filled)");
    }

    const study = await prisma.simulationStudy.findFirst({ where: { projectId }, select: { name: true, businessCase: true } });
    const bc = (study?.businessCase ?? {}) as { implementationCost?: number; annualVolume?: number };
    console.log(`\nSTUDY  "${study?.name}"  businessCase=${JSON.stringify(bc)}`);
    ok(bc.implementationCost === 4500 && bc.annualVolume === 790, "business-case inputs travelled (gap C)");

    const scenarios = await prisma.simulationScenario.findMany({ where: { study: { projectId } }, select: { name: true, overrides: true } });
    console.log("\nSCENARIOS");
    for (const s of scenarios) console.log(`   ${s.name}`);
    ok(scenarios.length === 5, "all five scenarios adopted");
    const train = scenarios.find((s) => s.name.startsWith("Train a third"));
    const ov = (train?.overrides ?? {}) as { teams?: Record<string, { members?: unknown[] }> };
    ok(!!ov.teams?.["HR Operations"]?.members?.length, "the cross-training override survived (gap E)");
  } finally {
    await prisma.project.delete({ where: { id: projectId } });
    console.log("\n(throwaway project deleted)");
  }

  if (fail.length) { console.error(`\n${fail.length} CHECK(S) FAILED`); process.exit(1); }
  console.log("\nAll adopt checks passed.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
