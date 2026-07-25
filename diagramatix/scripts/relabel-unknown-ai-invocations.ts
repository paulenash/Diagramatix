import "dotenv/config";
import { prisma } from "../app/lib/db";
import { AI_INVOCATION_POINTS } from "../app/lib/ai/aiTelemetry";

/**
 * One-off, idempotent backfill: relabel the historical "unknown" AiInvocation
 * rows that were the offline harness scripts (npm run ai:report / ai:compare)
 * before they set a telemetry context. Those rows are the ONLY source of
 * "unknown" — every in-app route sets its context — and they are all null
 * user/org (the harness fingerprint).
 *
 * SAFETY — bounded so it can live in the deploy without hiding a genuine FUTURE
 * "unknown" (which would signal a real un-instrumented code path):
 *   • only rows with userId IS NULL AND orgId IS NULL (harness fingerprint), and
 *   • only rows created BEFORE the fixed CUTOFF below (the fix's ship date).
 * Re-running is a no-op: relabelled rows are no longer "unknown".
 *
 * Attribution heuristic: the conformance report only ever uses the default model
 * (Haiku), while the model-compare harness loops multiple models — so any
 * non-Haiku "unknown" row is definitively model-compare; Haiku rows are treated
 * as the conformance report (its dominant, confirmed source).
 */
const CUTOFF = new Date("2026-07-27T00:00:00.000Z");

async function main() {
  const base = {
    invocationPoint: "unknown",
    userId: null,
    orgId: null,
    createdAt: { lt: CUTOFF },
  } as const;

  const before = await prisma.aiInvocation.count({ where: base });
  if (before === 0) {
    console.log("[relabel-unknown-ai] nothing to do (0 historical unknown harness rows).");
    return;
  }

  // Non-Haiku first ⇒ definitely the model-compare harness.
  const compare = await prisma.aiInvocation.updateMany({
    where: { ...base, NOT: { model: { contains: "haiku" } } },
    data: { invocationPoint: AI_INVOCATION_POINTS.ScriptModelCompare },
  });
  // Remaining Haiku unknowns ⇒ the conformance report.
  const conformance = await prisma.aiInvocation.updateMany({
    where: { ...base, model: { contains: "haiku" } },
    data: { invocationPoint: AI_INVOCATION_POINTS.ScriptConformanceReport },
  });

  console.log(
    `[relabel-unknown-ai] relabelled ${before} row(s): ` +
    `${conformance.count} → AI Conformance Report (script), ` +
    `${compare.count} → AI Model Compare (script).`,
  );
}

main()
  .catch((e) => { console.error("[relabel-unknown-ai] failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
