/**
 * Feature-catalog entry for **Flexible AI deployment** — run AI diagram generation
 * via our managed service, through your own gateway/region, or fully on-premises
 * against a local model. (Reflects the ANTHROPIC_BASE_URL seam + AI_CUSTOM_MODELS.)
 *
 * LIVING ENTRY: upserts-and-updates the DRAFT fields on every run so it stays
 * current; only touches DRAFT columns, so /features shows the last PUBLISHED
 * version until a SuperAdmin reviews it in /dashboard/admin/features and Publishes.
 *
 * Run:
 *   DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/add-features-flexible-ai.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const NAME = "Flexible AI — Your Cloud, Your Gateway, or On-Premises";
const SORT_ORDER = 255;
const SUMMARY =
  "Use AI diagram generation the way your security team allows — our managed service, routed through your own gateway, or a local model running entirely inside your network. Or switch AI off and keep the full deterministic platform.";
const DETAILS = [
  "AI Generate turns a description, document or image into a BPMN, flowchart, ArchiMate, domain or state-machine diagram. **How** that AI runs is your choice:",
  "",
  "- **Managed (default)** — our hosted, up-to-date Claude models. Nothing to run.",
  "- **Your gateway / region** — route all AI through your own proxy or private endpoint, so traffic stays under your data-residency and DLP controls. A configuration setting, not a code change.",
  "- **Fully on-premises** — point Diagramatix at a **local, self-hosted model** (e.g. Llama or Qwen behind your own gateway). Diagram content never leaves your network — ideal for air-gapped or highly regulated environments.",
  "- **Off** — disable AI entirely per organisation and use the complete manual + deterministic platform (process mining, simulation and risk/controls all still work).",
  "",
  "Whichever mode you pick, AI uses a **single, centrally-chosen model** your administrators control — nothing is ever sent to a model you haven't approved.",
].join("\n");

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const existing = await prisma.feature.findFirst({ where: { name: NAME } });
    if (existing) {
      await prisma.feature.update({ where: { id: existing.id }, data: { name: NAME, summary: SUMMARY, details: DETAILS, sortOrder: SORT_ORDER } });
      console.log(`Updated draft "${NAME}" (sortOrder=${SORT_ORDER}). Review + Publish in /dashboard/admin/features.`);
    } else {
      await prisma.feature.create({ data: { name: NAME, summary: SUMMARY, details: DETAILS, sortOrder: SORT_ORDER } });
      console.log(`Added draft "${NAME}" (sortOrder=${SORT_ORDER}, unpublished).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
