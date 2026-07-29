/**
 * Create a local Project "Visio Golden Diagram Project" containing the 5
 * canonical golden-reference BPMN diagrams from the Visio golden-snapshot
 * suite (tests/visio/_helpers/scenarios.ts), laid out via the real
 * layoutBpmnDiagram, so Paul can review them in the app.
 *
 * Run:
 *   cd /c/Git/Diagramatix/diagramatix
 *   DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" \
 *     npx --yes tsx@4 scripts/create-golden-project.ts
 *
 * Idempotent: a prior project of the same name owned by the user is deleted
 * (diagrams cascade) before re-creating.
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SCENARIOS, build } from "../tests/visio/_helpers/scenarios";

const EMAIL = process.env.GOLDEN_USER_EMAIL ?? "paul@nashcc.com.au";
const PROJECT_NAME = "Visio Golden Diagram Project";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const user = await prisma.user.findFirst({ where: { email: EMAIL } });
    if (!user) throw new Error(`User ${EMAIL} not found`);
    const member = await prisma.orgMember.findFirst({ where: { userId: user.id } });
    if (!member) throw new Error(`No org membership found for ${EMAIL}`);
    const orgId = member.orgId;

    // Idempotent re-run: drop a prior project of the same name (diagrams cascade).
    const prior = await prisma.project.findFirst({ where: { name: PROJECT_NAME, userId: user.id } });
    if (prior) {
      await prisma.project.delete({ where: { id: prior.id } });
      console.log(`Removed prior "${PROJECT_NAME}" (${prior.id}).`);
    }

    const project = await prisma.project.create({
      data: {
        name: PROJECT_NAME,
        description:
          "The 5 canonical golden-reference BPMN diagrams from the Visio golden-snapshot suite " +
          "(tests/visio/_helpers/scenarios.ts), laid out by the live layoutBpmnDiagram engine.",
        ownerName: user.name ?? "",
        userId: user.id,
        orgId,
      },
    });

    const diagramIds: string[] = [];
    for (const sc of SCENARIOS) {
      const data = build(sc); // full DiagramData incl. viewport
      const diag = await prisma.diagram.create({
        data: {
          name: sc.name,
          type: "bpmn",
          userId: user.id,
          orgId,
          projectId: project.id,
          diagramOwnerId: user.id,
        },
      });
      // Prisma 7 omits Json fields from create/update inputs → write via raw SQL.
      await prisma.$executeRawUnsafe(
        `UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2`,
        JSON.stringify(data),
        diag.id,
      );
      diagramIds.push(diag.id);
      console.log(`  + ${sc.name} (${diag.id})`);
    }

    // Place every diagram at the project root ("root") in the nav tree.
    const folderTree = {
      folders: [] as unknown[],
      diagramFolderMap: Object.fromEntries(diagramIds.map((id) => [id, "root"])),
      diagramOrder: { root: diagramIds },
      folderOrder: {},
    };
    await prisma.$executeRawUnsafe(
      `UPDATE "Project" SET "folderTree" = $1::jsonb WHERE id = $2`,
      JSON.stringify(folderTree),
      project.id,
    );

    console.log(
      `\nCreated project "${PROJECT_NAME}" (${project.id}) with ${diagramIds.length} diagrams for ${EMAIL}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
