/**
 * Put the layout corpus into a project you can open and look at.
 *
 * The fixtures are AI PLANS, which are the right thing to store (they replay
 * for free and never go stale) but are not something you can read. This lays
 * each one out and saves it as a real diagram, named with its violation count,
 * so the baseline can be inspected rather than taken on trust.
 *
 *   npx tsx scripts/publish-layout-corpus.ts
 *   npx tsx scripts/publish-layout-corpus.ts --project "Layout Baseline"
 *
 * Writes to whatever DATABASE_URL points at. The project is REPLACED on each
 * run, so it always shows the current layout engine rather than an accumulation.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../app/lib/db";
import { layoutBpmnDiagram } from "../app/lib/diagram/bpmnLayout";
import { findLayoutViolations, findReadabilityViolations } from "../app/lib/diagram/checks/layoutViolations";
import type { DiagramData } from "../app/lib/diagram/types";

const DIR = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--project");
  const PROJECT = i >= 0 ? argv[i + 1] : "Layout Corpus Baseline";

  if (!fs.existsSync(DIR)) { console.error(`no corpus at ${DIR} — run build-layout-corpus.ts first`); process.exit(1); }
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".plan.json")).sort();
  if (files.length === 0) { console.error("corpus is empty"); process.exit(1); }

  const owner =
    (await prisma.user.findFirst({ where: { email: "paul@nashcc.com.au" }, select: { id: true, name: true } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }));
  if (!owner) { console.error("no user to own the project"); process.exit(1); }
  const member = await prisma.orgMember.findFirst({
    where: { userId: owner.id }, select: { orgId: true }, orderBy: { createdAt: "asc" },
  });
  if (!member) { console.error("owner has no org"); process.exit(1); }
  const orgId = member.orgId;

  let project = await prisma.project.findFirst({ where: { userId: owner.id, name: PROJECT }, select: { id: true } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: PROJECT,
        description: "The layout regression corpus, laid out with the CURRENT engine. "
          + "Rebuilt by scripts/publish-layout-corpus.ts; each name carries its readability-violation count.",
        userId: owner.id, orgId, ownerName: owner.name ?? "",
      },
      select: { id: true },
    });
  }
  await prisma.diagram.deleteMany({ where: { projectId: project.id } });

  let total = 0, saved = 0;
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
    if (!plan?.elements) continue;
    const r = layoutBpmnDiagram(plan.elements, plan.connections);
    const data = { elements: r.elements, connectors: r.connectors } as DiagramData;
    const vs = [...findLayoutViolations(data), ...findReadabilityViolations(data)];
    total += vs.length;
    // The count is in the NAME so the worst offenders are obvious in the list
    // without opening anything.
    const flag = vs.length ? ` (!${vs.length})` : " (clean)";
    await prisma.diagram.create({
      data: {
        name: `${j.processCode ?? f.replace(".plan.json", "")} ${j.name ?? ""}${flag}`.trim(),
        type: "bpmn",
        // Keep the plan on the diagram, so it can be replayed from here too.
        data: { ...data, aiGeneration: { plan } } as never,
        userId: owner.id, orgId, projectId: project.id,
      },
    });
    saved++;
    console.log(`  ${(j.processCode ?? f).padEnd(9)} ${String(vs.length).padStart(3)} violation(s)`);
  }
  console.log(`\n${saved} diagram(s) → project "${PROJECT}" · ${total} violation(s) total`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
