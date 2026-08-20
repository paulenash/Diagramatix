import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../app/lib/db";
import { parseValueChainMd } from "../app/lib/valueChain/parseValueChainMd";
import { loadAiRulesForType } from "../app/lib/ai/loadAiRules";
import { generateDiagramData } from "../app/lib/ai/generateDiagramData";
import { resolveGenerateModel } from "../app/lib/ai/aiModelSetting";
import { chooseModel } from "../app/lib/ai/modelAccess";
import { aiApiKey } from "../app/lib/ai/anthropicClient";
import { enterAiContext, AI_INVOCATION_POINTS, recordDiagramGenerated } from "../app/lib/ai/aiTelemetry";

/**
 * Local one-off: generate a whole value chain from the Process Repository doc
 * into a new project in the LOCAL DB — the exact server-side pipeline the
 * "Create Project Diagrams from .md" tool runs, but from the CLI so the project
 * can be opened + inspected in the local app (npm run go → :3000).
 *
 *   npx tsx@4 scripts/generate-value-chain-local.ts V09
 */
const CHAIN = (process.argv[2] || "V09").toUpperCase();
const MD = "new features/Process Repository Final.md";
const OWNER_EMAIL = "paul@nashcc.com.au";

async function main() {
  const md = readFileSync(MD, "utf8");
  const chain = parseValueChainMd(md).find((c) => c.code === CHAIN);
  if (!chain) throw new Error(`chain ${CHAIN} not found in ${MD}`);
  console.log(`${chain.code} — ${chain.title}: ${chain.diagrams.length} diagrams`);

  // Borrow a valid (userId, orgId) from an existing project of the owner.
  const user = await prisma.user.findFirst({ where: { email: OWNER_EMAIL }, select: { id: true, name: true, email: true } });
  if (!user) throw new Error(`user ${OWNER_EMAIL} not found locally`);
  // The owner may belong to several orgs — pick the one they use MOST (their
  // primary working org, the one the dashboard shows), not an arbitrary first.
  const ownerProjects = await prisma.project.findMany({ where: { userId: user.id }, select: { orgId: true } });
  if (ownerProjects.length === 0) throw new Error(`no existing project for ${OWNER_EMAIL} to borrow an orgId from`);
  const orgCounts = new Map<string, number>();
  for (const p of ownerProjects) orgCounts.set(p.orgId, (orgCounts.get(p.orgId) ?? 0) + 1);
  const orgId = [...orgCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const model = chooseModel(undefined, await resolveGenerateModel(false), true);
  const apiKey = aiApiKey(model);
  if (!apiKey) throw new Error(`no API key for model ${model} — set ANTHROPIC_API_KEY in .env`);
  console.log(`model=${model}  owner=${user.email}  orgId=${orgId}`);

  enterAiContext({ userId: user.id, orgId, invocationPoint: AI_INVOCATION_POINTS.DiagramGenerate });

  // Idempotent: remove any prior generated copy of THIS chain (same-named
  // project + its diagrams, and this chain's auto-named prompts) so a re-run
  // doesn't leave duplicates.
  const priors = await prisma.project.findMany({ where: { userId: user.id, name: chain.title }, select: { id: true } });
  for (const p of priors) {
    await prisma.diagram.deleteMany({ where: { projectId: p.id } });
    await prisma.project.delete({ where: { id: p.id } });
  }
  const delP = await prisma.prompt.deleteMany({ where: { userId: user.id, orgId, name: { startsWith: `${chain.code} ` } } });
  const delSub = await prisma.prompt.deleteMany({ where: { userId: user.id, orgId, name: { startsWith: `${chain.code}.` } } });
  if (priors.length || delP.count || delSub.count) {
    console.log(`cleaned prior copy: ${priors.length} project(s), ${delP.count + delSub.count} prompt(s)`);
  }

  const project = await prisma.project.create({
    data: { name: chain.title, userId: user.id, orgId, ownerName: user.name ?? user.email ?? "" },
    select: { id: true },
  });
  console.log(`project "${chain.title}" created = ${project.id}\n`);

  const rulesByType = new Map<string, string>();
  const rulesFor = async (t: string) => {
    let r = rulesByType.get(t);
    if (r === undefined) { r = await loadAiRulesForType(t); rulesByType.set(t, r); }
    return r;
  };

  let ok = 0, fail = 0;
  for (let i = 0; i < chain.diagrams.length; i++) {
    const d = chain.diagrams[i];
    process.stdout.write(`  [${i + 1}/${chain.diagrams.length}] ${d.type.padEnd(16)} ${d.name} ... `);
    const t0 = Date.now();
    try {
      const rules = await rulesFor(d.type);
      const data = await generateDiagramData({ diagramType: d.type, prompt: d.prompt, model, apiKey, rules, promptLabel: d.name });
      const promptName = `${d.name} — AI prompt`;
      let promptId: string | undefined;
      try {
        const p = await prisma.prompt.create({ data: { name: promptName, text: d.prompt, diagramType: d.type, userId: user.id, orgId }, select: { id: true } });
        promptId = p.id;
      } catch { /* prompt save best-effort */ }
      if (promptId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any).aiGeneration = { promptId, promptName, promptText: d.prompt, model, generatedAt: new Date().toISOString(), autoNamed: true };
      }
      await prisma.diagram.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { name: d.name, type: d.type, data: data as any, userId: user.id, diagramOwnerId: user.id, orgId, projectId: project.id },
        select: { id: true },
      });
      await recordDiagramGenerated({ userId: user.id, orgId, diagramType: d.type, source: "md-batch-local" });
      ok++;
      console.log(`ok  (${data.elements.length}el/${data.connectors.length}conn, ${Date.now() - t0}ms)`);
    } catch (e) {
      fail++;
      console.log(`FAIL: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nDONE: ${ok} created, ${fail} failed.`);
  console.log(`Open project "${chain.title}" (id ${project.id}) in the local app.`);
  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
