/**
 * One-shot patch — add R7.05 to the existing BPMN default rule set.
 *
 * The canonical source of truth for fresh installs is
 * `scripts/seed-diagram-rules.cjs`, which already contains R7.05.
 * Existing deployments already have a DiagramRules row with
 * `isDefault: true` for `category: "bpmn"`, so this script appends
 * R7.05 to that row's `rules` field — idempotent (skipped if the
 * row already contains "R7.05:").
 *
 * Run locally first to test:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/patch-add-r7-05.ts
 *
 * Then against prod:
 *   DATABASE_URL="<prod url>" npx tsx scripts/patch-add-r7-05.ts
 */

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const R7_05_TEXT =
  "R7.05: [PROPOSED] Black-box Pool names that contain multiple words must have line breaks (Shift-Enter, i.e. embedded \\n characters) inserted on word boundaries so the LONGEST single line is as short as possible. This minimises the pool height on the generated diagram — the rotated header runs along the pool's height, so a shorter longest-line allows a shorter pool. Break only on natural word boundaries (e.g. \"Customer Support\\nService\", \"Finance\\nAudit\\nSystem\"); never split mid-word. Supersedes R7.04 — once implemented, R7.04 can be removed.";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2 }),
  log: ["error", "warn"],
});

async function main() {
  console.log("[patch-add-r7-05] starting…");

  const row = await prisma.diagramRules.findFirst({
    where: { category: "bpmn", isDefault: true },
    select: { id: true, rules: true },
  });

  if (!row) {
    console.error(
      "[patch-add-r7-05] no default BPMN rule set found. Run scripts/seed-diagram-rules.cjs first.",
    );
    process.exit(1);
  }

  if (row.rules.includes("R7.05:")) {
    console.log("[patch-add-r7-05] R7.05 already present — nothing to do.");
    return;
  }

  // Insert R7.05 right after the R7.04 line.
  const r704Match = row.rules.match(/^R7\.04:.*$/m);
  if (!r704Match) {
    // R7.04 not found — append at the end of Group 7. Find "## Group 8"
    // header and insert R7.05 right before it. If even that's missing,
    // append at the end of the whole rules string.
    let updated: string;
    const groupEightIdx = row.rules.indexOf("## Group 8");
    if (groupEightIdx > 0) {
      updated =
        row.rules.slice(0, groupEightIdx).trimEnd() +
        "\n" + R7_05_TEXT +
        "\n\n" + row.rules.slice(groupEightIdx);
    } else {
      updated = row.rules.trimEnd() + "\n" + R7_05_TEXT;
    }
    await prisma.diagramRules.update({
      where: { id: row.id },
      data: { rules: updated },
    });
    console.log("[patch-add-r7-05] R7.04 not found — appended R7.05 at the end of Group 7.");
    return;
  }

  const r704Line = r704Match[0];
  const r704EndIdx = (r704Match.index ?? 0) + r704Line.length;
  const updated =
    row.rules.slice(0, r704EndIdx) + "\n" + R7_05_TEXT + row.rules.slice(r704EndIdx);

  await prisma.diagramRules.update({
    where: { id: row.id },
    data: { rules: updated },
  });
  console.log("[patch-add-r7-05] R7.05 added after R7.04.");
}

main()
  .catch((err) => {
    console.error("[patch-add-r7-05] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
