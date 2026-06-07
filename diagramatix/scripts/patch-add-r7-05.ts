/**
 * One-shot patch — bring the BPMN default rule set in line with Paul's
 * manual local edits (2026-06-07):
 *   • Add R7.05 (Shift-Enter on word boundaries) if missing.
 *   • Remove R7.04 (the older, vaguer rule R7.05 supersedes) if present.
 *
 * Idempotent: re-running after the patch has applied is a no-op.
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

  let updated = row.rules;
  const actions: string[] = [];

  // Strip the old R7.04 line if it's still present, plus any trailing
  // newline that would otherwise leave a blank line. The match looks
  // for the entire R7.04 entry — start of line through the next
  // newline (or end of string).
  const r704Re = /^R7\.04:[^\n]*\n?/m;
  if (r704Re.test(updated)) {
    updated = updated.replace(r704Re, "");
    actions.push("removed R7.04");
  }

  // Add R7.05 if it isn't there yet. Insert right before the "## Group
  // 8" header so it lands at the end of Group 7; if that header isn't
  // present, append at the end of the rules string.
  if (!updated.includes("R7.05:")) {
    const groupEightIdx = updated.indexOf("## Group 8");
    if (groupEightIdx > 0) {
      updated =
        updated.slice(0, groupEightIdx).trimEnd() +
        "\n" + R7_05_TEXT +
        "\n\n" + updated.slice(groupEightIdx);
    } else {
      updated = updated.trimEnd() + "\n" + R7_05_TEXT;
    }
    actions.push("added R7.05");
  }

  if (actions.length === 0) {
    console.log("[patch-add-r7-05] already in sync — nothing to do.");
    return;
  }

  await prisma.diagramRules.update({
    where: { id: row.id },
    data: { rules: updated },
  });
  console.log(`[patch-add-r7-05] ${actions.join(", ")}.`);
}

main()
  .catch((err) => {
    console.error("[patch-add-r7-05] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
