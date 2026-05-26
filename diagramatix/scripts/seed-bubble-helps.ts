/**
 * Seed initial Bubble Help rows for BPMN diagrams.
 *
 * Idempotent: uses upsert on the (diagramType, topicKey) unique. Safe
 * to re-run; existing rows get their text + duration overwritten with
 * the seed values, so once admins start editing they should NOT re-run
 * this script (otherwise their edits get reverted).
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/seed-bubble-helps.ts
 *
 * Against prod (one-time, after first deploy):
 *   DATABASE_URL="<prod url>" npx tsx scripts/seed-bubble-helps.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

interface SeedRow {
  diagramType: string;
  topicKey: string;
  conditionLabel: string;
  text: string;
  durationMs: number;
  sortOrder: number;
}

const ROWS: SeedRow[] = [
  {
    diagramType: "bpmn",
    topicKey: "create-connector",
    conditionLabel: "Click on an Element",
    text: "Click and Drag\nto create a\nconnector",
    durationMs: 10_000,
    sortOrder: 10,
  },
  {
    diagramType: "bpmn",
    topicKey: "select-multiple",
    conditionLabel: "Click on the Canvas",
    text: "Shift-Click and Drag\nto select multiple items.\nCtrl-Click for Space\ninsertion/deletion",
    durationMs: 10_000,
    sortOrder: 20,
  },
  {
    diagramType: "bpmn",
    topicKey: "pool-header",
    conditionLabel: "Click on a Pool Header Region",
    text: "Drag a new Pool/Lane\nto create or add\nadditional Lanes here",
    durationMs: 10_000,
    sortOrder: 30,
  },
  {
    diagramType: "bpmn",
    topicKey: "lane-header",
    conditionLabel: "Click on a Lane Header Region",
    text: "Drag a new Pool/Lane\nto create or add\nSublanes here",
    durationMs: 10_000,
    sortOrder: 40,
  },
  // The following four rows ship with EMPTY text — Admin fills them in
  // from the Diagram Properties panel. The empty-text gate in
  // `showBubbleHelp` means no cloud fires until the admin adds content.
  {
    diagramType: "bpmn",
    topicKey: "Enhanced Subprocess Usage",
    conditionLabel: "Click on an Enhanced Subprocess",
    text: "",
    durationMs: 10_000,
    sortOrder: 50,
  },
  {
    diagramType: "bpmn",
    topicKey: "start-event",
    conditionLabel: "Click on a Start Event",
    text: "",
    durationMs: 10_000,
    sortOrder: 60,
  },
  {
    diagramType: "bpmn",
    topicKey: "intermediate-event",
    conditionLabel: "Click on an Intermediate Event",
    text: "",
    durationMs: 10_000,
    sortOrder: 70,
  },
  {
    diagramType: "bpmn",
    topicKey: "end-event",
    conditionLabel: "Click on an End Event",
    text: "",
    durationMs: 10_000,
    sortOrder: 80,
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    let inserted = 0;
    let skipped = 0;
    for (const r of ROWS) {
      const existing = await prisma.bubbleHelp.findUnique({
        where: { diagramType_topicKey: { diagramType: r.diagramType, topicKey: r.topicKey } },
      });
      if (existing) {
        // Leave admin edits intact — only insert truly new rows.
        skipped++;
        continue;
      }
      await prisma.bubbleHelp.create({ data: r });
      inserted++;
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped} existing.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
